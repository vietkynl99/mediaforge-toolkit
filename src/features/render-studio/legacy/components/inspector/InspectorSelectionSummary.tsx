import React from 'react';
import { FileAudio, FileVideo, Type } from 'lucide-react';
import { useRenderStudioPage } from '../../RenderStudioPageContext';

export const InspectorSelectionSummary: React.FC = () => {
  const { renderSelectedItem, formatDuration } = useRenderStudioPage();

  if (!renderSelectedItem) {
    return <div className="text-[11px] text-zinc-500">Select an item from the media bin.</div>;
  }

  return (
    <div className="text-xs text-zinc-300 flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm text-zinc-100">
        {renderSelectedItem.type === 'video' ? (
          <FileVideo size={14} />
        ) : renderSelectedItem.type === 'audio' ? (
          <FileAudio size={14} />
        ) : (
          <Type size={14} />
        )}
        <span className="truncate font-semibold">{renderSelectedItem.name}</span>
      </div>
      <div className="flex items-center justify-between text-[11px] text-zinc-500">
        <span>Type</span>
        <span className="text-zinc-300">{renderSelectedItem.type}</span>
      </div>
      <div className="flex items-center justify-between text-[11px] text-zinc-500">
        <span>Size</span>
        <span className="text-zinc-300">{renderSelectedItem.size ?? renderSelectedItem.sizeBytes ?? '--'}</span>
      </div>
      <div className="flex items-center justify-between text-[11px] text-zinc-500">
        <span>Duration</span>
        <span className="text-zinc-300">
          {renderSelectedItem.duration ?? formatDuration?.(renderSelectedItem.durationSeconds) ?? '--'}
        </span>
      </div>
      <div className="flex items-center justify-between text-[11px] text-zinc-500">
        <span>Language</span>
        <span className="text-zinc-300">{renderSelectedItem.language ?? '--'}</span>
      </div>
      <div className="flex items-center justify-between text-[11px] text-zinc-500">
        <span>Version</span>
        <span className="text-zinc-300">{renderSelectedItem.version ?? '--'}</span>
      </div>
      <div className="flex items-center justify-between text-[11px] text-zinc-500">
        <span>Origin</span>
        <span className="text-zinc-300">{renderSelectedItem.origin ?? '--'}</span>
      </div>
      <div className="flex items-center justify-between text-[11px] text-zinc-500">
        <span>Status</span>
        <span className="text-zinc-300">{renderSelectedItem.status ?? '--'}</span>
      </div>
      <div className="flex items-center justify-between text-[11px] text-zinc-500">
        <span>Created</span>
        <span className="text-zinc-300">{renderSelectedItem.createdAt ?? '--'}</span>
      </div>
      <div className="flex items-center justify-between text-[11px] text-zinc-500">
        <span>Path</span>
        <span className="text-zinc-300 truncate max-w-[160px]" title={renderSelectedItem.relativePath ?? '--'}>
          {renderSelectedItem.relativePath ?? '--'}
        </span>
      </div>
    </div>
  );
};

