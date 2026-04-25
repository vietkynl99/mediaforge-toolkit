import React from 'react';
import { X } from 'lucide-react';
import { RunPipelineInputsSection } from './RunPipelineInputsSection';
import { RunPipelineRenderConfig } from './RunPipelineRenderConfig';
import { RunPipelineDownloadConfig } from './RunPipelineDownloadConfig';
import { RunPipelineUvrConfig } from './RunPipelineUvrConfig';
import { RunPipelineTtsConfig } from './RunPipelineTtsConfig';

interface RunPipelineModalProps {
  open: boolean;
  onClose: () => void;
  isNewJobProjectLoading: boolean;
  runPipelineHasRender: boolean;
  runPipelineProject: any;
  runPipelineSubmitting: boolean;
  onOpenPreview: () => void;
  onRun: () => void;
  runPipelineHasDownload: boolean;
  runPipelineHasUvr: boolean;
  runPipelineHasTts: boolean;
  downloadAnalyzeLoading: boolean;
  downloadUrl: string;
  analyzeYtDlp: () => void;
  inputsSectionProps: React.ComponentProps<typeof RunPipelineInputsSection>;
  renderConfigProps: React.ComponentProps<typeof RunPipelineRenderConfig>;
  downloadConfigProps: React.ComponentProps<typeof RunPipelineDownloadConfig>;
  uvrConfigProps: React.ComponentProps<typeof RunPipelineUvrConfig>;
  ttsConfigProps: React.ComponentProps<typeof RunPipelineTtsConfig>;
}

export const RunPipelineModal: React.FC<RunPipelineModalProps> = ({
  open,
  onClose,
  isNewJobProjectLoading,
  runPipelineHasRender,
  runPipelineProject,
  runPipelineSubmitting,
  onOpenPreview,
  onRun,
  runPipelineHasDownload,
  runPipelineHasUvr,
  runPipelineHasTts,
  downloadAnalyzeLoading,
  downloadUrl,
  analyzeYtDlp,
  inputsSectionProps,
  renderConfigProps,
  downloadConfigProps,
  uvrConfigProps,
  ttsConfigProps
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative w-[min(700px,92vw)] max-h-[85vh] bg-zinc-900/95 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-4 shadow-2xl overflow-y-auto">
        <div className="flex items-center justify-between">
          <div className="text-xs text-zinc-500 uppercase tracking-widest">New Job</div>
          <div className="flex items-center gap-2">
            {!isNewJobProjectLoading && runPipelineHasRender && (
              <button
                onClick={onOpenPreview}
                disabled={!runPipelineProject}
                className="px-3 py-1.5 text-xs font-semibold border border-zinc-800 rounded-lg text-zinc-200 hover:border-lime-500/50 hover:text-lime-300 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Preview
              </button>
            )}
            {!isNewJobProjectLoading && (
              <button
                onClick={onRun}
                disabled={runPipelineSubmitting}
                className="px-3 py-1.5 bg-lime-500 text-zinc-950 rounded-lg text-xs font-semibold hover:bg-lime-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {runPipelineSubmitting ? 'Queuing...' : 'Run'}
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-zinc-400 hover:text-zinc-100 border border-zinc-800 rounded-lg hover:border-zinc-700"
              aria-label="Close"
            >
              <X size={14} />
            </button>
          </div>
        </div>
        {isNewJobProjectLoading && (
          <div className="absolute inset-x-0 top-14 bottom-0 z-20 bg-zinc-900/95 rounded-b-2xl flex items-center justify-center">
            <div className="text-sm text-zinc-400">Loading project...</div>
          </div>
        )}

        <RunPipelineInputsSection {...inputsSectionProps} />
        <RunPipelineRenderConfig {...renderConfigProps} />
        {runPipelineHasDownload && <RunPipelineDownloadConfig {...downloadConfigProps} />}
        {runPipelineHasUvr && <RunPipelineUvrConfig {...uvrConfigProps} />}
        {runPipelineHasTts && <RunPipelineTtsConfig {...ttsConfigProps} />}

        {runPipelineHasDownload && (
          <button
            onClick={analyzeYtDlp}
            disabled={downloadAnalyzeLoading || !downloadUrl.trim()}
            className="w-full px-3 py-2 text-xs font-semibold border border-zinc-800 rounded-lg text-zinc-200 hover:border-lime-500/50 hover:text-lime-300 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {downloadAnalyzeLoading ? 'Analyzing...' : 'Analyze URL'}
          </button>
        )}
      </div>
    </div>
  );
};
