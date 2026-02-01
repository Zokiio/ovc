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
}

interface VoiceActivityResult {
  isSpeaking: boolean
  audioLevelRef: React.RefObject<number>  // Use ref to avoid re-renders
  isInitialized: boolean
  error: string | null
  startListening: () => Promise<void>
  stopListening: () => void
}

/**
 * Convert Float32 PCM samples to base64-encoded Int16 PCM
 */
function float32ToBase64(float32Array: Float32Array): string {
  const int16Array = new Int16Array(float32Array.length)
  
  for (let i = 0; i < float32Array.length; i++) {
    // Clamp and convert float [-1, 1] to int16 [-32768, 32767]
    const s = Math.max(-1, Math.min(1, float32Array[i]))
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
  threshold = 0.15,
  smoothingTimeConstant = 0.8,
  minSpeechDuration = 100,
  minSilenceDuration = 300,
  enableAudioCapture = false,
  onAudioData
}: VoiceActivityOptions): VoiceActivityResult {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const audioLevelRef = useRef(0)  // Use ref instead of state to avoid re-renders
  const [isInitialized, setIsInitialized] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const microphoneRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const speakingTimeoutRef = useRef<number | null>(null)
  const silenceTimeoutRef = useRef<number | null>(null)
  const lastSpeechTimeRef = useRef<number>(0)
  const lastSilenceTimeRef = useRef<number>(0)
  const isInitializingRef = useRef(false)
  const lastLevelUpdateRef = useRef<number>(0)
  const lastReportedLevelRef = useRef<number>(0)
  
  // Audio capture refs (using AudioWorkletNode)
  const workletNodeRef = useRef<AudioWorkletNode | null>(null)
  const onAudioDataRef = useRef(onAudioData)  // Keep callback ref updated
  const enableAudioCaptureRef = useRef(enableAudioCapture)
  
  // Update refs when props change
  useEffect(() => {
    onAudioDataRef.current = onAudioData
  }, [onAudioData])
  
  // Activate/deactivate audio capture based on enableAudioCapture prop
  useEffect(() => {
    enableAudioCaptureRef.current = enableAudioCapture
    // Notify worklet of active status change
    if (workletNodeRef.current) {
      workletNodeRef.current.port.postMessage({ type: 'active', value: enableAudioCapture })
    }
  }, [enableAudioCapture])

  const stopListening = useCallback(() => {
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

    // Clean up AudioWorklet node for audio capture
    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect()
      workletNodeRef.current = null
    }

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
    audioLevelRef.current = 0
    setIsInitialized(false)
  }, [])

  const startListening = useCallback(async () => {
    if (isInitializingRef.current || audioContextRef.current) return
    
    isInitializingRef.current = true

    try {
      setError(null)

      const constraints: MediaStreamConstraints = {
        audio: {
          deviceId: audioSettings.inputDevice !== 'default' 
            ? { ideal: audioSettings.inputDevice }
            : undefined,
          echoCancellation: audioSettings.echoCancellation,
          noiseSuppression: audioSettings.noiseSuppression,
          autoGainControl: audioSettings.autoGainControl,
          channelCount: 1,
          sampleRate: 48000
        }
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
            const float32Data = new Float32Array(event.data.data)
            const audioData = float32ToBase64(float32Data)
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

        const volumeMultiplier = audioSettings.inputVolume / 100
        const adjustedThreshold = threshold / Math.max(volumeMultiplier, 0.1)
        const isSpeechDetected = rms > adjustedThreshold

        if (isSpeechDetected) {
          lastSpeechTimeRef.current = now
          
          setIsSpeaking(currentSpeaking => {
            if (!currentSpeaking) {
              if (silenceTimeoutRef.current) {
                clearTimeout(silenceTimeoutRef.current)
                silenceTimeoutRef.current = null
              }

              if (!speakingTimeoutRef.current) {
                speakingTimeoutRef.current = window.setTimeout(() => {
                  setIsSpeaking(true)
                  speakingTimeoutRef.current = null
                }, minSpeechDuration)
              }
            } else {
              if (speakingTimeoutRef.current) {
                clearTimeout(speakingTimeoutRef.current)
                speakingTimeoutRef.current = null
              }
            }
            return currentSpeaking
          })
        } else {
          lastSilenceTimeRef.current = now

          setIsSpeaking(currentSpeaking => {
            if (currentSpeaking) {
              if (speakingTimeoutRef.current) {
                clearTimeout(speakingTimeoutRef.current)
                speakingTimeoutRef.current = null
              }

              if (!silenceTimeoutRef.current && now - lastSpeechTimeRef.current > minSilenceDuration) {
                silenceTimeoutRef.current = window.setTimeout(() => {
                  setIsSpeaking(false)
                  silenceTimeoutRef.current = null
                }, minSilenceDuration)
              }
            } else {
              if (speakingTimeoutRef.current) {
                clearTimeout(speakingTimeoutRef.current)
                speakingTimeoutRef.current = null
              }
            }
            return currentSpeaking
          })
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
    audioSettings.inputVolume,
    threshold,
    smoothingTimeConstant,
    minSpeechDuration,
    minSilenceDuration,
    stopListening
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
      console.log('[VAD] Input device changed, restarting audio...')
      stopListening()
      // Small delay to ensure cleanup completes before restart
      const timer = setTimeout(() => {
        startListening()
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [audioSettings.inputDevice])

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
    error,
    startListening,
    stopListening
  }
}
