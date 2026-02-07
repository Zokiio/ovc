import { useCallback, useEffect, useRef } from 'react'
import { getSignalingClient, resetSignalingClient } from '../lib/signaling'
import { getWebRTCManager, resetWebRTCManager } from '../lib/webrtc/connection-manager'
import { float32ToInt16, int16ToBase64 } from '../lib/webrtc/audio-channel'
import { useConnectionStore } from '../stores/connectionStore'
import { useGroupStore } from '../stores/groupStore'
import { useUserStore } from '../stores/userStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useAudioStore } from '../stores/audioStore'
import { useVoiceActivity } from './useVoiceActivity'
import { useAudioPlayback } from './useAudioPlayback'
import type { Group, GroupMember, User, PlayerPosition } from '../lib/types'

// Keep outbound PCM chunks comfortably below the server's DataChannel payload cap (900 bytes).
const MAX_WEBRTC_PCM_SAMPLES_PER_CHUNK = 384 // 768 bytes

/**
 * Main connection hook that orchestrates signaling, WebRTC, and audio.
 */
export function useConnection() {
  const isConnectingRef = useRef(false)
  const lastSentSpeakingRef = useRef<boolean | null>(null)
  
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
  const currentGroupId = useGroupStore((s) => s.currentGroupId)
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
  const isSpeaking = useAudioStore((s) => s.isSpeaking)
  const inputVolume = useAudioStore((s) => s.settings.inputVolume)

  // Audio playback
  const { handleAudioData, handleWebSocketAudio, initialize: initializePlayback } = useAudioPlayback()

  // Audio data handler for voice activity
  const handleVoiceData = useCallback((float32Data: Float32Array) => {
    const int16Data = float32ToInt16(float32Data, inputVolume / 100)
    const signaling = getSignalingClient()
    const transportMode = signaling.getTransportMode()

    const webrtc = getWebRTCManager()
    if (webrtc.isReady()) {
      let allChunksSent = true
      for (let offset = 0; offset < int16Data.length; offset += MAX_WEBRTC_PCM_SAMPLES_PER_CHUNK) {
        const end = Math.min(offset + MAX_WEBRTC_PCM_SAMPLES_PER_CHUNK, int16Data.length)
        const chunk = int16Data.subarray(offset, end)
        const pcmBuffer = new ArrayBuffer(chunk.byteLength)
        new Uint8Array(pcmBuffer).set(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength))

        if (!webrtc.sendAudio(pcmBuffer)) {
          allChunksSent = false
          break
        }
      }

      if (allChunksSent) {
        return
      }
    }

    if (transportMode !== 'webrtc' && signaling.isConnected()) {
      signaling.sendAudioBase64(int16ToBase64(int16Data))
    }
  }, [inputVolume])

  // Voice activity
  const voiceEnabled = status === 'connected' && !isMicMuted
  console.debug('[useConnection] Voice activity enabled:', voiceEnabled, '(status:', status, ', isMicMuted:', isMicMuted, ')')
  
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
      console.warn('[useConnection] WebRTC unavailable, using WebSocket fallback audio')
    }
  }, [])

  // Setup signaling event listeners
  const setupSignalingListeners = useCallback(() => {
    const signaling = getSignalingClient()

    signaling.on('authenticated', (data) => {
      const { clientId, username, pending } = data as { clientId: string; username: string; pending?: boolean }
      setAuthenticated(clientId, username, !!pending)
      setLocalUserId(clientId)

      if (pending) {
        return
      }

      signaling.listGroups()
      signaling.listPlayers()
    })

    signaling.on('pending_game_session', () => {
      setStatus('connecting')
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
        
        // If server has no members but we have existing members, preserve them
        const members = serverMembers.length > 0 ? serverMembers : (existingGroup?.members ?? [])
        
        return {
          id: groupId,
          name: String(g.name || g.groupName || 'Unknown'),
          memberCount: Number(g.memberCount ?? members.length ?? 0),
          members,
          settings: {
            defaultVolume: Number(groupSettings.defaultVolume ?? 100),
            proximityRange: Number(groupSettings.proximityRange ?? 30),
            allowInvites: Boolean(groupSettings.allowInvites ?? true),
            maxMembers: Number(groupSettings.maxMembers ?? g.maxMembers ?? 50),
            isPrivate: Boolean(groupSettings.isPrivate ?? g.isPrivate ?? false)
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
      const localUserId = useUserStore.getState().localUserId
      if (currentGroupId && localUserId) {
        const currentGroup = finalGroups.find(g => g.id === currentGroupId)
        // Only clear if we have fresh member data from server
        if (currentGroup && currentGroup.members.length > 0) {
          const stillInGroup = currentGroup.members.some(m => m.id === localUserId)
          if (!stillInGroup) {
            console.debug('[useConnection] group_list: User no longer in group, clearing currentGroupId')
            setCurrentGroupId(null)
          }
        }
      }
    })

    signaling.on('group_created', (data) => {
      const { groupId, groupName } = data as { groupId: string; groupName: string }
      // Get local user info to add as member
      const localUserId = useUserStore.getState().localUserId
      const localUser = localUserId ? useUserStore.getState().users.get(localUserId) : null
      
      addGroup({
        id: groupId,
        name: groupName,
        memberCount: 1,
        members: localUser ? [{
          id: localUser.id,
          name: localUser.name,
          isSpeaking: false,
          isMicMuted: localUser.isMicMuted,
          isVoiceConnected: true
        }] : [],
        settings: { defaultVolume: 100, proximityRange: 30, allowInvites: true, maxMembers: 50, isPrivate: false },
      })
      setCurrentGroupId(groupId)
    })

    signaling.on('group_joined', (data) => {
      const { groupId } = data as { groupId: string }
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
      console.debug('[useConnection] group_members_updated:', { groupId, rawMembersCount: rawMembers?.length })
      
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
      console.debug('[useConnection] group_members_updated check:', { 
        localUserId, 
        currentGroupId, 
        groupId,
        memberIds: members.map(m => m.id),
        stillInGroup: members.some(m => m.id === localUserId)
      })
      if (currentGroupId === groupId && localUserId) {
        const stillInGroup = members.some(m => m.id === localUserId)
        if (!stillInGroup) {
          console.debug('[useConnection] User no longer in group, clearing currentGroupId')
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
      const { playerId, isSpeaking } = data as { playerId: string; isSpeaking: boolean }
      setUserSpeaking(playerId, isSpeaking)
      if (currentGroupId) {
        updateMemberSpeaking(currentGroupId, playerId, isSpeaking)
      }
    })

    signaling.on('user_mute_status', (data) => {
      const { playerId, isMuted } = data as { playerId: string; isMuted: boolean }
      setUserMicMuted(playerId, isMuted)
    })

    signaling.on('position_update', (data) => {
      const { playerId, position } = data as { playerId: string; position: PlayerPosition }
      setUserPosition(playerId, position)
    })

    signaling.on('audio', (data) => {
      const { senderId, audioData } = data as { senderId?: string; audioData?: string }
      if (!senderId || !audioData) {
        return
      }
      void handleWebSocketAudio(senderId, audioData)
    })
  }, [
    setAuthenticated, setLocalUserId, setStatus, setError, setLatency,
    setGroups, addGroup, removeGroup, setCurrentGroupId, setGroupMembers,
    setUsers, setUserSpeaking, setUserMicMuted, setUserPosition,
    currentGroupId, updateMemberSpeaking, handleWebSocketAudio, connectWebRTCIfAllowed,
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
    addSavedServer, setLastServerUrl, connectWebRTCIfAllowed,
  ])

  /**
   * Disconnect from server
   */
  const disconnect = useCallback(() => {
    stopListening()
    resetSignalingClient()
    resetWebRTCManager()
    resetConnection()
    resetGroups()
    resetUsers()
  }, [stopListening, resetConnection, resetGroups, resetUsers])

  /**
   * Create a new group
   */
  const createGroup = useCallback((name: string, maxMembers: number = 50) => {
    const signaling = getSignalingClient()
    if (signaling.isConnected()) {
      signaling.createGroup(name, { maxMembers })
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
