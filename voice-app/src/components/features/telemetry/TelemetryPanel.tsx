import { useEffect, useMemo, useState } from 'react';
import { Panel, Meter, Button, Slider, Select, Switch, Badge } from '../../ui/Primitives';
import { cn } from '../../../lib/utils';
import { Globe, MapPin, Cpu, Sun, Cloud, Wind } from 'lucide-react';
import { useAudioStore } from '../../../stores/audioStore';
import { useConnectionStore } from '../../../stores/connectionStore';
import { useGroupStore } from '../../../stores/groupStore';
import { useUserStore } from '../../../stores/userStore';
import { useAudioDevices } from '../../../hooks/useAudioDevices';

// --- Sub-components ---

export const VADMonitor = () => {
   const micLevel = useAudioStore((s) => s.micLevel);
   const isSpeaking = useAudioStore((s) => s.isSpeaking);
   const vadSettings = useAudioStore((s) => s.vadSettings);
   const setVADThreshold = useAudioStore((s) => s.setVADThreshold);
   const setVADPreset = useAudioStore((s) => s.setVADPreset);
   const setMinSpeechDuration = useAudioStore((s) => s.setMinSpeechDuration);
   const setMinSilenceDuration = useAudioStore((s) => s.setMinSilenceDuration);

   const threshold = vadSettings.threshold;
   const mode = vadSettings.preset;

   return (
      <Panel title="Voice Activity">
         <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
               <div className="flex flex-wrap gap-1 flex-1">
                  <Button size="sm" variant={mode === 'quiet' ? 'primary' : 'ghost'} onClick={() => setVADPreset('quiet')} className="text-[9px] px-2 h-6">
                     <Sun className="w-3 h-3 mr-1" /> Quiet
                  </Button>
                  <Button size="sm" variant={mode === 'normal' ? 'primary' : 'ghost'} onClick={() => setVADPreset('normal')} className="text-[9px] px-2 h-6">
                     <Cloud className="w-3 h-3 mr-1" /> Normal
                  </Button>
                  <Button size="sm" variant={mode === 'noisy' ? 'primary' : 'ghost'} onClick={() => setVADPreset('noisy')} className="text-[9px] px-2 h-6">
                     <Wind className="w-3 h-3 mr-1" /> Noisy
                  </Button>
               </div>
               <Badge variant={isSpeaking ? 'success' : 'neutral'}>
                  {isSpeaking ? 'TX OPEN' : 'STANDBY'}
               </Badge>
            </div>

            <div className="space-y-1 bg-[var(--bg-input)] p-2 rounded-[var(--radius-btn)] border border-[var(--border-primary)]">
               <div className="flex justify-between text-[10px] text-[var(--text-secondary)] font-bold mb-1">
                  <span>INPUT GAIN</span>
                  <span className="font-mono">{Math.round(micLevel)} dB</span>
               </div>
               <Meter value={micLevel} threshold={threshold} className="h-3" />
            </div>

            <div className="space-y-3 pt-2 border-t border-[var(--border-primary)]">
               <Slider 
                  label={`Gate Threshold: ${threshold}%`} 
                  value={threshold} 
                  onChange={(e) => setVADThreshold(Number(e.target.value))} 
               />
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
         </div>
      </Panel>
   );
};

