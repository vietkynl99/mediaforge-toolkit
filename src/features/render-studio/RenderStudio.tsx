import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  Save, 
  Play, 
  Settings,
  ChevronRight,
  Menu,
  AlertCircle
} from 'lucide-react';
import { 
  VaultFolder, 
  VaultFile, 
  RenderTemplate,
} from '../../types/index';
import { useRenderStudio } from './hooks/useRenderStudio';
import { useRenderStudioUI } from './hooks/useRenderStudioUI';
import { MediaBin } from './components/MediaBin';
import { PreviewPanel } from './components/PreviewPanel';
import { InspectorPanel } from './components/InspectorPanel';
import { Timeline } from './components/Timeline';
import { canBrowserPlayVideo, getVideoMimeType, formatDuration, coerceNumber } from '../../utils/helpers';
import { ConfirmModal } from '../../components/ConfirmModal';

interface RenderStudioProps {
  project: VaultFolder;
  templates: RenderTemplate[];
  onClose: () => void;
  onRunPipeline: (options?: any) => void;
  onSaveTemplate: (payload: any) => Promise<RenderTemplate>;
  onDeleteTemplate: (id: string, name: string) => Promise<void>;
  isSubmitting?: boolean;
}

export const RenderStudio: React.FC<RenderStudioProps> = ({
  project,
  templates,
  onClose,
  onRunPipeline,
  onSaveTemplate,
  onDeleteTemplate,
  isSubmitting = false
}) => {
  const rs = useRenderStudio(project, templates);
  const ui = useRenderStudioUI();
  
  const [templateName, setTemplateName] = useState('');

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) return;
    try {
      const config = rs.configV2;
      if (!config) return;
      await onSaveTemplate({
        id: rs.runPipelineRenderTemplateId === 'custom' ? null : rs.runPipelineRenderTemplateId,
        name: templateName.trim(),
        config
      });
      ui.setTemplateSaveConfirmOpen(false);
      setTemplateName('');
    } catch (error) {
      console.error('Failed to save template', error);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col overflow-hidden text-zinc-100 font-sans">
      {/* Header */}
      <div className="h-14 border-b border-zinc-800 flex items-center justify-between px-4 bg-zinc-900/50 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-4">
          <button 
            onClick={onClose}
            className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 transition-colors"
          >
            <X size={20} />
          </button>
          <div>
            <h2 className="text-sm font-bold text-zinc-100">{project.name}</h2>
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Render Studio</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={() => {
              const current = templates.find(t => t.id === rs.runPipelineRenderTemplateId);
              setTemplateName(current?.name || '');
              ui.setTemplateSaveConfirmOpen(true);
            }}
            className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-semibold transition-colors"
          >
            <Save size={14} />
            Save Template
          </button>
          <button 
            onClick={() => ui.setRenderConfirmOpen(true)}
            disabled={isSubmitting}
            className="flex items-center gap-2 px-4 py-1.5 bg-lime-500 hover:bg-lime-400 text-zinc-950 rounded-lg text-xs font-bold transition-all shadow-[0_0_15px_rgba(132,204,22,0.3)] disabled:opacity-50"
          >
            <Play size={14} fill="currentColor" />
            {isSubmitting ? 'Processing...' : 'Render'}
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar: Media Bin */}
        <MediaBin 
          files={project.files}
          renderInputFileIds={rs.renderInputFileIds}
          renderStudioFocus={rs.renderStudioFocus}
          renderStudioItemType={rs.renderStudioItemType || ''}
          renderVideoId={rs.renderVideoId}
          renderAudioId={rs.renderAudioId}
          renderSubtitleId={rs.renderSubtitleId}
          isOpen={ui.renderStudioMediaBinOpen}
          setIsOpen={ui.setRenderStudioMediaBinOpen}
          onFileClick={rs.addRenderStudioFileToTimeline}
          onFileContextMenu={ui.setRenderStudioMediaBinContextMenu as any}
        />

        {/* Main Content Area: Preview + Timeline */}
        <div className="flex-1 flex flex-col min-w-0 bg-zinc-950">
          <div className="flex-1 flex min-h-0 overflow-hidden relative">
             <PreviewPanel 
               videoFile={rs.renderVideoFile || null}
               focus={rs.renderStudioFocus}
               itemType={rs.renderStudioItemType}
               onResetFocus={() => rs.setRenderStudioFocus('timeline')}
               canPlay={canBrowserPlayVideo}
               getMimeType={getVideoMimeType}
             />
          </div>
          
          {/* Timeline */}
          <Timeline 
            timelineWidth={Math.max(320, rs.renderTimelineViewDuration * 24 * rs.renderTimelineScale)}
            timelineDuration={rs.timelineDuration}
            viewDuration={rs.renderTimelineViewDuration}
            playheadSeconds={rs.renderPlayheadSeconds}
            tickCount={Math.max(4, Math.round(Math.max(320, rs.renderTimelineViewDuration * 24 * rs.renderTimelineScale) / 160))}
            tracks={{
              video: rs.renderVideoFile,
              audio: rs.renderAudioFile,
              subtitle: rs.renderSubtitleFile,
              images: [], // TODO
              textEnabled: rs.renderTextTrackEnabled
            }}
            subtitleLanes={rs.renderSubtitleLanes}
            onTimelineClick={rs.onRenderTimelineClick}
            onTrackClick={(type) => {
              rs.setRenderStudioFocus('item');
              rs.setRenderStudioItemType(type as any);
            }}
            onTrackContextMenu={ui.setRenderStudioTimelineContextMenu as any}
            scrollRef={rs.renderTimelineScrollRef as any}
            formatDuration={formatDuration}
          />
        </div>

        {/* Right Sidebar: Inspector */}
        <InspectorPanel 
          activeSection={(rs.renderStudioItemType === 'output' ? 'timeline' : (rs.renderStudioItemType || 'timeline')) as any}
          renderTemplates={templates}
          selectedTemplateId={rs.runPipelineRenderTemplateId}
          isDirty={rs.isRenderTemplateDirty}
          onTemplateChange={rs.handleRenderTemplateChange}
          onReset={() => rs.runPipelineRenderTemplateId !== 'custom' && rs.restoreRenderTemplateCurrent(templates.find(t => t.id === rs.runPipelineRenderTemplateId)!)}
          onSave={() => ui.setTemplateSaveConfirmOpen(true)}
          onDelete={onDeleteTemplate}
          renderParamsDraft={rs.renderParamsDraft}
          updateParam={rs.updateRenderParamDraft}
          commitParam={rs.commitRenderParamDraftValue}
        />
      </div>

      {/* Modals */}
      <AnimatePresence>
        {ui.renderConfirmOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl"
            >
              <h3 className="text-lg font-bold mb-2">Confirm Render</h3>
              <p className="text-sm text-zinc-400 mb-6">Are you sure you want to start rendering this video? This process might take a few minutes depending on the complexity.</p>
              
              <div className="space-y-4 mb-8">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Start Time</label>
                  <input 
                    type="text" 
                    value={ui.customRenderStart}
                    onChange={(e) => ui.setCustomRenderStart(e.target.value)}
                    className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-lime-500/50"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-zinc-500 uppercase tracking-widest">End Time (Optional)</label>
                  <input 
                    type="text" 
                    placeholder="Full duration"
                    value={ui.customRenderEnd}
                    onChange={(e) => ui.setCustomRenderEnd(e.target.value)}
                    className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-lime-500/50"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => ui.setRenderConfirmOpen(false)}
                  className="flex-1 px-4 py-2 border border-zinc-800 rounded-xl text-sm font-semibold hover:bg-zinc-800 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => {
                    ui.setRenderConfirmOpen(false);
                    onRunPipeline({
                      start: ui.customRenderStart,
                      end: ui.customRenderEnd
                    });
                  }}
                  className="flex-1 px-4 py-2 bg-lime-500 text-zinc-950 rounded-xl text-sm font-bold hover:bg-lime-400 transition-colors"
                >
                  Start Render
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {ui.templateSaveConfirmOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl"
            >
              <h3 className="text-lg font-bold mb-2">Save Template</h3>
              <p className="text-sm text-zinc-400 mb-6">Enter a name for this render template to reuse it later in other projects.</p>
              
              <div className="flex flex-col gap-1 mb-8">
                <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Template Name</label>
                <input 
                  type="text" 
                  autoFocus
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="e.g. My Awesome Preset"
                  className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-lime-500/50"
                />
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => ui.setTemplateSaveConfirmOpen(false)}
                  className="flex-1 px-4 py-2 border border-zinc-800 rounded-xl text-sm font-semibold hover:bg-zinc-800 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSaveTemplate}
                  disabled={!templateName.trim()}
                  className="flex-1 px-4 py-2 bg-lime-500 text-zinc-950 rounded-xl text-sm font-bold hover:bg-lime-400 transition-colors disabled:opacity-50"
                >
                  Save Template
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
