import React from 'react';
import { motion } from 'motion/react';
import { PipelineSummary, TaskTemplate } from '../../types';

interface PipelineForgeProps {
  pipelineLibrary: PipelineSummary[];
  availableTasks: TaskTemplate[];
  onOpenPipelinePreview: (pipeline: PipelineSummary) => void;
  onOpenPipelineEditor: (pipeline: PipelineSummary) => void;
  onCreateNewPipeline: () => void;
  onOpenContextMenu: (event: React.MouseEvent, pipeline: PipelineSummary) => void;
  resolvePipelineIcon: (pipeline: PipelineSummary) => any;
}

export const PipelineForge: React.FC<PipelineForgeProps> = ({
  pipelineLibrary,
  availableTasks,
  onOpenPipelinePreview,
  onOpenPipelineEditor,
  onCreateNewPipeline,
  onOpenContextMenu,
  resolvePipelineIcon
}) => {
  return (
    <motion.div
      key="forge"
      initial={false}
      animate={false as any}
      exit={false as any}
      className="p-4 md:p-8 h-full flex flex-col"
    >
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-zinc-100">Pipeline Forge</h2>
        <p className="text-sm text-zinc-500">Construct a multi-step processing sequence</p>
      </div>

      <div className="bg-zinc-900/30 border border-zinc-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Pipelines</h3>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-500">{pipelineLibrary.length} pipelines</span>
            <button
              onClick={onCreateNewPipeline}
              className="px-3 py-1 text-[10px] font-semibold bg-lime-500 text-zinc-950 rounded-md hover:bg-lime-400 transition-colors"
            >
              + New
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {pipelineLibrary.map(pipeline => {
            const PipelineIcon = resolvePipelineIcon(pipeline);
            return (
              <div
                key={pipeline.id}
                onClick={() => {
                  if (pipeline.kind === 'task') {
                    onOpenPipelinePreview(pipeline);
                  } else {
                    onOpenPipelineEditor(pipeline);
                  }
                }}
                onContextMenu={event => onOpenContextMenu(event, pipeline)}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    if (pipeline.kind === 'task') {
                      onOpenPipelinePreview(pipeline);
                    } else {
                      onOpenPipelineEditor(pipeline);
                    }
                  }
                }}
                role="button"
                tabIndex={0}
                className="group text-left p-4 rounded-lg border border-zinc-800 bg-zinc-900/60 hover:border-lime-500/40 transition-colors flex items-start justify-between gap-3 cursor-pointer"
              >
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-lg border border-zinc-800 bg-zinc-900 flex items-center justify-center">
                    <PipelineIcon size={18} className="text-zinc-200" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-zinc-100">{pipeline.name}</div>
                    <div className="mt-2 text-xs text-zinc-500">
                      {pipeline.updatedAt === 'Built-in'
                        ? 'Built-in'
                        : `${pipeline.steps} steps • Updated ${pipeline.updatedAt}`}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
};
