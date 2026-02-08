import React, { useState } from 'react';
import { TopBar } from './TopBar';
import { NavigationRail, type SidebarView } from './NavigationRail';
import { Sidebar } from './Sidebar';
import { MobileNav, type MobileTab } from './MobileNav';
import { cn } from '../../lib/utils';

interface AppShellProps {
  serverName: string;
  userName: string;
  onLogout: () => void;
  activeSidebarView: SidebarView;
  onSidebarViewChange: (view: SidebarView) => void;
  sidebarContent: React.ReactNode;
  rightPanelContent?: React.ReactNode;
  activeMobileTab: MobileTab;
  onMobileTabChange: (tab: MobileTab) => void;
  mobileViewContent: React.ReactNode;
  children: React.ReactNode; // Center content
}

export const AppShell = ({
  serverName,
  userName,
  onLogout,
  activeSidebarView,
  onSidebarViewChange,
  sidebarContent,
  rightPanelContent,
  activeMobileTab,
  onMobileTabChange,
  mobileViewContent,
  children
}: AppShellProps) => {
  const [rightPanelOpen, setRightPanelOpen] = useState(true);

  return (
    <div className="h-[100dvh] bg-[var(--bg-app)] text-[var(--text-primary)] font-[family-name:var(--font-body)] flex flex-col overflow-hidden transition-colors duration-300">
      
      <TopBar 
        serverName={serverName} 
        userName={userName} 
        onLogout={onLogout}
        onToggleRightPanel={() => setRightPanelOpen(!rightPanelOpen)}
      />

      <div className="flex-1 flex overflow-hidden relative">
        
        {/* Desktop Left Nav */}
        <NavigationRail 
          activeView={activeSidebarView} 
          onViewChange={onSidebarViewChange} 
        />

        {/* Desktop Left Sidebar Content */}
        <Sidebar>
          {sidebarContent}
        </Sidebar>

        {/* Center Content (Grid) */}
        <main className={cn(
          "flex-1 bg-[var(--bg-app)] flex flex-col min-w-0 relative transition-all duration-300",
          activeMobileTab === 'channel' ? "flex" : "hidden md:flex" // Mobile toggle logic
        )}>
           {children}
        </main>

        {/* Desktop Right Panel (Telemetry) */}
        <div className={cn(
           "hidden lg:flex w-80 bg-[var(--bg-panel)] border-l border-[var(--border-primary)] flex-col z-10 shrink-0 transition-all duration-300 shadow-xl overflow-hidden",
           !rightPanelOpen && "w-0 opacity-0 border-none"
        )}>
           <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
              {rightPanelContent}
           </div>
        </div>

        {/* Mobile View Layer (Overlays center content) */}
        <div className={cn(
           "absolute inset-0 bg-[var(--bg-app)] z-20 md:hidden flex flex-col",
           activeMobileTab !== 'channel' ? "flex" : "hidden"
        )}>
           {mobileViewContent}
        </div>

      </div>

      <MobileNav 
        activeTab={activeMobileTab} 
        onTabChange={onMobileTabChange} 
      />
    </div>
  );
};
