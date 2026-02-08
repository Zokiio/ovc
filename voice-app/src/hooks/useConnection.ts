import { useCallback, useEffect, useRef } from 'react'
import { getSignalingClient, resetSignalingClient } from '../lib/signaling'
import { OpusCodecManager } from '../lib/audio/opus-codec-manager'
import { getWebRTCManager, resetWebRTCManager } from '../lib/webrtc/connection-manager'
import { float32ToInt16, int16ToBase64 } from '../lib/webrtc/audio-channel'
import { useConnectionStore } from '../stores/connectionStore'
import { useGroupStore } from '../stores/groupStore'
import { useUserStore } from '../stores/userStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useAudioStore } from '../stores/audioStore'
import { useVoiceActivity } from './useVoiceActivity'
import { useAudioPlayback } from './useAudioPlayback'
import { createLogger } from '../lib/logger'
import type { AudioCodecConfig, Group, GroupMember, User, PlayerPosition } from '../lib/types'

// Keep outbound PCM chunks comfortably below the server's DataChannel payload cap (900 bytes).
const MAX_WEBRTC_PCM_SAMPLES_PER_CHUNK = 384 // 768 bytes
const OUTBOUND_PCM_MAX_FLUSH_DELAY_MS = 20
const OPUS_FRAME_SAMPLES = 960 // 20ms at 48kHz mono
const OUTBOUND_OPUS_MAX_FLUSH_DELAY_MS = 20
const MAX_OUTBOUND_OPUS_QUEUE_FRAMES = 24 // 480ms cap to reduce drops on slower clients
const MAX_OUTBOUND_OPUS_QUEUE_SAMPLES = OPUS_FRAME_SAMPLES * MAX_OUTBOUND_OPUS_QUEUE_FRAMES
const PENDING_CREATE_GROUP_WINDOW_MS = 5000
const logger = createLogger('useConnection')
const DEFAULT_OPUS_CODEC_CONFIG: AudioCodecConfig = {
  sampleRate: 48000,
  channels: 1,
  frameDurationMs: 20,
  targetBitrate: 32000,
}

function concatInt16Arrays(left: Int16Array, right: Int16Array): Int16Array {
  if (left.length === 0) return right
  if (right.length === 0) return left
  const merged = new Int16Array(left.length + right.length)
  merged.set(left, 0)
  merged.set(right, left.length)
  return merged
}

function cloneInt16Array(data: Int16Array): Int16Array {
  if (data.length === 0) return data
  const copy = new Int16Array(data.length)
  copy.set(data)
  return copy
}

function concatFloat32Arrays(left: Float32Array, right: Float32Array): Float32Array {
  if (left.length === 0) return right
  if (right.length === 0) return left
  const merged = new Float32Array(left.length + right.length)
  merged.set(left, 0)
  merged.set(right, left.length)
  return merged
}

function cloneFloat32Array(data: Float32Array): Float32Array {
  if (data.length === 0) return data
  const copy = new Float32Array(data.length)
  copy.set(data)
  return copy
}

function scaleFloat32InPlace(data: Float32Array, multiplier: number): void {
  if (multiplier === 1) {
    return
  }
  for (let i = 0; i < data.length; i++) {
    data[i] *= multiplier
  }
}

function uint8ToArrayBuffer(data: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(data.byteLength)
  new Uint8Array(buffer).set(data)
  return buffer
}

function int16ToArrayBuffer(data: Int16Array): ArrayBuffer {
  const buffer = new ArrayBuffer(data.byteLength)
  new Uint8Array(buffer).set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength))
  return buffer
}

/**
 * Main connection hook that orchestrates signaling, WebRTC, and audio.
 */
