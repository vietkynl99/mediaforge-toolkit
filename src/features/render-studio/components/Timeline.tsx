import React from 'react';
import { 
  Volume2, 
  VolumeX, 
  FileVideo, 
  FileAudio, 
  Type, 
  Image as ImageIcon 
} from 'lucide-react';
import { VaultFile } from '../../../types/index';

interface TimelineProps {
  timelineWidth: number;
  timelineDuration: number;
  viewDuration: number;
  playheadSeconds: number;
  tickCount: number;
  tracks: {
    video?: VaultFile | null;
    audio?: VaultFile | null;
    subtitle?: VaultFile | null;
    images: VaultFile[];
    textEnabled: boolean;
  };
  subtitleLanes: any[][];
  onTimelineClick: (event: React.MouseEvent<HTMLDivElement>) => void;
  onTrackClick: (type: string, id?: string) => void;
  onTrackContextMenu: (event: React.MouseEvent, type: string, id?: string) => void;
  scrollRef: React.RefObject<HTMLDivElement>;
  formatDuration: (s: number) => string | undefined;
}

export const Timeline: React.FC<TimelineProps> = ({
  timelineWidth,
  timelineDuration,
  viewDuration,
  playheadSeconds,
  tickCount,
  tracks,
  subtitleLanes,
  onTimelineClick,
  onTrackClick,
  onTrackContextMenu,
  scrollRef,
  formatDuration
}) => {
  const playheadPct = viewDuration > 0 ? (playheadSeconds / viewDuration) * 100 : 0;

  return (
    <div className="h-64 border-t border-zinc-800 bg-zinc-900/30 flex flex-col overflow-hidden">
      <div className="h-8 border-b border-zinc-800/50 flex items-center justify-between px-4 bg-zinc-900/40">
        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Timeline</span>
        <div className="text-[10px] font-mono text-zinc-400">
          {formatDuration(playheadSeconds)} / {formatDuration(timelineDuration)}
        </div>
      </div>

      <div 
        ref={scrollRef}
        className="flex-1 overflow-x-auto overflow-y-hidden"
        onClick={onTimelineClick}
      >
        <div 
          className="relative h-full min-w-full" 
          style={{ width: timelineWidth }}
        >
          {/* Ticks / Ruler */}
          <div className="h-6 border-b border-zinc-800/30 relative">
            {Array.from({ length: tickCount + 1 }).map((_, i) => {
              const time = (timelineDuration * i) / tickCount;
              const left = (time / viewDuration) * 100;
              return (
                <div key={i} className="absolute top-0 h-full border-l border-zinc-800/50" style={{ left: `${left}%` }}>
                  <span className="absolute left-1 top-1 text-[8px] text-zinc-600 font-mono">
                    {formatDuration(time)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Playhead */}
          <div 
            className="absolute top-0 bottom-0 z-50 pointer-events-none"
            style={{ left: `${playheadPct}%` }}
          >
            <div className="w-px h-full bg-lime-500 shadow-[0_0_8px_rgba(132,204,22,0.5)]" />
            <div className="absolute -top-1 -left-1 w-2 h-2 bg-lime-500 rounded-full" />
          </div>

          {/* Tracks */}
          <div className="flex flex-col gap-1 p-2">
            {/* Video Track */}
            {tracks.video && (
              <div 
                className="h-10 bg-lime-500/10 border border-lime-500/20 rounded-md flex items-center px-3 gap-2 cursor-pointer hover:bg-lime-500/20 transition-colors"
                onClick={(e) => { e.stopPropagation(); onTrackClick('video'); }}
                onContextMenu={(e) => onTrackContextMenu(e, 'video')}
              >
                <FileVideo size={14} className="text-lime-400" />
                <span className="text-[10px] font-medium text-zinc-300 truncate">{tracks.video.name}</span>
              </div>
            )}

            {/* Audio Track */}
            {tracks.audio && (
              <div 
                className="h-10 bg-amber-500/10 border border-amber-500/20 rounded-md flex items-center px-3 gap-2 cursor-pointer hover:bg-amber-500/20 transition-colors"
                onClick={(e) => { e.stopPropagation(); onTrackClick('audio'); }}
                onContextMenu={(e) => onTrackContextMenu(e, 'audio')}
              >
                <FileAudio size={14} className="text-amber-400" />
                <span className="text-[10px] font-medium text-zinc-300 truncate">{tracks.audio.name}</span>
              </div>
            )}

            {/* Subtitle Lanes */}
            {tracks.subtitle && (
              <div className="flex flex-col gap-0.5">
                {subtitleLanes.map((lane, i) => (
                  <div key={i} className="h-6 bg-blue-500/5 border border-blue-500/10 rounded-sm relative overflow-hidden">
                    {lane.map((cue, j) => {
                      const left = (cue.start / viewDuration) * 100;
                      const width = ((cue.end - cue.start) / viewDuration) * 100;
                      return (
                        <div 
                          key={j}
                          className="absolute top-0.5 bottom-0.5 bg-blue-500/20 border border-blue-500/30 rounded px-1 flex items-center truncate"
                          style={{ left: `${left}%`, width: `${width}%` }}
                        >
                          <span className="text-[8px] text-blue-300 truncate">{cue.text}</span>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
