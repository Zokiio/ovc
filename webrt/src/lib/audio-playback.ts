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
  playbackProcessor: ScriptProcessorNode | null
  isPlaybackInitialized: boolean
}

export class AudioPlaybackManager {
  private audioContext: AudioContext | null = null
  private masterGainNode: GainNode | null = null
  private userAudioStates: Map<string, UserAudioState> = new Map()
  private masterVolume: number = 100
  private masterMuted: boolean = false
  private outputDeviceId: string = 'default'

  constructor() {
    // Initialize lazily on first audio interaction
  }

  /**
   * Initialize the audio context (call after user interaction)
   */
  public async initialize(): Promise<void> {
    if (this.audioContext) return

    this.audioContext = new AudioContext()
    this.masterGainNode = this.audioContext.createGain()
    this.masterGainNode.connect(this.audioContext.destination)
    this.updateMasterGain()
    
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
   */
  public async setOutputDevice(deviceId: string): Promise<void> {
    this.outputDeviceId = deviceId
    // Apply to all existing audio elements
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
        this.initializeUserPlayback(userId)
      }

      // Decode base64 to ArrayBuffer (raw Int16 PCM data)
      const binaryString = atob(audioDataBase64)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }

      // Convert Int16 PCM to Float32 and write to ring buffer
      // Use asymmetric conversion like old client
      const int16Array = new Int16Array(bytes.buffer)
      this.writeToPlaybackBuffer(userId, int16Array)
      
      console.log(`[AudioPlayback] Buffered audio from ${userId}, samples: ${int16Array.length}`)
    } catch (err) {
      console.error('[AudioPlayback] Error playing audio:', err)
    }
  }

  /**
   * Initialize continuous playback buffer for a user
   */
  private initializeUserPlayback(userId: string): void {
    const state = this.userAudioStates.get(userId)
    if (!state || state.isPlaybackInitialized || !this.audioContext) {
      return
    }

    console.log(`[AudioPlayback] Initializing continuous playback for user ${userId}`)

    // Create ring buffer for audio samples
    state.playbackBuffer = new Float32Array(state.playbackBufferSize)
    state.playbackWritePos = 0
    state.playbackReadPos = 0

    // Create gain node if not exists
    if (!state.gainNode) {
      state.gainNode = this.audioContext.createGain()
      state.gainNode.connect(this.masterGainNode!)
      this.updateUserGain(userId)
    }

    // Create continuous audio source using ScriptProcessorNode (like old client)
    const bufferSize = 4096 // ~85ms at 48kHz
    state.playbackProcessor = this.audioContext.createScriptProcessor(bufferSize, 0, 1)
    
    state.playbackProcessor.onaudioprocess = (event) => {
      const output = event.outputBuffer.getChannelData(0)
      const userState = this.userAudioStates.get(userId)
      
      if (!userState || !userState.playbackBuffer) {
        // Fill with silence if no buffer
        output.fill(0)
        return
      }

      // Fill output buffer from ring buffer
      for (let i = 0; i < output.length; i++) {
        if (userState.playbackReadPos < userState.playbackWritePos) {
          output[i] = userState.playbackBuffer[userState.playbackReadPos % userState.playbackBufferSize]
          userState.playbackReadPos++
        } else {
          // No more audio available, output silence
          output[i] = 0
        }
      }
    }

    state.playbackProcessor.connect(state.gainNode)
    state.isPlaybackInitialized = true
    
    console.log(`[AudioPlayback] Continuous playback initialized for user ${userId}`)
  }

  /**
   * Write Int16 samples to user's playback ring buffer
   * Uses asymmetric conversion matching old client behavior
   */
  private writeToPlaybackBuffer(userId: string, int16Data: Int16Array): void {
    const state = this.userAudioStates.get(userId)
    if (!state || !state.playbackBuffer) {
      return
    }

    for (let i = 0; i < int16Data.length; i++) {
      // Asymmetric conversion: divide by 0x8000 for negative, 0x7FFF for positive
      // This matches the old client exactly
      const floatSample = int16Data[i] / (int16Data[i] < 0 ? 0x8000 : 0x7FFF)
      state.playbackBuffer[state.playbackWritePos % state.playbackBufferSize] = floatSample
      state.playbackWritePos++
    }

    // Check buffer fill level
    const bufferFill = state.playbackWritePos - state.playbackReadPos

    // Detect buffer overflow (incoming audio faster than playback)
    if (bufferFill > state.playbackBufferSize * 0.95) {
      console.warn(`[AudioPlayback] Buffer near full for user ${userId}, adjusting`)
      // Skip to 50% buffer fill to provide headroom
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
