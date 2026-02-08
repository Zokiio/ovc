/**
 * Audio Playback Manager
 * Handles per-user audio playback with individual volume and mute controls.
 * Uses AudioWorklet for low-latency playback.
 */

import type { AudioDiagnostics, PlayerPosition } from '../types'
import { createLogger } from '../logger'

const logger = createLogger('AudioPlayback')

const DEFAULT_MAX_RANGE = 50
const SPATIAL_REF_DISTANCE = 4.0
const SPATIAL_MAX_DISTANCE_CLAMP: [number, number] = [5, 200]
const SPATIAL_ROLLOFF_FULL = 0.75
const SPATIAL_ROLLOFF_MIN = 0.0
const SPATIAL_GAIN_THRESHOLD = 0.98
const SPATIAL_SMOOTHING_TC = 0.05

interface SpatialPoint {
  x: number
  y: number
  z: number
}

interface ListenerOrientation {
  forwardX: number
  forwardY: number
  forwardZ: number
}

export interface UserAudioState {
  volume: number // 0-200 (allow boost)
  isMuted: boolean
  spatialEnabled: boolean
  pannerNode: PannerNode | null
  gainNode: GainNode | null
  playbackProcessor: AudioWorkletNode | null
  lastKnownPosition: PlayerPosition | null
  maxRange: number
  serverGainHint: number
  isInitialized: boolean
}

interface AudioContextWithSinkId extends AudioContext {
  setSinkId: (sinkId: string) => Promise<void>
}

export class AudioPlaybackManager {
  private audioContext: AudioContext | null = null
  private masterGainNode: GainNode | null = null
  private masterCompressorNode: DynamicsCompressorNode | null = null
  private userStates: Map<string, UserAudioState> = new Map()
  private masterVolume: number = 100
  private masterMuted: boolean = false
  private outputDeviceId: string = 'default'
  private workletReady: Promise<void> | null = null
  private listenerPosition: PlayerPosition | null = null
  private diagnosticsListener: ((userId: string, diagnostics: AudioDiagnostics) => void) | null = null

  /**
   * Initialize the audio context (call after user interaction)
   */
  public async initialize(): Promise<void> {
    if (this.audioContext) return

    // Force 48kHz to match server sample rate
    this.audioContext = new AudioContext({ sampleRate: 48000 })
    this.masterGainNode = this.audioContext.createGain()
    this.masterCompressorNode = this.audioContext.createDynamicsCompressor()
    this.masterCompressorNode.threshold.value = -14
    this.masterCompressorNode.knee.value = 24
    this.masterCompressorNode.ratio.value = 8
    this.masterCompressorNode.attack.value = 0.003
    this.masterCompressorNode.release.value = 0.25

    this.masterGainNode.connect(this.masterCompressorNode)
    this.masterCompressorNode.connect(this.audioContext.destination)
    this.updateMasterGain()
    this.applyListenerState()

    // Apply output device if set
    if (this.outputDeviceId !== 'default') {
      await this.applyOutputDevice()
    }
  }

  /**
   * Ensure audio context is ready (resume if suspended)
   */
  public async ensureReady(): Promise<void> {
    if (!this.audioContext) {
      await this.initialize()
    }

    if (this.audioContext?.state === 'suspended') {
      await this.audioContext.resume()
    }
  }

  /**
   * Load the playback AudioWorklet
   */
  private async ensureWorklet(): Promise<void> {
    if (!this.audioContext?.audioWorklet) return

    if (!this.workletReady) {
      const cacheBuster = `?v=${Date.now()}`
      this.workletReady = this.audioContext.audioWorklet
        .addModule(`/audio-playback-processor.js${cacheBuster}`)
        .catch((err) => {
          logger.warn('Failed to load worklet:', err)
          this.workletReady = null
          throw err
        })
    }

    await this.workletReady
  }

  /**
   * Set volume for a user (0-200)
   */
  public setUserVolume(userId: string, volume: number): void {
    const state = this.getOrCreateState(userId)
    state.volume = Math.max(0, Math.min(200, volume))
    this.updateUserGain(userId)
  }

  /**
   * Get user volume
   */
  public getUserVolume(userId: string): number {
    return this.userStates.get(userId)?.volume ?? 100
  }

