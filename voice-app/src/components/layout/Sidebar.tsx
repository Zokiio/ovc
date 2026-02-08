import React from 'react';
import { cn } from '../../lib/utils';

export const Sidebar = ({ children, isOpen = true }: { children: React.ReactNode, isOpen?: boolean }) => {
  return (
    <div className={cn(
       "hidden md:flex w-80 bg-[var(--bg-panel)] border-r border-[var(--border-primary)] flex-col z-10 shrink-0 transition-all duration-300 shadow-xl relative",
       !isOpen && "w-0 overflow-hidden opacity-0"
    )}>
       {/* Background Texture for Hytale Theme (local CSS pattern, no external requests) */}
       <div className="absolute inset-0 opacity-0 group-[[data-theme='hytale']_&]:opacity-10 pointer-events-none [background-image:repeating-linear-gradient(45deg,rgba(255,255,255,0.06)_0,rgba(255,255,255,0.06)_1px,transparent_1px,transparent_8px)]" />
       
       <div className="flex-1 overflow-hidden p-4 relative z-10">
          {children}
       </div>
    </div>
  );
};
