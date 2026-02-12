import React, { useEffect, useMemo, useState } from 'react';
import { Panel, Input, Button, Badge, Modal, Select } from '../../ui/Primitives';
import { MicTestDisplay } from '../../ui/MicLevelDisplay';
import {
  Terminal, Palette, Eye, EyeOff,
  Save, Trash2, Play, Plus, Shield, ShieldOff,
  Settings, Loader2, Edit2, RefreshCw
} from 'lucide-react';
import { useTheme } from '../../../context/theme-context';
import { cn, normalizeUrl } from '../../../lib/utils';
import { useSettingsStore } from '../../../stores/settingsStore';
import { useAudioDevices } from '../../../hooks/useAudioDevices';
import { useAudioStore } from '../../../stores/audioStore';
import type { ConnectionStatus, MicPermissionStatus } from '../../../lib/types';
import type { SavedServer } from '../../../lib/types';

interface LoginViewProps {
  onConnect: (username: string, server: string) => void;
  connect: (serverUrl: string, username: string, authCode?: string) => Promise<void>;
  prepareAudio: (source: 'connect' | 'audio-config' | 'dashboard-retry') => Promise<{ ok: boolean; status: MicPermissionStatus; message?: string }>;
  connectionStatus: ConnectionStatus;
  connectionError: string | null;
}