export const ConnectionMonitor = ({ compact = false }: { compact?: boolean }) => {
   const status = useConnectionStore((s) => s.status);
   const latency = useConnectionStore((s) => s.latency);
   const serverUrl = useConnectionStore((s) => s.serverUrl);
   
   const isConnected = status === 'connected';
   const isWarningStatus = status === 'connecting' || status === 'reconnecting';
   const statusBadgeVariant = isConnected ? 'success' : isWarningStatus ? 'warning' : status === 'disconnected' ? 'neutral' : 'danger';
   const pingDisplay = latency !== null ? `${latency}ms` : '--';
   const pingColor = latency !== null && latency < 50 ? 'var(--accent-success)' : latency !== null && latency < 100 ? 'var(--accent-warning)' : 'var(--accent-danger)';
   
   // Extract hostname from URL
   const hostname = serverUrl ? (() => {
      try {
         return new URL(serverUrl.replace('ws://', 'http://').replace('wss://', 'https://')).hostname;
      } catch {
         return serverUrl;
      }
   })() : 'Not connected';

   if (compact) {
      return (
         <div className="flex items-center gap-4 text-[10px] font-mono text-[var(--text-secondary)]">
            <div className="flex items-center gap-1.5">
               <div className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  isConnected
                     ? "bg-[var(--accent-success)] shadow-[0_0_4px_var(--accent-success)]"
                     : isWarningStatus
                        ? "bg-[var(--accent-warning)] shadow-[0_0_4px_var(--accent-warning)]"
                        : "bg-[var(--accent-danger)]"
               )} />
               <span className="text-[var(--text-primary)] font-bold tracking-wider">
                  {status.toUpperCase()}
               </span>
            </div>
            <span className="opacity-30">|</span>
            <div className="flex items-center gap-1">
               <Globe className="w-3 h-3 opacity-50" />
               <span className="truncate max-w-[100px]">{hostname}</span>
            </div>
            <span className="opacity-30">|</span>
            <div className="flex gap-3">
               <span>PING: <span style={{ color: pingColor }}>{pingDisplay}</span></span>
            </div>
         </div>
      );
   }

   return (
      <Panel title="Connection Status">
         <div className="space-y-3">
            <div className="flex items-center gap-3 bg-[var(--bg-input)] p-3 rounded-[var(--radius-btn)] border border-[var(--border-primary)] shadow-inner">
               <div className="relative shrink-0">
                  <Globe className="w-8 h-8 text-[var(--accent-primary)]" />
               </div>
               <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-bold text-[var(--text-primary)] truncate uppercase tracking-wider">{hostname}</div>
                  <div className="text-[9px] text-[var(--text-secondary)] font-mono truncate">{serverUrl || 'Not connected'}</div>
               </div>
               <Badge variant={statusBadgeVariant}>
                  {status}
               </Badge>
            </div>

            <div className="grid grid-cols-3 gap-2">
               <div className="text-center p-2 bg-[var(--bg-input)] rounded-[var(--radius-btn)] border border-[var(--border-primary)]">
                  <div className="text-[8px] text-[var(--text-secondary)] font-bold mb-1">PING</div>
                  <div className="text-xs font-bold font-mono" style={{ color: pingColor }}>{pingDisplay}</div>
               </div>
               <div className="text-center p-2 bg-[var(--bg-input)] rounded-[var(--radius-btn)] border border-[var(--border-primary)]">
                  <div className="text-[8px] text-[var(--text-secondary)] font-bold mb-1">LOSS</div>
                  <div className="text-xs font-bold text-[var(--text-primary)] font-mono">0%</div>
               </div>
               <div className="text-center p-2 bg-[var(--bg-input)] rounded-[var(--radius-btn)] border border-[var(--border-primary)]">
                  <div className="text-[8px] text-[var(--text-secondary)] font-bold mb-1">JITTER</div>
                  <div className="text-xs font-bold text-[var(--accent-warning)] font-mono">--</div>
               </div>
            </div>
         </div>
      </Panel>
   );
};

