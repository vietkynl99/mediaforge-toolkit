import React from 'react';
import { 
  FileVideo, 
  FileAudio, 
  Type, 
  Image as ImageIcon,
  Plus,
  Trash2,
  Settings,
  X,
  File,
  ChevronDown
} from 'lucide-react';
import { VaultFile, VaultFileType } from '../../../types/index';
import { formatDuration } from '../../../utils/helpers';

export type MediaBinTypeFilter = 'all' | VaultFileType;

interface MediaBinProps {
  files: VaultFile[];
  renderInputFileIds: string[];
  renderStudioFocus: 'timeline' | 'item';
  renderStudioItemType: string | null;
  renderVideoId: string | null;
  renderAudioId: string | null;
  renderSubtitleId: string | null;
  onFileClick: (file: VaultFile) => void;
  onFileContextMenu: (event: React.MouseEvent, file: VaultFile) => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  typeFilter: MediaBinTypeFilter;
  setTypeFilter: (filter: MediaBinTypeFilter) => void;
}

export const MediaBin: React.FC<MediaBinProps> = ({
  files,
  renderInputFileIds,
  renderStudioFocus,
  renderStudioItemType,
  renderVideoId,
  renderAudioId,
  renderSubtitleId,
  onFileClick,
  onFileContextMenu,
  isOpen,
  setIsOpen,
  typeFilter,
  setTypeFilter
}) => {
  const [dropdownOpen, setDropdownOpen] = React.useState(false);

  const filteredFiles = typeFilter === 'all' 
    ? files 
    : files.filter(f => f.type === typeFilter);

  const sortedFiles = [...filteredFiles].sort((a, b) => {
    const aAdded = renderInputFileIds.includes(a.id);
    const bAdded = renderInputFileIds.includes(b.id);
    if (aAdded && !bAdded) return -1;
    if (!aAdded && bAdded) return 1;
    return 0;
  });

  const typeOptions: { value: MediaBinTypeFilter; label: string; icon: React.ReactNode }[] = [
    { value: 'all', label: 'All', icon: null },
    { value: 'video', label: 'Video', icon: <FileVideo size={14} /> },
    { value: 'audio', label: 'Audio', icon: <FileAudio size={14} /> },
    { value: 'subtitle', label: 'Subtitle', icon: <Type size={14} /> },
    { value: 'image', label: 'Image', icon: <ImageIcon size={14} /> },
    { value: 'other', label: 'Other', icon: <File size={14} /> },
  ];

  const selectedOption = typeOptions.find(o => o.value === typeFilter) || typeOptions[0];

  return (
    <div className={`flex flex-col border-r border-zinc-800 bg-zinc-900/30 transition-all duration-300 ${isOpen ? 'w-64' : 'w-12'}`}>
      <div className="h-12 border-b border-zinc-800 flex items-center justify-between px-3">
        {isOpen ? (
          <>
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Media Bin</span>
            <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-zinc-800 rounded text-zinc-500">
              <X size={14} />
            </button>
          </>
        ) : (
          <button onClick={() => setIsOpen(true)} className="w-full flex justify-center p-1 hover:bg-zinc-800 rounded text-zinc-500">
            <Plus size={16} />
          </button>
        )}
      </div>

      {/* Type Filter Dropdown */}
      {isOpen && (
        <div className="px-2 py-2 border-b border-zinc-800">
          <div className="relative">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="w-full flex items-center justify-between gap-2 px-2 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-xs text-zinc-300 transition-colors"
            >
              <div className="flex items-center gap-2">
                {selectedOption.icon && <span className="text-zinc-400">{selectedOption.icon}</span>}
                <span>{selectedOption.label}</span>
              </div>
              <ChevronDown size={14} className={`text-zinc-500 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
            </button>
            
            {dropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
                <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded shadow-lg z-50 overflow-hidden">
                  {typeOptions.map(option => (
                    <button
                      key={option.value}
                      onClick={() => {
                        setTypeFilter(option.value);
                        setDropdownOpen(false);
                      }}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 text-xs transition-colors
                        ${typeFilter === option.value ? 'bg-lime-500/20 text-lime-400' : 'text-zinc-300 hover:bg-zinc-700'}
                      `}
                    >
                      {option.icon && <span>{option.icon}</span>}
                      <span>{option.label}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-2">
        <div className={`grid gap-2 ${isOpen ? 'grid-cols-1' : 'grid-cols-1'}`}>
          {sortedFiles.map(file => {
            const isAdded = renderInputFileIds.includes(file.id);
            const isSelected = renderStudioFocus === 'item' && (
              (file.type === 'video' && renderStudioItemType === 'video' && renderVideoId === file.id) ||
              (file.type === 'audio' && renderStudioItemType === 'audio' && renderAudioId === file.id) ||
              (file.type === 'subtitle' && renderStudioItemType === 'subtitle' && renderSubtitleId === file.id)
            );

            const Icon = file.type === 'video' ? FileVideo : 
                         file.type === 'audio' ? FileAudio : 
                         file.type === 'subtitle' ? Type : ImageIcon;

            return (
              <button
                key={file.id}
                title={file.name}
                onClick={() => onFileClick(file)}
                onContextMenu={(e) => onFileContextMenu(e, file)}
                className={`flex items-center gap-3 p-2 rounded-lg transition-all text-left group
                  ${isSelected ? 'bg-lime-500/10 ring-1 ring-lime-500/50' : 'hover:bg-zinc-800/50'}
                  ${!isOpen ? 'justify-center px-0' : ''}
                `}
              >
                <div className={`shrink-0 w-8 h-8 rounded flex items-center justify-center 
                  ${isAdded ? 'bg-lime-500/20 text-lime-400' : 'bg-zinc-800 text-zinc-500'}
                `}>
                  <Icon size={16} />
                </div>
                
                {isOpen && (
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-medium text-zinc-200 truncate">{file.name}</div>
                    <div className="text-[9px] text-zinc-500 uppercase tracking-tighter">
                      {file.type} {file.duration && `• ${file.duration}`}
                    </div>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
