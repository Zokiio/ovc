import { useState } from 'react';
import { Input, Badge } from '../../ui/Primitives';
import { Search, Users } from 'lucide-react';
import { useUserStore } from '../../../stores/userStore';
import { useGroupStore } from '../../../stores/groupStore';
import { UserCardCompact } from '../../ui/UserCard';

export const GlobalRoster = () => {
  const [filter, setFilter] = useState('');
  
  const usersMap = useUserStore((s) => s.users);
  const groups = useGroupStore((s) => s.groups);

  // Convert Map to array and filter
  const allUsers = Array.from(usersMap.values());
  const filteredPlayers = allUsers.filter(p => 
    p.name.toLowerCase().includes(filter.toLowerCase())
  );

  // Helper to find user's group
  const findUserGroup = (userId: string) => {
    return groups.find(g => g.members.some(m => m.id === userId));
  };

  return (
    <div className="h-full flex flex-col gap-4">
       <div className="flex items-center justify-between pb-2 border-b border-[var(--border-primary)]">
         <h2 className="text-sm font-bold uppercase text-[var(--text-primary)] flex items-center gap-2 font-[family-name:var(--font-heading)]">
            <Search className="w-4 h-4 text-[var(--accent-primary)]" /> 
            Global Roster
         </h2>
         <Badge variant="neutral">{allUsers.length} ONLINE</Badge>
      </div>

       <div className="relative">
          <Input 
             placeholder="LOCATE PLAYER..." 
             value={filter}
             onChange={(e) => setFilter(e.target.value)}
             className="pl-9"
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
       </div>

       <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
          <div className="flex justify-between px-2 pb-2 border-b border-[var(--border-primary)] mb-2 sticky top-0 bg-[var(--bg-panel)] z-10">
             <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Player</span>
             <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Party</span>
          </div>
          
          {filteredPlayers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center text-[var(--text-secondary)]">
              <Users className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-xs font-bold uppercase">No Players Found</p>
              <p className="text-[10px] mt-1 opacity-70">
                {allUsers.length === 0 ? 'Connect to a server to see players' : 'Try a different search'}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {filteredPlayers.map(player => {
                const group = findUserGroup(player.id);
                
                return (
                  <div key={player.id} className="flex items-center gap-2">
                    <div className="flex-1">
                      <UserCardCompact user={player} showControls={true} />
                    </div>
                    {group && (
                      <Badge variant="neutral" className="shrink-0 text-[9px]">{group.name}</Badge>
                    )}
                  </div>
                );
              })}
            </div>
          )}
       </div>
    </div>
  );
};
