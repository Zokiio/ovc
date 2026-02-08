import React from 'react';
import { cn } from '../../lib/utils';

export const Sidebar = ({ children, isOpen = true }: { children: React.ReactNode, isOpen?: boolean }) => {
  return (
    <div className={cn(
       "hidden md:flex w-80 bg-[var(--bg-panel)] border-r border-[var(--border-primary)] flex-col z-10 shrink-0 transition-all duration-300 shadow-xl relative",
       !isOpen && "w-0 overflow-hidden opacity-0"
    )}>
       {/* Background Texture for Hytale Theme */}
       <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/dark-leather.png')] opacity-0 group-[[data-theme='hytale']_&]:opacity-10 pointer-events-none" />
       
       <div className="flex-1 overflow-hidden p-4 relative z-10">
          {children}
       </div>
    </div>
  );
};
