import { NavRailItem } from '../ui/Primitives';
import { Globe, Search, Settings, Activity } from 'lucide-react';

export type SidebarView = 'groups' | 'players' | 'settings';

export const NavigationRail = ({ 
  activeView, 
  onViewChange 
}: { 
  activeView: SidebarView, 
  onViewChange: (view: SidebarView) => void 
}) => {
  return (
    <div className="w-16 bg-[var(--bg-panel)] border-r border-[var(--border-primary)] flex-col items-center py-4 gap-3 hidden md:flex z-20 shrink-0 shadow-lg">
       <NavRailItem 
         icon={Globe} 
         active={activeView === 'groups'} 
         onClick={() => onViewChange('groups')} 
         label="Frequencies"
       />
       <NavRailItem 
         icon={Search} 
         active={activeView === 'players'} 
         onClick={() => onViewChange('players')} 
         label="Roster"
       />
       <NavRailItem 
         icon={Settings} 
         active={activeView === 'settings'} 
         onClick={() => onViewChange('settings')} 
         label="Configuration"
       />
       
       <div className="mt-auto flex flex-col gap-3 w-full px-2">
          <div className="h-[1px] w-full bg-[var(--border-primary)]" />
          <div className="flex justify-center">
            <NavRailItem 
              icon={Activity} 
              active={false} 
              onClick={() => {}} 
              badge={3}
              label="Notifications"
            />
          </div>
       </div>
    </div>
  );
};
