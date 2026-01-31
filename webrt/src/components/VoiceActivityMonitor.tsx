import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Waveform, XCircle, SunDim, Buildings, Wind, Lightning, MicrophoneStage, Info } from '@phosphor-icons/react'
import { AudioSettings, VADSettings } from '@/lib/types'
import { useVoiceActivity } from '@/hooks/use-voice-activity'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

interface VoiceActivityMonitorProps {
  audioSettings: AudioSettings
}

type EnvironmentPreset = {
  name: string
  icon: typeof SunDim
  description: string
  settings: VADSettings
}

const ENVIRONMENT_PRESETS: EnvironmentPreset[] = [
  {
    name: 'Quiet',
    icon: SunDim,
    description: 'Low background noise, studio or quiet room',
    settings: {
      threshold: 0.08,
      minSpeechDuration: 80,
      minSilenceDuration: 250,
      smoothingTimeConstant: 0.75
    }
  },
  {
    name: 'Normal',
    icon: Buildings,
    description: 'Moderate noise, typical office or home',
    settings: {
      threshold: 0.15,
      minSpeechDuration: 120,
      minSilenceDuration: 350,
      smoothingTimeConstant: 0.8
    }
  },
  {
    name: 'Noisy',
    icon: Wind,
    description: 'High background noise, café or busy area',
    settings: {
      threshold: 0.28,
      minSpeechDuration: 150,
      minSilenceDuration: 400,
      smoothingTimeConstant: 0.85
    }
  }
]

