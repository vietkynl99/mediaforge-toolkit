import React from 'react';
import {
  LayoutDashboard,
  Hammer,
  Database,
  Settings,
  Terminal,
  Activity,
  Cpu,
  HardDrive
} from 'lucide-react';

interface AppSidebarProps {
  collapsed: boolean;
  setCollapsed: (next: boolean) => void;
  activeTab: string;
  onNavigateTab: (tab: 'dashboard' | 'forge' | 'vault' | 'settings' | 'logs') => void;
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
  onNavigateTab
}) => {
  return (
    <aside className={`${collapsed ? 'w-20' : 'w-64'} border-r border-zinc-800 flex flex-col p-4 gap-6 transition-all duration-300`}>
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        aria-expanded={!collapsed}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3 px-2'} mb-2 w-full text-left rounded-lg py-2 hover:bg-zinc-900/60 transition-colors`}
      >
        <div className="w-8 h-8 bg-lime-500 rounded-lg flex items-center justify-center text-zinc-950 font-black italic">MF</div>
        {!collapsed && <h1 className="text-lg font-bold text-zinc-100 tracking-tight">MediaForge</h1>}
      </button>

      <nav className="flex flex-col gap-1 flex-1">
        <SidebarItem
          icon={LayoutDashboard}
          label="Dashboard"
          active={activeTab === 'dashboard'}
          onClick={() => onNavigateTab('dashboard')}
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
          icon={Database}
          label="Media Vault"
          active={activeTab === 'vault'}
          onClick={() => onNavigateTab('vault')}
          collapsed={collapsed}
        />
        <div className="my-4 border-t border-zinc-800/50" />
        <SidebarItem
          icon={Settings}
          label="Settings"
          active={activeTab === 'settings'}
          onClick={() => onNavigateTab('settings')}
          collapsed={collapsed}
        />
        <SidebarItem
          icon={Terminal}
          label="System Logs"
          active={activeTab === 'logs'}
          onClick={() => onNavigateTab('logs')}
          collapsed={collapsed}
        />
      </nav>

      {!collapsed && (
        <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800 flex flex-col gap-3">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-zinc-500">
            <span>System Health</span>
            <Activity size={12} className="text-lime-500" />
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-zinc-400"><Cpu size={12} /> CPU</div>
              <span className="font-mono text-zinc-200">--</span>
            </div>
            <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full bg-lime-500 w-[0%]" />
            </div>
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-zinc-400"><HardDrive size={12} /> Disk</div>
              <span className="font-mono text-zinc-200">--</span>
            </div>
            <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 w-[0%]" />
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
