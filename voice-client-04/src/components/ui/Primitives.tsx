import React from 'react';
import { cn } from '../../lib/utils';

// --- Layout Primitives ---

export const Panel = ({ className, title, children, rightElement, ...props }: React.HTMLAttributes<HTMLDivElement> & { title?: string, rightElement?: React.ReactNode }) => {
  return (
    <div 
      className={cn(
        "bg-[var(--bg-panel)] border border-[var(--border-primary)] shadow-lg flex flex-col rounded-[var(--radius-panel)] transition-all duration-300 relative group overflow-hidden", 
        "hover:shadow-[var(--shadow-glow)]", // Subtle glow on hover
        className
      )} 
      {...props}
    >
      {/* Decorative Corners (Default/Hytale Style, Hidden in Industrial) */}
      <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-[var(--border-active)] group-[[data-theme='industrial']_&]:opacity-0 rounded-tl-sm pointer-events-none transition-opacity duration-500" />
      <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-[var(--border-active)] group-[[data-theme='industrial']_&]:opacity-0 rounded-tr-sm pointer-events-none transition-opacity duration-500" />
      <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-[var(--border-active)] group-[[data-theme='industrial']_&]:opacity-0 rounded-bl-sm pointer-events-none transition-opacity duration-500" />
      <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-[var(--border-active)] group-[[data-theme='industrial']_&]:opacity-0 rounded-br-sm pointer-events-none transition-opacity duration-500" />

      {title && (
        <div className="bg-[var(--bg-panel-header)] px-4 py-3 border-b border-[var(--border-primary)] flex justify-between items-center shrink-0">
          <h3 className="text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)] font-[family-name:var(--font-heading)] group-[:not([data-theme='industrial'])_&]:text-[var(--text-accent)]">
            {title}
          </h3>
          {rightElement}
        </div>
      )}
      <div className="p-4 flex-1 overflow-auto custom-scrollbar">
        {children}
      </div>
    </div>
  );
};

// --- Form Primitives ---

export const Button = ({
  className,
  variant = 'primary',
  size = 'md',
  fullWidth,
  isActive,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { 
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost',
  size?: 'sm' | 'md' | 'lg',
  fullWidth?: boolean,
  isActive?: boolean
}) => {
  const baseClass = "font-[family-name:var(--font-heading)] font-bold uppercase tracking-wide transition-all active:scale-[0.98] rounded-[var(--radius-btn)] border flex items-center justify-center gap-2 relative overflow-hidden";
  
  const variants = {
    primary: 'bg-[var(--accent-primary)] hover:brightness-110 text-white border-[var(--accent-primary)] shadow-[var(--shadow-glow)]',
    secondary: 'bg-[var(--bg-input)] hover:bg-[var(--bg-panel-header)] text-[var(--text-primary)] border-[var(--border-primary)] hover:border-[var(--text-secondary)]',
    danger: 'bg-[var(--accent-danger)] hover:brightness-110 text-white border-[var(--accent-danger)]',
    ghost: 'bg-transparent hover:bg-[var(--bg-panel-header)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border-transparent',
  };
  
  const activeStyle = isActive ? 'ring-2 ring-[var(--text-primary)] ring-offset-2 ring-offset-[var(--bg-app)]' : '';

  const sizes = {
    sm: 'px-3 py-1 text-[10px]',
    md: 'px-5 py-2 text-xs',
    lg: 'px-6 py-3 text-sm',
  };

  return (
    <button
      className={cn(
        baseClass,
        variants[variant],
        sizes[size],
        fullWidth && 'w-full',
        activeStyle,
        className
      )}
      {...props}
    />
  );
};

export const Input = ({ className, label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label?: string }) => {
  return (
    <div className="space-y-1.5 w-full">
      {label && (
        <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase font-[family-name:var(--font-heading)] ml-1">
          {label}
        </label>
      )}
      <input
        className={cn(
          'bg-[var(--bg-input)] text-[var(--text-primary)] font-[family-name:var(--font-body)] text-sm',
          'px-3 py-2.5 w-full border border-[var(--border-primary)] rounded-[var(--radius-btn)]',
          'focus:outline-none focus:border-[var(--border-active)] focus:ring-1 focus:ring-[var(--border-active)] transition-all shadow-inner',
          'placeholder:text-[var(--text-secondary)]/50',
          className
        )}
        {...props}
      />
    </div>
  );
};

export const Slider = ({ className, label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label?: string }) => {
  return (
    <div className="space-y-1 w-full group">
      {label && (
        <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase font-[family-name:var(--font-heading)] group-hover:text-[var(--text-primary)] transition-colors">
          {label}
        </label>
      )}
      <input
        type="range"
        className={cn(
          "w-full h-1.5 bg-[var(--bg-input)] appearance-none cursor-pointer rounded-[var(--radius-btn)] accent-[var(--accent-primary)] ring-1 ring-[var(--border-primary)]",
          className
        )}
        {...props}
      />
    </div>
  );
};

export const Switch = ({ checked, onChange, label }: { checked: boolean, onChange: (checked: boolean) => void, label: string }) => {
   return (
      <div className="flex items-center justify-between py-1 group cursor-pointer" onClick={() => onChange(!checked)}>
         <span className="text-xs font-bold text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] font-[family-name:var(--font-heading)] uppercase transition-colors">{label}</span>
         <div className={cn(
             "w-9 h-5 rounded-full relative transition-colors duration-200 border",
             checked ? "bg-[var(--accent-primary)] border-[var(--accent-primary)]" : "bg-[var(--bg-input)] border-[var(--border-primary)]"
           )}>
            <div className={cn(
               "absolute top-0.5 w-3.5 h-3.5 bg-white rounded-full transition-all duration-200 shadow-sm",
               checked ? "left-[calc(100%-1.125rem)]" : "left-0.5"
            )} />
         </div>
      </div>
   );
};

export const Select = ({ className, label, options, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string, options: {value: string, label: string}[] }) => {
  return (
    <div className="space-y-1 w-full">
      {label && (
        <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase font-[family-name:var(--font-heading)]">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          className={cn(
            'bg-[var(--bg-input)] text-[var(--text-primary)] font-[family-name:var(--font-body)] text-sm',
            'pl-3 pr-8 py-2 w-full border border-[var(--border-primary)] rounded-[var(--radius-btn)] appearance-none',
            'focus:outline-none focus:border-[var(--border-active)] transition-colors cursor-pointer',
            className
          )}
          {...props}
        >
           {options.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
           ))}
        </select>
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-secondary)] text-xs">▼</div>
      </div>
    </div>
  );
};

