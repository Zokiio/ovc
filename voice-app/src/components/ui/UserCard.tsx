import { memo, useCallback } from 'react';
import { cn } from '../../lib/utils';
import { useAudioStore } from '../../stores/audioStore';
import { Volume2, VolumeX, MicOff } from 'lucide-react';
import { AudioLevelMeter, SpeakingIndicator } from './AudioControls';
import type { GroupMember, User } from '../../lib/types';
import { getAudioPlaybackManager } from '../../lib/audio/playback-manager';

const clampUserVolume = (rawValue: number): number =>
  Math.max(0, Math.min(200, Number.isFinite(rawValue) ? rawValue : 100))

// --- Full User Card ---

interface UserCardProps {
  user: User | GroupMember;
  showVolumeControls?: boolean;
  showSpeakingLevel?: boolean;
  className?: string;
}

const UserCardComponent = ({ user, showVolumeControls = true, showSpeakingLevel = false, className }: UserCardProps) => {
  const selectLocalMuted = useCallback((s: ReturnType<typeof useAudioStore.getState>) => s.localMutes.get(user.id) ?? false, [user.id]);
  const selectUserVolume = useCallback((s: ReturnType<typeof useAudioStore.getState>) => s.userVolumes.get(user.id) ?? 100, [user.id]);

  const isLocalMuted = useAudioStore(selectLocalMuted);
  const volume = useAudioStore(selectUserVolume);
  const setLocalMute = useAudioStore((s) => s.setLocalMute);
  const setUserVolume = useAudioStore((s) => s.setUserVolume);
  const playbackManager = getAudioPlaybackManager()
  const isSpeaking = user.isSpeaking;
  const isMicMuted = user.isMicMuted;

  return (
    <div 
      className={cn(
        "bg-[var(--bg-panel)] border rounded-[var(--radius-panel)] p-4 transition-all duration-300",
        isSpeaking && !isLocalMuted
          ? "border-[var(--accent-success)] shadow-[0_0_12px_var(--accent-success)/30]"
          : "border-[var(--border-primary)]",
        className
      )}
    >
      {/* Header with Avatar and Status */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative">
          <div className={cn(
            "w-12 h-12 flex items-center justify-center font-bold text-xl rounded-[var(--radius-btn)] border-2 transition-all",
            isSpeaking && !isLocalMuted
              ? "bg-[var(--accent-success)]/20 text-[var(--accent-success)] border-[var(--accent-success)]"
              : "bg-[var(--bg-input)] text-[var(--text-primary)] border-[var(--border-primary)]"
          )}>
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div className="absolute -bottom-1 -right-1">
            <SpeakingIndicator 
              isSpeaking={isSpeaking && !isLocalMuted} 
              isMuted={isMicMuted || isLocalMuted} 
              size="md" 
            />
          </div>
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-[var(--text-primary)] truncate">{user.name}</div>
          <div className="flex items-center gap-2 mt-0.5">
            {isMicMuted && (
              <span className="text-[9px] font-bold uppercase text-[var(--accent-danger)] flex items-center gap-1">
                <MicOff className="w-3 h-3" /> Muted
              </span>
            )}
            {isLocalMuted && (
              <span className="text-[9px] font-bold uppercase text-[var(--accent-warning)] flex items-center gap-1">
                <VolumeX className="w-3 h-3" /> Silenced
              </span>
            )}
            {!isMicMuted && !isLocalMuted && (
              <span className="text-[9px] font-mono text-[var(--text-secondary)] uppercase">
                {isSpeaking ? 'Speaking' : 'Standby'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Speaking Level (optional) */}
      {showSpeakingLevel && isSpeaking && !isLocalMuted && (
        <div className="mb-3">
          <AudioLevelMeter value={70} segments={12} className="h-2" />
        </div>
      )}

      {/* Volume Controls */}
      {showVolumeControls && (
        <div className="space-y-2 bg-[var(--bg-input)] p-3 rounded-[var(--radius-btn)] border border-[var(--border-primary)]/50">
          <div className="flex justify-between items-center text-[10px] text-[var(--text-secondary)] font-bold">
            <span className="uppercase flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5" /> Volume
            </span>
            <span className="font-mono text-[var(--accent-primary)]">{volume}%</span>
          </div>
          <div className="flex items-center gap-3">
            <input 
              type="range" 
              className="flex-1 h-1.5 bg-[var(--bg-panel)] appearance-none cursor-pointer accent-[var(--accent-primary)] rounded-full" 
              value={volume}
              min={0}
              max={200}
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              aria-label={`Set ${user.name}'s volume`}
              onChange={(e) => {
                const nextVolume = clampUserVolume(Number(e.currentTarget.value))
                setUserVolume(user.id, nextVolume)
                playbackManager.setUserVolume(user.id, nextVolume)
              }}
            />
            <button 
              className={cn(
                "p-1.5 border rounded-[var(--radius-btn)] transition-all",
                isLocalMuted 
                  ? "bg-[var(--accent-danger)]/20 text-[var(--accent-danger)] border-[var(--accent-danger)]"
                  : "bg-[var(--bg-panel)] text-[var(--text-secondary)] border-[var(--border-primary)] hover:text-[var(--accent-danger)] hover:border-[var(--accent-danger)]"
              )}
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onClick={() => {
                const nextMuted = !isLocalMuted
                setLocalMute(user.id, nextMuted)
                playbackManager.setUserMuted(user.id, nextMuted)
              }}
              title={isLocalMuted ? "Unmute User" : "Mute User"}
            >
              {isLocalMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const areUserCardPropsEqual = (prev: UserCardProps, next: UserCardProps) =>
  prev.user.id === next.user.id &&
  prev.user.name === next.user.name &&
  prev.user.isSpeaking === next.user.isSpeaking &&
  prev.user.isMicMuted === next.user.isMicMuted &&
  prev.showVolumeControls === next.showVolumeControls &&
  prev.showSpeakingLevel === next.showSpeakingLevel &&
  prev.className === next.className;

export const UserCard = memo(UserCardComponent, areUserCardPropsEqual);

// --- Compact User Card for Lists ---

interface UserCardCompactProps {
  user: User | GroupMember;
  onClick?: () => void;
  showControls?: boolean;
  alwaysShowControls?: boolean;
  className?: string;
}

const UserCardCompactComponent = ({ user, onClick, showControls = true, alwaysShowControls = false, className }: UserCardCompactProps) => {
  const selectLocalMuted = useCallback((s: ReturnType<typeof useAudioStore.getState>) => s.localMutes.get(user.id) ?? false, [user.id]);
  const selectUserVolume = useCallback((s: ReturnType<typeof useAudioStore.getState>) => s.userVolumes.get(user.id) ?? 100, [user.id]);

  const isLocalMuted = useAudioStore(selectLocalMuted);
  const volume = useAudioStore(selectUserVolume);
  const setLocalMute = useAudioStore((s) => s.setLocalMute);
  const setUserVolume = useAudioStore((s) => s.setUserVolume);
  const playbackManager = getAudioPlaybackManager()
  const isSpeaking = user.isSpeaking;
  const isMicMuted = user.isMicMuted;

  return (
    <div 
      className={cn(
        "group flex items-center gap-3 p-2 rounded-[var(--radius-btn)] transition-all",
        onClick && "cursor-pointer hover:bg-[var(--bg-input)]",
        isSpeaking && !isLocalMuted && "bg-[var(--accent-success)]/5",
        className
      )}
      onClick={onClick}
    >
      {/* Avatar */}
      <div className="relative shrink-0">
        <div className={cn(
          "w-8 h-8 flex items-center justify-center font-bold text-sm rounded border transition-all",
          isSpeaking && !isLocalMuted
            ? "bg-[var(--accent-success)]/20 text-[var(--accent-success)] border-[var(--accent-success)]"
            : "bg-[var(--bg-input)] text-[var(--text-primary)] border-[var(--border-primary)]"
        )}>
          {user.name.charAt(0).toUpperCase()}
        </div>
        <div className="absolute -bottom-0.5 -right-0.5">
          <SpeakingIndicator 
            isSpeaking={isSpeaking && !isLocalMuted} 
            isMuted={isMicMuted || isLocalMuted} 
            size="sm" 
          />
        </div>
      </div>

      {/* Name and Status */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-[var(--text-primary)] truncate">{user.name}</div>
        <div className="text-[9px] font-mono text-[var(--text-secondary)] uppercase">
          {isLocalMuted ? 'Silenced' : isMicMuted ? 'Muted' : isSpeaking ? 'TX' : 'Standby'}
        </div>
      </div>

      {/* Quick Controls */}
      {showControls && (
        <div
          className={cn(
            "flex items-center gap-2 opacity-100 transition-opacity pointer-events-auto",
            !alwaysShowControls && "md:opacity-0 md:pointer-events-none md:group-hover:opacity-100 md:group-hover:pointer-events-auto md:group-focus-within:opacity-100 md:group-focus-within:pointer-events-auto"
          )}
        >
          <input 
            type="range" 
            className="player-volume-slider w-16 cursor-pointer" 
            value={volume}
            min={0}
            max={200}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Set ${user.name}'s volume`}
            onChange={(e) => {
              const nextVolume = clampUserVolume(Number(e.currentTarget.value))
              setUserVolume(user.id, nextVolume)
              playbackManager.setUserVolume(user.id, nextVolume)
            }}
            title={`Volume: ${volume}%`}
          />
          <button 
            className={cn(
              "p-1 rounded transition-all",
              isLocalMuted 
                ? "text-[var(--accent-danger)]"
                : "text-[var(--text-secondary)] hover:text-[var(--accent-danger)]"
            )}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              const nextMuted = !isLocalMuted
              setLocalMute(user.id, nextMuted)
              playbackManager.setUserMuted(user.id, nextMuted)
            }}
            title={isLocalMuted ? "Unmute" : "Mute"}
          >
            {isLocalMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      )}
    </div>
  );
};

const areUserCardCompactPropsEqual = (prev: UserCardCompactProps, next: UserCardCompactProps) =>
  prev.user.id === next.user.id &&
  prev.user.name === next.user.name &&
  prev.user.isSpeaking === next.user.isSpeaking &&
  prev.user.isMicMuted === next.user.isMicMuted &&
  prev.showControls === next.showControls &&
  prev.alwaysShowControls === next.alwaysShowControls &&
  prev.onClick === next.onClick &&
  prev.className === next.className;

export const UserCardCompact = memo(UserCardCompactComponent, areUserCardCompactPropsEqual);

// --- Minimal Speaking Indicator Row ---

interface SpeakingUserRowProps {
  user: User | GroupMember;
  className?: string;
}

export const SpeakingUserRow = ({ user, className }: SpeakingUserRowProps) => {
  const isSpeaking = user.isSpeaking;
  
  if (!isSpeaking) return null;

  return (
    <div className={cn(
      "flex items-center gap-2 px-2 py-1 bg-[var(--accent-success)]/10 rounded-full border border-[var(--accent-success)]/30",
      className
    )}>
      <div className="w-2 h-2 rounded-full bg-[var(--accent-success)] animate-pulse shadow-[0_0_6px_var(--accent-success)]" />
      <span className="text-xs font-bold text-[var(--accent-success)]">{user.name}</span>
    </div>
  );
};

// --- User Avatar with Status ---

interface UserAvatarProps {
  user: User | GroupMember;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showStatus?: boolean;
  className?: string;
}

export const UserAvatar = ({ user, size = 'md', showStatus = true, className }: UserAvatarProps) => {
  const localMutes = useAudioStore((s) => s.localMutes);
  const isLocalMuted = localMutes.get(user.id) ?? false;
  const isSpeaking = user.isSpeaking;
  const isMicMuted = user.isMicMuted;

  const sizeClasses = {
    sm: 'w-6 h-6 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-lg',
    xl: 'w-16 h-16 text-2xl'
  };

  const indicatorSizes = {
    sm: 'sm' as const,
    md: 'sm' as const,
    lg: 'md' as const,
    xl: 'lg' as const
  };

  return (
    <div className={cn("relative inline-block", className)}>
      <div className={cn(
        "flex items-center justify-center font-bold rounded-[var(--radius-btn)] border-2 transition-all",
        sizeClasses[size],
        isSpeaking && !isLocalMuted
          ? "bg-[var(--accent-success)]/20 text-[var(--accent-success)] border-[var(--accent-success)] shadow-[0_0_12px_var(--accent-success)/50]"
          : "bg-[var(--bg-input)] text-[var(--text-primary)] border-[var(--border-primary)]"
      )}>
        {user.name.charAt(0).toUpperCase()}
      </div>
      {showStatus && (
        <div className="absolute -bottom-0.5 -right-0.5">
          <SpeakingIndicator 
            isSpeaking={isSpeaking && !isLocalMuted} 
            isMuted={isMicMuted || isLocalMuted} 
            size={indicatorSizes[size]} 
          />
        </div>
      )}
    </div>
  );
};
