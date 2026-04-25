import React from 'react';
import { Menu } from 'lucide-react';

interface RunPipelineUvrConfigProps {
  runPipelineTaskTemplate: Record<string, string>;
  handleTaskTemplateChange: (taskType: string, value: string) => void;
  selectedUvrTemplate: any;
  deleteTaskTemplateWithConfirm: (taskType: string, id: string, name: string) => void;
  isUvrTemplateDirty: boolean;
  getTaskTemplatesForType: (taskType: string) => Array<{ id: string; name: string }>;
  uvrTemplateMenuCloseRef: React.MutableRefObject<number | null>;
  setUvrTemplateMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  uvrTemplateMenuOpen: boolean;
  resetTaskTemplateToDefault: (taskType: string) => void;
  saveTaskTemplateCurrent: (taskType: string, selected: any) => void;
  saveTaskTemplate: (taskType: string) => void;
  restoreTaskTemplateCurrent: (taskType: string, selected: any) => void;
  SHOW_PARAM_PRESETS: boolean;
  hasParamPresets: (taskType: string) => boolean;
  runPipelineParamPreset: Record<string, string>;
  handleParamPresetChange: (taskType: string, value: string) => void;
  getParamPresetsForType: (taskType: string) => Array<{ id: number; label?: string }>;
  switchPresetToManual: (taskType: string) => void;
  getSelectedParamPresetParams: (taskType: string) => Record<string, unknown>;
  formatDefaultValue: (value: unknown) => string;
  isParamOverridden: (taskType: string, key: string, currentValue: unknown) => boolean;
  runPipelineBackend: string;
  setRunPipelineBackend: (value: string) => void;
  vrModel: string;
  setVrModel: (value: string) => void;
  vrModels: string[];
}

