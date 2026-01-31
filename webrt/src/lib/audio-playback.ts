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
   */
  public async playUserAudio(userId: string, audioDataBase64: string): Promise<void> {
    await this.ensureReady()
    
    const state = this.getOrCreateUserState(userId)
    
    // Skip if user is muted
    if (state.isMuted || this.masterMuted) {
      return
    }

    try {
      // Decode base64 to ArrayBuffer (raw Int16 PCM data)
      const binaryString = atob(audioDataBase64)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }

      // Convert Int16 PCM to Float32 samples
      const int16Array = new Int16Array(bytes.buffer)
      const float32Array = new Float32Array(int16Array.length)
      for (let i = 0; i < int16Array.length; i++) {
        // Convert Int16 [-32768, 32767] to Float32 [-1.0, 1.0]
        float32Array[i] = int16Array[i] / 32768.0
      }

      // Create AudioBuffer from raw PCM samples
      const sampleRate = this.audioContext!.sampleRate
      const audioBuffer = this.audioContext!.createBuffer(1, float32Array.length, sampleRate)
      audioBuffer.copyToChannel(float32Array, 0)
      
      // Create source and apply gain
      const source = this.audioContext!.createBufferSource()
      source.buffer = audioBuffer
      
      // Ensure user has a gain node
      if (!state.gainNode) {
        state.gainNode = this.audioContext!.createGain()
        state.gainNode.connect(this.masterGainNode!)
        this.updateUserGain(userId)
      }
      
      source.connect(state.gainNode)
      source.start()
      
      console.log(`[AudioPlayback] Playing audio from ${userId}, samples: ${float32Array.length}`)
    } catch (err) {
      console.error('[AudioPlayback] Error playing audio:', err)
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
      if (state.gainNode) {
        state.gainNode.disconnect()
        state.gainNode = null
      }
      if (state.audioElement) {
        state.audioElement.pause()
        state.audioElement.srcObject = null
        state.audioElement = null
      }
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
        volume: 80,
        isMuted: false,
        gainNode: null,
        audioElement: null
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
