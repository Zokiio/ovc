import { useCallback, useEffect, useRef } from 'react'
import { getAudioPlaybackManager } from '../lib/audio/playback-manager'
import { OpusCodecManager } from '../lib/audio/opus-codec-manager'
import { createLogger } from '../lib/logger'
import { getSignalingClient } from '../lib/signaling'
import { base64ToInt16, decodeAudioPayload, int16ToFloat32 } from '../lib/webrtc/audio-channel'
import { useAudioStore } from '../stores/audioStore'
import { useGroupStore } from '../stores/groupStore'
import { useUserStore } from '../stores/userStore'
import type { PlayerPosition } from '../lib/types'

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
  const localMutes = useAudioStore((s) => s.localMutes)
  const userVolumes = useAudioStore((s) => s.userVolumes)
  const setAudioDiagnostics = useAudioStore((s) => s.setAudioDiagnostics)
  const upsertProximityRadarContact = useAudioStore((s) => s.upsertProximityRadarContact)
  const setLocalMute = useAudioStore((s) => s.setLocalMute)
  const setStoredUserVolume = useAudioStore((s) => s.setUserVolume)
  const isGroupSpatialAudioEnabled = useAudioStore((s) => s.isGroupSpatialAudioEnabled)

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

  const upsertRadarIfInRange = useCallback((userId: string, distance: number, maxRange: number) => {
    if (!Number.isFinite(distance) || !Number.isFinite(maxRange)) {
      return
    }
    const nextDistance = Math.max(0, distance)
    const nextRange = Math.max(1, maxRange)
    if (nextDistance > nextRange) {
      return
    }
    upsertProximityRadarContact(userId, nextDistance, nextRange)
  }, [upsertProximityRadarContact])

  const syncSpatialState = useCallback(() => {
    const manager = managerRef.current
    const { users, localUserId } = useUserStore.getState()
    const { currentGroupId, groups } = useGroupStore.getState()
    const localGroupId = localUserId ? users.get(localUserId)?.groupId ?? null : null
    const activeGroupId = currentGroupId ?? localGroupId
    const currentGroup = currentGroupId ? groups.find((group) => group.id === currentGroupId) : null
    const currentGroupMembers = currentGroup ? new Set(currentGroup.members.map((member) => member.id)) : null
    const localPosition = localUserId ? users.get(localUserId)?.position ?? null : null
    manager.updateListenerPosition(localPosition)

    users.forEach((user, userId) => {
      if (userId === localUserId) {
        return
      }
      const shouldApplySpatial =
        isGroupSpatialAudioEnabled ||
        !activeGroupId ||
        (
          (!currentGroupMembers || !currentGroupMembers.has(userId)) &&
          user.groupId !== activeGroupId
        )
      manager.setUserSpatialEnabled(userId, shouldApplySpatial)
      manager.updateUserPosition(userId, user.position ?? null)
    })
  }, [isGroupSpatialAudioEnabled])

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
    localMutes.forEach((muted, userId) => {
      manager.setUserMuted(userId, Boolean(muted))
    })
  }, [localMutes])

  useEffect(() => {
    const manager = managerRef.current
    userVolumes.forEach((volume, userId) => {
      manager.setUserVolume(userId, Number.isFinite(volume) ? volume : 100)
    })
  }, [userVolumes])

  useEffect(() => {
    syncSpatialState()
    
    // Subscribe with manual change detection to avoid syncing on irrelevant changes
    let prevUserPositions: Map<string, PlayerPosition | null | undefined> | null = null
    let prevUserGroupIds: Map<string, string | null> | null = null
    let prevLocalUserId: string | null = null
    
    const unsubscribeUsers = useUserStore.subscribe((state) => {
      const currPositions = new Map(Array.from(state.users.entries()).map(([id, u]) => [id, u.position]))
      const currGroupIds = new Map(Array.from(state.users.entries()).map(([id, u]) => [id, u.groupId ?? null]))
      const currLocalUserId = state.localUserId
      
      // Initialize on first run
      if (prevUserPositions === null || prevUserGroupIds === null) {
        prevUserPositions = currPositions
        prevUserGroupIds = currGroupIds
        prevLocalUserId = currLocalUserId
        return
      }
      
      // Check if positions, groupIds, or localUserId changed
      let hasChanged = currLocalUserId !== prevLocalUserId
      
      if (!hasChanged && (currPositions.size !== prevUserPositions.size || currGroupIds.size !== prevUserGroupIds.size)) {
        hasChanged = true
      }
      
      if (!hasChanged) {
        for (const [userId, pos] of currPositions) {
          const prevPos = prevUserPositions.get(userId)
          // Check if presence of position changed
          if ((!pos) !== (!prevPos)) {
            hasChanged = true
            break
          }
          // Shallow equality check for position properties (skip if both are null/undefined)
          if (pos && prevPos && (
              pos.x !== prevPos.x || 
              pos.y !== prevPos.y || 
              pos.z !== prevPos.z || 
              pos.yaw !== prevPos.yaw || 
              pos.pitch !== prevPos.pitch || 
              pos.worldId !== prevPos.worldId)) {
            hasChanged = true
            break
          }
        }
      }
      
      if (!hasChanged) {
        for (const [userId, groupId] of currGroupIds) {
          if (prevUserGroupIds.get(userId) !== groupId) {
            hasChanged = true
            break
          }
        }
      }
      
      if (hasChanged) {
        prevUserPositions = currPositions
        prevUserGroupIds = currGroupIds
        prevLocalUserId = currLocalUserId
        syncSpatialState()
      }
    })
    
    let prevCurrentGroupId: string | null = null
    let prevGroupMembers: Map<string, string[]> | null = null
    
    const unsubscribeGroups = useGroupStore.subscribe((state) => {
      const currCurrentGroupId = state.currentGroupId
      const currGroupMembers = new Map(state.groups.map(g => [g.id, g.members.map(m => m.id)]))
      
      // Initialize on first run
      if (prevGroupMembers === null) {
        prevCurrentGroupId = currCurrentGroupId
        prevGroupMembers = currGroupMembers
        return
      }
      
      // Check if currentGroupId or group membership changed
      let hasChanged = currCurrentGroupId !== prevCurrentGroupId
      
      if (!hasChanged && currGroupMembers.size !== prevGroupMembers.size) {
        hasChanged = true
      }
      
      if (!hasChanged) {
        for (const [groupId, members] of currGroupMembers) {
          const prevMembers = prevGroupMembers.get(groupId)
          // Compare membership using Set (order-independent)
          if (!prevMembers || members.length !== prevMembers.length) {
            hasChanged = true
            break
          }
          // Use Set to check if same members regardless of order
          const currSet = new Set(members)
          const prevSet = new Set(prevMembers)
          if (currSet.size !== prevSet.size) {
            hasChanged = true
            break
          }
          for (const member of currSet) {
            if (!prevSet.has(member)) {
              hasChanged = true
              break
            }
          }
          if (hasChanged) break
        }
      }
      
      if (hasChanged) {
        prevCurrentGroupId = currCurrentGroupId
        prevGroupMembers = currGroupMembers
        syncSpatialState()
      }
    })
    
    return () => {
      unsubscribeUsers()
      unsubscribeGroups()
    }
  }, [syncSpatialState])

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
    managerRef.current.updateUserSpatialMetadata(
      payload.senderId,
      payload.proximity?.maxRange,
      typeof payload.gain === 'number' && Number.isFinite(payload.gain) ? payload.gain : undefined
    )

    if (payload.proximity && Number.isFinite(payload.proximity.distance) && Number.isFinite(payload.proximity.maxRange)) {
      upsertRadarIfInRange(payload.senderId, payload.proximity.distance, payload.proximity.maxRange)
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
  }, [ensureOpusDecoderReady, runtimeWarningHandler, upsertRadarIfInRange])

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
      upsertRadarIfInRange(senderId, distance as number, maxRange as number)
    }
    managerRef.current.updateUserSpatialMetadata(
      senderId,
      typeof maxRange === 'number' && Number.isFinite(maxRange) ? maxRange : undefined
    )

    const float32Data = int16ToFloat32(pcmData)
    await managerRef.current.playAudio(senderId, float32Data)
  }, [upsertRadarIfInRange])

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
