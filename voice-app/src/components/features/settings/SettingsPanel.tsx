import { useState } from 'react';
import { Panel, Button, Input, Switch, Modal, Badge, Slider } from '../../ui/Primitives';
import { AudioLevelMeter, DeviceSelector } from '../../ui/AudioControls';
import { cn } from '../../../lib/utils';
import {
  Settings,
  Mic,
  Volume2,
  Server,
  Palette,
  Activity,
  Trash2,
  Plus,
  Clock,
  Sun,
  Cloud,
  Wind,
  RefreshCw,
  Keyboard
} from 'lucide-react';
import { useAudioStore } from '../../../stores/audioStore';
import { useSettingsStore } from '../../../stores/settingsStore';

// --- Keyboard Shortcuts Info ---

export const KeyboardShortcutsInfo = ({ className }: { className?: string }) => {
  const shortcuts = [
    { key: 'M', action: 'Toggle Microphone Mute' },
    { key: 'D', action: 'Toggle Deafen (Speaker Mute)' },
  ];

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center gap-2 text-[10px] font-bold text-[var(--text-secondary)] uppercase">
        <Keyboard className="w-3.5 h-3.5" /> Keyboard Shortcuts
      </div>
      <div className="space-y-2">
        {shortcuts.map(({ key, action }) => (
          <div
            key={key}
            className="flex items-center justify-between p-2 bg-[var(--bg-input)] rounded-[var(--radius-btn)] border border-[var(--border-primary)]"
          >
            <span className="text-xs text-[var(--text-primary)]">{action}</span>
            <kbd className="px-2 py-1 bg-[var(--bg-panel)] border border-[var(--border-primary)] rounded text-[10px] font-mono font-bold text-[var(--accent-primary)]">
              {key}
            </kbd>
          </div>
        ))}
      </div>
      <p className="text-[9px] text-[var(--text-secondary)] italic">
        Shortcuts are active when connected and not typing in an input field.
      </p>
    </div>
  );
};

// --- Theme Selector ---

const themes = [
  { id: 'industrial', name: 'Industrial', description: 'Dark & functional' },
  { id: 'hytale', name: 'Hytale', description: 'Warm & stylized' },
] as const;

export const ThemeSelector = ({ className }: { className?: string }) => {
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center gap-2 text-[10px] font-bold text-[var(--text-secondary)] uppercase">
        <Palette className="w-3.5 h-3.5" /> Theme
      </div>
      <div className="grid grid-cols-2 gap-2">
        {themes.map(t => (
          <button
            key={t.id}
            onClick={() => setTheme(t.id)}
            className={cn(
              "p-3 rounded-[var(--radius-btn)] border-2 transition-all text-left",
              theme === t.id
                ? "border-[var(--accent-primary)] bg-[var(--accent-primary)]/10"
                : "border-[var(--border-primary)]"
            )}
          >
            <div className="text-sm font-bold text-[var(--text-primary)]">{t.name}</div>
            <div className="text-[10px] text-[var(--text-secondary)]">{t.description}</div>
          </button>
        ))}
      </div>
    </div>
  );
};

// --- Saved Servers Manager ---

