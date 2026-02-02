import { useEffect, useState, useRef, useCallback } from 'react'
import { AudioSettings } from '@/lib/types'

interface VoiceActivityOptions {
  enabled: boolean
  audioSettings: AudioSettings
  threshold?: number
  smoothingTimeConstant?: number
  minSpeechDuration?: number
  minSilenceDuration?: number
  enableAudioCapture?: boolean  // Enable PCM capture for transmission
  onAudioData?: (audioData: string) => void  // Callback for captured audio (base64)
  useVadThreshold?: boolean  // Apply VAD threshold gating to audio transmission (default: true)
  testMicMode?: boolean  // When true, plays mic back to speakers and mutes transmission
}

interface VoiceActivityResult {
  isSpeaking: boolean
  audioLevelRef: React.RefObject<number>  // Use ref to avoid re-renders
  isInitialized: boolean
  isSwitchingDevice: boolean  // True when switching input devices
  error: string | null
  startListening: () => Promise<void>
  stopListening: () => void
  isTestMicActive: boolean  // Whether test mic loopback is active
}

/**
 * Convert Float32 PCM samples to base64-encoded Int16 PCM
 * Applies input volume multiplier to audio amplitude
 */
function float32ToBase64(float32Array: Float32Array, volumeMultiplier?: number): string {
  const multiplier = volumeMultiplier ?? 1
  const int16Array = new Int16Array(float32Array.length)
  
  for (let i = 0; i < float32Array.length; i++) {
    // Apply volume multiplier, then clamp and convert float [-1, 1] to int16 [-32768, 32767]
    const amplified = float32Array[i] * multiplier
    const s = Math.max(-1, Math.min(1, amplified))
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  
  // Convert Int16Array to binary string
  const bytes = new Uint8Array(int16Array.buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  
  return btoa(binary)
}

export function useVoiceActivity({
  enabled,
  audioSettings,
  threshold = 0.12,           // More sensitive default
  smoothingTimeConstant = 0.75, // Less smoothing for responsiveness
  minSpeechDuration = 60,     // Fast attack (60ms)
  minSilenceDuration = 400,   // Moderate release (400ms)
  enableAudioCapture = false,
  onAudioData,
  useVadThreshold = true,
  testMicMode = false
}: VoiceActivityOptions): VoiceActivityResult {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isTestMicActive, setIsTestMicActive] = useState(false)
  const audioLevelRef = useRef(0)  // Use ref instead of state to avoid re-renders
  const [isInitialized, setIsInitialized] = useState(false)
  const [isSwitchingDevice, setIsSwitchingDevice] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const microphoneRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const speakingTimeoutRef = useRef<number | null>(null)
  const silenceTimeoutRef = useRef<number | null>(null)
  const lastSpeechTimeRef = useRef<number>(0)
  const isInitializingRef = useRef(false)
  const lastLevelUpdateRef = useRef<number>(0)
  const lastReportedLevelRef = useRef<number>(0)
  const isSpeakingRef = useRef(false) // Track speaking state for gating audio transmission
  const thresholdRef = useRef(threshold) // Track current threshold for detection loop
  const deviceSwitchTimerRef = useRef<number | null>(null) // Track device switch restart timer
  
  // Audio capture refs (using AudioWorkletNode)
  const workletNodeRef = useRef<AudioWorkletNode | null>(null)
  const constraintsAppliedRef = useRef(false)  // Track if processing constraints were applied
  const onAudioDataRef = useRef(onAudioData)  // Keep callback ref updated
  const enableAudioCaptureRef = useRef(enableAudioCapture)
  const useVadThresholdRef = useRef(useVadThreshold)  // Track VAD threshold gating setting
  
  // Test mic loopback refs
  const loopbackGainRef = useRef<GainNode | null>(null)
  const testMicModeRef = useRef(testMicMode)
  
  // Track if processing settings effect has run once (skip first render)
  const processingSettingsMountedRef = useRef(false)
  
  // Refs for attack/release/smoothing so slider changes apply without restart
  const minSpeechDurationRef = useRef(minSpeechDuration)
  const minSilenceDurationRef = useRef(minSilenceDuration)
  const smoothingTimeConstantRef = useRef(smoothingTimeConstant)
  
  // Update refs when props change
  useEffect(() => {
    onAudioDataRef.current = onAudioData
  }, [onAudioData])
  
  useEffect(() => {
    useVadThresholdRef.current = useVadThreshold
  }, [useVadThreshold])
  
  // Keep threshold ref updated so detection loop uses current value
  useEffect(() => {
    thresholdRef.current = threshold
  }, [threshold])
  
  // Keep attack/release/smoothing refs updated so slider changes apply live
  useEffect(() => {
    minSpeechDurationRef.current = minSpeechDuration
  }, [minSpeechDuration])
  
  useEffect(() => {
    minSilenceDurationRef.current = minSilenceDuration
  }, [minSilenceDuration])
  
  useEffect(() => {
    smoothingTimeConstantRef.current = smoothingTimeConstant
    // Also update the analyser if it exists
    if (analyserRef.current) {
      analyserRef.current.smoothingTimeConstant = smoothingTimeConstant
    }
  }, [smoothingTimeConstant])
  
  // Activate/deactivate audio capture based on enableAudioCapture prop
  useEffect(() => {
    enableAudioCaptureRef.current = enableAudioCapture
    // Notify worklet of active status change
    if (workletNodeRef.current) {
      workletNodeRef.current.port.postMessage({ type: 'active', value: enableAudioCapture })
    }
  }, [enableAudioCapture])

  // Test mic loopback: connect mic to speakers when enabled, mute transmission
  useEffect(() => {
    testMicModeRef.current = testMicMode
    
    if (!audioContextRef.current || !microphoneRef.current) {
      setIsTestMicActive(false)
      return
    }
    
    if (testMicMode) {
      // Create loopback gain node and connect mic to speakers
      if (!loopbackGainRef.current) {
        const loopbackGain = audioContextRef.current.createGain()
        loopbackGain.gain.value = 1.0
        loopbackGainRef.current = loopbackGain
      }
      microphoneRef.current.connect(loopbackGainRef.current)
      loopbackGainRef.current.connect(audioContextRef.current.destination)
      setIsTestMicActive(true)
    } else {
      // Disconnect loopback
      if (loopbackGainRef.current) {
        try {
          loopbackGainRef.current.disconnect()
        } catch {
          // Already disconnected
        }
        loopbackGainRef.current = null
      }
      setIsTestMicActive(false)
    }
  }, [testMicMode])

  // Internal cleanup function - can preserve isInitialized state for device switching
  const cleanupAudio = useCallback((resetInitialized: boolean = true) => {
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

    if (deviceSwitchTimerRef.current) {
      clearTimeout(deviceSwitchTimerRef.current)
      deviceSwitchTimerRef.current = null
    }

    // Reset constraints tracking when stopping
    constraintsAppliedRef.current = false

    // Clean up AudioWorklet node for audio capture
    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect()
      workletNodeRef.current = null
    }

    // Clean up loopback gain node (test mic)
    if (loopbackGainRef.current) {
      try {
        loopbackGainRef.current.disconnect()
      } catch {
        // Already disconnected
      }
      loopbackGainRef.current = null
    }
    setIsTestMicActive(false)

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
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

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close()
      audioContextRef.current = null
    }

    setIsSpeaking(false)
    isSpeakingRef.current = false // Reset ref for audio gating
    audioLevelRef.current = 0
    setIsSwitchingDevice(false) // Reset switching state on cleanup
    
    if (resetInitialized) {
      setIsInitialized(false)
    }
  }, [])

  const stopListening = useCallback(() => {
    cleanupAudio(true)
  }, [cleanupAudio])

  const startListening = useCallback(async () => {
    if (isInitializingRef.current || audioContextRef.current) return
    
    isInitializingRef.current = true

    try {
      setError(null)

      // Build audio constraints - only include processing properties on initial setup
      // This prevents system audio changes when user changes device
      const audioConstraints: MediaTrackConstraints = {
        channelCount: 1,
        sampleRate: 48000
      }
      
      // Only add deviceId if not default
      if (audioSettings.inputDevice !== 'default') {
        audioConstraints.deviceId = { ideal: audioSettings.inputDevice }
      }
      
      // ONLY apply processing constraints on initial setup, not on device changes
      // This prevents OS from applying audio constraints system-wide on every device change
      if (!constraintsAppliedRef.current && (audioSettings.echoCancellation || audioSettings.noiseSuppression || audioSettings.autoGainControl)) {
        if (audioSettings.echoCancellation) {
          audioConstraints.echoCancellation = true
        }
        if (audioSettings.noiseSuppression) {
          audioConstraints.noiseSuppression = true
        }
        if (audioSettings.autoGainControl) {
          audioConstraints.autoGainControl = true
        }
        constraintsAppliedRef.current = true
      }

      const constraints: MediaStreamConstraints = {
        audio: audioConstraints
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream

      // Force 48kHz to match server sample rate
      const audioContext = new AudioContext({ sampleRate: 48000 })
      audioContextRef.current = audioContext

      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 2048
      analyser.smoothingTimeConstant = smoothingTimeConstant
      analyserRef.current = analyser

      const microphone = audioContext.createMediaStreamSource(stream)
      microphoneRef.current = microphone
      microphone.connect(analyser)

      // Set up audio capture for transmission (using AudioWorklet)
      // Always set up the worklet so it's ready when enableAudioCapture becomes true
      try {
        // Load the AudioWorklet processor (cache-bust to ensure latest version)
        const cacheBuster = `?v=${Date.now()}`
        await audioContext.audioWorklet.addModule(`/audio-capture-processor.js${cacheBuster}`)
        
        // Create the worklet node
        const workletNode = new AudioWorkletNode(audioContext, 'audio-capture-processor')
        workletNodeRef.current = workletNode
        
        // Handle audio data from worklet - MUST be set up immediately after node creation
        workletNode.port.onmessage = (event) => {
          if (event.data.type === 'audioData' && onAudioDataRef.current) {
            // Mute transmission when in test mic mode (loopback only)
            if (testMicModeRef.current) {
              return // Don't transmit during mic test
            }
            
            // Gate audio transmission: only send when speech is detected above threshold (if VAD threshold is enabled)
            if (useVadThresholdRef.current && !isSpeakingRef.current) {
              return // Discard audio below VAD threshold
            }
            
            const float32Data = new Float32Array(event.data.data)
            // Apply input volume multiplier when converting to base64
            const volumeMultiplier = audioSettings.inputVolume / 100
            const audioData = float32ToBase64(float32Data, volumeMultiplier)
            onAudioDataRef.current(audioData)
          }
        }
        
        // Start the port to receive messages (required for MessagePort)
        workletNode.port.start()
        
        // Connect: microphone → workletNode → silentGain → MediaStreamDestination
        // The worklet MUST be connected to a destination for process() to be called,
        // but we avoid routing to speakers to prevent OS audio ducking.
        microphone.connect(workletNode)
        
        // Create a silent gain node to sink the audio (required for worklet to process)
        const silentGain = audioContext.createGain()
        silentGain.gain.value = 0 // Silent output
        workletNode.connect(silentGain)
        const sink = audioContext.createMediaStreamDestination()
        silentGain.connect(sink)
        
        // Set initial active state
        workletNode.port.postMessage({ type: 'active', value: enableAudioCaptureRef.current })
      } catch (workletError) {
        console.error('[VAD] AudioWorklet setup failed:', workletError)
      }

      setIsInitialized(true)
      isInitializingRef.current = false

      const bufferLength = analyser.frequencyBinCount
      const dataArray = new Float32Array(bufferLength)

      const detectVoiceActivity = () => {
        if (!analyserRef.current) return

        analyser.getFloatTimeDomainData(dataArray)

        let sum = 0
        let max = 0
        for (let i = 0; i < bufferLength; i++) {
          const value = Math.abs(dataArray[i])
          sum += value * value
          max = Math.max(max, value)
        }

        const rms = Math.sqrt(sum / bufferLength)
        const normalizedLevel = Math.min(1, rms * 10)
        
        // Update ref (no re-renders) - throttle slightly to avoid excessive updates
        const now = Date.now()
        if (now - lastLevelUpdateRef.current > 50 || 
            Math.abs(normalizedLevel - lastReportedLevelRef.current) > 0.05) {
          lastLevelUpdateRef.current = now
          lastReportedLevelRef.current = normalizedLevel
          audioLevelRef.current = normalizedLevel
        }

        // VAD threshold is independent of input volume
        // Input volume only affects transmitted audio amplitude, not detection
        // Compare normalized level (0-1) against threshold so visual meter matches detection
        // Use thresholdRef to pick up slider changes without restarting audio
        const isSpeechDetected = normalizedLevel > thresholdRef.current

        if (isSpeechDetected) {
          lastSpeechTimeRef.current = now
          
          // Clear silence timeout if speech is detected
          if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current)
            silenceTimeoutRef.current = null
          }

          // Start speaking after minSpeechDuration if not already speaking
          // Use ref so slider changes apply immediately
          if (!isSpeakingRef.current && !speakingTimeoutRef.current) {
            speakingTimeoutRef.current = window.setTimeout(() => {
              setIsSpeaking(true)
              isSpeakingRef.current = true
              speakingTimeoutRef.current = null
            }, minSpeechDurationRef.current)
          }
        } else {
          // Clear speaking timeout if speech stops before threshold
          if (speakingTimeoutRef.current) {
            clearTimeout(speakingTimeoutRef.current)
            speakingTimeoutRef.current = null
          }

          // Stop speaking after minSilenceDuration since last detected speech
          // Use ref so slider changes apply immediately
          if (isSpeakingRef.current && !silenceTimeoutRef.current) {
            const timeSinceLastSpeech = now - lastSpeechTimeRef.current
            const remainingSilence = Math.max(0, minSilenceDurationRef.current - timeSinceLastSpeech)

            silenceTimeoutRef.current = window.setTimeout(() => {
              setIsSpeaking(false)
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
  }, [
    audioSettings.inputDevice,
    audioSettings.echoCancellation,
    audioSettings.noiseSuppression,
    audioSettings.autoGainControl,
    stopListening
    // Note: threshold, smoothingTimeConstant, minSpeechDuration, minSilenceDuration
    // are intentionally NOT in deps - they use refs so changes apply without restart
  ])

  useEffect(() => {
    if (enabled && !isInitialized) {
      startListening()
    } else if (!enabled && isInitialized) {
      stopListening()
    }
  }, [enabled, isInitialized, startListening, stopListening])

  // Restart audio when input device changes (while enabled)
  useEffect(() => {
    if (enabled && isInitialized) {
      setIsSwitchingDevice(true)
      // Use cleanupAudio(false) to preserve isInitialized state during device switch
      cleanupAudio(false)
      // Small delay to ensure cleanup completes before restart
      deviceSwitchTimerRef.current = window.setTimeout(() => {
        // Guard: only restart if still enabled and initialized
        if (enabled && isInitialized) {
          startListening().finally(() => {
            setIsSwitchingDevice(false)
          })
        } else {
          // Reset switching state if conditions no longer met
          setIsSwitchingDevice(false)
        }
        deviceSwitchTimerRef.current = null
      }, 100)
    }
    
    return () => {
      if (deviceSwitchTimerRef.current) {
        clearTimeout(deviceSwitchTimerRef.current)
        deviceSwitchTimerRef.current = null
        setIsSwitchingDevice(false)
      }
    }
  }, [audioSettings.inputDevice, enabled, isInitialized, cleanupAudio, startListening])

  // Restart audio when processing settings change (echo/noise/gain) while connected
  // These require a fresh getUserMedia call to apply
  useEffect(() => {
    // Skip first render - only handle actual changes while already running
    if (!processingSettingsMountedRef.current) {
      processingSettingsMountedRef.current = true
      return
    }
    
    // Only restart if currently enabled and initialized
    if (!enabled || !isInitialized) return
    
    setIsSwitchingDevice(true)
    cleanupAudio(false)
    
    deviceSwitchTimerRef.current = window.setTimeout(() => {
      if (enabled && isInitialized) {
        startListening().finally(() => {
          setIsSwitchingDevice(false)
        })
      } else {
        setIsSwitchingDevice(false)
      }
      deviceSwitchTimerRef.current = null
    }, 100)
    
    return () => {
      if (deviceSwitchTimerRef.current) {
        clearTimeout(deviceSwitchTimerRef.current)
        deviceSwitchTimerRef.current = null
        setIsSwitchingDevice(false)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioSettings.echoCancellation, audioSettings.noiseSuppression, audioSettings.autoGainControl])

  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        stopListening()
      }
    }
  }, [stopListening])

  return {
    isSpeaking,
    audioLevelRef,
    isInitialized,
    isSwitchingDevice,
    error,
    startListening,
    stopListening,
    isTestMicActive
  }
}
