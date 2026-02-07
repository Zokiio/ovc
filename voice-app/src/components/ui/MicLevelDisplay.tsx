import { memo } from 'react';
import { useAudioStore } from '../../stores/audioStore';
import { AudioLevelMeter } from './AudioControls';

/**
 * Isolated mic level display component.
 * Uses its own store subscription to avoid re-rendering parent components.
 */
export const MicLevelDisplay = memo(function MicLevelDisplay() {
  const micLevel = useAudioStore((s) => s.micLevel);
  const isSpeaking = useAudioStore((s) => s.isSpeaking);
  const isMicMuted = useAudioStore((s) => s.isMicMuted);
  const threshold = useAudioStore((s) => s.vadSettings.threshold);

  return (
    <div className="w-full max-w-[100px] sm:max-w-[180px]">
      <div className="flex justify-between text-[10px] font-bold text-[var(--text-secondary)] mb-1 uppercase tracking-wider">
        <span>Mic</span>
        <span className={micLevel > 80 ? 'text-[var(--accent-danger)]' : isSpeaking ? 'text-[var(--accent-success)]' : 'text-[var(--text-primary)]'}>
          {Math.round(micLevel)}%
        </span>
      </div>
      <AudioLevelMeter
        value={isMicMuted ? 0 : micLevel}
        threshold={threshold}
        segments={16}
      />
    </div>
  );
});

/**
 * Isolated speaking indicator that subscribes to its own state.
 */
export const SpeakingIndicatorIsolated = memo(function SpeakingIndicatorIsolated({ size = 'lg' }: { size?: 'sm' | 'md' | 'lg' }) {
  const isSpeaking = useAudioStore((s) => s.isSpeaking);
  const isMicMuted = useAudioStore((s) => s.isMicMuted);

  // Simple speaking indicator dot
  const sizeClasses = {
    sm: 'w-2 h-2',
    md: 'w-3 h-3',
    lg: 'w-4 h-4',
  };

  return (
    <div
      className={`${sizeClasses[size]} rounded-full transition-colors duration-150 ${
        isMicMuted
          ? 'bg-[var(--accent-danger)]'
          : isSpeaking
          ? 'bg-[var(--accent-success)] animate-pulse'
          : 'bg-[var(--text-tertiary)]'
      }`}
    />
  );
});

/**
 * Isolated mic test component for settings/login views.
 * Subscribes to store internally to avoid parent re-renders.
 */
export const MicTestDisplay = memo(function MicTestDisplay() {
  const micLevel = useAudioStore((s) => s.micLevel);

  return (
    <div className="bg-[var(--bg-input)] p-4 rounded-[var(--radius-btn)] border border-[var(--border-primary)] space-y-3 shadow-inner">
      <div className="flex justify-between items-center text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
        <span>Microphone Test</span>
        <span className="text-[var(--accent-success)]">{Math.round(micLevel)}%</span>
      </div>
      <div 
        className="h-2.5 bg-[var(--bg-primary)] rounded-full overflow-hidden"
        role="meter"
        aria-valuenow={micLevel}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full bg-[var(--accent-success)] transition-all duration-75"
          style={{ width: `${micLevel}%` }}
        />
      </div>
      <p className="text-[9px] text-[var(--text-secondary)] italic">Speak to verify your input levels are registering correctly.</p>
    </div>
  );
});