export function useConnection() {
  const isConnectingRef = useRef(false)
  const lastSentSpeakingRef = useRef<boolean | null>(null)
  const pendingCreateGroupRef = useRef<number | null>(null)
  const pendingOutboundPcmRef = useRef<Int16Array>(new Int16Array(0))
  const outboundPcmFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingOutboundOpusPcmRef = useRef<Float32Array>(new Float32Array(0))
  const outboundOpusFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const opusEncoderRef = useRef(new OpusCodecManager())
  const opusEncoderGenerationRef = useRef(0)
  const opusDrainChainRef = useRef<Promise<void>>(Promise.resolve())
  
  // Connection store
  const status = useConnectionStore((s) => s.status)
  const clientId = useConnectionStore((s) => s.clientId)
  const setStatus = useConnectionStore((s) => s.setStatus)
  const setAuthenticated = useConnectionStore((s) => s.setAuthenticated)
  const setLatency = useConnectionStore((s) => s.setLatency)
  const setError = useConnectionStore((s) => s.setError)
  const setServerUrl = useConnectionStore((s) => s.setServerUrl)
  const resetConnection = useConnectionStore((s) => s.reset)

  // Group store
  const setGroups = useGroupStore((s) => s.setGroups)
  const addGroup = useGroupStore((s) => s.addGroup)
  const removeGroup = useGroupStore((s) => s.removeGroup)
  const setCurrentGroupId = useGroupStore((s) => s.setCurrentGroupId)
  const setGroupMembers = useGroupStore((s) => s.setGroupMembers)
  const updateMemberSpeaking = useGroupStore((s) => s.updateMemberSpeaking)
  const updateMemberMuted = useGroupStore((s) => s.updateMemberMuted)
  const resetGroups = useGroupStore((s) => s.reset)

  // User store
  const setUsers = useUserStore((s) => s.setUsers)
  const setLocalUserId = useUserStore((s) => s.setLocalUserId)
  const setUserSpeaking = useUserStore((s) => s.setUserSpeaking)
  const setUserMicMuted = useUserStore((s) => s.setUserMicMuted)
  const setUserPosition = useUserStore((s) => s.setUserPosition)
  const resetUsers = useUserStore((s) => s.reset)

  // Settings store
  const addSavedServer = useSettingsStore((s) => s.addSavedServer)
  const setLastServerUrl = useSettingsStore((s) => s.setLastServerUrl)

  // Audio store
  const isMicMuted = useAudioStore((s) => s.isMicMuted)
  const setMicMuted = useAudioStore((s) => s.setMicMuted)
  const isSpeaking = useAudioStore((s) => s.isSpeaking)
  const inputVolume = useAudioStore((s) => s.settings.inputVolume)
  const setProximityRadarEnabled = useAudioStore((s) => s.setProximityRadarEnabled)

  // Audio playback
  const { handleAudioData, handleWebSocketAudio, initialize: initializePlayback } = useAudioPlayback()

  const clearOutboundPcmFlushTimer = useCallback(() => {
    if (outboundPcmFlushTimerRef.current !== null) {
      clearTimeout(outboundPcmFlushTimerRef.current)
      outboundPcmFlushTimerRef.current = null
    }
  }, [])

  const clearOutboundOpusFlushTimer = useCallback(() => {
    if (outboundOpusFlushTimerRef.current !== null) {
      clearTimeout(outboundOpusFlushTimerRef.current)
      outboundOpusFlushTimerRef.current = null
    }
  }, [])

  const resetOutboundPcmQueue = useCallback(() => {
    clearOutboundPcmFlushTimer()
    pendingOutboundPcmRef.current = new Int16Array(0)
  }, [clearOutboundPcmFlushTimer])

  const resetOutboundOpusQueue = useCallback(() => {
    clearOutboundOpusFlushTimer()
    pendingOutboundOpusPcmRef.current = new Float32Array(0)
    opusDrainChainRef.current = Promise.resolve()
  }, [clearOutboundOpusFlushTimer])

  const resetOutboundAudioQueues = useCallback(() => {
    resetOutboundPcmQueue()
    resetOutboundOpusQueue()
  }, [resetOutboundPcmQueue, resetOutboundOpusQueue])

  const resetOpusEncoder = useCallback(() => {
    opusEncoderGenerationRef.current += 1
    opusEncoderRef.current.dispose()
    opusEncoderRef.current = new OpusCodecManager()
  }, [])

  const tryDrainOutboundPcmQueue = useCallback((forceFlushRemainder: boolean) => {
    const webrtc = getWebRTCManager()
    if (!webrtc.isReady()) {
      return false
    }

    const pending = pendingOutboundPcmRef.current
    if (pending.length === 0) {
      return true
    }

    let offset = 0
    while (pending.length - offset >= MAX_WEBRTC_PCM_SAMPLES_PER_CHUNK) {
      const end = offset + MAX_WEBRTC_PCM_SAMPLES_PER_CHUNK
      const chunk = pending.subarray(offset, end)
      if (!webrtc.sendAudio(int16ToArrayBuffer(chunk))) {
        const unsent = pending.subarray(offset)
        pendingOutboundPcmRef.current = cloneInt16Array(unsent)
        return false
      }
      offset = end
    }

    const remaining = pending.subarray(offset)
    pendingOutboundPcmRef.current = cloneInt16Array(remaining)

    if (forceFlushRemainder && pendingOutboundPcmRef.current.length > 0) {
      if (!webrtc.sendAudio(int16ToArrayBuffer(pendingOutboundPcmRef.current))) {
        return false
      }
      pendingOutboundPcmRef.current = new Int16Array(0)
    }

    return true
  }, [])

  const tryDrainOutboundOpusQueue = useCallback(async () => {
    const signaling = getSignalingClient()
    if (signaling.getAudioCodec() !== 'opus') {
      return true
    }

    const webrtc = getWebRTCManager()
    if (!webrtc.isReady()) {
      return false
    }

    const codecConfig = signaling.getAudioCodecConfig() ?? DEFAULT_OPUS_CODEC_CONFIG
    await opusEncoderRef.current.initialize(codecConfig)

    while (pendingOutboundOpusPcmRef.current.length >= OPUS_FRAME_SAMPLES) {
      const queueBeforePop = pendingOutboundOpusPcmRef.current
      const frame = cloneFloat32Array(queueBeforePop.subarray(0, OPUS_FRAME_SAMPLES))
      pendingOutboundOpusPcmRef.current = cloneFloat32Array(queueBeforePop.subarray(OPUS_FRAME_SAMPLES))
      const opusPacket = await opusEncoderRef.current.encodeFrame(frame)
      if (!webrtc.sendAudio(uint8ToArrayBuffer(opusPacket))) {
        pendingOutboundOpusPcmRef.current = concatFloat32Arrays(frame, pendingOutboundOpusPcmRef.current)
        return false
      }
    }

    return true
  }, [])

  const enqueueOpusDrain = useCallback(() => {
    const generationAtEnqueue = opusEncoderGenerationRef.current
    opusDrainChainRef.current = opusDrainChainRef.current
      .then(async () => {
        if (generationAtEnqueue !== opusEncoderGenerationRef.current) {
          return
        }
        const drained = await tryDrainOutboundOpusQueue()
        if (generationAtEnqueue !== opusEncoderGenerationRef.current) {
          return
        }
        if (!drained) {
          pendingOutboundOpusPcmRef.current = new Float32Array(0)
        }
      })
      .catch((error) => {
        if (generationAtEnqueue !== opusEncoderGenerationRef.current) {
          return
        }
        const message = error instanceof Error ? error.message : 'Unknown Opus drain failure'
        if (message.toLowerCase().includes('disposed')) {
          logger.debug('Ignoring expected Opus drain cancellation during teardown')
          return
        }
        logger.warn('Failed to drain Opus outbound queue:', message)
        pendingOutboundOpusPcmRef.current = new Float32Array(0)
      })
  }, [tryDrainOutboundOpusQueue])

  const scheduleOutboundPcmFlush = useCallback(() => {
    if (outboundPcmFlushTimerRef.current !== null) {
      return
    }

    const runFlush = () => {
      outboundPcmFlushTimerRef.current = null

      const flushed = tryDrainOutboundPcmQueue(true)
      if (!flushed) {
        // Keep real-time behavior: do not retain stale backlog if transport is unavailable.
        pendingOutboundPcmRef.current = new Int16Array(0)
        return
      }

      if (pendingOutboundPcmRef.current.length > 0) {
        outboundPcmFlushTimerRef.current = setTimeout(runFlush, OUTBOUND_PCM_MAX_FLUSH_DELAY_MS)
      }
    }

    outboundPcmFlushTimerRef.current = setTimeout(runFlush, OUTBOUND_PCM_MAX_FLUSH_DELAY_MS)
  }, [tryDrainOutboundPcmQueue])

  const scheduleOutboundOpusFlush = useCallback(() => {
    if (outboundOpusFlushTimerRef.current !== null) {
      return
    }

    const runFlush = () => {
      outboundOpusFlushTimerRef.current = null
      enqueueOpusDrain()
      if (pendingOutboundOpusPcmRef.current.length > 0) {
        outboundOpusFlushTimerRef.current = setTimeout(runFlush, OUTBOUND_OPUS_MAX_FLUSH_DELAY_MS)
      }
    }

    outboundOpusFlushTimerRef.current = setTimeout(runFlush, OUTBOUND_OPUS_MAX_FLUSH_DELAY_MS)
  }, [enqueueOpusDrain])

  // Audio data handler for voice activity
  const handleVoiceData = useCallback((float32Data: Float32Array) => {
    if (useAudioStore.getState().isMicMuted) {
      return
    }
    const signaling = getSignalingClient()
    const selectedAudioCodec = signaling.getAudioCodec()
    if (selectedAudioCodec === 'opus') {
      const scaledFrame = cloneFloat32Array(float32Data)
      scaleFloat32InPlace(scaledFrame, inputVolume / 100)
      const merged = concatFloat32Arrays(pendingOutboundOpusPcmRef.current, scaledFrame)
      if (merged.length > MAX_OUTBOUND_OPUS_QUEUE_SAMPLES) {
        // Drop oldest samples to prioritize low-latency real-time audio under pressure.
        pendingOutboundOpusPcmRef.current = cloneFloat32Array(
          merged.subarray(merged.length - MAX_OUTBOUND_OPUS_QUEUE_SAMPLES)
        )
      } else {
        pendingOutboundOpusPcmRef.current = merged
      }
      enqueueOpusDrain()
      if (pendingOutboundOpusPcmRef.current.length > 0) {
        scheduleOutboundOpusFlush()
      } else {
        clearOutboundOpusFlushTimer()
      }
      return
    }

    const int16Data = float32ToInt16(float32Data, inputVolume / 100)
    const transportMode = signaling.getTransportMode()

    const webrtc = getWebRTCManager()
    if (webrtc.isReady()) {
      pendingOutboundPcmRef.current = concatInt16Arrays(pendingOutboundPcmRef.current, int16Data)
      const drained = tryDrainOutboundPcmQueue(false)
      if (drained) {
        if (pendingOutboundPcmRef.current.length > 0) {
          scheduleOutboundPcmFlush()
        } else {
          clearOutboundPcmFlushTimer()
        }
        return
      }

      const unsentPcm = pendingOutboundPcmRef.current
      if (transportMode !== 'webrtc' && signaling.isConnected() && unsentPcm.length > 0) {
        signaling.sendAudioBase64(int16ToBase64(unsentPcm))
        resetOutboundAudioQueues()
        return
      }

      resetOutboundAudioQueues()
      return
    }

    if (pendingOutboundPcmRef.current.length > 0) {
      resetOutboundAudioQueues()
    }

    if (transportMode !== 'webrtc' && signaling.isConnected()) {
      signaling.sendAudioBase64(int16ToBase64(int16Data))
    }
  }, [
    inputVolume,
    clearOutboundOpusFlushTimer,
    clearOutboundPcmFlushTimer,
    enqueueOpusDrain,
    resetOutboundAudioQueues,
    scheduleOutboundOpusFlush,
    scheduleOutboundPcmFlush,
    tryDrainOutboundPcmQueue,
  ])

  // Voice activity
  const voiceEnabled = status === 'connected' && !isMicMuted
  logger.debug('Voice activity enabled:', voiceEnabled, '(status:', status, ', isMicMuted:', isMicMuted, ')')
  
  const { isInitialized: isVoiceInitialized, stopListening } = useVoiceActivity({
    enabled: voiceEnabled,
    onAudioData: handleVoiceData,
  })

  const connectWebRTCIfAllowed = useCallback(async (signaling = getSignalingClient()) => {
    const mode = signaling.getTransportMode()
    if (mode === 'websocket' || signaling.isPendingSession()) {
      return
    }

    const webrtc = getWebRTCManager()
    const webrtcState = webrtc.getState()
    if (
      webrtc.isReady() ||
      webrtcState.connectionState === 'connecting' ||
      webrtcState.connectionState === 'connected'
    ) {
      return
    }

    webrtc.setIceServers(signaling.getStunServers())
    try {
      await webrtc.connect()
    } catch (webrtcError) {
      if (mode === 'webrtc') {
        throw webrtcError
      }
      logger.warn('WebRTC unavailable, using WebSocket fallback audio')
    }
  }, [])

  const resolveUserIdFromEvent = useCallback((payload: Record<string, unknown>): string | null => {
    const candidate = [payload.playerId, payload.userId, payload.clientId, payload.id]
      .find((value): value is string => typeof value === 'string' && value.length > 0)
    if (candidate) {
      return candidate
    }

    const username = typeof payload.username === 'string' ? payload.username : null
    if (!username) {
      return null
    }

    const users = useUserStore.getState().users
    for (const user of users.values()) {
      if (user.name === username) {
        return user.id
      }
    }

    return null
  }, [])

  const toPlayerPosition = useCallback((value: unknown): PlayerPosition | null => {
    if (!value || typeof value !== 'object') {
      return null
    }
    const raw = value as Record<string, unknown>
    const x = Number(raw.x)
    const y = Number(raw.y)
    const z = Number(raw.z)
    const yaw = Number(raw.yaw ?? 0)
    const pitch = Number(raw.pitch ?? 0)
    const worldId = typeof raw.worldId === 'string' ? raw.worldId : 'overworld'
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return null
    }
    return { x, y, z, yaw, pitch, worldId }
  }, [])

  // Setup signaling event listeners
  const setupSignalingListeners = useCallback(() => {
    const signaling = getSignalingClient()

    signaling.on('authenticated', (data) => {
      const {
        clientId,
        username,
        pending,
        useProximityRadar,
        audioCodec,
        audioCodecConfig,
      } = data as {
        clientId: string
        username: string
        pending?: boolean
        useProximityRadar?: boolean
        audioCodec?: string
        audioCodecConfig?: AudioCodecConfig
      }
      setAuthenticated(clientId, username, !!pending)
      setLocalUserId(clientId)
      setProximityRadarEnabled(!!useProximityRadar)

      if (audioCodec && audioCodec !== 'opus') {
        setError('Server selected unsupported audio codec. This client requires Opus.')
        signaling.disconnect()
        return
      }

      if (audioCodec === 'opus') {
        void opusEncoderRef.current.initialize(audioCodecConfig ?? DEFAULT_OPUS_CODEC_CONFIG).catch((error) => {
          const message = error instanceof Error ? error.message : 'Failed to initialize Opus encoder'
          setError(message)
        })
      }

      if (pending) {
        return
      }

      signaling.listGroups()
      signaling.listPlayers()
    })

    signaling.on('pending_game_session', () => {
      setStatus('connecting')
    })

    signaling.on('hello', (data) => {
      const payload = (data && typeof data === 'object')
        ? (data as Record<string, unknown>)
        : {}
      if (typeof payload.useProximityRadar === 'boolean') {
        setProximityRadarEnabled(payload.useProximityRadar)
      }
      if (payload.audioCodec === 'opus') {
        const config = payload.audioCodecConfig && typeof payload.audioCodecConfig === 'object'
          ? (payload.audioCodecConfig as AudioCodecConfig)
          : DEFAULT_OPUS_CODEC_CONFIG
        void opusEncoderRef.current.initialize(config).catch((error) => {
          const message = error instanceof Error ? error.message : 'Failed to initialize Opus encoder'
          setError(message)
        })
      }
    })

    signaling.on('game_session_ready', () => {
      setStatus('connected')
      signaling.listGroups()
      signaling.listPlayers()
      void connectWebRTCIfAllowed(signaling).catch((error) => {
        const message = error instanceof Error ? error.message : 'WebRTC connection failed'
        setError(message)
      })
    })

    signaling.on('disconnected', () => {
      setStatus('disconnected')
    })

    signaling.on('connection_error', () => {
      setError('Connection failed')
    })

    signaling.on('error', (data) => {
      const { message, code } = data as { message?: string; code?: string }
      if (code === 'resume_failed') {
        return
      }
      if (message) {
        setError(message)
      }
    })

    signaling.on('latency', (data) => {
      const { latency } = data as { latency: number }
      setLatency(latency)
    })

    signaling.on('group_list', (data) => {
      const rawGroups = (data as { groups?: unknown[] }).groups ?? []
      // Get current state to preserve locally created groups and member data
      const { groups: existingGroups, currentGroupId } = useGroupStore.getState()
      const localUserId = useUserStore.getState().localUserId
      const existingGroupsMap = new Map(existingGroups.map(g => [g.id, g]))

      // Normalize groups to ensure they have all required fields
      const serverGroups: Group[] = rawGroups.map((groupEntry) => {
        const g = (groupEntry && typeof groupEntry === 'object')
          ? (groupEntry as Record<string, unknown>)
          : {}
        const groupSettings = (g.settings && typeof g.settings === 'object')
          ? (g.settings as Record<string, unknown>)
          : {}
        const groupId = String(g.id || g.groupId || '')
        const existingGroup = existingGroupsMap.get(groupId)
        
        // Parse members from server
        const seenIds = new Set<string>()
        const rawMembers = Array.isArray(g.members) ? g.members : []
        const serverMembers: GroupMember[] = rawMembers
          .map((memberEntry) => {
            const member = (memberEntry && typeof memberEntry === 'object')
              ? (memberEntry as Record<string, unknown>)
              : {}
            return ({
              id: String(member.id || member.playerId || ''),
              name: String(member.name || member.username || member.playerName || 'Unknown'),
              isSpeaking: !!member.isSpeaking,
              isMicMuted: !!member.isMicMuted || !!member.isMuted,
              isVoiceConnected: member.isVoiceConnected !== false
            })
          })
          .filter((member) => {
            if (seenIds.has(member.id)) return false
            seenIds.add(member.id)
            return true
          })
        
        // Preserve existing members only as a fallback for the local user's active group.
        const shouldPreserveLocalMembers = (
          serverMembers.length === 0 &&
          !!existingGroup &&
          groupId === currentGroupId &&
          !!localUserId &&
          existingGroup.members.some((member) => member.id === localUserId)
        )
        const members = serverMembers.length > 0
          ? serverMembers
          : (shouldPreserveLocalMembers ? (existingGroup?.members ?? []) : [])
        
        const normalizedMemberCount = shouldPreserveLocalMembers
          ? members.length
          : Number(g.memberCount ?? members.length ?? 0)

        return {
          id: groupId,
          name: String(g.name || g.groupName || 'Unknown'),
          memberCount: Number.isFinite(normalizedMemberCount) ? normalizedMemberCount : members.length,
          members,
          settings: {
            defaultVolume: Number(groupSettings.defaultVolume ?? 100),
            proximityRange: Number(groupSettings.proximityRange ?? 30),
            allowInvites: Boolean(groupSettings.allowInvites ?? true),
            maxMembers: Number(groupSettings.maxMembers ?? g.maxMembers ?? 50),
            isPrivate: Boolean(groupSettings.isPrivate ?? g.isPrivate ?? false),
            isIsolated: Boolean(groupSettings.isIsolated ?? g.isIsolated ?? true),
          }
        }
      })

      const serverGroupIds = new Set(serverGroups.map(g => g.id))

      // If we're in a group but server list doesn't have it, preserve it from local state
      // This handles race conditions where server sends outdated group_list
      let finalGroups = serverGroups
      if (currentGroupId && !serverGroupIds.has(currentGroupId)) {
        const currentLocalGroup = existingGroups.find(g => g.id === currentGroupId)
        if (currentLocalGroup) {
          finalGroups = [...serverGroups, currentLocalGroup]
        }
      }

      setGroups(finalGroups)

      // Check if local user is still in the current group (handles in-game leave)
      if (currentGroupId && localUserId) {
        const currentGroup = finalGroups.find(g => g.id === currentGroupId)
        // Only clear if we have fresh member data from server
        if (currentGroup && currentGroup.members.length > 0) {
          const stillInGroup = currentGroup.members.some(m => m.id === localUserId)
          if (!stillInGroup) {
            logger.debug('group_list: User no longer in group, clearing currentGroupId')
            setCurrentGroupId(null)
          }
        }
      }
    })

    signaling.on('group_created', (data) => {
      const payload = data as {
        groupId: string
        groupName: string
        creatorClientId?: string
        memberCount?: number
        membersCount?: number
        isIsolated?: boolean
      }
      const groupId = payload.groupId
      const groupName = payload.groupName
      if (!groupId || !groupName) {
        return
      }

      // Get local user info to add as member
      const localUserId = useUserStore.getState().localUserId
      const localUser = localUserId ? useUserStore.getState().users.get(localUserId) : null
      const creatorClientId = typeof payload.creatorClientId === 'string' ? payload.creatorClientId : ''
      const pendingCreateAt = pendingCreateGroupRef.current
      const hasRecentPendingCreate = pendingCreateAt !== null && (Date.now() - pendingCreateAt) <= PENDING_CREATE_GROUP_WINDOW_MS
      const isCreator = !!localUserId && (
        creatorClientId === localUserId ||
        (!creatorClientId && hasRecentPendingCreate)
      )

      if (creatorClientId || hasRecentPendingCreate) {
        pendingCreateGroupRef.current = null
      }

      const rawMemberCount = Number(payload.memberCount ?? payload.membersCount ?? (isCreator ? 1 : 0))
      const members = isCreator && localUser
        ? [{
            id: localUser.id,
            name: localUser.name,
            isSpeaking: false,
            isMicMuted: localUser.isMicMuted,
            isVoiceConnected: true,
          }]
        : []
      const memberCount = Number.isFinite(rawMemberCount)
        ? Math.max(rawMemberCount, members.length)
        : members.length
      
      addGroup({
        id: groupId,
        name: groupName,
        memberCount,
        members,
        settings: {
          defaultVolume: 100,
          proximityRange: 30,
          allowInvites: true,
          maxMembers: 50,
          isPrivate: false,
          isIsolated: payload.isIsolated !== false,
        },
      })
      if (isCreator) {
        setCurrentGroupId(groupId)
      }
    })

    signaling.on('group_joined', (data) => {
      const { groupId } = data as { groupId: string }
      pendingCreateGroupRef.current = null
      setCurrentGroupId(groupId)
    })

    signaling.on('group_left', (data) => {
      // Clear current group
      const payload = data as { groupId?: string, memberCount?: number }
      setCurrentGroupId(null)
      
      // If the group is now empty, remove it from the list
      if (payload.groupId && payload.memberCount === 0) {
        removeGroup(payload.groupId)
      } else if (payload.groupId && typeof payload.memberCount === 'number') {
        // Update the member count and remove ourselves from members
        const localUserId = useUserStore.getState().localUserId
        const group = useGroupStore.getState().groups.find(g => g.id === payload.groupId)
        if (group) {
          const updatedMembers = group.members.filter(m => m.id !== localUserId)
          setGroupMembers(payload.groupId, updatedMembers)
        }
      }
    })

    signaling.on('group_members_updated', (data) => {
      const payload = data as { groupId?: string; members?: unknown[] }
      const groupId = String(payload.groupId ?? '')
      const rawMembers = payload.members ?? []
      logger.debug('group_members_updated:', { groupId, rawMembersCount: rawMembers?.length })
      
      // Normalize and deduplicate members
      const seenIds = new Set<string>()
      const members: GroupMember[] = rawMembers
        .map((memberEntry) => {
          const member = (memberEntry && typeof memberEntry === 'object')
            ? (memberEntry as Record<string, unknown>)
            : {}
          return ({
            id: String(member.id || member.playerId || ''),
            name: String(member.name || member.username || member.playerName || 'Unknown'),
            isSpeaking: !!member.isSpeaking,
            isMicMuted: !!member.isMicMuted || !!member.isMuted,
            isVoiceConnected: member.isVoiceConnected !== false
          })
        })
        .filter((member) => {
          if (seenIds.has(member.id)) return false
          seenIds.add(member.id)
          return true
        })
      
      setGroupMembers(groupId, members)
      
      // Check if local user is no longer in the group (was removed/left in-game)
      const localUserId = useUserStore.getState().localUserId
      const { currentGroupId } = useGroupStore.getState()
      logger.debug('group_members_updated check:', { 
        localUserId, 
        currentGroupId, 
        groupId,
        memberIds: members.map(m => m.id),
        stillInGroup: members.some(m => m.id === localUserId)
      })
      if (currentGroupId === groupId && localUserId) {
        const stillInGroup = members.some(m => m.id === localUserId)
        if (!stillInGroup) {
          logger.debug('User no longer in group, clearing currentGroupId')
          // User was removed from group (e.g., left in-game)
          setCurrentGroupId(null)
        }
      }
    })

    signaling.on('player_list', (data) => {
      const rawPlayers = (data as { players?: unknown[] }).players ?? []
      // Normalize players to ensure they have all required fields
      const players: User[] = rawPlayers.map((playerEntry) => {
        const player = (playerEntry && typeof playerEntry === 'object')
          ? (playerEntry as Record<string, unknown>)
          : {}
        return ({
          id: String(player.id || player.playerId || ''),
          name: String(player.username || player.name || player.playerName || 'Unknown'),
          avatarUrl: typeof player.avatarUrl === 'string' ? player.avatarUrl : undefined,
          isSpeaking: !!player.isSpeaking,
          isMuted: !!player.isMuted,
          isMicMuted: !!player.isMicMuted || !!player.isMuted,
          volume: typeof player.volume === 'number' ? player.volume : 100,
          groupId: typeof player.groupId === 'string' ? player.groupId : undefined,
          position: player.position as PlayerPosition | undefined,
          isVoiceConnected: player.isVoiceConnected !== false
        })
      })
      setUsers(players)
    })

    signaling.on('user_speaking_status', (data) => {
      const payload = (data && typeof data === 'object')
        ? (data as Record<string, unknown>)
        : {}
      const userId = resolveUserIdFromEvent(payload)
      if (!userId) {
        return
      }

      const speaking = !!payload.isSpeaking
      setUserSpeaking(userId, speaking)

      const activeGroupId = useGroupStore.getState().currentGroupId
      if (activeGroupId) {
        updateMemberSpeaking(activeGroupId, userId, speaking)
      }
    })

    signaling.on('user_mute_status', (data) => {
      const payload = (data && typeof data === 'object')
        ? (data as Record<string, unknown>)
        : {}
      const userId = resolveUserIdFromEvent(payload)
      if (!userId) {
        return
      }

      const muted = !!payload.isMuted
      setUserMicMuted(userId, muted)

      const activeGroupId = useGroupStore.getState().currentGroupId
      if (activeGroupId) {
        updateMemberMuted(activeGroupId, userId, muted)
      }

      if (userId === useUserStore.getState().localUserId) {
        setMicMuted(muted)
      }
    })

    signaling.on('set_mic_mute', (data) => {
      const payload = (data && typeof data === 'object')
        ? (data as Record<string, unknown>)
        : {}
      const muted = !!payload.isMuted
      setMicMuted(muted)

      const localUserId = useUserStore.getState().localUserId
      if (!localUserId) {
        return
      }

      setUserMicMuted(localUserId, muted)
      const activeGroupId = useGroupStore.getState().currentGroupId
      if (activeGroupId) {
        updateMemberMuted(activeGroupId, localUserId, muted)
      }
    })

    signaling.on('position_update', (data) => {
      const payload = (data && typeof data === 'object')
        ? (data as Record<string, unknown>)
        : {}

      // New format: { positions: [...], listener: {...}, timestamp }
      const positions = Array.isArray(payload.positions) ? payload.positions : null
      if (positions) {
        positions.forEach((entry) => {
          if (!entry || typeof entry !== 'object') {
            return
          }
          const row = entry as Record<string, unknown>
          const userId = resolveUserIdFromEvent(row)
          const position = toPlayerPosition(row)
          if (!userId || !position) {
            return
          }
          setUserPosition(userId, position)
        })
      }

      // Listener payload (local user position)
      const listener = toPlayerPosition(payload.listener)
      if (listener) {
        const localUserId = useUserStore.getState().localUserId
        if (localUserId) {
          setUserPosition(localUserId, listener)
        }
      }

      // Legacy format fallback: { userId, position }
      const userId = resolveUserIdFromEvent(payload)
      const legacyPosition = toPlayerPosition(payload.position)
      if (userId && legacyPosition) {
        setUserPosition(userId, legacyPosition)
      }
    })

    signaling.on('audio', (data) => {
      const { senderId, audioData, distance, maxRange } = data as {
        senderId?: string
        audioData?: string
        distance?: number
        maxRange?: number
      }
      if (!senderId || !audioData) {
        return
      }
      void handleWebSocketAudio(senderId, audioData, distance, maxRange)
    })
  }, [
    setAuthenticated, setLocalUserId, setStatus, setError, setLatency,
    setGroups, addGroup, removeGroup, setCurrentGroupId, setGroupMembers,
    setUsers, setUserSpeaking, setUserMicMuted, setUserPosition,
    updateMemberSpeaking, updateMemberMuted, setMicMuted, resolveUserIdFromEvent,
    handleWebSocketAudio, connectWebRTCIfAllowed, setProximityRadarEnabled,
    toPlayerPosition,
  ])

  // Setup WebRTC event listeners
  const setupWebRTCListeners = useCallback(() => {
    const webrtc = getWebRTCManager()
    
    webrtc.setOnAudioData((data) => {
      handleAudioData(data)
    })
  }, [handleAudioData])

  /**
   * Connect to server
   */
  const connect = useCallback(async (serverUrl: string, username: string, authCode: string = '') => {
    if (isConnectingRef.current) return
    isConnectingRef.current = true

    try {
      setStatus('connecting')
      setServerUrl(serverUrl)

      const opusSupported = await OpusCodecManager.isSupported(DEFAULT_OPUS_CODEC_CONFIG)
      if (!opusSupported) {
        throw new Error('This browser does not support required Opus WebCodecs + Dedicated Worker audio.')
      }

      // Initialize audio playback
      await initializePlayback()

      // Setup listeners
      setupSignalingListeners()
      setupWebRTCListeners()

      // Connect signaling
      const signaling = getSignalingClient()
      await signaling.connect(serverUrl, username, authCode)

      // Save server with credentials
      addSavedServer(serverUrl, undefined, username, authCode || undefined)
      setLastServerUrl(serverUrl)

      // Connect WebRTC when transport mode and server state allow it.
      await connectWebRTCIfAllowed(signaling)

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed'
      resetOutboundAudioQueues()
      resetOpusEncoder()
      setServerUrl('')
      setError(message)
      resetSignalingClient()
      resetWebRTCManager()
    } finally {
      isConnectingRef.current = false
    }
  }, [
    setStatus, setError, setServerUrl, initializePlayback,
    setupSignalingListeners, setupWebRTCListeners,
    addSavedServer, setLastServerUrl, connectWebRTCIfAllowed, resetOutboundAudioQueues, resetOpusEncoder,
  ])

  /**
   * Disconnect from server
   */
  const disconnect = useCallback(() => {
    resetOutboundAudioQueues()
    resetOpusEncoder()
    stopListening()
    resetSignalingClient()
    resetWebRTCManager()
    pendingCreateGroupRef.current = null
    setProximityRadarEnabled(false)
    resetConnection()
    resetGroups()
    resetUsers()
  }, [stopListening, setProximityRadarEnabled, resetConnection, resetGroups, resetUsers, resetOutboundAudioQueues, resetOpusEncoder])

  /**
   * Create a new group
   */
  const createGroup = useCallback((name: string, options: { maxMembers?: number; isIsolated?: boolean } = {}) => {
    const signaling = getSignalingClient()
    if (signaling.isConnected()) {
      pendingCreateGroupRef.current = Date.now()
      signaling.createGroup(name, {
        maxMembers: options.maxMembers ?? 50,
        isIsolated: options.isIsolated ?? true,
      })
    }
  }, [])

  /**
   * Join a group
   */
  const joinGroup = useCallback((groupId: string) => {
    const signaling = getSignalingClient()
    if (signaling.isConnected()) {
      signaling.joinGroup(groupId)
    }
  }, [])

  /**
   * Leave current group
   */
  const leaveGroup = useCallback(() => {
    const signaling = getSignalingClient()
    if (signaling.isConnected()) {
      signaling.leaveGroup()
    }
  }, [])

  useEffect(() => {
    if (status !== 'connected') {
      resetOutboundAudioQueues()
    }
  }, [status, resetOutboundAudioQueues])

  useEffect(() => {
    return () => {
      resetOutboundAudioQueues()
      resetOpusEncoder()
    }
  }, [resetOutboundAudioQueues, resetOpusEncoder])

  // Sync mic mute status to server
  useEffect(() => {
    const signaling = getSignalingClient()
    if (signaling.isConnected()) {
      signaling.updateMuteStatus(isMicMuted)
    }
  }, [isMicMuted])

  // Sync speaking status to server.
  useEffect(() => {
    const signaling = getSignalingClient()
    if (!signaling.isConnected()) {
      return
    }

    const shouldSpeak = status === 'connected' && !isMicMuted && isSpeaking
    if (lastSentSpeakingRef.current === shouldSpeak) {
      return
    }
    lastSentSpeakingRef.current = shouldSpeak
    signaling.updateSpeakingStatus(shouldSpeak)
  }, [status, isMicMuted, isSpeaking])

  return {
    // State
    status,
    clientId,
    isVoiceInitialized,
    
    // Actions
    connect,
    disconnect,
    createGroup,
    joinGroup,
    leaveGroup,
  }
}
