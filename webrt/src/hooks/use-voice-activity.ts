import { useEffect, useState, useRef, useCallback } from 'react'
import { AudioSettings } from '@/lib/types'

interface VoiceActivityOptions {
  enabled: boolean
  audioSettings: AudioSettings
  threshold?: number
  smoothingTimeConstant?: number
  minSpeechDuration?: number
  minSilenceDuration?: number
}

interface VoiceActivityResult {
  isSpeaking: boolean
  audioLevel: number
  isInitialized: boolean
  error: string | null
  startListening: () => Promise<void>
  stopListening: () => void
}

export function useVoiceActivity({
  enabled,
  audioSettings,
  threshold = 0.15,
  smoothingTimeConstant = 0.8,
  minSpeechDuration = 100,
  minSilenceDuration = 300
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
    if (isInitializingRef.current || audioContextRef.current) return
    
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
    stopListening
  ])

  useEffect(() => {
    if (enabled && !isInitialized) {
      startListening()
    } else if (!enabled && isInitialized) {
      stopListening()
    }
  }, [enabled, isInitialized])

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