  /**
   * Set user muted state
   */
  public setUserMuted(userId: string, muted: boolean): void {
    const state = this.getOrCreateState(userId)
    state.isMuted = muted
    this.updateUserGain(userId)
  }

  /**
   * Toggle user mute
   */
  public toggleUserMute(userId: string): boolean {
    const state = this.getOrCreateState(userId)
    state.isMuted = !state.isMuted
    this.updateUserGain(userId)
    return state.isMuted
  }

  /**
   * Check if user is muted
   */
  public isUserMuted(userId: string): boolean {
    return this.userStates.get(userId)?.isMuted ?? false
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
   */
  public async setOutputDevice(deviceId: string): Promise<void> {
    this.outputDeviceId = deviceId
    await this.applyOutputDevice()
  }

  public setDiagnosticsListener(
    listener: ((userId: string, diagnostics: AudioDiagnostics) => void) | null
  ): void {
    this.diagnosticsListener = listener
  }

  public setUserSpatialEnabled(userId: string, enabled: boolean): void {
    const state = this.getOrCreateState(userId)
    if (state.spatialEnabled === enabled) {
      return
    }
    state.spatialEnabled = enabled
    this.applyPannerSpatialConfig(state)
    if (state.pannerNode) {
      if (!enabled) {
        this.applyPannerPosition(state.pannerNode, this.getCurrentListenerPoint())
      } else if (state.lastKnownPosition) {
        this.applyPannerPosition(state.pannerNode, this.toAudioPoint(state.lastKnownPosition))
      }
    }
  }

  public updateListenerPosition(position: PlayerPosition | null): void {
    this.listenerPosition = position
    this.applyListenerState()
  }

  public updateUserPosition(userId: string, position: PlayerPosition | null): void {
    const state = this.getOrCreateState(userId)
    const listenerPosition = this.listenerPosition

    if (position) {
      if (listenerPosition && position.worldId !== listenerPosition.worldId) {
        state.lastKnownPosition = null
        if (state.pannerNode) {
          this.applyPannerPosition(state.pannerNode, this.getCurrentListenerPoint())
        }
        return
      }
      state.lastKnownPosition = position
    } else if (state.lastKnownPosition) {
      // Hold the current panner direction until a new valid position arrives.
      return
    }

    if (!state.pannerNode) {
      return
    }

    if (!state.spatialEnabled) {
      this.applyPannerPosition(state.pannerNode, this.getCurrentListenerPoint())
      return
    }

    if (state.lastKnownPosition) {
      this.applyPannerPosition(state.pannerNode, this.toAudioPoint(state.lastKnownPosition))
      return
    }

    this.applyPannerPosition(state.pannerNode, this.getCurrentListenerPoint())
  }

  public updateUserSpatialMetadata(userId: string, maxRange?: number, serverGainHint?: number): void {
    const state = this.getOrCreateState(userId)

    if (typeof maxRange === 'number' && Number.isFinite(maxRange) && maxRange > 0) {
      state.maxRange = this.clamp(maxRange, SPATIAL_MAX_DISTANCE_CLAMP[0], SPATIAL_MAX_DISTANCE_CLAMP[1])
    }

    if (typeof serverGainHint === 'number' && Number.isFinite(serverGainHint)) {
      state.serverGainHint = this.clamp(serverGainHint, 0, 1)
    }

    this.applyPannerSpatialConfig(state)
  }

  private async applyOutputDevice(): Promise<void> {
    if (!this.audioContext) return

    if (this.outputDeviceId === 'default') {
      // Recreate context for default device
      await this.recreateContext()
      return
    }

    // Use setSinkId if available (Chrome 110+)
    if ('setSinkId' in this.audioContext) {
      try {
        await (this.audioContext as AudioContextWithSinkId).setSinkId(this.outputDeviceId)
      } catch (err) {
        logger.warn('Failed to set output device:', err)
      }
    }
  }

  private async recreateContext(): Promise<void> {
    // Clean up existing
    for (const state of this.userStates.values()) {
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
      state.isInitialized = false
    }

    if (this.masterGainNode) {
      this.masterGainNode.disconnect()
      this.masterGainNode = null
    }

    if (this.masterCompressorNode) {
      this.masterCompressorNode.disconnect()
      this.masterCompressorNode = null
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      await this.audioContext.close()
      this.audioContext = null
    }

    this.workletReady = null
    await this.initialize()
  }

  /**
   * Play Float32 audio data for a user
   */
  public async playAudio(userId: string, float32Data: Float32Array): Promise<void> {
    await this.ensureReady()

    const state = this.getOrCreateState(userId)

    // Skip if muted
    if (state.isMuted || this.masterMuted) {
      logger.debug('Skipping audio for', userId, '- muted')
      return
    }

    // Initialize playback if needed
    if (!state.isInitialized) {
      logger.debug('Initializing playback for user:', userId)
      await this.initializeUserPlayback(userId)
    }

    // Send samples to worklet
    if (state.playbackProcessor && 'port' in state.playbackProcessor) {
      state.playbackProcessor.port.postMessage(
        { type: 'samples', data: float32Data },
        [float32Data.buffer]
      )
      logger.debug('Sent', float32Data.length, 'samples to worklet for user:', userId)
    } else {
      logger.warn('No playback processor for user:', userId)
    }
  }

  private async initializeUserPlayback(userId: string): Promise<void> {
    const state = this.userStates.get(userId)
    if (!state || state.isInitialized || !this.audioContext) return

    if (!this.masterGainNode) {
      return
    }

    // Create gain node
    if (!state.gainNode) {
      state.gainNode = this.audioContext.createGain()
      state.gainNode.connect(this.masterGainNode)
      this.updateUserGain(userId)
    }

    // Create spatial panner node
    if (!state.pannerNode) {
      state.pannerNode = this.audioContext.createPanner()
      state.pannerNode.distanceModel = 'inverse'
      state.pannerNode.panningModel = 'HRTF'
      state.pannerNode.refDistance = SPATIAL_REF_DISTANCE
      state.pannerNode.coneInnerAngle = 360
      state.pannerNode.coneOuterAngle = 360
      state.pannerNode.coneOuterGain = 0
      this.applyPannerSpatialConfig(state)
      const initialPoint = state.spatialEnabled && state.lastKnownPosition
        ? this.toAudioPoint(state.lastKnownPosition)
        : this.getCurrentListenerPoint()
      this.applyPannerPosition(state.pannerNode, initialPoint)
      state.pannerNode.connect(state.gainNode)
    }

    // Create worklet node
    try {
      await this.ensureWorklet()
      const workletNode = new AudioWorkletNode(this.audioContext, 'audio-playback-processor', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        processorOptions: {
          bufferSize: 48000 * 2, // 2 seconds buffer
        },
      })

      workletNode.port.onmessage = (event) => {
        if (event.data?.type !== 'diagnostics' || !this.diagnosticsListener) {
          return
        }
        const data = event.data.data as Omit<AudioDiagnostics, 'updatedAt'>
        this.diagnosticsListener(userId, {
          underruns: data.underruns ?? 0,
          overruns: data.overruns ?? 0,
          droppedSamples: data.droppedSamples ?? 0,
          lastFrameSize: data.lastFrameSize ?? 0,
          bufferedSamples: data.bufferedSamples ?? 0,
          updatedAt: Date.now(),
        })
      }

      workletNode.connect(state.pannerNode)
      state.playbackProcessor = workletNode
      state.isInitialized = true
    } catch (err) {
      logger.error('Failed to initialize playback:', err)
    }
  }

