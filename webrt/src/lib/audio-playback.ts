/**
 * Audio Playback Manager
 * Handles per-user audio playback with individual volume and mute controls.
 * All volume/mute settings are client-local only.
 */

export interface UserAudioState {
  volume: number      // 0-100
  isMuted: boolean
  gainNode: GainNode | null
  audioElement: HTMLAudioElement | null
  // Continuous playback buffer (like old client)
  playbackBuffer: Float32Array | null
  playbackBufferSize: number
  playbackWritePos: number
  playbackReadPos: number
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
    
    // Apply output device if one was set before initialization
    if (this.outputDeviceId !== 'default' && 'setSinkId' in this.audioContext) {
      try {
        await (this.audioContext as any).setSinkId(this.outputDeviceId)
        console.log('[AudioPlayback] Applied output device on initialization:', this.outputDeviceId)
      } catch (err) {
        console.warn('[AudioPlayback] Failed to apply output device on init:', err)
      }
    }
    
    console.log('[AudioPlayback] Initialized AudioContext')
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
   * Set volume for a specific user (0-100)
   */
  public setUserVolume(userId: string, volume: number): void {
    const clampedVolume = Math.max(0, Math.min(100, volume))
    const state = this.getOrCreateUserState(userId)
    state.volume = clampedVolume
    this.updateUserGain(userId)
    console.log(`[AudioPlayback] User ${userId} volume set to ${clampedVolume}`)
  }

  /**
   * Get volume for a specific user
   */
  public getUserVolume(userId: string): number {
    return this.userAudioStates.get(userId)?.volume ?? 80
  }

  /**
   * Set mute state for a specific user
   */
  public setUserMuted(userId: string, muted: boolean): void {
    const state = this.getOrCreateUserState(userId)
    state.isMuted = muted
    this.updateUserGain(userId)
    console.log(`[AudioPlayback] User ${userId} muted: ${muted}`)
  }

  /**
   * Toggle mute for a specific user
   */
  public toggleUserMute(userId: string): boolean {
    const state = this.getOrCreateUserState(userId)
    state.isMuted = !state.isMuted
    this.updateUserGain(userId)
    console.log(`[AudioPlayback] User ${userId} mute toggled: ${state.isMuted}`)
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
    console.log(`[AudioPlayback] Master volume set to ${this.masterVolume}`)
  }

  /**
   * Set master mute
   */
  public setMasterMuted(muted: boolean): void {
    this.masterMuted = muted
    this.updateMasterGain()
    console.log(`[AudioPlayback] Master muted: ${muted}`)
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
        console.log(`[AudioPlayback] Set output device on AudioContext: ${deviceId}`)
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
          console.log(`[AudioPlayback] Set output device for user ${userId}`)
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
    console.log('[AudioPlayback] Resetting AudioContext to default output')

    for (const state of this.userAudioStates.values()) {
      if (state.playbackProcessor) {
        state.playbackProcessor.disconnect()
        state.playbackProcessor = null
      }
      if (state.gainNode) {
        state.gainNode.disconnect()
        state.gainNode = null
      }
      state.playbackBuffer = null
      state.playbackWritePos = 0
      state.playbackReadPos = 0
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
      
      console.log(`[AudioPlayback] Buffered audio from ${userId}, samples: ${int16Array.length}`)
    } catch (err) {
      console.error('[AudioPlayback] Error playing audio:', err)
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

    console.log(`[AudioPlayback] Initializing continuous playback for user ${userId}`)

    // Create gain node if not exists
    if (!state.gainNode) {
      state.gainNode = this.audioContext.createGain()
      state.gainNode.connect(this.masterGainNode!)
      this.updateUserGain(userId)
    }

    // Prefer AudioWorkletNode for playback
    if (this.audioContext.audioWorklet) {
      try {
        await this.ensurePlaybackWorklet()
        const playbackNode = new AudioWorkletNode(this.audioContext, 'audio-playback-processor', {
          numberOfInputs: 0,
          numberOfOutputs: 1,
          outputChannelCount: [1],
          processorOptions: {
            bufferSize: state.playbackBufferSize
          }
        })
        playbackNode.connect(state.gainNode)
        state.playbackProcessor = playbackNode
        state.isPlaybackInitialized = true
        console.log(`[AudioPlayback] Worklet playback initialized for user ${userId}`)
        return
      } catch (err) {
        console.warn('[AudioPlayback] Falling back to ScriptProcessorNode:', err)
      }
    }

    // Fallback: ScriptProcessorNode (deprecated)
    state.playbackBuffer = new Float32Array(state.playbackBufferSize)
    state.playbackWritePos = 0
    state.playbackReadPos = 0
    const bufferSize = 4096 // ~85ms at 48kHz
    const processor = this.audioContext.createScriptProcessor(bufferSize, 0, 1)
    processor.onaudioprocess = (event) => {
      const output = event.outputBuffer.getChannelData(0)
      const userState = this.userAudioStates.get(userId)
      
      if (!userState || !userState.playbackBuffer) {
        output.fill(0)
        return
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
    processor.connect(state.gainNode)
    state.playbackProcessor = processor
    state.isPlaybackInitialized = true
    
    console.log(`[AudioPlayback] Continuous playback initialized for user ${userId}`)
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
    
    // Create gain node if not exists
    if (!state.gainNode) {
      state.gainNode = this.audioContext.createGain()
      state.gainNode.connect(this.masterGainNode)
      this.updateUserGain(userId)
    }

    // Create source from stream
    const source = this.audioContext.createMediaStreamSource(stream)
    source.connect(state.gainNode)
    
    console.log(`[AudioPlayback] Connected stream for user ${userId}`)
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
      state.isPlaybackInitialized = false
      this.userAudioStates.delete(userId)
      console.log(`[AudioPlayback] Disconnected user ${userId}`)
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
        audioElement: null,
        // Continuous playback buffer (like old client)
        playbackBuffer: null,
        playbackBufferSize: 48000 * 2, // 2 seconds at 48kHz
        playbackWritePos: 0,
        playbackReadPos: 0,
        playbackProcessor: null,
        isPlaybackInitialized: false
      }
      this.userAudioStates.set(userId, state)
    }
    return state
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
    
    console.log('[AudioPlayback] Disposed')
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
