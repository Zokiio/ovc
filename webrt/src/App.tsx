import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Toaster } from '@/components/ui/sonner'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { 
  MagnifyingGlassIcon, 
  PlusIcon, 
  UsersIcon, 
  SignOutIcon, 
  UserListIcon, 
  StackIcon, 
  HashIcon,
  BroadcastIcon,
  ShieldIcon,
  WifiHighIcon,
  GearIcon,
  PowerIcon,
  ActivityIcon,
  WarningCircleIcon,
  SpeakerHighIcon,
  SpeakerSlashIcon
} from '@phosphor-icons/react'
import { User, Group, GroupSettings, AudioSettings, ConnectionState, PlayerPosition } from '@/lib/types'
import { UserCard } from '@/components/UserCard'
import { UserCardCompact } from '@/components/UserCardCompact'
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
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false
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
  const [isMuted, setIsMuted] = useState<boolean>(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const currentUserIdRef = useRef<string | null>(null)
  
  const [searchQuery, setSearchQuery] = useState('')
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null)
  const [activeTab, setActiveTab] = useState<'current-group' | 'groups' | 'all-users'>('groups')
  const [audioMenuOpen, setAudioMenuOpen] = useState(false)

  // Audio transmission hook - captures and sends audio when speaking
  const { onAudioData } = useAudioTransmission({
    enabled: !isMuted,
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

  const handleToggleUserMute = useCallback((userId: string) => {
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
    const client = signalingClient.current
    if (!client.isConnected()) {
      toast.error('Not connected to server')
      return
    }

    client.createGroup(name, settings)
  }, [])

  const handleJoinGroup = useCallback((groupId: string) => {
    const client = signalingClient.current
    const group = (groups || []).find(g => g.id === groupId)
    if (!group) {
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

    client.joinGroup(groupId)
  }, [groups])

  const handleLeaveGroup = useCallback((groupId: string) => {
    const client = signalingClient.current
    const group = (groups || []).find(g => g.id === groupId)
    if (!group) {
      return
    }

    if (!client.isConnected()) {
      toast.error('Not connected to server')
      return
    }

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
          currentUserIdRef.current = payload.clientId
          // Add self to users list
          setUsers(currentUsers => {
            const newUsers = new Map(currentUsers)
            newUsers.set(payload.clientId!, {
              id: payload.clientId!,
              name: username,
              isSpeaking: false,
              isMuted: false,
              volume: 100
            })
            return newUsers
          })
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
        const payload = data as { groupId?: string, groupName?: string, membersCount?: number, creatorClientId?: string }
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
          setGroups(currentGroups => {
            // Check if group already exists to prevent duplication
            const exists = (currentGroups || []).some(g => g.id === payload.groupId)
            if (exists) return currentGroups || []
            return [...(currentGroups || []), newGroup]
          })
          // Auto-join only if this client is the creator
          if (payload.creatorClientId === currentUserIdRef.current) {
            // Actually join the group on the server
            client.joinGroup(payload.groupId)
            toast.success(`Group "${payload.groupName}" created`)
          }
        }
      })

      client.on('group_joined', (data: unknown) => {
        const payload = data as { groupId?: string, groupName?: string }
        if (payload.groupId) {
          setCurrentGroupId(payload.groupId)
          setActiveTab('current-group') // Auto-switch to the group tab
          toast.success(`Joined "${payload.groupName || 'group'}"`)
        }
      })

      client.on('group_left', (data: unknown) => {
        const payload = data as { groupId?: string, memberCount?: number }
        setCurrentGroupId(null)
        // If the group is now empty, remove it from the list
        if (payload.groupId && payload.memberCount === 0) {
          setGroups(currentGroups =>
            (currentGroups || []).filter(g => g.id !== payload.groupId)
          )
        } else if (payload.groupId && typeof payload.memberCount === 'number') {
          // Update the member count if provided
          const memberCount = payload.memberCount
          setGroups(currentGroups =>
            (currentGroups || []).map(g =>
              g.id === payload.groupId
                ? { ...g, memberCount }
                : g
            )
          )
        }
        toast.info('Left group')
      })

      client.on('group_members_updated', (data: unknown) => {
        // Update users with new group members
        const payload = data as { groupId?: string, memberCount?: number, members?: Array<{id: string, username: string, isSpeaking: boolean, isMuted: boolean, volume: number}> }
        if (payload.groupId) {
          // Calculate member count from members array if not provided
          const memberCount = payload.memberCount ?? payload.members?.length ?? 0
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
            setUsers(currentUsers => {
              const newUsers = new Map(currentUsers)
              // First, remove users who were in this group but are no longer members
              const memberIds = new Set(payload.members!.map(m => m.id))
              newUsers.forEach((user, id) => {
                if (user.groupId === payload.groupId && !memberIds.has(id)) {
                  newUsers.delete(id)
                }
              })
              // Then add/update the current members
              payload.members!.forEach(m => {
                newUsers.set(m.id, {
                  id: m.id,
                  name: m.username,
                  isSpeaking: m.isSpeaking,
                  isMuted: m.isMuted,
                  volume: m.volume,
                  groupId: payload.groupId
                })
              })
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
    currentUserIdRef.current = null
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

  const handleToggleMute = () => {
    const nextMuted = !isMuted
    setIsMuted(nextMuted)
    if (nextMuted) {
      toast.info('Microphone muted')
    } else {
      toast.success('Microphone unmuted')
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

  // Status card component for sidebar diagnostics
  const StatusCard = ({ label, value, icon: Icon, colorClass = "text-accent" }: { 
    label: string
    value: string
    icon: React.ComponentType<{ size: number }>
    colorClass?: string 
  }) => (
    <div className="bg-background/50 border border-border p-3 rounded-lg flex items-center gap-3">
      <div className={`p-2 rounded-md bg-secondary ${colorClass}`}>
        <Icon size={16} />
      </div>
      <div>
        <p className="text-[10px] uppercase text-muted-foreground font-bold tracking-widest">{label}</p>
        <p className="text-sm font-mono text-foreground">{value}</p>
      </div>
    </div>
  )

  // Derive ConnectionView props once to maintain stable reference across layout changes
  const connectionViewProps = {
    connectionState: connectionState || { status: 'disconnected', serverUrl: '' },
    audioSettings,
    onConnect: handleConnect,
    onDisconnect: handleDisconnect,
    onAudioSettingsChange: handleAudioSettingsChange,
    onSpeakingChange: isMuted ? undefined : handleSpeakingChange,
    enableAudioCapture: !isMuted && connectionState.status === 'connected',
    onAudioData,
  };

  return (
    <div className="flex h-screen w-screen bg-background text-foreground overflow-hidden font-sans selection:bg-accent/30">
      <Toaster />
      
      {isMobile ? (
        /* --- MOBILE LAYOUT --- */
        <div key="layout" className="flex flex-col h-screen w-full min-w-0 overflow-hidden">
          {/* Mobile Header */}
          <header className="h-14 border-b border-border bg-card/80 backdrop-blur flex items-center justify-between px-4 shrink-0 w-full min-w-0">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <img src={icon} alt="OVC" className="h-6 w-6 shadow-accent/20 shrink-0" />
              <h1 className="text-base font-black tracking-tighter italic truncate">OVC</h1>
            </div>
            <div className="flex items-center gap-2 shrink-0">{connectionState.status === 'connected' && (
                <div className="flex items-center gap-1.5 text-[10px] text-green-400 status-live font-bold whitespace-nowrap">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400" /> LIVE
                </div>
              )}
              <Button
                size="icon"
                variant={audioMenuOpen ? "default" : "outline"}
                onClick={() => setAudioMenuOpen((open) => !open)}
                className={`h-8 w-8 ${audioMenuOpen ? "bg-accent text-accent-foreground" : ""}`}
                aria-label={audioMenuOpen ? "Close audio settings" : "Open audio settings"}
              >
                <GearIcon size={16} weight="bold" />
              </Button>
              <Button
                size="icon"
                variant={isMuted ? "outline" : "default"}
                onClick={handleToggleMute}
                className={`h-8 w-8 ${isMuted ? "" : "bg-accent text-accent-foreground"}`}
                aria-label={isMuted ? "Unmute microphone" : "Mute microphone"}
              >
                {isMuted ? (
                  <SpeakerSlashIcon size={16} weight="bold" />
                ) : (
                  <SpeakerHighIcon size={16} weight="bold" />
                )}
              </Button>
            </div>
          </header>

          {/* Mobile Content */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-1 py-4 space-y-3 min-w-0 w-full">
            {/* Audio Settings Menu - Fixed overlay, visibility controlled by audioMenuOpen */}
            <div className={`fixed inset-0 z-40 transition-all ${audioMenuOpen ? 'visible opacity-100' : 'invisible opacity-0 pointer-events-none'}`}>
              <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setAudioMenuOpen(false)} />
              <div className="absolute inset-x-0 top-0 bottom-0 bg-card border-b border-border">
                <div className="h-14 border-b border-border flex items-center justify-between px-3">
                  <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Audio Settings</h2>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setAudioMenuOpen(false)}
                    className="h-6 px-2 text-[9px]"
                  >
                    Close
                  </Button>
                </div>
                <div className="absolute inset-x-0 top-14 bottom-0 overflow-y-auto px-3 py-3">
                  {/* ConnectionView stays mounted - audio never stops */}
                  <ConnectionView {...connectionViewProps} />
                </div>
              </div>
            </div>

            {/* Tabs Navigation */}
            <div className="bg-card border border-border rounded-lg overflow-hidden w-full">
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="w-full flex flex-col">
                <TabsList className="w-full grid grid-cols-3 h-auto bg-secondary/50 p-1 rounded-none gap-1">
                  {currentGroup && (
                    <TabsTrigger 
                      value="current-group" 
                      className="text-[9px] px-1 py-1.5 data-[state=active]:bg-accent data-[state=active]:text-accent-foreground rounded-sm"
                    >
                      <HashIcon size={10} weight="bold" className="hidden sm:inline mr-0.5" />
                      Group
                    </TabsTrigger>
                  )}
                  <TabsTrigger 
                    value="groups" 
                    className="text-[9px] px-1 py-1.5 data-[state=active]:bg-accent data-[state=active]:text-accent-foreground rounded-sm"
                    style={currentGroup ? {} : { gridColumn: 'span 2' }}
                  >
                    <BroadcastIcon size={10} weight="bold" className="hidden sm:inline mr-0.5" />
                    Groups
                  </TabsTrigger>
                  <TabsTrigger 
                    value="all-users" 
                    className="text-[9px] px-1 py-1.5 data-[state=active]:bg-accent data-[state=active]:text-accent-foreground rounded-sm"
                    style={currentGroup ? {} : { gridColumn: 'span 1' }}
                  >
                    <UsersIcon size={10} weight="bold" className="hidden sm:inline mr-0.5" />
                    Users
                  </TabsTrigger>
                </TabsList>

                <div className="p-2 overflow-hidden flex-1 min-w-0">
                  {currentGroup && (
                    <TabsContent value="current-group" className="mt-0 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-lg font-black">{currentGroup.name}</h3>
                          <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">
                            {currentGroup.memberCount}/{currentGroup.settings.maxMembers} pilots
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleLeaveGroup(currentGroup.id)}
                          className="text-destructive border-destructive/50 hover:bg-destructive/10"
                        >
                          <SignOutIcon size={14} weight="bold" />
                          Exit
                        </Button>
                      </div>

                      <div className="relative">
                        <MagnifyingGlassIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          placeholder="Search..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="pl-9 h-8 text-xs bg-background"
                        />
                      </div>

                      <div className="space-y-2 max-h-[300px] overflow-y-auto">
                        {groupUsers.length === 0 ? (
                          <div className="text-center py-8 opacity-50">
                            <WarningCircleIcon size={32} className="mx-auto mb-2" />
                            <p className="text-xs font-bold">No pilots found</p>
                          </div>
                        ) : (
                          groupUsers.map(user => (
                            <UserCardCompact
                              key={user.id}
                              user={user}
                              onVolumeChange={handleVolumeChange}
                              onToggleMute={handleToggleUserMute}
                            />
                          ))
                        )}
                      </div>
                    </TabsContent>
                  )}

                  <TabsContent value="groups" className="mt-0 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-black">Available Groups</h3>
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
                      <div className="text-center py-8 opacity-50">
                        <BroadcastIcon size={32} className="mx-auto mb-2" />
                        <p className="text-xs font-bold mb-3">No groups available</p>
                        <Button onClick={() => setCreateDialogOpen(true)} variant="outline" size="sm">
                          Create First Group
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-[400px] overflow-y-auto">
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

                  <TabsContent value="all-users" className="mt-0 space-y-3">
                    <h3 className="text-lg font-black">All Users</h3>
                    <div className="relative">
                      <MagnifyingGlassIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Search users..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 h-8 text-xs bg-background"
                      />
                    </div>

                    {filteredUsers.length === 0 ? (
                      <div className="text-center py-8 opacity-50">
                        <UsersIcon size={32} className="mx-auto mb-2" />
                        <p className="text-xs font-bold">{searchQuery ? 'No users found' : 'No users online'}</p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-[300px] overflow-y-auto">
                        {filteredUsers.map(user => (
                          <UserCardCompact
                            key={user.id}
                            user={user}
                            onVolumeChange={handleVolumeChange}
                            onToggleMute={handleToggleUserMute}
                          />
                        ))}
                      </div>
                    )}
                  </TabsContent>
                </div>
              </Tabs>
            </div>
          </div>
        </div>
      ) : (
        /* --- DESKTOP LAYOUT --- */
        <div key="layout" className="flex h-screen w-full">
          {/* --- SIDEBAR --- */}
          <aside className="hidden lg:flex flex-col w-96 bg-card border-r border-border p-5 space-y-6 overflow-y-auto">
            {/* Logo */}
            <div className="flex items-center gap-3 mb-2">
              <img src={icon} alt="OVC" className="h-8 w-8 shadow-accent/20" />
              <h1 className="text-xl font-black tracking-tighter italic">OVC</h1>
            </div>

            {/* Connection Status */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="tech-label">Server Hub</h2>
                {connectionState.status === 'connected' && (
                  <div className="flex items-center gap-1.5 text-[10px] text-green-400 status-live font-bold">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-400" /> LIVE
                  </div>
                )}
              </div>

              <ConnectionView {...connectionViewProps} />
            </div>

            {/* Microphone Mute Toggle */}
            <div className="space-y-3">
              <h2 className="tech-label">Microphone</h2>
              <Button
                onClick={handleToggleMute}
                className={`w-full py-2.5 rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-95 ${
                  isMuted 
                    ? 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                    : 'bg-accent text-accent-foreground shadow-lg shadow-accent/20'
                }`}
              >
                {isMuted ? (
                  <SpeakerSlashIcon size={16} weight="bold" />
                ) : (
                  <SpeakerHighIcon size={16} weight="bold" />
                )}
                {isMuted ? 'Microphone Muted' : 'Microphone Live'}
              </Button>
            </div>

            {/* Diagnostic Stats - shown when connected */}
            {connectionState.status === 'connected' && (
              <div className="mt-auto grid grid-cols-2 gap-2">
                <StatusCard 
                  label="Latency" 
                  value={`${connectionState.latency ?? '--'}ms`} 
                  icon={WifiHighIcon} 
                  colorClass={(connectionState.latency ?? 0) > 100 ? "text-yellow-400" : "text-green-400"} 
                />
                <StatusCard 
                  label="Status" 
                  value="Online" 
                  icon={ActivityIcon}
                  colorClass="text-green-400"
                />
              </div>
            )}
          </aside>

          {/* --- MAIN STAGE --- */}
          <main className="flex-1 flex flex-col bg-background">
            {/* Navigation Bar */}
            <header className="h-16 border-b border-border bg-card/30 flex items-center justify-between px-6 shrink-0">
              <div className="flex gap-8 items-center h-full">
                {[
                  ...(currentGroup ? [{ id: 'current-group', label: 'Active Group', icon: HashIcon }] : []),
                  { id: 'groups', label: 'Explore Groups', icon: BroadcastIcon },
                  { id: 'all-users', label: 'Players', icon: UsersIcon }
                ].map(tab => (
                  <button 
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as typeof activeTab)}
                    className={`flex items-center gap-2 h-full border-b-2 text-sm font-bold transition-all ${
                      activeTab === tab.id 
                        ? 'border-accent text-accent bg-accent/5 px-2' 
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <tab.icon size={16} weight={activeTab === tab.id ? "fill" : "regular"} />
                    <span className="hidden sm:inline">{tab.label}</span>
                  </button>
                ))}
              </div>

              <div className="relative w-full max-w-[16rem] sm:max-w-xs">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                <Input 
                  type="text" 
                  placeholder="Search users..." 
                  className="bg-card border-border rounded-full pl-10 pr-4 py-1.5 text-xs focus:ring-1 ring-accent w-full"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
            </header>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-8">
              {connectionState.status !== 'connected' ? (
                /* Disconnected State */
                <div className="h-full flex flex-col items-center justify-center space-y-6 text-center">
                  <div className="w-24 h-24 bg-card rounded-3xl flex items-center justify-center border border-border shadow-2xl">
                    <ShieldIcon size={48} className="text-muted-foreground" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-2xl font-black italic tracking-tight">LINK OFFLINE</h3>
                    <p className="text-muted-foreground max-w-sm mx-auto text-sm leading-relaxed">
                      Authentication required to join the voice grid. Use the command panel to establish a secure connection.
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    ← Use the sidebar to connect
                  </p>
                </div>
              ) : (
                /* Connected Content */
                <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  {/* Current Group Tab */}
                  {activeTab === 'current-group' && currentGroup && (
                    <div className="space-y-6">
                      {/* Group Header */}
                      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 bg-card/40 p-6 rounded-2xl border border-border">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-accent font-bold text-xs uppercase tracking-widest">
                            <HashIcon size={12} weight="bold" /> Live Transmission
                          </div>
                          <h2 className="text-3xl font-black text-foreground italic">{currentGroup.name.toUpperCase().replace(/ /g, '_')}</h2>
                          <p className="text-muted-foreground text-sm font-medium flex items-center gap-4">
                            <span className="flex items-center gap-1.5 font-mono">
                              <UsersIcon size={14} weight="fill" /> {currentGroup.memberCount}/{currentGroup.settings.maxMembers} PILOTS
                            </span>
                            <span className="flex items-center gap-1.5 font-mono">
                              <ActivityIcon size={14} /> RANGE: {currentGroup.settings.proximityRange}m
                            </span>
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button 
                            variant="secondary"
                            onClick={() => handleOpenSettings(currentGroup.id)}
                            className="flex-1 sm:flex-none"
                          >
                            <GearIcon size={16} weight="bold" /> Config
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => handleLeaveGroup(currentGroup.id)}
                            className="flex-1 sm:flex-none text-destructive border-destructive/30 hover:bg-destructive/10"
                          >
                            <SignOutIcon size={16} weight="bold" /> Exit
                          </Button>
                        </div>
                      </div>

                      {/* User List */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {groupUsers.map(user => (
                          <UserCard
                            key={user.id}
                            user={user}
                            onVolumeChange={handleVolumeChange}
                            onToggleMute={handleToggleMute}
                          />
                        ))}
                        {groupUsers.length === 0 && (
                          <div className="col-span-full py-20 text-center space-y-3 opacity-50">
                            <WarningCircleIcon size={40} className="mx-auto" />
                            <p className="font-bold">
                              {searchQuery ? `No pilots found matching "${searchQuery}"` : 'No pilots in group yet'}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Groups Tab */}
                  {activeTab === 'groups' && (
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <h2 className="text-2xl font-black">Explore Groups</h2>
                        <Button
                          onClick={() => setCreateDialogOpen(true)}
                          className="bg-accent text-accent-foreground hover:bg-accent/90"
                        >
                          <PlusIcon size={16} weight="bold" />
                          New Group
                        </Button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
                        
                        {/* Create New Group Card */}
                        <button 
                          onClick={() => setCreateDialogOpen(true)}
                          className="bg-background border-2 border-dashed border-border p-5 rounded-2xl flex flex-col items-center justify-center gap-3 text-muted-foreground hover:border-accent/50 hover:text-accent transition-all group min-h-[160px]"
                        >
                          <div className="w-12 h-12 rounded-full bg-card flex items-center justify-center group-hover:scale-110 transition-transform">
                            <PlusIcon size={24} weight="bold" />
                          </div>
                          <span className="font-bold text-sm">New Group Link</span>
                        </button>
                      </div>

                      {(groups || []).length === 0 && (
                        <div className="text-center py-12 space-y-4">
                          <BroadcastIcon size={48} className="mx-auto text-muted-foreground" />
                          <div>
                            <h3 className="text-lg font-bold">No Groups Available</h3>
                            <p className="text-sm text-muted-foreground">Create the first group to start communicating</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* All Users Tab */}
                  {activeTab === 'all-users' && (
                    <div className="bg-card/30 rounded-2xl border border-border overflow-hidden">
                      <div className="p-4 bg-card/50 border-b border-border flex items-center justify-between">
                        <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                          <UsersIcon size={14} weight="fill" /> Players connected
                        </span>
                        <span className="text-[10px] font-mono text-muted-foreground/70">
                          Total Online: {filteredUsers.length}
                        </span>
                      </div>
                      <div className="divide-y divide-border/50">
                        {filteredUsers.length === 0 ? (
                          <div className="py-20 text-center space-y-3 opacity-50">
                            <UsersIcon size={40} className="mx-auto" />
                            <p className="font-bold">
                              {searchQuery ? `No users found matching "${searchQuery}"` : 'No users online'}
                            </p>
                          </div>
                        ) : (
                          filteredUsers.map((user) => (
                            <div key={user.id} className="flex items-center justify-between p-4 hover:bg-card/30 transition-colors">
                              <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-xs font-bold ${
                                  user.isSpeaking ? 'ring-2 ring-accent' : ''
                                }`}>
                                  {user.name[0].toUpperCase()}
                                </div>
                                <div>
                                  <p className="text-sm font-bold">{user.name}</p>
                                  <p className="text-[10px] text-muted-foreground font-mono">ID: {user.id.slice(0, 8)}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-4">
                                <div className="hidden sm:block text-right">
                                  <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Status</p>
                                  <p className="text-xs text-muted-foreground">
                                    {user.isSpeaking ? (
                                      <span className="text-accent">Speaking</span>
                                    ) : (
                                      'Idle'
                                    )}
                                  </p>
                                </div>
                                <Button
                                  variant={user.isMuted ? "destructive" : "ghost"}
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => handleToggleUserMute(user.id)}
                                >
                                  {user.isMuted ? (
                                    <SpeakerSlashIcon size={16} weight="fill" />
                                  ) : (
                                    <SpeakerHighIcon size={16} weight="fill" />
                                  )}
                                </Button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </main>

          {/* Mobile sidebar toggle (for tablets) */}
          <div className="lg:hidden fixed bottom-6 left-1/2 -translate-x-1/2 bg-accent p-4 rounded-full shadow-2xl shadow-accent/40 text-accent-foreground active:scale-95 transition-transform z-40">
            <UsersIcon size={24} weight="bold" />
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
}export default App