export const SavedServersManager = ({ className }: { className?: string }) => {
  const savedServers = useSettingsStore((s) => s.savedServers);
  const addSavedServer = useSettingsStore((s) => s.addSavedServer);
  const removeSavedServer = useSettingsStore((s) => s.removeSavedServer);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newServerUrl, setNewServerUrl] = useState('');
  const [newServerName, setNewServerName] = useState('');

  const handleAddServer = () => {
    if (!newServerUrl.trim()) return;
    addSavedServer(newServerUrl, newServerName || undefined);
    setNewServerUrl('');
    setNewServerName('');
    setShowAddModal(false);
  };

  const formatDate = (timestamp: number) => {
    if (!timestamp) return 'Never';
    return new Date(timestamp).toLocaleDateString();
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px] font-bold text-[var(--text-secondary)] uppercase">
          <Server className="w-3.5 h-3.5" /> Saved Servers
        </div>
        <Button size="sm" variant="ghost" onClick={() => setShowAddModal(true)}>
          <Plus className="w-3.5 h-3.5" />
        </Button>
      </div>

      {savedServers.length === 0 ? (
        <div className="text-center py-4 text-[var(--text-secondary)] text-xs">
          No saved servers
        </div>
      ) : (
        <div className="space-y-2">
          {savedServers.map((server, index) => (
            <div 
              key={index}
              className="flex items-center gap-3 p-2 bg-[var(--bg-input)] rounded-[var(--radius-btn)] border border-[var(--border-primary)]"
            >
              <Server className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-[var(--text-primary)] truncate">{server.name}</div>
                <div className="text-[10px] text-[var(--text-secondary)] font-mono truncate">{server.url}</div>
              </div>
              <div className="flex items-center gap-1 text-[9px] text-[var(--text-secondary)] shrink-0">
                <Clock className="w-3 h-3" />
                {formatDate(server.lastConnected)}
              </div>
              <button
                onClick={() => removeSavedServer(server.url)}
                className="p-1 text-[var(--text-secondary)] hover:text-[var(--accent-danger)] transition-colors shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <Modal 
        isOpen={showAddModal} 
        onClose={() => setShowAddModal(false)}
        title="Add Server"
      >
        <div className="space-y-4 p-1">
          <Input
            label="Server Name (optional)"
            placeholder="My Voice Server"
            value={newServerName}
            onChange={(e) => setNewServerName(e.target.value)}
          />
          <Input
            label="Server URL"
            placeholder="ws://localhost:8080"
            value={newServerUrl}
            onChange={(e) => setNewServerUrl(e.target.value)}
          />
          <div className="flex gap-2 pt-2">
            <Button fullWidth variant="primary" onClick={handleAddServer} disabled={!newServerUrl.trim()}>
              Add Server
            </Button>
            <Button variant="ghost" onClick={() => setShowAddModal(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

// --- VAD Settings Panel ---

export const VADSettingsPanel = ({ className }: { className?: string }) => {
  const vadSettings = useAudioStore((s) => s.vadSettings);
  const micLevel = useAudioStore((s) => s.micLevel);
  const isSpeaking = useAudioStore((s) => s.isSpeaking);
  const setVADThreshold = useAudioStore((s) => s.setVADThreshold);
  const setVADPreset = useAudioStore((s) => s.setVADPreset);
  const setMinSpeechDuration = useAudioStore((s) => s.setMinSpeechDuration);
  const setMinSilenceDuration = useAudioStore((s) => s.setMinSilenceDuration);

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px] font-bold text-[var(--text-secondary)] uppercase">
          <Activity className="w-3.5 h-3.5" /> Voice Activity Detection
        </div>
        <Badge variant={isSpeaking ? 'success' : 'neutral'}>
          {isSpeaking ? 'Active' : 'Standby'}
        </Badge>
      </div>

      {/* Live Level */}
      <div className="space-y-2">
        <div className="flex justify-between text-[10px] font-bold text-[var(--text-secondary)]">
          <span>Input Level</span>
          <span className={micLevel > vadSettings.threshold ? 'text-[var(--accent-success)]' : ''}>{Math.round(micLevel)}%</span>
        </div>
        <AudioLevelMeter value={micLevel} threshold={vadSettings.threshold} segments={20} />
      </div>

      {/* Presets */}
      <div className="flex gap-2">
        <Button 
          size="sm" 
          variant={vadSettings.preset === 'quiet' ? 'primary' : 'ghost'} 
          onClick={() => setVADPreset('quiet')}
          className="flex-1"
        >
          <Sun className="w-3.5 h-3.5 mr-1" /> Quiet
        </Button>
        <Button 
          size="sm" 
          variant={vadSettings.preset === 'normal' ? 'primary' : 'ghost'} 
          onClick={() => setVADPreset('normal')}
          className="flex-1"
        >
          <Cloud className="w-3.5 h-3.5 mr-1" /> Normal
        </Button>
        <Button 
          size="sm" 
          variant={vadSettings.preset === 'noisy' ? 'primary' : 'ghost'} 
          onClick={() => setVADPreset('noisy')}
          className="flex-1"
        >
          <Wind className="w-3.5 h-3.5 mr-1" /> Noisy
        </Button>
      </div>

      {/* Threshold Slider */}
      <Slider 
        label={`Threshold: ${vadSettings.threshold}%`}
        value={vadSettings.threshold}
        min={0}
        max={100}
        onChange={(e) => setVADThreshold(Number(e.target.value))}
      />

      {/* Advanced Settings */}
      <div className="grid grid-cols-2 gap-3">
        <Slider 
          label={`Attack: ${vadSettings.minSpeechDuration}ms`}
          value={vadSettings.minSpeechDuration}
          min={10}
          max={300}
          onChange={(e) => setMinSpeechDuration(Number(e.target.value))}
        />
        <Slider 
          label={`Release: ${vadSettings.minSilenceDuration}ms`}
          value={vadSettings.minSilenceDuration}
          min={50}
          max={1000}
          onChange={(e) => setMinSilenceDuration(Number(e.target.value))}
        />
      </div>
    </div>
  );
};

// --- Audio Processing Settings ---

export const AudioProcessingSettings = ({ className }: { className?: string }) => {
  const settings = useAudioStore((s) => s.settings);
  const setEchoCancellation = useAudioStore((s) => s.setEchoCancellation);
  const setNoiseSuppression = useAudioStore((s) => s.setNoiseSuppression);
  const setAutoGainControl = useAudioStore((s) => s.setAutoGainControl);
  const setInputVolume = useAudioStore((s) => s.setInputVolume);
  const setOutputVolume = useAudioStore((s) => s.setOutputVolume);

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center gap-2 text-[10px] font-bold text-[var(--text-secondary)] uppercase">
        <RefreshCw className="w-3.5 h-3.5" /> Audio Processing
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Switch 
          label="Echo Cancel" 
          checked={settings.echoCancellation} 
          onChange={setEchoCancellation} 
        />
        <Switch 
          label="Noise Suppr." 
          checked={settings.noiseSuppression} 
          onChange={setNoiseSuppression} 
        />
        <Switch 
          label="Auto Gain" 
          checked={settings.autoGainControl} 
          onChange={setAutoGainControl} 
        />
      </div>

      <div className="space-y-3 pt-2">
        <Slider 
          label={`Input Volume: ${settings.inputVolume}%`}
          value={settings.inputVolume}
          min={0}
          max={100}
          onChange={(e) => setInputVolume(Number(e.target.value))}
        />
        <Slider 
          label={`Output Volume: ${settings.outputVolume}%`}
          value={settings.outputVolume}
          min={0}
          max={100}
          onChange={(e) => setOutputVolume(Number(e.target.value))}
        />
      </div>
    </div>
  );
};

// --- Full Settings Panel ---

export const SettingsPanel = ({ className }: { className?: string }) => {
  const [activeTab, setActiveTab] = useState<'audio' | 'vad' | 'servers' | 'appearance'>('audio');

  const tabs = [
    { id: 'audio' as const, label: 'Audio', icon: Mic },
    { id: 'vad' as const, label: 'VAD', icon: Activity },
    { id: 'servers' as const, label: 'Servers', icon: Server },
    { id: 'appearance' as const, label: 'Theme', icon: Palette },
  ];

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Header */}
      <div className="flex items-center gap-2 pb-3 mb-4 border-b border-[var(--border-primary)]">
        <Settings className="w-5 h-5 text-[var(--accent-primary)]" />
        <h2 className="text-sm font-bold uppercase text-[var(--text-primary)] font-[family-name:var(--font-heading)]">
          Settings
        </h2>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-[var(--bg-input)] p-1 rounded-[var(--radius-btn)]">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2 text-[10px] font-bold uppercase rounded-[var(--radius-btn)] transition-all",
              activeTab === tab.id
                ? "bg-[var(--bg-panel)] text-[var(--accent-primary)] shadow-sm"
                : "text-[var(--text-secondary)]"
            )}
          >
            <tab.icon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {activeTab === 'audio' && (
          <div className="space-y-6">
            <Panel title="Devices">
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <Mic className="w-4 h-4 text-[var(--accent-primary)]" />
                  <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">Input</span>
                </div>
                <DeviceSelector type="input" showLabel={false} />
                
                <div className="flex items-center gap-2 mb-2 pt-2 border-t border-[var(--border-primary)]">
                  <Volume2 className="w-4 h-4 text-[var(--accent-primary)]" />
                  <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">Output</span>
                </div>
                <DeviceSelector type="output" showLabel={false} />
              </div>
            </Panel>
            
            <Panel title="Processing">
              <AudioProcessingSettings />
            </Panel>
          </div>
        )}

        {activeTab === 'vad' && (
          <Panel title="Voice Detection">
            <VADSettingsPanel />
          </Panel>
        )}

        {activeTab === 'servers' && (
          <Panel title="Server Management">
            <SavedServersManager />
          </Panel>
        )}

        {activeTab === 'appearance' && (
          <div className="space-y-4">
            <Panel title="Appearance">
              <ThemeSelector />
            </Panel>
            <Panel title="Controls">
              <KeyboardShortcutsInfo />
            </Panel>
          </div>
        )}
      </div>
    </div>
  );
};
