import React, { useState, useEffect } from 'react';
import { Panel, Input, Button, Badge, Modal, Select, Meter } from '../../ui/Primitives';
import {
  Terminal, Palette, Eye, EyeOff,
  Save, Trash2, Play, Plus, Shield, ShieldOff,
  Globe, Settings, Loader2
} from 'lucide-react';
import { useTheme } from '../../../context/ThemeContext';
import { cn } from '../../../lib/utils';
import { useConnection } from '../../../hooks/useConnection';
import { useSettingsStore } from '../../../stores/settingsStore';
import { useConnectionStore } from '../../../stores/connectionStore';
import { useAudioDevices } from '../../../hooks/useAudioDevices';
import { useAudioStore } from '../../../stores/audioStore';
import type { SavedServer } from '../../../lib/types';

export const LoginView = ({ onConnect }: { onConnect: (username: string, server: string) => void }) => {
  // Connection
  const { connect, status } = useConnection();
  const errorMessage = useConnectionStore((s) => s.errorMessage);
  
  // Saved servers from store
  const savedServers = useSettingsStore((s) => s.savedServers);
  const lastServerUrl = useSettingsStore((s) => s.lastServerUrl);
  const addSavedServer = useSettingsStore((s) => s.addSavedServer);
  const removeSavedServer = useSettingsStore((s) => s.removeSavedServer);
  
  // Audio devices
  const { inputDevices, outputDevices, inputDeviceId, outputDeviceId, setInputDevice, setOutputDevice } = useAudioDevices();
  const micLevel = useAudioStore((s) => s.micLevel);

  const [username, setUsername] = useState('');
  const [server, setServer] = useState(lastServerUrl || 'wss://comm.relay.v4');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isStreamerMode, setIsStreamerMode] = useState(false);
  const [showAudioSettings, setShowAudioSettings] = useState(false);
  
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [nickname, setNickname] = useState('');

  const { toggleTheme } = useTheme();
  
  const isConnecting = status === 'connecting';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (username && server && !isConnecting) {
      await connect(server, username, password);
      // If connection succeeds, the parent will be notified via store changes
      if (status === 'connected') {
        onConnect(username, server);
      }
    }
  };
  
  // Watch for successful connection
  useEffect(() => {
    if (status === 'connected' && username && server) {
      onConnect(username, server);
    }
  }, [status, username, server, onConnect]);

  const handleSaveRealm = () => {
    if (server && nickname) {
      addSavedServer(server, nickname, username, password);
    }
    setShowSaveModal(false);
    setNickname('');
  };

  const handleSelectServer = (savedServer: SavedServer) => {
    setServer(savedServer.url);
    if (savedServer.username) setUsername(savedServer.username);
    if (savedServer.authToken) setPassword(savedServer.authToken);
  };
  
  const handleDeleteServer = (url: string) => {
    removeSavedServer(url);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-app)] text-[var(--text-primary)] relative transition-colors duration-300 p-4 font-[family-name:var(--font-body)]">
      {/* Background Effects */}
      <div className="absolute inset-0 opacity-20 pointer-events-none bg-[linear-gradient(var(--border-primary)_1px,transparent_1px),linear-gradient(90deg,var(--border-primary)_1px,transparent_1px)] bg-[size:20px_20px]" />
      
      <div className="absolute top-4 right-4 z-20 flex gap-2">
         <button 
            onClick={() => setIsStreamerMode(!isStreamerMode)} 
            className={cn(
               "p-2 border border-[var(--border-primary)] rounded-[var(--radius-btn)] transition-all shadow-lg hover:shadow-[var(--shadow-glow)] flex items-center gap-2",
               isStreamerMode ? "bg-[var(--accent-success)]/20 text-[var(--accent-success)] border-[var(--accent-success)]" : "bg-[var(--bg-panel)] text-[var(--text-secondary)] hover:text-white"
            )}
         >
            {isStreamerMode ? <Shield className="w-4 h-4" /> : <ShieldOff className="w-4 h-4" />}
            <span className="text-[10px] font-bold uppercase hidden sm:inline">Streamer Mode</span>
         </button>

         <button onClick={toggleTheme} aria-label="Toggle theme" className="p-2 bg-[var(--bg-panel)] border border-[var(--border-primary)] rounded-[var(--radius-btn)] text-[var(--text-secondary)] hover:text-white transition-all shadow-lg hover:shadow-[var(--shadow-glow)]">
            <Palette className="w-4 h-4" />
         </button>
      </div>

      <div className="w-full max-w-5xl z-10">
        <Panel className="p-0 border-2 overflow-hidden shadow-2xl">
          <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[500px] lg:min-h-[600px]">
            
            {/* Left: Saved Realms */}
            <div className="lg:col-span-4 bg-[var(--bg-input)]/30 border-b lg:border-b-0 lg:border-r border-[var(--border-primary)] p-4 lg:p-6 flex flex-col gap-4 lg:gap-6">
               <div className="flex items-center justify-between">
                  <h2 className="text-xs lg:text-sm font-bold uppercase text-[var(--text-primary)] font-[family-name:var(--font-heading)] flex items-center gap-2">
                     <Save className="w-4 h-4 text-[var(--accent-primary)]" /> <span className="hidden lg:inline">Saved Realms</span><span className="lg:hidden">Realms</span>
                  </h2>
                  <Badge variant="neutral" className="min-w-0 px-2">{savedServers.length}</Badge>
               </div>

               <div className="flex lg:flex-col gap-3 overflow-x-auto lg:overflow-y-auto pb-2 lg:pb-0 custom-scrollbar snap-x">
                  {savedServers.map((s, idx) => (
                     <div
                        key={s.url + idx}
                        className="flex-shrink-0 w-40 lg:w-full p-3 rounded-[var(--radius-btn)] border border-[var(--border-primary)] bg-[var(--bg-panel)] hover:border-[var(--accent-primary)] transition-all group/server relative overflow-hidden snap-start"
                     >
                        <div className="min-w-0 pr-6 lg:pr-8">
                           <div className="text-[11px] lg:text-xs font-bold text-[var(--text-primary)] truncate">{s.name}</div>
                           <div className={cn(
                              "text-[9px] lg:text-[10px] text-[var(--text-secondary)] font-mono truncate transition-all duration-300",
                              isStreamerMode ? "blur-[4px] select-none opacity-40" : "opacity-60"
                           )}>
                              {s.url}
                           </div>
                        </div>
                        
                        <div className="absolute right-1 lg:right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 lg:gap-1 opacity-100 lg:opacity-0 group-hover/server:opacity-100 transition-opacity">
                           <button
                             onClick={() => handleSelectServer(s)} aria-label="Use this server" className="p-1 text-[var(--accent-primary)] hover:text-white"
                           >
                              <Play className="w-3.5 h-3.5 fill-current" />
                           </button>
                           <button 
                             onClick={() => handleDeleteServer(s.url)} aria-label="Delete server" className="p-1 text-[var(--text-secondary)] hover:text-[var(--accent-danger)] hidden lg:block"
                           >
                              <Trash2 className="w-3.5 h-3.5" />
                           </button>
                        </div>
                     </div>
                  ))}

                  <button 
                    onClick={() => setShowSaveModal(true)}
                    className="flex-shrink-0 w-32 lg:w-full py-3 border border-dashed border-[var(--border-primary)] rounded-[var(--radius-btn)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all flex items-center justify-center gap-2 bg-[var(--bg-panel)]/30 text-[9px] font-bold uppercase tracking-widest snap-start"
                  >
                     <Plus className="w-3 h-3 lg:w-4 lg:h-4" /> <span className="hidden lg:inline">Register Node</span><span className="lg:hidden">Add</span>
                  </button>
               </div>

               <div className="hidden lg:block p-3 bg-[var(--bg-panel)]/50 rounded border border-[var(--border-primary)] border-dashed mt-auto">
                  <p className="text-[9px] text-[var(--text-secondary)] italic leading-relaxed text-center">
                     Saved realms are stored in your local browser cache.
                  </p>
               </div>
            </div>

            {/* Right: Main Login Form */}
            <div className="lg:col-span-8 p-6 lg:p-12 flex flex-col justify-center relative">
               {/* Audio Settings Toggle (Triggers Modal) */}
               <div className="absolute top-4 right-4">
                  <button 
                     onClick={() => setShowAudioSettings(true)}
                     className="p-2 rounded-[var(--radius-btn)] transition-all flex items-center gap-2 text-[10px] font-bold uppercase text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)]"
                  >
                     <Settings className="w-4 h-4" />
                     <span className="hidden sm:inline">Audio Config</span>
                  </button>
               </div>

               <div className="flex items-center gap-4 mb-6 lg:mb-10 justify-center">
                  <div className="w-16 h-16 lg:w-20 lg:h-20 shrink-0">
                     <img src="/logo.png" alt="OVC Logo" className="w-full h-full object-contain" />
                  </div>
                  <div className="text-left">
                     <h1 className="text-3xl lg:text-5xl font-bold font-[family-name:var(--font-heading)] tracking-tighter uppercase leading-none text-[var(--text-primary)]">
                        OVC
                     </h1>
                     <p className="text-[10px] lg:text-sm text-[var(--text-secondary)] uppercase tracking-[0.2em] font-bold mt-1">Obsolete Voice Chat</p>
                  </div>
               </div>

               <form onSubmit={handleSubmit} className="max-w-md mx-auto w-full space-y-5 lg:space-y-6">
                  <div className="p-2.5 lg:p-3 bg-[var(--accent-warning)]/5 border border-[var(--accent-warning)]/30 text-[var(--accent-warning)] text-[9px] lg:text-[10px] font-[family-name:var(--font-body)] flex gap-3 rounded-[var(--radius-btn)] items-center">
                     <Terminal className="w-3.5 h-3.5 lg:w-4 lg:h-4 shrink-0" />
                     <span className="tracking-wide uppercase">Please enter your details to join the chat.</span>
                  </div>

                  <div className="space-y-4">
                     <Input
                        label="Player Identity"
                        placeholder="Your username..."
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        autoComplete="username"
                        autoFocus
                     />

                     <div className="space-y-1.5">
                        <div className="flex justify-between items-center px-1">
                           <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase font-[family-name:var(--font-heading)]">Party Relay</label>
                           <button 
                              type="button"
                              onClick={() => setShowSaveModal(true)}
                              className="text-[10px] font-bold uppercase flex items-center gap-1.5 text-[var(--text-secondary)] hover:text-white transition-colors"
                           >
                              <Save className="w-3 h-3" /> Save Realm
                           </button>
                        </div>
                        <div className="relative group/relay">
                           <Input
                              placeholder="Server address..."
                              value={server}
                              onChange={(e) => setServer(e.target.value)}
                              autoComplete="url"
                              className={cn(
                                 "transition-all duration-300",
                                 isStreamerMode && "blur-[6px] focus:blur-0 select-none"
                              )}
                           />
                           {isStreamerMode && (
                              <div className="absolute left-3 bottom-2.5 text-[9px] font-bold text-[var(--accent-success)] opacity-100 group-focus-within/relay:opacity-0 pointer-events-none transition-opacity">
                                 [ STREAMER_MODE_ACTIVE ]
                              </div>
                           )}
                        </div>
                     </div>

                     <div className="space-y-1.5">
                        <div className="flex justify-between items-center px-1">
                           <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase font-[family-name:var(--font-heading)]">Access Token (Optional)</label>
                           <button 
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="text-[10px] font-bold uppercase flex items-center gap-1.5 text-[var(--text-secondary)] hover:text-white transition-colors"
                           >
                              {showPassword ? <><EyeOff className="w-3 h-3" /> Hide</> : <><Eye className="w-3 h-3" /> Show</>}
                           </button>
                        </div>
                        <Input
                           type={showPassword ? "text" : "password"}
                           placeholder="••••••••••••"
                           value={password}
                           onChange={(e) => setPassword(e.target.value)}
                           autoComplete="current-password"
                        />
                     </div>
                  </div>

                  <div className="pt-2">
                     <Button type="submit" fullWidth size="lg" className="h-12 lg:h-14 text-sm lg:text-base shadow-xl" disabled={isConnecting}>
                        {isConnecting ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Connecting...
                          </>
                        ) : (
                          <>
                            <Play className="w-4 h-4 fill-current mr-2" /> Connect to Server
                          </>
                        )}
                     </Button>
                     {errorMessage && (
                       <div className="mt-2 p-2 bg-[var(--accent-danger)]/10 border border-[var(--accent-danger)]/30 rounded text-[var(--accent-danger)] text-[10px] text-center">
                         {errorMessage}
                       </div>
                     )}
                  </div>
                  
                  <div className="text-center">
                     <span className="text-[9px] text-[var(--text-secondary)] uppercase font-bold tracking-widest opacity-40">
                        Secure • Encrypted • Low Latency • V4.0.1
                     </span>
                  </div>
               </form>
            </div>

          </div>
        </Panel>
      </div>

      {/* Save Nickname Modal */}
      <Modal
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        title="Register Saved Realm"
      >
         <div className="space-y-6 p-1">
            <div className="bg-[var(--bg-input)] p-4 rounded-[var(--radius-btn)] border border-[var(--border-primary)] flex items-center gap-4 shadow-inner">
               <div className="w-10 h-10 bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] border border-[var(--accent-primary)]/30 rounded flex items-center justify-center shrink-0">
                  <Globe className="w-6 h-6" />
               </div>
               <div className="min-w-0">
                  <div className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">Target Address</div>
                  <div className="text-xs font-mono truncate text-[var(--text-primary)]">{server}</div>
               </div>
            </div>

            <Input 
               label="Realm Nickname" 
               placeholder="E.g. Community Server" 
               value={nickname}
               onChange={(e) => setNickname(e.target.value)}
               autoFocus
            />

            <div className="flex gap-3 pt-2">
               <Button fullWidth onClick={handleSaveRealm}>
                  Confirm Registration
               </Button>
               <Button variant="ghost" onClick={() => setShowSaveModal(false)}>
                  Cancel
               </Button>
            </div>
         </div>
      </Modal>

      {/* Audio Settings Modal */}
      <Modal
        isOpen={showAudioSettings}
        onClose={() => setShowAudioSettings(false)}
        title="Audio Configuration"
      >
         <div className="space-y-6 p-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
               <Select 
                  label="Input Device" 
                  value={inputDeviceId}
                  onChange={(e) => setInputDevice(e.target.value)}
                  options={[
                     { value: 'default', label: 'Default Microphone' },
                     ...inputDevices.map(d => ({ value: d.deviceId, label: d.label }))
                  ]} 
               />
               <Select 
                  label="Output Device" 
                  value={outputDeviceId}
                  onChange={(e) => setOutputDevice(e.target.value)}
                  options={[
                     { value: 'default', label: 'Default Speakers' },
                     ...outputDevices.map(d => ({ value: d.deviceId, label: d.label }))
                  ]} 
               />
            </div>

            <div className="bg-[var(--bg-input)] p-4 rounded-[var(--radius-btn)] border border-[var(--border-primary)] space-y-3 shadow-inner">
               <div className="flex justify-between items-center text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                  <span>Microphone Test</span>
                  <span className="text-[var(--accent-success)]">{Math.round(micLevel)}%</span>
               </div>
               <Meter value={micLevel} className="h-2.5" />
               <p className="text-[9px] text-[var(--text-secondary)] italic">Speak to verify your input levels are registering correctly.</p>
            </div>

            <div className="flex flex-col gap-2 pt-2">
               <Button fullWidth onClick={() => setShowAudioSettings(false)}>
                  Apply Configuration
               </Button>
               <div className="text-center">
                  <span className="text-[9px] text-[var(--text-secondary)] font-bold uppercase opacity-50">Audio Engine v4.0 Active</span>
               </div>
            </div>
         </div>
      </Modal>
    </div>
  );
};
