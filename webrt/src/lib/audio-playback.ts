/**
 * Audio Playback Manager
 * Handles per-user audio playback with individual volume and mute controls.
 * All volume/mute settings are client-local only.
 */

import { PlayerPosition } from './types'

interface TimedPosition extends PlayerPosition {
  t: number
}

export interface UserAudioState {
  volume: number      // 0-100
  isMuted: boolean
  gainNode: GainNode | null
  pannerNode: PannerNode | null
  audioElement: HTMLAudioElement | null
  position: PlayerPosition | null
  prevSample: TimedPosition | null
  lastSample: TimedPosition | null
  // Continuous playback buffer (like old client)
  playbackBuffer: Float32Array | null
  playbackBufferSize: number
  playbackWritePos: number
  playbackReadPos: number
  playbackMinBufferSamples: number
  playbackPrimed: boolean
  playbackProcessor: AudioWorkletNode | ScriptProcessorNode | null
  isPlaybackInitialized: boolean
}

export class AudioPlaybackManager {
  private audioContext: AudioContext | null = null
  private masterGainNode: GainNode | null = null
  private userAudioStates: Map<string, UserAudioState> = new Map()
  private masterVolume: number = 100
  private masterMuted: boolean = false
  private outputDeviceId: string = 'default'
  private playbackWorkletReady: Promise<void> | null = null
  private spatialEnabled: boolean = true
  private listenerPose: PlayerPosition | null = null
  private listenerPrevSample: TimedPosition | null = null
  private listenerLastSample: TimedPosition | null = null
  private interpolationFrameId: number | null = null
  private playbackPrebufferMs: number = 60
  private static readonly INTERPOLATION_DELAY_MS = 30
  private static readonly MAX_EXTRAPOLATION_MS = 100
  private static readonly SPATIAL_SMOOTHING_TIME_CONSTANT = 0.02

  constructor() {
    // Initialize lazily on first audio interaction
  }

  /**
   * Initialize the audio context (call after user interaction)
   */
  public async initialize(): Promise<void> {
    if (this.audioContext) return

    // Force 48kHz to match server sample rate
    this.audioContext = new AudioContext({ sampleRate: 48000 })
    this.masterGainNode = this.audioContext.createGain()
    this.masterGainNode.connect(this.audioContext.destination)
    this.updateMasterGain()
    this.updateListenerFromPose()

    // Preload playback worklet to avoid first-audio stutter
    if (this.audioContext.audioWorklet) {
      this.ensurePlaybackWorklet().catch(err => {
        console.warn('[AudioPlayback] Failed to preload playback worklet:', err)
      })
    }
    
    // Apply output device if one was set before initialization
    if (this.outputDeviceId !== 'default' && 'setSinkId' in this.audioContext) {
      try {
        await (this.audioContext as any).setSinkId(this.outputDeviceId)
      } catch (err) {
        console.warn('[AudioPlayback] Failed to apply output device on init:', err)
      }
    }
    
  }

  /**
   * Ensure audio context is ready (resume if suspended)
   */
  public async ensureReady(): Promise<void> {
    if (!this.audioContext) {
      await this.initialize()
    }
    
    if (this.audioContext && this.audioContext.state === 'suspended') {
      await this.audioContext.resume()
    }
  }

  /**
   * Ensure playback worklet is loaded
   */
  private async ensurePlaybackWorklet(): Promise<void> {
    if (!this.audioContext || !this.audioContext.audioWorklet) {
      return
    }

    if (!this.playbackWorkletReady) {
      const cacheBuster = `?v=${Date.now()}`
      this.playbackWorkletReady = this.audioContext.audioWorklet
        .addModule(`/audio-playback-processor.js${cacheBuster}`)
        .catch(err => {
          console.warn('[AudioPlayback] Failed to load playback worklet:', err)
          this.playbackWorkletReady = null
          throw err
        })
    }

    await this.playbackWorkletReady
  }

  /**
   * Enable or disable spatial audio (panning model + positioning)
   */
  public setSpatialEnabled(enabled: boolean): void {
    this.spatialEnabled = enabled
    this.applyListenerPose(this.listenerPose)
    for (const [userId, state] of this.userAudioStates) {
      if (state.pannerNode) {
        this.configurePanner(state.pannerNode)
      }
      const lastSample = state.lastSample ?? state.position
      this.applyUserPannerPosition(userId, lastSample ?? null)
    }
  }