// --- Data Display Primitives ---

export const Badge = ({ children, variant = 'neutral', className }: { children: React.ReactNode, variant?: 'success' | 'warning' | 'danger' | 'neutral', className?: string }) => {
  const variants = {
    success: 'bg-[var(--accent-success)]/10 text-[var(--accent-success)] border-[var(--accent-success)]/30',
    warning: 'bg-[var(--accent-warning)]/10 text-[var(--accent-warning)] border-[var(--accent-warning)]/30',
    danger: 'bg-[var(--accent-danger)]/10 text-[var(--accent-danger)] border-[var(--accent-danger)]/30',
    neutral: 'bg-[var(--bg-input)] text-[var(--text-secondary)] border-[var(--border-primary)]',
  };

  return (
    <span className={cn("inline-flex items-center justify-center min-w-[64px] px-2 py-0.5 text-[10px] font-bold uppercase border font-[family-name:var(--font-heading)] rounded-[var(--radius-btn)] tracking-wider shadow-sm", variants[variant], className)}>
      {children}
    </span>
  );
};

export const Meter = ({ value, className, threshold }: { value: number, className?: string, threshold?: number }) => {
  const bars = 24; // More bars for smoother look
  const activeBars = Math.floor((value / 100) * bars);
  
  return (
    <div className={cn("relative flex gap-[1px] h-3 bg-[var(--bg-input)] p-[2px] border border-[var(--border-primary)] rounded-[var(--radius-btn)] overflow-hidden", className)}>
      {Array.from({ length: bars }).map((_, i) => (
        <div 
          key={i}
          className={cn(
            "flex-1 transition-all duration-75 first:rounded-l-sm last:rounded-r-sm",
            i < activeBars 
              ? (i > bars * 0.8 ? "bg-[var(--accent-danger)]" : i > bars * 0.6 ? "bg-[var(--accent-warning)]" : "bg-[var(--accent-success)]")
              : "bg-[var(--bg-panel)] opacity-30"
          )}
        />
      ))}
      {threshold !== undefined && (
         <div 
           className="absolute top-0 bottom-0 w-[2px] bg-white mix-blend-difference z-10" 
           style={{ left: `${threshold}%` }} 
         />
      )}
    </div>
  );
};

// --- Navigation Primitives ---

export const NavRailItem = ({ icon: Icon, active, onClick, badge, label }: { icon: any, active: boolean, onClick: () => void, badge?: number, label?: string }) => {
   return (
      <button
        onClick={onClick}
        className={cn(
           "w-10 h-10 flex items-center justify-center rounded-[var(--radius-btn)] transition-all relative group",
           active 
             ? "bg-[var(--bg-app)] text-[var(--accent-primary)] shadow-inner" 
             : "text-[var(--text-secondary)] hover:bg-[var(--bg-app)] hover:text-[var(--text-primary)]"
        )}
        title={label}
      >
         <Icon className={cn("w-5 h-5 transition-transform group-hover:scale-110", active && "scale-110")} />
         
         {/* Active Indicator Bar */}
         {active && (
            <div className="absolute left-0 top-2 bottom-2 w-1 bg-[var(--accent-primary)] rounded-r-full" />
         )}

         {/* Notification Badge */}
         {badge !== undefined && (
            <div className="absolute top-1 right-1 w-2.5 h-2.5 bg-[var(--accent-danger)] rounded-full animate-pulse border border-[var(--bg-panel)]" />
         )}
      </button>
   );
};

export const BottomNavItem = ({ icon: Icon, label, active, onClick }: { icon: any, label: string, active: boolean, onClick: () => void }) => {
   return (
      <button 
        onClick={onClick}
        className={cn(
           "flex flex-col items-center justify-center p-2 flex-1 transition-colors relative overflow-hidden",
           active ? "text-[var(--accent-primary)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        )}
      >
         <div className={cn("absolute inset-0 bg-[var(--accent-primary)] opacity-0 transition-opacity", active && "opacity-10")} />
         <Icon className={cn("w-5 h-5 mb-1 transition-transform", active && "scale-110")} />
         <span className="text-[9px] font-bold uppercase tracking-wide">{label}</span>
      </button>
   );
};

export const Modal = ({ isOpen, onClose, title, children }: { isOpen: boolean, onClose: () => void, title: string, children: React.ReactNode }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose} />
      <Panel className="w-full max-w-md relative animate-in zoom-in-95 duration-200 z-10 border-[var(--border-active)]" title={title}>
        <button 
          onClick={onClose} 
          className="absolute top-3 right-3 p-1 text-[var(--text-secondary)] hover:text-[var(--accent-danger)] transition-colors"
        >
           ✕
        </button>
        <div className="pt-2">
           {children}
        </div>
      </Panel>
    </div>
  );
};
