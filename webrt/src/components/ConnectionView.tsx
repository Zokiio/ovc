import { useState, useEffect, useMemo, memo } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { 
  MicrophoneIcon, 
  SpeakerHighIcon, 
  FloppyDiskIcon,
  TrashIcon,
  PencilSimpleIcon,
  PowerIcon,
  GearIcon,
  EyeIcon,
  EyeSlashIcon
} from '@phosphor-icons/react'
import { ConnectionState, AudioSettings } from '@/lib/types'
import { toast } from 'sonner'
import { VoiceActivityMonitor } from '@/components/VoiceActivityMonitor'
import { useSavedServers } from '@/hooks/use-saved-servers'

interface ConnectionViewProps {
  connectionState: ConnectionState
  audioSettings: AudioSettings
  onConnect: (serverUrl: string, username: string, authCode: string) => void
  onDisconnect: () => void
  onAudioSettingsChange: (settings: AudioSettings) => void
  onSpeakingChange?: (isSpeaking: boolean) => void
  enableAudioCapture?: boolean
  onAudioData?: (audioData: string) => void
}

export function ConnectionView({
  connectionState,
  audioSettings,
  onConnect,
  onDisconnect,
  onAudioSettingsChange,
  onSpeakingChange,
  enableAudioCapture = false,
  onAudioData
}: ConnectionViewProps) {
  const [serverUrl, setServerUrl] = useState(connectionState.serverUrl)
  const [username, setUsername] = useState('')
  const [authCode, setAuthCode] = useState('')
  const [serverNickname, setServerNickname] = useState('')
  const [selectedServerId, setSelectedServerId] = useState<string>('')
  const [isEditing, setIsEditing] = useState(false)
  const [audioDevices, setAudioDevices] = useState<{ inputDevices: MediaDeviceInfo[], outputDevices: MediaDeviceInfo[] }>({
    inputDevices: [],
    outputDevices: []
  })
  const [useVadThreshold, setUseVadThreshold] = useState(true)  // Controls VAD threshold gating, voice activation is always on
  const [audioModalOpen, setAudioModalOpen] = useState(false)
  const [showHost, setShowHost] = useState(false)
  const [showAuthCode, setShowAuthCode] = useState(false)
  const [showConnectionUrl, setShowConnectionUrl] = useState(false)
  
  const { servers, addServer, updateServer, removeServer, markUsed } = useSavedServers()
  
  const isConnected = connectionState.status === 'connected'

  // Memoize server options to prevent dropdown sluggishness
  const serverOptions = useMemo(() => {
    return servers.map(server => ({
      id: server.id,
      nickname: server.nickname
    }))
  }, [servers])

  // Enumerate devices only when audio modal is open or connected
  useEffect(() => {
    if (audioModalOpen || isConnected) {
      enumerateDevices()
    }
  }, [audioModalOpen, isConnected])

  const handleSelectServer = (serverId: string) => {
    if (serverId === 'new') {
      setSelectedServerId('')
      setServerUrl('')
      setUsername('')
      setAuthCode('')
      setServerNickname('')
      setIsEditing(false)
      return
    }
    const server = servers.find(s => s.id === serverId)
    if (server) {
      setSelectedServerId(serverId)
      setServerUrl(server.url)
      setUsername(server.username)
      setAuthCode(server.authCode)
      setServerNickname(server.nickname)
      setIsEditing(false)
    }
  }

  const handleSaveServer = () => {
    if (!serverUrl.trim() || !username.trim()) {
      toast.error('Please enter server URL and username')
      return
    }
    const nickname = serverNickname.trim() || serverUrl
    const newServer = addServer({
      nickname,
      url: serverUrl,
      username,
      authCode
    })
    setSelectedServerId(newServer.id)
    setIsEditing(false)
    toast.success(`Server "${nickname}" saved`)
  }

  const handleUpdateServer = () => {
    if (!selectedServerId) return
    if (!serverUrl.trim() || !username.trim()) {
      toast.error('Please enter server URL and username')
      return
    }
    const nickname = serverNickname.trim() || serverUrl
    updateServer(selectedServerId, {
      nickname,
      url: serverUrl,
      username,
      authCode
    })
    setIsEditing(false)
    toast.success(`Server "${nickname}" updated`)
  }

  const handleDeleteServer = () => {
    if (selectedServerId) {
      const server = servers.find(s => s.id === selectedServerId)
      removeServer(selectedServerId)
      setSelectedServerId('')
      setServerUrl('')
      setUsername('')
      setAuthCode('')
      setServerNickname('')
      setIsEditing(false)
      toast.success(`Server "${server?.nickname}" removed`)
    }
  }

  const handleStartEdit = () => {
    setIsEditing(true)
  }

  const handleCancelEdit = () => {
    // Restore original values from selected server
    const server = servers.find(s => s.id === selectedServerId)
    if (server) {
      setServerUrl(server.url)
      setUsername(server.username)
      setAuthCode(server.authCode)
      setServerNickname(server.nickname)
    }
    setIsEditing(false)
  }

  const enumerateDevices = async () => {
    try {
      // Check if we already have microphone permission
      const permissionStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName })
      
      // Only request stream if we don't have permission yet
      // This minimizes audio system interactions
      if (permissionStatus.state !== 'granted') {
        const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true })
        tempStream.getTracks().forEach(track => track.stop())
      }
      
      const devices = await navigator.mediaDevices.enumerateDevices()
      const isSelectableDevice = (device: MediaDeviceInfo) => (
        device.deviceId !== 'default' && device.deviceId !== 'communications'
      )
      const inputDevices = devices
        .filter(d => d.kind === 'audioinput')
        .filter(isSelectableDevice)
      const outputDevices = devices
        .filter(d => d.kind === 'audiooutput')
        .filter(isSelectableDevice)
      setAudioDevices({ inputDevices, outputDevices })

      const inputDeviceIds = new Set(inputDevices.map(d => d.deviceId))
      const outputDeviceIds = new Set(outputDevices.map(d => d.deviceId))

      if (audioSettings.inputDevice !== 'default' && !inputDeviceIds.has(audioSettings.inputDevice)) {
        onAudioSettingsChange({ ...audioSettings, inputDevice: 'default' })
        toast.warning('Saved input device not found. Reset to Default.')
      }

      if (audioSettings.outputDevice !== 'default' && !outputDeviceIds.has(audioSettings.outputDevice)) {
        onAudioSettingsChange({ ...audioSettings, outputDevice: 'default' })
        toast.warning('Saved output device not found. Reset to Default.')
      }
    } catch (err) {
      toast.error('Failed to access audio devices')
    }
  }

  const handleConnect = () => {
    if (!serverUrl.trim()) {
      toast.error('Please enter a server URL')
      return
    }
    if (!username.trim()) {
      toast.error('Please enter a username')
      return
    }
    if (!authCode.trim()) {
      toast.error('Please enter your auth code (use /vc login in-game)')
      return
    }
    if (selectedServerId) {
      markUsed(selectedServerId)
    }
    onConnect(serverUrl, username, authCode)
  }

  // Hardware Engine content - shared between modal and inline display
  const HardwareEngineContent = () => (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="input-device" className="text-[10px] text-slate-500 uppercase px-1 font-bold">
            Input Device
          </Label>
          <select
            id="input-device"
            value={audioSettings.inputDevice}
            onChange={(event) => onAudioSettingsChange({ ...audioSettings, inputDevice: event.target.value })}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-2 text-[11px] outline-none focus:ring-1 ring-indigo-500 text-slate-300 transition-all cursor-pointer hover:border-slate-700 shadow-inner"
          >
            <option value="default">Default - System Mic</option>
            {audioDevices.inputDevices.map(device => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Microphone ${device.deviceId.slice(0, 8)}`}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <Label htmlFor="output-device" className="text-[10px] text-slate-500 uppercase px-1 font-bold">
            Output Device
          </Label>
          <select
            id="output-device"
            value={audioSettings.outputDevice}
            onChange={(event) => onAudioSettingsChange({ ...audioSettings, outputDevice: event.target.value })}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-2 text-[11px] outline-none focus:ring-1 ring-indigo-500 text-slate-300 transition-all cursor-pointer hover:border-slate-700 shadow-inner"
          >
            <option value="default">Default - System Speakers</option>
            {audioDevices.outputDevices.map(device => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Output ${device.deviceId.slice(0, 8)}`}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-[10px] font-bold text-slate-400">
          <span className="flex items-center gap-1.5 uppercase tracking-tighter">
            <MicrophoneIcon size={12} weight="bold" /> Mic Sensitivity
          </span>
          <span>{audioSettings.inputVolume}%</span>
        </div>
        <input
          id="input-volume"
          type="range"
          value={audioSettings.inputVolume}
          onChange={(event) => onAudioSettingsChange({ ...audioSettings, inputVolume: Number(event.target.value) })}
          className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
        />
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-[10px] font-bold text-slate-400">
          <span className="flex items-center gap-1.5 uppercase tracking-tighter">
            <SpeakerHighIcon size={12} weight="bold" /> Master Output
          </span>
          <span>{audioSettings.outputVolume}%</span>
        </div>
        <input
          id="output-volume"
          type="range"
          value={audioSettings.outputVolume}
          onChange={(event) => onAudioSettingsChange({ ...audioSettings, outputVolume: Number(event.target.value) })}
          className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
        />
      </div>

      <VoiceActivityMonitor
        variant="compact"
        audioSettings={audioSettings}
        enabled={true}
        onSpeakingChange={onSpeakingChange}
        enableAudioCapture={enableAudioCapture}
        onAudioData={onAudioData}
        useVadThreshold={useVadThreshold}
        onVadThresholdChange={setUseVadThreshold}
      />

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onAudioSettingsChange({ ...audioSettings, echoCancellation: !audioSettings.echoCancellation })}
          className={`text-[9px] font-black uppercase py-2 rounded-lg border transition-all ${
            audioSettings.echoCancellation
              ? 'bg-indigo-500/10 border-indigo-500/50 text-indigo-400'
              : 'bg-slate-950 border-slate-800 text-slate-600'
          }`}
        >
          Echo Cancel
        </button>
        <button
          type="button"
          onClick={() => onAudioSettingsChange({ ...audioSettings, noiseSuppression: !audioSettings.noiseSuppression })}
          className={`text-[9px] font-black uppercase py-2 rounded-lg border transition-all ${
            audioSettings.noiseSuppression
              ? 'bg-indigo-500/10 border-indigo-500/50 text-indigo-400'
              : 'bg-slate-950 border-slate-800 text-slate-600'
          }`}
        >
          Noise Supp
        </button>
        <button
          type="button"
          onClick={() => onAudioSettingsChange({ ...audioSettings, autoGainControl: !audioSettings.autoGainControl })}
          className={`text-[9px] font-black uppercase py-2 rounded-lg border transition-all ${
            audioSettings.autoGainControl
              ? 'bg-indigo-500/10 border-indigo-500/50 text-indigo-400'
              : 'bg-slate-950 border-slate-800 text-slate-600'
          }`}
        >
          Auto Gain
        </button>
        <button
          type="button"
          onClick={() => setUseVadThreshold((prev) => !prev)}
          className={`text-[9px] font-black uppercase py-2 rounded-lg border transition-all ${
            useVadThreshold
              ? 'bg-indigo-500/10 border-indigo-500/50 text-indigo-400'
              : 'bg-slate-950 border-slate-800 text-slate-600'
          }`}
        >
          Voice Det
        </button>
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Connection Panel - VOX_COMM Style - Show when NOT connected */}
      {!isConnected && (
      <div className="space-y-3 bg-secondary/40 p-4 rounded-xl border border-border/50 shadow-inner">
        {/* Saved Servers Dropdown */}
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground uppercase px-1 font-bold tracking-wider">Saved Servers</label>
          <div className="flex gap-2">
            <Select 
              value={selectedServerId || 'new'} 
              onValueChange={handleSelectServer}
              disabled={connectionState.status === 'connected' || connectionState.status === 'connecting'}
            >
              <SelectTrigger className="flex-1 bg-background border-border text-xs h-9">
                <SelectValue placeholder="Select a saved server" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new">New Connection...</SelectItem>
                {serverOptions.map(server => (
                  <SelectItem key={server.id} value={server.id}>
                    {server.nickname}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {/* Action buttons */}
            {!selectedServerId ? (
              <Button
                variant="outline"
                size="icon"
                onClick={handleSaveServer}
                disabled={connectionState.status === 'connected' || connectionState.status === 'connecting'}
                title="Save as new server"
                className="h-9 w-9 shrink-0"
              >
                <FloppyDiskIcon size={16} weight="bold" />
              </Button>
            ) : isEditing ? (
              <>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleUpdateServer}
                  disabled={connectionState.status === 'connected' || connectionState.status === 'connecting'}
                  title="Save changes"
                  className="h-9 w-9 shrink-0 text-accent"
                >
                  <FloppyDiskIcon size={16} weight="bold" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCancelEdit}
                  disabled={connectionState.status === 'connected' || connectionState.status === 'connecting'}
                  title="Cancel editing"
                  className="h-9 w-9 shrink-0"
                >
                  ✕
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleStartEdit}
                  disabled={connectionState.status === 'connected' || connectionState.status === 'connecting'}
                  title="Edit server"
                  className="h-9 w-9 shrink-0"
                >
                  <PencilSimpleIcon size={16} weight="bold" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleDeleteServer}
                  disabled={connectionState.status === 'connected' || connectionState.status === 'connecting'}
                  title="Delete server"
                  className="h-9 w-9 shrink-0"
                >
                  <TrashIcon size={16} weight="bold" className="text-destructive" />
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Server Nickname - show when new or editing */}
        {(!selectedServerId || isEditing) && (
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground uppercase px-1 font-bold tracking-wider">
              Nickname {selectedServerId ? '' : '(optional)'}
            </label>
            <input
              type="text"
              placeholder="My Server"
              value={serverNickname}
              onChange={(e) => setServerNickname(e.target.value)}
              disabled={connectionState.status === 'connected' || connectionState.status === 'connecting'}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs focus:ring-1 ring-accent outline-none transition-all disabled:opacity-50"
            />
          </div>
        )}

        {/* Host Address */}
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground uppercase px-1 font-bold tracking-wider">Host Address</label>
          <div className="relative">
            <input
              type={showHost ? "text" : "password"}
              placeholder="localhost:24455"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              disabled={connectionState.status === 'connected' || connectionState.status === 'connecting'}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 pr-9 text-xs focus:ring-1 ring-accent outline-none transition-all disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => setShowHost(!showHost)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label={showHost ? "Hide host address" : "Show host address"}
              aria-pressed={showHost}
            >
              {showHost ? <EyeIcon size={14} /> : <EyeSlashIcon size={14} />}
            </button>
          </div>
        </div>

        {/* Username and Auth Code side by side */}
        <div className="flex gap-2">
          <div className="flex-1 space-y-1">
            <label className="text-[10px] text-muted-foreground uppercase px-1 font-bold tracking-wider">Username</label>
            <input
              type="text"
              placeholder="Your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={connectionState.status === 'connected' || connectionState.status === 'connecting'}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs focus:ring-1 ring-accent outline-none transition-all disabled:opacity-50"
            />
          </div>
          <div className="w-24 space-y-1">
            <label className="text-[10px] text-muted-foreground uppercase px-1 font-bold tracking-wider">Auth</label>
            <div className="relative">
              <input
                type={showAuthCode ? "text" : "password"}
                placeholder="CODE"
                value={authCode}
                onChange={(e) => setAuthCode(e.target.value.toUpperCase())}
                disabled={connectionState.status === 'connected' || connectionState.status === 'connecting'}
                maxLength={6}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 pr-8 text-xs font-mono uppercase tracking-widest focus:ring-1 ring-accent outline-none transition-all disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowAuthCode(!showAuthCode)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={showAuthCode ? "Hide authentication code" : "Show authentication code"}
                aria-pressed={showAuthCode}
              >
                {showAuthCode ? <EyeIcon size={12} /> : <EyeSlashIcon size={12} />}
              </button>
            </div>
          </div>
        </div>

        {/* Connect/Disconnect Button */}
        <button 
          onClick={connectionState.status === 'connected' ? onDisconnect : handleConnect}
          disabled={connectionState.status === 'connecting'}
          className={`w-full py-2.5 rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-95 ${
            connectionState.status === 'connected' 
              ? 'bg-destructive/10 text-destructive border border-destructive/50 hover:bg-destructive/20' 
              : 'bg-accent hover:bg-accent/90 text-accent-foreground shadow-lg shadow-accent/20'
          }`}
        >
          {connectionState.status === 'connecting' ? (
            <div className="w-4 h-4 border-2 border-accent-foreground/30 border-t-accent-foreground rounded-full animate-spin" />
          ) : (
            <PowerIcon size={14} weight="bold" />
          )}
          {connectionState.status === 'connected' ? 'Terminate Session' : 'Establish Link'}
        </button>

        {/* Error message */}
        {connectionState.status === 'error' && connectionState.errorMessage && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-2 text-[10px] text-destructive">
            {connectionState.errorMessage}
          </div>
        )}
      </div>
      )}

      {/* Configure Audio Button & Modal - Show when NOT connected */}
      {!isConnected && (
        <>
          <button
            onClick={() => setAudioModalOpen(true)}
            className="w-full py-2.5 rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition-all bg-secondary/40 border border-border/50 text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
          >
            <GearIcon size={14} weight="bold" />
            Configure Audio
          </button>

          <Dialog open={audioModalOpen} onOpenChange={setAudioModalOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-sm">
                  <MicrophoneIcon size={18} weight="bold" className="text-accent" />
                  Audio Configuration
                </DialogTitle>
              </DialogHeader>
              <HardwareEngineContent />
            </DialogContent>
          </Dialog>
        </>
      )}

      {/* Hardware Engine - Show inline when connected */}
      {isConnected && (
      <div className="space-y-4">
        {/* Connection Info Banner */}
        <div className="flex items-center justify-between bg-accent/10 border border-accent/30 rounded-lg px-3 py-2">
          <button
            onClick={() => setShowConnectionUrl(!showConnectionUrl)}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            title={showConnectionUrl ? 'Click to hide URL' : 'Click to show URL'}
          >
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-medium text-accent">
              {showConnectionUrl 
                ? `Connected to ${serverUrl}`
                : `Connected to ${serverNickname || servers.find(s => s.url === serverUrl)?.nickname || '••••••••'}`
              }
            </span>
          </button>
          <button
            onClick={onDisconnect}
            className="text-[10px] font-bold uppercase text-destructive hover:text-destructive/80 transition-colors"
          >
            Disconnect
          </button>
        </div>

        <h2 className="text-[10px] uppercase font-black text-muted-foreground tracking-widest">
          Hardware Engine
        </h2>

        <HardwareEngineContent />
      </div>
      )}
    </div>
  )
}

export default memo(ConnectionView)