function readPrefillParam(params: URLSearchParams, keys: string[]): string | null {
  for (const key of keys) {
    const value = params.get(key);
    if (value && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

interface LoginPrefill {
  username: string | null;
  code: string | null;
  server: string | null;
}

function readLoginPrefillFromUrl(): LoginPrefill {
  const params = new URLSearchParams(window.location.search);
  return {
    username: readPrefillParam(params, ['username', 'user']),
    code: readPrefillParam(params, ['code', 'authCode', 'token', 'authToken']),
    server: readPrefillParam(params, ['server', 'relay', 'serverUrl']),
  };
}

export const LoginView = ({ onConnect, connect, prepareAudio, connectionStatus, connectionError }: LoginViewProps) => {
  const urlPrefill = useMemo(() => readLoginPrefillFromUrl(), []);
  
  // Saved servers from store
  const savedServers = useSettingsStore((s) => s.savedServers);
  const lastServerUrl = useSettingsStore((s) => s.lastServerUrl);
  const addSavedServer = useSettingsStore((s) => s.addSavedServer);
  const editSavedServer = useSettingsStore((s) => s.editSavedServer);
  const removeSavedServer = useSettingsStore((s) => s.removeSavedServer);
  const isStreamerMode = useSettingsStore((s) => s.isStreamerMode);
  const setStreamerMode = useSettingsStore((s) => s.setStreamerMode);
  
  // Audio devices
  const { inputDevices, outputDevices, inputDeviceId, outputDeviceId, setInputDevice, setOutputDevice } = useAudioDevices();
  
  const lastSavedServer = useMemo(() => {
    if (!lastServerUrl) {
      return null;
    }
    const normalizedLastServerUrl = normalizeUrl(lastServerUrl);
    return savedServers.find((savedServer) => normalizeUrl(savedServer.url) === normalizedLastServerUrl) ?? null;
  }, [lastServerUrl, savedServers]);

  const [username, setUsername] = useState<string | null>(urlPrefill.username);
  const [server, setServer] = useState<string | null>(urlPrefill.server);
  const [authCode, setAuthCode] = useState<string | null>(urlPrefill.code);
  const [showAuthCode, setShowAuthCode] = useState(false);
  const [showAudioSettings, setShowAudioSettings] = useState(false);
  const [isPreparingAudio, setIsPreparingAudio] = useState(false);
  
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [editingServerId, setEditingServerId] = useState<string | null>(null);
  const [nickname, setNickname] = useState('');

  const { toggleTheme } = useTheme();
  const micPermissionStatus = useAudioStore((s) => s.micPermissionStatus);
  const micPermissionMessage = useAudioStore((s) => s.micPermissionMessage);
  
  const isConnecting = connectionStatus === 'connecting';
  const usernameValue = username ?? lastSavedServer?.username ?? '';
  const serverValue = server ?? lastSavedServer?.url ?? '';
  const authCodeValue = authCode ?? lastSavedServer?.authToken ?? '';

  useEffect(() => {
    if (urlPrefill.username || urlPrefill.code || urlPrefill.server) {
      const sanitizedUrl = `${window.location.pathname}${window.location.hash}`;
      window.history.replaceState({}, document.title, sanitizedUrl);
    }
  }, [urlPrefill.username, urlPrefill.code, urlPrefill.server]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isConnecting) {
      return;
    }

    const normalizedUsername = usernameValue.trim();
    const normalizedServer = serverValue.trim();
    if (!normalizedUsername || !normalizedServer) {
      return;
    }

    const finalServer = normalizeUrl(normalizedServer);
    setUsername(normalizedUsername);
    setServer(finalServer);
    await connect(finalServer, normalizedUsername, authCodeValue);
  };
  
  // Watch for successful connection
  useEffect(() => {
    if (connectionStatus === 'connected' && usernameValue && serverValue) {
      onConnect(usernameValue, serverValue);
    }
  }, [connectionStatus, usernameValue, serverValue, onConnect]);

  const handleOpenSaveModal = (serverToEdit?: SavedServer) => {
    if (serverToEdit) {
      setEditingServerId(serverToEdit.id);
      setNickname(serverToEdit.name);
      // Pre-fill fields with the saved server's data
      setServer(serverToEdit.url);
      setUsername(serverToEdit.username || '');
      setAuthCode(serverToEdit.authToken || '');
    } else {
      setEditingServerId(null);
      setNickname('');
      // Keep existing main form values for new registration
    }
    setShowSaveModal(true);
  };

  const handleSaveRealm = () => {
    const normalizedServer = serverValue.trim();
    if (normalizedServer && nickname) {
      if (editingServerId) {
         editSavedServer(editingServerId, {
            url: normalizedServer,
            name: nickname,
            username: usernameValue,
            authToken: authCodeValue
         });
      } else {
         addSavedServer(normalizedServer, nickname, usernameValue, authCodeValue);
      }
    }
    setShowSaveModal(false);
    setNickname('');
    setEditingServerId(null);
  };

  const handleSelectServer = (savedServer: SavedServer) => {
    setServer(savedServer.url);
    if (savedServer.username) setUsername(savedServer.username);
    if (savedServer.authToken) setAuthCode(savedServer.authToken);
  };
  
  const handleDeleteServer = (id: string) => {
    removeSavedServer(id);
  };

  const openAudioConfig = () => {
    setShowAudioSettings(true);
    setIsPreparingAudio(true);
    void prepareAudio('audio-config').finally(() => setIsPreparingAudio(false));
  };

  const retryAudioPermission = () => {
    setIsPreparingAudio(true);
    void prepareAudio('audio-config').finally(() => setIsPreparingAudio(false));
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-app)] text-[var(--text-primary)] relative transition-colors duration-300 p-4 font-[family-name:var(--font-body)]">
      {/* Background Effects */}
      <div className="absolute inset-0 opacity-20 pointer-events-none bg-[linear-gradient(var(--border-primary)_1px,transparent_1px),linear-gradient(90deg,var(--border-primary)_1px,transparent_1px)] bg-[size:20px_20px]" />
      
      <div className="absolute top-4 right-4 z-20 flex gap-2">
         <button 
            onClick={() => setStreamerMode(!isStreamerMode)} 
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
                  <h2 className="text-xs lg:text-sm font-extrabold uppercase text-[var(--text-primary)] font-[family-name:var(--font-heading)] flex items-center gap-2">
                     <Save className="w-4 h-4 text-[var(--accent-primary)]" /> <span className="hidden lg:inline">Saved Realms</span><span className="lg:hidden">Realms</span>
                  </h2>
                  <Badge variant="neutral" className="min-w-0 px-2">{savedServers.length}</Badge>
               </div>

               <div className="flex lg:flex-col gap-3 overflow-x-auto lg:overflow-y-auto pb-2 lg:pb-0 custom-scrollbar snap-x">
                  {savedServers.map((s, idx) => (
                     <div
                        key={s.id || s.url + idx}
                        className="flex-shrink-0 w-40 lg:w-full p-3 rounded-[var(--radius-btn)] border border-[var(--border-primary)] bg-[var(--bg-panel)] hover:border-[var(--accent-primary)] transition-all group/server relative overflow-hidden snap-start"
                     >
                        <div className="min-w-0 pr-6 lg:pr-8">
                           <div className="text-[11px] lg:text-xs font-extrabold text-[var(--text-primary)] truncate">{s.name}</div>
                           <div className={cn(
                              "text-[9px] lg:text-[10px] text-[var(--text-secondary)] font-mono truncate transition-all duration-300 font-medium",
                              isStreamerMode ? "blur-[4px] select-none opacity-40" : "opacity-60"
                           )}>
                              {s.url}
                           </div>
                        </div>
                        
                        <div className="absolute right-1 lg:right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 lg:gap-1 opacity-100 lg:opacity-0 group-hover/server:opacity-100 transition-opacity">
                           <button
                             onClick={() => handleSelectServer(s)} aria-label="Use this server" className="p-1 text-[var(--accent-primary)] hover:text-white"
                             title="Connect"
                           >
                              <Play className="w-3.5 h-3.5 fill-current" />
                           </button>
                           <button
                             onClick={() => handleOpenSaveModal(s)} aria-label="Edit server" className="p-1 text-[var(--text-secondary)] hover:text-white hidden lg:block"
                             title="Edit"
                           >
                              <Edit2 className="w-3.5 h-3.5" />
                           </button>
                           <button 
                             onClick={() => handleDeleteServer(s.id)} aria-label="Delete server" className="p-1 text-[var(--text-secondary)] hover:text-[var(--accent-danger)] hidden lg:block"
                             title="Delete"
                           >
                              <Trash2 className="w-3.5 h-3.5" />
                           </button>
                        </div>
                     </div>
                  ))}

                  <button 
                    onClick={() => handleOpenSaveModal()}
                    className="flex-shrink-0 w-32 lg:w-full py-3 border border-dashed border-[var(--border-primary)] rounded-[var(--radius-btn)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all flex items-center justify-center gap-2 bg-[var(--bg-panel)]/30 text-[9px] font-extrabold uppercase tracking-widest snap-start"
                  >
                     <Plus className="w-3 h-3 lg:w-4 lg:h-4" /> <span className="hidden lg:inline">Register Node</span><span className="lg:hidden">Add</span>
                  </button>
               </div>

               <div className="hidden lg:block p-3 bg-[var(--bg-panel)]/50 rounded border border-[var(--border-primary)] border-dashed mt-auto">
                  <p className="text-[9px] text-[var(--text-secondary)] italic leading-relaxed text-center font-medium">
                     Saved realms are stored in your local browser cache.
                  </p>
               </div>
            </div>

            {/* Right: Main Login Form */}
            <div className="lg:col-span-8 p-6 lg:p-12 flex flex-col justify-center relative">
               {/* Audio Settings Toggle (Triggers Modal) */}
               <div className="absolute top-4 right-4">
                  <button 
                     onClick={openAudioConfig}
                     className="p-2 rounded-[var(--radius-btn)] transition-all flex items-center gap-2 text-[10px] font-extrabold uppercase text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)]"
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
                     <h1 className="text-3xl lg:text-5xl font-extrabold font-[family-name:var(--font-heading)] tracking-tighter uppercase leading-none text-[var(--text-primary)]">
                        OVC
                     </h1>
                     <p className="text-[10px] lg:text-sm text-[var(--text-secondary)] uppercase tracking-[0.2em] font-extrabold mt-1">Obsolete Voice Chat</p>
                  </div>
               </div>

               <form onSubmit={handleSubmit} className="max-w-md mx-auto w-full space-y-5 lg:space-y-6">
                  <div className="p-2.5 lg:p-3 bg-[var(--accent-warning)]/5 border border-[var(--accent-warning)]/30 text-[var(--accent-warning)] text-[9px] lg:text-[10px] font-[family-name:var(--font-body)] flex gap-3 rounded-[var(--radius-btn)] items-center">
                     <Terminal className="w-3.5 h-3.5 lg:w-4 lg:h-4 shrink-0" />
                     <span className="tracking-wide uppercase font-medium">Please enter your details to join the chat.</span>
                  </div>

                  <div className="space-y-4">
                     <Input
                        label="Player Identity"
                        placeholder="Your username..."
                        value={usernameValue}
                        onChange={(e) => setUsername(e.target.value)}
                        autoComplete="username"
                        autoFocus
                     />

                     <div className="space-y-1.5">
                        <div className="flex justify-between items-center px-1">
                           <label className="text-[10px] font-extrabold text-[var(--text-secondary)] uppercase font-[family-name:var(--font-heading)]">Party Relay</label>
                           <button 
                              type="button"
                              onClick={() => handleOpenSaveModal()}
                              className="text-[10px] font-extrabold uppercase flex items-center gap-1.5 text-[var(--text-secondary)] hover:text-white transition-colors"
                           >
                              <Save className="w-3 h-3" /> Save Realm
                           </button>
                        </div>
                        <div className="relative group/relay">
                           <Input
                              placeholder="Server address..."
                              value={serverValue}
                              onChange={(e) => setServer(e.target.value)}
                              autoComplete="url"
                              className={cn(
                                 "transition-all duration-300",
                                 isStreamerMode && "blur-[6px] focus:blur-0 select-none"
                              )}
                           />
                        </div>
                     </div>

                     <div className="space-y-1.5">
                        <div className="flex justify-between items-center px-1">
                           <label className="text-[10px] font-extrabold text-[var(--text-secondary)] uppercase font-[family-name:var(--font-heading)]">Access Token (Optional)</label>
                           <button 
                              type="button"
                              onClick={() => setShowAuthCode(!showAuthCode)}
                              className="text-[10px] font-extrabold uppercase flex items-center gap-1.5 text-[var(--text-secondary)] hover:text-white transition-colors"
                           >
                              {showAuthCode ? <><EyeOff className="w-3 h-3" /> Hide</> : <><Eye className="w-3 h-3" /> Show</>}
                           </button>
                        </div>
                        <Input
                           type={showAuthCode ? "text" : "password"}
                           placeholder="••••••••••••"
                           value={authCodeValue}
                           onChange={(e) => setAuthCode(e.target.value)}
                           autoComplete="current-password"
                        />
                        <p className="text-[9px] text-[var(--text-secondary)] italic px-1">
                           Generate a token in-game using <code className="text-[var(--accent-primary)] font-bold">/vc login</code>
                        </p>
                     </div>
                  </div>

                  <div className="pt-2">
                     <Button 
                        type="submit" 
                        fullWidth 
                        size="lg" 
                        className="h-11 lg:h-14 text-sm lg:text-base shadow-xl relative group/btn overflow-hidden transition-[transform,background-color,border-color,color,shadow] duration-500 hover:scale-[1.01] active:scale-[0.99] [transform:translateZ(0)]" 
                        disabled={isConnecting}
                     >
                        {/* Shimmer Effect - only on hover */}
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover/btn:animate-shimmer pointer-events-none" />
                        
                        {isConnecting ? (
                          <>
                            <Loader2 className="w-5 h-5 mr-3 animate-spin" /> CONNECTING...
                          </>
                        ) : (
                          <div className="flex items-center justify-center w-full relative z-10">
                            <Play className="w-5 h-5 fill-white mr-3 transition-transform duration-500 group-hover/btn:scale-110" /> 
                            <span className="tracking-[0.2em] uppercase">Connect</span>
                          </div>
                        )}
                     </Button>
                     {connectionError && (
                       <div className="mt-2 p-2 bg-[var(--accent-danger)]/10 border border-[var(--accent-danger)]/30 rounded text-[var(--accent-danger)] text-[10px] text-center font-medium">
                         {connectionError}
                       </div>
                     )}
                  </div>
                  
                  <div className="text-center">
                     <span className="text-[9px] text-[var(--text-secondary)] uppercase font-extrabold tracking-widest opacity-40">
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
        onClose={() => { setShowSaveModal(false); setEditingServerId(null); }}
        title={editingServerId ? "Edit Saved Realm" : "Register Saved Realm"}
      >
         <div className="space-y-4 p-1">
            <Input 
               label="Realm Nickname" 
               placeholder="E.g. Community Server" 
               value={nickname}
               onChange={(e) => setNickname(e.target.value)}
               autoFocus
            />

            <Input 
               label="Server Address" 
               placeholder="wss://..." 
               value={serverValue}
               onChange={(e) => setServer(e.target.value)}
               className={cn(isStreamerMode && "blur-[6px] focus:blur-0")}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
               <Input 
                  label="Default Username" 
                  placeholder="Username" 
                  value={usernameValue}
                  onChange={(e) => setUsername(e.target.value)}
               />
               <Input 
                  label="Access Token" 
                  type="password"
                  placeholder="Optional" 
                  value={authCodeValue}
                  onChange={(e) => setAuthCode(e.target.value)}
               />
            </div>

            <div className="flex gap-3 pt-4">
               <Button fullWidth onClick={handleSaveRealm}>
                  {editingServerId ? "Save Changes" : "Confirm Registration"}
               </Button>
               <Button variant="ghost" onClick={() => { setShowSaveModal(false); setEditingServerId(null); }}>
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
            <div className="space-y-2">
               {isPreparingAudio ? (
                  <div className="p-2 bg-[var(--accent-warning)]/10 border border-[var(--accent-warning)]/30 rounded text-[var(--accent-warning)] text-[10px] font-medium flex items-center gap-2">
                     <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                     Preparing microphone access...
                  </div>
               ) : micPermissionStatus === 'granted' ? (
                  <div className="p-2 bg-[var(--accent-success)]/10 border border-[var(--accent-success)]/30 rounded text-[var(--accent-success)] text-[10px] font-medium">
                     Microphone ready.
                  </div>
               ) : micPermissionStatus === 'denied' || micPermissionStatus === 'error' ? (
                  <div className="space-y-2">
                     <div className="p-2 bg-[var(--accent-danger)]/10 border border-[var(--accent-danger)]/30 rounded text-[var(--accent-danger)] text-[10px] font-medium">
                        {micPermissionMessage ?? 'Microphone access is unavailable.'}
                     </div>
                     <Button
                        fullWidth
                        variant="secondary"
                        onClick={retryAudioPermission}
                        disabled={isPreparingAudio}
                     >
                        <RefreshCw className="w-4 h-4" />
                        Retry Microphone Access
                     </Button>
                  </div>
               ) : null}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
               <Select
                  label="Input Device"
                  value={inputDeviceId}
                  onChange={(e) => setInputDevice(e.target.value)}
                  options={[
                     { value: 'default', label: 'Default Microphone' },
                     ...inputDevices.filter(d => d.deviceId !== 'default').map(d => ({ value: d.deviceId, label: d.label }))
                  ]}
               />
               <Select
                  label="Output Device"
                  value={outputDeviceId}
                  onChange={(e) => setOutputDevice(e.target.value)}
                  options={[
                     { value: 'default', label: 'Default Speakers' },
                     ...outputDevices.filter(d => d.deviceId !== 'default').map(d => ({ value: d.deviceId, label: d.label }))
                  ]}
               />
            </div>

            <MicTestDisplay />

            <div className="flex flex-col gap-2 pt-2">
               <Button fullWidth onClick={() => setShowAudioSettings(false)}>
                  Apply Configuration
               </Button>
               <div className="text-center">
                  <span className="text-[9px] text-[var(--text-secondary)] font-extrabold uppercase opacity-50">Audio Engine v4.0 Active</span>
               </div>
            </div>
         </div>
      </Modal>
    </div>
  );
};
