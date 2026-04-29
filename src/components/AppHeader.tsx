import React, { useState } from 'react';
import { LogOut, Search, Menu } from 'lucide-react';

type AppHeaderProps = {
  onNewJob: () => void;
  onLogout: () => void;
  onToggleMobileSidebar?: () => void;
};

export function AppHeader({ onNewJob, onLogout, onToggleMobileSidebar }: AppHeaderProps) {
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <header className="h-16 border-b border-zinc-800 flex items-center justify-between px-4 md:px-8 bg-zinc-950/50 backdrop-blur-md z-10">
      {/* Mobile Menu Toggle */}
      <button
        onClick={onToggleMobileSidebar}
        className="md:hidden p-2 -ml-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors"
        aria-label="Open menu"
      >
        <Menu size={20} />
      </button>

      <div className="flex items-center gap-4 flex-1 max-w-xl relative hidden sm:flex">
        <Search size={18} className="absolute left-3 text-zinc-500" />
        <input
          type="text"
          placeholder="Search jobs, files, or pipelines..."
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-lime-500/50 transition-colors"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={onNewJob}
          title="+ New Job"
          className="flex items-center gap-2 px-3 md:px-4 py-2 sm:py-2 bg-lime-500 text-zinc-950 rounded-lg font-bold text-sm hover:bg-lime-400 transition-colors shadow-lg shadow-lime-500/10 whitespace-nowrap compact-touch"
        >
          <span className="hidden sm:inline">+ New Job</span>
          <span className="sm:hidden">+ New</span>
        </button>
        <button
          type="button"
          onClick={onLogout}
          title="Logout"
          className="p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors"
          aria-label="Logout"
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}

