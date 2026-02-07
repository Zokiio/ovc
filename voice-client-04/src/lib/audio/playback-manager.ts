/**
 * Audio Playback Manager
 * Handles per-user audio playback with individual volume and mute controls.
 * Uses AudioWorklet for low-latency playback.
 */

export interface UserAudioState {
  volume: number // 0-200 (allow boost)
  isMuted: boolean
  gainNode: GainNode | null
  playbackProcessor: AudioWorkletNode | null
  isInitialized: boolean
}

export class AudioPlaybackManager {
  private audioContext: AudioContext | null = null
  private masterGainNode: GainNode | null = null
  private userStates: Map<string, UserAudioState> = new Map()
  private masterVolume: number = 100
  private masterMuted: boolean = false
  private outputDeviceId: string = 'default'
  private workletReady: Promise<void> | null = null

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
          console.warn('[AudioPlayback] Failed to load worklet:', err)
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
        await (this.audioContext as any).setSinkId(this.outputDeviceId)
      } catch (err) {
        console.warn('[AudioPlayback] Failed to set output device:', err)
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
    if (state.isMuted || this.masterMuted) return

    // Initialize playback if needed
    if (!state.isInitialized) {
      await this.initializeUserPlayback(userId)
    }

    // Send samples to worklet
    if (state.playbackProcessor && 'port' in state.playbackProcessor) {
      state.playbackProcessor.port.postMessage(
        { type: 'samples', data: float32Data },
        [float32Data.buffer]
      )
    }
  }

  private async initializeUserPlayback(userId: string): Promise<void> {
    const state = this.userStates.get(userId)
    if (!state || state.isInitialized || !this.audioContext) return

    // Create gain node
    if (!state.gainNode) {
      state.gainNode = this.audioContext.createGain()
      state.gainNode.connect(this.masterGainNode!)
      this.updateUserGain(userId)
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
      workletNode.connect(state.gainNode)
      state.playbackProcessor = workletNode
      state.isInitialized = true
    } catch (err) {
      console.error('[AudioPlayback] Failed to initialize playback:', err)
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
        gainNode: null,
        playbackProcessor: null,
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
