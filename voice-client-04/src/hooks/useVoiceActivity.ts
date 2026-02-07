import { useEffect, useRef, useCallback, useState } from 'react'
import { useAudioStore } from '../stores/audioStore'

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

/**
 * Hook for voice activity detection and audio capture.
 * Uses AudioWorklet for efficient audio processing.
 */
export function useVoiceActivity({
  enabled,
  onAudioData,
  testMicMode = false,
}: UseVoiceActivityOptions): UseVoiceActivityResult {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [audioLevel, setAudioLevel] = useState(0)
  const [isInitialized, setIsInitialized] = useState(false)
  const [isSwitchingDevice, setIsSwitchingDevice] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Get settings from store
  const settings = useAudioStore((s) => s.settings)
  const vadSettings = useAudioStore((s) => s.vadSettings)
  const setSpeaking = useAudioStore((s) => s.setSpeaking)
  const setMicLevel = useAudioStore((s) => s.setMicLevel)

  // Refs for audio processing
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const microphoneRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const workletNodeRef = useRef<AudioWorkletNode | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  
  // Timing refs
  const speakingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const silenceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSpeechTimeRef = useRef<number>(0)
  const isInitializingRef = useRef(false)
  const isSpeakingRef = useRef(false)

  // Loopback for test mic
  const loopbackGainRef = useRef<GainNode | null>(null)

  // Keep refs updated
  const onAudioDataRef = useRef(onAudioData)
  const testMicModeRef = useRef(testMicMode)
  const thresholdRef = useRef(vadSettings.threshold / 100) // Convert 0-100 to 0-1
  const minSpeechDurationRef = useRef(vadSettings.minSpeechDuration)
  const minSilenceDurationRef = useRef(vadSettings.minSilenceDuration)

  useEffect(() => {
    onAudioDataRef.current = onAudioData
  }, [onAudioData])

  useEffect(() => {
    testMicModeRef.current = testMicMode
  }, [testMicMode])

  useEffect(() => {
    thresholdRef.current = vadSettings.threshold / 100
  }, [vadSettings.threshold])

  useEffect(() => {
    minSpeechDurationRef.current = vadSettings.minSpeechDuration
  }, [vadSettings.minSpeechDuration])

  useEffect(() => {
    minSilenceDurationRef.current = vadSettings.minSilenceDuration
  }, [vadSettings.minSilenceDuration])

  // Update analyser smoothing when setting changes
  useEffect(() => {
    if (analyserRef.current) {
      analyserRef.current.smoothingTimeConstant = vadSettings.smoothingTimeConstant
    }
  }, [vadSettings.smoothingTimeConstant])

  // Test mic loopback
  useEffect(() => {
    if (!audioContextRef.current || !microphoneRef.current) return

    if (testMicMode) {
      if (!loopbackGainRef.current) {
        const loopbackGain = audioContextRef.current.createGain()
        loopbackGain.gain.value = 1.0
        loopbackGainRef.current = loopbackGain
      }
      microphoneRef.current.connect(loopbackGainRef.current)
      loopbackGainRef.current.connect(audioContextRef.current.destination)
    } else {
      if (loopbackGainRef.current) {
        try {
          loopbackGainRef.current.disconnect()
        } catch {
          // Already disconnected
        }
        loopbackGainRef.current = null
      }
    }
  }, [testMicMode])

  const cleanup = useCallback((resetInitialized = true) => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    if (speakingTimeoutRef.current) {
      clearTimeout(speakingTimeoutRef.current)
      speakingTimeoutRef.current = null
    }

    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current)
      silenceTimeoutRef.current = null
    }

    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect()
      workletNodeRef.current = null
    }

    if (loopbackGainRef.current) {
      try {
        loopbackGainRef.current.disconnect()
      } catch {
        // Already disconnected
      }
      loopbackGainRef.current = null
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }

    if (microphoneRef.current) {
      microphoneRef.current.disconnect()
      microphoneRef.current = null
    }

    if (analyserRef.current) {
      analyserRef.current.disconnect()
      analyserRef.current = null
    }

    if (audioContextRef.current?.state !== 'closed') {
      audioContextRef.current?.close()
      audioContextRef.current = null
    }

    setIsSpeaking(false)
    setSpeaking(false)
    isSpeakingRef.current = false
    setAudioLevel(0)
    setMicLevel(0)
    setIsSwitchingDevice(false)

    if (resetInitialized) {
      setIsInitialized(false)
    }
  }, [setSpeaking, setMicLevel])

  const stopListening = useCallback(() => {
    cleanup(true)
  }, [cleanup])

  const startListening = useCallback(async () => {
    if (isInitializingRef.current || audioContextRef.current) return

    isInitializingRef.current = true

    try {
      setError(null)

      // Build constraints
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

      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints })
      streamRef.current = stream

      const audioContext = new AudioContext({ sampleRate: 48000 })
      audioContextRef.current = audioContext

      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 2048
      analyser.smoothingTimeConstant = vadSettings.smoothingTimeConstant
      analyserRef.current = analyser

      const microphone = audioContext.createMediaStreamSource(stream)
      microphoneRef.current = microphone
      microphone.connect(analyser)

      // Setup AudioWorklet for capture
      try {
        const cacheBuster = `?v=${Date.now()}`
        await audioContext.audioWorklet.addModule(`/audio-capture-processor.js${cacheBuster}`)

        const workletNode = new AudioWorkletNode(audioContext, 'audio-capture-processor')
        workletNodeRef.current = workletNode

        workletNode.port.onmessage = (event) => {
          if (event.data.type === 'audioData' && onAudioDataRef.current) {
            // Skip transmission in test mic mode
            if (testMicModeRef.current) return
            // Gate by VAD
            if (!isSpeakingRef.current) return

            const float32Data = new Float32Array(event.data.data)
            onAudioDataRef.current(float32Data)
          }
        }

        workletNode.port.start()
        microphone.connect(workletNode)

        // Connect to silent sink (required for worklet to process)
        const silentGain = audioContext.createGain()
        silentGain.gain.value = 0
        workletNode.connect(silentGain)
        const sink = audioContext.createMediaStreamDestination()
        silentGain.connect(sink)

        workletNode.port.postMessage({ type: 'active', value: true })
      } catch (workletError) {
        console.error('[VAD] AudioWorklet setup failed:', workletError)
      }

      setIsInitialized(true)
      isInitializingRef.current = false

      // Start VAD detection loop
      const bufferLength = analyser.frequencyBinCount
      const dataArray = new Float32Array(bufferLength)

      const detectVoiceActivity = () => {
        if (!analyserRef.current) return

        analyser.getFloatTimeDomainData(dataArray)

        let sum = 0
        for (let i = 0; i < bufferLength; i++) {
          const value = Math.abs(dataArray[i])
          sum += value * value
        }

        const rms = Math.sqrt(sum / bufferLength)
        const normalizedLevel = Math.min(1, rms * 10)

        setAudioLevel(normalizedLevel)
        setMicLevel(normalizedLevel * 100)

        const now = Date.now()
        const isSpeechDetected = normalizedLevel > thresholdRef.current

        if (isSpeechDetected) {
          lastSpeechTimeRef.current = now

          if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current)
            silenceTimeoutRef.current = null
          }

          if (!isSpeakingRef.current && !speakingTimeoutRef.current) {
            speakingTimeoutRef.current = setTimeout(() => {
              setIsSpeaking(true)
              setSpeaking(true)
              isSpeakingRef.current = true
              speakingTimeoutRef.current = null
            }, minSpeechDurationRef.current)
          }
        } else {
          if (speakingTimeoutRef.current) {
            clearTimeout(speakingTimeoutRef.current)
            speakingTimeoutRef.current = null
          }

          if (isSpeakingRef.current && !silenceTimeoutRef.current) {
            const timeSinceLastSpeech = now - lastSpeechTimeRef.current
            const remainingSilence = Math.max(0, minSilenceDurationRef.current - timeSinceLastSpeech)

            silenceTimeoutRef.current = setTimeout(() => {
              setIsSpeaking(false)
              setSpeaking(false)
              isSpeakingRef.current = false
              silenceTimeoutRef.current = null
            }, remainingSilence)
          }
        }

        animationFrameRef.current = requestAnimationFrame(detectVoiceActivity)
      }

      detectVoiceActivity()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to access microphone'
      setError(errorMessage)
      setIsInitialized(false)
      isInitializingRef.current = false
      stopListening()
    }
  }, [settings, vadSettings.smoothingTimeConstant, setSpeaking, setMicLevel, stopListening])

  // Auto start/stop based on enabled
  useEffect(() => {
    if (enabled && !isInitialized) {
      startListening()
    } else if (!enabled && isInitialized) {
      stopListening()
    }
  }, [enabled, isInitialized, startListening, stopListening])

  // Restart on device change
  useEffect(() => {
    if (enabled && isInitialized) {
      setIsSwitchingDevice(true)
      cleanup(false)
      const timer = setTimeout(() => {
        startListening().finally(() => setIsSwitchingDevice(false))
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [settings.inputDeviceId])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        stopListening()
      }
    }
  }, [stopListening])

  return {
    isSpeaking,
    audioLevel,
    isInitialized,
    isSwitchingDevice,
    error,
    startListening,
    stopListening,
  }
}
