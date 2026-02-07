import { cn } from '../../lib/utils';
import { useAudioStore } from '../../stores/audioStore';
import { useAudioDevices } from '../../hooks/useAudioDevices';
import { Mic, MicOff, Volume2, VolumeX, Settings2 } from 'lucide-react';
import { Select } from './Primitives';

// --- LED-Style Audio Level Meter ---

interface AudioLevelMeterProps {
  value: number;
  threshold?: number;
  segments?: number;
  orientation?: 'horizontal' | 'vertical';
  showPeak?: boolean;
  className?: string;
}

export const AudioLevelMeter = ({ 
  value, 
  threshold, 
  segments = 16, 
  orientation = 'horizontal',
  showPeak = true,
  className 
}: AudioLevelMeterProps) => {
  const activeSegments = Math.floor((value / 100) * segments);
  const thresholdSegment = threshold !== undefined ? Math.floor((threshold / 100) * segments) : -1;
  
  const getSegmentColor = (index: number, isActive: boolean) => {
    if (!isActive) return 'bg-[var(--bg-panel)] opacity-20';
    
    const position = index / segments;
    if (position > 0.85) return 'bg-[var(--accent-danger)] shadow-[0_0_4px_var(--accent-danger)]';
    if (position > 0.7) return 'bg-[var(--accent-warning)] shadow-[0_0_3px_var(--accent-warning)]';
    return 'bg-[var(--accent-success)] shadow-[0_0_3px_var(--accent-success)]';
  };

  const isVertical = orientation === 'vertical';

  return (
    <div 
      className={cn(
        "relative bg-[var(--bg-input)] border border-[var(--border-primary)] rounded-[var(--radius-btn)] p-[3px] overflow-hidden",
        isVertical ? "flex flex-col-reverse gap-[2px] w-4" : "flex gap-[2px] h-4",
        className
      )}
    >
      {Array.from({ length: segments }).map((_, i) => {
        const isActive = i < activeSegments;
        const isThreshold = i === thresholdSegment;
        
        return (
          <div 
            key={i}
            className={cn(
              "relative transition-all duration-50",
              isVertical ? "h-2 w-full" : "flex-1 h-full",
              getSegmentColor(i, isActive),
              i === 0 && !isVertical && "rounded-l-sm",
              i === segments - 1 && !isVertical && "rounded-r-sm",
              i === 0 && isVertical && "rounded-b-sm",
              i === segments - 1 && isVertical && "rounded-t-sm"
            )}
          >
            {isThreshold && (
              <div className="absolute inset-0 border-2 border-white/60 rounded-sm" />
            )}
          </div>
        );
      })}
      
      {/* Peak indicator */}
      {showPeak && value > 95 && (
        <div className="absolute inset-0 bg-[var(--accent-danger)]/20 animate-pulse" />
      )}
    </div>
  );
};

// --- Compact Mic Level Indicator ---

export const MicLevelIndicator = ({ className }: { className?: string }) => {
  const micLevel = useAudioStore((s) => s.micLevel);
  const isMicMuted = useAudioStore((s) => s.isMicMuted);
  const isSpeaking = useAudioStore((s) => s.isSpeaking);
  const vadSettings = useAudioStore((s) => s.vadSettings);

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className={cn(
        "w-6 h-6 flex items-center justify-center rounded-full border transition-all",
        isMicMuted 
          ? "bg-[var(--accent-danger)]/20 border-[var(--accent-danger)] text-[var(--accent-danger)]"
          : isSpeaking
            ? "bg-[var(--accent-success)]/20 border-[var(--accent-success)] text-[var(--accent-success)] shadow-[0_0_8px_var(--accent-success)]"
            : "bg-[var(--bg-input)] border-[var(--border-primary)] text-[var(--text-secondary)]"
      )}>
        {isMicMuted ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
      </div>
      <AudioLevelMeter 
        value={isMicMuted ? 0 : micLevel} 
        threshold={vadSettings.threshold}
        segments={12}
        className="flex-1 max-w-[100px]"
      />
    </div>
  );
};

// --- Device Selector Component ---

interface DeviceSelectorProps {
  type: 'input' | 'output';
  showLabel?: boolean;
  compact?: boolean;
  className?: string;
}

export const DeviceSelector = ({ type, showLabel = true, compact = false, className }: DeviceSelectorProps) => {
  const { 
    inputDevices, 
    outputDevices, 
    inputDeviceId, 
    outputDeviceId, 
    setInputDevice, 
    setOutputDevice 
  } = useAudioDevices();

  const devices = type === 'input' ? inputDevices : outputDevices;
  const currentDeviceId = type === 'input' ? inputDeviceId : outputDeviceId;
  const setDevice = type === 'input' ? setInputDevice : setOutputDevice;
  const Icon = type === 'input' ? Mic : Volume2;
  const label = type === 'input' ? 'Input Device' : 'Output Device';

  const options = [
    { value: 'default', label: `Default ${type === 'input' ? 'Microphone' : 'Speakers'}` },
    ...devices.map(d => ({ value: d.deviceId, label: d.label || `${type === 'input' ? 'Microphone' : 'Speaker'} ${d.deviceId.slice(0, 8)}` }))
  ];

  if (compact) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <Icon className="w-4 h-4 text-[var(--text-secondary)]" />
        <select
          value={currentDeviceId}
          onChange={(e) => setDevice(e.target.value)}
          className="flex-1 bg-[var(--bg-input)] text-[var(--text-primary)] text-xs border border-[var(--border-primary)] rounded-[var(--radius-btn)] px-2 py-1.5 focus:outline-none focus:border-[var(--accent-primary)]"
        >
          {options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className={className}>
      <Select
        label={showLabel ? label : undefined}
        value={currentDeviceId}
        onChange={(e) => setDevice(e.target.value)}
        options={options}
      />
    </div>
  );
};

