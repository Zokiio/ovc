import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { 
  Microphone, 
  SpeakerHigh, 
  WifiHigh, 
  WifiSlash, 
  Plugs,
  CircleNotch,
  CheckCircle,
  WarningCircle
} from '@phosphor-icons/react'
import { ConnectionState, AudioSettings } from '@/lib/types'
import { toast } from 'sonner'
import { VoiceActivityMonitor } from '@/components/VoiceActivityMonitor'

interface ConnectionViewProps {
  connectionState: ConnectionState
  audioSettings: AudioSettings
  onConnect: (serverUrl: string, username: string) => void
  onDisconnect: () => void
  onAudioSettingsChange: (settings: AudioSettings) => void
}

export function ConnectionView({
  connectionState,
  audioSettings,
  onConnect,
  onDisconnect,
  onAudioSettingsChange
}: ConnectionViewProps) {
  const [serverUrl, setServerUrl] = useState(connectionState.serverUrl)
  const [username, setUsername] = useState('')
  const [audioDevices, setAudioDevices] = useState<{ inputDevices: MediaDeviceInfo[], outputDevices: MediaDeviceInfo[] }>({
    inputDevices: [],
    outputDevices: []
  })
  const [micLevel, setMicLevel] = useState(0)
  const [isTesting, setIsTesting] = useState(false)

  useEffect(() => {
    enumerateDevices()
  }, [])

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
    onConnect(serverUrl, username)
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
        return <CheckCircle size={20} weight="fill" className="text-accent" />
      case 'connecting':
        return <CircleNotch size={20} weight="bold" className="text-muted-foreground animate-spin" />
      case 'error':
        return <WarningCircle size={20} weight="fill" className="text-destructive" />
      default:
        return <WifiSlash size={20} weight="bold" className="text-muted-foreground" />
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
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-3">
                <Plugs size={24} weight="bold" />
                Server Connection
              </CardTitle>
              <CardDescription>Connect to a WebRTC SFU server</CardDescription>
            </div>
            {getStatusBadge()}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              type="text"
              placeholder="Your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={connectionState.status === 'connected' || connectionState.status === 'connecting'}
            />
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
                  <WifiSlash size={20} weight="bold" />
                  Disconnect
                </Button>
              ) : (
                <Button 
                  onClick={handleConnect}
                  disabled={connectionState.status === 'connecting'}
                  className="min-w-[120px] bg-accent text-accent-foreground hover:bg-accent/90"
                >
                  <WifiHigh size={20} weight="bold" />
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
      </Card>

      <VoiceActivityMonitor audioSettings={audioSettings} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <Microphone size={24} weight="bold" />
            Microphone Settings
          </CardTitle>
          <CardDescription>Configure your input device and audio processing</CardDescription>
        </CardHeader>
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
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <SpeakerHigh size={24} weight="bold" />
            Audio Output Settings
          </CardTitle>
          <CardDescription>Configure your output device and volume</CardDescription>
        </CardHeader>
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
      </Card>
    </div>
  )
}
