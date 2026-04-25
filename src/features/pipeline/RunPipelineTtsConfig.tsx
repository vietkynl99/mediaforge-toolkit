import React from 'react';
import { Menu } from 'lucide-react';

interface RunPipelineTtsConfigProps {
  runPipelineTaskTemplate: Record<string, string>;
  handleTaskTemplateChange: (taskType: string, value: string) => void;
  selectedTtsTemplate: any;
  deleteTaskTemplateWithConfirm: (taskType: string, id: string, name: string) => void;
  isTtsTemplateDirty: boolean;
  getTaskTemplatesForType: (taskType: string) => Array<{ id: string; name: string }>;
  ttsTemplateMenuCloseRef: React.MutableRefObject<number | null>;
  setTtsTemplateMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  ttsTemplateMenuOpen: boolean;
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
  runPipelineTtsVoice: string;
  setRunPipelineTtsVoice: (value: string) => void;
  runPipelineTtsOverlapMode: 'truncate' | 'overlap';
  setRunPipelineTtsOverlapMode: (value: 'truncate' | 'overlap') => void;
  runPipelineTtsRate: string;
  setRunPipelineTtsRate: (value: string) => void;
  runPipelineTtsPitch: string;
  setRunPipelineTtsPitch: (value: string) => void;
  runPipelineTtsRemoveLineBreaks: boolean;
  setRunPipelineTtsRemoveLineBreaks: (value: boolean) => void;
  PREFERRED_TTS_VOICES: string[];
}

