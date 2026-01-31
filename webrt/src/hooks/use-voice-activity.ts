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
  audioLevel: number
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
  const [audioLevel, setAudioLevel] = useState(0)
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
  const isSpeakingRef = useRef(false)  // Non-reactive ref for use in processor callback
  const onAudioDataRef = useRef(onAudioData)  // Keep callback ref updated
  
  // Update refs when props change
  useEffect(() => {
    onAudioDataRef.current = onAudioData
  }, [onAudioData])
  
  useEffect(() => {
    isSpeakingRef.current = isSpeaking
    // Notify worklet of speaking status change
    if (workletNodeRef.current) {
      workletNodeRef.current.port.postMessage({ type: 'speaking', value: isSpeaking })
    }
  }, [isSpeaking])

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
    setAudioLevel(0)
    setIsInitialized(false)
  }, [])

  const startListening = useCallback(async () => {
    console.log('[VAD] startListening called, isInitializing:', isInitializingRef.current, 'hasContext:', !!audioContextRef.current)
    if (isInitializingRef.current || audioContextRef.current) return
    
    console.log('[VAD] Starting microphone access...')
    isInitializingRef.current = true

    try {
      setError(null)

      const constraints: MediaStreamConstraints = {
        audio: {
          deviceId: audioSettings.inputDevice !== 'default' 
            ? { exact: audioSettings.inputDevice }
            : undefined,
          echoCancellation: audioSettings.echoCancellation,
          noiseSuppression: audioSettings.noiseSuppression,
          autoGainControl: audioSettings.autoGainControl,
          channelCount: 1
        }
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream

      const audioContext = new AudioContext()
      audioContextRef.current = audioContext

      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 2048
      analyser.smoothingTimeConstant = smoothingTimeConstant
      analyserRef.current = analyser

      const microphone = audioContext.createMediaStreamSource(stream)
      microphoneRef.current = microphone
      microphone.connect(analyser)

      // Set up audio capture for transmission if enabled (using AudioWorklet)
      if (enableAudioCapture) {
        console.log('[VAD] Setting up audio capture for transmission using AudioWorklet')
        try {
          // Load the AudioWorklet processor
          await audioContext.audioWorklet.addModule('/audio-capture-processor.js')
          
          // Create the worklet node
          const workletNode = new AudioWorkletNode(audioContext, 'audio-capture-processor')
          workletNodeRef.current = workletNode
          
          // Handle audio data from worklet
          workletNode.port.onmessage = (event) => {
            if (event.data.type === 'audioData' && onAudioDataRef.current) {
              const float32Data = new Float32Array(event.data.data)
              const audioData = float32ToBase64(float32Data)
              console.log('[VAD] Capturing audio frame, length:', audioData.length)
              onAudioDataRef.current(audioData)
            }
          }
          
          // Connect: microphone → workletNode
          microphone.connect(workletNode)
          // Note: worklet doesn't need to connect to destination
        } catch (workletError) {
          console.error('[VAD] AudioWorklet failed, audio capture disabled:', workletError)
        }
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
        
        // Throttle audio level updates to ~10fps (every 100ms) and only if changed significantly
        const now = Date.now()
        if (now - lastLevelUpdateRef.current > 100 || 
            Math.abs(normalizedLevel - lastReportedLevelRef.current) > 0.05) {
          lastLevelUpdateRef.current = now
          lastReportedLevelRef.current = normalizedLevel
          setAudioLevel(normalizedLevel)
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
    enableAudioCapture,
    stopListening
  ])

  useEffect(() => {
    console.log('[VAD] Effect running: enabled=', enabled, 'isInitialized=', isInitialized)
    if (enabled && !isInitialized) {
      console.log('[VAD] Triggering startListening from effect')
      startListening()
    } else if (!enabled && isInitialized) {
      stopListening()
    }
  }, [enabled, isInitialized])

  // Restart when enableAudioCapture changes (need to re-setup the audio pipeline)
  useEffect(() => {
    if (enabled && isInitialized && enableAudioCapture) {
      // Need to restart to add the worklet node
      if (!workletNodeRef.current) {
        console.log('[VAD] Audio capture enabled, restarting to setup capture pipeline')
        stopListening()
        // Defer restart slightly to allow cleanup
        setTimeout(() => startListening(), 100)
      }
    }
  }, [enableAudioCapture])

  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        stopListening()
      }
    }
  }, [])

  return {
    isSpeaking,
    audioLevel,
    isInitialized,
    error,
    startListening,
    stopListening
  }
}
