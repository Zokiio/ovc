import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { persist } from 'zustand/middleware'
import type { AudioSettings, VADSettings, AudioDevice } from '../lib/types'

interface AudioStore {
  // Audio Settings
  settings: AudioSettings
  vadSettings: VADSettings
  
  // Runtime State
  devices: AudioDevice[]
  micLevel: number
  isMicMuted: boolean
  isDeafened: boolean
  isSpeaking: boolean
  isAudioInitialized: boolean
  isTestingMic: boolean
  
  // Per-user audio state
  localMutes: Map<string, boolean>
  userVolumes: Map<string, number>
  
  // Actions - Settings
  setInputDevice: (deviceId: string) => void
  setOutputDevice: (deviceId: string) => void
  setInputVolume: (volume: number) => void
  setOutputVolume: (volume: number) => void
  setEchoCancellation: (enabled: boolean) => void
  setNoiseSuppression: (enabled: boolean) => void
  setAutoGainControl: (enabled: boolean) => void
  
  // Actions - VAD
  setVADThreshold: (threshold: number) => void
  setVADPreset: (preset: 'quiet' | 'normal' | 'noisy') => void
  setMinSpeechDuration: (ms: number) => void
  setMinSilenceDuration: (ms: number) => void
  setSmoothingTimeConstant: (value: number) => void
  
  // Actions - Runtime
  setDevices: (devices: AudioDevice[]) => void
  setMicLevel: (level: number) => void
  setMicMuted: (muted: boolean) => void
  toggleMicMuted: () => void
  setDeafened: (deafened: boolean) => void
  toggleDeafened: () => void
  setSpeaking: (speaking: boolean) => void
  setAudioInitialized: (initialized: boolean) => void
  setTestingMic: (testing: boolean) => void
  
  // Actions - Per-user
  setLocalMute: (userId: string, muted: boolean) => void
  setUserVolume: (userId: string, volume: number) => void
}

const VAD_PRESETS: Record<'quiet' | 'normal' | 'noisy', Partial<VADSettings>> = {
  quiet: { threshold: 15, minSpeechDuration: 50, minSilenceDuration: 300 },
  normal: { threshold: 25, minSpeechDuration: 100, minSilenceDuration: 200 },
  noisy: { threshold: 40, minSpeechDuration: 150, minSilenceDuration: 150 },
}

const defaultAudioSettings: AudioSettings = {
  inputDeviceId: 'default',
  outputDeviceId: 'default',
  inputVolume: 100,
  outputVolume: 100,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
}

const defaultVADSettings: VADSettings = {
  threshold: 25,
  minSpeechDuration: 100,
  minSilenceDuration: 200,
  smoothingTimeConstant: 0.8,
  preset: 'normal',
}

export const useAudioStore = create<AudioStore>()(
  persist(
    immer((set) => ({
      // Initial State
      settings: defaultAudioSettings,
      vadSettings: defaultVADSettings,
      devices: [],
      micLevel: 0,
      isMicMuted: false,
      isDeafened: false,
      isSpeaking: false,
      isAudioInitialized: false,
      isTestingMic: false,
      localMutes: new Map<string, boolean>(),
      userVolumes: new Map<string, number>(),

      // Audio Settings Actions
      setInputDevice: (deviceId) =>
        set((state) => {
          state.settings.inputDeviceId = deviceId
        }),

      setOutputDevice: (deviceId) =>
        set((state) => {
          state.settings.outputDeviceId = deviceId
        }),

      setInputVolume: (volume) =>
        set((state) => {
          state.settings.inputVolume = Math.max(0, Math.min(100, volume))
        }),

      setOutputVolume: (volume) =>
        set((state) => {
          state.settings.outputVolume = Math.max(0, Math.min(100, volume))
        }),

      setEchoCancellation: (enabled) =>
        set((state) => {
          state.settings.echoCancellation = enabled
        }),

      setNoiseSuppression: (enabled) =>
        set((state) => {
          state.settings.noiseSuppression = enabled
        }),

      setAutoGainControl: (enabled) =>
        set((state) => {
          state.settings.autoGainControl = enabled
        }),

      // VAD Actions
      setVADThreshold: (threshold) =>
        set((state) => {
          state.vadSettings.threshold = Math.max(0, Math.min(100, threshold))
        }),

      setVADPreset: (preset) =>
        set((state) => {
          state.vadSettings.preset = preset
          const presetValues = VAD_PRESETS[preset]
          Object.assign(state.vadSettings, presetValues)
        }),

      setMinSpeechDuration: (ms) =>
        set((state) => {
          state.vadSettings.minSpeechDuration = Math.max(0, ms)
        }),

      setMinSilenceDuration: (ms) =>
        set((state) => {
          state.vadSettings.minSilenceDuration = Math.max(0, ms)
        }),

      setSmoothingTimeConstant: (value) =>
        set((state) => {
          state.vadSettings.smoothingTimeConstant = Math.max(0, Math.min(1, value))
        }),

      // Runtime Actions
      setDevices: (devices) =>
        set((state) => {
          state.devices = devices
        }),

      setMicLevel: (level) =>
        set((state) => {
          state.micLevel = level
        }),

      setMicMuted: (muted) =>
        set((state) => {
          state.isMicMuted = muted
        }),

      toggleMicMuted: () =>
        set((state) => {
          state.isMicMuted = !state.isMicMuted
        }),

      setDeafened: (deafened) =>
        set((state) => {
          state.isDeafened = deafened
        }),

      toggleDeafened: () =>
        set((state) => {
          state.isDeafened = !state.isDeafened
        }),

      setSpeaking: (speaking) =>
        set((state) => {
          state.isSpeaking = speaking
        }),

      setAudioInitialized: (initialized) =>
        set((state) => {
          state.isAudioInitialized = initialized
        }),

      setTestingMic: (testing) =>
        set((state) => {
          state.isTestingMic = testing
        }),

      // Per-user audio actions
      setLocalMute: (userId, muted) =>
        set((state) => {
          state.localMutes.set(userId, muted)
        }),

      setUserVolume: (userId, volume) =>
        set((state) => {
          state.userVolumes.set(userId, Math.max(0, Math.min(200, volume)))
        }),
    })),
    {
      name: 'voice-client-audio',
      partialize: (state) => ({
        settings: state.settings,
        vadSettings: state.vadSettings,
      }),
    }
  )
)
