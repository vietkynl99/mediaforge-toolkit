import React from 'react';
import { Menu } from 'lucide-react';

interface RunPipelineRenderConfigProps {
  runPipelineHasRender: boolean;
  renderTemplates: any[];
  runPipelineRenderTemplateId: string;
  handleRenderTemplateChange: (id: string) => void;
  selectedRenderTemplate: any;
  deleteRenderTemplateWithConfirm: (id: string, name: string) => void;
  isRenderTemplateDirty: boolean;
  newJobRenderTemplateMenuCloseRef: React.MutableRefObject<number | null>;
  setNewJobRenderTemplateMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  newJobRenderTemplateMenuOpen: boolean;
  resetRenderToDefault: () => void;
  isCustomRenderTemplate: boolean;
  saveRenderTemplateCurrent: (template: any) => void;
  saveRenderTemplateQuick: () => void;
  restoreRenderTemplateCurrent: (template: any) => void;
  renderTemplateSummary: any;
}

export const RunPipelineRenderConfig: React.FC<RunPipelineRenderConfigProps> = ({
  runPipelineHasRender,
  renderTemplates,
  runPipelineRenderTemplateId,
  handleRenderTemplateChange,
  selectedRenderTemplate,
  deleteRenderTemplateWithConfirm,
  isRenderTemplateDirty,
  newJobRenderTemplateMenuCloseRef,
  setNewJobRenderTemplateMenuOpen,
  newJobRenderTemplateMenuOpen,
  resetRenderToDefault,
  isCustomRenderTemplate,
  saveRenderTemplateCurrent,
  saveRenderTemplateQuick,
  restoreRenderTemplateCurrent,
  renderTemplateSummary
}) => {
  if (!runPipelineHasRender || renderTemplates.length === 0) return null;

  return (
    <div className="border border-zinc-800 rounded-xl p-3 bg-zinc-900/70">
      <div className="text-[11px] text-zinc-500 uppercase tracking-widest mb-2">Block Config: Render</div>
      <div className="flex items-center justify-between">
        <label className="text-[11px] text-zinc-500 uppercase tracking-widest">Template</label>
        <div className="flex items-center gap-2 min-w-0">
          <select
            value={runPipelineRenderTemplateId}
            onChange={e => handleRenderTemplateChange(e.target.value)}
            onContextMenu={event => {
              if (runPipelineRenderTemplateId === 'custom' || !selectedRenderTemplate) return;
              event.preventDefault();
              deleteRenderTemplateWithConfirm(selectedRenderTemplate.id, selectedRenderTemplate.name);
            }}
            className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-200 focus:outline-none w-44 sm:w-56"
          >
            <option value="custom">Custom</option>
            {renderTemplates.map(template => {
              const isSelected = runPipelineRenderTemplateId === template.id;
              const label = isSelected && isRenderTemplateDirty ? `*${template.name}` : template.name;
              return (
                <option key={template.id} value={template.id}>{label}</option>
              );
            })}
          </select>
          <div
            className="relative shrink-0"
            onMouseEnter={() => {
              if (newJobRenderTemplateMenuCloseRef.current) {
                window.clearTimeout(newJobRenderTemplateMenuCloseRef.current);
                newJobRenderTemplateMenuCloseRef.current = null;
              }
              setNewJobRenderTemplateMenuOpen(true);
            }}
            onMouseLeave={() => {
              if (newJobRenderTemplateMenuCloseRef.current) {
                window.clearTimeout(newJobRenderTemplateMenuCloseRef.current);
              }
              newJobRenderTemplateMenuCloseRef.current = window.setTimeout(() => {
                setNewJobRenderTemplateMenuOpen(false);
                newJobRenderTemplateMenuCloseRef.current = null;
              }, 120);
            }}
            onFocusCapture={() => setNewJobRenderTemplateMenuOpen(true)}
            onBlurCapture={event => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setNewJobRenderTemplateMenuOpen(false);
              }
            }}
          >
            <button
              type="button"
              aria-label="Template options"
              title="Template options"
              onClick={() => setNewJobRenderTemplateMenuOpen(prev => !prev)}
              className="inline-flex items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-xs font-medium text-zinc-200 hover:border-lime-500/50 hover:text-lime-300 shrink-0"
            >
              <Menu size={14} />
            </button>
            {newJobRenderTemplateMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-28 rounded-lg border border-zinc-800 bg-zinc-950 shadow-lg shadow-black/40 z-20">
                <button
                  type="button"
                  onClick={() => {
                    setNewJobRenderTemplateMenuOpen(false);
                    resetRenderToDefault();
                  }}
                  className={`w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800/90 hover:text-zinc-50 transition-colors ${
                    isCustomRenderTemplate ? 'rounded-lg' : 'rounded-t-lg'
                  }`}
                >
                  Reset to default
                </button>
                {!isCustomRenderTemplate && isRenderTemplateDirty && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!selectedRenderTemplate) return;
                      setNewJobRenderTemplateMenuOpen(false);
                      saveRenderTemplateCurrent(selectedRenderTemplate);
                    }}
                    className="w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800/90 hover:text-zinc-50 transition-colors"
                  >
                    Save
                  </button>
                )}
                {!isCustomRenderTemplate && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setNewJobRenderTemplateMenuOpen(false);
                        saveRenderTemplateQuick();
                      }}
                      className="w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800/90 hover:text-zinc-50 transition-colors"
                    >
                      Save As
                    </button>
                    {isRenderTemplateDirty && (
                      <button
                        type="button"
                        onClick={() => {
                          if (!selectedRenderTemplate) return;
                          setNewJobRenderTemplateMenuOpen(false);
                          restoreRenderTemplateCurrent(selectedRenderTemplate);
                        }}
                        className="w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800/90 hover:text-zinc-50 transition-colors"
                      >
                        Restore
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (!selectedRenderTemplate) return;
                        setNewJobRenderTemplateMenuOpen(false);
                        deleteRenderTemplateWithConfirm(selectedRenderTemplate.id, selectedRenderTemplate.name);
                      }}
                      className="w-full px-3 py-2 text-left text-xs rounded-b-lg transition-colors text-red-300 hover:bg-red-500/10 hover:text-red-200"
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      {renderTemplateSummary && (
        <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-2.5 text-[11px] text-zinc-400">
          <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2">Template Summary</div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center justify-between">
              <span>Resolution</span>
              <span className="text-zinc-200">{renderTemplateSummary.resolution}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Framerate</span>
              <span className="text-zinc-200">{renderTemplateSummary.framerate}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Target LUFS</span>
              <span className="text-zinc-200">{renderTemplateSummary.targetLufs ?? '--'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Placeholders</span>
              <span className="text-zinc-200">
                {`${renderTemplateSummary.placeholderCounts.video} video, ${renderTemplateSummary.placeholderCounts.audio} audio, ${renderTemplateSummary.placeholderCounts.subtitle} subtitle, ${renderTemplateSummary.placeholderCounts.image} images`}
              </span>
            </div>
          </div>
          <div className="mt-2">
            <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Effects</div>
            {Object.keys(renderTemplateSummary.effectCounts).length === 0 ? (
              <div className="text-zinc-500">None</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {Object.entries(renderTemplateSummary.effectCounts).map(([type, count]) => (
                  <div key={type} className="px-2 py-1 rounded-md border border-zinc-800 bg-zinc-900 text-zinc-200">
                    {type} × {count as React.ReactNode}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
