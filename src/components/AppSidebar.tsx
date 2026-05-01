import React from 'react';
import {
  LayoutDashboard,
  Hammer,
  Database,
  Settings,
  Terminal,
  Activity,
  Cpu,
  HardDrive,
  X,
  LogOut
} from 'lucide-react';

interface AppSidebarProps {
  collapsed: boolean;
  setCollapsed: (next: boolean) => void;
  activeTab: string;
  onNavigateTab: (tab: 'dashboard' | 'forge' | 'vault' | 'settings' | 'logs') => void;
  onLogout: () => void;
  isMobile?: boolean;
  onClose?: () => void;
}

const SidebarItem = ({
  icon: Icon,
  label,
  active,
  onClick,
  collapsed
}: {
  icon: any;
  label: string;
  active?: boolean;
  onClick: () => void;
  collapsed?: boolean;
}) => (
  <button
    onClick={onClick}
    className={`flex items-center w-full ${collapsed ? 'justify-center px-2' : 'gap-3 px-4'} py-3 transition-colors rounded-lg group ${
      active ? 'bg-lime-500/10 text-lime-400' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
    }`}
  >
    <Icon size={20} className={active ? 'text-lime-400' : 'group-hover:text-zinc-100'} />
    {!collapsed && <span className="text-sm font-medium">{label}</span>}
  </button>
);

export const AppSidebar: React.FC<AppSidebarProps> = ({
  collapsed,
  setCollapsed,
  activeTab,
  onNavigateTab,
  onLogout,
  isMobile = false,
  onClose
}) => {
  return (
    <aside className={`${collapsed && !isMobile ? 'w-20' : 'w-64'} border-r border-zinc-800 flex flex-col p-4 gap-6 transition-all duration-300 h-full bg-zinc-950`}>
      <div className={`flex items-center ${collapsed && !isMobile ? 'justify-center' : 'gap-3 px-2'} mb-2 w-full`}>
        <button
          type="button"
          onClick={() => !isMobile && setCollapsed(!collapsed)}
          aria-expanded={!collapsed}
          title={collapsed && !isMobile ? 'Expand sidebar' : 'Collapse sidebar'}
          className="flex items-center gap-3 text-left rounded-lg py-2 hover:bg-zinc-900/60 transition-colors flex-1"
        >
          <div className="w-8 h-8 bg-lime-500 rounded-lg flex items-center justify-center text-zinc-950 font-black italic">MF</div>
          {(!collapsed || isMobile) && <h1 className="text-lg font-bold text-zinc-100 tracking-tight">MediaForge</h1>}
        </button>
        {isMobile && onClose && (
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        )}
      </div>

      <nav className="flex flex-col gap-1 flex-1">
        <SidebarItem
          icon={LayoutDashboard}
          label="Dashboard"
          active={activeTab === 'dashboard'}
          onClick={() => onNavigateTab('dashboard')}
          collapsed={collapsed}
        />
        <SidebarItem
          icon={Database}
          label="Media Vault"
          active={activeTab === 'vault'}
          onClick={() => onNavigateTab('vault')}
          collapsed={collapsed}
        />
        <SidebarItem
          icon={Hammer}
          label="Pipeline Forge"
          active={activeTab === 'forge'}
          onClick={() => onNavigateTab('forge')}
          collapsed={collapsed}
        />
        <SidebarItem
          icon={Terminal}
          label="System Logs"
          active={activeTab === 'logs'}
          onClick={() => onNavigateTab('logs')}
          collapsed={collapsed}
        />
        
        <div className="mt-auto flex flex-col gap-1">
          <div className="my-2 border-t border-zinc-800/50" />
          <SidebarItem
            icon={Settings}
            label="Settings"
            active={activeTab === 'settings'}
            onClick={() => onNavigateTab('settings')}
            collapsed={collapsed}
          />
          <SidebarItem
            icon={LogOut}
            label="Logout"
            onClick={onLogout}
            collapsed={collapsed}
          />
        </div>
      </nav>
    </aside>
  );
};