export const SpatialRadar = () => {
   const [showMap, setShowMap] = useState(false);
   const isProximityRadarEnabled = useAudioStore((s) => s.isProximityRadarEnabled);
   const proximityRadarContacts = useAudioStore((s) => s.proximityRadarContacts);
   const pruneProximityRadarContacts = useAudioStore((s) => s.pruneProximityRadarContacts);
   const users = useUserStore((s) => s.users);
   const localUser = useUserStore((s) => {
      if (!s.localUserId) return undefined;
      return s.users.get(s.localUserId);
   });
   const currentGroupRange = useGroupStore((s) => {
      if (!s.currentGroupId) return undefined;
      const group = s.groups.find((entry) => entry.id === s.currentGroupId);
      return group?.settings.proximityRange;
   });

   useEffect(() => {
      if (!isProximityRadarEnabled) {
         return;
      }
      const interval = window.setInterval(() => {
         pruneProximityRadarContacts(3000);
      }, 500);
      return () => window.clearInterval(interval);
   }, [isProximityRadarEnabled, pruneProximityRadarContacts]);

   const targets = useMemo(() => {
      if (!isProximityRadarEnabled) {
         return [];
      }

      const localPosition = localUser?.position;
      const hashAngle = (seed: string) => {
         let hash = 0;
         for (let i = 0; i < seed.length; i++) {
            hash = ((hash << 5) - hash) + seed.charCodeAt(i);
            hash |= 0;
         }
         return ((Math.abs(hash) % 360) * Math.PI) / 180;
      };

      return Array.from(proximityRadarContacts.values())
         .map((contact) => {
            const user = users.get(contact.userId);
            const clampedDistance = Math.min(contact.distance, contact.maxRange);
            const normalizedDistance = Math.max(0, Math.min(1, clampedDistance / contact.maxRange));
            let angle = hashAngle(contact.userId);

            const targetPosition = user?.position;
            if (
               localPosition &&
               targetPosition &&
               localPosition.worldId === targetPosition.worldId
            ) {
               const dx = targetPosition.x - localPosition.x;
               const dz = targetPosition.z - localPosition.z;
               angle = Math.atan2(dz, dx);
            }

            const radius = normalizedDistance * 40; // Keep blips inside ring.

            return {
               userId: contact.userId,
               label: user?.name ?? contact.userId.slice(0, 8),
               distance: contact.distance,
               maxRange: contact.maxRange,
               x: 50 + Math.cos(angle) * radius,
               y: 50 + Math.sin(angle) * radius,
            };
         })
         .sort((a, b) => a.distance - b.distance);
   }, [isProximityRadarEnabled, localUser?.position, proximityRadarContacts, users]);

   const range = useMemo(() => {
      if (typeof currentGroupRange === 'number' && Number.isFinite(currentGroupRange) && currentGroupRange > 0) {
         return Math.round(currentGroupRange);
      }
      const nearestRange = targets[0]?.maxRange;
      return nearestRange ? Math.round(nearestRange) : 50;
   }, [currentGroupRange, targets]);

   return (
      <Panel title="Proximity Radar" className="relative overflow-hidden" 
         rightElement={
            <button onClick={() => setShowMap(!showMap)} className={cn("p-1 rounded hover:bg-white/10 transition-colors", showMap ? "text-[var(--accent-primary)]" : "text-[var(--text-secondary)]")}>
               <MapPin className="w-3.5 h-3.5" />
            </button>
         }
      >
         <div className="aspect-square relative border border-[var(--border-primary)] bg-[var(--bg-input)] rounded-[var(--radius-btn)] overflow-hidden shadow-inner">
            {/* World Map Layer */}
            {showMap && (
               <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/graphy.png')] opacity-20 mix-blend-overlay" />
            )}

            {/* Grid Lines */}
            <div className="absolute inset-0 bg-[linear-gradient(var(--border-primary)_1px,transparent_1px),linear-gradient(90deg,var(--border-primary)_1px,transparent_1px)] bg-[size:30px_30px] opacity-10" />

            {/* Radar Elements */}
            <div className="absolute inset-0 flex items-center justify-center">
               <div className="w-[80%] h-[80%] rounded-full border border-[var(--border-primary)] opacity-30 group-[[data-theme='hytale']_&]:border-[var(--accent-primary)]/30" />
               <div className="absolute w-[40%] h-[40%] rounded-full border border-[var(--border-primary)] opacity-30 group-[[data-theme='hytale']_&]:border-[var(--accent-primary)]/30" />
               <div className="absolute w-full h-[1px] bg-[var(--border-primary)] opacity-30" />
               <div className="absolute h-full w-[1px] bg-[var(--border-primary)] opacity-30" />
            </div>

            {/* Sweep Animation */}
            <div className="absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,transparent_0deg,transparent_270deg,var(--accent-primary)_360deg)] opacity-10 animate-[spin_4s_linear_infinite]" />

            {/* Center Player */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-[var(--accent-primary)] rounded-full z-10 ring-2 ring-[var(--bg-input)]" />

            {isProximityRadarEnabled ? (
               targets.map((target) => (
                  <div
                     key={target.userId}
                     className="absolute flex flex-col items-center gap-1 z-10 -translate-x-1/2 -translate-y-1/2"
                     style={{ left: `${target.x}%`, top: `${target.y}%` }}
                  >
                     <div className="w-2 h-2 bg-[var(--accent-success)] rounded-full shadow-[0_0_8px_var(--accent-success)]" />
                     <span className="text-[7px] font-bold text-[var(--accent-success)] bg-[var(--bg-app)]/90 px-1 rounded border border-[var(--accent-success)]/30 backdrop-blur-sm">
                        {target.label}
                     </span>
                  </div>
               ))
            ) : (
               <div className="absolute inset-0 z-10 grid place-items-center px-4 text-center">
                  <p className="text-[9px] font-mono text-[var(--text-secondary)]">
                     Proximity radar disabled by server config (`USE_PROXIMITY_RADAR = false`).
                  </p>
               </div>
            )}
         </div>

         <div className="mt-3 flex justify-between text-[9px] font-mono text-[var(--text-secondary)] bg-[var(--bg-input)] p-1.5 rounded border border-[var(--border-primary)]">
            <span>
               POS:{' '}
               <span className="text-[var(--text-primary)]">
                  {localUser?.position
                     ? `${Math.round(localUser.position.x)}, ${Math.round(localUser.position.z)}`
                     : '--'}
               </span>
            </span>
            <span>
               RANGE: <span className="text-[var(--text-primary)]">{range}m</span>
            </span>
            <span>
               ACTIVE: <span className="text-[var(--text-primary)]">{targets.length}</span>
            </span>
         </div>
      </Panel>
   );
};

export const SystemStatus = () => {
   const { inputDevices, outputDevices, inputDeviceId, outputDeviceId, setInputDevice, setOutputDevice } = useAudioDevices();
   const settings = useAudioStore((s) => s.settings);
   const setEchoCancellation = useAudioStore((s) => s.setEchoCancellation);
   const setNoiseSuppression = useAudioStore((s) => s.setNoiseSuppression);
   const setAutoGainControl = useAudioStore((s) => s.setAutoGainControl);
   const isAudioInitialized = useAudioStore((s) => s.isAudioInitialized);

   return (
      <Panel title="Hardware Config">
         <div className="space-y-4">
            <Select
               label="Input Source"
               value={inputDeviceId}
               onChange={(e) => setInputDevice(e.target.value)}
               options={[
                  { value: 'default', label: 'Default Microphone' },
                  ...inputDevices.filter(d => d.deviceId !== 'default').map(d => ({ value: d.deviceId, label: d.label }))
               ]}
            />
            <Select
               label="Output Destination"
               value={outputDeviceId}
               onChange={(e) => setOutputDevice(e.target.value)}
               options={[
                  { value: 'default', label: 'Default Speakers' },
                  ...outputDevices.filter(d => d.deviceId !== 'default').map(d => ({ value: d.deviceId, label: d.label }))
               ]}
            />

            <div className="grid grid-cols-2 gap-x-4 gap-y-3 pt-2">
               <Switch label="Echo Cancel" checked={settings.echoCancellation} onChange={setEchoCancellation} />
               <Switch label="Noise Suppr." checked={settings.noiseSuppression} onChange={setNoiseSuppression} />
               <Switch label="Auto Gain" checked={settings.autoGainControl} onChange={setAutoGainControl} />
               <Switch label="3D Spatial" checked={true} onChange={() => {}} />
            </div>

            <div className="bg-[var(--bg-input)] p-3 rounded-[var(--radius-btn)] border border-[var(--border-primary)] flex justify-between items-center mt-2 shadow-inner">
               <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-[var(--text-secondary)]" />
                  <div className="text-[10px] font-bold text-[var(--text-secondary)] tracking-wider">Audio Engine</div>
               </div>
               <div className={cn(
                  "text-[10px] font-mono px-2 py-0.5 rounded border",
                  isAudioInitialized 
                     ? "text-[var(--accent-success)] bg-[var(--accent-success)]/10 border-[var(--accent-success)]/30"
                     : "text-[var(--text-secondary)] bg-[var(--bg-panel)] border-[var(--border-primary)]"
               )}>
                  {isAudioInitialized ? 'ONLINE :: 48kHz' : 'STANDBY'}
               </div>
            </div>
         </div>
      </Panel>
   );
};

// --- Main Telemetry Export ---

export const TelemetryPanel = () => {
   const audioDiagnostics = useAudioStore((s) => s.audioDiagnostics)
   const connectionWarnings = useConnectionStore((s) => s.warnings)
   const clearConnectionWarnings = useConnectionStore((s) => s.clearWarnings)
   const totals = useMemo(() => {
      let underruns = 0
      let overruns = 0
      let droppedSamples = 0
      let bufferedSamples = 0

      audioDiagnostics.forEach((entry) => {
         underruns += entry.underruns
         overruns += entry.overruns
         droppedSamples += entry.droppedSamples
         bufferedSamples += entry.bufferedSamples
      })

      return { underruns, overruns, droppedSamples, bufferedSamples }
   }, [audioDiagnostics])

   return (
      <div className="flex flex-col gap-4 h-full">
         <SpatialRadar />
         <Panel title="Audio Diagnostics">
            <div className="grid grid-cols-2 gap-2">
               <div className="bg-[var(--bg-input)] border border-[var(--border-primary)] rounded-[var(--radius-btn)] p-2">
                  <p className="text-[8px] font-bold text-[var(--text-secondary)] uppercase">Underruns</p>
                  <p className="text-xs font-mono text-[var(--text-primary)]">{totals.underruns}</p>
               </div>
               <div className="bg-[var(--bg-input)] border border-[var(--border-primary)] rounded-[var(--radius-btn)] p-2">
                  <p className="text-[8px] font-bold text-[var(--text-secondary)] uppercase">Overruns</p>
                  <p className="text-xs font-mono text-[var(--text-primary)]">{totals.overruns}</p>
               </div>
               <div className="bg-[var(--bg-input)] border border-[var(--border-primary)] rounded-[var(--radius-btn)] p-2">
                  <p className="text-[8px] font-bold text-[var(--text-secondary)] uppercase">Dropped</p>
                  <p className="text-xs font-mono text-[var(--text-primary)]">{totals.droppedSamples}</p>
               </div>
               <div className="bg-[var(--bg-input)] border border-[var(--border-primary)] rounded-[var(--radius-btn)] p-2">
                  <p className="text-[8px] font-bold text-[var(--text-secondary)] uppercase">Buffered</p>
                  <p className="text-xs font-mono text-[var(--text-primary)]">{totals.bufferedSamples}</p>
               </div>
            </div>
         </Panel>
         <Panel
            title="Connection Warnings"
            rightElement={
               <button
                  type="button"
                  onClick={clearConnectionWarnings}
                  disabled={connectionWarnings.length === 0}
                  className={cn(
                     'text-[8px] font-mono uppercase tracking-wider px-2 py-1 rounded border transition-colors',
                     connectionWarnings.length === 0
                        ? 'text-[var(--text-secondary)] border-[var(--border-primary)] opacity-40 cursor-default'
                        : 'text-[var(--accent-warning)] border-[var(--accent-warning)]/40 hover:bg-[var(--accent-warning)]/10'
                  )}
               >
                  Clear
               </button>
            }
         >
            {connectionWarnings.length === 0 ? (
               <div className="bg-[var(--bg-input)] border border-[var(--border-primary)] rounded-[var(--radius-btn)] p-3">
                  <p className="text-[9px] font-mono text-[var(--text-secondary)] uppercase tracking-wider">
                     No runtime warnings detected.
                  </p>
               </div>
            ) : (
               <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                  {connectionWarnings.map((entry) => {
                     const sourceColor = entry.source === 'webrtc'
                        ? 'text-[var(--accent-warning)] border-[var(--accent-warning)]/30 bg-[var(--accent-warning)]/10'
                        : entry.source === 'audio'
                           ? 'text-[var(--accent-danger)] border-[var(--accent-danger)]/30 bg-[var(--accent-danger)]/10'
                           : 'text-[var(--accent-primary)] border-[var(--accent-primary)]/30 bg-[var(--accent-primary)]/10'
                     return (
                        <div key={entry.id} className="bg-[var(--bg-input)] border border-[var(--border-primary)] rounded-[var(--radius-btn)] p-2">
                           <div className="flex items-center justify-between gap-2 mb-1">
                              <span className={cn('text-[8px] font-bold uppercase px-1.5 py-0.5 rounded border', sourceColor)}>
                                 {entry.source}
                              </span>
                              <span className="text-[8px] font-mono text-[var(--text-secondary)]">
                                 {new Date(entry.timestamp).toLocaleTimeString()}
                              </span>
                           </div>
                           <p className="text-[9px] text-[var(--text-primary)] leading-snug">{entry.message}</p>
                        </div>
                     )
                  })}
               </div>
            )}
         </Panel>
         <div className="mt-auto opacity-50 p-2 border border-dashed border-[var(--border-primary)] rounded-[var(--radius-btn)] text-center">
            <p className="text-[8px] font-bold uppercase text-[var(--text-secondary)]">Telemetry Stream Active</p>
         </div>
      </div>
   );
};
