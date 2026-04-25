import React from 'react';

interface RunPipelineInputsSectionProps {
  runPipelineHasDownload: boolean;
  runPipelineHasRender: boolean;
  runPipelineHasTts: boolean;
  downloadProjectName: string;
  setDownloadProjectName: (value: string) => void;
  downloadProjectPickerOpen: boolean;
  setDownloadProjectPickerOpen: (value: boolean) => void;
  vaultFolders: any[];
  setRunPipelineProjectId: (id: string | null) => void;
  runPipelineProject: any;
  runPipelineProjectLocked: boolean;
  runPipelineId: string | null;
  setRunPipelineId: (id: string | null) => void;
  pipelineLibrary: any[];
  runPipelineLoading: boolean;
  downloadUrl: string;
  setDownloadUrl: (value: string) => void;
  downloadAnalyzeError: string | null;
  downloadAnalyzeResult: any;
  downloadAnalyzeData: any;
  downloadAnalyzeVideoFormats: any[];
  downloadAnalyzeAudioFormats: any[];
  downloadAnalyzeSubtitleCount: number;
  bestSingleFormat: any;
  downloadAnalyzeListSubs: any[];
  runPipelineRenderTemplateId: string;
  selectedRenderTemplate: any;
  renderInputFileIds: string[];
  setRenderInputFileIds: (ids: string[]) => void;
  setRenderVideoId: (id: string | null) => void;
  setRenderAudioId: (id: string | null) => void;
  setRenderSubtitleId: (id: string | null) => void;
  truncateLabel: (value: string, max: number) => string;
  renderTemplatePlaceholdersByType: Record<string, any[]>;
  renderTemplateFilesByType: Record<string, any[]>;
  renderTemplateApplyMap: Record<string, string>;
  commitRenderTemplateApplyMap: (templateId: string | null, next: Record<string, string>) => void;
  applyRenderTemplate: (template: any, next: Record<string, string>) => void;
  runPipelineInputId: string | null;
  setRunPipelineInputId: (id: string | null) => void;
  runPipelineGraph: any;
}

