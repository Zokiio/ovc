import { Badge } from '../../ui/Primitives';
import { Activity, Users } from 'lucide-react';
import { useGroupStore } from '../../../stores/groupStore';
import { UserCard } from '../../ui/UserCard';

export const ActiveChannel = ({ channelName }: { channelName: string }) => {
  // Use individual selectors for proper reactivity
  const groups = useGroupStore((s) => s.groups);
  const currentGroupId = useGroupStore((s) => s.currentGroupId);
  const currentGroup = groups.find((g) => g.id === currentGroupId) ?? null;

  // Get members from current group (already GroupMember[])
  const members = currentGroup?.members ?? [];

  return (
    <div className="flex flex-col h-full bg-[var(--bg-app)]">
       {/* Header */}
       <div className="h-14 bg-[var(--bg-panel)] border-b border-[var(--border-primary)] flex items-center justify-between px-6 shadow-sm shrink-0 sticky top-0 z-10">
          <div className="flex items-center gap-3">
             <div className="p-2 bg-[var(--bg-input)] rounded-[var(--radius-btn)] border border-[var(--border-primary)] text-[var(--accent-primary)]">
                <Activity className="w-5 h-5" />
             </div>
             <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-primary)] font-[family-name:var(--font-heading)]">
                   {currentGroup?.name ?? channelName}
                </h2>
                <p className="text-[10px] text-[var(--text-secondary)] font-mono tracking-widest">
                   {members.length} connected
                </p>
             </div>
          </div>
          <Badge variant={currentGroup?.settings.isPrivate ? 'warning' : 'neutral'}>
             {currentGroup?.settings.isPrivate ? 'Private' : 'Open'}
          </Badge>
       </div>

       {/* Users Grid */}
       <div className="flex-1 p-6 overflow-y-auto custom-scrollbar">
          {members.length === 0 ? (
             <div className="flex flex-col items-center justify-center h-full text-center text-[var(--text-secondary)]">
                <Users className="w-12 h-12 mb-3 opacity-30" />
                <p className="text-sm font-bold uppercase">No Members</p>
                <p className="text-xs mt-1 opacity-70">This channel is empty</p>
             </div>
          ) : (
             <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
                {members.map(member => (
                   <UserCard 
                     key={member.id} 
                     user={member}
                     showVolumeControls={true}
                     showSpeakingLevel={false}
                   />
                ))}
             </div>
          )}
       </div>
    </div>
  );
};
