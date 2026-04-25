import React from 'react';
import { FileVideo } from 'lucide-react';
import { useRenderStudioPage } from '../RenderStudioPageContext';

export const RenderStudioHeaderBar: React.FC = () => {
  const { runPipelineProject, renderReady, setShowRenderStudio, runPipelineSubmitting, local } = useRenderStudioPage();

  return (
    <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800 bg-gradient-to-r from-zinc-900/80 via-zinc-900/40 to-zinc-950/90">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-xl bg-lime-500/15 text-lime-400 flex items-center justify-center">
          <FileVideo size={18} />
        </div>
        <div>
          <div className="text-[11px] text-zinc-500 uppercase tracking-widest">Render Studio</div>
          <div className="text-sm font-semibold text-zinc-100">
            {runPipelineProject?.name ?? 'Project'}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-[11px] text-zinc-500">
          {renderReady ? 'Ready to render' : 'Select a video source'}
        </span>
        <button
          onClick={() => setShowRenderStudio(false)}
          className="px-3 py-1.5 text-xs font-semibold border border-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-100 hover:border-zinc-700"
        >
          Back
        </button>
        <button
          onClick={() => local.setRenderConfirmOpen(true)}
          disabled={!renderReady || runPipelineSubmitting}
          className="px-4 py-1.5 text-xs font-semibold bg-lime-500 text-zinc-950 rounded-lg hover:bg-lime-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {runPipelineSubmitting ? 'Queuing...' : 'Render'}
        </button>
      </div>
    </div>
  );
};