export const RunPipelineUvrConfig: React.FC<RunPipelineUvrConfigProps> = ({
  runPipelineTaskTemplate,
  handleTaskTemplateChange,
  selectedUvrTemplate,
  deleteTaskTemplateWithConfirm,
  isUvrTemplateDirty,
  getTaskTemplatesForType,
  uvrTemplateMenuCloseRef,
  setUvrTemplateMenuOpen,
  uvrTemplateMenuOpen,
  resetTaskTemplateToDefault,
  saveTaskTemplateCurrent,
  saveTaskTemplate,
  restoreTaskTemplateCurrent,
  SHOW_PARAM_PRESETS,
  hasParamPresets,
  runPipelineParamPreset,
  handleParamPresetChange,
  getParamPresetsForType,
  switchPresetToManual,
  getSelectedParamPresetParams,
  formatDefaultValue,
  isParamOverridden,
  runPipelineBackend,
  setRunPipelineBackend,
  vrModel,
  setVrModel,
  vrModels
}) => {
  return (
    <div className="border border-zinc-800 rounded-xl p-3 bg-zinc-900/70">
      <div className="text-[11px] text-zinc-500 uppercase tracking-widest mb-2">Block Config: VR (UVR)</div>
      <div className="flex items-center justify-between mb-3">
        <label className="text-[11px] text-zinc-500 uppercase tracking-widest">Template</label>
        <div className="flex items-center gap-2 min-w-0">
          <select
            value={runPipelineTaskTemplate.uvr ?? 'custom'}
            onChange={e => handleTaskTemplateChange('uvr', e.target.value)}
            onContextMenu={event => {
              if (!selectedUvrTemplate) return;
              event.preventDefault();
              deleteTaskTemplateWithConfirm('uvr', selectedUvrTemplate.id, selectedUvrTemplate.name);
            }}
            className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-200 focus:outline-none w-44 sm:w-56"
          >
            <option value="custom">{isUvrTemplateDirty ? '*Custom' : 'Custom'}</option>
            {getTaskTemplatesForType('uvr').map(template => {
              const isSelected = runPipelineTaskTemplate.uvr === template.id;
              const label = isSelected && isUvrTemplateDirty ? `*${template.name}` : template.name;
              return (
                <option key={template.id} value={template.id}>{label}</option>
              );
            })}
          </select>
          <div
            className="relative shrink-0"
            onMouseEnter={() => {
              if (uvrTemplateMenuCloseRef.current) {
                window.clearTimeout(uvrTemplateMenuCloseRef.current);
                uvrTemplateMenuCloseRef.current = null;
              }
              setUvrTemplateMenuOpen(true);
            }}
            onMouseLeave={() => {
              if (uvrTemplateMenuCloseRef.current) {
                window.clearTimeout(uvrTemplateMenuCloseRef.current);
              }
              uvrTemplateMenuCloseRef.current = window.setTimeout(() => {
                setUvrTemplateMenuOpen(false);
                uvrTemplateMenuCloseRef.current = null;
              }, 120);
            }}
            onFocusCapture={() => setUvrTemplateMenuOpen(true)}
            onBlurCapture={event => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setUvrTemplateMenuOpen(false);
              }
            }}
          >
            <button
              type="button"
              aria-label="Template options"
              title="Template options"
              onClick={() => setUvrTemplateMenuOpen(prev => !prev)}
              className="inline-flex items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-xs font-medium text-zinc-200 hover:border-lime-500/50 hover:text-lime-300 shrink-0"
            >
              <Menu size={14} />
            </button>
            {uvrTemplateMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-28 rounded-lg border border-zinc-800 bg-zinc-950 shadow-lg shadow-black/40 z-20">
                <button
                  type="button"
                  onClick={() => {
                    setUvrTemplateMenuOpen(false);
                    resetTaskTemplateToDefault('uvr');
                  }}
                  className={`w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800/90 hover:text-zinc-50 transition-colors ${
                    selectedUvrTemplate || isUvrTemplateDirty ? 'rounded-t-lg' : 'rounded-lg'
                  }`}
                >
                  Reset to default
                </button>
                {selectedUvrTemplate && isUvrTemplateDirty && (
                  <button
                    type="button"
                    onClick={() => {
                      setUvrTemplateMenuOpen(false);
                      saveTaskTemplateCurrent('uvr', selectedUvrTemplate);
                    }}
                    className="w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800/90 hover:text-zinc-50 transition-colors"
                  >
                    Save
                  </button>
                )}
                {(selectedUvrTemplate || isUvrTemplateDirty) && (
                  <button
                    type="button"
                    onClick={() => {
                      setUvrTemplateMenuOpen(false);
                      saveTaskTemplate('uvr');
                    }}
                    className={`w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800/90 hover:text-zinc-50 transition-colors ${
                      selectedUvrTemplate ? '' : 'rounded-b-lg'
                    }`}
                  >
                    Save As
                  </button>
                )}
                {selectedUvrTemplate && isUvrTemplateDirty && (
                  <button
                    type="button"
                    onClick={() => {
                      setUvrTemplateMenuOpen(false);
                      restoreTaskTemplateCurrent('uvr', selectedUvrTemplate);
                    }}
                    className="w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800/90 hover:text-zinc-50 transition-colors"
                  >
                    Restore
                  </button>
                )}
                {selectedUvrTemplate && (
                  <button
                    type="button"
                    onClick={() => {
                      setUvrTemplateMenuOpen(false);
                      deleteTaskTemplateWithConfirm('uvr', selectedUvrTemplate.id, selectedUvrTemplate.name);
                    }}
                    className="w-full px-3 py-2 text-left text-xs rounded-b-lg transition-colors text-red-300 hover:bg-red-500/10 hover:text-red-200"
                  >
                    Delete
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      <>
        {SHOW_PARAM_PRESETS && hasParamPresets('uvr') && (
          <div className="mb-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] text-zinc-500 uppercase tracking-widest">Param Source</label>
              {runPipelineParamPreset.uvr !== 'custom' && null}
            </div>
            <select
              value={runPipelineParamPreset.uvr ?? 'custom'}
              onChange={e => handleParamPresetChange('uvr', e.target.value)}
              className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none"
            >
              <option value="custom">Manual</option>
              {getParamPresetsForType('uvr').map(preset => (
                <option key={preset.id} value={`preset:${preset.id}`}>{preset.label || 'Untitled preset'}</option>
              ))}
            </select>
            {runPipelineParamPreset.uvr !== 'custom' && (
              <div
                role="button"
                tabIndex={0}
                onClick={() => switchPresetToManual('uvr')}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    switchPresetToManual('uvr');
                  }
                }}
                title="Switch to manual and load these params"
                className="border border-zinc-800 rounded-lg p-2.5 bg-zinc-950/40 cursor-pointer hover:border-lime-500/40 transition-colors"
              >
                <div className="mt-2 grid gap-1 text-[11px] text-zinc-400">
                  {Object.entries(getSelectedParamPresetParams('uvr')).map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between gap-2">
                      <span className="font-mono text-zinc-500">{key}</span>
                      <span className="truncate text-zinc-300">{formatDefaultValue(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {(!SHOW_PARAM_PRESETS || runPipelineParamPreset.uvr === 'custom') && (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label className="text-[11px] text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                Backend
                {isParamOverridden('uvr', 'backend', runPipelineBackend) && (
                  <span className="text-[9px] text-amber-300 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded-md">
                    Overridden
                  </span>
                )}
              </label>
              <input
                list="uvr-backends"
                value={runPipelineBackend}
                onChange={e => setRunPipelineBackend(e.target.value)}
                className={`bg-zinc-900 border rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none ${
                  isParamOverridden('uvr', 'backend', runPipelineBackend) ? 'border-amber-500/60' : 'border-zinc-800'
                }`}
                placeholder="vr"
              />
              {SHOW_PARAM_PRESETS && runPipelineParamPreset.uvr !== 'custom' && getSelectedParamPresetParams('uvr').backend !== undefined && (
                <div className="text-[10px] text-zinc-500">
                  Loaded: {formatDefaultValue(getSelectedParamPresetParams('uvr').backend)}
                </div>
              )}
              <datalist id="uvr-backends">
                <option value="vr" />
                <option value="mdx" />
                <option value="demucs" />
              </datalist>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-[11px] text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                Model
                {isParamOverridden('uvr', 'model', vrModel) && (
                  <span className="text-[9px] text-amber-300 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded-md">
                    Overridden
                  </span>
                )}
              </label>
              {vrModels.length ? (
                <select
                  value={vrModel}
                  onChange={e => setVrModel(e.target.value)}
                  className={`bg-zinc-900 border rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none ${
                    isParamOverridden('uvr', 'model', vrModel) ? 'border-amber-500/60' : 'border-zinc-800'
                  }`}
                >
                  {vrModels.map(model => (
                    <option key={model} value={model}>{model}</option>
                  ))}
                </select>
              ) : (
                <input
                  value={vrModel}
                  onChange={e => setVrModel(e.target.value)}
                  className={`bg-zinc-900 border rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none ${
                    isParamOverridden('uvr', 'model', vrModel) ? 'border-amber-500/60' : 'border-zinc-800'
                  }`}
                  placeholder="MGM_MAIN_v4.pth"
                />
              )}
              {SHOW_PARAM_PRESETS && runPipelineParamPreset.uvr !== 'custom' && getSelectedParamPresetParams('uvr').model !== undefined && (
                <div className="text-[10px] text-zinc-500">
                  Loaded: {formatDefaultValue(getSelectedParamPresetParams('uvr').model)}
                </div>
              )}
            </div>
          </div>
        )}
      </>
    </div>
  );
};
