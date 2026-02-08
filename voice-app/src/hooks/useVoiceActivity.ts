import { useEffect, useCallback, useState } from 'react'
import { useAudioStore } from '../stores/audioStore'
import { createLogger } from '../lib/logger'

const logger = createLogger('VAD')

interface UseVoiceActivityOptions {
  enabled: boolean
  onAudioData?: (float32Data: Float32Array) => void
  testMicMode?: boolean
}

interface UseVoiceActivityResult {
  isSpeaking: boolean
  audioLevel: number
  isInitialized: boolean
  isSwitchingDevice: boolean
  error: string | null
  startListening: () => Promise<void>
  stopListening: () => void
}

// Module-level singleton state to prevent multiple audio contexts
let globalAudioContext: AudioContext | null = null
let globalStream: MediaStream | null = null
let globalAnalyser: AnalyserNode | null = null
let globalMicrophone: MediaStreamAudioSourceNode | null = null
let globalWorkletNode: AudioWorkletNode | null = null
let globalAnimationFrame: number | null = null
let globalIsInitializing = false
let globalIsInitialized = false
let globalResumeInteractionHandler: (() => void) | null = null
let globalCaptureActive = false

// Callbacks registered by hook instances
type AudioCallback = (data: Float32Array) => void
const audioCallbacks = new Set<AudioCallback>()

// VAD state - stored globally to avoid re-renders
let globalIsSpeaking = false
let globalThreshold = 0.1
let globalMinSpeechDuration = 100
let globalMinSilenceDuration = 300
let lastSpeechTime = 0
let speakingTimeout: ReturnType<typeof setTimeout> | null = null
let silenceTimeout: ReturnType<typeof setTimeout> | null = null
let lastLevel = 0
const VAD_LEVEL_DB_FLOOR = -65
const VAD_LEVEL_DB_CEILING = -18
const VAD_RMS_EPSILON = 1e-7

// Zustand store setters (set once, used in animation loop)
let globalSetMicLevel: ((level: number) => void) | null = null
let globalSetSpeaking: ((speaking: boolean) => void) | null = null

function setGlobalCaptureActive(active: boolean): void {
  globalCaptureActive = active
  if (globalWorkletNode?.port) {
    globalWorkletNode.port.postMessage({ type: 'active', value: active })
  }

  if (!active) {
    globalIsSpeaking = false
    globalSetSpeaking?.(false)
  }
}

function rmsToNormalizedLevel(rms: number): number {
  const safeRms = Math.max(VAD_RMS_EPSILON, rms)
  const decibels = 20 * Math.log10(safeRms)
  const normalized = (decibels - VAD_LEVEL_DB_FLOOR) / (VAD_LEVEL_DB_CEILING - VAD_LEVEL_DB_FLOOR)
  return Math.max(0, Math.min(1, normalized))
}

function cleanupGlobal() {
  logger.debug('Cleaning up global audio resources')
  
  if (globalAnimationFrame) {
    cancelAnimationFrame(globalAnimationFrame)
    globalAnimationFrame = null
  }

  if (speakingTimeout) {
    clearTimeout(speakingTimeout)
    speakingTimeout = null
  }

  if (silenceTimeout) {
    clearTimeout(silenceTimeout)
    silenceTimeout = null
  }

  if (globalWorkletNode) {
    globalWorkletNode.disconnect()
    globalWorkletNode = null
  }

  if (globalStream) {
    globalStream.getTracks().forEach((track) => track.stop())
    globalStream = null
  }

  if (globalMicrophone) {
    globalMicrophone.disconnect()
    globalMicrophone = null
  }

  if (globalAnalyser) {
    globalAnalyser.disconnect()
    globalAnalyser = null
  }

  if (globalAudioContext?.state !== 'closed') {
    globalAudioContext?.close()
  }
  globalAudioContext = null

  if (globalResumeInteractionHandler) {
    window.removeEventListener('pointerdown', globalResumeInteractionHandler)
    window.removeEventListener('keydown', globalResumeInteractionHandler)
    globalResumeInteractionHandler = null
  }

  globalIsInitialized = false
  globalIsInitializing = false
  globalIsSpeaking = false
  globalCaptureActive = false
  lastLevel = 0
}

async function tryResumeAudioContext(reason: string): Promise<void> {
  if (!globalAudioContext || globalAudioContext.state !== 'suspended') {
    return
  }

  try {
    await globalAudioContext.resume()
    logger.debug(`AudioContext resumed (${reason})`)
  } catch (err) {
    logger.debug('AudioContext resume deferred:', err)
  }
}

function installResumeOnInteraction(): void {
  if (globalResumeInteractionHandler) {
    return
  }

  const handler = () => {
    void tryResumeAudioContext('user-interaction')
    if (globalAudioContext?.state === 'running' && globalResumeInteractionHandler) {
      window.removeEventListener('pointerdown', globalResumeInteractionHandler)
      window.removeEventListener('keydown', globalResumeInteractionHandler)
      globalResumeInteractionHandler = null
    }
  }

  globalResumeInteractionHandler = handler
  window.addEventListener('pointerdown', handler, { passive: true })
  window.addEventListener('keydown', handler)
}