export const RunPipelineTtsConfig: React.FC<RunPipelineTtsConfigProps> = ({
  runPipelineTaskTemplate,
  handleTaskTemplateChange,
  selectedTtsTemplate,
  deleteTaskTemplateWithConfirm,
  isTtsTemplateDirty,
  getTaskTemplatesForType,
  ttsTemplateMenuCloseRef,
  setTtsTemplateMenuOpen,
  ttsTemplateMenuOpen,
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
  runPipelineTtsVoice,
  setRunPipelineTtsVoice,
  runPipelineTtsOverlapMode,
  setRunPipelineTtsOverlapMode,
  runPipelineTtsRate,
  setRunPipelineTtsRate,
  runPipelineTtsPitch,
  setRunPipelineTtsPitch,
  runPipelineTtsRemoveLineBreaks,
  setRunPipelineTtsRemoveLineBreaks,
  PREFERRED_TTS_VOICES
}) => {
  return (
    <div className="border border-zinc-800 rounded-xl p-3 bg-zinc-900/70">
      <div className="text-[11px] text-zinc-500 uppercase tracking-widest mb-2">Block Config: TTS</div>
      <div className="flex items-center justify-between mb-3">
        <label className="text-[11px] text-zinc-500 uppercase tracking-widest">Template</label>
        <div className="flex items-center gap-2 min-w-0">
          <select
            value={runPipelineTaskTemplate.tts ?? 'custom'}
            onChange={e => handleTaskTemplateChange('tts', e.target.value)}
            onContextMenu={event => {
              if (!selectedTtsTemplate) return;
              event.preventDefault();
              deleteTaskTemplateWithConfirm('tts', selectedTtsTemplate.id, selectedTtsTemplate.name);
            }}
            className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-200 focus:outline-none w-44 sm:w-56"
          >
            <option value="custom">{isTtsTemplateDirty ? '*Custom' : 'Custom'}</option>
            {getTaskTemplatesForType('tts').map(template => {
              const isSelected = runPipelineTaskTemplate.tts === template.id;
              const label = isSelected && isTtsTemplateDirty ? `*${template.name}` : template.name;
              return (
                <option key={template.id} value={template.id}>{label}</option>
              );
            })}
          </select>
          <div
            className="relative shrink-0"
            onMouseEnter={() => {
              if (ttsTemplateMenuCloseRef.current) {
                window.clearTimeout(ttsTemplateMenuCloseRef.current);
                ttsTemplateMenuCloseRef.current = null;
              }
              setTtsTemplateMenuOpen(true);
            }}
            onMouseLeave={() => {
              if (ttsTemplateMenuCloseRef.current) {
                window.clearTimeout(ttsTemplateMenuCloseRef.current);
              }
              ttsTemplateMenuCloseRef.current = window.setTimeout(() => {
                setTtsTemplateMenuOpen(false);
                ttsTemplateMenuCloseRef.current = null;
              }, 120);
            }}
            onFocusCapture={() => setTtsTemplateMenuOpen(true)}
            onBlurCapture={event => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setTtsTemplateMenuOpen(false);
              }
            }}
          >
            <button
              type="button"
              aria-label="Template options"
              title="Template options"
              onClick={() => setTtsTemplateMenuOpen(prev => !prev)}
              className="inline-flex items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-xs font-medium text-zinc-200 hover:border-lime-500/50 hover:text-lime-300 shrink-0"
            >
              <Menu size={14} />
            </button>
            {ttsTemplateMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-28 rounded-lg border border-zinc-800 bg-zinc-950 shadow-lg shadow-black/40 z-20">
                <button
                  type="button"
                  onClick={() => {
                    setTtsTemplateMenuOpen(false);
                    resetTaskTemplateToDefault('tts');
                  }}
                  className={`w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800/90 hover:text-zinc-50 transition-colors ${
                    selectedTtsTemplate || isTtsTemplateDirty ? 'rounded-t-lg' : 'rounded-lg'
                  }`}
                >
                  Reset to default
                </button>
                {selectedTtsTemplate && isTtsTemplateDirty && (
                  <button
                    type="button"
                    onClick={() => {
                      setTtsTemplateMenuOpen(false);
                      saveTaskTemplateCurrent('tts', selectedTtsTemplate);
                    }}
                    className="w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800/90 hover:text-zinc-50 transition-colors"
                  >
                    Save
                  </button>
                )}
                {(selectedTtsTemplate || isTtsTemplateDirty) && (
                  <button
                    type="button"
                    onClick={() => {
                      setTtsTemplateMenuOpen(false);
                      saveTaskTemplate('tts');
                    }}
                    className={`w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800/90 hover:text-zinc-50 transition-colors ${
                      selectedTtsTemplate ? '' : 'rounded-b-lg'
                    }`}
                  >
                    Save As
                  </button>
                )}
                {selectedTtsTemplate && isTtsTemplateDirty && (
                  <button
                    type="button"
                    onClick={() => {
                      setTtsTemplateMenuOpen(false);
                      restoreTaskTemplateCurrent('tts', selectedTtsTemplate);
                    }}
                    className="w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800/90 hover:text-zinc-50 transition-colors"
                  >
                    Restore
                  </button>
                )}
                {selectedTtsTemplate && (
                  <button
                    type="button"
                    onClick={() => {
                      setTtsTemplateMenuOpen(false);
                      deleteTaskTemplateWithConfirm('tts', selectedTtsTemplate.id, selectedTtsTemplate.name);
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
        {SHOW_PARAM_PRESETS && hasParamPresets('tts') && (
          <div className="mb-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] text-zinc-500 uppercase tracking-widest">Param Source</label>
              {runPipelineParamPreset.tts !== 'custom' && null}
            </div>
            <select
              value={runPipelineParamPreset.tts ?? 'custom'}
              onChange={e => handleParamPresetChange('tts', e.target.value)}
              className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none"
            >
              <option value="custom">Manual</option>
              {getParamPresetsForType('tts').map(preset => (
                <option key={preset.id} value={`preset:${preset.id}`}>{preset.label || 'Untitled preset'}</option>
              ))}
            </select>
            {runPipelineParamPreset.tts !== 'custom' && (
              <div
                role="button"
                tabIndex={0}
                onClick={() => switchPresetToManual('tts')}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    switchPresetToManual('tts');
                  }
                }}
                title="Switch to manual and load these params"
                className="border border-zinc-800 rounded-lg p-2.5 bg-zinc-950/40 cursor-pointer hover:border-lime-500/40 transition-colors"
              >
                <div className="mt-2 grid gap-1 text-[11px] text-zinc-400">
                  {Object.entries(getSelectedParamPresetParams('tts')).map(([key, value]) => (
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
        {(!SHOW_PARAM_PRESETS || runPipelineParamPreset.tts === 'custom') && (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label className="text-[11px] text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                Voice
                {isParamOverridden('tts', 'voice', runPipelineTtsVoice) && (
                  <span className="text-[9px] text-amber-300 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded-md">
                    Overridden
                  </span>
                )}
              </label>
              <select
                value={runPipelineTtsVoice}
                onChange={e => setRunPipelineTtsVoice(e.target.value)}
                className={`bg-zinc-900 border rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none ${
                  isParamOverridden('tts', 'voice', runPipelineTtsVoice) ? 'border-amber-500/60' : 'border-zinc-800'
                }`}
              >
                {PREFERRED_TTS_VOICES.map(name => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              {SHOW_PARAM_PRESETS && runPipelineParamPreset.tts !== 'custom' && getSelectedParamPresetParams('tts').voice !== undefined && (
                <div className="text-[10px] text-zinc-500">
                  Loaded: {formatDefaultValue(getSelectedParamPresetParams('tts').voice)}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-[11px] text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                Long Cue
                {isParamOverridden('tts', 'overlapMode', runPipelineTtsOverlapMode) && (
                  <span className="text-[9px] text-amber-300 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded-md">
                    Overridden
                  </span>
                )}
              </label>
              <select
                value={runPipelineTtsOverlapMode}
                onChange={e => setRunPipelineTtsOverlapMode(e.target.value as 'truncate' | 'overlap')}
                className={`bg-zinc-900 border rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none ${
                  isParamOverridden('tts', 'overlapMode', runPipelineTtsOverlapMode) ? 'border-amber-500/60' : 'border-zinc-800'
                }`}
              >
                <option value="overlap">Overlap voices</option>
                <option value="truncate">Cut previous voice (truncate)</option>
              </select>
              {SHOW_PARAM_PRESETS && runPipelineParamPreset.tts !== 'custom' && getSelectedParamPresetParams('tts').overlapMode !== undefined && (
                <div className="text-[10px] text-zinc-500">
                  Loaded: {formatDefaultValue(getSelectedParamPresetParams('tts').overlapMode)}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-[11px] text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                Rate
                {isParamOverridden('tts', 'rate', runPipelineTtsRate) && (
                  <span className="text-[9px] text-amber-300 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded-md">
                    Overridden
                  </span>
                )}
              </label>
              <input
                type="number"
                step="0.1"
                value={runPipelineTtsRate}
                onChange={e => setRunPipelineTtsRate(e.target.value)}
                placeholder="1.0"
                className={`bg-zinc-900 border rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none ${
                  isParamOverridden('tts', 'rate', runPipelineTtsRate) ? 'border-amber-500/60' : 'border-zinc-800'
                }`}
              />
              {SHOW_PARAM_PRESETS && runPipelineParamPreset.tts !== 'custom' && getSelectedParamPresetParams('tts').rate !== undefined && (
                <div className="text-[10px] text-zinc-500">
                  Loaded: {formatDefaultValue(getSelectedParamPresetParams('tts').rate)}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-[11px] text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                Pitch
                {isParamOverridden('tts', 'pitch', runPipelineTtsPitch) && (
                  <span className="text-[9px] text-amber-300 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded-md">
                    Overridden
                  </span>
                )}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.1"
                  value={runPipelineTtsPitch}
                  onChange={e => setRunPipelineTtsPitch(e.target.value)}
                  placeholder="0"
                  className={`flex-1 bg-zinc-900 border rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none ${
                    isParamOverridden('tts', 'pitch', runPipelineTtsPitch) ? 'border-amber-500/60' : 'border-zinc-800'
                  }`}
                />
                <span className="text-xs text-zinc-500">st</span>
              </div>
              {SHOW_PARAM_PRESETS && runPipelineParamPreset.tts !== 'custom' && getSelectedParamPresetParams('tts').pitch !== undefined && (
                <div className="text-[10px] text-zinc-500">
                  Loaded: {formatDefaultValue(getSelectedParamPresetParams('tts').pitch)}
                </div>
              )}
            </div>
            <label className="flex items-center gap-2 text-xs text-zinc-300">
              <input
                type="checkbox"
                checked={runPipelineTtsRemoveLineBreaks}
                onChange={e => setRunPipelineTtsRemoveLineBreaks(e.target.checked)}
                className="accent-lime-400"
              />
              <span className="flex items-center gap-2">
                Remove line breaks
                {isParamOverridden('tts', 'removeLineBreaks', runPipelineTtsRemoveLineBreaks) && (
                  <span className="text-[9px] text-amber-300 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded-md">
                    Overridden
                  </span>
                )}
              </span>
            </label>
            {SHOW_PARAM_PRESETS && runPipelineParamPreset.tts !== 'custom' && getSelectedParamPresetParams('tts').removeLineBreaks !== undefined && (
              <div className="text-[10px] text-zinc-500">
                Loaded: {formatDefaultValue(getSelectedParamPresetParams('tts').removeLineBreaks)}
              </div>
            )}
          </div>
        )}
      </>
    </div>
  );
};
