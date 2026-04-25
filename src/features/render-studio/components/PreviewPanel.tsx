import React from 'react';
import { 
  Play,
  Pause,
  Maximize2,
  Settings,
  MousePointer2,
  FileVideo
} from 'lucide-react';
import { VaultFile } from '../../../types/index';

interface PreviewPanelProps {
  videoFile: VaultFile | null;
  focus: 'timeline' | 'item';
  itemType: string | null;
  onResetFocus: () => void;
  canPlay: (mime: string) => boolean;
  getMimeType: (name?: string) => string;
}

export const PreviewPanel: React.FC<PreviewPanelProps> = ({
  videoFile,
  focus,
  itemType,
  onResetFocus,
  canPlay,
  getMimeType
}) => {
  return (
    <div className="flex-1 bg-zinc-950 flex flex-col min-h-0">
      <div className="h-10 border-b border-zinc-800 flex items-center justify-between px-4 bg-zinc-900/20">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Preview</span>
          {videoFile && (
            <span className="text-[10px] text-zinc-400 truncate max-w-[200px]">
              • {videoFile.name}
            </span>
          )}
        </div>
        
        {focus === 'item' && (
          <button 
            onClick={onResetFocus}
            className="flex items-center gap-1.5 px-2 py-0.5 bg-lime-500/10 text-lime-400 border border-lime-500/20 rounded text-[9px] font-bold uppercase transition-colors hover:bg-lime-500/20"
          >
            <MousePointer2 size={10} />
            Timeline View
          </button>
        )}
      </div>

      <div className="flex-1 flex items-center justify-center p-6 relative">
        <div className="aspect-video w-full max-w-4xl bg-black rounded-lg shadow-2xl border border-zinc-800 overflow-hidden flex items-center justify-center group relative">
          {focus === 'item' && itemType === 'video' && videoFile?.relativePath ? (
            canPlay(getMimeType(videoFile.name)) ? (
              <video
                key={videoFile.relativePath}
                className="w-full h-full object-contain"
                controls
                preload="auto"
                playsInline
              >
                <source
                  src={`/api/vault/stream?path=${encodeURIComponent(videoFile.relativePath)}`}
                  type={getMimeType(videoFile.name)}
                />
              </video>
            ) : (
              <div className="flex flex-col items-center gap-3 text-zinc-500">
                <FileVideo size={32} />
                <div className="text-center">
                  <p className="text-xs font-medium">Browser not supported</p>
                  <p className="text-[10px] mt-1 opacity-60">Convert to MP4 or WebM to preview</p>
                </div>
              </div>
            )
          ) : (
            <div className="flex flex-col items-center gap-4 text-zinc-600">
              <div className="w-16 h-16 rounded-full border-2 border-zinc-800 flex items-center justify-center">
                <Play size={24} className="ml-1 opacity-20" />
              </div>
              <p className="text-xs italic">Select a video to preview</p>
            </div>
          )}
          
          {/* Custom Controls Overlay - Under construction */}
          <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
            {/* Control bar would go here */}
          </div>
        </div>
      </div>
    </div>
  );
};