async function initializeGlobal(settings: {
  inputDeviceId: string
  echoCancellation: boolean
  noiseSuppression: boolean
  autoGainControl: boolean
  smoothingTimeConstant: number
}): Promise<void> {
  if (globalIsInitializing || globalIsInitialized) {
    logger.debug('Already initializing or initialized, skipping')
    return
  }

  globalIsInitializing = true
  logger.debug('Beginning global mic initialization...')

  try {
    const audioConstraints: MediaTrackConstraints = {
      channelCount: 1,
      sampleRate: 48000,
    }

    if (settings.inputDeviceId !== 'default') {
      audioConstraints.deviceId = { ideal: settings.inputDeviceId }
    }

    if (settings.echoCancellation) {
      audioConstraints.echoCancellation = true
    }
    if (settings.noiseSuppression) {
      audioConstraints.noiseSuppression = true
    }
    if (settings.autoGainControl) {
      audioConstraints.autoGainControl = true
    }

    logger.debug('Requesting microphone with constraints:', audioConstraints)
    globalStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints })
    logger.debug('Got microphone stream:', globalStream.getTracks().map(t => t.label))

    globalAudioContext = new AudioContext({ sampleRate: 48000 })
    installResumeOnInteraction()
    await tryResumeAudioContext('initialization')

    globalAnalyser = globalAudioContext.createAnalyser()
    globalAnalyser.fftSize = 2048
    globalAnalyser.smoothingTimeConstant = settings.smoothingTimeConstant

    globalMicrophone = globalAudioContext.createMediaStreamSource(globalStream)
    globalMicrophone.connect(globalAnalyser)

    // Setup AudioWorklet for capture
    try {
      const cacheBuster = `?v=${Date.now()}`
      await globalAudioContext.audioWorklet.addModule(`/audio-capture-processor.js${cacheBuster}`)

      globalWorkletNode = new AudioWorkletNode(globalAudioContext, 'audio-capture-processor')

      globalWorkletNode.port.onmessage = (event) => {
        if (event.data.type === 'audioData') {
          // Transmission is controlled by connection/mute state AND VAD gate state.
          if (!globalCaptureActive || !globalIsSpeaking) return

          const float32Data = new Float32Array(event.data.data)
          // Notify all registered callbacks
          audioCallbacks.forEach(cb => cb(float32Data))
        }
      }

      globalWorkletNode.port.start()
      globalMicrophone.connect(globalWorkletNode)

      // Connect to silent sink (required for worklet to process)
      const silentGain = globalAudioContext.createGain()
      silentGain.gain.value = 0
      globalWorkletNode.connect(silentGain)
      const sink = globalAudioContext.createMediaStreamDestination()
      silentGain.connect(sink)

      setGlobalCaptureActive(globalCaptureActive)
    } catch (workletError) {
      logger.error('AudioWorklet setup failed:', workletError)
    }

    globalIsInitialized = true
    globalIsInitializing = false
    logger.debug('Global initialization complete, starting VAD detection loop')

    // Start VAD detection loop
    const bufferLength = globalAnalyser.frequencyBinCount
    const dataArray = new Float32Array(bufferLength)
    let frameCount = 0

    const detectVoiceActivity = () => {
      if (!globalAnalyser || !globalIsInitialized) return

      globalAnalyser.getFloatTimeDomainData(dataArray)

      let sum = 0
      for (let i = 0; i < bufferLength; i++) {
        const value = Math.abs(dataArray[i])
        sum += value * value
      }

      const rms = Math.sqrt(sum / bufferLength)
      const normalizedLevel = rmsToNormalizedLevel(rms)

      // Only update store every 3 frames (~20fps instead of 60fps) to reduce re-renders
      frameCount++
      if (frameCount % 3 === 0) {
        // Only update if level changed significantly (> 1%)
        if (Math.abs(normalizedLevel - lastLevel) > 0.01) {
          lastLevel = normalizedLevel
          globalSetMicLevel?.(normalizedLevel * 100)
        }
      }

      const now = Date.now()
      const isSpeechDetected = normalizedLevel > globalThreshold

      if (isSpeechDetected) {
        lastSpeechTime = now

        if (silenceTimeout) {
          clearTimeout(silenceTimeout)
          silenceTimeout = null
        }

        if (!globalIsSpeaking && !speakingTimeout) {
          speakingTimeout = setTimeout(() => {
            globalIsSpeaking = true
            speakingTimeout = null
            globalSetSpeaking?.(true)
          }, globalMinSpeechDuration)
        }
      } else {
        if (speakingTimeout) {
          clearTimeout(speakingTimeout)
          speakingTimeout = null
        }

        if (globalIsSpeaking && !silenceTimeout) {
          const timeSinceLastSpeech = now - lastSpeechTime
          const remainingSilence = Math.max(0, globalMinSilenceDuration - timeSinceLastSpeech)

          silenceTimeout = setTimeout(() => {
            globalIsSpeaking = false
            silenceTimeout = null
            globalSetSpeaking?.(false)
          }, remainingSilence)
        }
      }

      globalAnimationFrame = requestAnimationFrame(detectVoiceActivity)
    }

    detectVoiceActivity()
  } catch (err) {
    logger.error('Initialization error:', err)
    globalIsInitializing = false
    cleanupGlobal()
    throw err
  }
}