  /**
   * Disconnect a user's audio
   */
  public disconnectUser(userId: string): void {
    const state = this.userStates.get(userId)
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
      state.isInitialized = false
      this.userStates.delete(userId)
    }
  }

  private getOrCreateState(userId: string): UserAudioState {
    let state = this.userStates.get(userId)
    if (!state) {
      state = {
        volume: 100,
        isMuted: false,
        spatialEnabled: true,
        pannerNode: null,
        gainNode: null,
        playbackProcessor: null,
        lastKnownPosition: null,
        maxRange: DEFAULT_MAX_RANGE,
        serverGainHint: 1,
        isInitialized: false,
      }
      this.userStates.set(userId, state)
    }
    return state
  }

  private updateUserGain(userId: string): void {
    const state = this.userStates.get(userId)
    if (state?.gainNode && this.audioContext) {
      const volume = state.isMuted ? 0 : state.volume / 100
      state.gainNode.gain.setValueAtTime(volume, this.audioContext.currentTime)
    }
  }

  private updateMasterGain(): void {
    if (this.masterGainNode && this.audioContext) {
      const volume = this.masterMuted ? 0 : this.masterVolume / 100
      this.masterGainNode.gain.setValueAtTime(volume, this.audioContext.currentTime)
    }
  }

  private applyListenerState(): void {
    if (!this.audioContext) {
      return
    }

    const listener = this.audioContext.listener
    const listenerPoint = this.getCurrentListenerPoint()
    this.applyListenerPosition(listener, listenerPoint)
    const orientation = this.listenerPosition
      ? this.getOrientationFromPosition(this.listenerPosition)
      : { forwardX: 0, forwardY: 0, forwardZ: -1 }
    this.applyListenerOrientation(listener, orientation)
    this.recenterUsersNeedingCenter(listenerPoint)
  }

  private applyListenerPosition(listener: AudioListener, point: SpatialPoint): void {
    const positionX = (listener as { positionX?: AudioParam }).positionX
    const positionY = (listener as { positionY?: AudioParam }).positionY
    const positionZ = (listener as { positionZ?: AudioParam }).positionZ
    if (positionX && positionY && positionZ) {
      this.smoothAudioParam(positionX, point.x)
      this.smoothAudioParam(positionY, point.y)
      this.smoothAudioParam(positionZ, point.z)
      return
    }

    const setPosition = (listener as {
      setPosition?: (x: number, y: number, z: number) => void
    }).setPosition
    if (typeof setPosition === 'function') {
      setPosition(point.x, point.y, point.z)
    }
  }

  private applyListenerOrientation(listener: AudioListener, orientation: ListenerOrientation): void {
    const forwardX = (listener as { forwardX?: AudioParam }).forwardX
    const forwardY = (listener as { forwardY?: AudioParam }).forwardY
    const forwardZ = (listener as { forwardZ?: AudioParam }).forwardZ
    const upX = (listener as { upX?: AudioParam }).upX
    const upY = (listener as { upY?: AudioParam }).upY
    const upZ = (listener as { upZ?: AudioParam }).upZ
    if (forwardX && forwardY && forwardZ && upX && upY && upZ) {
      this.smoothAudioParam(forwardX, orientation.forwardX)
      this.smoothAudioParam(forwardY, orientation.forwardY)
      this.smoothAudioParam(forwardZ, orientation.forwardZ)
      this.smoothAudioParam(upX, 0)
      this.smoothAudioParam(upY, 1)
      this.smoothAudioParam(upZ, 0)
      return
    }

    const setOrientation = (listener as {
      setOrientation?: (
        x: number,
        y: number,
        z: number,
        xUp: number,
        yUp: number,
        zUp: number
      ) => void
    }).setOrientation
    if (typeof setOrientation === 'function') {
      setOrientation(
        orientation.forwardX,
        orientation.forwardY,
        orientation.forwardZ,
        0,
        1,
        0
      )
    }
  }

  private applyPannerPosition(node: PannerNode, point: SpatialPoint): void {
    const positionX = (node as { positionX?: AudioParam }).positionX
    const positionY = (node as { positionY?: AudioParam }).positionY
    const positionZ = (node as { positionZ?: AudioParam }).positionZ
    if (positionX && positionY && positionZ) {
      this.smoothAudioParam(positionX, point.x)
      this.smoothAudioParam(positionY, point.y)
      this.smoothAudioParam(positionZ, point.z)
      return
    }

    const setPosition = (node as {
      setPosition?: (x: number, y: number, z: number) => void
    }).setPosition
    if (typeof setPosition === 'function') {
      setPosition(point.x, point.y, point.z)
    }
  }

  private applyPannerSpatialConfig(state: UserAudioState): void {
    const pannerNode = state.pannerNode
    if (!pannerNode) {
      return
    }

    pannerNode.distanceModel = 'inverse'
    pannerNode.panningModel = 'HRTF'
    pannerNode.refDistance = SPATIAL_REF_DISTANCE
    pannerNode.maxDistance = this.clamp(
      state.maxRange,
      SPATIAL_MAX_DISTANCE_CLAMP[0],
      SPATIAL_MAX_DISTANCE_CLAMP[1]
    )
    pannerNode.rolloffFactor = state.spatialEnabled ? this.getAdaptiveRolloff(state.serverGainHint) : 0
  }

  private smoothAudioParam(param: AudioParam, value: number): void {
    if (!this.audioContext) {
      return
    }
    const now = this.audioContext.currentTime
    param.cancelScheduledValues(now)
    param.setTargetAtTime(value, now, SPATIAL_SMOOTHING_TC)
  }

  private recenterUsersNeedingCenter(listenerPoint: SpatialPoint): void {
    for (const state of this.userStates.values()) {
      if (!state.pannerNode) {
        continue
      }
      if (!state.spatialEnabled) {
        this.applyPannerPosition(state.pannerNode, listenerPoint)
        continue
      }
      if (!state.lastKnownPosition) {
        this.applyPannerPosition(state.pannerNode, listenerPoint)
        continue
      }
      if (
        this.listenerPosition &&
        state.lastKnownPosition.worldId !== this.listenerPosition.worldId
      ) {
        this.applyPannerPosition(state.pannerNode, listenerPoint)
      }
    }
  }

  private getAdaptiveRolloff(serverGainHint: number): number {
    if (serverGainHint >= SPATIAL_GAIN_THRESHOLD) {
      return SPATIAL_ROLLOFF_FULL
    }
    const normalizedGain = this.clamp(serverGainHint, 0, 1)
    return SPATIAL_ROLLOFF_MIN + (SPATIAL_ROLLOFF_FULL - SPATIAL_ROLLOFF_MIN) * normalizedGain * normalizedGain
  }

  private getCurrentListenerPoint(): SpatialPoint {
    if (!this.listenerPosition) {
      return { x: 0, y: 0, z: 0 }
    }
    return this.toAudioPoint(this.listenerPosition)
  }

  private toAudioPoint(position: PlayerPosition): SpatialPoint {
    return {
      x: position.x,
      y: position.y,
      z: -position.z,
    }
  }

  private getOrientationFromPosition(position: PlayerPosition): ListenerOrientation {
    const yawRad = (this.normalizeDegrees(position.yaw) * Math.PI) / 180
    const pitchRad = (this.clamp(position.pitch, -89.9, 89.9) * Math.PI) / 180
    const cosPitch = Math.cos(pitchRad)
    return {
      // Game yaw is clockwise from north in world space; convert to WebAudio space
      // where Z is inverted (audioZ = -worldZ).
      forwardX: Math.sin(yawRad) * cosPitch,
      forwardY: -Math.sin(pitchRad),
      forwardZ: Math.cos(yawRad) * cosPitch,
    }
  }

  private normalizeDegrees(value: number): number {
    if (!Number.isFinite(value)) {
      return 0
    }
    let normalized = value % 360
    if (normalized > 180) {
      normalized -= 360
    } else if (normalized < -180) {
      normalized += 360
    }
    return normalized
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value))
  }

  /**
   * Get active user IDs
   */
  public getActiveUsers(): string[] {
    return Array.from(this.userStates.keys())
  }

  /**
   * Clean up all resources
   */
  public dispose(): void {
    for (const userId of this.userStates.keys()) {
      this.disconnectUser(userId)
    }

    if (this.masterGainNode) {
      this.masterGainNode.disconnect()
      this.masterGainNode = null
    }

    if (this.masterCompressorNode) {
      this.masterCompressorNode.disconnect()
      this.masterCompressorNode = null
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close()
      this.audioContext = null
    }
  }
}

// Singleton
let instance: AudioPlaybackManager | null = null

export function getAudioPlaybackManager(): AudioPlaybackManager {
  if (!instance) {
    instance = new AudioPlaybackManager()
  }
  return instance
}

export function resetAudioPlaybackManager(): void {
  if (instance) {
    instance.dispose()
    instance = null
  }
}