  /**
   * Set the listener pose (current user's position + orientation)
   */
  public setListenerPose(pose: PlayerPosition, sampleTime?: number): void {
    const t = sampleTime ?? performance.now()
    this.listenerPrevSample = this.listenerLastSample
    this.listenerLastSample = { ...pose, t }
    this.startInterpolationLoop()
  }

  /**
   * Update a user's world position for spatialization
   */
  public updateUserPosition(userId: string, position: PlayerPosition, sampleTime?: number): void {
    const state = this.getOrCreateUserState(userId)
    const t = sampleTime ?? performance.now()
    state.prevSample = state.lastSample
    state.lastSample = { ...position, t }
    this.startInterpolationLoop()
  }

  /**
   * Set volume for a specific user (0-200%)
   */
  public setUserVolume(userId: string, volume: number): void {
    const clampedVolume = Math.max(0, Math.min(200, volume))
    const state = this.getOrCreateUserState(userId)
    state.volume = clampedVolume
    this.updateUserGain(userId)
  }

  /**
   * Get volume for a specific user (0-200%)
   */
  public getUserVolume(userId: string): number {
    return this.userAudioStates.get(userId)?.volume ?? 100
  }

  /**
   * Set mute state for a specific user
   */
  public setUserMuted(userId: string, muted: boolean): void {
    const state = this.getOrCreateUserState(userId)
    state.isMuted = muted
    this.updateUserGain(userId)
  }

  /**
   * Toggle mute for a specific user
   */
  public toggleUserMute(userId: string): boolean {
    const state = this.getOrCreateUserState(userId)
    state.isMuted = !state.isMuted
    this.updateUserGain(userId)
    return state.isMuted
  }

  /**
   * Check if user is muted
   */
  public isUserMuted(userId: string): boolean {
    return this.userAudioStates.get(userId)?.isMuted ?? false
  }

