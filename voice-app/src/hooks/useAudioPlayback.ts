import { useCallback, useEffect, useRef } from 'react'
import { getAudioPlaybackManager } from '../lib/audio/playback-manager'
import { base64ToInt16, decodeAudioPayload, int16ToFloat32 } from '../lib/webrtc/audio-channel'
import { useAudioStore } from '../stores/audioStore'
import { useUserStore } from '../stores/userStore'

/**
 * Hook for managing audio playback from WebRTC DataChannel.
 */
export function useAudioPlayback() {
  const outputVolume = useAudioStore((s) => s.settings.outputVolume)
  const outputDeviceId = useAudioStore((s) => s.settings.outputDeviceId)
  const isDeafened = useAudioStore((s) => s.isDeafened)
  
  const setUserVolume = useUserStore((s) => s.setUserVolume)
  const setUserMuted = useUserStore((s) => s.setUserMuted)

  const managerRef = useRef(getAudioPlaybackManager())

  // Sync master volume
  useEffect(() => {
    managerRef.current.setMasterVolume(outputVolume)
  }, [outputVolume])

  // Sync master mute (deafened)
  useEffect(() => {
    managerRef.current.setMasterMuted(isDeafened)
  }, [isDeafened])

  // Sync output device
  useEffect(() => {
    managerRef.current.setOutputDevice(outputDeviceId)
  }, [outputDeviceId])

  /**
   * Handle incoming audio data from DataChannel
   */
  const handleAudioData = useCallback(async (data: ArrayBuffer) => {
    console.debug('[useAudioPlayback] Received audio:', data.byteLength, 'bytes')
    const payload = decodeAudioPayload(data)
    if (!payload) {
      console.warn('[useAudioPlayback] Failed to decode audio payload')
      return
    }

    console.debug('[useAudioPlayback] Playing audio from:', payload.senderId, 'samples:', payload.pcmData.length)
    const float32Data = int16ToFloat32(payload.pcmData)
    await managerRef.current.playAudio(payload.senderId, float32Data)
  }, [])

  /**
   * Handle fallback WebSocket audio message payloads.
   */
  const handleWebSocketAudio = useCallback(async (senderId: string, base64Audio: string) => {
    const pcmData = base64ToInt16(base64Audio)
    if (!pcmData) {
      console.warn('[useAudioPlayback] Failed to decode WebSocket audio payload')
      return
    }

    const float32Data = int16ToFloat32(pcmData)
    await managerRef.current.playAudio(senderId, float32Data)
  }, [])

  /**
   * Set volume for a specific user
   */
  const setVolume = useCallback((userId: string, volume: number) => {
    managerRef.current.setUserVolume(userId, volume)
    setUserVolume(userId, volume)
  }, [setUserVolume])

  /**
   * Toggle mute for a specific user
   */
  const toggleMute = useCallback((userId: string) => {
    const isMuted = managerRef.current.toggleUserMute(userId)
    setUserMuted(userId, isMuted)
    return isMuted
  }, [setUserMuted])

  /**
   * Initialize playback (call after user interaction)
   */
  const initialize = useCallback(async () => {
    await managerRef.current.initialize()
  }, [])

  /**
   * Disconnect a user's audio
   */
  const disconnectUser = useCallback((userId: string) => {
    managerRef.current.disconnectUser(userId)
  }, [])

  return {
    handleAudioData,
    handleWebSocketAudio,
    setVolume,
    toggleMute,
    initialize,
    disconnectUser,
    getUserVolume: (userId: string) => managerRef.current.getUserVolume(userId),
    isUserMuted: (userId: string) => managerRef.current.isUserMuted(userId),
  }
}
