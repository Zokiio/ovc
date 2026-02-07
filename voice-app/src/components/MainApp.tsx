import { useState, useEffect } from 'react';
import { AppShell } from './layout/AppShell';
import { PartyManager } from './features/party/PartyManager';
import { GlobalRoster } from './features/roster/GlobalRoster';
import { ActiveChannel } from './features/channel/ActiveChannel';
import { TelemetryPanel, ConnectionMonitor } from './features/telemetry/TelemetryPanel';
import { SettingsPanel } from './features/settings/SettingsPanel';
import { type SidebarView } from './layout/NavigationRail';
import { type MobileTab } from './layout/MobileNav';
import { MuteButton } from './ui/AudioControls';
import { MicLevelDisplay, SpeakingIndicatorIsolated } from './ui/MicLevelDisplay';
import { Clock } from 'lucide-react';
import { useAudioStore } from '../stores/audioStore';
import { useGroupStore } from '../stores/groupStore';
import { useConnection } from '../hooks/useConnection';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';

interface MainAppProps {
  user: { name: string; server: string };
  onLogout: () => void;
}

export const MainApp = ({ user, onLogout }: MainAppProps) => {
  // Only subscribe to state that doesn't change frequently
  const micMuted = useAudioStore((s) => s.isMicMuted);
  const toggleMicMuted = useAudioStore((s) => s.toggleMicMuted);
  const deafen = useAudioStore((s) => s.isDeafened);
  const toggleDeafened = useAudioStore((s) => s.toggleDeafened);

  // Use individual selectors for proper reactivity
  const groups = useGroupStore((s) => s.groups);
  const currentGroupId = useGroupStore((s) => s.currentGroupId);
  const currentGroup = groups.find((g) => g.id === currentGroupId) ?? null;
  const { disconnect } = useConnection();

  // Keyboard shortcuts for mute (M) and deafen (D)
  useKeyboardShortcuts();

  // Uptime tracker
  const [uptime, setUptime] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setUptime(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const formatUptime = (seconds: number) => {
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  // Navigation State
  const [activeSidebarView, setActiveSidebarView] = useState<SidebarView>('groups');
  const [activeMobileTab, setActiveMobileTab] = useState<MobileTab>('channel');

  const handleLogout = () => {
    disconnect();
    onLogout();
  };

  // Sidebar Content Logic
  const renderSidebarContent = () => {
    switch (activeSidebarView) {
      case 'groups':
        return <PartyManager />;
      case 'players':
        return <GlobalRoster />;
      case 'settings':
        return <SettingsPanel />;
      default:
        return null;
    }
  };

  // Mobile Content Logic
  const renderMobileContent = () => {
    switch (activeMobileTab) {
      case 'groups':
        return <div className="p-4 h-full"><PartyManager /></div>;
      case 'players':
        return <div className="p-4 h-full"><GlobalRoster /></div>;
      case 'radar':
        return (
          <div className="p-4 h-full overflow-y-auto custom-scrollbar flex flex-col gap-4">
             <TelemetryPanel />
             <SettingsPanel />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <AppShell
      serverName={user.server}
      userName={user.name}
      onLogout={handleLogout}
      activeSidebarView={activeSidebarView}
      onSidebarViewChange={setActiveSidebarView}
      sidebarContent={renderSidebarContent()}
      rightPanelContent={<TelemetryPanel />}
      activeMobileTab={activeMobileTab}
      onMobileTabChange={setActiveMobileTab}
      mobileViewContent={renderMobileContent()}
    >
      <div className="flex flex-col h-full">
         <div className="flex-1 overflow-hidden">
            <ActiveChannel channelName={currentGroup?.name ?? "No Channel"} />
         </div>

         {/* Persistent Footer */}
         <div className="h-auto bg-[var(--bg-panel)] border-t border-[var(--border-primary)] flex flex-col shrink-0 z-40 shadow-[0_-4px_10px_rgba(0,0,0,0.2)]">

            {/* Status Strip */}
            <div className="h-7 px-4 flex items-center justify-between border-b border-[var(--border-primary)] bg-[var(--bg-panel-header)]/80 backdrop-blur-md">
               <ConnectionMonitor compact />

               <div className="flex items-center gap-2 text-[10px] font-mono text-[var(--text-secondary)]">
                  <Clock className="w-3 h-3" />
                  <span>UPTIME:</span>
                  <span className="text-[var(--text-primary)] font-bold">{formatUptime(uptime)}</span>
               </div>
            </div>

            {/* Audio Bar */}
            <div className="h-16 px-4 flex items-center justify-between bg-[var(--bg-app)]/50 backdrop-blur-sm">
               <div className="flex items-center gap-4 flex-1">
                  {/* Speaking indicator + mic level - isolated components to prevent re-renders */}
                  <div className="flex items-center gap-3">
                     <SpeakingIndicatorIsolated size="lg" />
                     <MicLevelDisplay />
                  </div>
               </div>

               <div className="flex items-center gap-2 sm:gap-3">
                  <MuteButton
                     muted={micMuted}
                     onToggle={toggleMicMuted}
                     type="mic"
                     size="md"
                  />
                  <MuteButton
                     muted={deafen}
                     onToggle={toggleDeafened}
                     type="speaker"
                     size="md"
                  />
               </div>
            </div>
         </div>
      </div>
    </AppShell>
  );
};
