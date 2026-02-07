import { useState, useEffect, useRef } from 'react'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { WaveformIcon, XCircleIcon, SunDimIcon, BuildingsIcon, WindIcon, LightningIcon, MicrophoneStageIcon, InfoIcon, ChartBarIcon, HeadphonesIcon } from '@phosphor-icons/react'
import { AudioSettings, VADSettings } from '@/lib/types'
import { useVoiceActivity } from '@/hooks/use-voice-activity'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

const VAD_SETTINGS_STORAGE_KEY = 'ovc_vad_settings'
const VAD_SETTINGS_VERSION_KEY = 'ovc_vad_settings_version'
const VAD_SETTINGS_VERSION = 2 // Bump to force migration and overwrite all saved settings

const DEFAULT_VAD_SETTINGS: VADSettings = {
  threshold: 0.12,           // More sensitive default
  minSpeechDuration: 60,     // Fast attack (60ms) - quick speech detection
  minSilenceDuration: 400,   // Moderate release (400ms) - prevents cutoff
  smoothingTimeConstant: 0.75 // Less smoothing for responsiveness
}

function loadVADSettings(): VADSettings {
  try {
    const storedVersion = localStorage.getItem(VAD_SETTINGS_VERSION_KEY)
    const currentVersion = storedVersion ? parseInt(storedVersion, 10) : 0
    
    // Force migration: overwrite all saved settings if version is outdated
    if (currentVersion < VAD_SETTINGS_VERSION) {
      localStorage.setItem(VAD_SETTINGS_VERSION_KEY, String(VAD_SETTINGS_VERSION))
      localStorage.setItem(VAD_SETTINGS_STORAGE_KEY, JSON.stringify(DEFAULT_VAD_SETTINGS))
      return DEFAULT_VAD_SETTINGS
    }
    
    const stored = localStorage.getItem(VAD_SETTINGS_STORAGE_KEY)
    if (!stored) {
      return DEFAULT_VAD_SETTINGS
    }
    const parsed = JSON.parse(stored) as Partial<VADSettings>
    return { ...DEFAULT_VAD_SETTINGS, ...parsed }
  } catch {
    return DEFAULT_VAD_SETTINGS
  }
}

interface VoiceActivityMonitorProps {
  audioSettings: AudioSettings
  onSpeakingChange?: (isSpeaking: boolean) => void
  enableAudioCapture?: boolean
  onAudioData?: (audioData: string | ArrayBuffer) => void
  audioOutputFormat?: 'base64' | 'binary'
  variant?: 'full' | 'compact'
  enabled?: boolean
  onEnabledChange?: (enabled: boolean) => void
  useVadThreshold?: boolean
  onVadThresholdChange?: (useVadThreshold: boolean) => void
}

type EnvironmentPreset = {
  name: string
  icon: typeof SunDimIcon
  description: string
  settings: VADSettings
}

const ENVIRONMENT_PRESETS: EnvironmentPreset[] = [
  {
    name: 'Quiet',
    icon: SunDimIcon,
    description: 'Low background noise, studio or quiet room',
    settings: {
      threshold: 0.06,          // Very sensitive
      minSpeechDuration: 40,    // Very fast attack
      minSilenceDuration: 300,  // Quick release OK in quiet
      smoothingTimeConstant: 0.70
    }
  },
  {
    name: 'Normal',
    icon: BuildingsIcon,
    description: 'Moderate noise, typical office or home',
    settings: {
      threshold: 0.12,          // Balanced sensitivity
      minSpeechDuration: 60,    // Fast attack
      minSilenceDuration: 400,  // Moderate release
      smoothingTimeConstant: 0.75
    }
  },
  {
    name: 'Noisy',
    icon: WindIcon,
    description: 'High background noise, café or busy area',
    settings: {
      threshold: 0.22,          // Less sensitive to filter noise
      minSpeechDuration: 100,   // Slower attack avoids false triggers
      minSilenceDuration: 500,  // Longer release prevents choppy audio
      smoothingTimeConstant: 0.85
    }
  }
]

