import React from 'react';
import { ChevronRight } from 'lucide-react';
import type { VaultFileType, VaultFolder } from '../app/appData';

interface VaultProjectPanelProps {
  open: boolean;
  selectedFolder: VaultFolder | null;
  onClose: () => void;
  filteredFiles: any[];
  fileTypeIcons: Record<VaultFileType, any>;
  fileTypeLabels: Record<VaultFileType, string>;
  vaultQuery: string;
  setVaultQuery: (value: string) => void;
  vaultTypeFilter: VaultFileType | 'all';
  setVaultTypeFilter: (value: VaultFileType | 'all') => void;
  vaultSort: 'recent' | 'name' | 'size';
  setVaultSort: (value: 'recent' | 'name' | 'size') => void;
  vaultView: 'grouped' | 'flat';
  setVaultView: (value: 'grouped' | 'flat') => void;
  groupedFiles: Array<{ type: VaultFileType; items: any[] }>;
  vaultGroupCollapsed: Record<VaultFileType, boolean>;
  setVaultGroupCollapsed: React.Dispatch<React.SetStateAction<Record<VaultFileType, boolean>>>;
  openFileContextMenu: (event: React.MouseEvent, file: any) => void;
  setVaultFileId: (id: string) => void;
  selectedFile: any | null;
  formatOverlapDisplay: (overlapSeconds?: number, durationSeconds?: number) => string;
}