// --- Audio Settings Panel ---

export const AudioSettingsPanel = ({ className }: { className?: string }) => {
  const settings = useAudioStore((s) => s.settings);
  const setEchoCancellation = useAudioStore((s) => s.setEchoCancellation);
  const setNoiseSuppression = useAudioStore((s) => s.setNoiseSuppression);
  const setAutoGainControl = useAudioStore((s) => s.setAutoGainControl);
  const setInputVolume = useAudioStore((s) => s.setInputVolume);
  const setOutputVolume = useAudioStore((s) => s.setOutputVolume);

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center gap-2 pb-2 border-b border-[var(--border-primary)]">
        <Settings2 className="w-4 h-4 text-[var(--accent-primary)]" />
        <h3 className="text-sm font-bold uppercase text-[var(--text-primary)]">Audio Settings</h3>
      </div>

      <DeviceSelector type="input" />
      <DeviceSelector type="output" />

      <div className="space-y-3 pt-2">
        <div>
          <label className="flex justify-between text-[10px] font-bold text-[var(--text-secondary)] uppercase mb-1">
            <span>Input Volume</span>
            <span className="text-[var(--text-primary)]">{settings.inputVolume}%</span>
          </label>
          <input
            type="range"
            min={0}
            max={100}
            value={settings.inputVolume}
            onChange={(e) => setInputVolume(Number(e.target.value))}
            className="w-full h-2 bg-[var(--bg-input)] rounded-full appearance-none cursor-pointer accent-[var(--accent-primary)]"
          />
        </div>

        <div>
          <label className="flex justify-between text-[10px] font-bold text-[var(--text-secondary)] uppercase mb-1">
            <span>Output Volume</span>
            <span className="text-[var(--text-primary)]">{settings.outputVolume}%</span>
          </label>
          <input
            type="range"
            min={0}
            max={100}
            value={settings.outputVolume}
            onChange={(e) => setOutputVolume(Number(e.target.value))}
            className="w-full h-2 bg-[var(--bg-input)] rounded-full appearance-none cursor-pointer accent-[var(--accent-primary)]"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 pt-2">
        <ToggleButton
          label="Echo Cancel"
          active={settings.echoCancellation}
          onClick={() => setEchoCancellation(!settings.echoCancellation)}
        />
        <ToggleButton
          label="Noise Suppr."
          active={settings.noiseSuppression}
          onClick={() => setNoiseSuppression(!settings.noiseSuppression)}
        />
        <ToggleButton
          label="Auto Gain"
          active={settings.autoGainControl}
          onClick={() => setAutoGainControl(!settings.autoGainControl)}
        />
      </div>
    </div>
  );
};

// Helper toggle button
const ToggleButton = ({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) => (
  <button
    onClick={onClick}
    className={cn(
      "px-2 py-1.5 text-[9px] font-bold uppercase rounded-[var(--radius-btn)] border transition-all",
      active
        ? "bg-[var(--accent-primary)]/20 border-[var(--accent-primary)] text-[var(--accent-primary)]"
        : "bg-[var(--bg-input)] border-[var(--border-primary)] text-[var(--text-secondary)] hover:border-[var(--accent-primary)]"
    )}
  >
    {label}
  </button>
);

// --- Speaking Indicator Badge ---

export const SpeakingIndicator = ({ isSpeaking, isMuted, size = 'md' }: { isSpeaking: boolean; isMuted: boolean; size?: 'sm' | 'md' | 'lg' }) => {
  const sizeClasses = {
    sm: 'w-2 h-2',
    md: 'w-3 h-3',
    lg: 'w-4 h-4'
  };

  return (
    <div className={cn(
      "rounded-full transition-all",
      sizeClasses[size],
      isMuted 
        ? "bg-[var(--accent-danger)]"
        : isSpeaking
          ? "bg-[var(--accent-success)] shadow-[0_0_8px_var(--accent-success)] animate-pulse"
          : "bg-[var(--text-secondary)]/50"
    )} />
  );
};

// --- Mute Button with Animation ---

interface MuteButtonProps {
  muted: boolean;
  onToggle: () => void;
  type?: 'mic' | 'speaker';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const MuteButton = ({ muted, onToggle, type = 'mic', size = 'md', className }: MuteButtonProps) => {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12'
  };

  const iconSizes = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6'
  };

  const MutedIcon = type === 'mic' ? MicOff : VolumeX;
  const UnmutedIcon = type === 'mic' ? Mic : Volume2;
  const Icon = muted ? MutedIcon : UnmutedIcon;
  
  const ariaLabel = type === 'mic' 
    ? (muted ? 'Unmute microphone' : 'Mute microphone')
    : (muted ? 'Unmute speakers' : 'Mute speakers');

  return (
    <button
      onClick={onToggle}
      aria-label={ariaLabel}
      aria-pressed={muted}
      className={cn(
        "flex items-center justify-center rounded-full border-2 transition-all",
        sizeClasses[size],
        muted
          ? "bg-[var(--accent-danger)]/20 border-[var(--accent-danger)] text-[var(--accent-danger)] hover:bg-[var(--accent-danger)]/30"
          : "bg-[var(--bg-input)] border-[var(--border-primary)] text-[var(--text-primary)] hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)]",
        className
      )}
    >
      <Icon className={iconSizes[size]} />
    </button>
  );
};
