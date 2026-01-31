/**
 * Hook for managing audio transmission to the server
 * 
 * Works in conjunction with use-voice-activity hook - pass the returned
 * onAudioData callback to enable audio capture and transmission.
 */

import { useCallback, useRef, useEffect } from 'react'
import { getSignalingClient } from '@/lib/signaling'

interface UseAudioTransmissionOptions {
  /** Whether transmission is enabled */
  enabled: boolean
  /** Whether connected to server */
  connected: boolean
}

interface UseAudioTransmissionResult {
  /** Callback to pass to use-voice-activity hook */
  onAudioData: (audioData: string) => void
}

export function useAudioTransmission({
  enabled,
  connected
}: UseAudioTransmissionOptions): UseAudioTransmissionResult {
  const signalingClientRef = useRef(getSignalingClient())
  const enabledRef = useRef(enabled)
  const connectedRef = useRef(connected)
  
  // Keep refs updated
  useEffect(() => {
    enabledRef.current = enabled
  }, [enabled])
  
  useEffect(() => {
    connectedRef.current = connected
  }, [connected])

  /**
   * Handle audio data from VAD hook
   * This is called whenever the user is speaking and audio is captured
   */
  const onAudioData = useCallback((audioData: string) => {
    // Only send if enabled and connected
    if (!enabledRef.current || !connectedRef.current) {
      return
    }
    
    const client = signalingClientRef.current
    if (client.isConnected()) {
      client.sendAudio(audioData)
    }
  }, [])

  return {
    onAudioData
  }
}
