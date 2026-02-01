import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Toaster } from '@/components/ui/sonner'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { MagnifyingGlassIcon, PlusIcon, UsersIcon, SignOutIcon, UserListIcon, StackIcon, WaveformIcon } from '@phosphor-icons/react'
import { User, Group, GroupSettings, AudioSettings, ConnectionState, PlayerPosition } from '@/lib/types'
import { UserCard } from '@/components/UserCard'
import { GroupCard } from '@/components/GroupCard'
import { CreateGroupDialog } from '@/components/CreateGroupDialog'
import { GroupSettingsDialog } from '@/components/GroupSettingsDialog'
import { ConnectionView } from '@/components/ConnectionView'
import { toast } from 'sonner'
import { useIsMobile } from '@/hooks/use-mobile'
import { useAudioTransmission } from '@/hooks/use-audio-transmission'
import { getSignalingClient } from '@/lib/signaling'
import { getAudioPlaybackManager } from '@/lib/audio-playback'
import icon from '@/assets/images/icon.png'

const AUDIO_SETTINGS_STORAGE_KEY = 'ovc_audio_settings'
const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  inputDevice: 'default',
  outputDevice: 'default',
  inputVolume: 80,
  outputVolume: 80,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true
}

function loadAudioSettings(): AudioSettings {
  try {
    const stored = localStorage.getItem(AUDIO_SETTINGS_STORAGE_KEY)
    if (!stored) {
      return DEFAULT_AUDIO_SETTINGS
    }
    const parsed = JSON.parse(stored) as Partial<AudioSettings>
    return { ...DEFAULT_AUDIO_SETTINGS, ...parsed }
  } catch {
    return DEFAULT_AUDIO_SETTINGS
  }
}

