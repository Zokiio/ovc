/**
 * Hook for managing audio transmission to the server
 * 
 * Works in conjunction with use-voice-activity hook - pass the returned
 * onAudioData callback to enable audio capture and transmission.
 */

import { useCallback, useRef, useEffect } from 'react'
import { getSignalingClient } from '@/lib/signaling'
import { WebRTCTransport } from '@/lib/webrtc-transport'

interface UseAudioTransmissionOptions {
  /** Whether transmission is enabled */
  enabled: boolean
  /** Whether connected to server */
  connected: boolean
  /** Optional WebRTC transport */
  transport?: WebRTCTransport | null
}

interface UseAudioTransmissionResult {
  /** Callback to pass to use-voice-activity hook */
  onAudioData: (audioData: string | ArrayBuffer) => void
}

export function useAudioTransmission({
  enabled,
  connected,
  transport
}: UseAudioTransmissionOptions): UseAudioTransmissionResult {
  const signalingClientRef = useRef(getSignalingClient())
  const enabledRef = useRef(enabled)
  const connectedRef = useRef(connected)
  const transportRef = useRef<WebRTCTransport | null | undefined>(transport)
  
  // Keep refs updated
  useEffect(() => {
    enabledRef.current = enabled
  }, [enabled])
  
  useEffect(() => {
    connectedRef.current = connected
  }, [connected])

  useEffect(() => {
    transportRef.current = transport
  }, [transport])

  /**
   * Handle audio data from VAD hook
   * This is called whenever the user is speaking and audio is captured
   */
  const onAudioData = useCallback((audioData: string | ArrayBuffer) => {
    // Only send if enabled and connected
    if (!enabledRef.current || !connectedRef.current) {
      return
    }
    
    const transportInstance = transportRef.current
    if (audioData instanceof ArrayBuffer) {
      if (transportInstance?.isReady()) {
        transportInstance.sendAudioBinary(audioData)
      }
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
