import { useState, useEffect, useMemo, memo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { 
  MicrophoneIcon, 
  SpeakerHighIcon, 
  WifiHighIcon, 
  WifiSlashIcon, 
  PlugsIcon,
  CircleNotchIcon,
  CheckCircleIcon,
  WarningCircleIcon,
  FloppyDiskIcon,
  TrashIcon,
  PencilSimpleIcon,
  CaretDownIcon,
  WaveformIcon
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
  const [micLevel, setMicLevel] = useState(0)
  const [isTesting, setIsTesting] = useState(false)
  const [micSettingsOpen, setMicSettingsOpen] = useState(false)
  const [outputSettingsOpen, setOutputSettingsOpen] = useState(false)
  const [vadOpen, setVadOpen] = useState(false)
  const [connectionOpen, setConnectionOpen] = useState(true)
  
  const { servers, addServer, updateServer, removeServer, markUsed } = useSavedServers()

  // Memoize server options to prevent dropdown sluggishness
  const serverOptions = useMemo(() => {
    return servers.map(server => ({
      id: server.id,
      nickname: server.nickname
    }))
  }, [servers])

  useEffect(() => {
    enumerateDevices()
  }, [])

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
      await navigator.mediaDevices.getUserMedia({ audio: true })
      const devices = await navigator.mediaDevices.enumerateDevices()
      const inputDevices = devices.filter(d => d.kind === 'audioinput')
      const outputDevices = devices.filter(d => d.kind === 'audiooutput')
      setAudioDevices({ inputDevices, outputDevices })
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

  const testMicrophone = async () => {
    setIsTesting(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          deviceId: audioSettings.inputDevice ? { exact: audioSettings.inputDevice } : undefined,
          echoCancellation: audioSettings.echoCancellation,
          noiseSuppression: audioSettings.noiseSuppression,
          autoGainControl: audioSettings.autoGainControl
        } 
      })
      
      const audioContext = new AudioContext()
      const analyser = audioContext.createAnalyser()
      const microphone = audioContext.createMediaStreamSource(stream)
      microphone.connect(analyser)
      analyser.fftSize = 256
      
      const dataArray = new Uint8Array(analyser.frequencyBinCount)
      
      const updateLevel = () => {
        analyser.getByteFrequencyData(dataArray)
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length
        setMicLevel(Math.min(100, (average / 128) * 100))
        
        if (isTesting) {
          requestAnimationFrame(updateLevel)
        }
      }
      
      updateLevel()
      
      setTimeout(() => {
        setIsTesting(false)
        setMicLevel(0)
        stream.getTracks().forEach(track => track.stop())
        audioContext.close()
      }, 5000)
    } catch (err) {
      toast.error('Failed to access microphone')
      setIsTesting(false)
    }
  }

  const getStatusIcon = () => {
    switch (connectionState.status) {
      case 'connected':
        return <CheckCircleIcon size={20} weight="fill" className="text-accent" />
      case 'connecting':
        return <CircleNotchIcon size={20} weight="bold" className="text-muted-foreground animate-spin" />
      case 'error':
        return <WarningCircleIcon size={20} weight="fill" className="text-destructive" />
      default:
        return <WifiSlashIcon size={20} weight="bold" className="text-muted-foreground" />
    }
  }

  const getStatusBadge = () => {
    const variants: Record<ConnectionState['status'], { variant: 'default' | 'secondary' | 'destructive' | 'outline', text: string }> = {
      connected: { variant: 'default', text: 'Connected' },
      connecting: { variant: 'secondary', text: 'Connecting...' },
      disconnected: { variant: 'outline', text: 'Disconnected' },
      error: { variant: 'destructive', text: 'Connection Error' }
    }
    
    const { variant, text } = variants[connectionState.status]
    return (
      <Badge variant={variant} className="gap-2">
        {getStatusIcon()}
        {text}
      </Badge>
    )
  }

  return (
    <div className="space-y-6">
      <Collapsible open={connectionOpen} onOpenChange={setConnectionOpen}>
        <Card>
          <CardHeader>
            <CollapsibleTrigger asChild>
              <div className="flex items-center justify-between cursor-pointer hover:opacity-80 transition-opacity">
                <div className="flex-1">
                  <CardTitle className="flex items-center gap-3">
                    <PlugsIcon size={24} weight="bold" />
                    Server Connection
                  </CardTitle>
                  <CardDescription>Connect to a WebRTC SFU server</CardDescription>
                </div>
                <div className="flex items-center gap-3">
                  {getStatusBadge()}
                  {connectionState.status === 'connected' && (
                    <CaretDownIcon 
                      size={20} 
                      weight="bold"
                      className={`transition-transform duration-200 ${connectionOpen ? '' : '-rotate-90'}`}
                    />
                  )}
                </div>
              </div>
            </CollapsibleTrigger>
          </CardHeader>
          {(connectionState.status !== 'connected' || connectionOpen) && (
            <CollapsibleContent>
              <CardContent className="space-y-4">
                {/* Saved Servers */}
          <div className="space-y-2">
            <Label htmlFor="saved-servers">Saved Servers</Label>
            <div className="flex gap-2">
              <Select 
                value={selectedServerId || 'new'} 
                onValueChange={handleSelectServer}
                disabled={connectionState.status === 'connected' || connectionState.status === 'connecting'}
              >
                <SelectTrigger id="saved-servers" className="flex-1">
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
              
              {/* Action buttons based on state */}
              {!selectedServerId ? (
                // New connection - show save button
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleSaveServer}
                  disabled={connectionState.status === 'connected' || connectionState.status === 'connecting'}
                  title="Save as new server"
                >
                  <FloppyDiskIcon size={20} weight="bold" />
                </Button>
              ) : isEditing ? (
                // Editing existing - show save/cancel
                <>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleUpdateServer}
                    disabled={connectionState.status === 'connected' || connectionState.status === 'connecting'}
                    title="Save changes"
                    className="text-accent"
                  >
                    <FloppyDiskIcon size={20} weight="bold" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleCancelEdit}
                    disabled={connectionState.status === 'connected' || connectionState.status === 'connecting'}
                    title="Cancel editing"
                  >
                    ✕
                  </Button>
                </>
              ) : (
                // Selected but not editing - show edit/delete
                <>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleStartEdit}
                    disabled={connectionState.status === 'connected' || connectionState.status === 'connecting'}
                    title="Edit server"
                  >
                    <PencilSimpleIcon size={20} weight="bold" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleDeleteServer}
                    disabled={connectionState.status === 'connected' || connectionState.status === 'connecting'}
                    title="Delete server"
                  >
                    <TrashIcon size={20} weight="bold" className="text-destructive" />
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Server Nickname - show when new or editing */}
          {(!selectedServerId || isEditing) && (
            <div className="space-y-2">
              <Label htmlFor="server-nickname">Server Nickname {selectedServerId ? '' : '(optional)'}</Label>
              <Input
                id="server-nickname"
                type="text"
                placeholder="My Server"
                value={serverNickname}
                onChange={(e) => setServerNickname(e.target.value)}
                disabled={connectionState.status === 'connected' || connectionState.status === 'connecting'}
              />
            </div>
          )}

          <Separator />

          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              type="text"
              placeholder="Your in-game username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={connectionState.status === 'connected' || connectionState.status === 'connecting'}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="auth-code">Auth Code</Label>
            <Input
              id="auth-code"
              type="text"
              placeholder="Use /vc login in-game to get your code"
              value={authCode}
              onChange={(e) => setAuthCode(e.target.value.toUpperCase())}
              disabled={connectionState.status === 'connected' || connectionState.status === 'connecting'}
              maxLength={6}
              className="font-mono uppercase tracking-widest"
            />
            <p className="text-xs text-muted-foreground">Type /vc login in Hytale to get your permanent auth code</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="server-url">Server URL</Label>
            <div className="flex gap-2">
              <Input
                id="server-url"
                type="text"
                placeholder="localhost:24455"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                disabled={connectionState.status === 'connected' || connectionState.status === 'connecting'}
              />
              {connectionState.status === 'connected' ? (
                <Button 
                  onClick={onDisconnect}
                  variant="destructive"
                  className="min-w-[120px]"
                >
                  <WifiSlashIcon size={20} weight="bold" />
                  Disconnect
                </Button>
              ) : (
                <Button 
                  onClick={handleConnect}
                  disabled={connectionState.status === 'connecting'}
                  className="min-w-[120px] bg-accent text-accent-foreground hover:bg-accent/90"
                >
                  <WifiHighIcon size={20} weight="bold" />
                  Connect
                </Button>
              )}
            </div>
          </div>

          {connectionState.status === 'connected' && connectionState.latency !== undefined && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Latency:</span>
              <Badge variant="secondary" className="font-mono">
                {connectionState.latency}ms
              </Badge>
            </div>
          )}

          {connectionState.status === 'error' && connectionState.errorMessage && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
              {connectionState.errorMessage}
            </div>
          )}
              </CardContent>
            </CollapsibleContent>
          )}
        </Card>
      </Collapsible>

      {/* Always render VoiceActivityMonitor so the hook runs for audio capture */}
      {/* UI visibility controlled separately */}
      {!vadOpen ? (
        <Card className="cursor-pointer hover:bg-accent/5 transition-colors" onClick={() => setVadOpen(true)}>
          <CardHeader className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <WaveformIcon size={24} weight="bold" />
                <CardTitle>Voice Activity Detection</CardTitle>
              </div>
              <CaretDownIcon size={20} weight="bold" />
            </div>
          </CardHeader>
        </Card>
      ) : null}

      {/* VAD section - always render VoiceActivityMonitor for audio capture */}
      <div className={vadOpen ? "relative" : "hidden"}>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setVadOpen(false)}
          className="absolute top-4 right-4 z-10 h-8 w-8 hover:bg-accent/10"
        >
          <CaretDownIcon 
            size={16} 
            weight="bold" 
            className="rotate-180"
          />
        </Button>
        <VoiceActivityMonitor 
          audioSettings={audioSettings} 
          onSpeakingChange={onSpeakingChange}
          enableAudioCapture={enableAudioCapture}
          onAudioData={onAudioData}
        />
      </div>

      <Collapsible open={micSettingsOpen} onOpenChange={setMicSettingsOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-accent/5 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-3">
                    <MicrophoneIcon size={24} weight="bold" />
                    Microphone Settings
                  </CardTitle>
                  <CardDescription>Configure your input device and audio processing</CardDescription>
                </div>
                <CaretDownIcon 
                  size={20} 
                  weight="bold" 
                  className={`transition-transform duration-200 ${micSettingsOpen ? 'rotate-180' : ''}`}
                />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="input-device">Input Device</Label>
            <Select 
              value={audioSettings.inputDevice} 
              onValueChange={(value) => onAudioSettingsChange({ ...audioSettings, inputDevice: value })}
            >
              <SelectTrigger id="input-device">
                <SelectValue placeholder="Select microphone" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default Microphone</SelectItem>
                {audioDevices.inputDevices.map(device => (
                  <SelectItem key={device.deviceId} value={device.deviceId}>
                    {device.label || `Microphone ${device.deviceId.slice(0, 8)}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="input-volume">Input Volume</Label>
              <span className="text-sm text-muted-foreground font-mono">
                {audioSettings.inputVolume}%
              </span>
            </div>
            <Slider
              id="input-volume"
              value={[audioSettings.inputVolume]}
              onValueChange={([value]) => onAudioSettingsChange({ ...audioSettings, inputVolume: value })}
              min={0}
              max={100}
              step={1}
              className="w-full"
            />
          </div>

          <div className="space-y-3">
            <Button 
              onClick={testMicrophone} 
              disabled={isTesting}
              variant="outline"
              className="w-full"
            >
              {isTesting ? 'Testing...' : 'Test Microphone'}
            </Button>
            
            {isTesting && (
              <div className="space-y-2">
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-accent transition-all duration-100"
                    style={{ width: `${micLevel}%` }}
                  />
                </div>
                <p className="text-xs text-center text-muted-foreground">
                  Speak into your microphone
                </p>
              </div>
            )}
          </div>

          <Separator />

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="echo-cancel">Echo Cancellation</Label>
                <p className="text-sm text-muted-foreground">Reduces echo feedback</p>
              </div>
              <Switch
                id="echo-cancel"
                checked={audioSettings.echoCancellation}
                onCheckedChange={(checked) => onAudioSettingsChange({ ...audioSettings, echoCancellation: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="noise-suppress">Noise Suppression</Label>
                <p className="text-sm text-muted-foreground">Filters background noise</p>
              </div>
              <Switch
                id="noise-suppress"
                checked={audioSettings.noiseSuppression}
                onCheckedChange={(checked) => onAudioSettingsChange({ ...audioSettings, noiseSuppression: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="auto-gain">Auto Gain Control</Label>
                <p className="text-sm text-muted-foreground">Normalizes volume levels</p>
              </div>
              <Switch
                id="auto-gain"
                checked={audioSettings.autoGainControl}
                onCheckedChange={(checked) => onAudioSettingsChange({ ...audioSettings, autoGainControl: checked })}
              />
            </div>
          </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Collapsible open={outputSettingsOpen} onOpenChange={setOutputSettingsOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-accent/5 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-3">
                    <SpeakerHighIcon size={24} weight="bold" />
                    Audio Output Settings
                  </CardTitle>
                  <CardDescription>Configure your output device and volume</CardDescription>
                </div>
                <CaretDownIcon 
                  size={20} 
                  weight="bold" 
                  className={`transition-transform duration-200 ${outputSettingsOpen ? 'rotate-180' : ''}`}
                />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="output-device">Output Device</Label>
            <Select 
              value={audioSettings.outputDevice} 
              onValueChange={(value) => onAudioSettingsChange({ ...audioSettings, outputDevice: value })}
            >
              <SelectTrigger id="output-device">
                <SelectValue placeholder="Select speakers/headphones" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default Output</SelectItem>
                {audioDevices.outputDevices.map(device => (
                  <SelectItem key={device.deviceId} value={device.deviceId}>
                    {device.label || `Output ${device.deviceId.slice(0, 8)}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="output-volume">Output Volume</Label>
              <span className="text-sm text-muted-foreground font-mono">
                {audioSettings.outputVolume}%
              </span>
            </div>
            <Slider
              id="output-volume"
              value={[audioSettings.outputVolume]}
              onValueChange={([value]) => onAudioSettingsChange({ ...audioSettings, outputVolume: value })}
              min={0}
              max={100}
              step={1}
              className="w-full"
            />
          </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
    </div>
  )
}

export default memo(ConnectionView)