function App() {
  const isMobile = useIsMobile()
  const signalingClient = useRef(getSignalingClient())
  const audioPlayback = useRef(getAudioPlaybackManager())
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const eventListenersSetUpRef = useRef(false)
  const outputWarningRef = useRef<string | null>(null)
  
  // Use Map for O(1) user lookups and updates
  const [users, setUsers] = useState<Map<string, User>>(new Map())
  const [groups, setGroups] = useState<Group[]>([])
  
  // Batch high-frequency updates to reduce re-renders
  const updateQueueRef = useRef<{
    positions: Map<string, PlayerPosition & { username: string }>
    speaking: Map<string, boolean>
  }>({ positions: new Map(), speaking: new Map() })
  const flushTimeoutRef = useRef<number | null>(null)
  const [currentGroupId, setCurrentGroupId] = useState<string | null>(null)
  const [username, setUsername] = useState<string>('')
  const [audioSettings, setAudioSettings] = useState<AudioSettings>(() => loadAudioSettings())
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    status: 'disconnected',
    serverUrl: ''
  })
  const [vadEnabled, setVadEnabled] = useState<boolean>(true)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  
  const [searchQuery, setSearchQuery] = useState('')
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null)
  const [activeTab, setActiveTab] = useState<'current-group' | 'groups' | 'all-users'>('groups')

  // Audio transmission hook - captures and sends audio when speaking
  const { onAudioData } = useAudioTransmission({
    enabled: vadEnabled,
    connected: connectionState.status === 'connected'
  })

  // Flush batched updates at 10Hz (every 100ms)
  const flushUpdates = useCallback(() => {
    const queue = updateQueueRef.current
    if (queue.positions.size === 0 && queue.speaking.size === 0) return

    setUsers(currentUsers => {
      const newUsers = new Map(currentUsers)
      
      // Apply position updates
      queue.positions.forEach((pos, userId) => {
        const user = newUsers.get(userId)
        if (user) {
          newUsers.set(userId, { ...user, position: pos })
        }
      })
      
      // Apply speaking status updates
      queue.speaking.forEach((isSpeaking, userId) => {
        const user = newUsers.get(userId)
        if (user && user.isSpeaking !== isSpeaking) {
          newUsers.set(userId, { ...user, isSpeaking })
        }
      })
      
      return newUsers
    })

    // Clear the queues
    queue.positions.clear()
    queue.speaking.clear()
    flushTimeoutRef.current = null
  }, [])

  const scheduleFlush = useCallback(() => {
    if (!flushTimeoutRef.current) {
      flushTimeoutRef.current = window.setTimeout(flushUpdates, 100)
    }
  }, [flushUpdates])

  // Handle speaking status changes from VoiceActivityMonitor
  const handleSpeakingChange = useCallback((isSpeaking: boolean) => {
    if (currentUserId) {
      const client = signalingClient.current
      // Update immediately for current user for responsiveness
      setUsers(currentUsers => {
        const newUsers = new Map(currentUsers)
        const user = newUsers.get(currentUserId)
        if (user) {
          newUsers.set(currentUserId, { ...user, isSpeaking })
        }
        return newUsers
      })
      // Send speaking status to server if connected
      if (client.isConnected()) {
        client.updateSpeakingStatus(isSpeaking)
      }
    }
  }, [currentUserId])

  const filteredUsers = useMemo(() => {
    let filtered = Array.from(users.values())

    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        user => user.name.toLowerCase().includes(query) || user.id.toLowerCase().includes(query)
      )
    }

    return filtered
  }, [users, searchQuery])

  const groupUsers = useMemo(() => {
    if (!currentGroupId) return []
    return filteredUsers.filter(user => user.groupId === currentGroupId)
  }, [filteredUsers, currentGroupId])

  const handleVolumeChange = useCallback((userId: string, volume: number) => {
    // Update local state
    setUsers(currentUsers => {
      const newUsers = new Map(currentUsers)
      const user = newUsers.get(userId)
      if (user) {
        newUsers.set(userId, { ...user, volume })
      }
      return newUsers
    })
    // Apply to audio playback
    audioPlayback.current.setUserVolume(userId, volume)
  }, [])

  const handleToggleMute = useCallback((userId: string) => {
    setUsers(currentUsers => {
      const newUsers = new Map(currentUsers)
      const user = newUsers.get(userId)
      if (user) {
        const newMuted = !user.isMuted
        // Apply to audio playback
        audioPlayback.current.setUserMuted(userId, newMuted)
        newUsers.set(userId, { ...user, isMuted: newMuted })
      }
      return newUsers
    })
  }, [])

  const handleCreateGroup = useCallback((name: string, settings: GroupSettings) => {
    console.log('[App] handleCreateGroup called:', name, settings)
    const client = signalingClient.current
    if (!client.isConnected()) {
      toast.error('Not connected to server')
      return
    }

    console.log('[App] Connected, sending create_group message')
    client.createGroup(name, settings)
  }, [])

  const handleJoinGroup = useCallback((groupId: string) => {
    console.log('[App] handleJoinGroup called:', groupId)
    const client = signalingClient.current
    const group = (groups || []).find(g => g.id === groupId)
    if (!group) {
      console.warn('[App] Group not found:', groupId)
      return
    }

    if (group.memberCount >= group.settings.maxMembers) {
      toast.error('Group is full')
      return
    }

    if (!client.isConnected()) {
      toast.error('Not connected to server')
      return
    }

    console.log('[App] Connected, sending join_group message')
    client.joinGroup(groupId)
  }, [groups])

  const handleLeaveGroup = useCallback((groupId: string) => {
    console.log('[App] handleLeaveGroup called:', groupId)
    const client = signalingClient.current
    const group = (groups || []).find(g => g.id === groupId)
    if (!group) {
      console.warn('[App] Group not found:', groupId)
      return
    }

    if (!client.isConnected()) {
      toast.error('Not connected to server')
      return
    }

    console.log('[App] Connected, sending leave_group message')
    client.leaveGroup()
  }, [groups])

  const handleOpenSettings = useCallback((groupId: string) => {
    const group = (groups || []).find(g => g.id === groupId)
    if (group) {
      setSelectedGroup(group)
      setSettingsDialogOpen(true)
    }
  }, [groups])

  const handleSaveSettings = useCallback((groupId: string, settings: GroupSettings) => {
    setGroups(currentGroups =>
      (currentGroups || []).map(g =>
        g.id === groupId ? { ...g, settings } : g
      )
    )
    toast.success('Settings updated')
  }, [])

  const handleConnect = useCallback(async (serverUrl: string, username: string, authCode: string) => {
    setConnectionState(currentState => ({
      serverUrl,
      status: 'connecting',
      latency: currentState?.latency,
      errorMessage: undefined
    }))
    
    try {
      const client = signalingClient.current
      
      // Clear previous event listeners if reconnecting
      if (eventListenersSetUpRef.current) {
        client.removeAllListeners()
      }
      
      // Clear any existing ping interval
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current)
        pingIntervalRef.current = null
      }
      
      await client.connect(serverUrl, username, authCode)
      
      setConnectionState(currentState => ({
        serverUrl,
        status: 'connected',
        latency: currentState?.latency,
        errorMessage: undefined
      }))
      
      // Initialize audio playback
      await audioPlayback.current.initialize()
      
      // Set up audio playback callback for incoming audio
      client.setAudioPlaybackCallback((userId: string, audioData: string) => {
        audioPlayback.current.playUserAudio(userId, audioData)
      })
      
      // Request group list
      client.listGroups()
      
      // Start ping for latency monitoring
      pingIntervalRef.current = setInterval(() => {
        if (client.isConnected()) {
          client.ping()
        }
      }, 5000)

      // Setup event listeners (only once per connection)
      client.on('authenticated', (data: unknown) => {
        const payload = data as { clientId?: string }
        if (payload.clientId) {
          setCurrentUserId(payload.clientId)
        }
        toast.success('Connected to server')
      })

      client.on('group_list', (data: unknown) => {
        const payload = data as { groups?: Array<{id: string, name: string, memberCount: number, maxMembers: number, proximityRange: number, members?: Array<{id: string, username: string, isSpeaking?: boolean}>}> }
        const groupsData = payload.groups || []
        const groupsList = groupsData.map(g => ({
          id: g.id,
          name: g.name,
          memberCount: g.memberCount,
          members: g.members?.map(m => ({ id: m.id, name: m.username, isSpeaking: m.isSpeaking })) || [],
          settings: {
            defaultVolume: 100,
            proximityRange: g.proximityRange || 30,
            allowInvites: true,
            maxMembers: g.maxMembers || 50
          }
        }))
        console.log('[App] Received group list:', groupsList)
        // Merge with existing groups to preserve any groups not in the list
        // but remove groups that are now empty
        setGroups(groupsList.filter(g => g.memberCount > 0))

        // Populate users list from group members so "All Users" is always accurate
        const membersFromGroups = groupsList.flatMap(group =>
          (group.members || []).map(member => ({ ...member, groupId: group.id }))
        )

        if (membersFromGroups.length > 0) {
          setUsers(currentUsers => {
            const newUsers = new Map(currentUsers)
            const memberIds = new Set<string>()

            membersFromGroups.forEach(member => {
              memberIds.add(member.id)
              const existing = newUsers.get(member.id)
              newUsers.set(member.id, {
                id: member.id,
                name: member.name,
                groupId: member.groupId,
                isSpeaking: member.isSpeaking ?? existing?.isSpeaking ?? false,
                isMuted: existing?.isMuted ?? false,
                volume: existing?.volume ?? 100,
                position: existing?.position
              })
            })

            // Remove users that are no longer in any group list
            newUsers.forEach((user, id) => {
              if (!memberIds.has(id)) {
                newUsers.delete(id)
              }
            })

            return newUsers
          })
        }
      })

      client.on('group_created', (data: unknown) => {
        console.log('[App] Received group_created:', data)
        const payload = data as { groupId?: string, groupName?: string, membersCount?: number }
        if (payload.groupId && payload.groupName) {
          // Add new group to list
          const newGroup: Group = {
            id: payload.groupId,
            name: payload.groupName,
            memberCount: payload.membersCount || 1,
            settings: {
              defaultVolume: 100,
              proximityRange: 30,
              allowInvites: true,
              maxMembers: 50
            }
          }
          console.log('[App] Adding group to list:', newGroup)
          setGroups(currentGroups => [...(currentGroups || []), newGroup])
          // Auto-join the creator to the group they just created
          console.log('[App] Auto-joining created group:', payload.groupId)
          setCurrentGroupId(payload.groupId)
          toast.success(`Group "${payload.groupName}" created`)
        } else {
          console.warn('[App] Invalid group_created payload:', payload)
        }
      })

      client.on('group_joined', (data: unknown) => {
        const payload = data as { groupId?: string, groupName?: string }
        if (payload.groupId) {
          setCurrentGroupId(payload.groupId)
          toast.success(`Joined "${payload.groupName || 'group'}"`)
          // Refresh group list to get updated member counts
          client.listGroups()
        }
      })

      client.on('group_left', (data: unknown) => {
        const payload = data as { groupId?: string, memberCount?: number }
        console.log('[App] Left group:', payload)
        setCurrentGroupId(null)
        // If the group is now empty, remove it from the list
        if (payload.groupId && payload.memberCount === 0) {
          console.log('[App] Removing empty group:', payload.groupId)
          setGroups(currentGroups =>
            (currentGroups || []).filter(g => g.id !== payload.groupId)
          )
        } else if (payload.groupId && typeof payload.memberCount === 'number') {
          // Update the member count if provided
          const memberCount = payload.memberCount
          console.log('[App] Updating group member count after leave:', payload.groupId, memberCount)
          setGroups(currentGroups =>
            (currentGroups || []).map(g =>
              g.id === payload.groupId
                ? { ...g, memberCount }
                : g
            )
          )
        }
        toast.info('Left group')
        // Refresh group list
        client.listGroups()
      })

      client.on('group_members_updated', (data: unknown) => {
        // Update users with new group members
        const payload = data as { groupId?: string, memberCount?: number, members?: Array<{id: string, username: string, isSpeaking: boolean, isMuted: boolean, volume: number}> }
        console.log('[App] group_members_updated received:', JSON.stringify(payload, null, 2))
        if (payload.groupId) {
          // Calculate member count from members array if not provided
          const memberCount = payload.memberCount ?? payload.members?.length ?? 0
          console.log('[App] Updating group member count:', payload.groupId, memberCount)
          // Update group member count in the groups list
          setGroups(currentGroups =>
            (currentGroups || []).map(g =>
              g.id === payload.groupId
                ? { ...g, memberCount }
                : g
            )
          )
          // Update the individual users if provided - MERGE with existing users, don't replace
          if (payload.members && payload.members.length > 0) {
            console.log('[App] Updating group users:', payload.members)
            setUsers(currentUsers => {
              const newUsers = new Map(currentUsers)
              console.log('[App] Current users before update:', Array.from(newUsers.keys()))
              // First, remove users who were in this group but are no longer members
              const memberIds = new Set(payload.members!.map(m => m.id))
              newUsers.forEach((user, id) => {
                if (user.groupId === payload.groupId && !memberIds.has(id)) {
                  console.log('[App] Removing user no longer in group:', id)
                  newUsers.delete(id)
                }
              })
              // Then add/update the current members
              payload.members!.forEach(m => {
                console.log('[App] Adding/updating user:', m.id, m.username)
                newUsers.set(m.id, {
                  id: m.id,
                  name: m.username,
                  isSpeaking: m.isSpeaking,
                  isMuted: m.isMuted,
                  volume: m.volume,
                  groupId: payload.groupId
                })
              })
              console.log('[App] Users after update:', Array.from(newUsers.keys()))
              return newUsers
            })
          }
        }
      })

      client.on('user_speaking_status', (data: unknown) => {
        const payload = data as { userId?: string, isSpeaking?: boolean }
        if (payload.userId) {
          // Batch speaking status updates
          updateQueueRef.current.speaking.set(payload.userId, payload.isSpeaking || false)
          scheduleFlush()
        }
      })

      client.on('position_update', (data: unknown) => {
        const payload = data as { 
          positions?: Array<{
            userId: string
            username: string
            x: number
            y: number
            z: number
            yaw: number
            pitch: number
            worldId: string
          }>
        }
        if (payload.positions && payload.positions.length > 0) {
          // Batch position updates
          payload.positions.forEach(pos => {
            updateQueueRef.current.positions.set(pos.userId, {
              x: pos.x,
              y: pos.y,
              z: pos.z,
              yaw: pos.yaw,
              pitch: pos.pitch,
              worldId: pos.worldId,
              username: pos.username
            })
          })
          scheduleFlush()
        }
      })

      client.on('latency', (data: unknown) => {
        const payload = data as { latency?: number }
        setConnectionState(currentState => ({
          ...currentState,
          latency: payload.latency
        }))
      })

      client.on('connection_error', (error) => {
        setConnectionState(currentState => ({
          ...currentState,
          status: 'error',
          errorMessage: 'Connection failed: ' + (error instanceof Error ? error.message : 'Unknown error')
        }))
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current)
          pingIntervalRef.current = null
        }
        toast.error('Connection failed')
      })

      client.on('disconnected', () => {
        setConnectionState(currentState => ({
          ...currentState,
          status: 'disconnected'
        }))
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current)
          pingIntervalRef.current = null
        }
      })
      
      eventListenersSetUpRef.current = true
    } catch (error) {
      setConnectionState(currentState => ({
        serverUrl,
        status: 'error',
        latency: currentState?.latency,
        errorMessage: error instanceof Error ? error.message : 'Connection failed'
      }))
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current)
        pingIntervalRef.current = null
      }
      toast.error('Failed to connect to server')
    }
  }, [])

  const handleDisconnect = useCallback(() => {
    const client = signalingClient.current
    client.disconnect()
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current)
      pingIntervalRef.current = null
    }
    eventListenersSetUpRef.current = false
    setConnectionState(currentState => ({
      serverUrl: currentState?.serverUrl || '',
      status: 'disconnected',
      latency: undefined,
      errorMessage: undefined
    }))
    setCurrentGroupId(null)
    setCurrentUserId(null)
    setUsers(new Map())
    setGroups([])
    // Clear any pending flush
    if (flushTimeoutRef.current) {
      clearTimeout(flushTimeoutRef.current)
      flushTimeoutRef.current = null
    }
    toast.info('Disconnected from server')
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current)
        pingIntervalRef.current = null
      }
      if (flushTimeoutRef.current) {
        clearTimeout(flushTimeoutRef.current)
        flushTimeoutRef.current = null
      }
      const client = signalingClient.current
      if (client.isConnected()) {
        client.disconnect()
      }
    }
  }, [])

  // Apply audio settings changes to audio systems
  useEffect(() => {
    const playback = audioPlayback.current
    // Apply output device when it changes
    if (audioSettings.outputDevice) {
      if (audioSettings.outputDevice !== 'default' && !playback.supportsOutputDeviceSelection()) {
        if (outputWarningRef.current !== audioSettings.outputDevice) {
          toast.warning('Output device switching is not supported in this browser. Audio will use the system default output.')
          outputWarningRef.current = audioSettings.outputDevice
        }
        return
      }
      if (audioSettings.outputDevice === 'default') {
        outputWarningRef.current = null
      }
      playback.setOutputDevice(audioSettings.outputDevice).catch(err => {
        console.warn('[App] Failed to set output device:', err)
      })
    }
    // Apply master volume
    playback.setMasterVolume(audioSettings.outputVolume)
  }, [audioSettings.outputDevice, audioSettings.outputVolume])

  // Persist audio settings locally
  useEffect(() => {
    try {
      localStorage.setItem(AUDIO_SETTINGS_STORAGE_KEY, JSON.stringify(audioSettings))
    } catch (err) {
      console.warn('[App] Failed to persist audio settings:', err)
    }
  }, [audioSettings])

  const handleAudioSettingsChange = useCallback((settings: AudioSettings) => {
    setAudioSettings(settings)
  }, [])

  const handleToggleVAD = () => {
    const newVadState = !vadEnabled
    setVadEnabled(newVadState)
    if (newVadState) {
      toast.success('Voice detection enabled')
    } else {
      toast.info('Voice detection disabled')
    }
  }

  const currentGroup = (groups || []).find(g => g.id === currentGroupId)
  const currentUser = currentUserId ? users.get(currentUserId) : undefined

  useEffect(() => {
    if (currentGroupId && activeTab === 'groups') {
      setActiveTab('current-group')
    } else if (!currentGroupId && activeTab === 'current-group') {
      setActiveTab('groups')
    }
  }, [currentGroupId])

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster />
      
      {isMobile ? (
        <div className="flex flex-col h-screen">
          <header className="p-4 border-b border-border bg-card/50 backdrop-blur sticky top-0 z-10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div>
                  <h1 className="text-xl font-bold tracking-tight">Obsolete Voice Chat</h1>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant={vadEnabled ? "default" : "outline"}
                  onClick={handleToggleVAD}
                  className={vadEnabled ? "bg-accent text-accent-foreground hover:bg-accent/90" : ""}
                >
                  <WaveformIcon size={18} weight="bold" />
                </Button>
                
                {currentGroup && (
                  <Badge 
                    variant="secondary" 
                    className="bg-accent/20 text-accent border-accent/30 px-3 py-1 text-xs"
                  >
                    <UsersIcon size={14} weight="fill" className="mr-1.5" />
                    {currentGroup.name}
                  </Badge>
                )}
              </div>
            </div>
          </header>

          <div className="flex-1 overflow-auto">
            <div className="p-4 space-y-4">
              <ConnectionView
                connectionState={connectionState || { status: 'disconnected', serverUrl: '' }}
                audioSettings={audioSettings || {
                  inputDevice: 'default',
                  outputDevice: 'default',
                  inputVolume: 80,
                  outputVolume: 80,
                  echoCancellation: true,
                  noiseSuppression: true,
                  autoGainControl: true
                }}
                onConnect={handleConnect}
                onDisconnect={handleDisconnect}
                onAudioSettingsChange={handleAudioSettingsChange}
                onSpeakingChange={handleSpeakingChange}
                enableAudioCapture={vadEnabled && connectionState.status === 'connected'}
                onAudioData={onAudioData}
              />

              <Card>
                <CardHeader className="pb-3">
                  <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
                    <TabsList className="grid w-full grid-cols-3 h-auto">
                      {currentGroup && (
                        <TabsTrigger value="current-group" className="text-[10px] px-1 py-1.5 data-[state=active]:bg-accent data-[state=active]:text-accent-foreground">
                          <UsersIcon size={12} weight="fill" className="mr-1" />
                          Group
                        </TabsTrigger>
                      )}
                      <TabsTrigger value="groups" className="text-[10px] px-1 py-1.5 data-[state=active]:bg-accent data-[state=active]:text-accent-foreground" style={currentGroup ? {} : { gridColumn: 'span 1' }}>
                        <StackIcon size={12} weight="fill" className="mr-1" />
                        Groups
                      </TabsTrigger>
                      <TabsTrigger value="all-users" className="text-[10px] px-1 py-1.5 data-[state=active]:bg-accent data-[state=active]:text-accent-foreground" style={currentGroup ? {} : { gridColumn: 'span 2' }}>
                        <UserListIcon size={12} weight="fill" className="mr-1" />
                        All Users
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </CardHeader>

                <CardContent className="pt-0">
                  <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
                    {currentGroup && (
                      <TabsContent value="current-group" className="mt-0 space-y-3">
                        <div className="space-y-2 pt-2">
                          <div className="flex items-center justify-between">
                            <h3 className="text-lg font-bold">{currentGroup.name}</h3>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleLeaveGroup(currentGroup.id)}
                            >
                              <SignOutIcon size={14} weight="fill" />
                              Leave
                            </Button>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <UsersIcon size={14} weight="fill" />
                            <span className="font-mono text-xs">{currentGroup.memberCount} / {currentGroup.settings.maxMembers}</span>
                          </div>
                        </div>

                        <Separator />

                        <div className="space-y-2">
                          <div className="relative">
                            <MagnifyingGlassIcon 
                              size={14} 
                              className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" 
                            />
                            <Input
                              placeholder="Search group members..."
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                              className="pl-7 h-8 text-xs"
                            />
                          </div>

                          {groupUsers.length === 0 ? (
                            <div className="text-center py-8">
                              <UsersIcon size={32} className="mx-auto mb-2 text-muted-foreground" weight="thin" />
                              <p className="text-xs text-muted-foreground">
                                {searchQuery ? 'No users found' : 'No users in group yet'}
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-2 max-h-[400px] overflow-y-auto">
                              {groupUsers.map(user => (
                                <UserCard
                                  key={user.id}
                                  user={user}
                                  onVolumeChange={handleVolumeChange}
                                  onToggleMute={handleToggleMute}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      </TabsContent>
                    )}

                    <TabsContent value="groups" className="mt-0 space-y-3 pt-2">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-bold">Available Groups</h3>
                        <Button
                          onClick={() => setCreateDialogOpen(true)}
                          size="sm"
                          className="bg-accent text-accent-foreground hover:bg-accent/90"
                        >
                          <PlusIcon size={14} weight="bold" />
                          Create
                        </Button>
                      </div>

                      {(groups || []).length === 0 ? (
                        <div className="text-center py-8">
                          <StackIcon size={32} className="mx-auto mb-2 text-muted-foreground" weight="thin" />
                          <p className="text-xs text-muted-foreground mb-3">
                            No groups available yet
                          </p>
                          <Button
                            onClick={() => setCreateDialogOpen(true)}
                            variant="outline"
                            size="sm"
                          >
                            Create First Group
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-[450px] overflow-y-auto">
                          {(groups || []).map(group => (
                            <GroupCard
                              key={group.id}
                              group={group}
                              isJoined={currentGroupId === group.id}
                              onJoin={handleJoinGroup}
                              onLeave={handleLeaveGroup}
                              onSettings={handleOpenSettings}
                            />
                          ))}
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="all-users" className="mt-0 space-y-3 pt-2">
                      <h3 className="text-lg font-bold">All Users</h3>

                      <div className="relative">
                        <MagnifyingGlassIcon 
                          size={14} 
                          className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" 
                        />
                        <Input
                          placeholder="Search all users..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="pl-7 h-8 text-xs"
                        />
                      </div>

                      {filteredUsers.length === 0 ? (
                        <div className="text-center py-8">
                          <UserListIcon size={32} className="mx-auto mb-2 text-muted-foreground" weight="thin" />
                          <p className="text-xs text-muted-foreground">
                            {searchQuery ? 'No users found' : 'No users available'}
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-[400px] overflow-y-auto">
                          {filteredUsers.map(user => (
                            <UserCard
                              key={user.id}
                              user={user}
                              onVolumeChange={handleVolumeChange}
                              onToggleMute={handleToggleMute}
                            />
                          ))}
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      ) : (
        <div className="container mx-auto p-6 max-w-[1600px]">
          <header className="mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <img src={icon} alt="Obsolete Voice Chat" className="h-10 w-auto" />
                <div>
                  <h1 className="text-3xl font-bold tracking-tight">Obsolete Voice Chat</h1>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  size="default"
                  variant={vadEnabled ? "default" : "outline"}
                  onClick={handleToggleVAD}
                  className={vadEnabled ? "bg-accent text-accent-foreground hover:bg-accent/90" : ""}
                >
                  <WaveformIcon size={20} weight="bold" />
                  Voice Detection {vadEnabled ? 'On' : 'Off'}
                </Button>
              </div>
            </div>
          </header>

          <div className="grid grid-cols-12 gap-6">
            <div className="col-span-7">
              <ConnectionView
                connectionState={connectionState || { status: 'disconnected', serverUrl: '' }}
                audioSettings={audioSettings || {
                  inputDevice: 'default',
                  outputDevice: 'default',
                  inputVolume: 80,
                  outputVolume: 80,
                  echoCancellation: true,
                  noiseSuppression: true,
                  autoGainControl: true
                }}
                onConnect={handleConnect}
                onDisconnect={handleDisconnect}
                onAudioSettingsChange={handleAudioSettingsChange}
                onSpeakingChange={handleSpeakingChange}
                enableAudioCapture={vadEnabled && connectionState.status === 'connected'}
                onAudioData={onAudioData}
              />
            </div>

            <div className="col-span-5 space-y-6">
              <Card>
                <CardHeader className="pb-3">
                  <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
                    <TabsList className="grid w-full grid-cols-3 h-auto">
                      {currentGroup && (
                        <TabsTrigger value="current-group" className="text-xs data-[state=active]:bg-accent data-[state=active]:text-accent-foreground">
                          <UsersIcon size={16} weight="fill" className="mr-1.5" />
                          Current Group
                        </TabsTrigger>
                      )}
                      <TabsTrigger value="groups" className="text-xs data-[state=active]:bg-accent data-[state=active]:text-accent-foreground" style={currentGroup ? {} : { gridColumn: 'span 2' }}>
                        <StackIcon size={16} weight="fill" className="mr-1.5" />
                        Available Groups
                      </TabsTrigger>
                      <TabsTrigger value="all-users" className="text-xs data-[state=active]:bg-accent data-[state=active]:text-accent-foreground" style={currentGroup ? {} : { gridColumn: 'span 1' }}>
                        <UserListIcon size={16} weight="fill" className="mr-1.5" />
                        All Users
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </CardHeader>

                <CardContent className="pt-0">
                  <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
                    {currentGroup && (
                      <TabsContent value="current-group" className="mt-0 space-y-3">
                        <div className="space-y-3 pt-2">
                          <div className="flex items-center justify-between">
                            <div>
                              <h3 className="text-xl font-bold mb-1">{currentGroup.name}</h3>
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <UsersIcon size={16} weight="fill" />
                                <span className="font-mono">{currentGroup.memberCount} / {currentGroup.settings.maxMembers}</span>
                              </div>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleLeaveGroup(currentGroup.id)}
                            >
                              <SignOutIcon size={16} weight="fill" />
                              Leave
                            </Button>
                          </div>
                        </div>

                        <Separator />

                        <div className="space-y-3">
                          <div className="relative">
                            <MagnifyingGlassIcon 
                              size={16} 
                              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" 
                            />
                            <Input
                              placeholder="Search group members..."
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                              className="pl-9 h-9"
                            />
                          </div>

                          {groupUsers.length === 0 ? (
                            <div className="text-center py-8">
                              <UsersIcon size={40} className="mx-auto mb-3 text-muted-foreground" weight="thin" />
                              <p className="text-sm text-muted-foreground">
                                {searchQuery ? 'No users found' : 'No users in group yet'}
                              </p>
                            </div>
                          ) : (
                            <ScrollArea className="h-[450px]">
                              <div className="space-y-2 pr-4">
                                {groupUsers.map(user => (
                                  <UserCard
                                    key={user.id}
                                    user={user}
                                    onVolumeChange={handleVolumeChange}
                                    onToggleMute={handleToggleMute}
                                  />
                                ))}
                              </div>
                            </ScrollArea>
                          )}
                        </div>
                      </TabsContent>
                    )}

                    <TabsContent value="groups" className="mt-0 space-y-3 pt-2">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xl font-bold">Available Groups</h3>
                        <Button
                          onClick={() => setCreateDialogOpen(true)}
                          size="sm"
                          className="bg-accent text-accent-foreground hover:bg-accent/90"
                        >
                          <PlusIcon size={16} weight="bold" />
                          Create
                        </Button>
                      </div>

                      {(groups || []).length === 0 ? (
                        <div className="text-center py-8">
                          <StackIcon size={40} className="mx-auto mb-3 text-muted-foreground" weight="thin" />
                          <p className="text-sm text-muted-foreground mb-4">
                            No groups available yet
                          </p>
                          <Button
                            onClick={() => setCreateDialogOpen(true)}
                            variant="outline"
                            size="sm"
                          >
                            Create First Group
                          </Button>
                        </div>
                      ) : (
                        <ScrollArea className="h-[500px]">
                          <div className="space-y-2 pr-4">
                            {(groups || []).map(group => (
                              <GroupCard
                                key={group.id}
                                group={group}
                                isJoined={currentGroupId === group.id}
                                onJoin={handleJoinGroup}
                                onLeave={handleLeaveGroup}
                                onSettings={handleOpenSettings}
                              />
                            ))}
                          </div>
                        </ScrollArea>
                      )}
                    </TabsContent>

                    <TabsContent value="all-users" className="mt-0 space-y-3 pt-2">
                      <h3 className="text-xl font-bold">All Users</h3>

                      <div className="relative">
                        <MagnifyingGlassIcon 
                          size={16} 
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" 
                        />
                        <Input
                          placeholder="Search all users..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="pl-9 h-9"
                        />
                      </div>

                      {filteredUsers.length === 0 ? (
                        <div className="text-center py-8">
                          <UserListIcon size={40} className="mx-auto mb-3 text-muted-foreground" weight="thin" />
                          <p className="text-sm text-muted-foreground">
                            {searchQuery ? 'No users found' : 'No users available'}
                          </p>
                        </div>
                      ) : (
                        <ScrollArea className="h-[450px]">
                          <div className="space-y-2 pr-4">
                            {filteredUsers.map(user => (
                              <UserCard
                                key={user.id}
                                user={user}
                                onVolumeChange={handleVolumeChange}
                                onToggleMute={handleToggleMute}
                              />
                            ))}
                          </div>
                        </ScrollArea>
                      )}
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}

      <CreateGroupDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onCreate={handleCreateGroup}
      />

      <GroupSettingsDialog
        group={selectedGroup}
        open={settingsDialogOpen}
        onOpenChange={setSettingsDialogOpen}
        onSave={handleSaveSettings}
      />
    </div>
  )
}

export default App