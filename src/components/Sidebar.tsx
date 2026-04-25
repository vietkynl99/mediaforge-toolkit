import React from 'react';

interface SidebarItemProps {
  icon: any;
  label: string;
  active?: boolean;
  onClick: () => void;
  collapsed?: boolean;
}

export const SidebarItem: React.FC<SidebarItemProps> = ({
  icon: Icon,
  label,
  active,
  onClick,
  collapsed
}) => (
  <button
    onClick={onClick}
    className={`group relative flex items-center gap-3 w-full p-3 rounded-xl transition-all duration-200 ${
      active
        ? 'bg-lime-500/10 text-lime-400'
        : 'text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-200'
    }`}
  >
    <div className={`flex items-center justify-center transition-transform duration-200 ${active ? 'scale-110' : 'group-hover:scale-110'}`}>
      <Icon size={20} strokeWidth={active ? 2.5 : 2} />
    </div>
    {!collapsed && <span className="text-sm font-medium tracking-wide">{label}</span>}
    {active && !collapsed && (
      <div className="absolute right-2 w-1.5 h-1.5 rounded-full bg-lime-500 shadow-[0_0_8px_rgba(132,204,22,0.6)]" />
    )}
    {collapsed && (
      <div className="absolute left-full ml-4 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs font-medium text-zinc-200 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
        {label}
      </div>
    )}
  </button>
);

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onLogout: () => void;
  tabs: Array<{ id: string; label: string; icon: any }>;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  collapsed,
  onToggleCollapse,
  onLogout,
  tabs
}) => {
  return (
    <div className={`flex flex-col border-r border-zinc-800/50 bg-zinc-950/50 backdrop-blur-xl transition-all duration-300 ease-in-out ${collapsed ? 'w-20' : 'w-64'}`}>
      {/* Sidebar Header */}
      <div className="p-4 flex items-center justify-between">
        {!collapsed && (
          <div className="flex items-center gap-2 pl-2">
            <div className="w-8 h-8 bg-lime-500 rounded-lg flex items-center justify-center text-zinc-950 font-black italic text-sm">MF</div>
            <span className="font-bold text-zinc-100 tracking-tight">MediaForge</span>
          </div>
        )}
        <button
          onClick={onToggleCollapse}
          className="p-2 rounded-lg hover:bg-zinc-800/50 text-zinc-500 hover:text-zinc-200 transition-colors mx-auto"
        >
          <div className={`transition-transform duration-300 ${collapsed ? '' : 'rotate-180'}`}>
            {/* Replace with actual Chevron icon if needed */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
          </div>
        </button>
      </div>

      {/* Navigation Items */}
      <div className="flex-1 px-3 py-4 space-y-2 overflow-y-auto custom-scrollbar">
        {tabs.map((tab) => (
          <SidebarItem
            key={tab.id}
            icon={tab.icon}
            label={tab.label}
            active={activeTab === tab.id}
            onClick={() => onTabChange(tab.id)}
            collapsed={collapsed}
          />
        ))}
      </div>

      {/* Sidebar Footer */}
      <div className="p-3 border-t border-zinc-800/50">
        <button
          onClick={onLogout}
          className={`flex items-center gap-3 w-full p-3 rounded-xl text-red-400/70 hover:bg-red-500/10 hover:text-red-400 transition-all duration-200 group relative`}
        >
          <div className="flex items-center justify-center group-hover:scale-110 transition-transform">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </div>
          {!collapsed && <span className="text-sm font-medium tracking-wide">Logout</span>}
          {collapsed && (
            <div className="absolute left-full ml-4 px-3 py-2 bg-red-950/90 border border-red-500/20 rounded-lg text-xs font-medium text-red-200 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
              Logout
            </div>
          )}
        </button>
      </div>
    </div>
  );
};