  /**
   * Set master volume (0-100)
   */
  public setMasterVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(100, volume))
    this.updateMasterGain()
  }

  /**
   * Set master mute
   */
  public setMasterMuted(muted: boolean): void {
    this.masterMuted = muted
    this.updateMasterGain()
  }

  /**
   * Set output device
   * Applies to the AudioContext destination (Chrome 110+)
   */
  public async setOutputDevice(deviceId: string): Promise<void> {
    this.outputDeviceId = deviceId
    
    if (deviceId === 'default') {
      // Recreate AudioContext to pick up system default output
      if (this.audioContext) {
        await this.resetAudioContextToDefault()
      }
      return
    }

    // Try to set sink on AudioContext (Chrome 110+)
    if (this.audioContext && this.supportsOutputDeviceSelection()) {
      try {
        await (this.audioContext as any).setSinkId(deviceId)
      } catch (err) {
        console.warn(`[AudioPlayback] Failed to set AudioContext output device:`, err)
      }
    } else if (this.audioContext) {
      console.warn('[AudioPlayback] setSinkId not supported on AudioContext (requires Chrome 110+)')
    }
    
    // Also apply to any audio elements (legacy support)
    for (const [userId, state] of this.userAudioStates) {
      if (state.audioElement && 'setSinkId' in state.audioElement) {
        try {
          await (state.audioElement as any).setSinkId(deviceId)
        } catch (err) {
          console.warn(`[AudioPlayback] Failed to set output device for user ${userId}:`, err)
        }
      }
    }
  }

  /**
   * Check if output device selection is supported
   */
  public supportsOutputDeviceSelection(): boolean {
    const context = this.audioContext ?? (AudioContext.prototype as any)
    return typeof (context as any).setSinkId === 'function'
  }

  /**
   * Reset AudioContext to use system default output device
   */
  private async resetAudioContextToDefault(): Promise<void> {

    for (const state of this.userAudioStates.values()) {
      if (state.playbackProcessor) {
        state.playbackProcessor.disconnect()
        state.playbackProcessor = null
      }
      if (state.pannerNode) {
        state.pannerNode.disconnect()
        state.pannerNode = null
      }
      if (state.gainNode) {
        state.gainNode.disconnect()
        state.gainNode = null
      }
      state.playbackBuffer = null
      state.playbackWritePos = 0
      state.playbackReadPos = 0
      state.playbackMinBufferSamples = 0
      state.playbackPrimed = true
      state.position = null
      state.prevSample = null
      state.lastSample = null
      state.isPlaybackInitialized = false
    }

    if (this.masterGainNode) {
      this.masterGainNode.disconnect()
      this.masterGainNode = null
    }

    if (this.audioContext) {
      await this.audioContext.close()
      this.audioContext = null
    }

    this.playbackWorkletReady = null

    await this.initialize()
  }

  /**
   * Play audio data for a user (base64 encoded raw Int16 PCM)
   * Uses continuous ring buffer for smooth playback (matches old client)
   */
  public async playUserAudio(userId: string, audioDataBase64: string): Promise<void> {
    await this.ensureReady()
    
    const state = this.getOrCreateUserState(userId)
    
    // Skip if user is muted
    if (state.isMuted || this.masterMuted) {
      return
    }

    try {
      // Initialize continuous playback on first audio
      if (!state.isPlaybackInitialized) {
        await this.initializeUserPlayback(userId)
      }

      // Decode base64 to ArrayBuffer (raw Int16 PCM data)
      const binaryString = atob(audioDataBase64)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }

      // Convert Int16 PCM to Float32 and write to playback buffer
      // Use asymmetric conversion like old client
      const int16Array = new Int16Array(bytes.buffer)
      const float32Array = new Float32Array(int16Array.length)
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / (int16Array[i] < 0 ? 0x8000 : 0x7FFF)
      }
      this.writeToPlaybackBuffer(userId, float32Array)
      
    } catch (err) {
      console.error('[AudioPlayback] Error playing audio:', err)
    }
  }

  /**
   * Play audio data for a user (raw Int16 PCM ArrayBuffer)
   */
  public async playUserAudioBinary(userId: string, audioData: ArrayBuffer): Promise<void> {
    await this.ensureReady()

    const state = this.getOrCreateUserState(userId)
    if (state.isMuted || this.masterMuted) {
      return
    }

    try {
      if (!state.isPlaybackInitialized) {
        await this.initializeUserPlayback(userId)
      }

      const byteLength = audioData.byteLength
      if (byteLength < 2) {
        return
      }

      const int16Array = new Int16Array(audioData, 0, Math.floor(byteLength / 2))
      const float32Array = new Float32Array(int16Array.length)
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / (int16Array[i] < 0 ? 0x8000 : 0x7FFF)
      }

      this.writeToPlaybackBuffer(userId, float32Array)
    } catch (err) {
      console.error('[AudioPlayback] Error playing binary audio:', err)
    }
  }

  /**
   * Initialize continuous playback buffer for a user
   */
  private async initializeUserPlayback(userId: string): Promise<void> {
    const state = this.userAudioStates.get(userId)
    if (!state || state.isPlaybackInitialized || !this.audioContext) {
      return
    }
    
    this.ensureUserNodes(userId, state)

    // Prefer AudioWorkletNode for playback
    if (this.audioContext.audioWorklet) {
      try {
        await this.ensurePlaybackWorklet()
        const playbackNode = new AudioWorkletNode(this.audioContext, 'audio-playback-processor', {
          numberOfInputs: 0,
          numberOfOutputs: 1,
          outputChannelCount: [1],
          processorOptions: {
            bufferSize: state.playbackBufferSize,
            prebufferMs: this.playbackPrebufferMs
          }
        })
        playbackNode.connect(state.pannerNode ?? state.gainNode!)
        state.playbackProcessor = playbackNode
        state.isPlaybackInitialized = true
        return
      } catch (err) {
        console.warn('[AudioPlayback] Falling back to ScriptProcessorNode:', err)
      }
    }

    // Fallback: ScriptProcessorNode (deprecated)
    state.playbackBuffer = new Float32Array(state.playbackBufferSize)
    state.playbackWritePos = 0
    state.playbackReadPos = 0
    state.playbackMinBufferSamples = Math.floor(this.audioContext.sampleRate * (this.playbackPrebufferMs / 1000))
    state.playbackPrimed = state.playbackMinBufferSamples === 0
    const bufferSize = 4096 // ~85ms at 48kHz
    const processor = this.audioContext.createScriptProcessor(bufferSize, 0, 1)
    processor.onaudioprocess = (event) => {
      const output = event.outputBuffer.getChannelData(0)
      const userState = this.userAudioStates.get(userId)
      
      if (!userState || !userState.playbackBuffer) {
        output.fill(0)
        return
      }

      if (!userState.playbackPrimed) {
        const bufferFill = userState.playbackWritePos - userState.playbackReadPos
        if (bufferFill < userState.playbackMinBufferSamples) {
          output.fill(0)
          return
        }
        userState.playbackPrimed = true
      }

      for (let i = 0; i < output.length; i++) {
        if (userState.playbackReadPos < userState.playbackWritePos) {
          output[i] = userState.playbackBuffer[userState.playbackReadPos % userState.playbackBufferSize]
          userState.playbackReadPos++
        } else {
          output[i] = 0
        }
      }
    }
    processor.connect(state.pannerNode ?? state.gainNode!)
    state.playbackProcessor = processor
    state.isPlaybackInitialized = true
    
  }

  /**
   * Write Int16 samples to user's playback ring buffer
   * Uses asymmetric conversion matching old client behavior
   */
  private writeToPlaybackBuffer(userId: string, float32Data: Float32Array): void {
    const state = this.userAudioStates.get(userId)
    if (!state) {
      return
    }

    if (state.playbackProcessor && 'port' in state.playbackProcessor) {
      state.playbackProcessor.port.postMessage({ type: 'samples', data: float32Data }, [float32Data.buffer])
      return
    }

    if (!state.playbackBuffer) {
      return
    }

    for (let i = 0; i < float32Data.length; i++) {
      state.playbackBuffer[state.playbackWritePos % state.playbackBufferSize] = float32Data[i]
      state.playbackWritePos++
    }

    const bufferFill = state.playbackWritePos - state.playbackReadPos
    if (bufferFill > state.playbackBufferSize * 0.95) {
      console.warn(`[AudioPlayback] Buffer near full for user ${userId}, adjusting`)
      state.playbackReadPos = state.playbackWritePos - Math.floor(state.playbackBufferSize * 0.5)
    }
  }

  /**
   * Create an audio stream source for a user (for WebRTC MediaStream)
   */
  public connectUserStream(userId: string, stream: MediaStream): void {
    if (!this.audioContext || !this.masterGainNode) {
      console.warn('[AudioPlayback] Cannot connect stream: not initialized')
      return
    }

    const state = this.getOrCreateUserState(userId)
    this.ensureUserNodes(userId, state)

    // Create source from stream
    const source = this.audioContext.createMediaStreamSource(stream)
    source.connect(state.pannerNode ?? state.gainNode!)
    
  }

  /**
   * Disconnect a user's audio
   */
  public disconnectUser(userId: string): void {
    const state = this.userAudioStates.get(userId)
    if (state) {
      if (state.playbackProcessor) {
        state.playbackProcessor.disconnect()
        state.playbackProcessor = null
      }
      if (state.pannerNode) {
        state.pannerNode.disconnect()
        state.pannerNode = null
      }
      if (state.gainNode) {
        state.gainNode.disconnect()
        state.gainNode = null
      }
      if (state.audioElement) {
        state.audioElement.pause()
        state.audioElement.srcObject = null
        state.audioElement = null
      }
      state.playbackBuffer = null
      state.playbackMinBufferSamples = 0
      state.playbackPrimed = true
      state.position = null
      state.prevSample = null
      state.lastSample = null
      state.isPlaybackInitialized = false
      this.userAudioStates.delete(userId)
    }
  }

  /**
   * Get or create user audio state
   */
  private getOrCreateUserState(userId: string): UserAudioState {
    let state = this.userAudioStates.get(userId)
    if (!state) {
      state = {
        volume: 100,
        isMuted: false,
        gainNode: null,
        pannerNode: null,
        audioElement: null,
        position: null,
        prevSample: null,
        lastSample: null,
        // Continuous playback buffer (like old client)
        playbackBuffer: null,
        playbackBufferSize: 48000 * 2, // 2 seconds at 48kHz
        playbackWritePos: 0,
        playbackReadPos: 0,
        playbackMinBufferSamples: 0,
        playbackPrimed: true,
        playbackProcessor: null,
        isPlaybackInitialized: false
      }
      this.userAudioStates.set(userId, state)
    }
    return state
  }

  /**
   * Ensure gain + panner nodes exist and are connected
   */
  private ensureUserNodes(userId: string, state: UserAudioState): void {
    if (!this.audioContext || !this.masterGainNode) {
      return
    }

    if (!state.gainNode) {
      state.gainNode = this.audioContext.createGain()
      state.gainNode.connect(this.masterGainNode)
      this.updateUserGain(userId)
    }

    if (!state.pannerNode) {
      state.pannerNode = this.audioContext.createPanner()
      this.configurePanner(state.pannerNode)
      state.pannerNode.connect(state.gainNode)
      const lastSample = state.lastSample ?? state.position
      this.applyUserPannerPosition(userId, lastSample ?? null)
    }
  }

  /**
   * Configure panner settings for spatialization
   */
  private configurePanner(panner: PannerNode): void {
    panner.panningModel = this.spatialEnabled ? 'HRTF' : 'equalpower'
    panner.distanceModel = 'linear'
    panner.refDistance = 1
    panner.maxDistance = 10000
    panner.rolloffFactor = 0
    panner.coneInnerAngle = 360
    panner.coneOuterAngle = 0
    panner.coneOuterGain = 0
  }

  /**
   * Update the listener from the last known pose
   */
  private updateListenerFromPose(): void {
    if (!this.audioContext) {
      return
    }

    if (!this.spatialEnabled || !this.listenerPose) {
      this.setListenerDefault()
      return
    }

    const pose = this.listenerPose
    const yawRad = (pose.yaw * Math.PI) / 180
    const pitchRad = (-pose.pitch * Math.PI) / 180
    const cosPitch = Math.cos(pitchRad)

    let forwardX = Math.sin(yawRad) * cosPitch
    let forwardY = Math.sin(pitchRad)
    let forwardZ = Math.cos(yawRad) * cosPitch

    const forwardLen = Math.hypot(forwardX, forwardY, forwardZ) || 1
    forwardX /= forwardLen
    forwardY /= forwardLen
    forwardZ /= forwardLen

    const worldUp = { x: 0, y: 1, z: 0 }
    let rightX = worldUp.y * forwardZ - worldUp.z * forwardY
    let rightY = worldUp.z * forwardX - worldUp.x * forwardZ
    let rightZ = worldUp.x * forwardY - worldUp.y * forwardX
    const rightLen = Math.hypot(rightX, rightY, rightZ)

    if (rightLen < 1e-5) {
      rightX = 1
      rightY = 0
      rightZ = 0
    } else {
      rightX /= rightLen
      rightY /= rightLen
      rightZ /= rightLen
    }

    let upX = forwardY * rightZ - forwardZ * rightY
    let upY = forwardZ * rightX - forwardX * rightZ
    let upZ = forwardX * rightY - forwardY * rightX
    const upLen = Math.hypot(upX, upY, upZ) || 1
    upX /= upLen
    upY /= upLen
    upZ /= upLen

    // Map to Web Audio coordinates (flip Z)
    const listenerPos = { x: pose.x, y: pose.y, z: -pose.z }
    const listenerForward = { x: forwardX, y: forwardY, z: -forwardZ }
    const listenerUp = { x: upX, y: upY, z: -upZ }

    this.setListenerPoseInternal(listenerPos, listenerForward, listenerUp)
  }

  /**
   * Set a default listener pose when spatial audio is disabled or pose is missing
   */
  private setListenerDefault(): void {
    this.setListenerPoseInternal(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: -1 },
      { x: 0, y: 1, z: 0 }
    )
  }

  /**
   * Apply listener pose immediately (after interpolation).
   */
  private applyListenerPose(pose: PlayerPosition | null): void {
    this.listenerPose = pose
    this.updateListenerFromPose()
  }

  /**
   * Start the interpolation/render loop if not already running.
   */
  private startInterpolationLoop(): void {
    if (this.interpolationFrameId !== null) {
      return
    }

    const tick = (time: number) => {
      this.renderSpatialFrame(time)
      if (this.hasActiveSamples()) {
        this.interpolationFrameId = requestAnimationFrame(tick)
      } else {
        this.interpolationFrameId = null
      }
    }

    this.interpolationFrameId = requestAnimationFrame(tick)
  }

  /**
   * Check if we have any active samples to interpolate.
   */
  private hasActiveSamples(): boolean {
    if (this.listenerLastSample) {
      return true
    }
    for (const state of this.userAudioStates.values()) {
      if (state.lastSample) {
        return true
      }
    }
    return false
  }

  /**
   * Render interpolated spatial positions for listener and users.
   */
  private renderSpatialFrame(time: number): void {
    const renderTime = time - AudioPlaybackManager.INTERPOLATION_DELAY_MS

    if (this.listenerLastSample) {
      const pose = this.interpolateTimedPosition(this.listenerPrevSample, this.listenerLastSample, renderTime)
      this.applyListenerPose(pose)
    }

    for (const [userId, state] of this.userAudioStates.entries()) {
      if (!state.lastSample) {
        continue
      }
      const pos = this.interpolateTimedPosition(state.prevSample, state.lastSample, renderTime)
      this.applyUserPannerPosition(userId, pos)
    }
  }

  /**
   * Interpolate (or extrapolate) a position sample for the given render time.
   */
  private interpolateTimedPosition(prev: TimedPosition | null, last: TimedPosition, renderTime: number): PlayerPosition {
    if (!prev || last.t <= prev.t) {
      return last
    }

    const dt = last.t - prev.t
    if (dt <= 0) {
      return last
    }

    if (renderTime <= last.t) {
      const alpha = this.clamp((renderTime - prev.t) / dt, 0, 1)
      return {
        x: this.lerp(prev.x, last.x, alpha),
        y: this.lerp(prev.y, last.y, alpha),
        z: this.lerp(prev.z, last.z, alpha),
        yaw: this.lerpAngleDeg(prev.yaw, last.yaw, alpha),
        pitch: this.lerp(prev.pitch, last.pitch, alpha),
        worldId: last.worldId
      }
    }

    const extrapolationMs = Math.min(renderTime - last.t, AudioPlaybackManager.MAX_EXTRAPOLATION_MS)
    const vx = (last.x - prev.x) / dt
    const vy = (last.y - prev.y) / dt
    const vz = (last.z - prev.z) / dt
    const yawDelta = this.shortestAngleDeltaDeg(prev.yaw, last.yaw)
    const yawVelocity = yawDelta / dt
    const pitchVelocity = (last.pitch - prev.pitch) / dt

    return {
      x: last.x + vx * extrapolationMs,
      y: last.y + vy * extrapolationMs,
      z: last.z + vz * extrapolationMs,
      yaw: this.normalizeAngleDeg(last.yaw + yawVelocity * extrapolationMs),
      pitch: last.pitch + pitchVelocity * extrapolationMs,
      worldId: last.worldId
    }
  }

  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value))
  }

  private shortestAngleDeltaDeg(from: number, to: number): number {
    let delta = (to - from) % 360
    if (delta > 180) delta -= 360
    if (delta < -180) delta += 360
    return delta
  }

  private normalizeAngleDeg(angle: number): number {
    let normalized = angle % 360
    if (normalized > 180) normalized -= 360
    if (normalized < -180) normalized += 360
    return normalized
  }

  private lerpAngleDeg(from: number, to: number, t: number): number {
    const delta = this.shortestAngleDeltaDeg(from, to)
    return this.normalizeAngleDeg(from + delta * t)
  }

  /**
   * Apply listener position + orientation with smoothing where supported
   */
  private setListenerPoseInternal(
    position: { x: number; y: number; z: number },
    forward: { x: number; y: number; z: number },
    up: { x: number; y: number; z: number }
  ): void {
    if (!this.audioContext) {
      return
    }

    const listener = this.audioContext.listener
    const t = this.audioContext.currentTime
    const timeConstant = AudioPlaybackManager.SPATIAL_SMOOTHING_TIME_CONSTANT

    if ('positionX' in listener) {
      listener.positionX.setTargetAtTime(position.x, t, timeConstant)
      listener.positionY.setTargetAtTime(position.y, t, timeConstant)
      listener.positionZ.setTargetAtTime(position.z, t, timeConstant)
    } else if ('setPosition' in listener) {
      ;(listener as any).setPosition(position.x, position.y, position.z)
    }

    if ('forwardX' in listener) {
      listener.forwardX.setTargetAtTime(forward.x, t, timeConstant)
      listener.forwardY.setTargetAtTime(forward.y, t, timeConstant)
      listener.forwardZ.setTargetAtTime(forward.z, t, timeConstant)
      listener.upX.setTargetAtTime(up.x, t, timeConstant)
      listener.upY.setTargetAtTime(up.y, t, timeConstant)
      listener.upZ.setTargetAtTime(up.z, t, timeConstant)
    } else if ('setOrientation' in listener) {
      ;(listener as any).setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z)
    }
  }

  /**
   * Update panner position based on stored user position
   */
  private applyUserPannerPosition(userId: string, position: PlayerPosition | null): void {
    if (!this.audioContext) {
      return
    }

    const state = this.userAudioStates.get(userId)
    if (!state?.pannerNode) {
      return
    }

    state.position = position
    const panner = state.pannerNode
    const timeConstant = AudioPlaybackManager.SPATIAL_SMOOTHING_TIME_CONSTANT
    const t = this.audioContext.currentTime

    if (!this.spatialEnabled || !this.listenerPose || !state.position) {
      if ('positionX' in panner) {
        panner.positionX.setTargetAtTime(0, t, timeConstant)
        panner.positionY.setTargetAtTime(0, t, timeConstant)
        panner.positionZ.setTargetAtTime(-1, t, timeConstant)
      } else if ('setPosition' in panner) {
        ;(panner as any).setPosition(0, 0, -1)
      }
      return
    }

    const pos = state.position
    const x = pos.x
    const y = pos.y
    const z = -pos.z

    if ('positionX' in panner) {
      panner.positionX.setTargetAtTime(x, t, timeConstant)
      panner.positionY.setTargetAtTime(y, t, timeConstant)
      panner.positionZ.setTargetAtTime(z, t, timeConstant)
    } else if ('setPosition' in panner) {
      ;(panner as any).setPosition(x, y, z)
    }
  }

  /**
   * Update gain node for a user
   */
  private updateUserGain(userId: string): void {
    const state = this.userAudioStates.get(userId)
    if (state?.gainNode) {
      const effectiveVolume = state.isMuted ? 0 : state.volume / 100
      state.gainNode.gain.setValueAtTime(effectiveVolume, this.audioContext?.currentTime || 0)
    }
  }

  /**
   * Update master gain
   */
  private updateMasterGain(): void {
    if (this.masterGainNode && this.audioContext) {
      const effectiveVolume = this.masterMuted ? 0 : this.masterVolume / 100
      this.masterGainNode.gain.setValueAtTime(effectiveVolume, this.audioContext.currentTime)
    }
  }

  /**
   * Get all user IDs with audio state
   */
  public getActiveUsers(): string[] {
    return Array.from(this.userAudioStates.keys())
  }

  /**
   * Clean up all resources
   */
  public dispose(): void {
    for (const userId of this.userAudioStates.keys()) {
      this.disconnectUser(userId)
    }
    
    if (this.masterGainNode) {
      this.masterGainNode.disconnect()
      this.masterGainNode = null
    }
    
    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }
    if (this.interpolationFrameId !== null) {
      cancelAnimationFrame(this.interpolationFrameId)
      this.interpolationFrameId = null
    }
    this.listenerPrevSample = null
    this.listenerLastSample = null
    
  }
}

// Singleton instance
let instance: AudioPlaybackManager | null = null

export function getAudioPlaybackManager(): AudioPlaybackManager {
  if (!instance) {
    instance = new AudioPlaybackManager()
  }
  return instance
}
