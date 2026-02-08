import { useCallback, useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { getAudioPlaybackManager } from '../lib/audio/playback-manager'
import { OpusCodecManager } from '../lib/audio/opus-codec-manager'
import { createLogger } from '../lib/logger'
import { getSignalingClient } from '../lib/signaling'
import { base64ToInt16, decodeAudioPayload, int16ToFloat32 } from '../lib/webrtc/audio-channel'
import { useAudioStore } from '../stores/audioStore'

const logger = createLogger('useAudioPlayback')

interface UseAudioPlaybackOptions {
  onRuntimeWarning?: (message: string) => void
}

/**
 * Hook for managing audio playback from WebRTC DataChannel.
 */
export function useAudioPlayback(options: UseAudioPlaybackOptions = {}) {
  const runtimeWarningHandler = options.onRuntimeWarning
  const outputVolume = useAudioStore((s) => s.settings.outputVolume)
  const outputDeviceId = useAudioStore((s) => s.settings.outputDeviceId)
  const isDeafened = useAudioStore((s) => s.isDeafened)
  const localMuteEntries = useAudioStore(useShallow((s) => Array.from(s.localMutes.entries())))
  const userVolumeEntries = useAudioStore(useShallow((s) => Array.from(s.userVolumes.entries())))
  const setAudioDiagnostics = useAudioStore((s) => s.setAudioDiagnostics)
  const upsertProximityRadarContact = useAudioStore((s) => s.upsertProximityRadarContact)
  const setLocalMute = useAudioStore((s) => s.setLocalMute)
  const setStoredUserVolume = useAudioStore((s) => s.setUserVolume)

  const managerRef = useRef(getAudioPlaybackManager())
  const opusDecoderRef = useRef(new OpusCodecManager())

  const ensureOpusDecoderReady = useCallback(async () => {
    if (opusDecoderRef.current.isReady()) {
      return
    }

    const codecConfig = getSignalingClient().getAudioCodecConfig()
    await opusDecoderRef.current.initialize(codecConfig ?? {
      sampleRate: 48000,
      channels: 1,
      frameDurationMs: 20,
      targetBitrate: 32000,
    })
  }, [])

  useEffect(() => {
    const manager = managerRef.current
    manager.setDiagnosticsListener((userId, diagnostics) => {
      setAudioDiagnostics(userId, diagnostics)
    })
    return () => {
      manager.setDiagnosticsListener(null)
    }
  }, [setAudioDiagnostics])

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

  // Keep per-user controls authoritative from store state to survive reconnect/HMR/re-init.
  useEffect(() => {
    const manager = managerRef.current
    localMuteEntries.forEach(([userId, muted]) => {
      manager.setUserMuted(userId, Boolean(muted))
    })
  }, [localMuteEntries])

  useEffect(() => {
    const manager = managerRef.current
    userVolumeEntries.forEach(([userId, volume]) => {
      manager.setUserVolume(userId, Number.isFinite(volume) ? volume : 100)
    })
  }, [userVolumeEntries])

  /**
   * Handle incoming audio data from DataChannel
   */
  const handleAudioData = useCallback(async (data: ArrayBuffer) => {
    logger.debug('Received audio:', data.byteLength, 'bytes')
    const payload = decodeAudioPayload(data)
    if (!payload) {
      logger.warn('Failed to decode audio payload')
      return
    }

    const sampleOrPacketSize = payload.codec === 'opus'
      ? payload.opusData?.byteLength ?? 0
      : payload.pcmData?.length ?? 0
    logger.debug('Playing audio from:', payload.senderId, 'samplesOrPacketBytes:', sampleOrPacketSize)
    if (payload.proximity && Number.isFinite(payload.proximity.distance) && Number.isFinite(payload.proximity.maxRange)) {
      upsertProximityRadarContact(payload.senderId, payload.proximity.distance, payload.proximity.maxRange)
    }

    if (payload.codec === 'opus') {
      if (!payload.opusData) {
        logger.warn('Opus payload missing packet bytes')
        return
      }

      try {
        await ensureOpusDecoderReady()
        const codecConfig = getSignalingClient().getAudioCodecConfig()
        const durationUs = Math.max(1, Math.round((codecConfig?.frameDurationMs ?? 20) * 1000))
        const decoded = await opusDecoderRef.current.decodePacket(payload.opusData, durationUs)
        if (typeof payload.gain === 'number' && Number.isFinite(payload.gain)) {
          const gain = Math.max(0, Math.min(1, payload.gain))
          for (let i = 0; i < decoded.length; i++) {
            decoded[i] *= gain
          }
        }
        await managerRef.current.playAudio(payload.senderId, decoded)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown Opus decode failure'
        logger.warn('Failed to decode Opus payload:', message)
        runtimeWarningHandler?.(`Opus decode failed: ${message}`)
      }
      return
    }

    if (!payload.pcmData) {
      logger.warn('PCM payload missing sample bytes')
      return
    }

    const float32Data = int16ToFloat32(payload.pcmData)
    await managerRef.current.playAudio(payload.senderId, float32Data)
  }, [ensureOpusDecoderReady, runtimeWarningHandler, upsertProximityRadarContact])

  /**
   * Handle fallback WebSocket audio message payloads.
   */
  const handleWebSocketAudio = useCallback(async (
    senderId: string,
    base64Audio: string,
    distance?: number,
    maxRange?: number,
  ) => {
    const pcmData = base64ToInt16(base64Audio)
    if (!pcmData) {
      logger.warn('Failed to decode WebSocket audio payload')
      return
    }

    if (Number.isFinite(distance) && Number.isFinite(maxRange)) {
      upsertProximityRadarContact(senderId, distance as number, maxRange as number)
    }

    const float32Data = int16ToFloat32(pcmData)
    await managerRef.current.playAudio(senderId, float32Data)
  }, [upsertProximityRadarContact])

  /**
   * Set volume for a specific user
   */
  const setVolume = useCallback((userId: string, volume: number) => {
    managerRef.current.setUserVolume(userId, volume)
    setStoredUserVolume(userId, volume)
  }, [setStoredUserVolume])

  /**
   * Toggle mute for a specific user
   */
  const toggleMute = useCallback((userId: string) => {
    const currentMuted = useAudioStore.getState().localMutes.get(userId) ?? false
    const nextMuted = !currentMuted
    managerRef.current.setUserMuted(userId, nextMuted)
    setLocalMute(userId, nextMuted)
    return nextMuted
  }, [setLocalMute])

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

  useEffect(() => {
    const opusDecoder = opusDecoderRef.current
    return () => {
      opusDecoder.dispose()
    }
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
