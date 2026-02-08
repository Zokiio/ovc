import { Server, Power, Palette, Layout, Shield, ShieldOff } from 'lucide-react';
import { Button } from '../ui/Primitives';
import { useTheme } from '../../context/theme-context';
import { useSettingsStore } from '../../stores/settingsStore';
import { cn } from '../../lib/utils';

export const TopBar = ({ 
  serverName, 
  userName, 
  onLogout, 
  onToggleRightPanel 
}: { 
  serverName: string, 
  userName: string, 
  onLogout: () => void,
  onToggleRightPanel: () => void
}) => {
  const { toggleTheme } = useTheme();
  const isStreamerMode = useSettingsStore((s) => s.isStreamerMode);
  const setStreamerMode = useSettingsStore((s) => s.setStreamerMode);

  return (
    <header className="h-14 bg-[var(--bg-panel)] border-b border-[var(--border-primary)] flex items-center justify-between px-4 shrink-0 z-30 shadow-md relative">
      {/* Brand & Server Info */}
      <div className="flex items-center gap-4">
         <div className="flex items-center gap-2 text-[var(--text-accent)] group cursor-default">
            <div className="relative w-8 h-8">
               <img src="/logo.png" alt="OVC" className="w-full h-full object-contain relative z-10" />
            </div>
            <span className="font-bold tracking-tight uppercase font-[family-name:var(--font-heading)] hidden sm:inline text-lg">
               OVC <span className="text-[var(--text-secondary)] text-xs mx-1">::</span> <span className="text-xs tracking-widest text-[var(--text-primary)]">Obsolete Voice Chat</span>
            </span>
            <span className="font-bold tracking-tight uppercase font-[family-name:var(--font-heading)] sm:hidden text-lg">
               OVC
            </span>
         </div>
         
         <div className="hidden sm:block h-6 w-[1px] bg-[var(--border-primary)]" />
         
         <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)] bg-[var(--bg-input)] px-2 py-1 rounded-[var(--radius-btn)] border border-[var(--border-primary)]">
            <Server className="w-3 h-3" />
            <span className={cn("uppercase max-w-[120px] truncate font-mono", isStreamerMode && "blur-[6px] select-none")}>{serverName}</span>
         </div>
      </div>
      
      {/* System Controls */}
      <div className="flex items-center gap-2">
         <button 
            onClick={() => setStreamerMode(!isStreamerMode)} 
            className={cn(
               "w-8 h-8 flex items-center justify-center rounded-[var(--radius-btn)] transition-all",
               isStreamerMode 
                  ? "bg-[var(--accent-success)]/20 text-[var(--accent-success)] border border-[var(--accent-success)]/50" 
                  : "hover:bg-[var(--bg-input)] text-[var(--text-secondary)]"
            )}
            title={isStreamerMode ? "Streamer Mode Active" : "Enable Streamer Mode"}
         >
            {isStreamerMode ? <Shield className="w-4 h-4" /> : <ShieldOff className="w-4 h-4" />}
         </button>

         <button 
            onClick={onToggleRightPanel} 
            className="hidden lg:flex w-8 h-8 items-center justify-center rounded-[var(--radius-btn)] hover:bg-[var(--bg-input)] text-[var(--text-secondary)] transition-colors"
            title="Toggle Telemetry"
         >
            <Layout className="w-4 h-4" />
         </button>
         
         <button 
            onClick={toggleTheme} 
            className="w-8 h-8 flex items-center justify-center rounded-[var(--radius-btn)] hover:bg-[var(--bg-input)] text-[var(--text-secondary)] transition-colors"
            title="Switch Theme"
         >
            <Palette className="w-4 h-4" />
         </button>
         
         <div className="h-6 w-[1px] bg-[var(--border-primary)] mx-1 hidden sm:block" />

         <div className="text-right hidden sm:block mr-2">
            <div className="text-xs font-bold text-[var(--text-primary)] uppercase font-[family-name:var(--font-heading)]">{userName}</div>
            <div className="text-[9px] text-[var(--accent-success)] font-bold uppercase tracking-wider">Connected</div>
         </div>
         
         <Button variant="danger" size="sm" onClick={onLogout} className="w-8 h-8 p-0">
            <Power className="w-4 h-4" />
         </Button>
      </div>
    </header>
  );
};
