import React from 'react';
import { FileAudio, FileVideo, Menu, MousePointer2, Save, Type, Image } from 'lucide-react';

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
    renderReady,
    setShowRenderStudio,
    runPipelineJob,
    runPipelineSubmitting,
    renderStudioLeftMenuOpen,
    setRenderStudioLeftMenuOpen,
    renderStudioMediaBinOpen,
    setRenderStudioMediaBinOpen,
    renderStudioProjectOpen,
    setRenderStudioProjectOpen,
    renderStudioFocus,
    setRenderStudioFocus,
    renderStudioItemType,
    setRenderStudioItemType,
    renderInputFileIds,
    renderVideoId,
    setRenderVideoId,
    renderAudioId,
    setRenderAudioId,
    renderSubtitleId,
    setRenderSubtitleId,
    renderVideoFile,
    renderAudioFile,
    renderSubtitleFile,
    renderImageFiles,
    renderImageDurationEntries,
    renderImageDurations,
    setRenderImageDurations,
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
    showRenderTimelineImageTrack,
    showRenderTimelineEffectTracks,
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
    canBrowserPlayVideo,
    getVideoMimeType,
    renderSelectedItem,
    renderParamsDraft,
    updateRenderParamDraft,
    commitRenderParamDraftValue,
    commitRenderParamDraftOnEnter,
    updateRenderParam,
    setRenderStudioInspectorOpen,
    removeRenderEffect,
    addBlurRegionEffect,
    updateRenderEffectDraft,
    commitRenderEffectDraftValue,
    coerceNumber,
    RENDER_BLUR_FEATHER_MAX,
    RENDER_PREVIEW_BLACK_DATA_URL,
    runPipelineParamPreset,
    handleParamPresetChange,
    getParamPresetsForType,
    isRenderPresetDirty,
    selectProjectDefaults,
    renderPresetMenuCloseRef,
    renderPresetSaveMenuOpen,
    setRenderPresetSaveMenuOpen,
    saveRenderPresetLoading,
    saveRenderStudioParamPreset,
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
  const activeInspectorSection = selectedTrackKey
    ? (selectedTrackKey.startsWith('effects:') ? 'effects'
      : selectedTrackKey.startsWith('image:') ? 'image'
        : (selectedTrackKey as 'timeline' | 'video' | 'audio' | 'subtitle'))
    : 'timeline';

  const openInspectorSection = (section: 'timeline' | 'video' | 'audio' | 'subtitle' | 'effects' | 'image') => {
    setRenderStudioInspectorOpen({
      timeline: false,
      video: false,
      audio: false,
      subtitle: false,
      effects: false,
      image: false,
      [section]: true
    });
  };

  const selectTrack = (type: 'video' | 'audio' | 'subtitle' | 'image') => {
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
                      onClick={runPipelineJob}
                      disabled={!renderReady || runPipelineSubmitting}
                      className="px-4 py-1.5 text-xs font-semibold bg-lime-500 text-zinc-950 rounded-lg hover:bg-lime-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {runPipelineSubmitting ? 'Queuing...' : 'Render'}
                    </button>
                  </div>
                </div>

                <div className="grid min-h-0 flex-1 grid-cols-[260px_minmax(0,1fr)_300px]">
                  <div className="border-r border-zinc-800 bg-zinc-900/60 p-4 flex flex-col gap-4 min-h-0">
                    <div
                      role="button"
                      tabIndex={0}
                      aria-expanded={renderStudioLeftMenuOpen}
                      onClick={() => setRenderStudioLeftMenuOpen(prev => !prev)}
                      onKeyDown={event => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setRenderStudioLeftMenuOpen(prev => !prev);
                        }
                      }}
                      className="flex items-center justify-between text-[11px] text-zinc-400 uppercase tracking-widest cursor-pointer hover:text-zinc-200 transition-colors"
                    >
                      <span>Menu</span>
                      <button
                        type="button"
                        onClick={event => {
                          event.stopPropagation();
                          setRenderStudioLeftMenuOpen(prev => !prev);
                        }}
                        className="h-6 w-6 rounded-md border border-zinc-800 flex items-center justify-center hover:border-zinc-700"
                      >
                        <Menu size={12} />
                      </button>
                    </div>
                    {renderStudioLeftMenuOpen && (
                      <>
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
                        {runPipelineProject?.files.map(file => {
                          const isVideo = file.type === 'video';
                          const isAudio = file.type === 'audio';
                          const isSubtitle = file.type === 'subtitle';
                          const isImage = file.type === 'image';
                          const isSelected = renderStudioFocus === 'item'
                            ? isVideo
                              ? renderStudioItemType === 'video' && renderVideoId === file.id
                              : isAudio
                                ? renderStudioItemType === 'audio' && renderAudioId === file.id
                                : isSubtitle
                                  ? renderStudioItemType === 'subtitle' && renderSubtitleId === file.id
                                  : isImage
                                    ? renderStudioItemType === 'image' && renderInputFileIds?.includes?.(file.id)
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
                            setRenderStudioFocus('item');
                            setRenderStudioItemType('video');
                          }
                          : isAudio
                            ? () => {
                              setRenderAudioId(file.id);
                              setRenderStudioFocus('item');
                              setRenderStudioItemType('audio');
                            }
                            : isSubtitle
                              ? () => {
                                setRenderSubtitleId(file.id);
                                setRenderStudioFocus('item');
                                setRenderStudioItemType('subtitle');
                              }
                              : isImage
                                ? () => {
                                  setRenderStudioFocus('item');
                                  setRenderStudioItemType('image');
                                }
                                : undefined;
                          return (
                            <button
                              key={file.id}
                              onClick={onClick}
                              disabled={!onClick}
                              className={`rounded-lg border p-2 text-left flex flex-col gap-1 ${
                                isSelected ? selectedClass : 'border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:border-zinc-700'
                              } ${!onClick ? 'opacity-60 cursor-not-allowed' : ''}`}
                            >
                              <div className={`h-7 w-7 rounded-md ${iconClass} flex items-center justify-center`}>
                                {React.createElement(icon, { size: 14 })}
                              </div>
                              <div className="min-w-0">
                                <div className="text-[11px] font-semibold truncate">{file.name}</div>
                                <div className="text-[10px] text-zinc-500 truncate">{file.duration ?? file.size}</div>
                              </div>
                            </button>
                          );
                        })}
                        {runPipelineProject?.files.length === 0 && (
                          <div className="text-[11px] text-zinc-500">No files</div>
                        )}
                      </div>
                    )}

                    <div
                      role="button"
                      tabIndex={0}
                      aria-expanded={renderStudioProjectOpen}
                      onClick={() => setRenderStudioProjectOpen(prev => !prev)}
                      onKeyDown={event => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setRenderStudioProjectOpen(prev => !prev);
                        }
                      }}
                      className="flex items-center justify-between text-[11px] text-zinc-500 uppercase tracking-widest pt-2 border-t border-zinc-800/60 cursor-pointer hover:text-zinc-300 transition-colors"
                    >
                      <span>Timeline</span>
                      <button
                        type="button"
                        onClick={event => {
                          event.stopPropagation();
                          setRenderStudioProjectOpen(prev => !prev);
                        }}
                        className="h-6 w-6 rounded-md border border-zinc-800 flex items-center justify-center hover:border-zinc-700"
                      >
                        <Menu size={12} />
                      </button>
                    </div>
                    {renderStudioProjectOpen && (
                      <button
                        type="button"
                        onClick={selectProjectDefaults}
                        className={`rounded-xl border bg-zinc-950/40 p-3 text-[11px] text-zinc-400 flex flex-col gap-2 text-left hover:border-zinc-700 ${
                          renderStudioFocus === 'timeline' ? 'border-lime-500/50' : 'border-zinc-800'
                        }`}
                      >
                        <div className="text-[10px] uppercase tracking-widest text-zinc-500">Timeline</div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1 text-zinc-300">
                            <FileVideo size={12} />
                            <span>{renderVideoFile ? 1 : 0}</span>
                          </div>
                          <div className="flex items-center gap-1 text-zinc-300">
                            <FileAudio size={12} />
                            <span>{renderAudioFile ? 1 : 0}</span>
                          </div>
                          <div className="flex items-center gap-1 text-zinc-300">
                            <Type size={12} />
                            <span>{renderSubtitleFile ? 1 : 0}</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-zinc-300 pt-1 border-t border-zinc-800/60">
                          <span>Duration</span>
                          <span>{formatDuration(renderTimelineDuration) ?? '00:00'}</span>
                        </div>
                      </button>
                    )}
                      </>
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
                            <button
                              type="button"
                              onClick={addBlurRegionEffect}
                              disabled={!renderVideoFile}
                              className="px-2 py-1 text-[10px] font-semibold border border-zinc-800 rounded-md text-zinc-300 hover:text-zinc-100 hover:border-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              + Effect
                            </button>
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
                          <div className="w-16 flex flex-col gap-2">
                            <span className="h-5" />
                            {showRenderTimelineSubtitleTrack ? (
                              <span
                                className="text-zinc-500 flex items-center text-[10px] leading-tight"
                                style={{ height: renderSubtitleTrackHeight }}
                                title="Layer trên cùng (phủ lên các track bên dưới)"
                              >
                                Subtitle
                              </span>
                            ) : null}
                            {showRenderTimelineEffectTracks
                              ? renderParams.effects.map((effect, idx) => (
                                  <span
                                    key={`fx-label-${idx}`}
                                    className="text-zinc-500 h-3 flex items-center text-[10px] leading-none truncate"
                                    title={`Blur ${idx + 1} · σ${effect.sigma.toFixed(1)} · áp lên video bên dưới`}
                                  >
                                    Blur {idx + 1}
                                  </span>
                                ))
                              : null}
                            {showRenderTimelineImageTrack
                              ? renderImageFiles.map((file, idx) => (
                                  <span
                                    key={`img-label-${file.id}`}
                                    className="text-zinc-500 h-3 flex items-center text-[10px] leading-none truncate"
                                    title={file.name}
                                  >
                                    Image {idx + 1}
                                  </span>
                                ))
                              : null}
                            {showRenderTimelineVideoTrack ? (
                              <span className="text-zinc-500 h-3 flex items-center" title="Nguồn hình">
                                Video
                              </span>
                            ) : null}
                            {showRenderTimelineAudioTrack ? (
                              <span className="text-zinc-500 h-3 flex items-center" title="Layer dưới cùng (chỉ âm thanh)">
                                Audio
                              </span>
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
                              {showRenderTimelineEffectTracks
                                ? renderParams.effects.map((effect, idx) => (
                                    <div
                                      key={`fx-track-${idx}`}
                                      className="h-3 rounded-full bg-zinc-800 relative shrink-0 cursor-pointer"
                                      title={`Blur ${idx + 1}`}
                                      role="button"
                                      tabIndex={0}
                                      onClick={event => {
                                        event.stopPropagation();
                                        setSelectedTrackKey(`effects:${idx}`);
                                        openInspectorSection('effects');
                                      }}
                                      onKeyDown={event => {
                                        if (event.key === 'Enter' || event.key === ' ') {
                                          event.preventDefault();
                                          event.stopPropagation();
                                          setSelectedTrackKey(`effects:${idx}`);
                                          openInspectorSection('effects');
                                        }
                                      }}
                                    >
                                      {renderTimelineDuration > 0 && renderTimelineViewDuration > 0 ? (
                                        <div
                                          className={`h-full rounded-full ${idx % 2 === 0 ? 'bg-violet-500/55' : 'bg-fuchsia-500/45'} ${
                                            selectedTrackKey === `effects:${idx}` ? 'outline outline-2 outline-lime-400/80' : ''
                                          }`}
                                          style={{
                                            width: `${Math.min(100, (renderTimelineDuration / renderTimelineViewDuration) * 100)}%`
                                          }}
                                        />
                                      ) : null}
                                    </div>
                                  ))
                                : null}
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
                            {showRenderTimelineSubtitleTrack ? (
                              <span className="flex items-center" style={{ height: renderSubtitleTrackHeight }}>
                                {formatDuration(renderSubtitleDuration) ?? '--'}
                              </span>
                            ) : null}
                            {showRenderTimelineEffectTracks
                              ? renderParams.effects.map((effect, idx) => (
                                  <span
                                    key={`fx-dur-${idx}`}
                                    className="h-3 flex items-center tabular-nums"
                                    title={`σ${effect.sigma < 10 ? effect.sigma.toFixed(1) : Math.round(effect.sigma)} · same as timeline`}
                                  >
                                    {formatDuration(renderTimelineDuration) ?? '--'}
                                  </span>
                                ))
                              : null}
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

                  <div className="border-l border-zinc-800 bg-zinc-900/70 p-4 flex flex-col gap-4 min-h-0">
                    <div className="text-[11px] text-zinc-500 uppercase tracking-widest">Inspector</div>
                    <div className="flex flex-col gap-2 rounded-xl border border-zinc-800 bg-zinc-950/40 p-3 shrink-0">
                      <div className="text-[10px] text-zinc-500 uppercase tracking-widest">Preset Params</div>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                        <select
                          value={
                            typeof runPipelineParamPreset.render === 'string' &&
                            runPipelineParamPreset.render.startsWith('preset:')
                              ? runPipelineParamPreset.render
                              : 'custom'
                          }
                          onChange={e => handleParamPresetChange('render', e.target.value)}
                          className="min-h-[36px] flex-1 min-w-0 rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-lime-500/40"
                        >
                          <option value="custom">Custom</option>
                          {getParamPresetsForType('render').map(preset => {
                            const rawLabel = preset.label?.trim() ? preset.label : `Preset #${preset.id}`;
                            const selected = runPipelineParamPreset.render === `preset:${preset.id}`;
                            const label = selected && isRenderPresetDirty ? `*${rawLabel}` : rawLabel;
                            return (
                              <option key={preset.id} value={`preset:${preset.id}`}>
                                {label}
                              </option>
                            );
                          })}
                        </select>
                        <div
                          className="relative shrink-0 pb-2 -mb-2"
                          onMouseEnter={() => {
                            if (renderPresetMenuCloseRef.current) {
                              window.clearTimeout(renderPresetMenuCloseRef.current);
                              renderPresetMenuCloseRef.current = null;
                            }
                            setRenderPresetSaveMenuOpen(true);
                          }}
                          onMouseLeave={() => {
                            if (renderPresetMenuCloseRef.current) {
                              window.clearTimeout(renderPresetMenuCloseRef.current);
                            }
                            renderPresetMenuCloseRef.current = window.setTimeout(() => {
                              setRenderPresetSaveMenuOpen(false);
                              renderPresetMenuCloseRef.current = null;
                            }, 120);
                          }}
                          onFocusCapture={() => setRenderPresetSaveMenuOpen(true)}
                          onBlurCapture={event => {
                            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                              setRenderPresetSaveMenuOpen(false);
                            }
                          }}
                        >
                          <button
                            type="button"
                            disabled={saveRenderPresetLoading}
                            aria-label="Save preset options"
                            title="Save preset options"
                            className="inline-flex items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 p-2 text-xs font-medium text-zinc-200 hover:border-lime-500/50 hover:text-lime-300 disabled:opacity-50 shrink-0"
                          >
                            <Save size={14} className="shrink-0" />
                          </button>
                          {renderPresetSaveMenuOpen && !saveRenderPresetLoading && (
                            <div className="absolute right-0 top-full mt-1 w-24 rounded-lg border border-zinc-800 bg-zinc-950 shadow-lg shadow-black/40 z-20">
                              <button
                                type="button"
                                onClick={() => saveRenderStudioParamPreset('save')}
                                className="w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800/90 hover:text-zinc-50 rounded-t-lg transition-colors"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => saveRenderStudioParamPreset('saveAs')}
                                className="w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800/90 hover:text-zinc-50 rounded-b-lg transition-colors"
                              >
                                Save As
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    {renderStudioFocus === 'timeline' ? (
                      <div className="flex flex-col gap-3 text-xs text-zinc-300 min-h-0 overflow-y-auto pr-1">
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
                              <div className="flex items-center justify-between text-[11px] text-zinc-500">
                                <span>Timeline</span>
                                <span className="text-zinc-300">{formatDuration(renderTimelineDuration) ?? '--'}</span>
                              </div>
                              <div className="flex items-center justify-between text-[11px] text-zinc-500">
                                <span>Playhead</span>
                                <span className="text-zinc-300">{formatDurationFine(renderPlayheadSeconds)}</span>
                              </div>
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
                              <div className="text-[11px] text-zinc-500">
                                Output will be saved to the project output folder.
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
                                        onBlur={() => commitRenderParamDraftValue('video', 'trimStart')}
                                        onKeyDown={commitRenderParamDraftOnEnter('video', 'trimStart')}
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
                                        onBlur={() => commitRenderParamDraftValue('video', 'trimEnd')}
                                        onKeyDown={commitRenderParamDraftOnEnter('video', 'trimEnd')}
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
                                        onBlur={() => commitRenderParamDraftValue('video', 'speed')}
                                        onKeyDown={commitRenderParamDraftOnEnter('video', 'speed')}
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
                                        onBlur={() => commitRenderParamDraftValue('video', 'volume')}
                                        onKeyDown={commitRenderParamDraftOnEnter('video', 'volume')}
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
                                      <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Scale</label>
                                      <input
                                        type="number"
                                        step="0.05"
                                        min="0.1"
                                        value={renderParamsDraft.video.scale}
                                        onChange={e => updateRenderParamDraft('video', 'scale', e.target.value)}
                                        onBlur={() => commitRenderParamDraftValue('video', 'scale')}
                                        onKeyDown={commitRenderParamDraftOnEnter('video', 'scale')}
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
                                        onBlur={() => commitRenderParamDraftValue('video', 'positionX')}
                                        onKeyDown={commitRenderParamDraftOnEnter('video', 'positionX')}
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
                                        onBlur={() => commitRenderParamDraftValue('video', 'positionY')}
                                        onKeyDown={commitRenderParamDraftOnEnter('video', 'positionY')}
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
                                        onBlur={() => commitRenderParamDraftValue('video', 'rotation')}
                                        onKeyDown={commitRenderParamDraftOnEnter('video', 'rotation')}
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
                                        onBlur={() => commitRenderParamDraftValue('video', 'opacity')}
                                        onKeyDown={commitRenderParamDraftOnEnter('video', 'opacity')}
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
                                        onBlur={() => commitRenderParamDraftValue('video', 'cropX')}
                                        onKeyDown={commitRenderParamDraftOnEnter('video', 'cropX')}
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
                                        onBlur={() => commitRenderParamDraftValue('video', 'cropY')}
                                        onKeyDown={commitRenderParamDraftOnEnter('video', 'cropY')}
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
                                        onBlur={() => commitRenderParamDraftValue('video', 'cropW')}
                                        onKeyDown={commitRenderParamDraftOnEnter('video', 'cropW')}
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
                                        onBlur={() => commitRenderParamDraftValue('video', 'cropH')}
                                        onKeyDown={commitRenderParamDraftOnEnter('video', 'cropH')}
                                        className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                                      />
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <div className="flex flex-col gap-1">
                                      <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Fade In (s)</label>
                                      <input
                                        type="number"
                                        step="0.1"
                                        value={renderParamsDraft.video.fadeIn}
                                        onChange={e => updateRenderParamDraft('video', 'fadeIn', e.target.value)}
                                        onBlur={() => commitRenderParamDraftValue('video', 'fadeIn')}
                                        onKeyDown={commitRenderParamDraftOnEnter('video', 'fadeIn')}
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
                                        onBlur={() => commitRenderParamDraftValue('video', 'fadeOut')}
                                        onKeyDown={commitRenderParamDraftOnEnter('video', 'fadeOut')}
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
                                        onBlur={() => commitRenderParamDraftValue('audio', 'gainDb')}
                                        onKeyDown={commitRenderParamDraftOnEnter('audio', 'gainDb')}
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
                                        onBlur={() => commitRenderParamDraftValue('audio', 'fadeIn')}
                                        onKeyDown={commitRenderParamDraftOnEnter('audio', 'fadeIn')}
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
                                        onBlur={() => commitRenderParamDraftValue('audio', 'fadeOut')}
                                        onKeyDown={commitRenderParamDraftOnEnter('audio', 'fadeOut')}
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
                                        onBlur={() => commitRenderParamDraftValue('subtitle', 'fontSize')}
                                        onKeyDown={commitRenderParamDraftOnEnter('subtitle', 'fontSize')}
                                        className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                                      />
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-1 gap-2">
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
                                          onBlur={() => commitRenderParamDraftValue('subtitle', 'outline')}
                                          onKeyDown={commitRenderParamDraftOnEnter('subtitle', 'outline')}
                                          className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                                        />
                                      </div>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                      <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Shadow</label>
                                      <input
                                        type="number"
                                        step="1"
                                        value={renderParamsDraft.subtitle.shadow}
                                        onChange={e => updateRenderParamDraft('subtitle', 'shadow', e.target.value)}
                                        onBlur={() => commitRenderParamDraftValue('subtitle', 'shadow')}
                                        onKeyDown={commitRenderParamDraftOnEnter('subtitle', 'shadow')}
                                        className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
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
                                  <div className="flex flex-col gap-1">
                                    <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Spacing</label>
                                    <input
                                      type="number"
                                      step="1"
                                      value={renderParamsDraft.subtitle.spacing}
                                      onChange={e => updateRenderParamDraft('subtitle', 'spacing', e.target.value)}
                                      onBlur={() => commitRenderParamDraftValue('subtitle', 'spacing')}
                                      onKeyDown={commitRenderParamDraftOnEnter('subtitle', 'spacing')}
                                      className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                                    />
                                  </div>
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
                                        onBlur={() => commitRenderParamDraftValue('subtitle', 'marginL')}
                                        onKeyDown={commitRenderParamDraftOnEnter('subtitle', 'marginL')}
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
                                        onBlur={() => commitRenderParamDraftValue('subtitle', 'marginR')}
                                        onKeyDown={commitRenderParamDraftOnEnter('subtitle', 'marginR')}
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
                                        onBlur={() => commitRenderParamDraftValue('subtitle', 'marginV')}
                                        onKeyDown={commitRenderParamDraftOnEnter('subtitle', 'marginV')}
                                        className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                                      />
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-1 gap-2">
                                    <div className="flex flex-col gap-1">
                                      <label className="text-[10px] text-zinc-500 uppercase tracking-widest">WrapStyle</label>
                                      <select
                                        value={renderParamsDraft.subtitle.wrapStyle}
                                        onChange={e => {
                                          const v = e.target.value;
                                          updateRenderParamDraft('subtitle', 'wrapStyle', v);
                                          updateRenderParam('subtitle', 'wrapStyle', v);
                                        }}
                                        className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                                      >
                                        <option value="0">0 — smart wrap</option>
                                        <option value="1">1 — end of line</option>
                                        <option value="2">2 — no wrap</option>
                                        <option value="3">3 — smart (lower)</option>
                                      </select>
                                    </div>
                                  </div>
                                </>
                              ) : (
                                <div className="text-[11px] text-zinc-500">No subtitle selected.</div>
                              )}
                            </div>
                          )}
                        </div>
                        )}

                        {activeInspectorSection === 'effects' && (
                        <div className="rounded-xl border border-zinc-800 bg-zinc-950/40">
                          <div
                            role="button"
                            tabIndex={0}
                            aria-expanded={activeInspectorSection === 'effects'}
                            onClick={() => openInspectorSection('effects')}
                            onKeyDown={event => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                openInspectorSection('effects');
                              }
                            }}
                            className="flex items-center justify-between px-3 py-2 border-b border-zinc-800/60 cursor-pointer hover:bg-zinc-900/60 transition-colors"
                          >
                            <span className="text-[11px] uppercase tracking-widest text-zinc-500">Effects</span>
                            <button
                              type="button"
                              onClick={event => {
                                event.stopPropagation();
                                openInspectorSection('effects');
                              }}
                              className="h-6 w-6 rounded-md border border-zinc-800 flex items-center justify-center hover:border-zinc-700"
                            >
                              <Menu size={12} />
                            </button>
                          </div>
                          {activeInspectorSection === 'effects' && (
                            <div className="p-3 flex flex-col gap-3">
                              <button
                                type="button"
                                onClick={addBlurRegionEffect}
                                disabled={!renderVideoFile}
                                className="text-xs rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-zinc-200 hover:border-zinc-600 disabled:opacity-40"
                              >
                                + Blur region
                              </button>
                              {renderParamsDraft.effects.length === 0 ? (
                                <div className="text-[11px] text-zinc-500">No effects. Add a blur region to obscure part of the picture.</div>
                              ) : (
                                <div className="flex flex-col gap-3">
                                  {renderParamsDraft.effects.map((effect, idx) => (
                                    <div
                                      key={idx}
                                      className="rounded-lg border border-zinc-800 bg-zinc-900/80 p-2 flex flex-col gap-2"
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-[10px] uppercase tracking-widest text-zinc-500">
                                          Blur #{idx + 1}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => removeRenderEffect(idx)}
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
                                            onChange={e => {
                                              const v = coerceNumber(e.target.value, effect.left) ?? effect.left;
                                              updateRenderEffectDraft(idx, { left: v });
                                            }}
                                            onBlur={() => commitRenderEffectDraftValue(idx, 'left')}
                                            onKeyDown={event => {
                                              if (event.key === 'Enter') commitRenderEffectDraftValue(idx, 'left');
                                            }}
                                            className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
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
                                            onChange={e => {
                                              const v = coerceNumber(e.target.value, effect.right) ?? effect.right;
                                              updateRenderEffectDraft(idx, { right: v });
                                            }}
                                            onBlur={() => commitRenderEffectDraftValue(idx, 'right')}
                                            onKeyDown={event => {
                                              if (event.key === 'Enter') commitRenderEffectDraftValue(idx, 'right');
                                            }}
                                            className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                                          />
                                        </div>
                                      </div>
                                      <div className="grid grid-cols-2 gap-2">
                                        <div className="flex flex-col gap-1">
                                          <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Top (%)</label>
                                          <input
                                            type="number"
                                            step="1"
                                            min="0"
                                            max="100"
                                            value={effect.top}
                                            onChange={e => {
                                              const v = coerceNumber(e.target.value, effect.top) ?? effect.top;
                                              updateRenderEffectDraft(idx, { top: v });
                                            }}
                                            onBlur={() => commitRenderEffectDraftValue(idx, 'top')}
                                            onKeyDown={event => {
                                              if (event.key === 'Enter') commitRenderEffectDraftValue(idx, 'top');
                                            }}
                                            className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
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
                                            onChange={e => {
                                              const v = coerceNumber(e.target.value, effect.bottom) ?? effect.bottom;
                                              updateRenderEffectDraft(idx, { bottom: v });
                                            }}
                                            onBlur={() => commitRenderEffectDraftValue(idx, 'bottom')}
                                            onKeyDown={event => {
                                              if (event.key === 'Enter') commitRenderEffectDraftValue(idx, 'bottom');
                                            }}
                                            className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                                          />
                                        </div>
                                      </div>
                                      <div className="flex flex-col gap-2">
                                        <div className="flex items-center justify-between gap-2">
                                          <label className="text-[10px] text-zinc-500 uppercase tracking-widest">
                                            Blur strength
                                          </label>
                                          <span className="text-xs tabular-nums text-zinc-300">{effect.sigma.toFixed(1)}</span>
                                        </div>
                                        <input
                                          type="range"
                                          min={0.5}
                                          max={80}
                                          step={0.5}
                                          value={effect.sigma}
                                          onChange={e => {
                                            const v = Number(e.target.value);
                                            if (!Number.isFinite(v)) return;
                                            updateRenderEffectDraft(idx, {
                                              sigma: Math.min(80, Math.max(0.5, v))
                                            });
                                          }}
                                          onMouseUp={() => commitRenderEffectDraftValue(idx, 'sigma')}
                                          onTouchEnd={() => commitRenderEffectDraftValue(idx, 'sigma')}
                                          className="w-full accent-lime-400 cursor-pointer"
                                        />
                                      </div>
                                      <div className="flex flex-col gap-2">
                                        <div className="flex items-center justify-between gap-2">
                                          <label className="text-[10px] text-zinc-500 uppercase tracking-widest">
                                            Feather
                                          </label>
                                          <span className="text-xs tabular-nums text-zinc-300">{effect.feather}</span>
                                        </div>
                                        <input
                                          type="range"
                                          min={0}
                                          max={RENDER_BLUR_FEATHER_MAX}
                                          step={1}
                                          value={effect.feather}
                                          onChange={e => {
                                            const v = Number(e.target.value);
                                            if (!Number.isFinite(v)) return;
                                            updateRenderEffectDraft(idx, {
                                              feather: Math.min(RENDER_BLUR_FEATHER_MAX, Math.max(0, Math.round(v)))
                                            });
                                          }}
                                          onMouseUp={() => commitRenderEffectDraftValue(idx, 'feather')}
                                          onTouchEnd={() => commitRenderEffectDraftValue(idx, 'feather')}
                                          className="w-full accent-lime-400 cursor-pointer"
                                        />
                                        <div className="text-[10px] text-zinc-600 leading-snug">
                                          Softer edge: blur ramps from the crop border inward; 0 = hard rectangle.
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
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
                              {renderImageFiles.length === 0 ? (
                                <div className="text-[11px] text-zinc-500">No images selected.</div>
                              ) : (
                                <div className="flex flex-col gap-2">
                                  {renderImageFiles.map((file, index) => {
                                    const durationValue = renderImageDurations[file.id] ?? '';
                                    const transform = renderImageTransforms?.[file.id] ?? {};
                                    return (
                                      <div
                                        key={file.id}
                                        className="flex items-center gap-2 border border-zinc-800 rounded-lg px-2 py-1.5 bg-zinc-900/60"
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
                                          <div className="text-[10px] text-zinc-500">Layer {index + 1}</div>
                                        </div>
                                        <input
                                          type="number"
                                          min="0.1"
                                          step="0.1"
                                          value={durationValue}
                                          onChange={e => {
                                            const value = e.target.value;
                                            setRenderImageDurations(prev => ({ ...prev, [file.id]: value }));
                                          }}
                                          className="w-20 bg-zinc-900 border border-zinc-800 rounded-md px-2 py-1 text-xs text-zinc-200 focus:outline-none"
                                          placeholder="Duration"
                                        />
                                        <span className="text-[10px] text-zinc-500">s</span>
                                      </div>
                                    );
                                  })}
                                  {renderImageFiles.map(file => {
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
                                              onChange={e => setRenderImageTransforms(prev => ({
                                                ...prev,
                                                [file.id]: { ...prev[file.id], y: e.target.value }
                                              }))}
                                              className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-200 focus:outline-none"
                                            />
                                          </div>
                                          <div className="flex flex-col gap-1">
                                            <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Scale</label>
                                            <input
                                              type="number"
                                              step="0.01"
                                              value={transform.scale ?? '1'}
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
                                              onChange={e => setRenderImageTransforms(prev => ({
                                                ...prev,
                                                [file.id]: { ...prev[file.id], cropH: e.target.value }
                                              }))}
                                              className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-200 focus:outline-none"
                                            />
                                          </div>
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
