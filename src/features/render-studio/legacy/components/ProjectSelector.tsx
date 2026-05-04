import React, { useState, useMemo } from 'react';
import { Search, Folder, FileVideo, FileAudio, Type, Image, File, ChevronRight, X, FileText, RefreshCw } from 'lucide-react';
import { VaultFolder, VaultFile, VaultStatus } from '../../../../types/vault';

const STATUS_COLORS: Record<VaultStatus, string> = {
  'todo': 'bg-zinc-500',
  'in progress': 'bg-blue-500',
  'done': 'bg-lime-500',
  'closed': 'bg-red-500',
  'error': 'bg-red-600',
};

const STATUS_LABELS: Record<VaultStatus, string> = {
  'todo': 'Todo',
  'in progress': 'In Progress',
  'done': 'Done',
  'closed': 'Closed',
  'error': 'Error',
};

interface ProjectSelectorProps {
  vaultFolders: VaultFolder[];
  vaultLoading: boolean;
  onSelectProject: (folder: VaultFolder) => void;
  onBack?: () => void;
  onRefresh?: () => void;
}

export const ProjectSelector: React.FC<ProjectSelectorProps> = ({
  vaultFolders,
  vaultLoading,
  onSelectProject,
  onBack,
  onRefresh,
}) => {
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [folderQuery, setFolderQuery] = useState('');

  const selectedFolder = useMemo(() => 
    vaultFolders.find(f => f.id === selectedFolderId), 
    [vaultFolders, selectedFolderId]
  );

  const filteredFolders = useMemo(() => 
    vaultFolders.filter(folder => 
      folder.name.toLowerCase().includes(folderQuery.toLowerCase())
    ), [vaultFolders, folderQuery]
  );

  const getSupportedFiles = (folder: VaultFolder) => {
    return folder.files?.filter(f => {
      const isSupported = ['video', 'audio', 'subtitle', 'image'].includes(f.type);
      return isSupported;
    }) || [];
  };

  return (
    <div className="flex-1 flex flex-col p-8 bg-zinc-950/50 overflow-hidden relative">
      <div className="mb-8 flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-zinc-100 mb-2 tracking-tight">Render Studio</h1>
          <p className="text-zinc-400 text-sm">Select a project and its media to start editing your render project.</p>
        </div>
        <div className="flex items-center gap-3">
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={vaultLoading}
              className="p-2.5 rounded-xl border border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:border-zinc-700 transition-all bg-zinc-900/50 disabled:opacity-50"
              title="Refresh projects"
            >
              <RefreshCw size={18} className={vaultLoading ? 'animate-spin' : ''} />
            </button>
          )}
          {onBack && (
            <button
              onClick={onBack}
              className="px-4 py-2 text-sm font-semibold border border-zinc-800 rounded-xl text-zinc-400 hover:text-zinc-100 hover:border-zinc-700 transition-all bg-zinc-900/50"
            >
              Back to Dashboard
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 flex gap-8 min-h-0">
        {/* Projects List */}
        <div className="w-1/3 flex flex-col bg-zinc-900/40 border border-zinc-800 rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-zinc-800 space-y-4">
            <h2 className="text-sm font-bold text-zinc-200 flex items-center gap-2">
              <Folder size={18} className="text-lime-400" />
              Projects
            </h2>
            <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2">
              <Search size={16} className="text-zinc-500" />
              <input
                type="text"
                value={folderQuery}
                onChange={(e) => setFolderQuery(e.target.value)}
                placeholder="Search projects..."
                className="flex-1 bg-transparent text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none"
              />
              {folderQuery && (
                <button
                  onClick={() => setFolderQuery('')}
                  className="text-zinc-500 hover:text-zinc-300"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {vaultLoading ? (
              <div className="flex items-center justify-center h-32">
                <div className="w-8 h-8 border-2 border-lime-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filteredFolders.length === 0 ? (
              <p className="text-sm text-zinc-500 p-4 text-center">No projects found</p>
            ) : (
              filteredFolders.map((folder) => (
                <button
                  key={folder.id}
                  onClick={() => setSelectedFolderId(folder.id)}
                  className={`w-full text-left p-4 rounded-xl transition-all border ${
                    selectedFolderId === folder.id
                      ? 'bg-lime-600/10 border-lime-500/30 text-lime-400 shadow-[0_0_15px_rgba(101,163,13,0.1)]'
                      : 'hover:bg-zinc-800/50 border-transparent text-zinc-400'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-semibold truncate flex-1">{folder.name}</p>
                    {folder.status && (
                      <span className={`text-[9px] leading-none font-bold uppercase tracking-wider px-1.5 py-1 rounded ${STATUS_COLORS[folder.status]} text-white shrink-0`}>
                        {STATUS_LABELS[folder.status]}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500">
                    {getSupportedFiles(folder).length} media files
                  </p>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Files List/Action Area */}
        <div className="w-2/3 flex flex-col bg-zinc-900/40 border border-zinc-800 rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
            <h2 className="text-sm font-bold text-zinc-200 flex items-center gap-2 h-6">
              {selectedFolder ? (
                <>
                  <Folder size={18} className="text-lime-400" />
                  {selectedFolder.name}
                </>
              ) : 'Select a project'}
            </h2>
            {selectedFolder && (
              <span className="text-xs text-zinc-500 font-medium">
                {getSupportedFiles(selectedFolder).length} files available
              </span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {!selectedFolder ? (
              <div className="h-full flex flex-col items-center justify-center text-zinc-500 space-y-4 opacity-50">
                <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center">
                  <Folder size={32} />
                </div>
                <p className="text-base font-medium">Select a project from the left to view its media files</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  {getSupportedFiles(selectedFolder).map((file) => {
                    const Icon = file.type === 'video' ? FileVideo : 
                                file.type === 'audio' ? FileAudio : 
                                file.type === 'subtitle' ? Type : Image;
                    
                    const iconColor = file.type === 'video' ? 'text-lime-400' : 
                                     file.type === 'audio' ? 'text-amber-400' : 
                                     file.type === 'subtitle' ? 'text-blue-400' : 'text-sky-400';

                    return (
                      <div
                        key={file.id}
                        className="p-3 rounded-xl bg-zinc-800/40 border border-zinc-700/50 flex items-center gap-3"
                      >
                        <div className={`w-10 h-10 rounded-lg bg-zinc-900 flex items-center justify-center ${iconColor}`}>
                          <Icon size={20} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-zinc-200 truncate">{file.name}</p>
                          <p className="text-[10px] text-zinc-500 uppercase tracking-tight">{file.type} • {file.size}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="pt-8 flex justify-center">
                  <button
                    onClick={() => onSelectProject(selectedFolder)}
                    className="group relative px-6 py-2.5 bg-lime-600 hover:bg-lime-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-lime-900/20 flex items-center gap-2 overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
                    <span className="relative text-sm">Open in Render Studio</span>
                    <ChevronRight size={16} className="relative group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes shimmer {
          100% { transform: translateX(100%); }
        }
      `}} />
    </div>
  );
};
