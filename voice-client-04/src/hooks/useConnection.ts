import { useCallback, useEffect, useRef } from 'react'
import { getSignalingClient, resetSignalingClient } from '../lib/signaling'
import { getWebRTCManager, resetWebRTCManager } from '../lib/webrtc/connection-manager'
import { encodeAudioPayload, float32ToInt16 } from '../lib/webrtc/audio-channel'
import { useConnectionStore } from '../stores/connectionStore'
import { useGroupStore } from '../stores/groupStore'
import { useUserStore } from '../stores/userStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useAudioStore } from '../stores/audioStore'
import { useVoiceActivity } from './useVoiceActivity'
import { useAudioPlayback } from './useAudioPlayback'
import type { Group, GroupMember, User, PlayerPosition } from '../lib/types'

/**
 * Main connection hook that orchestrates signaling, WebRTC, and audio.
 */
export function useConnection() {
  const isConnectingRef = useRef(false)
  
  // Connection store
  const status = useConnectionStore((s) => s.status)
  const clientId = useConnectionStore((s) => s.clientId)
  const setStatus = useConnectionStore((s) => s.setStatus)
  const setAuthenticated = useConnectionStore((s) => s.setAuthenticated)
  const setLatency = useConnectionStore((s) => s.setLatency)
  const setError = useConnectionStore((s) => s.setError)
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
  const inputVolume = useAudioStore((s) => s.settings.inputVolume)

  // Audio playback
  const { handleAudioData, initialize: initializePlayback } = useAudioPlayback()

  // Audio data handler for voice activity
  const handleVoiceData = useCallback((float32Data: Float32Array) => {
    if (!clientId) return
    
    const int16Data = float32ToInt16(float32Data, inputVolume / 100)
    const payload = encodeAudioPayload(clientId, int16Data)
    
    const webrtc = getWebRTCManager()
    if (webrtc.isReady()) {
      webrtc.sendAudio(payload)
    }
  }, [clientId, inputVolume])

  // Voice activity
  const { isInitialized: isVoiceInitialized, stopListening } = useVoiceActivity({
    enabled: status === 'connected' && !isMicMuted,
    onAudioData: handleVoiceData,
  })

  // Setup signaling event listeners
  const setupSignalingListeners = useCallback(() => {
    const signaling = getSignalingClient()

    signaling.on('authenticated', (data) => {
      const { clientId, username } = data as { clientId: string; username: string }
      setAuthenticated(clientId, username)
      setLocalUserId(clientId)
      
      // Request initial data
      signaling.listGroups()
      signaling.listPlayers()
    })

    signaling.on('disconnected', () => {
      setStatus('disconnected')
    })

    signaling.on('connection_error', () => {
      setError('Connection failed')
    })

    signaling.on('latency', (data) => {
      const { latency } = data as { latency: number }
      setLatency(latency)
    })

    signaling.on('group_list', (data) => {
      const rawGroups = (data as { groups: any[] }).groups || []
      // Get current state to preserve locally created groups and member data
      const { groups: existingGroups, currentGroupId } = useGroupStore.getState()
      const existingGroupsMap = new Map(existingGroups.map(g => [g.id, g]))

      // Normalize groups to ensure they have all required fields
      const serverGroups: Group[] = rawGroups.map(g => {
        const groupId = String(g.id || g.groupId || '')
        const existingGroup = existingGroupsMap.get(groupId)
        
        // Parse members from server
        const seenIds = new Set<string>()
        const serverMembers = (g.members || [])
          .map((m: any) => ({
            id: String(m.id || m.playerId || ''),
            name: String(m.name || m.username || m.playerName || 'Unknown'),
            isSpeaking: !!m.isSpeaking,
            isMicMuted: !!m.isMicMuted || !!m.isMuted,
            isVoiceConnected: m.isVoiceConnected !== false
          }))
          .filter((m: any) => {
            if (seenIds.has(m.id)) return false
            seenIds.add(m.id)
            return true
          })
        
        // If server has no members but we have existing members, preserve them
        const members = serverMembers.length > 0 ? serverMembers : (existingGroup?.members ?? [])
        
        return {
          id: groupId,
          name: String(g.name || g.groupName || 'Unknown'),
          memberCount: g.memberCount || members.length || 0,
          members,
          settings: {
            defaultVolume: g.settings?.defaultVolume ?? 100,
            proximityRange: g.settings?.proximityRange ?? 30,
            allowInvites: g.settings?.allowInvites ?? true,
            maxMembers: g.settings?.maxMembers ?? g.maxMembers ?? 50,
            isPrivate: g.settings?.isPrivate ?? g.isPrivate ?? false
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
      const { groupId, members: rawMembers } = data as { groupId: string; members: any[] }
      console.debug('[useConnection] group_members_updated:', { groupId, rawMembersCount: rawMembers?.length })
      
      // Normalize and deduplicate members
      const seenIds = new Set<string>()
      const members: GroupMember[] = (rawMembers || [])
        .map((m: any) => ({
          id: String(m.id || m.playerId || ''),
          name: String(m.name || m.username || m.playerName || 'Unknown'),
          isSpeaking: !!m.isSpeaking,
          isMicMuted: !!m.isMicMuted || !!m.isMuted,
          isVoiceConnected: m.isVoiceConnected !== false
        }))
        .filter((m: GroupMember) => {
          if (seenIds.has(m.id)) return false
          seenIds.add(m.id)
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
      const rawPlayers = (data as { players: any[] }).players || []
      // Normalize players to ensure they have all required fields
      const players: User[] = rawPlayers.map(p => ({
        id: String(p.id || p.playerId || ''),
        name: String(p.name || p.playerName || 'Unknown'),
        avatarUrl: p.avatarUrl,
        isSpeaking: !!p.isSpeaking,
        isMuted: !!p.isMuted,
        isMicMuted: !!p.isMicMuted || !!p.isMuted,
        volume: p.volume ?? 100,
        groupId: p.groupId,
        position: p.position,
        isVoiceConnected: p.isVoiceConnected !== false
      }))
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
  }, [
    setAuthenticated, setLocalUserId, setStatus, setError, setLatency,
    setGroups, addGroup, removeGroup, setCurrentGroupId, setGroupMembers,
    setUsers, setUserSpeaking, setUserMicMuted, setUserPosition,
    currentGroupId, updateMemberSpeaking,
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

      // Connect WebRTC (after signaling is ready)
      const webrtc = getWebRTCManager()
      await webrtc.connect()

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed'
      setError(message)
      resetSignalingClient()
      resetWebRTCManager()
    } finally {
      isConnectingRef.current = false
    }
  }, [
    setStatus, setError, initializePlayback,
    setupSignalingListeners, setupWebRTCListeners,
    addSavedServer, setLastServerUrl,
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
