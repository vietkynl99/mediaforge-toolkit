import React from 'react';
import { motion } from 'motion/react';
import { FileVideo, Download, FileAudio, Type, Languages } from 'lucide-react';
import { PipelineSummary, TaskTemplate, RenderTemplate, SavedTaskTemplate } from '../../types';

interface PipelineForgeProps {
  pipelineLibrary: PipelineSummary[];
  availableTasks: TaskTemplate[];
  renderTemplates: RenderTemplate[];
  taskTemplates: SavedTaskTemplate[];
  onOpenPipelinePreview: (pipeline: PipelineSummary) => void;
  onOpenPipelineEditor: (pipeline: PipelineSummary) => void;
  onCreateNewPipeline: () => void;
  onOpenContextMenu: (event: React.MouseEvent, pipeline: PipelineSummary) => void;
  resolvePipelineIcon: (pipeline: PipelineSummary) => any;
  onSelectRenderTemplate?: (template: RenderTemplate) => void;
  onSelectTaskTemplate?: (template: SavedTaskTemplate) => void;
}

const TEMPLATE_TYPE_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  render: FileVideo,
  download: Download,
  uvr: FileAudio,
  tts: Type,
  translate: Languages
};

export const PipelineForge: React.FC<PipelineForgeProps> = ({
  pipelineLibrary,
  availableTasks,
  renderTemplates,
  taskTemplates,
  onOpenPipelinePreview,
  onOpenPipelineEditor,
  onCreateNewPipeline,
  onOpenContextMenu,
  resolvePipelineIcon,
  onSelectRenderTemplate,
  onSelectTaskTemplate
}) => {
  // Separate pipelines: built-in tasks vs saved pipelines
  const taskPipelines = pipelineLibrary.filter(p => p.kind === 'task');
  const savedPipelines = pipelineLibrary.filter(p => p.kind === 'saved');
  const renderPipelineCard = (pipeline: PipelineSummary) => {
    const PipelineIcon = resolvePipelineIcon(pipeline);
    const tooltip = `${pipeline.name}${pipeline.updatedAt !== 'Built-in' ? ` • ${pipeline.steps} steps • ${pipeline.updatedAt}` : ' • Built-in'}`;
    return (
      <div
        key={pipeline.id}
        title={tooltip}
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
        className="group text-left p-3 md:p-4 rounded-lg border border-zinc-800 bg-zinc-900/60 hover:border-lime-500/40 transition-colors flex items-start justify-between gap-3 cursor-pointer"
      >
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="h-8 w-8 md:h-9 md:w-9 rounded-lg border border-zinc-800 bg-zinc-900 flex items-center justify-center shrink-0">
            <PipelineIcon size={16} className="text-zinc-200 md:w-[18px] md:h-[18px]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs md:text-sm font-semibold text-zinc-100 truncate">{pipeline.name}</div>
            <div className="mt-1 md:mt-2 text-[10px] md:text-xs text-zinc-500">
              {pipeline.updatedAt === 'Built-in'
                ? 'Built-in'
                : `${pipeline.steps} steps • ${pipeline.updatedAt}`}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderTemplateCard = (template: RenderTemplate | SavedTaskTemplate, type: 'render' | 'task') => {
    const isRender = type === 'render';
    const Icon = isRender ? FileVideo : (TEMPLATE_TYPE_ICONS[(template as SavedTaskTemplate).taskType ?? ''] ?? Type);
    const name = template.name;
    const updatedAt = isRender ? (template as RenderTemplate).updatedAt : (template as SavedTaskTemplate).updatedAt;
    const taskType = !isRender ? (template as SavedTaskTemplate).taskType : 'render';

    const formatRelativeTime = (dateStr: string): string => {
      if (!dateStr) return '';
      try {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffSec = Math.floor(diffMs / 1000);
        const diffMin = Math.floor(diffSec / 60);
        const diffHour = Math.floor(diffMin / 60);
        const diffDay = Math.floor(diffHour / 24);

        if (diffSec < 60) return 'Just now';
        if (diffMin < 60) return `${diffMin} minute${diffMin > 1 ? 's' : ''} ago`;
        if (diffHour < 24) return `${diffHour} hour${diffHour > 1 ? 's' : ''} ago`;
        if (diffDay < 7) return `${diffDay} day${diffDay > 1 ? 's' : ''} ago`;
        return date.toLocaleDateString();
      } catch {
        return dateStr;
      }
    };

    const tooltip = `${name}\nTask: ${taskType}${updatedAt ? `\nModified: ${formatRelativeTime(updatedAt)}` : ''}`;

    return (
      <div
        key={template.id}
        onClick={() => {
          if (isRender && onSelectRenderTemplate) {
            onSelectRenderTemplate(template as RenderTemplate);
          } else if (!isRender && onSelectTaskTemplate) {
            onSelectTaskTemplate(template as SavedTaskTemplate);
          }
        }}
        role="button"
        tabIndex={0}
        title={tooltip}
        className="group text-left p-3 md:p-4 rounded-lg border border-zinc-800 bg-zinc-900/60 hover:border-lime-500/40 transition-colors flex items-start justify-between gap-3 cursor-pointer overflow-hidden"
      >
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="h-8 w-8 md:h-9 md:w-9 rounded-lg border border-zinc-800 bg-zinc-900 flex items-center justify-center shrink-0">
            <Icon size={16} className="text-zinc-200 md:w-[18px] md:h-[18px]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs md:text-sm font-semibold text-zinc-100 truncate">{name}</div>
            <div className="mt-1 text-[10px] md:text-xs text-zinc-500">
              Task: {taskType}
            </div>
            <div className="text-[10px] text-zinc-500">
              Modified: {formatRelativeTime(updatedAt)}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const totalTemplates = renderTemplates.length + taskTemplates.length;

  return (
    <motion.div
      key="forge"
      initial={false}
      animate={false as any}
      exit={false as any}
      className="p-3 md:p-8 h-full flex flex-col"
    >
      <div className="mb-4 md:mb-8">
        <h2 className="text-xl md:text-2xl font-bold text-zinc-100">Pipeline Forge</h2>
        <p className="text-xs md:text-sm text-zinc-500">Construct a multi-step processing sequence</p>
      </div>

      {/* Two-column layout */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 min-h-0">
        {/* Pipeline List */}
        <div className="bg-zinc-900/30 border border-zinc-800 rounded-xl p-3 md:p-5 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-3 md:mb-4">
            <h3 className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-zinc-500">Pipelines</h3>
            <div className="flex items-center gap-1.5 md:gap-2">
              <span className="text-[10px] text-zinc-500">{taskPipelines.length + savedPipelines.length} total</span>
              <button
                onClick={onCreateNewPipeline}
                className="px-1.5 md:px-3 py-0.5 md:py-1 text-[10px] font-semibold bg-lime-500 text-zinc-950 rounded hover:bg-lime-400 transition-colors"
              >
                + New
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
              {taskPipelines.map(pipeline => renderPipelineCard(pipeline))}
              {savedPipelines.map(pipeline => renderPipelineCard(pipeline))}
            </div>
          </div>
        </div>

        {/* Right: Template List */}
        <div className="bg-zinc-900/30 border border-zinc-800 rounded-xl p-3 md:p-5 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-3 md:mb-4">
            <h3 className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-zinc-500">Templates</h3>
            <span className="text-[10px] text-zinc-500">{totalTemplates} saved</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {totalTemplates === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-zinc-500 py-8">
                <p className="text-sm">No saved templates yet</p>
                <p className="text-xs mt-1">Templates are saved when running pipelines</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                {renderTemplates.map(template => renderTemplateCard(template, 'render'))}
                {taskTemplates.map(template => renderTemplateCard(template, 'task'))}
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};