export const RunPipelineInputsSection: React.FC<RunPipelineInputsSectionProps> = ({
  runPipelineHasDownload,
  runPipelineHasRender,
  runPipelineHasTts,
  downloadProjectName,
  setDownloadProjectName,
  downloadProjectPickerOpen,
  setDownloadProjectPickerOpen,
  vaultFolders,
  setRunPipelineProjectId,
  runPipelineProject,
  runPipelineProjectLocked,
  runPipelineId,
  setRunPipelineId,
  pipelineLibrary,
  runPipelineLoading,
  downloadUrl,
  setDownloadUrl,
  downloadAnalyzeError,
  downloadAnalyzeResult,
  downloadAnalyzeData,
  downloadAnalyzeVideoFormats,
  downloadAnalyzeAudioFormats,
  downloadAnalyzeSubtitleCount,
  bestSingleFormat,
  downloadAnalyzeListSubs,
  runPipelineRenderTemplateId,
  selectedRenderTemplate,
  renderInputFileIds,
  setRenderInputFileIds,
  setRenderVideoId,
  setRenderAudioId,
  setRenderSubtitleId,
  truncateLabel,
  renderTemplatePlaceholdersByType,
  renderTemplateFilesByType,
  renderTemplateApplyMap,
  commitRenderTemplateApplyMap,
  applyRenderTemplate,
  runPipelineInputId,
  setRunPipelineInputId,
  runPipelineGraph
}) => {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-zinc-500 uppercase tracking-widest">
          {runPipelineHasDownload ? 'Project' : 'Project'}
        </label>
        {runPipelineHasDownload ? (
          <div className="flex flex-col gap-2">
            <div className="relative">
              <input
                value={downloadProjectName}
                onChange={e => {
                  const nextValue = e.target.value;
                  setDownloadProjectName(nextValue);
                  setDownloadProjectPickerOpen(true);
                  const match = vaultFolders.find(folder => folder.name.toLowerCase() === nextValue.trim().toLowerCase());
                  if (match) {
                    setRunPipelineProjectId(match.id);
                  }
                }}
                onFocus={() => setDownloadProjectPickerOpen(true)}
                onBlur={() => setTimeout(() => setDownloadProjectPickerOpen(false), 120)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none"
                placeholder="Project name (new or existing)"
                autoComplete="off"
              />
              {downloadProjectPickerOpen && vaultFolders.length > 0 && (
                <div className="absolute z-50 mt-1 w-full max-h-56 overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 shadow-xl">
                  {vaultFolders
                    .filter(folder => folder.name.toLowerCase().includes(downloadProjectName.trim().toLowerCase()))
                    .map(folder => (
                      <button
                        type="button"
                        key={folder.id}
                        onMouseDown={() => {
                          setDownloadProjectName(folder.name);
                          setRunPipelineProjectId(folder.id);
                          setDownloadProjectPickerOpen(false);
                        }}
                        className="w-full px-2.5 py-1.5 text-left text-sm text-zinc-200 hover:bg-zinc-900"
                      >
                        {folder.name}
                      </button>
                    ))}
                  {vaultFolders.filter(folder => folder.name.toLowerCase().includes(downloadProjectName.trim().toLowerCase())).length === 0 && (
                    <div className="px-2.5 py-1.5 text-xs text-zinc-500">No matches</div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <select
            value={runPipelineProject?.id ?? ''}
            onChange={e => setRunPipelineProjectId(e.target.value || null)}
            disabled={runPipelineProjectLocked}
            className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none disabled:opacity-60"
          >
            <option value="" disabled>Select a project</option>
            {vaultFolders.map(folder => (
              <option key={folder.id} value={folder.id}>{folder.name}</option>
            ))}
          </select>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-zinc-500 uppercase tracking-widest">Pipeline</label>
        <select
          value={runPipelineId ?? ''}
          onChange={e => setRunPipelineId(e.target.value || null)}
          disabled={pipelineLibrary.length === 0}
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none"
        >
          {pipelineLibrary.length === 0 && (
            <option value="">No pipelines saved</option>
          )}
          {pipelineLibrary.map(pipe => (
            <option key={pipe.id} value={pipe.id}>{pipe.name}</option>
          ))}
        </select>
      </div>

      <div className="border border-zinc-800 rounded-xl p-3 bg-zinc-900/70">
        <div className="text-[11px] text-zinc-500 uppercase tracking-widest mb-2">
          {runPipelineHasDownload
            ? 'Inputs (URL)'
            : runPipelineHasRender
              ? 'Inputs (Files)'
              : runPipelineHasTts
                ? 'Inputs (Subtitle)'
                : 'Inputs (Video/Audio)'}
        </div>
        {runPipelineLoading ? (
          <div className="text-xs text-zinc-500">Loading...</div>
        ) : (
          <div className="flex flex-col gap-2">
            {runPipelineHasDownload ? (
              <div className="flex flex-col gap-2">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={downloadUrl}
                    onChange={e => setDownloadUrl(e.target.value)}
                    className="col-span-2 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none"
                    placeholder="https://..."
                  />
                </div>
                {downloadAnalyzeError && (
                  <div className="text-[11px] text-red-400">{downloadAnalyzeError}</div>
                )}
                {downloadAnalyzeResult && (
                  <div className="mt-1 border border-zinc-800 rounded-lg p-2.5 bg-zinc-900/70">
                    <div className="text-[11px] text-zinc-500 uppercase tracking-widest">Analyze Result</div>
                    <div className="text-xs text-zinc-200 mt-2">
                      {downloadAnalyzeData?.title ? (
                        <div className="font-semibold text-zinc-100">{downloadAnalyzeData.title}</div>
                      ) : (
                        <div className="text-zinc-500">No title</div>
                      )}
                      {downloadAnalyzeData?.webpage_url && (
                        <div className="text-[11px] text-zinc-500 mt-1">{downloadAnalyzeData.webpage_url}</div>
                      )}
                    </div>
                    <div className="grid gap-1.5 mt-2 text-[11px] text-zinc-400">
                      <div>Video formats: {downloadAnalyzeVideoFormats.length}</div>
                      <div>Audio formats: {downloadAnalyzeAudioFormats.length}</div>
                      <div>Subtitle languages: {downloadAnalyzeSubtitleCount}</div>
                    </div>
                    {bestSingleFormat && (
                      <div className="mt-2 text-[11px] text-zinc-300">
                        <div className="font-semibold text-zinc-200 mb-1">Best Format</div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-zinc-400">{bestSingleFormat.format_id}</span>
                          <span>{bestSingleFormat.ext ?? 'unknown'}</span>
                          <span>
                            {bestSingleFormat.resolution ?? (bestSingleFormat.height ? `${bestSingleFormat.height}p` : bestSingleFormat.vcodec === 'none' ? 'audio' : 'video')}
                          </span>
                          <span>
                            {bestSingleFormat.vcodec !== 'none' ? (bestSingleFormat.vcodec ?? 'vcodec') : (bestSingleFormat.acodec ?? 'acodec')}
                          </span>
                        </div>
                      </div>
                    )}
                    {downloadAnalyzeListSubs.length > 0 && (
                      <div className="mt-2 text-[11px] text-zinc-300">
                        <div className="font-semibold text-zinc-200 mb-1">Subtitles</div>
                        <div className="max-h-32 overflow-y-auto space-y-1">
                          {downloadAnalyzeListSubs.map((entry: any) => (
                            <div key={entry.lang} className="flex items-center justify-between gap-2">
                              <span className="font-mono text-zinc-400">{entry.lang}</span>
                              <span className="text-zinc-500">
                                {Array.isArray(entry.formats) ? entry.formats.join(', ') : '--'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : runPipelineHasRender ? (
              <div className="flex flex-col gap-2">
                {!runPipelineProject ? (
                  <div className="text-[11px] text-zinc-500">Select a project first.</div>
                ) : runPipelineRenderTemplateId === 'custom' || !selectedRenderTemplate ? (
                  <>
                    <select
                      multiple
                      value={renderInputFileIds}
                      onChange={e => {
                        const selectedOptions = Array.from(e.currentTarget.selectedOptions) as HTMLOptionElement[];
                        const selected = selectedOptions.map(option => option.value);
                        setRenderInputFileIds(selected);
                        const selectedFiles = runPipelineProject?.files.filter(file => selected.includes(file.id)) ?? [];
                        const firstVideo = selectedFiles.find(file => file.type === 'video');
                        const firstAudio = selectedFiles.find(file => file.type === 'audio');
                        const firstSubtitle = selectedFiles.find(file => file.type === 'subtitle');
                        setRenderVideoId(firstVideo?.id ?? null);
                        setRenderAudioId(firstAudio?.id ?? null);
                        setRenderSubtitleId(firstSubtitle?.id ?? null);
                      }}
                      className="min-h-[140px] bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none"
                    >
                      {runPipelineProject?.files
                        .filter(file => file.type === 'video' || file.type === 'audio' || file.type === 'subtitle' || file.type === 'image')
                        .map(file => (
                          <option
                            key={file.id}
                            value={file.id}
                            title={file.name}
                          >
                            [{file.type}] {truncateLabel(file.name, 52)}
                          </option>
                        ))}
                    </select>
                    <div className="text-[10px] text-zinc-500">
                      Select multiple files (Ctrl/Cmd + click).
                    </div>
                  </>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {(['video', 'audio', 'subtitle', 'image', 'other'] as const).map(group => {
                      const placeholders = renderTemplatePlaceholdersByType[group];
                      if (!placeholders.length) return null;
                      const files = renderTemplateFilesByType[group as keyof typeof renderTemplateFilesByType] ?? [];
                      const needsWarning = group !== 'other' && (files.length === 0 || files.length !== placeholders.length);
                      let warningText = '';
                      if (files.length === 0) {
                        warningText = `No ${group} files available`;
                      } else if (files.length < placeholders.length) {
                        warningText = `Missing ${placeholders.length - files.length} ${group} file(s)`;
                      } else if (files.length > placeholders.length) {
                        warningText = `Extra ${files.length - placeholders.length} ${group} file(s)`;
                      }
                      return (
                        <div key={group} className="border border-zinc-800 rounded-lg bg-zinc-950/50">
                          <div className="flex items-center justify-between px-2.5 py-2 border-b border-zinc-800">
                            <span className="text-[10px] text-zinc-500 uppercase tracking-widest">{group}</span>
                            {needsWarning && (
                              <span className="text-[10px] text-amber-300">{warningText}</span>
                            )}
                          </div>
                          <div className="p-2 grid gap-2">
                            {placeholders.map((placeholder, index) => {
                              const fallbackKey = placeholders.length === 1 && placeholder.key === placeholder.type
                                ? ''
                                : (placeholder.key === placeholder.type ? `${placeholder.type}1` : placeholder.key);
                              const itemMatch = selectedRenderTemplate?.config?.items?.find((i: any) => i.source?.ref === placeholder.key);
                              const savedName = (itemMatch?.name ?? '').trim();
                              const displayName = savedName || fallbackKey;
                              return (
                                <div key={placeholder.key} className="flex flex-col gap-1 min-w-0">
                                  {displayName ? (
                                    <label
                                      className="text-[10px] text-zinc-500 uppercase tracking-widest truncate"
                                      title={`${placeholder.key}${savedName ? ` · ${savedName}` : ''}`}
                                    >
                                      {displayName}
                                    </label>
                                  ) : null}
                                  <select
                                    value={renderTemplateApplyMap[placeholder.key] ?? ''}
                                    onChange={e => {
                                      const next = { ...renderTemplateApplyMap, [placeholder.key]: e.target.value };
                                      commitRenderTemplateApplyMap(selectedRenderTemplate?.id ?? null, next);
                                      if (selectedRenderTemplate) {
                                        applyRenderTemplate(selectedRenderTemplate, next);
                                      }
                                    }}
                                    title={(() => {
                                      const selectedId = renderTemplateApplyMap[placeholder.key];
                                      const selectedFile = files.find(file => file.id === selectedId);
                                      return selectedFile?.name ?? '';
                                    })()}
                                    className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none w-full min-w-0 overflow-hidden text-ellipsis whitespace-nowrap"
                                  >
                                    <option value="">Select file</option>
                                    {files.map(file => (
                                      <option key={file.id} value={file.id} title={file.name}>
                                        {truncateLabel(file.name, 52)}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-1.5">
                  <select
                    value={runPipelineInputId ?? ''}
                    onChange={e => setRunPipelineInputId(e.target.value || null)}
                    className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none"
                  >
                    <option value="">Select input file</option>
                    {runPipelineProject?.files
                      .filter(file => (runPipelineHasTts ? file.type === 'subtitle' : file.type === 'video' || file.type === 'audio'))
                      .map(file => (
                        <option
                          key={file.id}
                          value={file.id}
                          title={`${file.origin === 'tts' ? '(TTS)' : file.origin === 'vr' ? '(VR)' : '(Source)'} ${file.name}`}
                        >
                          {file.origin === 'tts' ? '(TTS)' : file.origin === 'vr' ? '(VR)' : '(Source)'} {truncateLabel(file.name, 52)}
                        </option>
                      ))}
                  </select>
                </div>
                {!runPipelineGraph?.nodes && pipelineLibrary.length === 0 && (
                  <div className="text-[11px] text-zinc-500">No saved pipeline yet.</div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
};
