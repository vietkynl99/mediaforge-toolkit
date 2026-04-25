import React from 'react';
import { Menu } from 'lucide-react';
import { useRenderStudioPage } from '../../RenderStudioPageContext';

export const InspectorTemplatePanel: React.FC = () => {
  const ctx = useRenderStudioPage();
  const {
    renderStudioFocus,
    runPipelineRenderTemplateId,
    handleRenderTemplateChange,
    renderTemplates,
    deleteRenderTemplateWithConfirm,
    resetRenderToDefault,
    restoreRenderTemplateCurrent,
    saveRenderTemplateQuick,
    renderTemplateDiffBaselineLabel
  } = ctx;

  const local = ctx.local ?? {};
  const {
    templateMenuOpen,
    setTemplateMenuOpen,
    templateMenuRef,
    templateDiffOpen,
    setTemplateDiffOpen,
    isCustomTemplate,
    isRenderTemplateDirty,
    hasTemplateChanges,
    selectedTemplate,
    requestSaveTemplateConfirm,
    templateDiffRows,
    formatDiffValue,
    getTemplateDiffTrackLabel
  } = local as Record<string, any>;

  if (renderStudioFocus !== 'timeline') return null;

  return (
    <>
      <div className="text-[10px] text-zinc-500 uppercase tracking-widest">Template</div>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={runPipelineRenderTemplateId}
            onChange={e => handleRenderTemplateChange(e.target.value)}
            onContextMenu={event => {
              if (runPipelineRenderTemplateId === 'custom' || !selectedTemplate) return;
              event.preventDefault();
              deleteRenderTemplateWithConfirm(selectedTemplate.id, selectedTemplate.name);
            }}
            className="min-h-[36px] flex-1 min-w-[12rem] rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-lime-500/40"
          >
            <option value="custom">Custom</option>
            {renderTemplates.map((template: any) => {
              const isSelected = runPipelineRenderTemplateId === template.id;
              const label = isSelected && isRenderTemplateDirty ? `*${template.name}` : template.name;
              return (
                <option key={template.id} value={template.id}>
                  {label}
                </option>
              );
            })}
          </select>
          <div className="relative shrink-0" ref={templateMenuRef}>
            <button
              type="button"
              aria-label="Template options"
              title="Template options"
              aria-expanded={Boolean(templateMenuOpen)}
              onClick={() => setTemplateMenuOpen?.((prev: boolean) => !prev)}
              className="inline-flex items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-xs font-medium text-zinc-200 hover:border-lime-500/50 hover:text-lime-300 shrink-0"
            >
              <Menu size={14} />
            </button>
            {templateMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-28 rounded-lg border border-zinc-800 bg-zinc-950 shadow-lg shadow-black/40 z-20">
                <button
                  type="button"
                  onClick={() => {
                    setTemplateMenuOpen?.(false);
                    resetRenderToDefault?.();
                  }}
                  className={`w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800/90 hover:text-zinc-50 transition-colors ${
                    isCustomTemplate ? 'rounded-lg' : 'rounded-t-lg'
                  }`}
                >
                  Reset to default
                </button>
                {(isRenderTemplateDirty || hasTemplateChanges) && (
                  <button
                    type="button"
                    onClick={() => {
                      setTemplateMenuOpen?.(false);
                      setTemplateDiffOpen?.(true);
                    }}
                    className="w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800/90 hover:text-zinc-50 transition-colors"
                  >
                    Show changes
                  </button>
                )}
                {!isCustomTemplate && isRenderTemplateDirty && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!selectedTemplate) return;
                      setTemplateMenuOpen?.(false);
                      requestSaveTemplateConfirm?.();
                    }}
                    className="w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800/90 hover:text-zinc-50 transition-colors"
                  >
                    Save
                  </button>
                )}
                {!isCustomTemplate && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setTemplateMenuOpen?.(false);
                        saveRenderTemplateQuick?.();
                      }}
                      className="w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800/90 hover:text-zinc-50 transition-colors"
                    >
                      Save As
                    </button>
                    {isRenderTemplateDirty && (
                      <button
                        type="button"
                        onClick={() => {
                          if (!selectedTemplate) return;
                          setTemplateMenuOpen?.(false);
                          restoreRenderTemplateCurrent?.(selectedTemplate);
                        }}
                        className="w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800/90 hover:text-zinc-50 transition-colors"
                      >
                        Restore
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (!selectedTemplate) return;
                        setTemplateMenuOpen?.(false);
                        deleteRenderTemplateWithConfirm?.(selectedTemplate.id, selectedTemplate.name);
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

      {templateDiffOpen && (
        <div
          className="fixed inset-0 z-[80] bg-zinc-950/70 flex items-center justify-center p-4"
          onClick={() => setTemplateDiffOpen?.(false)}
        >
          <div
            className="w-full max-w-5xl max-h-[85vh] rounded-xl border border-zinc-800 bg-zinc-950 shadow-xl flex flex-col overflow-hidden"
            onClick={event => event.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-zinc-100">Template Changes</div>
                <div className="text-xs text-zinc-400 truncate">Comparing current config with {renderTemplateDiffBaselineLabel}</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (isCustomTemplate) {
                      saveRenderTemplateQuick?.();
                    } else if (selectedTemplate) {
                      requestSaveTemplateConfirm?.();
                    }
                    if (isCustomTemplate) setTemplateDiffOpen?.(false);
                  }}
                  className="px-2.5 py-1 text-xs rounded-md border border-lime-600/70 text-lime-300 hover:text-lime-200 hover:border-lime-500"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (isCustomTemplate) {
                      resetRenderToDefault?.();
                    } else if (selectedTemplate) {
                      restoreRenderTemplateCurrent?.(selectedTemplate);
                    }
                    setTemplateDiffOpen?.(false);
                  }}
                  className="px-2.5 py-1 text-xs rounded-md border border-amber-600/70 text-amber-300 hover:text-amber-200 hover:border-amber-500"
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={() => setTemplateDiffOpen?.(false)}
                  className="px-2.5 py-1 text-xs rounded-md border border-zinc-700 text-zinc-300 hover:text-zinc-100 hover:border-zinc-600"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="px-4 py-2 text-xs text-zinc-500 border-b border-zinc-800">
              {Array.isArray(templateDiffRows) ? templateDiffRows.length : 0} change{Array.isArray(templateDiffRows) && templateDiffRows.length === 1 ? '' : 's'}
            </div>
            <div className="overflow-auto">
              {!Array.isArray(templateDiffRows) || templateDiffRows.length === 0 ? (
                <div className="px-4 py-6 text-sm text-zinc-400">No differences.</div>
              ) : (
                <table className="w-full table-fixed border-collapse text-xs">
                  <thead className="sticky top-0 bg-zinc-900/95 text-zinc-400">
                    <tr>
                      <th className="text-left font-medium px-3 py-2 border-b border-zinc-800 w-[24%]">Path</th>
                      <th className="text-left font-medium px-3 py-2 border-b border-zinc-800 w-[16%]">Track name</th>
                      <th className="text-left font-medium px-3 py-2 border-b border-zinc-800 w-[30%]">{renderTemplateDiffBaselineLabel}</th>
                      <th className="text-left font-medium px-3 py-2 border-b border-zinc-800 w-[30%]">Current</th>
                    </tr>
                  </thead>
                  <tbody>
                    {templateDiffRows.map((row: any, idx: number) => (
                      <tr key={`${row.path}-${idx}`} className="align-top border-b border-zinc-800/70">
                        <td className="px-3 py-2 font-mono text-zinc-300 break-all">{row.path}</td>
                        <td className="px-3 py-2 text-zinc-300 break-all">{getTemplateDiffTrackLabel?.(row.path)}</td>
                        <td className="px-3 py-2 text-zinc-400 whitespace-pre-wrap break-all">{formatDiffValue?.(row.before)}</td>
                        <td className="px-3 py-2 text-zinc-200 whitespace-pre-wrap break-all">{formatDiffValue?.(row.after)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