export function VoiceActivityMonitor({ audioSettings }: VoiceActivityMonitorProps) {
  const [vadEnabled, setVadEnabled] = useState(true)
  const [vadSettings, setVadSettings] = useState<VADSettings>({
    threshold: 0.15,
    minSpeechDuration: 100,
    minSilenceDuration: 300,
    smoothingTimeConstant: 0.8
  })
  
  const [threshold, setThreshold] = useState(vadSettings?.threshold || 0.15)
  const [minSpeechDuration, setMinSpeechDuration] = useState(vadSettings?.minSpeechDuration || 100)
  const [minSilenceDuration, setMinSilenceDuration] = useState(vadSettings?.minSilenceDuration || 300)
  const [smoothingTimeConstant, setSmoothingTimeConstant] = useState(vadSettings?.smoothingTimeConstant || 0.8)
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const {
    isSpeaking,
    audioLevel,
    isInitialized,
    error,
    startListening,
    stopListening
  } = useVoiceActivity({
    enabled: vadEnabled,
    audioSettings,
    threshold,
    minSpeechDuration,
    minSilenceDuration,
    smoothingTimeConstant
  })

  useEffect(() => {
    if (vadSettings) {
      setThreshold(vadSettings.threshold)
      setMinSpeechDuration(vadSettings.minSpeechDuration)
      setMinSilenceDuration(vadSettings.minSilenceDuration)
      setSmoothingTimeConstant(vadSettings.smoothingTimeConstant)
    }
  }, [vadSettings])

  useEffect(() => {
    const saveTimeout = setTimeout(() => {
      setVadSettings({
        threshold,
        minSpeechDuration,
        minSilenceDuration,
        smoothingTimeConstant
      })
    }, 500)

    return () => clearTimeout(saveTimeout)
  }, [threshold, minSpeechDuration, minSilenceDuration, smoothingTimeConstant, setVadSettings])

  const handleToggleVAD = async () => {
    if (vadEnabled) {
      stopListening()
      setVadEnabled(false)
    } else {
      setVadEnabled(true)
      await startListening()
    }
  }

  const applyPreset = (preset: EnvironmentPreset) => {
    setThreshold(preset.settings.threshold)
    setMinSpeechDuration(preset.settings.minSpeechDuration)
    setMinSilenceDuration(preset.settings.minSilenceDuration)
    setSmoothingTimeConstant(preset.settings.smoothingTimeConstant)
    toast.success(`Applied ${preset.name} environment preset`)
  }

  const getSensitivityLabel = () => {
    if (threshold < 0.12) return 'Very Sensitive'
    if (threshold < 0.20) return 'Balanced'
    if (threshold < 0.30) return 'Less Sensitive'
    return 'Minimal Sensitivity'
  }

  const getSensitivityColor = () => {
    if (threshold < 0.12) return 'text-accent'
    if (threshold < 0.20) return 'text-accent'
    if (threshold < 0.30) return 'text-muted-foreground'
    return 'text-muted-foreground'
  }

  useEffect(() => {
    return () => {
      if (vadEnabled && stopListening) {
        stopListening()
      }
    }
  }, [])

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <CardTitle className="flex items-center gap-3 mb-2">
              <div className={cn(
                "p-2 rounded-lg transition-all",
                vadEnabled && isInitialized 
                  ? "bg-accent/20 text-accent" 
                  : "bg-muted text-muted-foreground"
              )}>
                <Waveform size={20} weight="bold" />
              </div>
              Voice Activity Detection
            </CardTitle>
            <CardDescription>Real-time speech monitoring for optimal voice transmission</CardDescription>
          </div>
          <Badge 
            variant={isInitialized ? 'default' : 'outline'} 
            className={cn(
              "gap-2 transition-all",
              isInitialized && "bg-accent/20 text-accent border-accent/40"
            )}
          >
            {isInitialized ? (
              <>
                <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                Active
              </>
            ) : (
              <>
                <div className="w-2 h-2 rounded-full bg-muted-foreground/40" />
                Inactive
              </>
            )}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {!vadEnabled ? (
          <div className="space-y-4">
            <div className="rounded-xl bg-gradient-to-br from-accent/10 via-accent/5 to-transparent border-2 border-accent/20 p-8 text-center space-y-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-accent/20 mb-2">
                <MicrophoneStage size={32} weight="duotone" className="text-accent" />
              </div>
              <div className="space-y-2">
                <h3 className="font-bold text-lg">Enable Voice Detection</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Activate real-time monitoring to detect when you're speaking and automatically manage voice transmission
                </p>
              </div>
              <Button 
                onClick={handleToggleVAD}
                size="lg"
                className="bg-accent text-accent-foreground hover:bg-accent/90 gap-2 mt-2"
              >
                <Lightning size={20} weight="fill" />
                Start Voice Detection
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {ENVIRONMENT_PRESETS.map((preset) => {
                const Icon = preset.icon
                return (
                  <div
                    key={preset.name}
                    className="rounded-lg border border-border/50 p-4 text-center space-y-2 bg-card/50"
                  >
                    <Icon size={24} weight="duotone" className="mx-auto text-muted-foreground" />
                    <div>
                      <p className="text-xs font-semibold text-foreground">{preset.name}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">{preset.description}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <>
            {error && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-4 text-sm text-destructive flex items-start gap-3">
                <XCircle size={20} weight="fill" className="flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold mb-1">Microphone Access Error</p>
                  <p className="text-xs opacity-90">{error}</p>
                </div>
              </div>
            )}

            {isInitialized && (
              <>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-semibold">Live Audio Monitor</Label>
                  </div>

                  <div className="relative rounded-xl overflow-hidden border-2 border-border bg-card p-5">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground font-mono">
                          Level: <span className="font-bold text-foreground">{(audioLevel * 100).toFixed(0)}%</span>
                        </span>
                      </div>

                      <div className="relative">
                        <div className="h-12 rounded-lg overflow-hidden bg-muted/50 border border-border">
                          <div 
                            className={cn(
                              "h-full transition-all duration-100",
                              audioLevel > threshold 
                                ? "bg-accent shadow-[inset_0_0_12px_rgba(255,255,255,0.3)]" 
                                : "bg-muted-foreground/60"
                            )}
                            style={{ 
                              width: `${Math.min(100, audioLevel * 100)}%`,
                            }}
                          />
                        </div>
                        
                        <div 
                          className="absolute inset-y-0 w-0.5 bg-destructive/70 z-10 transition-all"
                          style={{ left: `${Math.min(100, threshold * 100)}%` }}
                        >
                          <div className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-mono text-destructive">
                            Threshold
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <div>
                    <Label className="text-sm font-semibold mb-3 block">Quick Environment Presets</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {ENVIRONMENT_PRESETS.map((preset) => {
                        const Icon = preset.icon
                        const isActive = 
                          Math.abs(threshold - preset.settings.threshold) < 0.01 &&
                          Math.abs(minSpeechDuration - preset.settings.minSpeechDuration) < 10 &&
                          Math.abs(minSilenceDuration - preset.settings.minSilenceDuration) < 10
                        
                        return (
                          <Button
                            key={preset.name}
                            variant={isActive ? "default" : "outline"}
                            size="sm"
                            onClick={() => applyPreset(preset)}
                            className={cn(
                              "h-auto flex-col gap-2 py-3 transition-all",
                              isActive && "bg-accent text-accent-foreground hover:bg-accent/90 shadow-lg shadow-accent/20 scale-105"
                            )}
                          >
                            <Icon size={22} weight={isActive ? "fill" : "duotone"} />
                            <span className="text-xs font-bold">{preset.name}</span>
                          </Button>
                        )
                      })}
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="vad-threshold" className="text-sm font-semibold">Detection Threshold</Label>
                    <Badge 
                      variant="outline"
                      className={cn(
                        "font-mono text-xs",
                        audioLevel > threshold && "bg-accent/20 text-accent border-accent/50"
                      )}
                    >
                      {(threshold * 100).toFixed(0)}%
                    </Badge>
                  </div>
                  
                  <Slider
                    id="vad-threshold"
                    value={[threshold * 100]}
                    onValueChange={([value]) => setThreshold(value / 100)}
                    min={3}
                    max={50}
                    step={1}
                    className="w-full"
                  />
                  
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground px-1">
                    <span>More Sensitive</span>
                    <span>Less Sensitive</span>
                  </div>
                </div>

                <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
                  <CollapsibleTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="w-full justify-between font-semibold"
                    >
                      <span className="flex items-center gap-2">
                        <Info size={16} weight="fill" />
                        Advanced Settings
                      </span>
                      <span className={cn(
                        "transition-transform duration-200",
                        advancedOpen && "rotate-180"
                      )}>
                        ▼
                      </span>
                    </Button>
                  </CollapsibleTrigger>
                  
                  <CollapsibleContent className="space-y-4 pt-4">
                    <Separator />

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="smoothing" className="text-sm">Signal Smoothing</Label>
                        <span className="text-xs text-muted-foreground font-mono">
                          {smoothingTimeConstant.toFixed(2)}
                        </span>
                      </div>
                      <Slider
                        id="smoothing"
                        value={[smoothingTimeConstant * 100]}
                        onValueChange={([value]) => setSmoothingTimeConstant(value / 100)}
                        min={60}
                        max={95}
                        step={1}
                        className="w-full"
                      />
                      <p className="text-xs text-muted-foreground">
                        Higher values reduce audio fluctuations for steadier detection
                      </p>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="min-speech" className="text-sm">Minimum Speech Duration</Label>
                        <span className="text-xs text-muted-foreground font-mono">
                          {minSpeechDuration}ms
                        </span>
                      </div>
                      <Slider
                        id="min-speech"
                        value={[minSpeechDuration]}
                        onValueChange={([value]) => setMinSpeechDuration(value)}
                        min={0}
                        max={500}
                        step={10}
                        className="w-full"
                      />
                      <p className="text-xs text-muted-foreground">
                        Audio must exceed threshold for this duration to trigger speaking
                      </p>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="min-silence" className="text-sm">Minimum Silence Duration</Label>
                        <span className="text-xs text-muted-foreground font-mono">
                          {minSilenceDuration}ms
                        </span>
                      </div>
                      <Slider
                        id="min-silence"
                        value={[minSilenceDuration]}
                        onValueChange={([value]) => setMinSilenceDuration(value)}
                        min={100}
                        max={1000}
                        step={25}
                        className="w-full"
                      />
                      <p className="text-xs text-muted-foreground">
                        Silence must persist for this duration before ending speaking state
                      </p>
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                <div className="flex items-center justify-center pt-2">
                  <Button 
                    onClick={handleToggleVAD}
                    variant="outline"
                    size="sm"
                    className="gap-2 border-destructive/50 text-destructive hover:bg-destructive/10"
                  >
                    <XCircle size={16} weight="fill" />
                    Stop Voice Detection
                  </Button>
                </div>
              </>
            )}

            {!isInitialized && !error && (
              <div className="text-center py-8 space-y-3">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-muted animate-pulse">
                  <Waveform size={24} weight="bold" className="text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">Initializing voice detection...</p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
