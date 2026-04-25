import React, { useDeferredValue, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { 
  Search, 
  Upload, 
  RefreshCw, 
  FileVideo, 
  FileAudio, 
  Type, 
  File 
} from 'lucide-react';
import { VaultFolder, VaultFile } from '../../types';
import { parseDurationToSeconds, formatDuration } from '../../utils/helpers';
import { previewGroups, buildTooltip } from '../../utils/vault';

type VaultFileView = VaultFile & {
  language?: string;
  linkedTo?: string;
  origin?: 'source' | 'vr' | 'tts';
};

type VaultFolderView = VaultFolder & {
  lastActivity?: string;
  tags?: string[];
  files: VaultFileView[];
};

interface VaultPanelProps {
  folders: VaultFolderView[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onImport: () => void;
  onSelectProject: (folderId: string) => void;
  onSelectFile: (fileId: string) => void;
  selectedFolderId: string | null;
  selectedFileId: string | null;
  onOpenContextMenu: (event: React.MouseEvent, folder: VaultFolderView) => void;
  onOpenFileContextMenu: (event: React.MouseEvent, file: VaultFileView) => void;
  onRunPipeline: (folder: VaultFolderView) => void;
  onOpenProjectPanel: (folder: VaultFolderView) => void;
}

export const VaultPanel: React.FC<VaultPanelProps> = ({
  folders,
  loading,
  error,
  onRefresh,
  onImport,
  onSelectProject,
  onSelectFile,
  selectedFolderId,
  selectedFileId,
  onOpenContextMenu,
  onOpenFileContextMenu,
  onRunPipeline,
  onOpenProjectPanel
}) => {
  const [folderQuery, setFolderQuery] = useState('');

  const deferredFolderQuery = useDeferredValue(folderQuery);

  const filteredFolders = useMemo(() => {
    const query = deferredFolderQuery.trim().toLowerCase();
    if (!query) return folders;
    return folders.filter(folder => folder.name.toLowerCase().includes(query));
  }, [folders, deferredFolderQuery]);

  const folderMetaById = useMemo(() => {
    const map = new Map<string, {
      firstVideo: VaultFileView | undefined;
      videoCount: number;
      audioCount: number;
      subtitleCount: number;
      otherCount: number;
      totalVideoDuration: string;
      videoTooltip: string;
      audioTooltip: string;
      subtitleTooltip: string;
      otherTooltip: string;
    }>();

    for (const folder of folders) {
      let firstVideo: VaultFileView | undefined;
      let videoCount = 0;
      let audioCount = 0;
      let subtitleCount = 0;
      let otherCount = 0;
      let totalVideoSeconds = 0;
      const videoFiles: VaultFileView[] = [];
      const audioFiles: VaultFileView[] = [];
      const subtitleFiles: VaultFileView[] = [];
      const otherFiles: VaultFileView[] = [];

      for (const file of folder.files) {
        if (file.type === 'video') {
          videoCount += 1;
          if (!firstVideo) firstVideo = file;
          videoFiles.push(file);
          totalVideoSeconds += parseDurationToSeconds(file.duration);
        } else if (file.type === 'audio') {
          audioCount += 1;
          audioFiles.push(file);
        } else if (file.type === 'subtitle') {
          subtitleCount += 1;
          subtitleFiles.push(file);
        } else {
          otherCount += 1;
          otherFiles.push(file);
        }
      }

      map.set(folder.id, {
        firstVideo,
        videoCount,
        audioCount,
        subtitleCount,
        otherCount,
        totalVideoDuration: formatDuration(totalVideoSeconds),
        videoTooltip: buildTooltip(videoFiles),
        audioTooltip: buildTooltip(audioFiles),
        subtitleTooltip: buildTooltip(subtitleFiles),
        otherTooltip: buildTooltip(otherFiles)
      });
    }

    return map;
  }, [folders]);

  const selectedFolder = useMemo(() => folders.find(f => f.id === selectedFolderId), [folders, selectedFolderId]);
  const selectedFile = useMemo(() => selectedFolder?.files.find(f => f.id === selectedFileId), [selectedFolder, selectedFileId]);
  const selectedFileById = useMemo(() => {
    const map = new Map<string, VaultFileView>();
    if (!selectedFolder) return map;
    for (const file of selectedFolder.files) map.set(file.id, file);
    return map;
  }, [selectedFolder]);

  return (
    <motion.div
      key="vault"
      initial={false}
      animate={false as any}
      exit={false as any}
      className="p-8 h-full flex flex-col gap-4"
    >
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-200 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-[minmax(0,7fr)_minmax(0,3fr)] gap-6 flex-1 min-h-0">
        {/* Folder Navigation */}
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-4 min-h-0 min-w-0">
          <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-400">
            <Search size={14} />
            <input
              value={folderQuery}
              onChange={e => setFolderQuery(e.target.value)}
              placeholder="Search"
              className="bg-transparent focus:outline-none"
            />
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={onImport}
                className="px-2 py-1 rounded-md border border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:border-lime-500/40"
                title="Import files"
              >
                <Upload size={14} />
              </button>
              <button
                onClick={onRefresh}
                className="text-zinc-400 hover:text-zinc-100 transition-colors"
                title="Rescan folders"
              >
                <RefreshCw size={14} className={loading ? 'animate-spin-soft' : ''} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto pr-1">
            <div className="flex flex-col gap-2">
              {filteredFolders.map(folder => {
                const isActive = folder.id === selectedFolderId;
                const meta = folderMetaById.get(folder.id);
                const firstVideo = meta?.firstVideo;
                const videoCount = meta?.videoCount ?? 0;
                const audioCount = meta?.audioCount ?? 0;
                const subtitleCount = meta?.subtitleCount ?? 0;
                const otherCount = meta?.otherCount ?? 0;
                const totalVideoDuration = meta?.totalVideoDuration ?? '0s';
                
                return (
                  <button
                    key={folder.id}
                    onClick={() => onSelectProject(folder.id)}
                    onContextMenu={event => onOpenContextMenu(event, folder)}
                    className={`text-left p-3 rounded-xl border transition-colors ${
                      isActive ? 'border-lime-500/40 bg-lime-500/10' : 'border-zinc-800 bg-zinc-900/60 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-28 shrink-0">
                        <div className="w-full aspect-video rounded-lg bg-zinc-800/80 border border-zinc-700 flex items-center justify-center text-zinc-500 text-xs font-semibold overflow-hidden">
                          {firstVideo?.relativePath ? (
                            <img
                              src={`/api/vault/thumb?path=${encodeURIComponent(firstVideo.relativePath)}`}
                              alt={firstVideo.name}
                              className="w-full h-full object-cover"
                            />
                          ) : firstVideo ? (
                            <FileVideo size={22} />
                          ) : (
                            <File size={18} />
                          )}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-zinc-100 truncate">{folder.name}</span>
                          </div>
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-zinc-500/15 text-zinc-400">
                            Project
                          </span>
                        </div>
                        <div className="mt-2 flex items-center justify-between text-[10px] text-zinc-500">
                          <div className="flex items-center gap-3">
                            {videoCount > 0 && (
                              <span className="flex items-center gap-1" title={meta?.videoTooltip ?? ''}>
                                <FileVideo size={12} />
                                {videoCount}
                              </span>
                            )}
                            {audioCount > 0 && (
                              <span className="flex items-center gap-1" title={meta?.audioTooltip ?? ''}>
                                <FileAudio size={12} />
                                {audioCount}
                              </span>
                            )}
                            {subtitleCount > 0 && (
                              <span className="flex items-center gap-1" title={meta?.subtitleTooltip ?? ''}>
                                <Type size={12} />
                                {subtitleCount}
                              </span>
                            )}
                            {otherCount > 0 && (
                              <span className="flex items-center gap-1" title={meta?.otherTooltip ?? ''}>
                                <File size={12} />
                                {otherCount}
                              </span>
                            )}
                          </div>
                          <span>
                            {totalVideoDuration ? `Total ${totalVideoDuration}` : `Updated ${folder.lastActivity ?? folder.updatedAt}`}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {(folder.tags ?? []).map(tag => (
                            <span key={tag} className="px-2 py-0.5 rounded-full text-[10px] bg-zinc-800 text-zinc-400">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Preview Panel */}
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-5 flex flex-col gap-4 min-h-0 min-w-0">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-zinc-500 uppercase tracking-widest">Preview</div>
              <div className="text-sm font-semibold text-zinc-100">{selectedFolder?.name ?? 'Select a project'}</div>
            </div>
            <div className="flex items-center gap-2">
              {selectedFile && (
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                  selectedFile.origin === 'tts'
                    ? 'bg-amber-500/15 text-amber-300'
                    : selectedFile.origin === 'vr'
                      ? 'bg-lime-500/15 text-lime-400'
                      : 'bg-zinc-500/15 text-zinc-400'
                }`}>
                  {selectedFile.origin === 'tts' ? 'TTS' : selectedFile.origin === 'vr' ? 'VR' : 'Source'}
                </span>
              )}
              <button
                onClick={() => selectedFolder && onOpenProjectPanel(selectedFolder)}
                disabled={!selectedFolder}
                className="px-2 py-1 text-[10px] border border-zinc-800 rounded-md text-zinc-400 hover:text-zinc-100 hover:border-lime-500/40 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Open Project
              </button>
            </div>
          </div>

          {selectedFolder && (
            <button
              onClick={() => onRunPipeline(selectedFolder)}
              className="w-full px-3 py-2 bg-lime-500 text-zinc-950 rounded-lg text-xs font-semibold hover:bg-lime-400 transition-colors"
            >
              Run Pipeline
            </button>
          )}

          {selectedFolder ? (
            <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-4">
              {previewGroups(selectedFolder)
                .filter(group => group.items.length > 0)
                .map(group => (
                <div key={group.type} className="border border-zinc-800 rounded-xl p-4 bg-zinc-900/80">
                  <div className="flex items-center justify-between text-xs text-zinc-500 uppercase tracking-widest">
                    <span>{group.label}</span>
                    <span>{group.items.length}</span>
                  </div>
                  {group.items.length === 0 ? (
                    <div className="mt-3 text-xs text-zinc-500">No files</div>
                  ) : (
                  <div className="mt-3 flex flex-col gap-2">
                    {group.items.map(item => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between text-xs text-zinc-300"
                        onContextMenu={event => onOpenFileContextMenu(event, item)}
                        onClick={() => onSelectFile(item.id)}
                      >
                        <div className="min-w-0">
                          <div className={`truncate ${selectedFileId === item.id ? 'text-lime-400 font-semibold' : 'text-zinc-200'}`}>{item.name}</div>
                          <div className="text-[10px] text-zinc-500 mt-1">
                            {item.size}
                            {item.duration ? ` • ${item.duration}` : ''}
                            {item.language ? ` • ${item.language}` : ''}
                          </div>
                          {item.linkedTo && (
                            <div className="text-[10px] text-zinc-500 mt-1">
                              Generated from {selectedFileById.get(item.linkedTo)?.name ?? 'source file'}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                            item.origin === 'tts'
                              ? 'bg-amber-500/15 text-amber-300'
                              : item.origin === 'vr'
                                ? 'bg-lime-500/15 text-lime-400'
                                : 'bg-zinc-500/15 text-zinc-400'
                          }`}>
                            {item.origin === 'tts' ? 'TTS' : item.origin === 'vr' ? 'VR' : 'Source'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-zinc-500 border border-dashed border-zinc-800 rounded-2xl">
              No projects loaded
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};