/**
 * Hook for voice activity detection and audio capture.
 * Uses AudioWorklet for efficient audio processing.
 * Uses a singleton pattern to prevent multiple audio contexts.
 */
export function useVoiceActivity({
  enabled,
  onAudioData,
  testMicMode = false,
}: UseVoiceActivityOptions): UseVoiceActivityResult {
  const [isInitialized, setIsInitialized] = useState(globalIsInitialized)
  const [isSwitchingDevice, setIsSwitchingDevice] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Get settings from store (don't subscribe to reactive values to avoid re-renders)
  const settings = useAudioStore((s) => s.settings)
  const vadSettings = useAudioStore((s) => s.vadSettings)
  const setSpeaking = useAudioStore((s) => s.setSpeaking)
  const setMicLevel = useAudioStore((s) => s.setMicLevel)
  // Note: We return global values instead of subscribing to store to avoid re-renders
  // Components that need isSpeaking/micLevel should subscribe directly from store

  // Register latest store setters for the singleton VAD loop.
  useEffect(() => {
    globalSetMicLevel = setMicLevel
    globalSetSpeaking = setSpeaking
  }, [setMicLevel, setSpeaking])

  // Update global VAD settings
  useEffect(() => {
    globalThreshold = vadSettings.threshold / 100
    globalMinSpeechDuration = vadSettings.minSpeechDuration
    globalMinSilenceDuration = vadSettings.minSilenceDuration
  }, [vadSettings.threshold, vadSettings.minSpeechDuration, vadSettings.minSilenceDuration])

  // Register audio callback
  useEffect(() => {
    if (!onAudioData || testMicMode) return

    const callback: AudioCallback = (data) => {
      if (!globalCaptureActive) return
      onAudioData(data)
    }

    audioCallbacks.add(callback)
    return () => {
      audioCallbacks.delete(callback)
    }
  }, [onAudioData, testMicMode])

  const startListening = useCallback(async () => {
    if (globalIsInitialized || globalIsInitializing) {
      logger.debug('startListening: already initialized/initializing')
      setGlobalCaptureActive(enabled)
      setIsInitialized(true)
      return
    }

    try {
      setError(null)
      await initializeGlobal({
        inputDeviceId: settings.inputDeviceId,
        echoCancellation: settings.echoCancellation,
        noiseSuppression: settings.noiseSuppression,
        autoGainControl: settings.autoGainControl,
        smoothingTimeConstant: vadSettings.smoothingTimeConstant,
      })
      setGlobalCaptureActive(enabled)
      setIsInitialized(true)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to access microphone'
      setError(errorMessage)
      setIsInitialized(false)
    }
  }, [settings, vadSettings.smoothingTimeConstant, enabled])

  const stopListening = useCallback(() => {
    // Only cleanup if no other callbacks are registered
    if (audioCallbacks.size <= 1) {
      cleanupGlobal()
      setMicLevel(0)
      setSpeaking(false)
    }
    setIsInitialized(false)
  }, [setSpeaking, setMicLevel])

  // Auto start/stop based on enabled
  useEffect(() => {
    let syncTimer: number | null = null
    setGlobalCaptureActive(enabled)

    if (enabled && !globalIsInitialized && !globalIsInitializing) {
      logger.debug('Starting listening...')
      const startTimer = window.setTimeout(() => {
        void startListening()
      }, 0)
      return () => window.clearTimeout(startTimer)
    }

    // Sync local state with global
    if (globalIsInitialized && !isInitialized) {
      syncTimer = window.setTimeout(() => {
        setIsInitialized(true)
      }, 0)
    }

    return () => {
      if (syncTimer !== null) {
        window.clearTimeout(syncTimer)
      }
    }
  }, [enabled, isInitialized, startListening])

  // Restart on device change
  useEffect(() => {
    if (!enabled || !globalIsInitialized) {
      return
    }

    const timer = window.setTimeout(() => {
      setIsSwitchingDevice(true)
      cleanupGlobal()
      void startListening().finally(() => setIsSwitchingDevice(false))
    }, 0)

    return () => window.clearTimeout(timer)
  }, [enabled, settings.inputDeviceId, startListening])

  return {
    isSpeaking: globalIsSpeaking, // Use global state, not store subscription
    audioLevel: lastLevel, // Use global state, not store subscription
    isInitialized,
    isSwitchingDevice,
    error,
    startListening,
    stopListening,
  }
}
