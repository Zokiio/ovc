import { BottomNavItem } from '../ui/Primitives';
import { Activity, Globe, Search, Settings } from 'lucide-react';

export type MobileTab = 'channel' | 'groups' | 'players' | 'radar';

export const MobileNav = ({ 
  activeTab, 
  onTabChange 
}: { 
  activeTab: MobileTab, 
  onTabChange: (tab: MobileTab) => void 
}) => {
  return (
    <div className="h-16 flex items-center md:hidden bg-[var(--bg-panel)] border-t border-[var(--border-primary)] shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-50">
       <BottomNavItem 
         icon={Activity} 
         label="Channel" 
         active={activeTab === 'channel'} 
         onClick={() => onTabChange('channel')} 
       />
       <BottomNavItem 
         icon={Globe} 
         label="Parties" 
         active={activeTab === 'groups'} 
         onClick={() => onTabChange('groups')} 
       />
       <BottomNavItem 
         icon={Search} 
         label="Roster" 
         active={activeTab === 'players'} 
         onClick={() => onTabChange('players')} 
       />
       <BottomNavItem 
         icon={Settings} 
         label="System" 
         active={activeTab === 'radar'} 
         onClick={() => onTabChange('radar')} 
       />
    </div>
  );
};