export function VoiceActivityMonitor({
  audioSettings,
  onSpeakingChange,
  enableAudioCapture = false,
  onAudioData,
  audioOutputFormat = 'base64',
  variant = 'full',
  enabled,
  onEnabledChange,
  useVadThreshold = true,
  onVadThresholdChange
}: VoiceActivityMonitorProps) {
  const [vadEnabled, setVadEnabled] = useState(enabled ?? true)
  const [internalVadThreshold, setInternalVadThreshold] = useState(useVadThreshold)
  const [vadSettings, setVadSettings] = useState<VADSettings>(() => loadVADSettings())
  
  const [threshold, setThreshold] = useState(vadSettings.threshold)
  const [minSpeechDuration, setMinSpeechDuration] = useState(vadSettings.minSpeechDuration)
  const [minSilenceDuration, setMinSilenceDuration] = useState(vadSettings.minSilenceDuration)
  const [smoothingTimeConstant, setSmoothingTimeConstant] = useState(vadSettings.smoothingTimeConstant)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [testMicMode, setTestMicMode] = useState(false)
  const prevSpeakingRef = useRef<boolean>(false)
  const onSpeakingChangeRef = useRef(onSpeakingChange)
  const displayLevelRef = useRef<HTMLDivElement>(null)
  const thresholdIndicatorRef = useRef<HTMLDivElement>(null)
  const levelTextRef = useRef<HTMLSpanElement>(null)

  // Update the callback ref when it changes
  useEffect(() => {
    onSpeakingChangeRef.current = onSpeakingChange
  }, [onSpeakingChange])

  const effectiveEnabled = enabled ?? vadEnabled
  const effectiveVadThreshold = useVadThreshold ?? internalVadThreshold

  const {
    isSpeaking,
    audioLevelRef,
    isInitialized,
    isSwitchingDevice,
    error,
    startListening,
    stopListening,
    isTestMicActive
  } = useVoiceActivity({
    enabled: effectiveEnabled,
    audioSettings,
    threshold,
    minSpeechDuration,
    minSilenceDuration,
    smoothingTimeConstant,
    enableAudioCapture,
    onAudioData,
    useVadThreshold: effectiveVadThreshold,
    testMicMode,
    audioOutputFormat
  })


  useEffect(() => {
    if (enabled !== undefined) {
      setVadEnabled(enabled)
    }
  }, [enabled])

  // Notify parent of speaking status changes
  useEffect(() => {
    if (onSpeakingChangeRef.current && prevSpeakingRef.current !== isSpeaking) {
      prevSpeakingRef.current = isSpeaking
      onSpeakingChangeRef.current(isSpeaking)
    }
  }, [isSpeaking])

  // Update display level using direct DOM manipulation to avoid re-renders
  useEffect(() => {
    if (!isInitialized) return
    
    let animationFrameId: number
    
    const updateDisplay = () => {
      const level = audioLevelRef.current
      const isActive = level > threshold
      
      // Update level bar width and color
      if (displayLevelRef.current) {
        displayLevelRef.current.style.width = `${Math.min(100, level * 100)}%`
        displayLevelRef.current.className = isActive
          ? 'h-full transition-all duration-100 bg-accent shadow-[inset_0_0_12px_rgba(255,255,255,0.3)]'
          : 'h-full transition-all duration-100 bg-muted-foreground/60'
      }
      
      // Update level text
      if (levelTextRef.current) {
        levelTextRef.current.textContent = (level * 100).toFixed(0)
      }
      
      animationFrameId = requestAnimationFrame(updateDisplay)
    }
    
    animationFrameId = requestAnimationFrame(updateDisplay)
    return () => cancelAnimationFrame(animationFrameId)
  }, [isInitialized, audioLevelRef, threshold])

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

  useEffect(() => {
    try {
      localStorage.setItem(VAD_SETTINGS_STORAGE_KEY, JSON.stringify(vadSettings))
    } catch (err) {
      console.warn('[VAD] Failed to persist settings:', err)
    }
  }, [vadSettings])

  const handleToggleVAD = async () => {
    if (effectiveEnabled) {
      stopListening()
      if (onEnabledChange) {
        onEnabledChange(false)
      } else {
        setVadEnabled(false)
      }
    } else {
      if (onEnabledChange) {
        onEnabledChange(true)
      } else {
        setVadEnabled(true)
      }
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
      if (effectiveEnabled && stopListening) {
        stopListening()
      }
    }
  }, [effectiveEnabled, stopListening])

  if (variant === 'compact') {
    if (error) {
      return (
        <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-[10px] text-red-200">
          {error}
        </div>
      )
    }

    // Show initializing only on first load, not during device switching
    if (!isInitialized && !isSwitchingDevice) {
      return (
        <div className="rounded-lg bg-secondary/40 border border-border/50 p-3 text-[10px] text-muted-foreground">
          Initializing voice detection…
        </div>
      )
    }

    const thresholdPercent = Math.round(threshold * 100)
    const isActive = effectiveEnabled && isSpeaking && !isSwitchingDevice

    return (
      <div className={cn(
        "space-y-3 bg-secondary/40 p-3 rounded-xl border border-border/50 transition-opacity duration-200",
        isSwitchingDevice && "opacity-50 pointer-events-none"
      )}>
        <div className="flex justify-between items-center text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
          <span className="flex items-center gap-1.5">
            <ChartBarIcon size={12} weight="bold" /> VAD Threshold
          </span>
          <span className={isActive ? "text-emerald-400" : "text-muted-foreground"}>
            {thresholdPercent}%
          </span>
        </div>

        <div className="relative h-4 bg-background rounded-md overflow-hidden border border-border">
          <div
            ref={displayLevelRef}
            className={isActive ? 'h-full transition-all duration-75 bg-emerald-500/40' : 'h-full transition-all duration-75 bg-indigo-500/20'}
            style={{ width: isSwitchingDevice ? '0%' : undefined }}
          />
          <div
            ref={thresholdIndicatorRef}
            className="absolute inset-y-0 w-0.5 bg-red-500 z-10 shadow-[0_0_8px_rgba(239,68,68,0.5)]"
            style={{ left: `${Math.min(100, thresholdPercent)}%` }}
          />
        </div>

        <input
          type="range"
          min={0}
          max={100}
          value={thresholdPercent}
          onChange={(event) => setThreshold(parseInt(event.target.value, 10) / 100)}
          disabled={isSwitchingDevice}
          className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer accent-destructive disabled:opacity-50"
        />
        <p className="text-[9px] text-muted-foreground italic">Adjust red line to set voice trigger sensitivity.</p>

        {/* Environment Presets */}
        <div className="pt-2 space-y-2">
          <Label className="text-[9px] uppercase font-black text-muted-foreground tracking-widest">
            Environment
          </Label>
          <div className="grid grid-cols-3 gap-1.5">
            {ENVIRONMENT_PRESETS.map((preset) => {
              const Icon = preset.icon
              const presetActive = 
                Math.abs(threshold - preset.settings.threshold) < 0.01 &&
                Math.abs(minSpeechDuration - preset.settings.minSpeechDuration) < 10 &&
                Math.abs(minSilenceDuration - preset.settings.minSilenceDuration) < 10
              
              return (
                <Button
                  key={preset.name}
                  variant={presetActive ? "default" : "outline"}
                  size="sm"
                  onClick={() => applyPreset(preset)}
                  disabled={isSwitchingDevice}
                  className={cn(
                    "h-auto flex-col gap-1 py-1.5 text-[8px] font-black uppercase",
                    presetActive && "bg-accent/10 text-accent hover:bg-accent/20 border-accent/50"
                  )}
                >
                  <Icon size={12} weight={presetActive ? "fill" : "duotone"} />
                  <span>{preset.name}</span>
                </Button>
              )
            })}
          </div>
        </div>

        {/* Advanced Settings Collapsible */}
        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <CollapsibleTrigger asChild>
            <Button 
              variant="ghost" 
              size="sm" 
              disabled={isSwitchingDevice}
              className="w-full justify-between text-[9px] font-semibold h-7 px-2"
            >
              <span className="flex items-center gap-1.5">
                <InfoIcon size={12} weight="fill" />
                Advanced
              </span>
              <span className={cn(
                "transition-transform duration-200 text-[8px]",
                advancedOpen && "rotate-180"
              )}>
                ▼
              </span>
            </Button>
          </CollapsibleTrigger>
          
          <CollapsibleContent className="space-y-3 pt-2">
            <Separator />
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="smoothing-compact" className="text-[10px]">Smoothing</Label>
                <span className="text-[9px] text-muted-foreground font-mono">
                  {smoothingTimeConstant.toFixed(2)}
                </span>
              </div>
              <Slider
                id="smoothing-compact"
                value={[smoothingTimeConstant * 100]}
                onValueChange={([value]) => setSmoothingTimeConstant(value / 100)}
                min={60}
                max={95}
                step={1}
                disabled={isSwitchingDevice}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="attack-compact" className="text-[10px]">Attack</Label>
                <span className="text-[9px] text-muted-foreground font-mono">
                  {minSpeechDuration}ms
                </span>
              </div>
              <Slider
                id="attack-compact"
                value={[minSpeechDuration]}
                onValueChange={([value]) => setMinSpeechDuration(value)}
                min={0}
                max={300}
                step={10}
                disabled={isSwitchingDevice}
                className="w-full"
              />
              <p className="text-[8px] text-muted-foreground">
                Time before voice triggers
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="release-compact" className="text-[10px]">Release</Label>
                <span className="text-[9px] text-muted-foreground font-mono">
                  {minSilenceDuration}ms
                </span>
              </div>
              <Slider
                id="release-compact"
                value={[minSilenceDuration]}
                onValueChange={([value]) => setMinSilenceDuration(value)}
                min={100}
                max={1000}
                step={25}
                disabled={isSwitchingDevice}
                className="w-full"
              />
              <p className="text-[8px] text-muted-foreground">
                Time before voice cuts off
              </p>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Test Mic Button */}
        <Button
          variant={testMicMode ? "default" : "outline"}
          size="sm"
          onClick={() => setTestMicMode(!testMicMode)}
          disabled={isSwitchingDevice}
          className={cn(
            "w-full justify-center gap-2 text-[9px] font-bold uppercase h-8",
            testMicMode && "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 border-amber-500/50"
          )}
        >
          <HeadphonesIcon size={14} weight={testMicMode ? "fill" : "duotone"} />
          {testMicMode ? "Testing... (Muted)" : "Test Mic"}
        </Button>
        {testMicMode && (
          <p className="text-[8px] text-amber-400 text-center">
            You can hear yourself. Audio is not transmitted.
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="pb-2 px-0">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h3 className="flex items-center gap-2 text-xs uppercase tracking-wider font-black text-muted-foreground">
              <div className={cn(
                "p-1.5 rounded-md transition-all",
                effectiveEnabled && isInitialized 
                  ? "bg-accent/20 text-accent" 
                  : "bg-muted text-muted-foreground"
              )}>
                <WaveformIcon size={14} weight="bold" />
              </div>
              Voice Activity Detection
            </h3>
            <p className="text-[10px] text-muted-foreground">
              Real-time speech monitoring for optimal voice transmission
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-5">
        {!effectiveEnabled ? (
          <div className="space-y-4">
            <div className="rounded-xl bg-gradient-to-br from-accent/10 via-accent/5 to-transparent border-2 border-accent/20 p-8 text-center space-y-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-accent/20 mb-2">
                <MicrophoneStageIcon size={32} weight="duotone" className="text-accent" />
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
                <LightningIcon size={20} weight="fill" />
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
                <XCircleIcon size={20} weight="fill" className="flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold mb-1">Microphone Access Error</p>
                  <p className="text-xs opacity-90">{error}</p>
                </div>
              </div>
            )}

            {isInitialized && (
              <>
                <div className="space-y-3 bg-secondary/40 p-3 rounded-xl border border-border/50">
                  <div className="flex justify-between items-center text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                    <span className="flex items-center gap-1.5">
                      <ChartBarIcon size={12} weight="bold" /> VAD Threshold
                    </span>
                    <span className={isSpeaking ? "text-emerald-400" : "text-muted-foreground"}>
                      {(threshold * 100).toFixed(0)}%
                    </span>
                  </div>

                  <div className="relative h-4 bg-background rounded-md overflow-hidden border border-border">
                    <div 
                      ref={displayLevelRef}
                      className="h-full transition-all duration-100 bg-muted-foreground/60"
                      style={{ width: '0%' }}
                    />
                    <div 
                      ref={thresholdIndicatorRef}
                      className="absolute inset-y-0 w-0.5 bg-destructive z-10 shadow-[0_0_8px_rgba(239,68,68,0.5)]"
                      style={{ left: `${Math.min(100, threshold * 100)}%` }}
                    />
                  </div>

                  <input 
                    type="range" 
                    min={3}
                    max={50}
                    value={(threshold * 100).toFixed(0)}
                    onChange={(event) => setThreshold(parseInt(event.target.value, 10) / 100)}
                    className="w-full h-1 bg-muted rounded-lg appearance-none cursor-pointer accent-destructive" 
                  />
                  <p className="text-[9px] text-muted-foreground italic">
                    Adjust red line to set voice trigger sensitivity.
                  </p>
                </div>

                <div className="space-y-3">
                  <Label className="text-[10px] uppercase font-black text-muted-foreground tracking-widest">
                    Quick Environment Presets
                  </Label>
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
                            "h-auto flex-col gap-1.5 py-2 text-[9px] font-black uppercase",
                            isActive && "bg-accent/10 text-accent hover:bg-accent/20 border-accent/50"
                          )}
                        >
                          <Icon size={16} weight={isActive ? "fill" : "duotone"} />
                          <span>{preset.name}</span>
                        </Button>
                      )
                    })}
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
                        <InfoIcon size={16} weight="fill" />
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

                <div className="flex items-center justify-center pt-1">
                  <Button 
                    onClick={handleToggleVAD}
                    variant="outline"
                    size="sm"
                    className="gap-2 border-destructive/50 text-destructive hover:bg-destructive/10 text-[10px]"
                  >
                    <XCircleIcon size={16} weight="fill" />
                    Stop Voice Detection
                  </Button>
                </div>
              </>
            )}

            {!isInitialized && !error && (
              <div className="text-center py-8 space-y-3">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-muted animate-pulse">
                  <WaveformIcon size={24} weight="bold" className="text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">Initializing voice detection...</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
