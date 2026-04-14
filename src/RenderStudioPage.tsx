import React from 'react';
import { File, FileAudio, FileText, FileVideo, Menu, MousePointer2, Type, Image, Upload } from 'lucide-react';

type RenderStudioPageProps = Record<string, any>;

const DEFAULT_RENDER_RESOLUTION_PRESETS = [
  { value: '1920x1080', label: '1920x1080 (1080p)' },
  { value: '1280x720', label: '1280x720 (720p)' },
  { value: '3840x2160', label: '3840x2160 (4K)' },
  { value: '1080x1920', label: '1080x1920 (Vertical)' },
  { value: '720x1280', label: '720x1280 (Vertical)' }
];

export default function RenderStudioPage(props: RenderStudioPageProps) {
  const {
    runPipelineProject,
    selectProjectDefaults,
    resetRenderToDefault,
    renderReady,
    setShowRenderStudio,
    setActiveTab,
    runPipelineJob,
    runPipelineSubmitting,
    renderStudioLeftMenuOpen,
    setRenderStudioLeftMenuOpen,
    renderStudioMediaBinOpen,
    setRenderStudioMediaBinOpen,
    renderStudioProjectOpen,
    setRenderStudioProjectOpen,
    setImportPopupOpen,
    renderStudioFocus,
    setRenderStudioFocus,
    renderStudioItemType,
    setRenderStudioItemType,
    renderStudioPreviewFileId,
    setRenderStudioPreviewFileId,
    openRenderStudioMediaBinContextMenu,
    openRenderStudioTimelineContextMenu,
    renderInputFileIds,
    setRenderInputFileIds,
    renderTemplateApplyMap,
    onRenderTemplatePlaceholderFile,
    renderVideoId,
    setRenderVideoId,
    renderAudioId,
    setRenderAudioId,
    renderSubtitleId,
    setRenderSubtitleId,
    renderTextTrackEnabled,
    setRenderTextTrackEnabled,
    renderVideoFile,
    renderAudioFile,
    renderSubtitleFile,
    renderImageFiles,
    renderImageDurationEntries,
    renderImageDurations,
    setRenderImageDurations,
    renderImageMatchDuration,
    setRenderImageMatchDuration,
    renderImageOrderIds,
    setRenderImageOrderIds,
    renderImageTransforms,
    setRenderImageTransforms,
    formatDuration,
    formatDurationFine,
    renderTimelineDuration,
    renderSubtitleTrackHeight,
    renderSubtitleDuration,
    renderSubtitleLanes,
    renderSubtitleLaneHeight,
    renderSubtitleCues,
    renderTimelineViewDuration,
    showRenderTimelineSubtitleTrack,
    showRenderTimelineTextTrack,
    showRenderTimelineImageTrack,
    renderParams,
    showRenderTimelineVideoTrack,
    renderVideoDuration,
    showRenderTimelineAudioTrack,
    renderAudioDuration,
    renderTimelineScrollRef,
    onRenderTimelineMouseDown,
    onRenderTimelineMouseMove,
    onRenderTimelineMouseUp,
    onRenderTimelineClick,
    renderTimelineWidth,
    renderTimelineTickCount,
    renderPlayheadSeconds,
    renderTimelineMinScale,
    renderTimelineScale,
    setRenderTimelineScale,
    renderPreviewUrl,
    renderPreviewLoading,
    renderPreviewError,
    setRenderPreviewHold,
    canBrowserPlayVideo,
    getVideoMimeType,
    renderSelectedItem,
    renderParamsDraft,
    updateRenderParamDraft,
    commitRenderParamDraftValue,
    commitRenderParamDraftOnEnter,
    updateRenderParam,
    setRenderStudioInspectorOpen,
    renderVideoTransforms,
    addRenderVideoBlurEffect,
    updateRenderVideoBlurEffect,
    commitRenderVideoBlurEffectValue,
    removeRenderVideoBlurEffect,
    addRenderImageBlurEffect,
    updateRenderImageBlurEffect,
    commitRenderImageBlurEffectValue,
    removeRenderImageBlurEffect,
    renderTrackLabels,
    placeholderKeyByFileId,
    updateRenderTrackLabel,
    coerceNumber,
    RENDER_BLUR_FEATHER_MAX,
    RENDER_PREVIEW_BLACK_DATA_URL,
    renderTemplates,
    runPipelineRenderTemplateId,
    handleRenderTemplateChange,
    saveRenderTemplateQuick,
    saveRenderTemplateCurrent,
    restoreRenderTemplateCurrent,
    deleteRenderTemplateWithConfirm,
    isRenderTemplateDirty,
    renderConfigV2Override,
    setRenderConfigV2Override,
    subtitleFontOptions,
    subtitleFontLoading,
    SUBTITLE_STYLE_PRESETS,
    applySubtitleStylePreset,
    isSubtitlePresetActive,
    buildSubtitlePreviewStyle
  } = props;

  const RENDER_RESOLUTION_PRESETS = props.RENDER_RESOLUTION_PRESETS ?? DEFAULT_RENDER_RESOLUTION_PRESETS;
  const [selectedTrackKey, setSelectedTrackKey] = React.useState<string | null>(null);
  const timelineScrollContainerRef = React.useRef<HTMLDivElement | null>(null);
  const selectedImageId = selectedTrackKey?.startsWith('image:') ? selectedTrackKey.slice('image:'.length) : null;
  const activeVideoId = renderVideoId ?? null;
  const renderVideoBlurEffects = activeVideoId
    ? (renderVideoTransforms?.[activeVideoId]?.blurEffects ?? [])
    : [];
  const imageInspectorFiles = selectedImageId
    ? renderImageFiles.filter(file => file.id === selectedImageId)
    : renderImageFiles;
  const [templateMenuOpen, setTemplateMenuOpen] = React.useState(false);
  const templateMenuCloseRef = React.useRef<number | null>(null);
  const selectedTemplate = renderTemplates.find(template => template.id === runPipelineRenderTemplateId) ?? null;
  const isCustomTemplate = !selectedTemplate || runPipelineRenderTemplateId === 'custom';
  const inputRefPlaceholderType = React.useCallback((key: string) => {
    if (key.startsWith('video')) return 'video' as const;
    if (key.startsWith('audio')) return 'audio' as const;
    if (key.startsWith('subtitle')) return 'subtitle' as const;
    if (key.startsWith('image')) return 'image' as const;
    return null;
  }, []);
  const projectMediaFilesByKind = React.useMemo(() => {
    const files = runPipelineProject?.files ?? [];
    return {
      video: files.filter((f: { type: string }) => f.type === 'video'),
      audio: files.filter((f: { type: string }) => f.type === 'audio'),
      subtitle: files.filter((f: { type: string }) => f.type === 'subtitle'),
      image: files.filter((f: { type: string }) => f.type === 'image'),
      all: files.filter((f: { type: string }) => ['video', 'audio', 'subtitle', 'image'].includes(f.type))
    };
  }, [runPipelineProject?.files]);
  const truncatePlaceholderFileName = (name: string, max = 44) =>
    (name.length <= max ? name : `${name.slice(0, max - 1)}…`);
  const [addTrackMenuOpen, setAddTrackMenuOpen] = React.useState(false);
  const addTrackMenuCloseRef = React.useRef<number | null>(null);
  const [renderConfirmOpen, setRenderConfirmOpen] = React.useState(false);
  const singleTextStartDraft = `${renderParamsDraft?.text?.singleTextStart ?? ''}`;
  const singleTextEndDraft = `${renderParamsDraft?.text?.singleTextEnd ?? ''}`;
  const singleTextEndFallback = renderTimelineDuration > 0
    ? renderTimelineDuration
    : (renderVideoDuration ?? renderAudioDuration ?? 5);
  const singleTextMatchDuration = String(renderParamsDraft?.text?.singleTextMatchDuration ?? '0') === '1';
  const singleTextStartValue = singleTextMatchDuration ? '0' : (singleTextStartDraft === '' ? '0' : singleTextStartDraft);
  const singleTextEndValue = singleTextMatchDuration ? String(singleTextEndFallback) : (singleTextEndDraft === '' ? String(singleTextEndFallback) : singleTextEndDraft);
  const singleTextValueDraft = String(renderParamsDraft?.text?.singleText ?? '').trim();
  const singleTextStartNumber = coerceNumber(singleTextStartValue, 0) ?? 0;
  const singleTextEndNumber = coerceNumber(singleTextEndValue, singleTextEndFallback) ?? singleTextEndFallback;
  const singleTextSafeEnd = Math.max(singleTextStartNumber + 0.01, singleTextEndNumber);
  const singleTextDuration = singleTextValueDraft ? Math.max(0.01, singleTextSafeEnd - singleTextStartNumber) : 0;
  const subtitlePositionMode = String(renderParamsDraft?.subtitle?.positionMode ?? 'anchor');
  const positionXDraft = `${renderParamsDraft?.subtitle?.positionX ?? ''}`;
  const positionYDraft = `${renderParamsDraft?.subtitle?.positionY ?? ''}`;
  const positionXValue = positionXDraft === '' ? '50' : positionXDraft;
  const positionYValue = positionYDraft === '' ? '50' : positionYDraft;
  const textPositionMode = String(renderParamsDraft?.text?.positionMode ?? 'anchor');
  const textPositionXDraft = `${renderParamsDraft?.text?.positionX ?? ''}`;
  const textPositionYDraft = `${renderParamsDraft?.text?.positionY ?? ''}`;
  const textPositionXValue = textPositionXDraft === '' ? '50' : textPositionXDraft;
  const textPositionYValue = textPositionYDraft === '' ? '50' : textPositionYDraft;
  const textAutoMoveIntervalDraft = `${renderParamsDraft?.text?.textAutoMoveInterval ?? ''}`;
  const textAutoMoveIntervalValue = textAutoMoveIntervalDraft === '' ? '0' : textAutoMoveIntervalDraft;
  const textAutoMovePositionsValue = `${renderParamsDraft?.text?.textAutoMovePositions ?? ''}`;
  const textAutoMoveEnabled = String(renderParamsDraft?.text?.textAutoMoveEnabled ?? '0') === '1';
  const previewResolution = (renderParamsDraft?.timeline?.resolution ?? '').toString();
  const previewSize = (() => {
    const match = previewResolution.trim().match(/(\d+)\s*[x×]\s*(\d+)/i);
    if (!match) return { w: 1920, h: 1080 };
    const w = Number(match[1]);
    const h = Number(match[2]);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return { w: 1920, h: 1080 };
    return { w, h };
  })();
  const holdPreview = () => setRenderPreviewHold(true);
  const releasePreview = (commit?: () => void) => {
    setRenderPreviewHold(false);
    commit?.();
  };
  const releasePreviewOnEnter = (commit?: () => void) => (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      setRenderPreviewHold(false);
      commit?.();
    }
  };
  const renderTextTrackHeight = 24;
  const previewImageFile = renderStudioPreviewFileId && runPipelineProject
    ? runPipelineProject.files.find(file => file.id === renderStudioPreviewFileId && file.type === 'image')
    : renderImageFiles[0];
  const previewSubtitleFile = renderStudioPreviewFileId && runPipelineProject
    ? runPipelineProject.files.find(file => file.id === renderStudioPreviewFileId && file.type === 'subtitle')
    : renderSubtitleFile;
  const activeInspectorSection = selectedTrackKey
    ? (selectedTrackKey.startsWith('image:') ? 'image'
      : (selectedTrackKey as 'timeline' | 'video' | 'audio' | 'subtitle' | 'text'))
    : 'timeline';

  const openInspectorSection = (section: 'timeline' | 'video' | 'audio' | 'subtitle' | 'text' | 'image') => {
    setRenderStudioInspectorOpen({
      timeline: false,
      video: false,
      audio: false,
      subtitle: false,
      text: false,
      image: false,
      [section]: true
    });
  };

  const selectTrack = (type: 'video' | 'audio' | 'subtitle' | 'text' | 'image') => {
    setRenderStudioItemType(type);
    openInspectorSection(type);
  };

  const resetTrackSelection = () => {
    setSelectedTrackKey(null);
    setRenderStudioItemType('timeline');
    openInspectorSection('timeline');
  };

  return (
            <div className="fixed inset-0 z-[60] bg-zinc-950">
              <div className="relative w-full h-full bg-zinc-950/95 border border-zinc-800 rounded-none shadow-none overflow-hidden flex flex-col">
                <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800 bg-gradient-to-r from-zinc-900/80 via-zinc-900/40 to-zinc-950/90">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-xl bg-lime-500/15 text-lime-400 flex items-center justify-center">
                      <FileVideo size={18} />
                    </div>
                    <div>
                      <div className="text-[11px] text-zinc-500 uppercase tracking-widest">Render Studio</div>
                      <div className="text-sm font-semibold text-zinc-100">
                        {runPipelineProject?.name ?? 'Project'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-zinc-500">
                      {renderReady ? 'Ready to render' : 'Select a video source'}
                    </span>
                    <button
                      onClick={() => setShowRenderStudio(false)}
                      className="px-3 py-1.5 text-xs font-semibold border border-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-100 hover:border-zinc-700"
                    >
                      Back
                    </button>
                    <button
                      onClick={() => setRenderConfirmOpen(true)}
                      disabled={!renderReady || runPipelineSubmitting}
                      className="px-4 py-1.5 text-xs font-semibold bg-lime-500 text-zinc-950 rounded-lg hover:bg-lime-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {runPipelineSubmitting ? 'Queuing...' : 'Render'}
                    </button>
                  </div>
                </div>
                {renderConfirmOpen && (
                  <div className="absolute inset-0 z-[70] bg-zinc-950/70 flex items-center justify-center">
                    <div className="w-[360px] rounded-xl border border-zinc-800 bg-zinc-950 shadow-xl p-4">
                      <div className="text-sm font-semibold text-zinc-100">Render Output</div>
                      <div className="mt-4 flex flex-col gap-2">
                        <button
                          type="button"
                          disabled={runPipelineSubmitting}
                          onClick={() => {
                            setRenderConfirmOpen(false);
                            runPipelineJob({ renderPreviewSeconds: null });
                            setShowRenderStudio(false);
                            setActiveTab('dashboard');
                          }}
                          className="w-full px-3 py-2 text-xs font-semibold rounded-lg bg-lime-500 text-zinc-950 hover:bg-lime-400 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          Render Full Video
                        </button>
                        <button
                          type="button"
                          disabled={runPipelineSubmitting}
                          onClick={() => {
                            setRenderConfirmOpen(false);
                            runPipelineJob({ renderPreviewSeconds: 30 });
                            setShowRenderStudio(false);
                            setActiveTab('dashboard');
                          }}
                          className="w-full px-3 py-2 text-xs font-semibold rounded-lg border border-zinc-800 text-zinc-200 hover:border-zinc-700 hover:text-zinc-50 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          Render Preview 30s
                        </button>
                        <button
                          type="button"
                          disabled={runPipelineSubmitting}
                          onClick={() => setRenderConfirmOpen(false)}
                          className="w-full px-3 py-2 text-xs font-semibold rounded-lg border border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid min-h-0 flex-1 grid-cols-[260px_minmax(0,1fr)_300px]">
                  <div className="border-r border-zinc-800 bg-zinc-900/60 p-4 flex flex-col gap-4 min-h-0">
                    <div
                      role="button"
                      tabIndex={0}
                      aria-expanded={renderStudioMediaBinOpen}
                      onClick={() => setRenderStudioMediaBinOpen(prev => !prev)}
                      onKeyDown={event => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setRenderStudioMediaBinOpen(prev => !prev);
                        }
                      }}
                      className="flex items-center justify-between text-[11px] text-zinc-500 uppercase tracking-widest cursor-pointer hover:text-zinc-300 transition-colors"
                    >
                      <span>Media Bin</span>
                      <div className="flex items-center gap-2">
                        <span>{runPipelineProject?.files.length ?? 0} items</span>
                        <button
                          type="button"
                          onClick={event => {
                            event.stopPropagation();
                            setImportPopupOpen(true);
                          }}
                          className="h-6 w-6 rounded-md border border-zinc-800 flex items-center justify-center hover:border-zinc-700"
                          title="Import files"
                        >
                          <Upload size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={event => {
                            event.stopPropagation();
                            setRenderStudioMediaBinOpen(prev => !prev);
                          }}
                          className="h-6 w-6 rounded-md border border-zinc-800 flex items-center justify-center hover:border-zinc-700"
                        >
                          <Menu size={12} />
                        </button>
                      </div>
                    </div>
                    {renderStudioMediaBinOpen && (
                      <div className="grid grid-cols-2 gap-2 overflow-y-auto pr-1">
                        {(runPipelineProject?.files ?? []).map(file => {
                          const isVideo = file.type === 'video';
                          const isAudio = file.type === 'audio';
                          const isSubtitle = file.type === 'subtitle';
                          const isImage = file.type === 'image';
                          const isAdded = renderInputFileIds.includes(file.id);
                          const isSelected = renderStudioFocus === 'item'
                            ? isVideo
                              ? renderStudioItemType === 'video' && renderVideoId === file.id
                              : isAudio
                                ? renderStudioItemType === 'audio' && renderAudioId === file.id
                                : isSubtitle
                                  ? renderStudioItemType === 'subtitle' && renderSubtitleId === file.id
                                  : isImage
                                    ? renderStudioItemType === 'image' && selectedImageId === file.id
                                    : false
                            : false;
                          const icon = isVideo ? FileVideo : isAudio ? FileAudio : isSubtitle ? Type : Image;
                          const iconClass = isVideo
                            ? 'bg-lime-500/15 text-lime-300'
                            : isAudio
                              ? 'bg-amber-500/15 text-amber-300'
                              : isImage
                                ? 'bg-sky-500/15 text-sky-300'
                                : 'bg-blue-500/15 text-blue-300';
                        const selectedClass = 'border-lime-500/50 bg-lime-500/10 text-zinc-100';
                        const onClick = isVideo
                          ? () => {
                            setRenderVideoId(file.id);
                          }
                          : isAudio
                            ? () => {
                              setRenderAudioId(file.id);
                            }
                            : isSubtitle
                              ? () => {
                                setRenderSubtitleId(file.id);
                              }
                              : isImage
                                ? () => {
                                  setSelectedTrackKey(`image:${file.id}`);
                                }
                                : undefined;
                        const onContextMenu = onClick
                          ? (event: React.MouseEvent) => openRenderStudioMediaBinContextMenu(event, file)
                          : undefined;
                          return (
                            <button
                              key={file.id}
                              onClick={onClick}
                              onContextMenu={onContextMenu}
                              disabled={!onClick}
                              className={`rounded-lg border p-2 text-left flex flex-col gap-1 ${
                                isSelected ? selectedClass : 'border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:border-zinc-700'
                              } ${!onClick ? 'opacity-60 cursor-not-allowed' : ''}`}
                            >
                              <div className="w-full h-14 rounded-md border border-zinc-800 bg-zinc-900/60 overflow-hidden flex items-center justify-center">
                                {isImage && file.relativePath ? (
                                  <img
                                    src={`/api/vault/stream?path=${encodeURIComponent(file.relativePath)}`}
                                    alt={file.name}
                                    className="w-full h-full object-cover"
                                    loading="lazy"
                                  />
                                ) : isVideo && file.relativePath ? (
                                  <video
                                    src={`/api/vault/stream?path=${encodeURIComponent(file.relativePath)}`}
                                    className="w-full h-full object-cover"
                                    muted
                                    playsInline
                                    preload="metadata"
                                  />
                                ) : (
                                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-zinc-500">
                                    {isAudio ? <FileAudio size={14} /> : isSubtitle ? <Type size={14} /> : <File size={14} />}
                                    <span>{isAudio ? 'Audio' : isSubtitle ? 'Subtitle' : 'File'}</span>
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center justify-between w-full">
                                <div className={`h-7 w-7 rounded-md ${iconClass} flex items-center justify-center`}>
                                  {React.createElement(icon, { size: 14 })}
                                </div>
                                {isAdded && (
                                  <span className="text-[9px] font-bold text-lime-500 uppercase tracking-tighter">added</span>
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="text-[11px] font-semibold truncate">{file.name}</div>
                                <div className="text-[10px] text-zinc-500 truncate">{file.duration ?? file.size}</div>
                              </div>
                            </button>
                          );
                        })}
                        {(runPipelineProject?.files ?? []).filter(file => renderInputFileIds.includes(file.id)).length === 0 && (
                          <div className="text-[11px] text-zinc-500">No files</div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex min-h-0 flex-col bg-zinc-950/40">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
                      <div className="text-[11px] text-zinc-500 uppercase tracking-widest">Preview</div>
                      <div className="text-[11px] text-zinc-500">
                        {renderVideoFile?.name ?? 'No video selected'}
                      </div>
                    </div>
                      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
                        <div className="min-h-[180px] flex-1 rounded-2xl border border-zinc-800 bg-[radial-gradient(circle_at_top,#1f2937_0%,#0b0f12_55%,#050607_100%)] flex items-center justify-center text-zinc-400 text-sm overflow-hidden relative">
                          {renderStudioFocus === 'item' && (
                            <button
                              type="button"
                              onClick={() => {
                                setRenderStudioFocus('timeline');
                                setRenderStudioItemType(null);
                                setRenderStudioPreviewFileId(null);
                                setRenderPreviewHold(false);
                              }}
                              className="absolute top-3 right-3 z-10 inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-950/80 px-3 py-1.5 text-[11px] text-zinc-200 hover:border-lime-500/60 hover:text-lime-200 transition-colors"
                            >
                              <MousePointer2 size={12} />
                              Preview timeline
                            </button>
                          )}
                          {renderStudioFocus === 'item' && renderStudioItemType === 'video' && renderVideoFile?.relativePath ? (
                            canBrowserPlayVideo(getVideoMimeType(renderVideoFile.name)) ? (
                              <video
                                key={renderVideoFile.relativePath}
                                className="w-full h-full object-contain bg-black"
                                controls
                                preload="auto"
                                playsInline
                              >
                                <source
                                  src={`/api/vault/stream?path=${encodeURIComponent(renderVideoFile.relativePath)}`}
                                  type={getVideoMimeType(renderVideoFile.name)}
                                />
                              </video>
                            ) : (
                              <div className="flex flex-col items-center gap-2 text-sm text-zinc-400 text-center">
                                <FileVideo size={22} className="text-zinc-500" />
                                <div>Browser không hỗ trợ phát định dạng này.</div>
                                <div className="text-[11px] text-zinc-500">Hãy convert về MP4 hoặc WebM.</div>
                              </div>
                            )
                          ) : renderStudioFocus === 'item' && renderStudioItemType === 'audio' && renderAudioFile?.relativePath ? (
                            <div className="w-full h-full flex flex-col items-center justify-center gap-4 p-6">
                              <div className="h-12 w-12 rounded-xl bg-amber-500/20 text-amber-300 flex items-center justify-center">
                                <FileAudio size={22} />
                              </div>
                              <audio
                                className="w-full max-w-[520px] h-10 rounded-md bg-zinc-900"
                                style={{ colorScheme: 'dark' }}
                                controls
                              >
                                <source src={`/api/vault/stream?path=${encodeURIComponent(renderAudioFile.relativePath)}`} />
                              </audio>
                            </div>
                          ) : renderStudioFocus === 'item' && renderStudioItemType === 'image' ? (
                            previewImageFile?.relativePath ? (
                              <img
                                src={`/api/vault/stream?path=${encodeURIComponent(previewImageFile.relativePath)}`}
                                alt={previewImageFile.name ?? 'Image preview'}
                                className="w-full h-full object-contain bg-black"
                                draggable={false}
                              />
                            ) : (
                              <div className="flex flex-col items-center gap-2 text-sm text-zinc-400 text-center">
                                <Image size={22} className="text-zinc-500" />
                                <div>No image selected.</div>
                              </div>
                            )
                          ) : renderStudioFocus === 'item' && renderStudioItemType === 'subtitle' ? (
                            <div className="flex flex-col items-center gap-2 text-sm text-zinc-400 text-center px-6">
                              <Type size={22} className="text-zinc-500" />
                              <div>{previewSubtitleFile?.name ?? 'Subtitle preview'}</div>
                              <div className="text-[11px] text-zinc-500">Use timeline preview to see subtitles over video.</div>
                            </div>
                          ) : renderPreviewUrl ? (
                            <img
                              src={renderPreviewUrl}
                              alt="Render preview"
                              className="w-full h-full object-contain select-none"
                              draggable={false}
                            />
                          ) : renderVideoFile ? (
                            'Preview ready'
                          ) : (
                            'Select a video from the media bin'
                          )}
                          <svg
                            className="absolute inset-0 w-full h-full pointer-events-none"
                            viewBox={`0 0 ${previewSize.w} ${previewSize.h}`}
                            preserveAspectRatio="xMidYMid meet"
                          >
                            <rect
                              x="0"
                              y="0"
                              width={previewSize.w}
                              height={previewSize.h}
                              fill="none"
                              stroke="rgba(113,113,122,0.7)"
                              strokeWidth="1"
                              strokeDasharray="4 3"
                              vectorEffect="non-scaling-stroke"
                            />
                          </svg>
                          {renderStudioFocus === 'timeline' && renderPreviewLoading && (
                            <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/40">
                              <div className="h-8 w-8 rounded-full border-2 border-zinc-500 border-t-lime-400 animate-spin-soft" />
                            </div>
                          )}
                          {renderStudioFocus === 'timeline' && renderPreviewError && (
                            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-xs text-red-400 bg-zinc-950/70 px-2 py-1 rounded">
                              {renderPreviewError}
                            </div>
                          )}
                        </div>
                      {renderStudioFocus === 'timeline' && (
                        <div className="w-full shrink-0 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3 flex flex-col gap-3">
                        <div className="flex-shrink-0 flex items-center justify-between gap-3 flex-wrap">
                          <div className="flex items-center gap-2">
                            <div className="text-[11px] text-zinc-500 uppercase tracking-widest">Timeline</div>
                            <div
                              className="relative"
                              onMouseEnter={() => {
                                if (addTrackMenuCloseRef.current) {
                                  window.clearTimeout(addTrackMenuCloseRef.current);
                                  addTrackMenuCloseRef.current = null;
                                }
                                setAddTrackMenuOpen(true);
                              }}
                              onMouseLeave={() => {
                                if (addTrackMenuCloseRef.current) {
                                  window.clearTimeout(addTrackMenuCloseRef.current);
                                }
                                addTrackMenuCloseRef.current = window.setTimeout(() => {
                                  setAddTrackMenuOpen(false);
                                  addTrackMenuCloseRef.current = null;
                                }, 120);
                              }}
                              onFocusCapture={() => setAddTrackMenuOpen(true)}
                              onBlurCapture={event => {
                                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                                  setAddTrackMenuOpen(false);
                                }
                              }}
                            >
                              <button
                                type="button"
                                aria-label="Add track"
                                title="Add track"
                                className="h-6 w-6 rounded-md border border-zinc-800 flex items-center justify-center text-zinc-300 hover:text-zinc-100 hover:border-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                +
                              </button>
                              {addTrackMenuOpen && (
                                <div className="absolute left-0 top-full mt-1 w-28 rounded-lg border border-zinc-800 bg-zinc-950 shadow-lg shadow-black/40 z-20">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setAddTrackMenuOpen(false);
                                      if (!renderTextTrackEnabled) {
                                        setRenderTextTrackEnabled(true);
                                      }
                                      setSelectedTrackKey('text');
                                      selectTrack('text');
                                    }}
                                    className="w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800/90 hover:text-zinc-50 rounded-lg transition-colors"
                                  >
                                    Text
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-zinc-500 flex-wrap justify-end min-w-0">
                            <div
                              className="flex items-baseline gap-1.5 tabular-nums shrink-0"
                              title="Playhead position"
                            >
                              <span className="text-xs font-medium text-lime-300">
                                {renderTimelineDuration > 0
                                  ? formatDurationFine(renderPlayheadSeconds)
                                  : '—'}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px]">Zoom</span>
                              <input
                                type="range"
                                min={renderTimelineMinScale}
                                max={4}
                                step={0.25}
                                value={renderTimelineScale}
                                onChange={e => setRenderTimelineScale(Number(e.target.value))}
                                className="w-20 accent-lime-400"
                              />
                              <span className="text-[10px]">{renderTimelineScale.toFixed(2)}x</span>
                            </div>
                            <span className="h-5" />
                          </div>
                        </div>
                        <div className="max-h-[min(45vh,28rem)] overflow-y-auto pr-1">
                        <div className="flex gap-2 text-[11px] text-zinc-400 min-w-0">
                          <div className="w-[7.5rem] shrink-0 flex flex-col gap-2">
                            <span className="h-5" />
                            {showRenderTimelineTextTrack ? (
                              <div
                                className="flex items-center gap-1.5 min-w-0"
                                style={{ height: renderTextTrackHeight }}
                                title="Text track · placeholder: text"
                              >
                                <Type size={14} className="text-zinc-500 shrink-0" />
                                <input
                                  type="text"
                                  className="w-full min-w-0 bg-zinc-900/80 border border-zinc-700/60 rounded px-1 py-0.5 text-[10px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-lime-500/40"
                                  value={renderTrackLabels.text ?? ''}
                                  placeholder="Text"
                                  onClick={e => e.stopPropagation()}
                                  onChange={e => updateRenderTrackLabel('text', e.target.value)}
                                />
                              </div>
                            ) : null}
                            {showRenderTimelineSubtitleTrack ? (
                              <div
                                className="flex items-center gap-1.5 min-w-0"
                                style={{ height: renderSubtitleTrackHeight }}
                                title={renderSubtitleFile ? `Subtitle · ${placeholderKeyByFileId[renderSubtitleFile.id] ?? 'subtitle'}` : 'Subtitle'}
                              >
                                <Type size={14} className="text-zinc-500 shrink-0" />
                                {renderSubtitleFile ? (
                                  <input
                                    type="text"
                                    className="w-full min-w-0 bg-zinc-900/80 border border-zinc-700/60 rounded px-1 py-0.5 text-[10px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-lime-500/40"
                                    value={renderTrackLabels[placeholderKeyByFileId[renderSubtitleFile.id] ?? ''] ?? ''}
                                    placeholder={renderSubtitleFile.name}
                                    onClick={e => e.stopPropagation()}
                                    onChange={e => updateRenderTrackLabel(placeholderKeyByFileId[renderSubtitleFile.id] ?? 'subtitle', e.target.value)}
                                  />
                                ) : (
                                  <span className="text-zinc-500 text-[10px] leading-tight">Subtitle</span>
                                )}
                              </div>
                            ) : null}
                            {showRenderTimelineImageTrack
                              ? renderImageFiles.map((file, idx) => (
                                  <div key={`img-label-${file.id}`} className="h-3 flex items-center gap-1.5 min-w-0" title={file.name}>
                                    <Image size={10} className="text-zinc-500 shrink-0" />
                                    <input
                                      type="text"
                                      className="w-full min-w-0 h-3 bg-zinc-900/80 border border-zinc-700/60 rounded px-1 text-[9px] leading-none text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-lime-500/40"
                                      value={renderTrackLabels[placeholderKeyByFileId[file.id] ?? `image${idx + 1}`] ?? ''}
                                      placeholder={`Image ${idx + 1}`}
                                      onClick={e => e.stopPropagation()}
                                      onChange={e => updateRenderTrackLabel(placeholderKeyByFileId[file.id] ?? `image${idx + 1}`, e.target.value)}
                                    />
                                  </div>
                                ))
                              : null}
                            {showRenderTimelineVideoTrack ? (
                              <div className="h-3 flex items-center gap-1.5 min-w-0" title={renderVideoFile ? `Video · ${placeholderKeyByFileId[renderVideoFile.id] ?? 'video'}` : 'Video'}>
                                <FileVideo size={10} className="text-zinc-500 shrink-0" />
                                {renderVideoFile ? (
                                  <input
                                    type="text"
                                    className="w-full min-w-0 h-3 bg-zinc-900/80 border border-zinc-700/60 rounded px-1 text-[9px] leading-none text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-lime-500/40"
                                    value={renderTrackLabels[placeholderKeyByFileId[renderVideoFile.id] ?? ''] ?? ''}
                                    placeholder={renderVideoFile.name}
                                    onClick={e => e.stopPropagation()}
                                    onChange={e => updateRenderTrackLabel(placeholderKeyByFileId[renderVideoFile.id] ?? 'video', e.target.value)}
                                  />
                                ) : (
                                  <span className="text-zinc-500 text-[10px]">Video</span>
                                )}
                              </div>
                            ) : null}
                            {showRenderTimelineAudioTrack ? (
                              <div className="h-3 flex items-center gap-1.5 min-w-0" title={renderAudioFile ? `Audio · ${placeholderKeyByFileId[renderAudioFile.id] ?? 'audio'}` : 'Audio'}>
                                <FileAudio size={10} className="text-zinc-500 shrink-0" />
                                {renderAudioFile ? (
                                  <input
                                    type="text"
                                    className="w-full min-w-0 h-3 bg-zinc-900/80 border border-zinc-700/60 rounded px-1 text-[9px] leading-none text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-lime-500/40"
                                    value={renderTrackLabels[placeholderKeyByFileId[renderAudioFile.id] ?? ''] ?? ''}
                                    placeholder={renderAudioFile.name}
                                    onClick={e => e.stopPropagation()}
                                    onChange={e => updateRenderTrackLabel(placeholderKeyByFileId[renderAudioFile.id] ?? 'audio', e.target.value)}
                                  />
                                ) : (
                                  <span className="text-zinc-500 text-[10px]">Audio</span>
                                )}
                              </div>
                            ) : null}
                          </div>
                          <div
                            ref={node => {
                              renderTimelineScrollRef.current = node;
                              timelineScrollContainerRef.current = node;
                            }}
                            onMouseMove={onRenderTimelineMouseMove}
                            onMouseUp={onRenderTimelineMouseUp}
                            onMouseLeave={onRenderTimelineMouseUp}
                            className="flex-1 overflow-x-auto render-timeline-scroll cursor-default"
                          >
                            <div
                              className="relative flex flex-col gap-2 pb-3"
                              style={{ width: renderTimelineWidth }}
                              onClick={resetTrackSelection}
                            >
                              {renderTimelineDuration > 0 && renderTimelineViewDuration > 0 && (
                                <div
                                  className="absolute top-0 bottom-0 z-10 pointer-events-none"
                                  style={{
                                    left: `${(renderPlayheadSeconds / renderTimelineViewDuration) * 100}%`
                                  }}
                                >
                                  <div className="w-0.5 bg-lime-400/80 h-full" />
                                  <div className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-lime-400/90 rounded-sm rotate-45" />
                                </div>
                              )}
                              <div
                                className="relative h-5 cursor-grab active:cursor-grabbing"
                                onMouseDown={onRenderTimelineMouseDown}
                                onClick={event => {
                                  onRenderTimelineClick(event);
                                  resetTrackSelection();
                                }}
                              >
                                {renderTimelineDuration > 0 && renderTimelineViewDuration > 0 && (
                                  <div className="absolute inset-0">
                                    {Array.from({ length: renderTimelineTickCount + 1 }).map((_, idx) => {
                                      const span =
                                        renderTimelineDuration / renderTimelineViewDuration;
                                      const left = (idx / renderTimelineTickCount) * span * 100;
                                      const time =
                                        formatDuration(
                                          (renderTimelineDuration * idx) / renderTimelineTickCount
                                        ) ?? '00:00';
                                      return (
                                        <div
                                          key={idx}
                                          className="absolute top-0 h-full border-r border-zinc-800"
                                          style={{ left: `${left}%` }}
                                        >
                                          <span className="absolute -top-0.5 left-1 text-[10px] text-zinc-500">
                                            {time}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                              {showRenderTimelineTextTrack ? (
                                <div
                                  className="rounded-md bg-zinc-800/60 relative overflow-hidden cursor-pointer"
                                  style={{ height: renderTextTrackHeight }}
                                  title="Text track"
                                  role="button"
                                  tabIndex={0}
                                  onClick={event => {
                                    event.stopPropagation();
                                    setSelectedTrackKey('text');
                                    if (!renderTextTrackEnabled) {
                                      setRenderTextTrackEnabled(true);
                                    }
                                    selectTrack('text');
                                  }}
                                  onKeyDown={event => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      setSelectedTrackKey('text');
                                      if (!renderTextTrackEnabled) {
                                        setRenderTextTrackEnabled(true);
                                      }
                                      selectTrack('text');
                                    }
                                  }}
                                >
                                  {selectedTrackKey === 'text' && renderTimelineDuration > 0 && renderTimelineViewDuration > 0 ? (
                                    <div
                                      className="absolute inset-y-0 left-0 rounded-md outline outline-2 outline-lime-400/80 pointer-events-none"
                                      style={{
                                        width: `${Math.min(100, (renderTimelineDuration / renderTimelineViewDuration) * 100)}%`
                                      }}
                                    />
                                  ) : null}
                                  {renderTimelineDuration > 0 && renderTimelineViewDuration > 0 && singleTextDuration > 0 ? (
                                    (() => {
                                      const startPct = Math.max(
                                        0,
                                        Math.min(100, (singleTextStartNumber / renderTimelineViewDuration) * 100)
                                      );
                                      const endPct = Math.max(
                                        0,
                                        Math.min(100, (singleTextSafeEnd / renderTimelineViewDuration) * 100)
                                      );
                                      const widthPct = Math.max(1.5, endPct - startPct);
                                      return (
                                        <div
                                          className="absolute bg-zinc-200 text-zinc-800 text-[10px] px-1 rounded-sm flex items-center truncate shadow-sm"
                                          style={{ left: `${startPct}%`, width: `${widthPct}%`, top: 2, height: Math.max(16, renderTextTrackHeight - 4) }}
                                          title={singleTextValueDraft}
                                        >
                                          <span className="truncate">{singleTextValueDraft || '...'}</span>
                                        </div>
                                      );
                                    })()
                                  ) : null}
                                </div>
                              ) : null}
                              {showRenderTimelineSubtitleTrack ? (
                                <div
                                  className="rounded-md bg-zinc-800/60 relative overflow-hidden cursor-pointer"
                                  style={{ height: renderSubtitleTrackHeight }}
                                  title={renderSubtitleFile ? renderSubtitleFile.name : 'Subtitle track'}
                                  role="button"
                                  tabIndex={0}
                                  onClick={event => {
                                    event.stopPropagation();
                                    setSelectedTrackKey('subtitle');
                                    if (renderSubtitleFile) {
                                      selectTrack('subtitle');
                                      setRenderSubtitleId(renderSubtitleFile.id);
                                    } else {
                                      openInspectorSection('subtitle');
                                    }
                                  }}
                                  onContextMenu={event => {
                                    if (!renderSubtitleFile) return;
                                    openRenderStudioTimelineContextMenu(event, { type: 'subtitle' });
                                  }}
                                  onKeyDown={event => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      setSelectedTrackKey('subtitle');
                                      if (renderSubtitleFile) {
                                        selectTrack('subtitle');
                                        setRenderSubtitleId(renderSubtitleFile.id);
                                      } else {
                                        openInspectorSection('subtitle');
                                      }
                                    }
                                  }}
                                >
                                  {selectedTrackKey === 'subtitle' && renderTimelineDuration > 0 && renderTimelineViewDuration > 0 && renderSubtitleDuration ? (
                                    <div
                                      className="absolute inset-y-0 left-0 rounded-md outline outline-2 outline-lime-400/80 pointer-events-none"
                                      style={{
                                        width: `${Math.min(100, (renderSubtitleDuration / renderTimelineViewDuration) * 100)}%`
                                      }}
                                    />
                                  ) : null}
                                  {renderTimelineDuration > 0 && renderSubtitleCues.length > 0 ? (
                                    renderSubtitleLanes.map((lane, laneIndex) => (
                                      lane.map((cue, idx) => {
                                        const startPct = Math.max(
                                          0,
                                          Math.min(
                                            100,
                                            (cue.start / renderTimelineViewDuration) * 100
                                          )
                                        );
                                        const endPct = Math.max(
                                          0,
                                          Math.min(100, (cue.end / renderTimelineViewDuration) * 100)
                                        );
                                        const widthPct = Math.max(1.5, endPct - startPct);
                                        const top = (renderSubtitleLanes.length - 1 - laneIndex) * renderSubtitleLaneHeight + 2;
                                        const height = Math.max(16, renderSubtitleLaneHeight - 4);
                                        return (
                                          <div
                                            key={`${cue.start}-${cue.end}-${laneIndex}-${idx}`}
                                            className="absolute bg-zinc-200 text-zinc-800 text-[10px] px-1 rounded-sm flex items-center truncate shadow-sm"
                                            style={{ left: `${startPct}%`, width: `${widthPct}%`, top, height }}
                                            title={cue.text}
                                          >
                                            <span className="truncate">{cue.text || '...'}</span>
                                          </div>
                                        );
                                      })
                                    ))
                                  ) : renderSubtitleDuration ? (
                                    <div
                                      className="h-full rounded-sm bg-zinc-200/70"
                                      style={{
                                        width: `${Math.min(100, (renderSubtitleDuration / renderTimelineViewDuration) * 100)}%`
                                      }}
                                    />
                                  ) : null}
                                </div>
                              ) : null}
                              {showRenderTimelineImageTrack
                                ? renderImageDurationEntries.map((entry, idx) => (
                                    <div
                                      key={`img-track-${entry.id}`}
                                      className="h-3 rounded-full bg-zinc-800 relative shrink-0 cursor-pointer"
                                      title={`${renderImageFiles[idx]?.name ?? `Image ${idx + 1}`}`}
                                      role="button"
                                      tabIndex={0}
                                      onClick={event => {
                                        event.stopPropagation();
                                        setSelectedTrackKey(`image:${entry.id}`);
                                        selectTrack('image');
                                      }}
                                      onContextMenu={event => {
                                        openRenderStudioTimelineContextMenu(event, { type: 'image', id: entry.id });
                                      }}
                                      onKeyDown={event => {
                                        if (event.key === 'Enter' || event.key === ' ') {
                                          event.preventDefault();
                                          event.stopPropagation();
                                          setSelectedTrackKey(`image:${entry.id}`);
                                          selectTrack('image');
                                        }
                                      }}
                                    >
                                      {renderTimelineDuration > 0 && renderTimelineViewDuration > 0 ? (
                                        <div
                                          className={`h-full rounded-full bg-sky-500/45 ${
                                            selectedTrackKey === `image:${entry.id}` ? 'outline outline-2 outline-lime-400/80' : ''
                                          }`}
                                          style={{
                                            width: `${Math.min(100, (entry.duration / renderTimelineViewDuration) * 100)}%`
                                          }}
                                        />
                                      ) : null}
                                    </div>
                                  ))
                                : null}
                              {showRenderTimelineVideoTrack ? (
                                <div
                                  className="h-3 rounded-full bg-zinc-800 relative cursor-pointer"
                                  role="button"
                                  tabIndex={0}
                                  title={renderVideoFile ? renderVideoFile.name : 'Video track'}
                                  onClick={event => {
                                    event.stopPropagation();
                                    setSelectedTrackKey('video');
                                    if (renderVideoFile) {
                                      selectTrack('video');
                                      setRenderVideoId(renderVideoFile.id);
                                    } else {
                                      openInspectorSection('video');
                                    }
                                  }}
                                  onContextMenu={event => {
                                    if (!renderVideoFile) return;
                                    openRenderStudioTimelineContextMenu(event, { type: 'video' });
                                  }}
                                  onKeyDown={event => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      setSelectedTrackKey('video');
                                      if (renderVideoFile) {
                                        selectTrack('video');
                                        setRenderVideoId(renderVideoFile.id);
                                      } else {
                                        openInspectorSection('video');
                                      }
                                    }
                                  }}
                                >
                                  {renderVideoDuration && renderTimelineDuration > 0 ? (
                                    <div
                                      className={`h-full rounded-full bg-lime-500/50 ${
                                        selectedTrackKey === 'video' ? 'outline outline-2 outline-lime-400/80' : ''
                                      }`}
                                      style={{
                                        width: `${Math.min(100, (renderVideoDuration / renderTimelineViewDuration) * 100)}%`
                                      }}
                                    />
                                  ) : null}
                                </div>
                              ) : null}
                              {showRenderTimelineAudioTrack ? (
                                <div
                                  className="h-3 rounded-full bg-zinc-800 relative cursor-pointer"
                                  role="button"
                                  tabIndex={0}
                                  title={renderAudioFile ? renderAudioFile.name : 'Audio track'}
                                  onClick={event => {
                                    event.stopPropagation();
                                    setSelectedTrackKey('audio');
                                    if (renderAudioFile) {
                                      selectTrack('audio');
                                      setRenderAudioId(renderAudioFile.id);
                                    } else {
                                      openInspectorSection('audio');
                                    }
                                  }}
                                  onContextMenu={event => {
                                    if (!renderAudioFile) return;
                                    openRenderStudioTimelineContextMenu(event, { type: 'audio' });
                                  }}
                                  onKeyDown={event => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      setSelectedTrackKey('audio');
                                      if (renderAudioFile) {
                                        selectTrack('audio');
                                        setRenderAudioId(renderAudioFile.id);
                                      } else {
                                        openInspectorSection('audio');
                                      }
                                    }
                                  }}
                                >
                                  {renderAudioDuration && renderTimelineDuration > 0 ? (
                                    <div
                                      className={`h-full rounded-full bg-amber-500/50 ${
                                        selectedTrackKey === 'audio' ? 'outline outline-2 outline-lime-400/80' : ''
                                      }`}
                                      style={{
                                        width: `${Math.min(100, (renderAudioDuration / renderTimelineViewDuration) * 100)}%`
                                      }}
                                    />
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          </div>
                          <div className="w-[52px] flex flex-col gap-2 items-end text-zinc-500 text-[10px]">
                            <span className="h-5" />
                            {showRenderTimelineTextTrack ? (
                              <span className="flex items-center" style={{ height: renderTextTrackHeight }}>
                                {singleTextDuration > 0 ? formatDuration(singleTextDuration) ?? '--' : '--'}
                              </span>
                            ) : null}
                            {showRenderTimelineSubtitleTrack ? (
                              <span className="flex items-center" style={{ height: renderSubtitleTrackHeight }}>
                                {formatDuration(renderSubtitleDuration) ?? '--'}
                              </span>
                            ) : null}
                            {showRenderTimelineImageTrack
                              ? renderImageDurationEntries.map(entry => (
                                  <span key={`img-dur-${entry.id}`} className="h-3 flex items-center">
                                    {formatDuration(entry.duration) ?? '--'}
                                  </span>
                                ))
                              : null}
                            {showRenderTimelineVideoTrack ? (
                              <span className="h-3 flex items-center">{formatDuration(renderVideoDuration) ?? '--'}</span>
                            ) : null}
                            {showRenderTimelineAudioTrack ? (
                              <span className="h-3 flex items-center">{formatDuration(renderAudioDuration) ?? '--'}</span>
                            ) : null}
                          </div>
                        </div>
                        </div>
                      </div>
                      )}
                    </div>
                  </div>

                  <div className="border-l border-zinc-800 bg-zinc-900/70 p-4 flex flex-col gap-4 min-h-0 overflow-y-auto">
                    <div className="text-[11px] text-zinc-500 uppercase tracking-widest">Inspector</div>
                    {renderStudioFocus === 'timeline' && (
                      <div className="flex flex-col gap-2 rounded-xl border border-zinc-800 bg-zinc-950/40 p-3 shrink-0">
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
                              {renderTemplates.map(template => {
                                const isSelected = runPipelineRenderTemplateId === template.id;
                                const label = isSelected && isRenderTemplateDirty ? `*${template.name}` : template.name;
                                return (
                                  <option key={template.id} value={template.id}>
                                    {label}
                                  </option>
                                );
                              })}
                            </select>
                            <div
                              className="relative shrink-0"
                              onMouseEnter={() => {
                                if (templateMenuCloseRef.current) {
                                  window.clearTimeout(templateMenuCloseRef.current);
                                  templateMenuCloseRef.current = null;
                                }
                                setTemplateMenuOpen(true);
                              }}
                              onMouseLeave={() => {
                                if (templateMenuCloseRef.current) {
                                  window.clearTimeout(templateMenuCloseRef.current);
                                }
                                templateMenuCloseRef.current = window.setTimeout(() => {
                                  setTemplateMenuOpen(false);
                                  templateMenuCloseRef.current = null;
                                }, 120);
                              }}
                              onFocusCapture={() => setTemplateMenuOpen(true)}
                              onBlurCapture={event => {
                                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                                  setTemplateMenuOpen(false);
                                }
                              }}
                            >
                              <button
                                type="button"
                                aria-label="Template options"
                                title="Template options"
                                className="inline-flex items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-xs font-medium text-zinc-200 hover:border-lime-500/50 hover:text-lime-300 shrink-0"
                              >
                                <Menu size={14} />
                              </button>
                              {templateMenuOpen && (
                                <div className="absolute right-0 top-full mt-1 w-28 rounded-lg border border-zinc-800 bg-zinc-950 shadow-lg shadow-black/40 z-20">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setTemplateMenuOpen(false);
                                      resetRenderToDefault();
                                    }}
                                    className={`w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800/90 hover:text-zinc-50 transition-colors ${
                                      isCustomTemplate ? 'rounded-lg' : 'rounded-t-lg'
                                    }`}
                                  >
                                    Reset to default
                                  </button>
                                  {!isCustomTemplate && isRenderTemplateDirty && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (!selectedTemplate) return;
                                        setTemplateMenuOpen(false);
                                        saveRenderTemplateCurrent(selectedTemplate);
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
                                          setTemplateMenuOpen(false);
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
                                            if (!selectedTemplate) return;
                                            setTemplateMenuOpen(false);
                                            restoreRenderTemplateCurrent(selectedTemplate);
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
                                          setTemplateMenuOpen(false);
                                          deleteRenderTemplateWithConfirm(selectedTemplate.id, selectedTemplate.name);
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
                        <div className="rounded-lg border border-zinc-800/70 bg-zinc-950/50 p-2">
                          <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2">Placeholders</div>
                          <div className="flex flex-col gap-2 text-[10px] text-zinc-400">
                            {renderTextTrackEnabled && (
                              (() => {
                                const textPlaceholderLabel = (renderTrackLabels?.text ?? '').trim() || 'text';
                                return (
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="shrink-0 w-7 flex justify-center text-zinc-500" aria-hidden>
                                  <Type size={14} />
                                </span>
                                <span
                                  className="w-24 shrink-0 truncate text-[10px] font-medium text-zinc-300"
                                  title={textPlaceholderLabel}
                                >
                                  {textPlaceholderLabel}
                                </span>
                                <input
                                  type="text"
                                  value={renderParamsDraft.text.singleText ?? ''}
                                  onChange={e => {
                                    if (!renderTextTrackEnabled) setRenderTextTrackEnabled(true);
                                    updateRenderParamDraft('text', 'singleText', e.target.value);
                                  }}
                                  onFocus={() => {
                                    if (!renderTextTrackEnabled) setRenderTextTrackEnabled(true);
                                    holdPreview();
                                  }}
                                  onBlur={() => releasePreview(() => commitRenderParamDraftValue('text', 'singleText'))}
                                  placeholder="Enter text..."
                                  className="flex-1 min-w-0 text-[10px] text-zinc-200 border border-zinc-800/80 rounded px-2 py-1 bg-zinc-900/40 focus:outline-none"
                                />
                              </div>
                                );
                              })()
                            )}
                            {!isCustomTemplate && selectedTemplate
                              ? Object.keys(selectedTemplate.config.inputsMap ?? {}).map(refKey => {
                                  const slotType = inputRefPlaceholderType(refKey);
                                  const files =
                                    slotType != null
                                      ? projectMediaFilesByKind[slotType]
                                      : projectMediaFilesByKind.all;
                                  const saved =
                                    (selectedTemplate.config.timeline?.trackLabels?.[refKey] ?? '').trim();
                                  const displayName = saved || refKey;
                                  const selectedId = renderTemplateApplyMap?.[refKey] ?? '';
                                  const selectedFile = files.find(f => f.id === selectedId);
                                  const icon =
                                    slotType === 'video' ? (
                                      <FileVideo size={14} className="text-zinc-500" aria-hidden />
                                    ) : slotType === 'audio' ? (
                                      <FileAudio size={14} className="text-zinc-500" aria-hidden />
                                    ) : slotType === 'subtitle' ? (
                                      <FileText size={14} className="text-zinc-500" aria-hidden />
                                    ) : slotType === 'image' ? (
                                      <Image size={14} className="text-zinc-500" aria-hidden />
                                    ) : (
                                      <File size={14} className="text-zinc-500" aria-hidden />
                                    );
                                  return (
                                    <div key={`tpl-ph-${refKey}`} className="flex items-center gap-2 min-w-0">
                                      <span className="shrink-0 w-7 flex justify-center">{icon}</span>
                                      <span
                                        className="w-24 shrink-0 truncate text-[10px] font-medium text-zinc-300"
                                        title={refKey}
                                      >
                                        {displayName}
                                      </span>
                                      <select
                                        value={selectedId}
                                        onChange={e => {
                                          if (!onRenderTemplatePlaceholderFile) return;
                                          onRenderTemplatePlaceholderFile(refKey, e.target.value);
                                        }}
                                        title={selectedFile?.name ?? ''}
                                        className="flex-1 min-w-0 bg-zinc-900/80 border border-zinc-700/60 rounded px-2 py-1 text-[10px] text-zinc-200 focus:outline-none focus:ring-1 focus:ring-lime-500/40"
                                      >
                                        <option value="">Select file…</option>
                                        {files.map(file => (
                                          <option key={file.id} value={file.id} title={file.name}>
                                            {truncatePlaceholderFileName(file.name)}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  );
                                })
                              : null}
                            {isCustomTemplate && renderSubtitleFile && (() => {
                              const key = placeholderKeyByFileId[renderSubtitleFile.id] ?? 'subtitle';
                              return (
                                <div key="tpl-ph-subtitle" className="flex items-center gap-2 min-w-0">
                                  <span className="shrink-0 w-7 flex justify-center text-zinc-500" aria-hidden>
                                    <FileText size={14} />
                                  </span>
                                  <span
                                    className="w-24 shrink-0 truncate text-[10px] font-medium text-zinc-300"
                                    title={key}
                                  >
                                    {key}
                                  </span>
                                  <select
                                    value={renderSubtitleId ?? ''}
                                    onChange={e => {
                                      const newId = e.target.value;
                                      if (!newId) return;
                                      const prevId = renderSubtitleId;
                                      setRenderSubtitleId(newId);
                                      setRenderInputFileIds(prev => {
                                        const without = prevId ? prev.filter(id => id !== prevId) : prev;
                                        return without.includes(newId) ? without : [...without, newId];
                                      });
                                    }}
                                    title={renderSubtitleFile.name}
                                    className="flex-1 min-w-0 bg-zinc-900/80 border border-zinc-700/60 rounded px-2 py-1 text-[10px] text-zinc-200 focus:outline-none focus:ring-1 focus:ring-lime-500/40"
                                  >
                                    {projectMediaFilesByKind.subtitle.map(file => (
                                      <option key={file.id} value={file.id} title={file.name}>
                                        {truncatePlaceholderFileName(file.name)}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              );
                            })()}
                            {isCustomTemplate && renderVideoFile && (() => {
                              const key = placeholderKeyByFileId[renderVideoFile.id] ?? 'video';
                              return (
                                <div key="tpl-ph-video" className="flex items-center gap-2 min-w-0">
                                  <span className="shrink-0 w-7 flex justify-center text-zinc-500" aria-hidden>
                                    <FileVideo size={14} />
                                  </span>
                                  <span
                                    className="w-24 shrink-0 truncate text-[10px] font-medium text-zinc-300"
                                    title={key}
                                  >
                                    {key}
                                  </span>
                                  <select
                                    value={renderVideoId ?? ''}
                                    onChange={e => {
                                      const newId = e.target.value;
                                      if (!newId) return;
                                      const prevId = renderVideoId;
                                      setRenderVideoId(newId);
                                      setRenderInputFileIds(prev => {
                                        const without = prevId ? prev.filter(id => id !== prevId) : prev;
                                        return without.includes(newId) ? without : [...without, newId];
                                      });
                                    }}
                                    title={renderVideoFile.name}
                                    className="flex-1 min-w-0 bg-zinc-900/80 border border-zinc-700/60 rounded px-2 py-1 text-[10px] text-zinc-200 focus:outline-none focus:ring-1 focus:ring-lime-500/40"
                                  >
                                    {projectMediaFilesByKind.video.map(file => (
                                      <option key={file.id} value={file.id} title={file.name}>
                                        {truncatePlaceholderFileName(file.name)}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              );
                            })()}
                            {isCustomTemplate && renderAudioFile && (() => {
                              const key = placeholderKeyByFileId[renderAudioFile.id] ?? 'audio';
                              return (
                                <div key="tpl-ph-audio" className="flex items-center gap-2 min-w-0">
                                  <span className="shrink-0 w-7 flex justify-center text-zinc-500" aria-hidden>
                                    <FileAudio size={14} />
                                  </span>
                                  <span
                                    className="w-24 shrink-0 truncate text-[10px] font-medium text-zinc-300"
                                    title={key}
                                  >
                                    {key}
                                  </span>
                                  <select
                                    value={renderAudioId ?? ''}
                                    onChange={e => {
                                      const newId = e.target.value;
                                      if (!newId) return;
                                      const prevId = renderAudioId;
                                      setRenderAudioId(newId);
                                      setRenderInputFileIds(prev => {
                                        const without = prevId ? prev.filter(id => id !== prevId) : prev;
                                        return without.includes(newId) ? without : [...without, newId];
                                      });
                                    }}
                                    title={renderAudioFile.name}
                                    className="flex-1 min-w-0 bg-zinc-900/80 border border-zinc-700/60 rounded px-2 py-1 text-[10px] text-zinc-200 focus:outline-none focus:ring-1 focus:ring-lime-500/40"
                                  >
                                    {projectMediaFilesByKind.audio.map(file => (
                                      <option key={file.id} value={file.id} title={file.name}>
                                        {truncatePlaceholderFileName(file.name)}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              );
                            })()}
                            {isCustomTemplate && renderImageFiles.length > 0
                              ? renderImageFiles.map((file, idx) => {
                                  const key = placeholderKeyByFileId[file.id] ?? `image${idx + 1}`;
                                  return (
                                    <div key={`tpl-ph-img-${file.id}`} className="flex items-center gap-2 min-w-0">
                                      <span className="shrink-0 w-7 flex justify-center text-zinc-500" aria-hidden>
                                        <Image size={14} />
                                      </span>
                                      <span
                                        className="w-24 shrink-0 truncate text-[10px] font-medium text-zinc-300"
                                        title={key}
                                      >
                                        {key}
                                      </span>
                                      <select
                                        value={file.id}
                                        onChange={e => {
                                          const newId = e.target.value;
                                          if (!newId || newId === file.id) return;
                                          const prevFileId = file.id;
                                          setRenderImageOrderIds(prev =>
                                            prev.map(id => (id === prevFileId ? newId : id))
                                          );
                                          setRenderInputFileIds(prev => {
                                            const without = prev.filter(id => id !== prevFileId);
                                            return without.includes(newId) ? without : [...without, newId];
                                          });
                                          setRenderImageDurations(prev => {
                                            if (!prev[prevFileId]) return prev;
                                            const next = { ...prev };
                                            next[newId] = next[prevFileId];
                                            delete next[prevFileId];
                                            return next;
                                          });
                                          setRenderImageTransforms(prev => {
                                            if (!prev[prevFileId]) return prev;
                                            const next = { ...prev };
                                            next[newId] = next[prevFileId];
                                            delete next[prevFileId];
                                            return next;
                                          });
                                        }}
                                        title={file.name}
                                        className="flex-1 min-w-0 bg-zinc-900/80 border border-zinc-700/60 rounded px-2 py-1 text-[10px] text-zinc-200 focus:outline-none focus:ring-1 focus:ring-lime-500/40"
                                      >
                                        {projectMediaFilesByKind.image.map(f => (
                                          <option key={f.id} value={f.id} title={f.name}>
                                            {truncatePlaceholderFileName(f.name)}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  );
                                })
                              : null}
                            {!renderTextTrackEnabled &&
                              !isCustomTemplate &&
                              selectedTemplate &&
                              Object.keys(selectedTemplate.config.inputsMap ?? {}).length === 0 && (
                                <div className="text-[10px] text-zinc-500">No placeholders in this template.</div>
                              )}
                            {isCustomTemplate &&
                              !renderTextTrackEnabled &&
                              !renderSubtitleFile &&
                              !renderVideoFile &&
                              !renderAudioFile &&
                              renderImageFiles.length === 0 && (
                                <div className="text-[10px] text-zinc-500">No placeholders available yet.</div>
                              )}
                          </div>
                        </div>
                      </div>
                    )}
                  {renderStudioFocus === 'timeline' ? (
                      <div className="flex flex-col gap-3 text-xs text-zinc-300 min-h-0">
                        {activeInspectorSection === 'timeline' && (
                          <div className="rounded-xl border border-zinc-800 bg-zinc-950/40">
                          <div
                            role="button"
                            tabIndex={0}
                            aria-expanded={activeInspectorSection === 'timeline'}
                            onClick={() => openInspectorSection('timeline')}
                            onKeyDown={event => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                openInspectorSection('timeline');
                              }
                            }}
                            className="flex items-center justify-between px-3 py-2 border-b border-zinc-800/60 cursor-pointer hover:bg-zinc-900/60 transition-colors"
                          >
                            <span className="text-[11px] uppercase tracking-widest text-zinc-500">Timeline</span>
                            <button
                              onClick={event => {
                                event.stopPropagation();
                                openInspectorSection('timeline');
                              }}
                              className="h-6 w-6 rounded-md border border-zinc-800 flex items-center justify-center hover:border-zinc-700"
                            >
                              <Menu size={12} />
                            </button>
                          </div>
                          {activeInspectorSection === 'timeline' && (
                            <div className="p-3 flex flex-col gap-3">
                              <div className="grid grid-cols-2 gap-2">
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Resolution</label>
                                  <input
                                    type="text"
                                    placeholder="1920x1080"
                                    value={renderParamsDraft.timeline.resolution}
                                    onChange={e => updateRenderParamDraft('timeline', 'resolution', e.target.value)}
                                    onBlur={() => commitRenderParamDraftValue('timeline', 'resolution')}
                                    onKeyDown={commitRenderParamDraftOnEnter('timeline', 'resolution')}
                                    className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                                  />
                                </div>
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Framerate</label>
                                  <select
                                    value={renderParamsDraft.timeline.framerate}
                                    onChange={e => {
                                      const v = e.target.value;
                                      updateRenderParamDraft('timeline', 'framerate', v);
                                      updateRenderParam('timeline', 'framerate', v);
                                    }}
                                    className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                                  >
                                    <option value="24">24 fps</option>
                                    <option value="25">25 fps</option>
                                    <option value="30">30 fps</option>
                                    <option value="50">50 fps</option>
                                    <option value="60">60 fps</option>
                                  </select>
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Codec</label>
                                  <select
                                    value={renderParamsDraft.render?.codec ?? 'h264'}
                                    onChange={e => {
                                      const v = e.target.value === 'h265' ? 'h265' : 'h264';
                                      updateRenderParamDraft('render', 'codec', v);
                                      updateRenderParam('render', 'codec', v);
                                    }}
                                    className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                                  >
                                    <option value="h264">H.264 (libx264)</option>
                                    <option value="h265">H.265 (libx265)</option>
                                  </select>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                        )}

                        {activeInspectorSection === 'video' && (
                        <div className="rounded-xl border border-zinc-800 bg-zinc-950/40">
                          <div
                            role="button"
                            tabIndex={0}
                            aria-expanded={activeInspectorSection === 'video'}
                            onClick={() => openInspectorSection('video')}
                            onKeyDown={event => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                openInspectorSection('video');
                              }
                            }}
                            className="flex items-center justify-between px-3 py-2 border-b border-zinc-800/60 cursor-pointer hover:bg-zinc-900/60 transition-colors"
                          >
                            <span className="text-[11px] uppercase tracking-widest text-zinc-500">Video</span>
                            <button
                              onClick={event => {
                                event.stopPropagation();
                                openInspectorSection('video');
                              }}
                              className="h-6 w-6 rounded-md border border-zinc-800 flex items-center justify-center hover:border-zinc-700"
                            >
                              <Menu size={12} />
                            </button>
                          </div>
                          {activeInspectorSection === 'video' && (
                            <div className="p-3 flex flex-col gap-2">
                              {renderVideoFile ? (
                                <>
                                  <div className="flex items-center gap-2 text-sm text-zinc-100">
                                    <FileVideo size={14} />
                                    <span className="truncate font-semibold">{renderVideoFile.name}</span>
                                  </div>
                                  <div className="flex items-center justify-between text-[11px] text-zinc-500">
                                    <span>Duration</span>
                                    <span className="text-zinc-300">{formatDuration(renderVideoDuration) ?? '--'}</span>
                                  </div>
                                  <div className="flex items-center justify-between text-[11px] text-zinc-500">
                                    <span>Size</span>
                                    <span className="text-zinc-300">{renderVideoFile.size ?? renderVideoFile.sizeBytes ?? '--'}</span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2 pt-1">
                                    <div className="flex flex-col gap-1">
                                      <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Trim Start (s)</label>
                                      <input
                                        type="number"
                                        step="0.1"
                                        value={renderParamsDraft.video.trimStart}
                                        onChange={e => updateRenderParamDraft('video', 'trimStart', e.target.value)}
                                        onFocus={holdPreview}
                                        onBlur={() => releasePreview(() => commitRenderParamDraftValue('video', 'trimStart'))}
                                        onKeyDown={releasePreviewOnEnter(() => commitRenderParamDraftValue('video', 'trimStart'))}
                                        className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                                      />
                                    </div>
                                    <div className="flex flex-col gap-1">
                                      <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Trim End (s)</label>
                                      <input
                                        type="number"
                                        step="0.1"
                                        value={renderParamsDraft.video.trimEnd}
                                        onChange={e => updateRenderParamDraft('video', 'trimEnd', e.target.value)}
                                        onFocus={holdPreview}
                                        onBlur={() => releasePreview(() => commitRenderParamDraftValue('video', 'trimEnd'))}
                                        onKeyDown={releasePreviewOnEnter(() => commitRenderParamDraftValue('video', 'trimEnd'))}
                                        className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                                      />
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <div className="flex flex-col gap-1">
                                      <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Speed</label>
                                      <input
                                        type="number"
                                        step="0.1"
                                        min="0.25"
                                        value={renderParamsDraft.video.speed}
                                        onChange={e => updateRenderParamDraft('video', 'speed', e.target.value)}
                                        onFocus={holdPreview}
                                        onBlur={() => releasePreview(() => commitRenderParamDraftValue('video', 'speed'))}
                                        onKeyDown={releasePreviewOnEnter(() => commitRenderParamDraftValue('video', 'speed'))}
                                        className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                                      />
                                    </div>
                                    <div className="flex flex-col gap-1">
                                      <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Volume (%)</label>
                                      <input
                                        type="number"
                                        step="1"
                                        min="0"
                                        value={renderParamsDraft.video.volume}
                                        onChange={e => updateRenderParamDraft('video', 'volume', e.target.value)}
                                        onFocus={holdPreview}
                                        onBlur={() => releasePreview(() => commitRenderParamDraftValue('video', 'volume'))}
                                        onKeyDown={releasePreviewOnEnter(() => commitRenderParamDraftValue('video', 'volume'))}
                                        className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                                      />
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <div className="flex flex-col gap-1">
                                      <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Fit</label>
                                      <select
                                        value={renderParamsDraft.video.fit}
                                        onChange={e => {
                                          const v = e.target.value;
                                          updateRenderParamDraft('video', 'fit', v);
                                          updateRenderParam('video', 'fit', v);
                                        }}
                                        className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                                      >
                                        <option value="contain">Contain</option>
                                        <option value="cover">Cover</option>
                                        <option value="stretch">Stretch</option>
                                      </select>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                      <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Scale (%)</label>
                                      <input
                                        type="number"
                                        step="1"
                                        min="0"
                                        value={renderParamsDraft.video.scale ?? '100'}
                                        onChange={e => updateRenderParamDraft('video', 'scale', e.target.value)}
                                        onFocus={holdPreview}
                                        onBlur={() => releasePreview(() => commitRenderParamDraftValue('video', 'scale'))}
                                        onKeyDown={releasePreviewOnEnter(() => commitRenderParamDraftValue('video', 'scale'))}
                                        className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                                      />
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <div className="flex flex-col gap-1">
                                      <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Position X (%)</label>
                                      <input
                                        type="number"
                                        step="1"
                                        value={renderParamsDraft.video.positionX}
                                        onChange={e => updateRenderParamDraft('video', 'positionX', e.target.value)}
                                        onFocus={holdPreview}
                                        onBlur={() => releasePreview(() => commitRenderParamDraftValue('video', 'positionX'))}
                                        onKeyDown={releasePreviewOnEnter(() => commitRenderParamDraftValue('video', 'positionX'))}
                                        className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                                      />
                                    </div>
                                    <div className="flex flex-col gap-1">
                                      <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Position Y (%)</label>
                                      <input
                                        type="number"
                                        step="1"
                                        value={renderParamsDraft.video.positionY}
                                        onChange={e => updateRenderParamDraft('video', 'positionY', e.target.value)}
                                        onFocus={holdPreview}
                                        onBlur={() => releasePreview(() => commitRenderParamDraftValue('video', 'positionY'))}
                                        onKeyDown={releasePreviewOnEnter(() => commitRenderParamDraftValue('video', 'positionY'))}
                                        className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                                      />
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <div className="flex flex-col gap-1">
                                      <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Rotation (deg)</label>
                                      <input
                                        type="number"
                                        step="1"
                                        value={renderParamsDraft.video.rotation}
                                        onChange={e => updateRenderParamDraft('video', 'rotation', e.target.value)}
                                        onFocus={holdPreview}
                                        onBlur={() => releasePreview(() => commitRenderParamDraftValue('video', 'rotation'))}
                                        onKeyDown={releasePreviewOnEnter(() => commitRenderParamDraftValue('video', 'rotation'))}
                                        className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                                      />
                                    </div>
                                    <div className="flex flex-col gap-1">
                                      <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Opacity (%)</label>
                                      <input
                                        type="number"
                                        step="1"
                                        min="0"
                                        max="100"
                                        value={renderParamsDraft.video.opacity}
                                        onChange={e => updateRenderParamDraft('video', 'opacity', e.target.value)}
                                        onFocus={holdPreview}
                                        onBlur={() => releasePreview(() => commitRenderParamDraftValue('video', 'opacity'))}
                                        onKeyDown={releasePreviewOnEnter(() => commitRenderParamDraftValue('video', 'opacity'))}
                                        className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                                      />
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <div className="flex flex-col gap-1">
                                      <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Crop X (%)</label>
                                      <input
                                        type="number"
                                        step="1"
                                        value={renderParamsDraft.video.cropX}
                                        onChange={e => updateRenderParamDraft('video', 'cropX', e.target.value)}
                                        onFocus={holdPreview}
                                        onBlur={() => releasePreview(() => commitRenderParamDraftValue('video', 'cropX'))}
                                        onKeyDown={releasePreviewOnEnter(() => commitRenderParamDraftValue('video', 'cropX'))}
                                        className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                                      />
                                    </div>
                                    <div className="flex flex-col gap-1">
                                      <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Crop Y (%)</label>
                                      <input
                                        type="number"
                                        step="1"
                                        value={renderParamsDraft.video.cropY}
                                        onChange={e => updateRenderParamDraft('video', 'cropY', e.target.value)}
                                        onFocus={holdPreview}
                                        onBlur={() => releasePreview(() => commitRenderParamDraftValue('video', 'cropY'))}
                                        onKeyDown={releasePreviewOnEnter(() => commitRenderParamDraftValue('video', 'cropY'))}
                                        className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                                      />
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <div className="flex flex-col gap-1">
                                      <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Crop W (%)</label>
                                      <input
                                        type="number"
                                        step="1"
                                        value={renderParamsDraft.video.cropW}
                                        onChange={e => updateRenderParamDraft('video', 'cropW', e.target.value)}
                                        onFocus={holdPreview}
                                        onBlur={() => releasePreview(() => commitRenderParamDraftValue('video', 'cropW'))}
                                        onKeyDown={releasePreviewOnEnter(() => commitRenderParamDraftValue('video', 'cropW'))}
                                        className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                                      />
                                    </div>
                                    <div className="flex flex-col gap-1">
                                      <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Crop H (%)</label>
                                      <input
                                        type="number"
                                        step="1"
                                        value={renderParamsDraft.video.cropH}
                                        onChange={e => updateRenderParamDraft('video', 'cropH', e.target.value)}
                                        onFocus={holdPreview}
                                        onBlur={() => releasePreview(() => commitRenderParamDraftValue('video', 'cropH'))}
                                        onKeyDown={releasePreviewOnEnter(() => commitRenderParamDraftValue('video', 'cropH'))}
                                        className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                                      />
                                    </div>
                                  </div>
                                  <div className="border border-zinc-800/70 rounded-lg p-2 mt-1 bg-zinc-950/50">
                                    <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2">Mask</div>
                                    <div className="grid grid-cols-2 gap-2">
                                      <div className="flex flex-col gap-1">
                                        <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Type</label>
                                        <select
                                          value={renderParamsDraft.video.maskType ?? 'none'}
                                          onChange={e => {
                                            const v = e.target.value;
                                            updateRenderParamDraft('video', 'maskType', v);
                                            updateRenderParam('video', 'maskType', v);
                                          }}
                                          className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                                        >
                                          <option value="none">None</option>
                                          <option value="rect">Rectangle</option>
                                          <option value="circle">Circle</option>
                                        </select>
                                      </div>
                                    </div>
                                    {renderParamsDraft.video.maskType && renderParamsDraft.video.maskType !== 'none' && (
                                      <div className="grid grid-cols-2 gap-2 mt-2">
                                        <div className="flex flex-col gap-1">
                                          <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Left (%)</label>
                                          <input
                                            type="number"
                                            step="1"
                                            value={renderParamsDraft.video.maskLeft}
                                            onChange={e => updateRenderParamDraft('video', 'maskLeft', e.target.value)}
                                            onFocus={holdPreview}
                                            onBlur={() => releasePreview(() => commitRenderParamDraftValue('video', 'maskLeft'))}
                                            onKeyDown={releasePreviewOnEnter(() => commitRenderParamDraftValue('video', 'maskLeft'))}
                                            className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                                          />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                          <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Right (%)</label>
                                          <input
                                            type="number"
                                            step="1"
                                            value={renderParamsDraft.video.maskRight}
                                            onChange={e => updateRenderParamDraft('video', 'maskRight', e.target.value)}
                                            onFocus={holdPreview}
                                            onBlur={() => releasePreview(() => commitRenderParamDraftValue('video', 'maskRight'))}
                                            onKeyDown={releasePreviewOnEnter(() => commitRenderParamDraftValue('video', 'maskRight'))}
                                            className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                                          />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                          <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Top (%)</label>
                                          <input
                                            type="number"
                                            step="1"
                                            value={renderParamsDraft.video.maskTop}
                                            onChange={e => updateRenderParamDraft('video', 'maskTop', e.target.value)}
                                            onFocus={holdPreview}
                                            onBlur={() => releasePreview(() => commitRenderParamDraftValue('video', 'maskTop'))}
                                            onKeyDown={releasePreviewOnEnter(() => commitRenderParamDraftValue('video', 'maskTop'))}
                                            className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                                          />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                          <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Bottom (%)</label>
                                          <input
                                            type="number"
                                            step="1"
                                            value={renderParamsDraft.video.maskBottom}
                                            onChange={e => updateRenderParamDraft('video', 'maskBottom', e.target.value)}
                                            onFocus={holdPreview}
                                            onBlur={() => releasePreview(() => commitRenderParamDraftValue('video', 'maskBottom'))}
                                            onKeyDown={releasePreviewOnEnter(() => commitRenderParamDraftValue('video', 'maskBottom'))}
                                            className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                                          />
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                  <div className="border border-zinc-800/70 rounded-lg p-2 mt-1 bg-zinc-950/50">
                                    <div className="flex items-center justify-between gap-2 mb-2">
                                      <div className="text-[10px] text-zinc-500 uppercase tracking-widest">Blur</div>
                                      <button
                                        type="button"
                                        onClick={() => addRenderVideoBlurEffect(activeVideoId)}
                                        className="text-[10px] rounded-md border border-zinc-700 px-2 py-1 text-zinc-200 hover:border-zinc-600"
                                      >
                                        + Blur region
                                      </button>
                                    </div>
                                    {renderVideoBlurEffects.length === 0 ? (
                                      <div className="text-[11px] text-zinc-500">No blur effect for this video track.</div>
                                    ) : (
                                      <div className="flex flex-col gap-2">
                                        {renderVideoBlurEffects.map((effect, idx) => (
                                          <div key={`video-blur-${idx}`} className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-2 flex flex-col gap-2">
                                            <div className="flex items-center justify-between gap-2">
                                              <span className="text-[10px] uppercase tracking-widest text-zinc-500">Region #{idx + 1}</span>
                                              <button
                                                type="button"
                                                onClick={() => removeRenderVideoBlurEffect(activeVideoId, idx)}
                                                className="text-[10px] text-red-400 hover:text-red-300"
                                              >
                                                Remove
                                              </button>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                              <div className="flex flex-col gap-1">
                                                <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Left (%)</label>
                                                <input
                                                  type="number"
                                                  step="1"
                                                  min="0"
                                                  max="100"
                                                  value={effect.left}
                                                  onFocus={holdPreview}
                                                  onKeyDown={releasePreviewOnEnter(() => commitRenderVideoBlurEffectValue(activeVideoId, idx, 'left'))}
                                                  onChange={e => {
                                                    const v = coerceNumber(e.target.value, effect.left) ?? effect.left;
                                                    updateRenderVideoBlurEffect(activeVideoId, idx, { left: v });
                                                  }}
                                                  onBlur={() => releasePreview(() => commitRenderVideoBlurEffectValue(activeVideoId, idx, 'left'))}
                                                  className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-200 focus:outline-none"
                                                />
                                              </div>
                                              <div className="flex flex-col gap-1">
                                                <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Right (%)</label>
                                                <input
                                                  type="number"
                                                  step="1"
                                                  min="0"
                                                  max="100"
                                                  value={effect.right}
                                                  onFocus={holdPreview}
                                                  onKeyDown={releasePreviewOnEnter(() => commitRenderVideoBlurEffectValue(activeVideoId, idx, 'right'))}
                                                  onChange={e => {
                                                    const v = coerceNumber(e.target.value, effect.right) ?? effect.right;
                                                    updateRenderVideoBlurEffect(activeVideoId, idx, { right: v });
                                                  }}
                                                  onBlur={() => releasePreview(() => commitRenderVideoBlurEffectValue(activeVideoId, idx, 'right'))}
                                                  className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-200 focus:outline-none"
                                                />
                                              </div>
                                              <div className="flex flex-col gap-1">
                                                <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Top (%)</label>
                                                <input
                                                  type="number"
                                                  step="1"
                                                  min="0"
                                                  max="100"
                                                  value={effect.top}
                                                  onFocus={holdPreview}
                                                  onKeyDown={releasePreviewOnEnter(() => commitRenderVideoBlurEffectValue(activeVideoId, idx, 'top'))}
                                                  onChange={e => {
                                                    const v = coerceNumber(e.target.value, effect.top) ?? effect.top;
                                                    updateRenderVideoBlurEffect(activeVideoId, idx, { top: v });
                                                  }}
                                                  onBlur={() => releasePreview(() => commitRenderVideoBlurEffectValue(activeVideoId, idx, 'top'))}
                                                  className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-200 focus:outline-none"
                                                />
                                              </div>
                                              <div className="flex flex-col gap-1">
                                                <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Bottom (%)</label>
                                                <input
                                                  type="number"
                                                  step="1"
                                                  min="0"
                                                  max="100"
                                                  value={effect.bottom}
                                                  onFocus={holdPreview}
                                                  onKeyDown={releasePreviewOnEnter(() => commitRenderVideoBlurEffectValue(activeVideoId, idx, 'bottom'))}
                                                  onChange={e => {
                                                    const v = coerceNumber(e.target.value, effect.bottom) ?? effect.bottom;
                                                    updateRenderVideoBlurEffect(activeVideoId, idx, { bottom: v });
                                                  }}
                                                  onBlur={() => releasePreview(() => commitRenderVideoBlurEffectValue(activeVideoId, idx, 'bottom'))}
                                                  className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-200 focus:outline-none"
                                                />
                                              </div>
                                            </div>
                                            <div className="flex flex-col gap-2">
                                              <div className="flex items-center justify-between gap-2">
                                                <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Blur strength</label>
                                                <span className="text-xs tabular-nums text-zinc-300">{effect.sigma.toFixed(1)}</span>
                                              </div>
                                              <input
                                                type="range"
                                                min={0.5}
                                                max={80}
                                                step={0.5}
                                                value={effect.sigma}
                                                onMouseDown={holdPreview}
                                                onTouchStart={holdPreview}
                                                onChange={e => {
                                                  const v = Number(e.target.value);
                                                  if (!Number.isFinite(v)) return;
                                                  updateRenderVideoBlurEffect(activeVideoId, idx, { sigma: Math.min(80, Math.max(0.5, v)) });
                                                }}
                                                onMouseUp={() => releasePreview(() => commitRenderVideoBlurEffectValue(activeVideoId, idx, 'sigma'))}
                                                onTouchEnd={() => releasePreview(() => commitRenderVideoBlurEffectValue(activeVideoId, idx, 'sigma'))}
                                                className="w-full accent-lime-400 cursor-pointer"
                                              />
                                            </div>
                                            <div className="flex flex-col gap-2">
                                              <div className="flex items-center justify-between gap-2">
                                                <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Feather</label>
                                                <span className="text-xs tabular-nums text-zinc-300">{effect.feather}</span>
                                              </div>
                                              <input
                                                type="range"
                                                min={0}
                                                max={RENDER_BLUR_FEATHER_MAX}
                                                step={1}
                                                value={effect.feather}
                                                onMouseDown={holdPreview}
                                                onTouchStart={holdPreview}
                                                onChange={e => {
                                                  const v = Number(e.target.value);
                                                  if (!Number.isFinite(v)) return;
                                                  updateRenderVideoBlurEffect(activeVideoId, idx, {
                                                    feather: Math.min(RENDER_BLUR_FEATHER_MAX, Math.max(0, Math.round(v)))
                                                  });
                                                }}
                                                onMouseUp={() => releasePreview(() => commitRenderVideoBlurEffectValue(activeVideoId, idx, 'feather'))}
                                                onTouchEnd={() => releasePreview(() => commitRenderVideoBlurEffectValue(activeVideoId, idx, 'feather'))}
                                                className="w-full accent-lime-400 cursor-pointer"
                                              />
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <div className="flex flex-col gap-1">
                                      <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Fade In (s)</label>
                                      <input
                                        type="number"
                                        step="0.1"
                                        value={renderParamsDraft.video.fadeIn}
                                        onChange={e => updateRenderParamDraft('video', 'fadeIn', e.target.value)}
                                        onFocus={holdPreview}
                                        onBlur={() => releasePreview(() => commitRenderParamDraftValue('video', 'fadeIn'))}
                                        onKeyDown={releasePreviewOnEnter(() => commitRenderParamDraftValue('video', 'fadeIn'))}
                                        className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                                      />
                                    </div>
                                    <div className="flex flex-col gap-1">
                                      <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Fade Out (s)</label>
                                      <input
                                        type="number"
                                        step="0.1"
                                        value={renderParamsDraft.video.fadeOut}
                                        onChange={e => updateRenderParamDraft('video', 'fadeOut', e.target.value)}
                                        onFocus={holdPreview}
                                        onBlur={() => releasePreview(() => commitRenderParamDraftValue('video', 'fadeOut'))}
                                        onKeyDown={releasePreviewOnEnter(() => commitRenderParamDraftValue('video', 'fadeOut'))}
                                        className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                                      />
                                    </div>
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Color LUT</label>
                                    <input
                                      value={renderParamsDraft.video.colorLut}
                                      onChange={e => updateRenderParamDraft('video', 'colorLut', e.target.value)}
                                      onBlur={() => commitRenderParamDraftValue('video', 'colorLut')}
                                      onKeyDown={commitRenderParamDraftOnEnter('video', 'colorLut')}
                                      className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                                      placeholder="e.g. cinematic-01"
                                    />
                                  </div>
                                </>
                              ) : (
                                <div className="text-[11px] text-zinc-500">No video selected.</div>
                              )}
                            </div>
                          )}
                        </div>
                        )}

                        {activeInspectorSection === 'audio' && (
                        <div className="rounded-xl border border-zinc-800 bg-zinc-950/40">
                          <div
                            role="button"
                            tabIndex={0}
                            aria-expanded={activeInspectorSection === 'audio'}
                            onClick={() => openInspectorSection('audio')}
                            onKeyDown={event => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                openInspectorSection('audio');
                              }
                            }}
                            className="flex items-center justify-between px-3 py-2 border-b border-zinc-800/60 cursor-pointer hover:bg-zinc-900/60 transition-colors"
                          >
                            <span className="text-[11px] uppercase tracking-widest text-zinc-500">Audio</span>
                            <button
                              onClick={event => {
                                event.stopPropagation();
                                openInspectorSection('audio');
                              }}
                              className="h-6 w-6 rounded-md border border-zinc-800 flex items-center justify-center hover:border-zinc-700"
                            >
                              <Menu size={12} />
                            </button>
                          </div>
                          {activeInspectorSection === 'audio' && (
                            <div className="p-3 flex flex-col gap-2">
                              {renderAudioFile ? (
                                <>
                                  <div className="flex items-center gap-2 text-sm text-zinc-100">
                                    <FileAudio size={14} />
                                    <span className="truncate font-semibold">{renderAudioFile.name}</span>
                                  </div>
                                  <div className="flex items-center justify-between text-[11px] text-zinc-500">
                                    <span>Duration</span>
                                    <span className="text-zinc-300">{formatDuration(renderAudioDuration) ?? '--'}</span>
                                  </div>
                                  <div className="flex items-center justify-between text-[11px] text-zinc-500">
                                    <span>Size</span>
                                    <span className="text-zinc-300">{renderAudioFile.size ?? renderAudioFile.sizeBytes ?? '--'}</span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <div className="flex flex-col gap-1">
                                      <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Gain (dB)</label>
                                      <input
                                        type="number"
                                        step="0.5"
                                        value={renderParamsDraft.audio.gainDb}
                                        onChange={e => updateRenderParamDraft('audio', 'gainDb', e.target.value)}
                                        onFocus={holdPreview}
                                        onBlur={() => releasePreview(() => commitRenderParamDraftValue('audio', 'gainDb'))}
                                        onKeyDown={releasePreviewOnEnter(() => commitRenderParamDraftValue('audio', 'gainDb'))}
                                        className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                                      />
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <label className="flex items-center gap-2 text-[11px] text-zinc-300">
                                      <input
                                        type="checkbox"
                                        checked={Boolean(renderParamsDraft.audio.mute)}
                                        onChange={e => {
                                          const v = e.target.checked;
                                          updateRenderParamDraft('audio', 'mute', v);
                                          updateRenderParam('audio', 'mute', v);
                                        }}
                                        className="accent-lime-400"
                                      />
                                      Mute
                                    </label>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <div className="flex flex-col gap-1">
                                      <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Fade In (s)</label>
                                      <input
                                        type="number"
                                        step="0.1"
                                        value={renderParamsDraft.audio.fadeIn}
                                        onChange={e => updateRenderParamDraft('audio', 'fadeIn', e.target.value)}
                                        onFocus={holdPreview}
                                        onBlur={() => releasePreview(() => commitRenderParamDraftValue('audio', 'fadeIn'))}
                                        onKeyDown={releasePreviewOnEnter(() => commitRenderParamDraftValue('audio', 'fadeIn'))}
                                        className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                                      />
                                    </div>
                                    <div className="flex flex-col gap-1">
                                      <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Fade Out (s)</label>
                                      <input
                                        type="number"
                                        step="0.1"
                                        value={renderParamsDraft.audio.fadeOut}
                                        onChange={e => updateRenderParamDraft('audio', 'fadeOut', e.target.value)}
                                        onFocus={holdPreview}
                                        onBlur={() => releasePreview(() => commitRenderParamDraftValue('audio', 'fadeOut'))}
                                        onKeyDown={releasePreviewOnEnter(() => commitRenderParamDraftValue('audio', 'fadeOut'))}
                                        className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                                      />
                                    </div>
                                  </div>
                                </>
                              ) : (
                                <div className="text-[11px] text-zinc-500">No audio selected.</div>
                              )}
                            </div>
                          )}
                        </div>
                        )}

                        {activeInspectorSection === 'subtitle' && (
                        <div className="rounded-xl border border-zinc-800 bg-zinc-950/40">
                          <div
                            role="button"
                            tabIndex={0}
                            aria-expanded={activeInspectorSection === 'subtitle'}
                            onClick={() => openInspectorSection('subtitle')}
                            onKeyDown={event => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                openInspectorSection('subtitle');
                              }
                            }}
                            className="flex items-center justify-between px-3 py-2 border-b border-zinc-800/60 cursor-pointer hover:bg-zinc-900/60 transition-colors"
                          >
                            <span className="text-[11px] uppercase tracking-widest text-zinc-500">Subtitle</span>
                            <button
                              onClick={event => {
                                event.stopPropagation();
                                openInspectorSection('subtitle');
                              }}
                              className="h-6 w-6 rounded-md border border-zinc-800 flex items-center justify-center hover:border-zinc-700"
                            >
                              <Menu size={12} />
                            </button>
                          </div>
                          {activeInspectorSection === 'subtitle' && (
                            <div className="p-3 flex flex-col gap-2">
                              {renderSubtitleFile ? (
                                <>
                                  <div className="flex items-center gap-2 text-sm text-zinc-100">
                                    <Type size={14} />
                                    <span className="truncate font-semibold">{renderSubtitleFile.name}</span>
                                  </div>
                                  <div className="flex items-center justify-between text-[11px] text-zinc-500">
                                    <span>Duration</span>
                                    <span className="text-zinc-300">{formatDuration(renderSubtitleDuration) ?? '--'}</span>
                                  </div>
                                  <div className="flex items-center justify-between text-[11px] text-zinc-500">
                                    <span>Cues</span>
                                    <span className="text-zinc-300">{renderSubtitleCues.length}</span>
                                  </div>
                                </>
                              ) : (
                                <div className="text-[11px] text-zinc-500">No subtitle file selected.</div>
                              )}

                              <div className="pt-1">
                                <div className="flex items-center justify-between">
                                  <div className="text-[10px] text-zinc-500 uppercase tracking-widest">Preset style</div>
                                  <button
                                    type="button"
                                    onClick={() => applySubtitleStylePreset(SUBTITLE_STYLE_PRESETS[0])}
                                    className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 hover:text-zinc-100"
                                  >
                                    Reset
                                  </button>
                                </div>
                                <div className="mt-2 grid grid-cols-6 gap-2">
                                  {SUBTITLE_STYLE_PRESETS.map(preset => {
                                    const active = isSubtitlePresetActive(preset);
                                    return (
                                      <button
                                        key={preset.id}
                                        type="button"
                                        title={preset.label}
                                        onClick={() => applySubtitleStylePreset(preset)}
                                        className={`h-10 w-10 rounded-lg border flex items-center justify-center transition-colors ${
                                          active
                                            ? 'border-lime-400 ring-1 ring-lime-400/50'
                                            : 'border-zinc-800 hover:border-zinc-700'
                                        }`}
                                      >
                                        <span
                                          className="h-8 w-8 rounded-md flex items-center justify-center text-sm font-black"
                                          style={buildSubtitlePreviewStyle(preset)}
                                        >
                                          T
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-2 pt-1">
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] text-zinc-500 uppercase tracking-widest">FontName</label>
                                  <select
                                    value={renderParamsDraft.subtitle.fontName}
                                    onChange={e => {
                                      const v = e.target.value;
                                      updateRenderParamDraft('subtitle', 'fontName', v);
                                      updateRenderParam('subtitle', 'fontName', v);
                                    }}
                                    className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                                  >
                                    {subtitleFontOptions.map(font => (
                                      <option key={font} value={font}>
                                        {font}
                                      </option>
                                    ))}
                                  </select>
                                  {subtitleFontLoading && (
                                    <span className="text-[10px] text-zinc-600">Loading server fonts...</span>
                                  )}
                                </div>
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Font size</label>
                                  <input
                                    type="number"
                                    step="1"
                                    value={renderParamsDraft.subtitle.fontSize}
                                    onChange={e => updateRenderParamDraft('subtitle', 'fontSize', e.target.value)}
                                    onFocus={holdPreview}
                                    onBlur={() => releasePreview(() => commitRenderParamDraftValue('subtitle', 'fontSize'))}
                                    onKeyDown={releasePreviewOnEnter(() => commitRenderParamDraftValue('subtitle', 'fontSize'))}
                                    className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                                  />
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Opacity (%)</label>
                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="1"
                                    value={renderParamsDraft.subtitle.opacity}
                                    onChange={e => updateRenderParamDraft('subtitle', 'opacity', e.target.value)}
                                    onFocus={holdPreview}
                                    onBlur={() => releasePreview(() => commitRenderParamDraftValue('subtitle', 'opacity'))}
                                    onKeyDown={releasePreviewOnEnter(() => commitRenderParamDraftValue('subtitle', 'opacity'))}
                                    className="h-9 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                                  />
                                </div>
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Primary</label>
                                  <input
                                    type="color"
                                    value={renderParamsDraft.subtitle.primaryColor}
                                    onChange={e => updateRenderParamDraft('subtitle', 'primaryColor', e.target.value)}
                                    onBlur={() => commitRenderParamDraftValue('subtitle', 'primaryColor')}
                                    className="h-9 w-full bg-zinc-900 border border-zinc-800 rounded-lg p-1"
                                  />
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Outline</label>
                                  <div className="flex gap-2">
                                    <input
                                      type="color"
                                      value={renderParamsDraft.subtitle.outlineColor}
                                      onChange={e => updateRenderParamDraft('subtitle', 'outlineColor', e.target.value)}
                                      onBlur={() => commitRenderParamDraftValue('subtitle', 'outlineColor')}
                                      className="h-9 w-10 bg-zinc-900 border border-zinc-800 rounded-lg p-1"
                                    />
                                    <input
                                      type="number"
                                      step="1"
                                      value={renderParamsDraft.subtitle.outline}
                                      onChange={e => updateRenderParamDraft('subtitle', 'outline', e.target.value)}
                                      onFocus={holdPreview}
                                      onBlur={() => releasePreview(() => commitRenderParamDraftValue('subtitle', 'outline'))}
                                      onKeyDown={releasePreviewOnEnter(() => commitRenderParamDraftValue('subtitle', 'outline'))}
                                      className="flex-1 h-9 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                                    />
                                  </div>
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Shadow</label>
                                  <input
                                    type="number"
                                    step="1"
                                    value={renderParamsDraft.subtitle.shadow}
                                    onChange={e => updateRenderParamDraft('subtitle', 'shadow', e.target.value)}
                                    onFocus={holdPreview}
                                    onBlur={() => releasePreview(() => commitRenderParamDraftValue('subtitle', 'shadow'))}
                                    onKeyDown={releasePreviewOnEnter(() => commitRenderParamDraftValue('subtitle', 'shadow'))}
                                    className="h-9 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                                  />
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-3 text-xs text-zinc-300">
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={renderParamsDraft.subtitle.bold === '1'}
                                    onChange={e => {
                                      const v = e.target.checked ? '1' : '0';
                                      updateRenderParamDraft('subtitle', 'bold', v);
                                      updateRenderParam('subtitle', 'bold', v);
                                    }}
                                    className="rounded border-zinc-600"
                                  />
                                  Bold
                                </label>
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={renderParamsDraft.subtitle.italic === '1'}
                                    onChange={e => {
                                      const v = e.target.checked ? '1' : '0';
                                      updateRenderParamDraft('subtitle', 'italic', v);
                                      updateRenderParam('subtitle', 'italic', v);
                                    }}
                                    className="rounded border-zinc-600"
                                  />
                                  Italic
                                </label>
                              </div>
                              <div className="grid grid-cols-1 gap-2">
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Position Mode</label>
                                  <select
                                    value={subtitlePositionMode}
                                    onChange={e => {
                                      const v = e.target.value === 'position' ? 'position' : 'anchor';
                                      updateRenderParamDraft('subtitle', 'positionMode', v);
                                      updateRenderParam('subtitle', 'positionMode', v);
                                    }}
                                    className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                                  >
                                    <option value="anchor">Anchor (Alignment + Margin)</option>
                                    <option value="position">Position (X/Y)</option>
                                  </select>
                                </div>
                              </div>
                              {subtitlePositionMode === 'position' ? (
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="flex flex-col gap-1">
                                    <label className="text-[10px] text-zinc-500 uppercase tracking-widest">X (%)</label>
                                    <input
                                      type="number"
                                      step="1"
                                      value={positionXValue}
                                      onChange={e => updateRenderParamDraft('subtitle', 'positionX', e.target.value)}
                                      onFocus={holdPreview}
                                      onBlur={() => releasePreview(() => commitRenderParamDraftValue('subtitle', 'positionX'))}
                                      onKeyDown={releasePreviewOnEnter(() => commitRenderParamDraftValue('subtitle', 'positionX'))}
                                      className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                                    />
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Y (%)</label>
                                    <input
                                      type="number"
                                      step="1"
                                      value={positionYValue}
                                      onChange={e => updateRenderParamDraft('subtitle', 'positionY', e.target.value)}
                                      onFocus={holdPreview}
                                      onBlur={() => releasePreview(() => commitRenderParamDraftValue('subtitle', 'positionY'))}
                                      onKeyDown={releasePreviewOnEnter(() => commitRenderParamDraftValue('subtitle', 'positionY'))}
                                      className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                                    />
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <div className="grid grid-cols-1 gap-2">
                                    <div className="flex flex-col gap-1">
                                      <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Alignment (1–9)</label>
                                      <select
                                        value={renderParamsDraft.subtitle.alignment}
                                        onChange={e => {
                                          const v = e.target.value;
                                          updateRenderParamDraft('subtitle', 'alignment', v);
                                          updateRenderParam('subtitle', 'alignment', v);
                                        }}
                                        className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                                      >
                                        <option value="1">1 bottom-left</option>
                                        <option value="2">2 bottom-center</option>
                                        <option value="3">3 bottom-right</option>
                                        <option value="4">4 mid-left</option>
                                        <option value="5">5 mid-center</option>
                                        <option value="6">6 mid-right</option>
                                        <option value="7">7 top-left</option>
                                        <option value="8">8 top-center</option>
                                        <option value="9">9 top-right</option>
                                      </select>
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-3 gap-2">
                                    <div className="flex flex-col gap-1">
                                      <label className="text-[10px] text-zinc-500 uppercase tracking-widest">MarginL</label>
                                      <input
                                        type="number"
                                        step="1"
                                        value={renderParamsDraft.subtitle.marginL}
                                        onChange={e => updateRenderParamDraft('subtitle', 'marginL', e.target.value)}
                                        onFocus={holdPreview}
                                        onBlur={() => releasePreview(() => commitRenderParamDraftValue('subtitle', 'marginL'))}
                                        onKeyDown={releasePreviewOnEnter(() => commitRenderParamDraftValue('subtitle', 'marginL'))}
                                        className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                                      />
                                    </div>
                                    <div className="flex flex-col gap-1">
                                      <label className="text-[10px] text-zinc-500 uppercase tracking-widest">MarginR</label>
                                      <input
                                        type="number"
                                        step="1"
                                        value={renderParamsDraft.subtitle.marginR}
                                        onChange={e => updateRenderParamDraft('subtitle', 'marginR', e.target.value)}
                                        onFocus={holdPreview}
                                        onBlur={() => releasePreview(() => commitRenderParamDraftValue('subtitle', 'marginR'))}
                                        onKeyDown={releasePreviewOnEnter(() => commitRenderParamDraftValue('subtitle', 'marginR'))}
                                        className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                                      />
                                    </div>
                                    <div className="flex flex-col gap-1">
                                      <label className="text-[10px] text-zinc-500 uppercase tracking-widest">MarginV</label>
                                      <input
                                        type="number"
                                        step="1"
                                        value={renderParamsDraft.subtitle.marginV}
                                        onChange={e => updateRenderParamDraft('subtitle', 'marginV', e.target.value)}
                                        onFocus={holdPreview}
                                        onBlur={() => releasePreview(() => commitRenderParamDraftValue('subtitle', 'marginV'))}
                                        onKeyDown={releasePreviewOnEnter(() => commitRenderParamDraftValue('subtitle', 'marginV'))}
                                        className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                                      />
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                        )}

                        {activeInspectorSection === 'text' && (
                        <div className="rounded-xl border border-zinc-800 bg-zinc-950/40">
                          <div
                            role="button"
                            tabIndex={0}
                            aria-expanded={activeInspectorSection === 'text'}
                            onClick={() => openInspectorSection('text')}
                            onKeyDown={event => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                openInspectorSection('text');
                              }
                            }}
                            className="flex items-center justify-between px-3 py-2 border-b border-zinc-800/60 cursor-pointer hover:bg-zinc-900/60 transition-colors"
                          >
                            <span className="text-[11px] uppercase tracking-widest text-zinc-500">Text</span>
                            <button
                              onClick={event => {
                                event.stopPropagation();
                                openInspectorSection('text');
                              }}
                              className="h-6 w-6 rounded-md border border-zinc-800 flex items-center justify-center hover:border-zinc-700"
                            >
                              <Menu size={12} />
                            </button>
                          </div>
                          {activeInspectorSection === 'text' && (
                            <div className="p-3 flex flex-col gap-2">
                              <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-2">
                                <div className="text-[10px] text-zinc-500 uppercase tracking-widest">Single Text</div>
                                <textarea
                                  value={renderParamsDraft.text.singleText ?? ''}
                                  onChange={e => {
                                    if (!renderTextTrackEnabled) setRenderTextTrackEnabled(true);
                                    updateRenderParamDraft('text', 'singleText', e.target.value);
                                  }}
                                  onFocus={() => {
                                    if (!renderTextTrackEnabled) setRenderTextTrackEnabled(true);
                                    holdPreview();
                                  }}
                                  onBlur={() => releasePreview(() => commitRenderParamDraftValue('text', 'singleText'))}
                                  placeholder="Type text to show on the timeline"
                                  className="mt-2 h-20 w-full resize-none rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-2 text-xs text-zinc-200 focus:outline-none"
                                />
                                <label className="mt-2 flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={singleTextMatchDuration}
                                    onChange={e => {
                                      const v = e.target.checked ? '1' : '0';
                                      updateRenderParamDraft('text', 'singleTextMatchDuration', v);
                                      updateRenderParam('text', 'singleTextMatchDuration', v);
                                    }}
                                    className="rounded border-zinc-600"
                                  />
                                  Match duration with timeline
                                </label>
                                {!singleTextMatchDuration && (
                                  <div className="mt-2 grid grid-cols-2 gap-2">
                                    <div className="flex flex-col gap-1">
                                      <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Start (s)</label>
                                      <input
                                        type="number"
                                        step="0.1"
                                        value={singleTextStartValue}
                                        onChange={e => {
                                          if (!renderTextTrackEnabled) setRenderTextTrackEnabled(true);
                                          updateRenderParamDraft('text', 'singleTextStart', e.target.value);
                                        }}
                                        onFocus={() => {
                                          if (!renderTextTrackEnabled) setRenderTextTrackEnabled(true);
                                          holdPreview();
                                        }}
                                        onBlur={() => releasePreview(() => commitRenderParamDraftValue('text', 'singleTextStart'))}
                                        onKeyDown={releasePreviewOnEnter(() => commitRenderParamDraftValue('text', 'singleTextStart'))}
                                        className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                                      />
                                    </div>
                                    <div className="flex flex-col gap-1">
                                      <label className="text-[10px] text-zinc-500 uppercase tracking-widest">End (s)</label>
                                      <input
                                        type="number"
                                        step="0.1"
                                        value={singleTextEndValue}
                                        onChange={e => {
                                          if (!renderTextTrackEnabled) setRenderTextTrackEnabled(true);
                                          updateRenderParamDraft('text', 'singleTextEnd', e.target.value);
                                        }}
                                        onFocus={() => {
                                          if (!renderTextTrackEnabled) setRenderTextTrackEnabled(true);
                                          holdPreview();
                                        }}
                                        onBlur={() => releasePreview(() => commitRenderParamDraftValue('text', 'singleTextEnd'))}
                                        onKeyDown={releasePreviewOnEnter(() => commitRenderParamDraftValue('text', 'singleTextEnd'))}
                                        className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                              <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/30 p-2">
                                <div className="text-[10px] text-zinc-500 uppercase tracking-widest">Auto Move (Text Track)</div>
                                <label className="mt-2 flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={textAutoMoveEnabled}
                                    onChange={e => {
                                      const v = e.target.checked ? '1' : '0';
                                      updateRenderParamDraft('text', 'textAutoMoveEnabled', v);
                                      updateRenderParam('text', 'textAutoMoveEnabled', v);
                                    }}
                                    className="rounded border-zinc-600"
                                  />
                                  Enable Auto Move
                                </label>
                                {textAutoMoveEnabled && (
                                  <>
                                    <div className="mt-2 grid grid-cols-2 gap-2">
                                      <div className="flex flex-col gap-1">
                                        <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Interval (s)</label>
                                        <input
                                          type="number"
                                          step="0.1"
                                          min="0"
                                          value={textAutoMoveIntervalValue}
                                          onChange={e => updateRenderParamDraft('text', 'textAutoMoveInterval', e.target.value)}
                                          onFocus={holdPreview}
                                          onBlur={() => releasePreview(() => commitRenderParamDraftValue('text', 'textAutoMoveInterval'))}
                                          onKeyDown={releasePreviewOnEnter(() => commitRenderParamDraftValue('text', 'textAutoMoveInterval'))}
                                          className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                                        />
                                      </div>
                                    </div>
                                    <div className="mt-2 flex flex-col gap-1">
                                      <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Positions (X,Y %)</label>
                                      <textarea
                                        value={textAutoMovePositionsValue}
                                        onChange={e => updateRenderParamDraft('text', 'textAutoMovePositions', e.target.value)}
                                        onFocus={holdPreview}
                                        onBlur={() => releasePreview(() => commitRenderParamDraftValue('text', 'textAutoMovePositions'))}
                                        placeholder={`10,10\n90,10\n90,90\n10,90`}
                                        className="h-20 w-full resize-none rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-2 text-xs text-zinc-200 focus:outline-none"
                                      />
                                    </div>
                                  </>
                                )}
                              </div>
                              <div className="pt-1">
                                <div className="flex items-center justify-between">
                                  <div className="text-[10px] text-zinc-500 uppercase tracking-widest">Preset style</div>
                                  <button
                                    type="button"
                                    onClick={() => applySubtitleStylePreset(SUBTITLE_STYLE_PRESETS[0], 'text')}
                                    className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 hover:text-zinc-100"
                                  >
                                    Reset
                                  </button>
                                </div>
                                <div className="mt-2 grid grid-cols-6 gap-2">
                                  {SUBTITLE_STYLE_PRESETS.map(preset => {
                                    const active = isSubtitlePresetActive(preset, 'text');
                                    return (
                                      <button
                                        key={preset.id}
                                        type="button"
                                        title={preset.label}
                                        onClick={() => applySubtitleStylePreset(preset, 'text')}
                                        className={`h-10 w-10 rounded-lg border flex items-center justify-center transition-colors ${
                                          active
                                            ? 'border-lime-400 ring-1 ring-lime-400/50'
                                            : 'border-zinc-800 hover:border-zinc-700'
                                        }`}
                                      >
                                        <span
                                          className="h-8 w-8 rounded-md flex items-center justify-center text-sm font-black"
                                          style={buildSubtitlePreviewStyle(preset)}
                                        >
                                          T
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-2 pt-1">
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] text-zinc-500 uppercase tracking-widest">FontName</label>
                                  <select
                                    value={renderParamsDraft.text.fontName}
                                    onChange={e => {
                                      const v = e.target.value;
                                      updateRenderParamDraft('text', 'fontName', v);
                                      updateRenderParam('text', 'fontName', v);
                                    }}
                                    className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                                  >
                                    {subtitleFontOptions.map(font => (
                                      <option key={font} value={font}>
                                        {font}
                                      </option>
                                    ))}
                                  </select>
                                  {subtitleFontLoading && (
                                    <span className="text-[10px] text-zinc-600">Loading server fonts...</span>
                                  )}
                                </div>
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Font size</label>
                                  <input
                                    type="number"
                                    step="1"
                                    value={renderParamsDraft.text.fontSize}
                                    onChange={e => updateRenderParamDraft('text', 'fontSize', e.target.value)}
                                    onFocus={holdPreview}
                                    onBlur={() => releasePreview(() => commitRenderParamDraftValue('text', 'fontSize'))}
                                    onKeyDown={releasePreviewOnEnter(() => commitRenderParamDraftValue('text', 'fontSize'))}
                                    className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                                  />
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Opacity (%)</label>
                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="1"
                                    value={renderParamsDraft.text.textOpacity}
                                    onChange={e => updateRenderParamDraft('text', 'textOpacity', e.target.value)}
                                    onFocus={holdPreview}
                                    onBlur={() => releasePreview(() => commitRenderParamDraftValue('text', 'textOpacity'))}
                                    onKeyDown={releasePreviewOnEnter(() => commitRenderParamDraftValue('text', 'textOpacity'))}
                                    className="h-9 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                                  />
                                </div>
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Primary</label>
                                  <input
                                    type="color"
                                    value={renderParamsDraft.text.primaryColor}
                                    onChange={e => updateRenderParamDraft('text', 'primaryColor', e.target.value)}
                                    onBlur={() => commitRenderParamDraftValue('text', 'primaryColor')}
                                    className="h-9 w-full bg-zinc-900 border border-zinc-800 rounded-lg p-1"
                                  />
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Outline</label>
                                  <div className="flex gap-2">
                                    <input
                                      type="color"
                                      value={renderParamsDraft.text.outlineColor}
                                      onChange={e => updateRenderParamDraft('text', 'outlineColor', e.target.value)}
                                      onBlur={() => commitRenderParamDraftValue('text', 'outlineColor')}
                                      className="h-9 w-10 bg-zinc-900 border border-zinc-800 rounded-lg p-1"
                                    />
                                    <input
                                      type="number"
                                      step="1"
                                      value={renderParamsDraft.text.outline}
                                      onChange={e => updateRenderParamDraft('text', 'outline', e.target.value)}
                                      onFocus={holdPreview}
                                      onBlur={() => releasePreview(() => commitRenderParamDraftValue('text', 'outline'))}
                                      onKeyDown={releasePreviewOnEnter(() => commitRenderParamDraftValue('text', 'outline'))}
                                      className="flex-1 h-9 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                                    />
                                  </div>
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Shadow</label>
                                  <input
                                    type="number"
                                    step="1"
                                    value={renderParamsDraft.text.shadow}
                                    onChange={e => updateRenderParamDraft('text', 'shadow', e.target.value)}
                                    onFocus={holdPreview}
                                    onBlur={() => releasePreview(() => commitRenderParamDraftValue('text', 'shadow'))}
                                    onKeyDown={releasePreviewOnEnter(() => commitRenderParamDraftValue('text', 'shadow'))}
                                    className="h-9 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                                  />
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-3 text-xs text-zinc-300">
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={renderParamsDraft.text.bold === '1'}
                                    onChange={e => {
                                      const v = e.target.checked ? '1' : '0';
                                      updateRenderParamDraft('text', 'bold', v);
                                      updateRenderParam('text', 'bold', v);
                                    }}
                                    className="rounded border-zinc-600"
                                  />
                                  Bold
                                </label>
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={renderParamsDraft.text.italic === '1'}
                                    onChange={e => {
                                      const v = e.target.checked ? '1' : '0';
                                      updateRenderParamDraft('text', 'italic', v);
                                      updateRenderParam('text', 'italic', v);
                                    }}
                                    className="rounded border-zinc-600"
                                  />
                                  Italic
                                </label>
                              </div>
                              <div className="grid grid-cols-1 gap-2">
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Position Mode</label>
                                  <select
                                    value={textPositionMode}
                                    onChange={e => {
                                      const v = e.target.value === 'position' ? 'position' : 'anchor';
                                      updateRenderParamDraft('text', 'positionMode', v);
                                      updateRenderParam('text', 'positionMode', v);
                                    }}
                                    className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                                  >
                                    <option value="anchor">Anchor (Alignment + Margin)</option>
                                    <option value="position">Position (X/Y)</option>
                                  </select>
                                </div>
                              </div>
                              {textPositionMode === 'position' ? (
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="flex flex-col gap-1">
                                    <label className="text-[10px] text-zinc-500 uppercase tracking-widest">X (%)</label>
                                    <input
                                      type="number"
                                      step="1"
                                      value={textPositionXValue}
                                      onChange={e => updateRenderParamDraft('text', 'positionX', e.target.value)}
                                      onFocus={holdPreview}
                                      onBlur={() => releasePreview(() => commitRenderParamDraftValue('text', 'positionX'))}
                                      onKeyDown={releasePreviewOnEnter(() => commitRenderParamDraftValue('text', 'positionX'))}
                                      className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                                    />
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Y (%)</label>
                                    <input
                                      type="number"
                                      step="1"
                                      value={textPositionYValue}
                                      onChange={e => updateRenderParamDraft('text', 'positionY', e.target.value)}
                                      onFocus={holdPreview}
                                      onBlur={() => releasePreview(() => commitRenderParamDraftValue('text', 'positionY'))}
                                      onKeyDown={releasePreviewOnEnter(() => commitRenderParamDraftValue('text', 'positionY'))}
                                      className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                                    />
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <div className="grid grid-cols-1 gap-2">
                                    <div className="flex flex-col gap-1">
                                      <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Alignment (1–9)</label>
                                      <select
                                        value={renderParamsDraft.text.alignment}
                                        onChange={e => {
                                          const v = e.target.value;
                                          updateRenderParamDraft('text', 'alignment', v);
                                          updateRenderParam('text', 'alignment', v);
                                        }}
                                        className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                                      >
                                        <option value="1">1 bottom-left</option>
                                        <option value="2">2 bottom-center</option>
                                        <option value="3">3 bottom-right</option>
                                        <option value="4">4 mid-left</option>
                                        <option value="5">5 mid-center</option>
                                        <option value="6">6 mid-right</option>
                                        <option value="7">7 top-left</option>
                                        <option value="8">8 top-center</option>
                                        <option value="9">9 top-right</option>
                                      </select>
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-3 gap-2">
                                    <div className="flex flex-col gap-1">
                                      <label className="text-[10px] text-zinc-500 uppercase tracking-widest">MarginL</label>
                                      <input
                                        type="number"
                                        step="1"
                                        value={renderParamsDraft.text.marginL}
                                        onChange={e => updateRenderParamDraft('text', 'marginL', e.target.value)}
                                        onFocus={holdPreview}
                                        onBlur={() => releasePreview(() => commitRenderParamDraftValue('text', 'marginL'))}
                                        onKeyDown={releasePreviewOnEnter(() => commitRenderParamDraftValue('text', 'marginL'))}
                                        className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                                      />
                                    </div>
                                    <div className="flex flex-col gap-1">
                                      <label className="text-[10px] text-zinc-500 uppercase tracking-widest">MarginR</label>
                                      <input
                                        type="number"
                                        step="1"
                                        value={renderParamsDraft.text.marginR}
                                        onChange={e => updateRenderParamDraft('text', 'marginR', e.target.value)}
                                        onFocus={holdPreview}
                                        onBlur={() => releasePreview(() => commitRenderParamDraftValue('text', 'marginR'))}
                                        onKeyDown={releasePreviewOnEnter(() => commitRenderParamDraftValue('text', 'marginR'))}
                                        className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                                      />
                                    </div>
                                    <div className="flex flex-col gap-1">
                                      <label className="text-[10px] text-zinc-500 uppercase tracking-widest">MarginV</label>
                                      <input
                                        type="number"
                                        step="1"
                                        value={renderParamsDraft.text.marginV}
                                        onChange={e => updateRenderParamDraft('text', 'marginV', e.target.value)}
                                        onFocus={holdPreview}
                                        onBlur={() => releasePreview(() => commitRenderParamDraftValue('text', 'marginV'))}
                                        onKeyDown={releasePreviewOnEnter(() => commitRenderParamDraftValue('text', 'marginV'))}
                                        className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                                      />
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                        )}

                        {activeInspectorSection === 'image' && (
                        <div className="rounded-xl border border-zinc-800 bg-zinc-950/40">
                          <div
                            role="button"
                            tabIndex={0}
                            aria-expanded={activeInspectorSection === 'image'}
                            onClick={() => openInspectorSection('image')}
                            onKeyDown={event => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                openInspectorSection('image');
                              }
                            }}
                            className="flex items-center justify-between px-3 py-2 border-b border-zinc-800/60 cursor-pointer hover:bg-zinc-900/60 transition-colors"
                          >
                            <span className="text-[11px] uppercase tracking-widest text-zinc-500">Images</span>
                            <button
                              onClick={event => {
                                event.stopPropagation();
                                openInspectorSection('image');
                              }}
                              className="h-6 w-6 rounded-md border border-zinc-800 flex items-center justify-center hover:border-zinc-700"
                            >
                              <Menu size={12} />
                            </button>
                          </div>
                          {activeInspectorSection === 'image' && (
                            <div className="p-3 flex flex-col gap-2">
                              {imageInspectorFiles.length === 0 ? (
                                <div className="text-[11px] text-zinc-500">No images selected.</div>
                              ) : (
                                <div className="flex flex-col gap-2">
                                  {imageInspectorFiles.map((file) => {
                                    const durationValue = renderImageDurations[file.id] ?? '';
                                    const transform = renderImageTransforms?.[file.id] ?? {};
                                    const layerIndex = renderImageFiles.findIndex(entry => entry.id === file.id);
                                    const isMatchDuration = renderImageMatchDuration[file.id] ?? false;
                                    return (
                                      <div
                                        key={file.id}
                                        className="flex flex-col gap-2 border border-zinc-800 rounded-lg px-2 py-1.5 bg-zinc-900/60"
                                      >
                                        <div
                                          className="flex items-center gap-2"
                                          draggable
                                          onDragStart={event => {
                                            event.dataTransfer.setData('text/plain', file.id);
                                            event.dataTransfer.effectAllowed = 'move';
                                          }}
                                          onDragOver={event => {
                                            event.preventDefault();
                                            event.dataTransfer.dropEffect = 'move';
                                          }}
                                          onDrop={event => {
                                            event.preventDefault();
                                            const draggedId = event.dataTransfer.getData('text/plain');
                                            if (!draggedId || draggedId === file.id) return;
                                            setRenderImageOrderIds(prev => {
                                              const next = prev.filter(id => id !== draggedId);
                                              const targetIndex = next.indexOf(file.id);
                                              next.splice(Math.max(0, targetIndex), 0, draggedId);
                                              return [...next];
                                            });
                                          }}
                                        >
                                          <div className="h-6 w-6 rounded-md border border-zinc-800 flex items-center justify-center text-zinc-500 cursor-grab">
                                            <Image size={12} />
                                          </div>
                                          <div className="min-w-0 flex-1">
                                            <div className="text-xs text-zinc-200 truncate">{file.name}</div>
                                            <div className="text-[10px] text-zinc-500">
                                              Layer {layerIndex >= 0 ? layerIndex + 1 : '--'}
                                            </div>
                                          </div>
                                          <label className="flex items-center gap-1 text-xs text-zinc-400 cursor-pointer">
                                            <input
                                              type="checkbox"
                                              checked={isMatchDuration}
                                              onChange={e => setRenderImageMatchDuration(prev => ({ ...prev, [file.id]: e.target.checked }))}
                                              className="rounded border-zinc-600"
                                            />
                                            Match
                                          </label>
                                        </div>
                                        {!isMatchDuration && (
                                          <>
                                            <input
                                              type="number"
                                              min="0.1"
                                              step="0.1"
                                              value={durationValue}
                                              onChange={e => {
                                                const value = e.target.value;
                                                setRenderImageDurations(prev => ({ ...prev, [file.id]: value }));
                                              }}
                                              onFocus={holdPreview}
                                              onBlur={() => setRenderPreviewHold(false)}
                                              onKeyDown={(event) => {
                                                if (event.key === 'Enter') setRenderPreviewHold(false);
                                              }}
                                              className="w-20 bg-zinc-900 border border-zinc-800 rounded-md px-2 py-1 text-xs text-zinc-200 focus:outline-none"
                                              placeholder="Duration"
                                            />
                                            <span className="text-[10px] text-zinc-500">s</span>
                                          </>
                                        )}
                                      </div>
                                    );
                                  })}
                                  {imageInspectorFiles.map(file => {
                                    const transform = renderImageTransforms?.[file.id] ?? {};
                                    return (
                                      <div key={`tx-${file.id}`} className="border border-zinc-800 rounded-lg p-2 bg-zinc-900/50">
                                        <div className="text-[11px] text-zinc-400 mb-2 truncate">{file.name}</div>
                                        <div className="grid grid-cols-2 gap-2">
                                          <div className="flex flex-col gap-1">
                                            <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Pos X (%)</label>
                                            <input
                                              type="number"
                                              step="1"
                                              value={transform.x ?? '50'}
                                              onFocus={holdPreview}
                                              onBlur={() => setRenderPreviewHold(false)}
                                              onKeyDown={(event) => {
                                                if (event.key === 'Enter') setRenderPreviewHold(false);
                                              }}
                                              onChange={e => setRenderImageTransforms(prev => ({
                                                ...prev,
                                                [file.id]: { ...prev[file.id], x: e.target.value }
                                              }))}
                                              className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-200 focus:outline-none"
                                            />
                                          </div>
                                          <div className="flex flex-col gap-1">
                                            <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Pos Y (%)</label>
                                            <input
                                              type="number"
                                              step="1"
                                              value={transform.y ?? '50'}
                                              onFocus={holdPreview}
                                              onBlur={() => setRenderPreviewHold(false)}
                                              onKeyDown={(event) => {
                                                if (event.key === 'Enter') setRenderPreviewHold(false);
                                              }}
                                              onChange={e => setRenderImageTransforms(prev => ({
                                                ...prev,
                                                [file.id]: { ...prev[file.id], y: e.target.value }
                                              }))}
                                              className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-200 focus:outline-none"
                                            />
                                          </div>
                                          <div className="flex flex-col gap-1">
                                            <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Scale (%)</label>
                                            <input
                                              type="number"
                                              step="1"
                                              min="0"
                                              value={transform.scale ?? '100'}
                                              onFocus={holdPreview}
                                              onBlur={() => setRenderPreviewHold(false)}
                                              onKeyDown={(event) => {
                                                if (event.key === 'Enter') setRenderPreviewHold(false);
                                              }}
                                              onChange={e => setRenderImageTransforms(prev => ({
                                                ...prev,
                                                [file.id]: { ...prev[file.id], scale: e.target.value }
                                              }))}
                                              className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-200 focus:outline-none"
                                            />
                                          </div>
                                          <div className="flex flex-col gap-1">
                                            <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Opacity (%)</label>
                                            <input
                                              type="number"
                                              step="1"
                                              value={transform.opacity ?? '100'}
                                              onFocus={holdPreview}
                                              onBlur={() => setRenderPreviewHold(false)}
                                              onKeyDown={(event) => {
                                                if (event.key === 'Enter') setRenderPreviewHold(false);
                                              }}
                                              onChange={e => setRenderImageTransforms(prev => ({
                                                ...prev,
                                                [file.id]: { ...prev[file.id], opacity: e.target.value }
                                              }))}
                                              className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-200 focus:outline-none"
                                            />
                                          </div>
                                          <div className="flex flex-col gap-1">
                                            <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Rotation (deg)</label>
                                            <input
                                              type="number"
                                              step="1"
                                              value={transform.rotation ?? '0'}
                                              onFocus={holdPreview}
                                              onBlur={() => setRenderPreviewHold(false)}
                                              onKeyDown={(event) => {
                                                if (event.key === 'Enter') setRenderPreviewHold(false);
                                              }}
                                              onChange={e => setRenderImageTransforms(prev => ({
                                                ...prev,
                                                [file.id]: { ...prev[file.id], rotation: e.target.value }
                                              }))}
                                              className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-200 focus:outline-none"
                                            />
                                          </div>
                                          <div className="flex flex-col gap-1">
                                            <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Fit</label>
                                            <select
                                              value={transform.fit ?? 'contain'}
                                              onChange={e => setRenderImageTransforms(prev => ({
                                                ...prev,
                                                [file.id]: { ...prev[file.id], fit: e.target.value as 'contain' | 'cover' | 'stretch' }
                                              }))}
                                              className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-200 focus:outline-none"
                                            >
                                              <option value="contain">contain</option>
                                              <option value="cover">cover</option>
                                              <option value="stretch">stretch</option>
                                            </select>
                                          </div>
                                        </div>
                                        <div className="grid grid-cols-4 gap-2 mt-2">
                                          <div className="flex flex-col gap-1">
                                            <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Crop X (%)</label>
                                            <input
                                              type="number"
                                              step="1"
                                              value={transform.cropX ?? '0'}
                                              onFocus={holdPreview}
                                              onBlur={() => setRenderPreviewHold(false)}
                                              onKeyDown={(event) => {
                                                if (event.key === 'Enter') setRenderPreviewHold(false);
                                              }}
                                              onChange={e => setRenderImageTransforms(prev => ({
                                                ...prev,
                                                [file.id]: { ...prev[file.id], cropX: e.target.value }
                                              }))}
                                              className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-200 focus:outline-none"
                                            />
                                          </div>
                                          <div className="flex flex-col gap-1">
                                            <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Crop Y (%)</label>
                                            <input
                                              type="number"
                                              step="1"
                                              value={transform.cropY ?? '0'}
                                              onFocus={holdPreview}
                                              onBlur={() => setRenderPreviewHold(false)}
                                              onKeyDown={(event) => {
                                                if (event.key === 'Enter') setRenderPreviewHold(false);
                                              }}
                                              onChange={e => setRenderImageTransforms(prev => ({
                                                ...prev,
                                                [file.id]: { ...prev[file.id], cropY: e.target.value }
                                              }))}
                                              className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-200 focus:outline-none"
                                            />
                                          </div>
                                          <div className="flex flex-col gap-1">
                                            <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Crop W (%)</label>
                                            <input
                                              type="number"
                                              step="1"
                                              value={transform.cropW ?? '100'}
                                              onFocus={holdPreview}
                                              onBlur={() => setRenderPreviewHold(false)}
                                              onKeyDown={(event) => {
                                                if (event.key === 'Enter') setRenderPreviewHold(false);
                                              }}
                                              onChange={e => setRenderImageTransforms(prev => ({
                                                ...prev,
                                                [file.id]: { ...prev[file.id], cropW: e.target.value }
                                              }))}
                                              className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-200 focus:outline-none"
                                            />
                                          </div>
                                          <div className="flex flex-col gap-1">
                                            <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Crop H (%)</label>
                                            <input
                                              type="number"
                                              step="1"
                                              value={transform.cropH ?? '100'}
                                              onFocus={holdPreview}
                                              onBlur={() => setRenderPreviewHold(false)}
                                              onKeyDown={(event) => {
                                                if (event.key === 'Enter') setRenderPreviewHold(false);
                                              }}
                                              onChange={e => setRenderImageTransforms(prev => ({
                                                ...prev,
                                                [file.id]: { ...prev[file.id], cropH: e.target.value }
                                              }))}
                                              className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-200 focus:outline-none"
                                            />
                                          </div>
                                        </div>
                                        <div className="border border-zinc-800/70 rounded-lg p-2 mt-2 bg-zinc-950/50">
                                          <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2">Mask</div>
                                          <div className="grid grid-cols-2 gap-2">
                                            <div className="flex flex-col gap-1">
                                              <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Type</label>
                                              <select
                                                value={transform.maskType ?? 'none'}
                                                onChange={e => setRenderImageTransforms(prev => ({
                                                  ...prev,
                                                  [file.id]: { ...prev[file.id], maskType: e.target.value as 'none' | 'rect' | 'circle' }
                                                }))}
                                                className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-200 focus:outline-none"
                                              >
                                                <option value="none">None</option>
                                                <option value="rect">Rectangle</option>
                                                <option value="circle">Circle</option>
                                              </select>
                                            </div>
                                          </div>
                                          {transform.maskType && transform.maskType !== 'none' && (
                                            <div className="grid grid-cols-2 gap-2 mt-2">
                                              <div className="flex flex-col gap-1">
                                                <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Left (%)</label>
                                                <input
                                                  type="number"
                                                  step="1"
                                                  value={transform.maskLeft ?? '0'}
                                                  onFocus={holdPreview}
                                                  onBlur={() => setRenderPreviewHold(false)}
                                                  onKeyDown={(event) => {
                                                    if (event.key === 'Enter') setRenderPreviewHold(false);
                                                  }}
                                                  onChange={e => setRenderImageTransforms(prev => ({
                                                    ...prev,
                                                    [file.id]: { ...prev[file.id], maskLeft: e.target.value }
                                                  }))}
                                                  className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-200 focus:outline-none"
                                                />
                                              </div>
                                              <div className="flex flex-col gap-1">
                                                <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Right (%)</label>
                                                <input
                                                  type="number"
                                                  step="1"
                                                  value={transform.maskRight ?? '0'}
                                                  onFocus={holdPreview}
                                                  onBlur={() => setRenderPreviewHold(false)}
                                                  onKeyDown={(event) => {
                                                    if (event.key === 'Enter') setRenderPreviewHold(false);
                                                  }}
                                                  onChange={e => setRenderImageTransforms(prev => ({
                                                    ...prev,
                                                    [file.id]: { ...prev[file.id], maskRight: e.target.value }
                                                  }))}
                                                  className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-200 focus:outline-none"
                                                />
                                              </div>
                                              <div className="flex flex-col gap-1">
                                                <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Top (%)</label>
                                                <input
                                                  type="number"
                                                  step="1"
                                                  value={transform.maskTop ?? '0'}
                                                  onFocus={holdPreview}
                                                  onBlur={() => setRenderPreviewHold(false)}
                                                  onKeyDown={(event) => {
                                                    if (event.key === 'Enter') setRenderPreviewHold(false);
                                                  }}
                                                  onChange={e => setRenderImageTransforms(prev => ({
                                                    ...prev,
                                                    [file.id]: { ...prev[file.id], maskTop: e.target.value }
                                                  }))}
                                                  className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-200 focus:outline-none"
                                                />
                                              </div>
                                              <div className="flex flex-col gap-1">
                                                <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Bottom (%)</label>
                                                <input
                                                  type="number"
                                                  step="1"
                                                  value={transform.maskBottom ?? '0'}
                                                  onFocus={holdPreview}
                                                  onBlur={() => setRenderPreviewHold(false)}
                                                  onKeyDown={(event) => {
                                                    if (event.key === 'Enter') setRenderPreviewHold(false);
                                                  }}
                                                  onChange={e => setRenderImageTransforms(prev => ({
                                                    ...prev,
                                                    [file.id]: { ...prev[file.id], maskBottom: e.target.value }
                                                  }))}
                                                  className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-200 focus:outline-none"
                                                />
                                              </div>
                                            </div>
                                          )}
                                          <div className="text-[10px] text-zinc-600 leading-snug mt-2">
                                            Mask uses item space (0–100% inset from the image frame after fit/scale).
                                          </div>
                                        </div>
                                        <div className="border border-zinc-800/70 rounded-lg p-2 mt-2 bg-zinc-950/50">
                                          <div className="flex items-center justify-between gap-2 mb-2">
                                            <div className="text-[10px] text-zinc-500 uppercase tracking-widest">Blur</div>
                                            <button
                                              type="button"
                                              onClick={() => addRenderImageBlurEffect(file.id)}
                                              className="text-[10px] rounded-md border border-zinc-700 px-2 py-1 text-zinc-200 hover:border-zinc-600"
                                            >
                                              + Blur region
                                            </button>
                                          </div>
                                          {(transform.blurEffects ?? []).length === 0 ? (
                                            <div className="text-[11px] text-zinc-500">No blur effect for this image track.</div>
                                          ) : (
                                            <div className="flex flex-col gap-2">
                                              {(transform.blurEffects ?? []).map((effect, idx) => (
                                                <div key={`img-blur-${file.id}-${idx}`} className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-2 flex flex-col gap-2">
                                                  <div className="flex items-center justify-between gap-2">
                                                    <span className="text-[10px] uppercase tracking-widest text-zinc-500">Region #{idx + 1}</span>
                                                    <button
                                                      type="button"
                                                      onClick={() => removeRenderImageBlurEffect(file.id, idx)}
                                                      className="text-[10px] text-red-400 hover:text-red-300"
                                                    >
                                                      Remove
                                                    </button>
                                                  </div>
                                                  <div className="grid grid-cols-2 gap-2">
                                                    <div className="flex flex-col gap-1">
                                                      <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Left (%)</label>
                                                      <input
                                                        type="number"
                                                        step="1"
                                                        min="0"
                                                        max="100"
                                                        value={effect.left}
                                                        onFocus={holdPreview}
                                                        onKeyDown={releasePreviewOnEnter(() => commitRenderImageBlurEffectValue(file.id, idx, 'left'))}
                                                        onChange={e => {
                                                          const v = coerceNumber(e.target.value, effect.left) ?? effect.left;
                                                          updateRenderImageBlurEffect(file.id, idx, { left: v });
                                                        }}
                                                        onBlur={() => releasePreview(() => commitRenderImageBlurEffectValue(file.id, idx, 'left'))}
                                                        className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-200 focus:outline-none"
                                                      />
                                                    </div>
                                                    <div className="flex flex-col gap-1">
                                                      <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Right (%)</label>
                                                      <input
                                                        type="number"
                                                        step="1"
                                                        min="0"
                                                        max="100"
                                                        value={effect.right}
                                                        onFocus={holdPreview}
                                                        onKeyDown={releasePreviewOnEnter(() => commitRenderImageBlurEffectValue(file.id, idx, 'right'))}
                                                        onChange={e => {
                                                          const v = coerceNumber(e.target.value, effect.right) ?? effect.right;
                                                          updateRenderImageBlurEffect(file.id, idx, { right: v });
                                                        }}
                                                        onBlur={() => releasePreview(() => commitRenderImageBlurEffectValue(file.id, idx, 'right'))}
                                                        className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-200 focus:outline-none"
                                                      />
                                                    </div>
                                                    <div className="flex flex-col gap-1">
                                                      <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Top (%)</label>
                                                      <input
                                                        type="number"
                                                        step="1"
                                                        min="0"
                                                        max="100"
                                                        value={effect.top}
                                                        onFocus={holdPreview}
                                                        onKeyDown={releasePreviewOnEnter(() => commitRenderImageBlurEffectValue(file.id, idx, 'top'))}
                                                        onChange={e => {
                                                          const v = coerceNumber(e.target.value, effect.top) ?? effect.top;
                                                          updateRenderImageBlurEffect(file.id, idx, { top: v });
                                                        }}
                                                        onBlur={() => releasePreview(() => commitRenderImageBlurEffectValue(file.id, idx, 'top'))}
                                                        className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-200 focus:outline-none"
                                                      />
                                                    </div>
                                                    <div className="flex flex-col gap-1">
                                                      <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Bottom (%)</label>
                                                      <input
                                                        type="number"
                                                        step="1"
                                                        min="0"
                                                        max="100"
                                                        value={effect.bottom}
                                                        onFocus={holdPreview}
                                                        onKeyDown={releasePreviewOnEnter(() => commitRenderImageBlurEffectValue(file.id, idx, 'bottom'))}
                                                        onChange={e => {
                                                          const v = coerceNumber(e.target.value, effect.bottom) ?? effect.bottom;
                                                          updateRenderImageBlurEffect(file.id, idx, { bottom: v });
                                                        }}
                                                        onBlur={() => releasePreview(() => commitRenderImageBlurEffectValue(file.id, idx, 'bottom'))}
                                                        className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-200 focus:outline-none"
                                                      />
                                                    </div>
                                                  </div>
                                                  <div className="flex flex-col gap-2">
                                                    <div className="flex items-center justify-between gap-2">
                                                      <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Blur strength</label>
                                                      <span className="text-xs tabular-nums text-zinc-300">{effect.sigma.toFixed(1)}</span>
                                                    </div>
                                                    <input
                                                      type="range"
                                                      min={0.5}
                                                      max={80}
                                                      step={0.5}
                                                      value={effect.sigma}
                                                      onMouseDown={holdPreview}
                                                      onTouchStart={holdPreview}
                                                      onChange={e => {
                                                        const v = Number(e.target.value);
                                                        if (!Number.isFinite(v)) return;
                                                        updateRenderImageBlurEffect(file.id, idx, { sigma: Math.min(80, Math.max(0.5, v)) });
                                                      }}
                                                      onMouseUp={() => releasePreview(() => commitRenderImageBlurEffectValue(file.id, idx, 'sigma'))}
                                                      onTouchEnd={() => releasePreview(() => commitRenderImageBlurEffectValue(file.id, idx, 'sigma'))}
                                                      className="w-full accent-lime-400 cursor-pointer"
                                                    />
                                                  </div>
                                                  <div className="flex flex-col gap-2">
                                                    <div className="flex items-center justify-between gap-2">
                                                      <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Feather</label>
                                                      <span className="text-xs tabular-nums text-zinc-300">{effect.feather}</span>
                                                    </div>
                                                    <input
                                                      type="range"
                                                      min={0}
                                                      max={RENDER_BLUR_FEATHER_MAX}
                                                      step={1}
                                                      value={effect.feather}
                                                      onMouseDown={holdPreview}
                                                      onTouchStart={holdPreview}
                                                      onChange={e => {
                                                        const v = Number(e.target.value);
                                                        if (!Number.isFinite(v)) return;
                                                        updateRenderImageBlurEffect(file.id, idx, {
                                                          feather: Math.min(RENDER_BLUR_FEATHER_MAX, Math.max(0, Math.round(v)))
                                                        });
                                                      }}
                                                      onMouseUp={() => releasePreview(() => commitRenderImageBlurEffectValue(file.id, idx, 'feather'))}
                                                      onTouchEnd={() => releasePreview(() => commitRenderImageBlurEffectValue(file.id, idx, 'feather'))}
                                                      className="w-full accent-lime-400 cursor-pointer"
                                                    />
                                                  </div>
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        )}
                      </div>
                    ) : renderSelectedItem ? (
                      <div className="text-xs text-zinc-300 flex flex-col gap-2">
                        <div className="flex items-center gap-2 text-sm text-zinc-100">
                          {renderSelectedItem.type === 'video' ? <FileVideo size={14} /> : renderSelectedItem.type === 'audio' ? <FileAudio size={14} /> : <Type size={14} />}
                          <span className="truncate font-semibold">{renderSelectedItem.name}</span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-zinc-500">
                          <span>Type</span>
                          <span className="text-zinc-300">{renderSelectedItem.type}</span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-zinc-500">
                          <span>Size</span>
                          <span className="text-zinc-300">{renderSelectedItem.size ?? renderSelectedItem.sizeBytes ?? '--'}</span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-zinc-500">
                          <span>Duration</span>
                          <span className="text-zinc-300">{renderSelectedItem.duration ?? formatDuration(renderSelectedItem.durationSeconds) ?? '--'}</span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-zinc-500">
                          <span>Language</span>
                          <span className="text-zinc-300">{renderSelectedItem.language ?? '--'}</span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-zinc-500">
                          <span>Version</span>
                          <span className="text-zinc-300">{renderSelectedItem.version ?? '--'}</span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-zinc-500">
                          <span>Origin</span>
                          <span className="text-zinc-300">{renderSelectedItem.origin ?? '--'}</span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-zinc-500">
                          <span>Status</span>
                          <span className="text-zinc-300">{renderSelectedItem.status ?? '--'}</span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-zinc-500">
                          <span>Created</span>
                          <span className="text-zinc-300">{renderSelectedItem.createdAt ?? '--'}</span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-zinc-500">
                          <span>Path</span>
                          <span className="text-zinc-300 truncate max-w-[160px]" title={renderSelectedItem.relativePath ?? '--'}>
                            {renderSelectedItem.relativePath ?? '--'}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-[11px] text-zinc-500">Select an item from the media bin.</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
  );
}
