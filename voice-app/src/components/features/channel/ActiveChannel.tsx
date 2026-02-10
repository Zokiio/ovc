import { useState } from 'react';
import { Badge, Button, Input, Modal } from '../../ui/Primitives';
import { Activity, Users, Lock, Pin, Crown, KeyRound } from 'lucide-react';
import { useGroupStore } from '../../../stores/groupStore';
import { useConnectionStore } from '../../../stores/connectionStore';
import { UserCard } from '../../ui/UserCard';
import { getSignalingClient } from '../../../lib/signaling';

export const ActiveChannel = ({ channelName }: { channelName: string }) => {
  // Use individual selectors for proper reactivity
  const groups = useGroupStore((s) => s.groups);
  const currentGroupId = useGroupStore((s) => s.currentGroupId);
  const currentGroup = groups.find((g) => g.id === currentGroupId) ?? null;
  const clientId = useConnectionStore((s) => s.clientId);
  const isAdmin = useConnectionStore((s) => s.isAdmin);

  // Password change modal
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  const isCreator = !!(currentGroup?.creatorId && clientId && currentGroup.creatorId === clientId);

  // Get members from current group (already GroupMember[])
  const members = currentGroup?.members ?? [];

  const handleChangePassword = () => {
    if (currentGroup) {
      const signaling = getSignalingClient();
      signaling.updateGroupPassword(currentGroup.id, newPassword || null);
      setShowPasswordModal(false);
      setNewPassword('');
    }
  };

  const handleTogglePermanent = (isPermanent: boolean) => {
    if (currentGroup) {
      const signaling = getSignalingClient();
      signaling.setGroupPermanent(currentGroup.id, isPermanent);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[var(--bg-app)]">
       {/* Header */}
       <div className="h-14 bg-[var(--bg-panel)] border-b border-[var(--border-primary)] flex items-center justify-between px-3 sm:px-6 gap-2 shadow-sm shrink-0 sticky top-0 z-10">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
             <div className="p-2 bg-[var(--bg-input)] rounded-[var(--radius-btn)] border border-[var(--border-primary)] text-[var(--accent-primary)]">
                <Activity className="w-5 h-5" />
             </div>
             <div className="min-w-0">
                <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-primary)] font-[family-name:var(--font-heading)] truncate flex items-center gap-1.5">
                   {currentGroup?.name ?? channelName}
                   {currentGroup?.hasPassword && <Lock className="w-3 h-3 text-[var(--accent-warning)]" />}
                   {currentGroup?.isPermanent && <Pin className="w-3 h-3 text-[var(--accent-primary)]" />}
                </h2>
                <p className="text-[10px] text-[var(--text-secondary)] font-mono tracking-widest">
                   {members.length} connected
                </p>
             </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
             {/* Creator actions */}
             {isCreator && currentGroup && (
               <Button
                 size="sm"
                 variant="ghost"
                 onClick={() => {
                   setNewPassword('');
                   setShowPasswordModal(true);
                 }}
                 title={currentGroup.hasPassword ? 'Change password' : 'Set password'}
                 className="text-[var(--text-secondary)] hover:text-[var(--accent-primary)]"
               >
                 <KeyRound className="w-4 h-4" />
               </Button>
             )}
             {/* Admin permanent toggle */}
             {isAdmin && currentGroup && (
               <Button
                 size="sm"
                 variant={currentGroup.isPermanent ? 'primary' : 'ghost'}
                 onClick={() => handleTogglePermanent(!currentGroup.isPermanent)}
                 title={currentGroup.isPermanent ? 'Remove permanent status' : 'Mark as permanent'}
                 className={currentGroup.isPermanent ? '' : 'text-[var(--text-secondary)] hover:text-[var(--accent-primary)]'}
               >
                 <Pin className="w-4 h-4" />
               </Button>
             )}
             <Badge variant={currentGroup?.hasPassword ? 'warning' : 'neutral'} className="px-1.5 sm:px-2">
                {currentGroup?.hasPassword ? 'Locked' : 'Open'}
             </Badge>
             {currentGroup && (
               <Badge variant={currentGroup.settings.isIsolated ? 'warning' : 'success'} className="px-1.5 sm:px-2 max-[380px]:hidden">
                  {currentGroup.settings.isIsolated ? 'Isolated' : 'Hybrid'}
               </Badge>
             )}
          </div>
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
                   <div key={member.id} className="relative">
                     {currentGroup?.creatorId === member.id && (
                       <div className="absolute -top-1.5 -left-1.5 z-10 p-0.5 bg-[var(--accent-warning)] rounded-full" title="Group Creator">
                         <Crown className="w-3 h-3 text-[var(--bg-panel)]" />
                       </div>
                     )}
                     <UserCard 
                       user={member}
                       showVolumeControls={true}
                       showSpeakingLevel={false}
                     />
                   </div>
                ))}
             </div>
          )}
       </div>

       {/* Password Change Modal */}
       <Modal
         isOpen={showPasswordModal}
         onClose={() => setShowPasswordModal(false)}
         title={currentGroup?.hasPassword ? 'Change Password' : 'Set Password'}
       >
         <div className="space-y-4 p-1">
           <p className="text-xs text-[var(--text-secondary)]">
             {currentGroup?.hasPassword
               ? 'Enter a new password or leave empty to remove the password.'
               : 'Set a password to protect this party from unauthorized joins.'}
           </p>
           <Input
             label="Password"
             type="password"
             placeholder={currentGroup?.hasPassword ? 'New password (empty to remove)' : '••••••••'}
             value={newPassword}
             onChange={(e) => setNewPassword(e.target.value)}
             onKeyDown={(e) => {
               if (e.key === 'Enter') handleChangePassword();
             }}
             autoFocus
           />
           <div className="pt-2 flex gap-3">
             <Button
               fullWidth
               onClick={handleChangePassword}
               variant="primary"
             >
               {currentGroup?.hasPassword && !newPassword ? 'Remove Password' : 'Set Password'}
             </Button>
             <Button variant="ghost" onClick={() => setShowPasswordModal(false)}>
               Cancel
             </Button>
           </div>
         </div>
       </Modal>
    </div>
  );
};
