import React, { useState } from 'react';
import { LogOut, Search } from 'lucide-react';

type AppHeaderProps = {
  onNewJob: () => void;
  onLogout: () => void;
};

export function AppHeader({ onNewJob, onLogout }: AppHeaderProps) {
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <header className="h-16 border-b border-zinc-800 flex items-center justify-between px-8 bg-zinc-950/50 backdrop-blur-md z-10">
      <div className="flex items-center gap-4 flex-1 max-w-xl relative">
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
          className="flex items-center gap-2 px-4 py-2 bg-lime-500 text-zinc-950 rounded-lg font-bold text-sm hover:bg-lime-400 transition-colors shadow-lg shadow-lime-500/10"
        >
          + New Job
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

