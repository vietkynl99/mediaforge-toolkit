import React from 'react';
import { Menu } from 'lucide-react';

interface RunPipelineDownloadConfigProps {
  runPipelineTaskTemplate: Record<string, string>;
  handleTaskTemplateChange: (taskType: string, value: string) => void;
  selectedDownloadTemplate: any;
  deleteTaskTemplateWithConfirm: (taskType: string, id: string, name: string) => void;
  isDownloadTemplateDirty: boolean;
  getTaskTemplatesForType: (taskType: string) => Array<{ id: string; name: string }>;
  downloadTemplateMenuCloseRef: React.MutableRefObject<number | null>;
  setDownloadTemplateMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  downloadTemplateMenuOpen: boolean;
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
  downloadMode: 'all' | 'subs' | 'media';
  setDownloadMode: (value: 'all' | 'subs' | 'media') => void;
  downloadCookiesFile: File | null;
  setDownloadCookiesFile: (file: File | null) => void;
  downloadNoPlaylist: boolean;
  setDownloadNoPlaylist: (value: boolean) => void;
  downloadSubtitleLang: string;
  setDownloadSubtitleLang: (value: string) => void;
  downloadAnalyzeListSubs: Array<{ lang: string }>;
}

export const RunPipelineDownloadConfig: React.FC<RunPipelineDownloadConfigProps> = ({
  runPipelineTaskTemplate,
  handleTaskTemplateChange,
  selectedDownloadTemplate,
  deleteTaskTemplateWithConfirm,
  isDownloadTemplateDirty,
  getTaskTemplatesForType,
  downloadTemplateMenuCloseRef,
  setDownloadTemplateMenuOpen,
  downloadTemplateMenuOpen,
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
  downloadMode,
  setDownloadMode,
  downloadCookiesFile,
  setDownloadCookiesFile,
  downloadNoPlaylist,
  setDownloadNoPlaylist,
  downloadSubtitleLang,
  setDownloadSubtitleLang,
  downloadAnalyzeListSubs
}) => {
  return (
    <div className="border border-zinc-800 rounded-xl p-3 bg-zinc-900/70">
      <div className="text-[11px] text-zinc-500 uppercase tracking-widest mb-2">Block Config: Download</div>
      <div className="flex items-center justify-between mb-3">
        <label className="text-[11px] text-zinc-500 uppercase tracking-widest">Template</label>
        <div className="flex items-center gap-2 min-w-0">
          <select
            value={runPipelineTaskTemplate.download ?? 'custom'}
            onChange={e => handleTaskTemplateChange('download', e.target.value)}
            onContextMenu={event => {
              if (!selectedDownloadTemplate) return;
              event.preventDefault();
              deleteTaskTemplateWithConfirm('download', selectedDownloadTemplate.id, selectedDownloadTemplate.name);
            }}
            className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-200 focus:outline-none w-44 sm:w-56"
          >
            <option value="custom">{isDownloadTemplateDirty ? '*Custom' : 'Custom'}</option>
            {getTaskTemplatesForType('download').map(template => {
              const isSelected = runPipelineTaskTemplate.download === template.id;
              const label = isSelected && isDownloadTemplateDirty ? `*${template.name}` : template.name;
              return (
                <option key={template.id} value={template.id}>{label}</option>
              );
            })}
          </select>
          <div
            className="relative shrink-0"
            onMouseEnter={() => {
              if (downloadTemplateMenuCloseRef.current) {
                window.clearTimeout(downloadTemplateMenuCloseRef.current);
                downloadTemplateMenuCloseRef.current = null;
              }
              setDownloadTemplateMenuOpen(true);
            }}
            onMouseLeave={() => {
              if (downloadTemplateMenuCloseRef.current) {
                window.clearTimeout(downloadTemplateMenuCloseRef.current);
              }
              downloadTemplateMenuCloseRef.current = window.setTimeout(() => {
                setDownloadTemplateMenuOpen(false);
                downloadTemplateMenuCloseRef.current = null;
              }, 120);
            }}
            onFocusCapture={() => setDownloadTemplateMenuOpen(true)}
            onBlurCapture={event => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setDownloadTemplateMenuOpen(false);
              }
            }}
          >
            <button
              type="button"
              aria-label="Template options"
              title="Template options"
              onClick={() => setDownloadTemplateMenuOpen(prev => !prev)}
              className="inline-flex items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-xs font-medium text-zinc-200 hover:border-lime-500/50 hover:text-lime-300 shrink-0"
            >
              <Menu size={14} />
            </button>
            {downloadTemplateMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-28 rounded-lg border border-zinc-800 bg-zinc-950 shadow-lg shadow-black/40 z-20">
                <button
                  type="button"
                  onClick={() => {
                    setDownloadTemplateMenuOpen(false);
                    resetTaskTemplateToDefault('download');
                  }}
                  className={`w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800/90 hover:text-zinc-50 transition-colors ${
                    selectedDownloadTemplate || isDownloadTemplateDirty ? 'rounded-t-lg' : 'rounded-lg'
                  }`}
                >
                  Reset to default
                </button>
                {selectedDownloadTemplate && isDownloadTemplateDirty && (
                  <button
                    type="button"
                    onClick={() => {
                      setDownloadTemplateMenuOpen(false);
                      saveTaskTemplateCurrent('download', selectedDownloadTemplate);
                    }}
                    className="w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800/90 hover:text-zinc-50 transition-colors"
                  >
                    Save
                  </button>
                )}
                {(selectedDownloadTemplate || isDownloadTemplateDirty) && (
                  <button
                    type="button"
                    onClick={() => {
                      setDownloadTemplateMenuOpen(false);
                      saveTaskTemplate('download');
                    }}
                    className={`w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800/90 hover:text-zinc-50 transition-colors ${
                      selectedDownloadTemplate ? '' : 'rounded-b-lg'
                    }`}
                  >
                    Save As
                  </button>
                )}
                {selectedDownloadTemplate && isDownloadTemplateDirty && (
                  <button
                    type="button"
                    onClick={() => {
                      setDownloadTemplateMenuOpen(false);
                      restoreTaskTemplateCurrent('download', selectedDownloadTemplate);
                    }}
                    className="w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800/90 hover:text-zinc-50 transition-colors"
                  >
                    Restore
                  </button>
                )}
                {selectedDownloadTemplate && (
                  <button
                    type="button"
                    onClick={() => {
                      setDownloadTemplateMenuOpen(false);
                      deleteTaskTemplateWithConfirm('download', selectedDownloadTemplate.id, selectedDownloadTemplate.name);
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
        {SHOW_PARAM_PRESETS && (
          hasParamPresets('download') ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] text-zinc-500 uppercase tracking-widest">Param Source</label>
                {runPipelineParamPreset.download !== 'custom' && null}
              </div>
              <select
                value={runPipelineParamPreset.download ?? 'custom'}
                onChange={e => handleParamPresetChange('download', e.target.value)}
                className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none"
              >
                <option value="custom">Manual</option>
                {getParamPresetsForType('download').map(preset => (
                  <option key={preset.id} value={`preset:${preset.id}`}>{preset.label || 'Untitled preset'}</option>
                ))}
              </select>
              {runPipelineParamPreset.download !== 'custom' && (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => switchPresetToManual('download')}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      switchPresetToManual('download');
                    }
                  }}
                  title="Switch to manual and load these params"
                  className="border border-zinc-800 rounded-lg p-2.5 bg-zinc-950/40 cursor-pointer hover:border-lime-500/40 transition-colors"
                >
                  <div className="mt-2 grid gap-1 text-[11px] text-zinc-400">
                    {Object.entries(getSelectedParamPresetParams('download')).map(([key, value]) => (
                      <div key={key} className="flex items-center justify-between gap-2">
                        <span className="font-mono text-zinc-500">{key}</span>
                        <span className="truncate text-zinc-300">{formatDefaultValue(value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-[11px] text-zinc-500">No param presets for Download.</div>
          )
        )}
        {(!SHOW_PARAM_PRESETS || runPipelineParamPreset.download === 'custom') && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <select
              value={downloadMode}
              onChange={e => setDownloadMode(e.target.value as 'all' | 'subs' | 'media')}
              className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none"
            >
              <option value="all">Download: All (subs + audio + video)</option>
              <option value="subs">Download: Subtitles only</option>
              <option value="media">Download: Audio + Video only</option>
            </select>
            <label className="flex items-center justify-between gap-3 px-2.5 py-1.5 border border-dashed border-zinc-700 rounded-lg text-sm text-zinc-400 hover:border-zinc-500 cursor-pointer">
              <span>{downloadCookiesFile?.name ?? 'cookies.txt (optional)'}</span>
              <input
                type="file"
                accept=".txt"
                onChange={e => setDownloadCookiesFile(e.target.files?.[0] ?? null)}
                className="hidden"
              />
            </label>
            <label className="flex items-center gap-2 px-2.5 py-1.5 border border-zinc-800 rounded-lg text-xs text-zinc-300">
              <input
                type="checkbox"
                checked={downloadNoPlaylist}
                onChange={e => setDownloadNoPlaylist(e.target.checked)}
                className="accent-lime-400"
              />
              No playlist
            </label>
            {downloadMode !== 'media' ? (
              <>
                <input
                  value={downloadSubtitleLang}
                  onChange={e => setDownloadSubtitleLang(e.target.value)}
                  list="ytdlp-sub-langs"
                  className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none"
                  placeholder="Subtitle language (e.g. ai-zh)"
                  title="Leave blank to skip subtitles. Use comma-separated codes (e.g. en,vi,ai-zh)."
                />
                {downloadAnalyzeListSubs.length > 0 && (
                  <datalist id="ytdlp-sub-langs">
                    {downloadAnalyzeListSubs.map((entry: any) => (
                      <option key={entry.lang} value={entry.lang} />
                    ))}
                  </datalist>
                )}
              </>
            ) : (
              <div className="border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-500">
                Subtitles disabled for media-only.
              </div>
            )}
          </div>
        )}
      </>
    </div>
  );
};