export const VaultProjectPanel: React.FC<VaultProjectPanelProps> = ({
  open,
  selectedFolder,
  onClose,
  filteredFiles,
  fileTypeIcons,
  fileTypeLabels,
  vaultQuery,
  setVaultQuery,
  vaultTypeFilter,
  setVaultTypeFilter,
  vaultSort,
  setVaultSort,
  vaultView,
  setVaultView,
  groupedFiles,
  vaultGroupCollapsed,
  setVaultGroupCollapsed,
  openFileContextMenu,
  setVaultFileId,
  selectedFile,
  formatOverlapDisplay
}) => {
  if (!open || !selectedFolder) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative w-[min(960px,92vw)] h-[min(720px,86vh)] bg-zinc-900/95 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-4 shadow-2xl min-h-0 overflow-y-auto">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-xl font-bold text-zinc-100">{selectedFolder.name}</h3>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-zinc-500/15 text-zinc-400">
                Project
              </span>
              <span className="text-xs text-zinc-500">Last activity {selectedFolder.lastActivity}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="px-2.5 py-1.5 text-xs font-semibold bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-200 hover:border-lime-500/40 transition-colors">
              Quick Actions
            </button>
            <button className="px-2.5 py-1.5 text-xs font-semibold bg-lime-500 text-zinc-950 rounded-lg hover:bg-lime-400 transition-colors">
              New Job
            </button>
            <button
              onClick={onClose}
              className="px-2.5 py-1.5 text-xs font-semibold border border-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-100 hover:border-zinc-700"
            >
              Close
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {selectedFolder.suggestedAction && (
            <div className="flex items-center justify-between bg-blue-500/10 border border-blue-500/30 text-blue-200 px-3 py-2 rounded-xl text-sm">
              <span>{selectedFolder.suggestedAction}</span>
              <button className="px-2.5 py-1 text-xs font-semibold bg-blue-500/20 text-blue-100 rounded-lg border border-blue-500/40">
                Do It
              </button>
            </div>
          )}

          <div className="grid grid-cols-5 gap-2">
            {(['video', 'audio', 'subtitle', 'image', 'output'] as VaultFileType[]).map(type => {
              const count = selectedFolder.files.filter(file => file.type === type).length;
              const Icon = fileTypeIcons[type];
              return (
                <div key={type} className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-2.5">
                  <div className="flex items-center gap-2 text-xs text-zinc-500">
                    <Icon size={14} />
                    {fileTypeLabels[type]}
                  </div>
                  <div className="text-lg font-bold text-zinc-100 mt-2">{count}</div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <div className="text-xs text-zinc-500 uppercase tracking-widest">Files</div>
              <div className="text-xs text-zinc-500">({filteredFiles.length})</div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-400">
                <input
                  value={vaultQuery}
                  onChange={e => setVaultQuery(e.target.value)}
                  placeholder="Search inside folder"
                  className="bg-transparent focus:outline-none"
                />
              </div>
              <select
                value={vaultTypeFilter}
                onChange={e => setVaultTypeFilter(e.target.value as VaultFileType | 'all')}
                className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-300 focus:outline-none"
              >
                <option value="all">All Types</option>
                <option value="video">Video</option>
                <option value="audio">Audio</option>
                <option value="subtitle">Subtitle</option>
                <option value="image">Image</option>
                <option value="output">Output</option>
                <option value="other">Other</option>
              </select>
              <select
                value={vaultSort}
                onChange={e => setVaultSort(e.target.value as 'recent' | 'name' | 'size')}
                className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-300 focus:outline-none"
              >
                <option value="recent">Recent</option>
                <option value="name">Name</option>
                <option value="size">Size</option>
              </select>
              <button
                onClick={() => setVaultView(vaultView === 'grouped' ? 'flat' : 'grouped')}
                className="px-2.5 py-1.5 text-xs border border-zinc-800 rounded-lg text-zinc-300 hover:border-lime-500/40"
              >
                {vaultView === 'grouped' ? 'Flat View' : 'Grouped View'}
              </button>
            </div>
          </div>

          <div className="pr-1">
            <div className="flex flex-col gap-4">
              {vaultView === 'grouped' ? (
                groupedFiles.map(group => {
                  if (group.items.length === 0) return null;
                  return (
                    <div key={group.type} className="flex flex-col gap-1.5">
                      <button
                        type="button"
                        onClick={() => setVaultGroupCollapsed(prev => ({ ...prev, [group.type]: !prev[group.type] }))}
                        className="flex items-center justify-between text-[10px] font-semibold text-zinc-400 uppercase tracking-widest hover:text-zinc-300"
                      >
                        <span className="flex items-center gap-2">
                          <ChevronRight
                            size={12}
                            className={`transition-transform ${vaultGroupCollapsed[group.type] ? '' : 'rotate-90'}`}
                          />
                          {fileTypeLabels[group.type]}
                        </span>
                        <span>{group.items.length}</span>
                      </button>
                      {!vaultGroupCollapsed[group.type] && (
                        <div className="flex flex-col gap-1.5">
                          {group.items.map(file => {
                            const isSelected = file.id === selectedFile?.id;
                            const Icon = fileTypeIcons[file.type as VaultFileType];
                            return (
                              <button
                                key={file.id}
                                onClick={() => setVaultFileId(file.id)}
                                onContextMenu={event => openFileContextMenu(event, file)}
                                className={`group text-left border rounded-xl p-2.5 transition-colors ${
                                  isSelected ? 'border-lime-500/50 bg-lime-500/10' : 'border-zinc-800 bg-zinc-900/70 hover:border-zinc-700'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-4">
                                  <div className="flex items-start gap-3">
                                    <div className="p-1.5 bg-zinc-800 rounded-lg text-zinc-400">
                                      <Icon size={14} />
                                    </div>
                                    <div>
                                      <div className="text-xs font-semibold text-zinc-100">{file.name}</div>
                                      <div className="text-[11px] text-zinc-500 mt-0.5">
                                        {fileTypeLabels[file.type as VaultFileType]} • {file.size}{file.duration ? ` • ${file.duration}` : ''}{file.language ? ` • ${file.language}` : ''}
                                      </div>
                                      {file.linkedTo && (
                                        <div className="text-[11px] text-zinc-500 mt-0.5">
                                          Generated from {selectedFolder.files.find(item => item.id === file.linkedTo)?.name ?? 'source file'}
                                        </div>
                                      )}
                                      {file.origin === 'tts' && file.tts?.overlapSeconds !== undefined && file.tts?.overlapMode !== 'truncate' && (
                                        <div className="text-[11px] text-zinc-500 mt-0.5">
                                          Overlap total {formatOverlapDisplay(file.tts.overlapSeconds, file.durationSeconds)}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex flex-col items-end gap-1.5">
                                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                                      file.origin === 'tts'
                                        ? 'bg-amber-500/15 text-amber-300'
                                        : file.origin === 'vr'
                                          ? 'bg-lime-500/15 text-lime-400'
                                          : 'bg-zinc-500/15 text-zinc-400'
                                    }`}>
                                      {file.origin === 'tts' ? 'TTS' : file.origin === 'vr' ? 'VR' : 'Source'}
                                    </span>
                                    <span className="text-[10px] text-zinc-500">{file.createdAt}</span>
                                  </div>
                                </div>
                                {file.status === 'processing' && typeof file.progress === 'number' && (
                                  <div className="mt-3">
                                    <div className="flex justify-between text-[10px] text-zinc-500">
                                      <span>Processing</span>
                                      <span>{file.progress}%</span>
                                    </div>
                                    <div className="h-1 bg-zinc-800 rounded-full overflow-hidden mt-1">
                                      <div className="h-full bg-blue-500" style={{ width: `${file.progress}%` }} />
                                    </div>
                                  </div>
                                )}
                                {isSelected && file.type === 'audio' && file.relativePath && (
                                  <div className="mt-2 border border-zinc-800 rounded-lg p-2 bg-zinc-900/80">
                                    <audio
                                      className="w-full mt-1.5 h-8 rounded-md bg-zinc-900"
                                      style={{ colorScheme: 'dark' }}
                                      controls
                                    >
                                      <source src={`/api/vault/stream?path=${encodeURIComponent(file.relativePath)}&preview=1`} />
                                    </audio>
                                    {file.sizeBytes > 20 * 1024 * 1024 && (
                                      <div className="text-[11px] text-zinc-500 mt-1.5">
                                        Preview limited to the first 60 seconds for files over 20MB.
                                      </div>
                                    )}
                                  </div>
                                )}
                                <div className="mt-2" />
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="flex flex-col gap-1.5">
                  {filteredFiles.map(file => {
                    const isSelected = file.id === selectedFile?.id;
                    const Icon = fileTypeIcons[file.type as VaultFileType];
                    return (
                      <button
                        key={file.id}
                        onClick={() => setVaultFileId(file.id)}
                        onContextMenu={event => openFileContextMenu(event, file)}
                        className={`group text-left border rounded-xl p-2.5 transition-colors ${
                          isSelected ? 'border-lime-500/50 bg-lime-500/10' : 'border-zinc-800 bg-zinc-900/70 hover:border-zinc-700'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3">
                            <div className="p-1.5 bg-zinc-800 rounded-lg text-zinc-400">
                              <Icon size={14} />
                            </div>
                            <div>
                              <div className="text-xs font-semibold text-zinc-100">{file.name}</div>
                              <div className="text-[11px] text-zinc-500 mt-0.5">
                                {fileTypeLabels[file.type as VaultFileType]} • {file.size}{file.duration ? ` • ${file.duration}` : ''}{file.language ? ` • ${file.language}` : ''}
                              </div>
                              {file.linkedTo && (
                                <div className="text-[11px] text-zinc-500 mt-0.5">
                                  Generated from {selectedFolder.files.find(item => item.id === file.linkedTo)?.name ?? 'source file'}
                                </div>
                              )}
                              {file.origin === 'tts' && file.tts?.overlapSeconds !== undefined && file.tts?.overlapMode !== 'truncate' && (
                                <div className="text-[11px] text-zinc-500 mt-0.5">
                                  Overlap total {formatOverlapDisplay(file.tts.overlapSeconds, file.durationSeconds)}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1.5">
                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                              file.origin === 'tts'
                                ? 'bg-amber-500/15 text-amber-300'
                                : file.origin === 'vr'
                                  ? 'bg-lime-500/15 text-lime-400'
                                  : 'bg-zinc-500/15 text-zinc-400'
                            }`}>
                              {file.origin === 'tts' ? 'TTS' : file.origin === 'vr' ? 'VR' : 'Source'}
                            </span>
                            <span className="text-[10px] text-zinc-500">{file.createdAt}</span>
                          </div>
                        </div>
                        {file.status === 'processing' && typeof file.progress === 'number' && (
                          <div className="mt-3">
                            <div className="flex justify-between text-[10px] text-zinc-500">
                              <span>Processing</span>
                              <span>{file.progress}%</span>
                            </div>
                            <div className="h-1 bg-zinc-800 rounded-full overflow-hidden mt-1">
                              <div className="h-full bg-blue-500" style={{ width: `${file.progress}%` }} />
                            </div>
                          </div>
                        )}
                        {isSelected && file.type === 'audio' && file.relativePath && (
                          <div className="mt-2 border border-zinc-800 rounded-lg p-2 bg-zinc-900/80">
                            <audio
                              className="w-full mt-1.5 h-8 rounded-md bg-zinc-900"
                              style={{ colorScheme: 'dark' }}
                              controls
                            >
                              <source src={`/api/vault/stream?path=${encodeURIComponent(file.relativePath)}&preview=1`} />
                            </audio>
                            {file.sizeBytes > 20 * 1024 * 1024 && (
                              <div className="text-[11px] text-zinc-500 mt-1.5">
                                Preview limited to the first 60 seconds for files over 20MB.
                              </div>
                            )}
                          </div>
                        )}
                        <div className="mt-2" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
