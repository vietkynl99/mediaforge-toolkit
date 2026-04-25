import React from 'react';
import { X } from 'lucide-react';
import { useRenderStudioPage } from '../RenderStudioPageContext';

export const RenderStudioRenderConfirmDialog: React.FC = () => {
  const {
    runPipelineSubmitting,
    runPipelineJob,
    setShowRenderStudio,
    setActiveTab,
    renderTimelineDuration,
    local
  } = useRenderStudioPage();

  if (!local.renderConfirmOpen) return null;

  return (
    <div className="absolute inset-0 z-[70] bg-zinc-950/70 flex items-center justify-center">
      <div className="w-[360px] rounded-xl border border-zinc-800 bg-zinc-950 shadow-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm font-semibold text-zinc-100">Render Output</div>
          <button
            type="button"
            disabled={runPipelineSubmitting}
            onClick={() => local.setRenderConfirmOpen(false)}
            className="p-1 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 transition-colors disabled:opacity-50"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={runPipelineSubmitting}
            onClick={() => {
              local.setRenderConfirmOpen(false);
              runPipelineJob({ renderPreviewSeconds: null });
              setShowRenderStudio(false);
              setActiveTab('dashboard');
            }}
            className="w-full px-3 py-2 text-xs font-semibold rounded-lg bg-lime-500 text-zinc-950 hover:bg-lime-400 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Full Video
          </button>
          <button
            type="button"
            disabled={runPipelineSubmitting}
            onClick={() => {
              local.setRenderConfirmOpen(false);
              runPipelineJob({ renderPreviewSeconds: 30 });
              setShowRenderStudio(false);
              setActiveTab('dashboard');
            }}
            className="w-full px-3 py-2 text-xs font-semibold rounded-lg border border-zinc-800 text-zinc-200 hover:border-zinc-700 hover:text-zinc-50 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Preview first 30s
          </button>
          <div className="flex flex-col gap-2 p-3 rounded-lg border border-zinc-800 bg-zinc-900/50">
            <div className="text-xs text-zinc-400">Custom Range (HH:MM:SS.S)</div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="00:00:00.0"
                value={local.customRenderStart}
                onChange={(e) => local.setCustomRenderStart(e.target.value)}
                onBlur={(e) => local.setCustomRenderStart(local.formatSecondsToTime(local.parseTimeToSeconds(e.target.value)))}
                className="w-full px-2 py-1.5 text-xs bg-zinc-950 border border-zinc-800 rounded text-zinc-200 focus:outline-none focus:border-zinc-700 font-mono text-center"
              />
              <span className="text-zinc-600">-</span>
              <input
                type="text"
                placeholder="End"
                value={local.customRenderEnd === '' ? local.formatSecondsToTime(renderTimelineDuration || 10) : local.customRenderEnd}
                onChange={(e) => local.setCustomRenderEnd(e.target.value)}
                onBlur={(e) => local.setCustomRenderEnd(e.target.value ? local.formatSecondsToTime(local.parseTimeToSeconds(e.target.value)) : '')}
                className="w-full px-2 py-1.5 text-xs bg-zinc-950 border border-zinc-800 rounded text-zinc-200 focus:outline-none focus:border-zinc-700 font-mono text-center"
              />
              <button
                type="button"
                disabled={runPipelineSubmitting}
                onClick={() => {
                  local.setRenderConfirmOpen(false);
                  const start = Math.max(0, local.parseTimeToSeconds(local.customRenderStart) || 0);
                  const endVal = local.customRenderEnd !== '' ? local.parseTimeToSeconds(local.customRenderEnd) : renderTimelineDuration;
                  const end = Math.max(start + 0.1, endVal || start + 10);
                  const duration = end - start;
                  runPipelineJob({
                    renderPreviewSeconds: duration,
                    renderPreviewStartSeconds: start
                  });
                  setShowRenderStudio(false);
                  setActiveTab('dashboard');
                }}
                className="px-3 py-1.5 text-xs font-semibold rounded bg-zinc-800 text-zinc-200 hover:bg-zinc-700 disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
              >
                Render
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

