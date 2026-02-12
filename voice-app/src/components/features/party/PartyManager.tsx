import { useState, useEffect } from 'react';
import { Panel, Button, Input, Switch, Modal, Badge } from '../../ui/Primitives';
import { cn } from '../../../lib/utils';
import { Users, Plus, Lock, Globe, LogOut, Pin } from 'lucide-react';
import { useGroupStore } from '../../../stores/groupStore';
import { useConnectionStore } from '../../../stores/connectionStore';
 
interface PartyManagerProps {
  createGroup: (name: string, options?: { maxMembers?: number; isIsolated?: boolean; password?: string; isPermanent?: boolean }) => void;
  joinGroup: (groupId: string, password?: string) => void;
  leaveGroup: () => void;
}

export const PartyManager = ({ createGroup, joinGroup, leaveGroup }: PartyManagerProps) => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(10);
  const [password, setPassword] = useState('');
  const [isIsolated, setIsIsolated] = useState(true);
  const [isPermanent, setIsPermanent] = useState(false);

  // Password join modal state
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [joinPassword, setJoinPassword] = useState('');
  const [pendingJoinGroupId, setPendingJoinGroupId] = useState<string | null>(null);
  const [hasSubmittedPassword, setHasSubmittedPassword] = useState(false);

  // Use individual selectors for proper reactivity
  const groups = useGroupStore((s) => s.groups);
  const currentGroupId = useGroupStore((s) => s.currentGroupId);
  const currentGroup = groups.find((g) => g.id === currentGroupId) ?? null;
  const isAdmin = useConnectionStore((s) => s.isAdmin);
  const warnings = useConnectionStore((s) => s.warnings);

  const isPasswordModalOpen =
    showPasswordModal &&
    pendingJoinGroupId !== null &&
    currentGroupId !== pendingJoinGroupId;
  const latestWarning = warnings[0];
  const passwordError =
    isPasswordModalOpen &&
    hasSubmittedPassword &&
    latestWarning?.message === 'Incorrect password'
      ? 'Incorrect password'
      : '';

  const closePasswordModal = () => {
    setShowPasswordModal(false);
    setPendingJoinGroupId(null);
    setJoinPassword('');
    setHasSubmittedPassword(false);
  };

  // Auto-close and reset password modal state when successfully joined the pending group
  useEffect(() => {
    if (pendingJoinGroupId && currentGroupId === pendingJoinGroupId) {
      /* eslint-disable react-hooks/set-state-in-effect -- Legitimate cleanup: resetting modal state after successful join */
      setShowPasswordModal(false);
      setPendingJoinGroupId(null);
      setJoinPassword('');
      setHasSubmittedPassword(false);
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [currentGroupId, pendingJoinGroupId]);

  const filteredGroups = groups.filter(g => 
     g.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCreateGroup = () => {
    if (!newGroupName.trim()) return;
    createGroup(newGroupName, {
      maxMembers: maxPlayers,
      isIsolated,
      password: isPrivate && password ? password : undefined,
      isPermanent: isAdmin && isPermanent ? true : undefined,
    });
    setShowCreateModal(false);
    setNewGroupName('');
    setPassword('');
    setIsPrivate(false);
    setIsIsolated(true);
    setIsPermanent(false);
  };

  const handleJoinGroup = (groupId: string) => {
    if (currentGroup?.id === groupId) return;
    const group = groups.find((g) => g.id === groupId);
    if (group?.hasPassword) {
      // Show password prompt
      setPendingJoinGroupId(groupId);
      setJoinPassword('');
      setHasSubmittedPassword(false);
      setShowPasswordModal(true);
    } else {
      joinGroup(groupId);
    }
  };

  const handlePasswordJoin = () => {
    if (pendingJoinGroupId) {
      setHasSubmittedPassword(true);
      joinGroup(pendingJoinGroupId, joinPassword);
    }
  };

  const handleLeaveGroup = () => {
    if (currentGroup) {
      leaveGroup();
    }
  };

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex items-center justify-between pb-2 border-b border-[var(--border-primary)]">
         <h2 className="text-sm font-bold uppercase text-[var(--text-primary)] flex items-center gap-2 font-[family-name:var(--font-heading)]">
            <Globe className="w-4 h-4 text-[var(--accent-primary)]" /> 
            Party Control
         </h2>
         <Badge variant="neutral">{filteredGroups.length} AVAIL</Badge>
      </div>

      <div className="flex gap-2">
         <Input 
           placeholder="SEARCH PARTIES..." 
           value={searchTerm}
           onChange={(e) => setSearchTerm(e.target.value)}
           className="flex-1"
         />
         <Button onClick={() => setShowCreateModal(true)} className="px-3">
            <Plus className="w-4 h-4" />
         </Button>
      </div>

      {/* Current Group Quick Action */}
      {currentGroup && (
        <div className="bg-[var(--accent-success)]/10 border border-[var(--accent-success)]/30 rounded-[var(--radius-btn)] p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[var(--accent-success)]" />
            <span className="text-sm font-bold text-[var(--text-primary)]">{currentGroup.name}</span>
          </div>
          <Button size="sm" variant="ghost" onClick={handleLeaveGroup} className="text-[var(--accent-danger)] hover:bg-[var(--accent-danger)]/10">
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-3 pr-1 custom-scrollbar">
         {filteredGroups.length === 0 ? (
           <div className="flex flex-col items-center justify-center py-8 text-center text-[var(--text-secondary)]">
             <Users className="w-8 h-8 mb-2 opacity-30" />
             <p className="text-xs font-bold uppercase">No Parties Found</p>
             <p className="text-[10px] mt-1 opacity-70">Create one to get started</p>
           </div>
         ) : filteredGroups.map(group => (
            <Panel 
               key={group.id} 
               className={cn(
                  "p-3 transition-all duration-300 group/item cursor-pointer hover:-translate-y-1 hover:shadow-xl",
                  
                  // Industrial Style
                  "group-[[data-theme='industrial']_&]:border-l-4",
                  group.id === currentGroup?.id 
                     ? "group-[[data-theme='industrial']_&]:border-l-[var(--accent-success)] group-[[data-theme='industrial']_&]:shadow-[var(--shadow-glow)]" 
                     : "group-[[data-theme='industrial']_&]:border-l-[var(--border-primary)] hover:group-[[data-theme='industrial']_&]:border-l-[var(--accent-primary)]",

                  // Hytale Style
                  "group-[[data-theme='hytale']_&]:border-l-1",
                  group.id === currentGroup?.id 
                     ? "group-[[data-theme='hytale']_&]:border-[var(--border-active)] group-[[data-theme='hytale']_&]:shadow-[0_0_20px_rgba(251,191,36,0.25)]" 
                     : "group-[[data-theme='hytale']_&]:border-[var(--border-primary)] hover:group-[[data-theme='hytale']_&]:border-[var(--accent-primary)]"
               )}
               onClick={() => handleJoinGroup(group.id)}
            >
               <div className="flex justify-between items-start gap-2 mb-2">
                  <div className="min-w-0 flex-1">
                     <div className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2 group-hover/item:text-[var(--accent-primary)] transition-colors">
                        <span className="truncate">{group.name}</span>
                        {group.hasPassword && <Lock className="w-3 h-3 text-[var(--accent-warning)]" />}
                        {group.isPermanent && <Pin className="w-3 h-3 text-[var(--accent-primary)]" />}
                     </div>
                     <div className="text-[10px] text-[var(--text-secondary)] uppercase flex items-center gap-2 font-mono mt-0.5">
                        <span className="bg-[var(--bg-input)] px-1 rounded">LOCAL</span>
                        <span className="opacity-50">|</span>
                        <span>#{group.id.slice(0, 4).toUpperCase()}</span>
                        <span className="opacity-50">|</span>
                        <span className={group.settings.isIsolated ? 'text-[var(--accent-warning)]' : 'text-[var(--accent-success)]'}>
                          {group.settings.isIsolated ? 'ISOLATED' : 'HYBRID'}
                        </span>
                     </div>
                  </div>
                  <Badge variant={group.id === currentGroup?.id ? 'success' : 'neutral'}>
                     {group.id === currentGroup?.id ? 'ACTIVE' : 'READY'}
                  </Badge>
               </div>
               
               <div className="flex justify-between items-center mt-3 pt-2 border-t border-[var(--border-primary)] border-dashed">
                  <div className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5 font-bold">
                     <Users className="w-3.5 h-3.5" />
                     {group.members.length} <span className="opacity-50">/</span> {group.settings.maxMembers}
                  </div>
                  {group.id !== currentGroup?.id && (
                     <div className="text-[10px] font-bold text-[var(--accent-primary)] uppercase tracking-widest opacity-0 group-hover/item:opacity-100 transition-opacity">
                        Click to Join
                     </div>
                  )}
               </div>
            </Panel>
         ))}
      </div>

      <Modal 
        isOpen={showCreateModal} 
        onClose={() => setShowCreateModal(false)}
        title="Initialize New Party"
      >
         <div className="space-y-5 p-1">
            <div className="grid grid-cols-3 gap-4">
               <div className="col-span-2">
                  <Input 
                    label="Party Name" 
                    placeholder="E.g. The Explorers"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                  />
               </div>
               <Input 
                  label="Max Players" 
                  type="number" 
                  value={maxPlayers}
                  onChange={(e) => setMaxPlayers(Number(e.target.value))}
                  min={1} 
                  max={100} 
               />
            </div>
            
            <div className="bg-[var(--bg-input)] p-4 rounded-[var(--radius-panel)] border border-[var(--border-primary)] space-y-4">
               <Switch 
                  label="Password Protected" 
                  checked={isPrivate} 
                  onChange={setIsPrivate} 
               />

               <Switch
                  label={`Audio Mode: ${isIsolated ? 'Isolated' : 'Hybrid'}`}
                  checked={isIsolated}
                  onChange={setIsIsolated}
               />
               <p className="text-[10px] text-[var(--text-secondary)] -mt-2">
                  {isIsolated
                    ? 'Isolated: group members only hear each other.'
                    : 'Hybrid: group voice plus nearby non-group players.'}
               </p>
               
               {isPrivate && (
                  <div className="animate-in slide-in-from-top-2 duration-200">
                     <Input 
                        label="Entry Password" 
                        type="password" 
                        placeholder="••••••••" 
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoFocus
                     />
                  </div>
               )}

               {isAdmin && (
                  <Switch
                     label="Permanent Group"
                     checked={isPermanent}
                     onChange={setIsPermanent}
                  />
               )}
               {isAdmin && isPermanent && (
                  <p className="text-[10px] text-[var(--text-secondary)] -mt-2">
                     Permanent groups persist even when all members leave.
                  </p>
               )}
            </div>

            <div className="pt-4 flex gap-3">
               <Button 
                 fullWidth 
                 onClick={handleCreateGroup} 
                 variant="primary"
                 disabled={!newGroupName.trim()}
               >
                 Create Party
               </Button>
               <Button variant="ghost" onClick={() => setShowCreateModal(false)}>Cancel</Button>
            </div>
         </div>
      </Modal>

      {/* Password Join Modal */}
      <Modal
        isOpen={isPasswordModalOpen}
        onClose={closePasswordModal}
        title="Enter Password"
      >
        <div className="space-y-4 p-1">
          <p className="text-xs text-[var(--text-secondary)]">
            This party is password protected. Enter the password to join.
          </p>
          {passwordError && (
            <p className="text-xs text-red-400 font-medium">{passwordError}</p>
          )}
          <Input
            label="Password"
            type="password"
            placeholder="••••••••"
            value={joinPassword}
            onChange={(e) => setJoinPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handlePasswordJoin();
            }}
            autoFocus
          />
          <div className="pt-2 flex gap-3">
            <Button
              fullWidth
              onClick={handlePasswordJoin}
              variant="primary"
              disabled={!joinPassword}
            >
              Join Party
            </Button>
            <Button
              variant="ghost"
              onClick={closePasswordModal}
            >
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
