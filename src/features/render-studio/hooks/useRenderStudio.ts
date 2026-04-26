import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { 
  VaultFolder, 
  VaultFile, 
  RenderConfigV2, 
  DEFAULT_RENDER_PARAMS,
  BlurRegionEffect,
  RenderSubtitleAssState,
  VaultFileType,
  RenderTemplate
} from '../../../types/index';
import { 
  parseDurationToSeconds, 
  coerceNumber 
} from '../../../utils/helpers';
import { RENDER_TIMELINE_VIEW_PAD, RENDER_TIMELINE_MAX_VIEW_DURATION } from '../../../constants';
import { 
  buildRenderConfigV2, 
  buildTemplateFromConfig, 
  normalizeTemplateForComparison 
} from '../utils/config-builder';

export function useRenderStudio(project: VaultFolder | null, initialTemplates: RenderTemplate[] = []) {
  const [renderParams, setRenderParams] = useState(DEFAULT_RENDER_PARAMS);
  const [renderParamsDraft, setRenderParamsDraft] = useState(DEFAULT_RENDER_PARAMS);
  const [renderInputFileIds, setRenderInputFileIds] = useState<string[]>([]);
  const [renderVideoId, setRenderVideoId] = useState<string | null>(null);
  const [renderAudioId, setRenderAudioId] = useState<string | null>(null);
  const [renderSubtitleId, setRenderSubtitleId] = useState<string | null>(null);
  const [renderImageOrderIds, setRenderImageOrderIds] = useState<string[]>([]);
  const [renderImageDurations, setRenderImageDurations] = useState<Record<string, string>>({});
  const [renderImageMatchDuration, setRenderImageMatchDuration] = useState<Record<string, boolean>>({});
  const [renderImageTransforms, setRenderImageTransforms] = useState<Record<string, any>>({});
  const [renderVideoTransforms, setRenderVideoTransforms] = useState<Record<string, any>>({});
  const [renderAudioTransforms, setRenderAudioTransforms] = useState<Record<string, any>>({});
  const [renderTrackLabels, setRenderTrackLabels] = useState<Record<string, string>>({});
  const [renderTimelineScale, setRenderTimelineScale] = useState(-1);
  const [renderPlayheadSeconds, setRenderPlayheadSeconds] = useState(0);
  const [renderStudioFocus, setRenderStudioFocus] = useState<'timeline' | 'item'>('timeline');
  const [renderStudioItemType, setRenderStudioItemType] = useState<VaultFileType | 'text' | null>(null);
  const [renderSubtitleCues, setRenderSubtitleCues] = useState<Array<{ start: number; end: number; text: string }>>([]);
  const [renderTimelineViewportWidth, setRenderTimelineViewportWidth] = useState(0);
  const [renderTextTrackEnabled, setRenderTextTrackEnabled] = useState(false);
  const [renderPreviewUrl, setRenderPreviewUrl] = useState<string | null>(null);
  const [renderPreviewLoading, setRenderPreviewLoading] = useState(false);
  const [renderPreviewError, setRenderPreviewError] = useState<string | null>(null);
  const [renderPreviewHold, setRenderPreviewHold] = useState(false);
  const [renderTemplates, setRenderTemplates] = useState<RenderTemplate[]>(initialTemplates);
  const [runPipelineRenderTemplateId, setRunPipelineRenderTemplateId] = useState('custom');
  const [renderTemplateApplyMap, setRenderTemplateApplyMap] = useState<Record<string, string>>({});
  const [renderTemplateApplyMapById, setRenderTemplateApplyMapById] = useState<Record<string, Record<string, string>>>({});
  const [renderTemplateApplyTarget, setRenderTemplateApplyTarget] = useState<RenderTemplate | null>(null);
  const [renderTemplateApplyOpen, setRenderTemplateApplyOpen] = useState(false);

  const renderTimelineDragRef = useRef<{ active: boolean; startX: number; scrollLeft: number; moved: boolean }>({
    active: false,
    startX: 0,
    scrollLeft: 0,
    moved: false
  });
  const renderTimelineScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (project) {
      const files = project.files || [];
      const firstVideo = files.find(f => f.type === 'video');
      const firstAudio = files.find(f => f.type === 'audio');
      const firstSubtitle = files.find(f => f.type === 'subtitle');
      
      setRenderVideoId(firstVideo?.id ?? null);
      setRenderAudioId(firstAudio?.id ?? null);
      setRenderSubtitleId(firstSubtitle?.id ?? null);
      
      setRenderInputFileIds(
        [firstVideo?.id, firstAudio?.id, firstSubtitle?.id].filter(Boolean) as string[]
      );
    }
  }, [project?.id]);

  const renderVideoFile = useMemo(() => project?.files.find(f => f.id === renderVideoId), [project, renderVideoId]);
  const renderAudioFile = useMemo(() => project?.files.find(f => f.id === renderAudioId), [project, renderAudioId]);
  const renderSubtitleFile = useMemo(() => project?.files.find(f => f.id === renderSubtitleId), [project, renderSubtitleId]);

  const renderVideoDuration = useMemo(() => renderVideoFile?.durationSeconds ?? parseDurationToSeconds(renderVideoFile?.duration), [renderVideoFile]);
  const renderAudioDuration = useMemo(() => renderAudioFile?.durationSeconds ?? parseDurationToSeconds(renderAudioFile?.duration), [renderAudioFile]);
  const renderSubtitleDuration = useMemo(() => renderSubtitleFile?.durationSeconds ?? parseDurationToSeconds(renderSubtitleFile?.duration), [renderSubtitleFile]);

  const timelineDuration = useMemo(() => {
    const singleTextValue = String(renderParams.text.singleText ?? '').trim();
    const singleTextMatchDuration = String(renderParams.text.singleTextMatchDuration ?? '0') === '1';
    const singleTextStart = singleTextMatchDuration ? 0 : (coerceNumber(renderParams.text.singleTextStart, 0) ?? 0);
    const singleTextFallbackEnd = renderVideoDuration ?? renderAudioDuration ?? 5;
    const singleTextEnd = singleTextMatchDuration ? singleTextFallbackEnd : (coerceNumber(renderParams.text.singleTextEnd, singleTextFallbackEnd) ?? singleTextFallbackEnd);
    const singleTextTrackEnd = (singleTextValue || renderTextTrackEnabled) ? singleTextStart + Math.max(0.01, singleTextEnd - singleTextStart) : 0;

    const baseMax = Math.max(
      renderVideoDuration ?? 0,
      renderAudioDuration ?? 0,
      renderSubtitleDuration ?? 0,
      singleTextTrackEnd
    );

    const imageDurationFallback = baseMax > 0 ? baseMax : 5;
    const imageMax = renderImageOrderIds.reduce((max, id) => {
      const d = renderImageMatchDuration[id] && baseMax > 0
        ? baseMax
        : (coerceNumber(renderImageDurations[id], imageDurationFallback) ?? imageDurationFallback);
      return Math.max(max, d);
    }, 0);

    return Math.max(baseMax, imageMax);
  }, [project, renderInputFileIds, renderImageDurations, renderParams.text, renderVideoDuration, renderAudioDuration, renderSubtitleDuration, renderImageOrderIds, renderImageMatchDuration, renderTextTrackEnabled]);

  const renderTimelineViewDuration = useMemo(() => 
    timelineDuration > 0 ? timelineDuration * (1 + RENDER_TIMELINE_VIEW_PAD) : 0
  , [timelineDuration]);

  const renderConfigPreviewRaw = useMemo(() => {
    if (!project) return null;
    return buildRenderConfigV2({
      project,
      renderInputFileIds,
      renderParams,
      renderTrackLabels,
      renderImageDurations,
      renderImageMatchDuration,
      renderImageTransforms,
      renderVideoTransforms,
      renderAudioTransforms,
      renderVideoId,
      renderTimelineDuration: timelineDuration
    });
  }, [
    project,
    renderInputFileIds,
    renderParams,
    renderTrackLabels,
    renderImageDurations,
    renderImageMatchDuration,
    renderImageTransforms,
    renderVideoTransforms,
    renderAudioTransforms,
    renderVideoId,
    timelineDuration
  ]);

  const renderConfigPreview = useMemo(() => renderConfigPreviewRaw, [renderConfigPreviewRaw]);

  const isRenderTemplateDirty = useMemo(() => {
    if (runPipelineRenderTemplateId === 'custom') return false;
    const template = renderTemplates.find(t => t.id === runPipelineRenderTemplateId);
    if (!template || !renderConfigPreview) return false;
    const normalizedCurrent = normalizeTemplateForComparison(buildTemplateFromConfig(renderConfigPreview));
    const normalizedTemplate = normalizeTemplateForComparison(buildTemplateFromConfig(template.config));
    return JSON.stringify(normalizedCurrent) !== JSON.stringify(normalizedTemplate);
  }, [runPipelineRenderTemplateId, renderTemplates, renderConfigPreview]);

  const renderSubtitleLanes = useMemo(() => {
    if (renderSubtitleCues.length === 0) return [];
    const sorted = [...renderSubtitleCues].sort((a, b) => {
      if (a.start !== b.start) return a.start - b.start;
      return a.end - b.end;
    });
    const lanes: Array<Array<{ start: number; end: number; text: string }>> = [];
    sorted.forEach(cue => {
      let placed = false;
      for (let i = 0; i < lanes.length; i += 1) {
        const lane = lanes[i];
        const last = lane[lane.length - 1];
        if (!last || last.end <= cue.start) {
          lane.push(cue);
          placed = true;
          break;
        }
      }
      if (!placed) lanes.push([cue]);
    });
    return lanes;
  }, [renderSubtitleCues]);

  const renderSelectedItem = useMemo(() => {
    if (renderStudioFocus !== 'item' || !project) return null;
    const files = project.files || [];
    if (renderStudioItemType === 'video') return files.find(file => file.id === renderVideoId) ?? null;
    if (renderStudioItemType === 'audio') return files.find(file => file.id === renderAudioId) ?? null;
    if (renderStudioItemType === 'subtitle') return files.find(file => file.id === renderSubtitleId) ?? null;
    if (renderStudioItemType === 'text') return null;
    if (renderStudioItemType === 'image') {
      const imageId = renderInputFileIds.find(id => files.find(f => f.id === id)?.type === 'image');
      return files.find(file => file.id === imageId) ?? null;
    }
    return null;
  }, [renderStudioFocus, renderStudioItemType, project, renderVideoId, renderAudioId, renderSubtitleId, renderInputFileIds]);

  const renderTimelineMinScale = useMemo(() => 
    renderTimelineViewDuration > 0 && renderTimelineViewportWidth > 0
      ? renderTimelineViewportWidth / (renderTimelineViewDuration * 24)
      : 0.1
  , [renderTimelineViewDuration, renderTimelineViewportWidth]);

  const renderTimelineMaxScale = useMemo(() => 
    renderTimelineViewportWidth > 0
      ? renderTimelineViewportWidth / (RENDER_TIMELINE_MAX_VIEW_DURATION * 24)
      : 4
  , [renderTimelineViewportWidth]);

  useEffect(() => {
    if (renderTimelineScale < renderTimelineMinScale) {
      setRenderTimelineScale(renderTimelineMinScale);
    }
  }, [renderTimelineMinScale, renderTimelineScale]);

  const configV2 = useMemo(() => {
    if (!project) return null;
    return buildRenderConfigV2({
      project,
      renderInputFileIds,
      renderParams,
      renderTrackLabels,
      renderImageDurations,
      renderImageMatchDuration,
      renderImageTransforms,
      renderVideoTransforms,
      renderAudioTransforms,
      renderVideoId,
      renderTimelineDuration: timelineDuration
    });
  }, [
    project, 
    renderInputFileIds, 
    renderParams, 
    renderTrackLabels, 
    renderImageDurations, 
    renderImageMatchDuration, 
    renderImageTransforms, 
    renderVideoTransforms, 
    renderAudioTransforms,
    renderVideoId,
    timelineDuration
  ]);

  const updateRenderParam = useCallback((section: string, key: string, value: any) => {
    setRenderParams(prev => ({
      ...prev,
      [section]: {
        ...(prev as any)[section],
        [key]: value
      }
    }));
  }, []);

  const updateRenderParamDraft = useCallback((section: 'timeline' | 'video' | 'audio' | 'subtitle' | 'text', key: string, value: any) => {
    setRenderParamsDraft(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: value
      }
    }));
  }, []);

  const commitRenderParamDraftValue = useCallback((section: 'timeline' | 'video' | 'audio' | 'subtitle' | 'text', key: string) => {
    const value = (renderParamsDraft as any)?.[section]?.[key];
    updateRenderParam(section, key, value);
  }, [renderParamsDraft, updateRenderParam]);

  const defaultBlurRegionEffect = (): BlurRegionEffect => ({
    type: 'blur_region',
    left: 10,
    right: 10,
    top: 40,
    bottom: 40,
    sigma: 20,
    feather: 0
  });

  const addRenderVideoBlurEffect = useCallback((fileId: string | null) => {
    if (!fileId) return;
    setRenderVideoTransforms(prev => {
      const current = prev[fileId] ?? {};
      return {
        ...prev,
        [fileId]: {
          ...current,
          blurEffects: [...(current.blurEffects ?? []), defaultBlurRegionEffect()]
        }
      };
    });
  }, []);

  const updateRenderVideoBlurEffect = useCallback((fileId: string | null, index: number, patch: Partial<BlurRegionEffect>) => {
    if (!fileId) return;
    setRenderVideoTransforms(prev => {
      const current = prev[fileId] ?? {};
      const effects = current.blurEffects ?? [];
      return {
        ...prev,
        [fileId]: {
          ...current,
          blurEffects: effects.map((effect: any, effectIndex: number) => (
            effectIndex === index ? { ...effect, ...patch } : effect
          ))
        }
      };
    });
  }, []);

  const removeRenderVideoBlurEffect = useCallback((fileId: string | null, index: number) => {
    if (!fileId) return;
    setRenderVideoTransforms(prev => {
      const current = prev[fileId] ?? {};
      const effects = current.blurEffects ?? [];
      return {
        ...prev,
        [fileId]: {
          ...current,
          blurEffects: effects.filter((_: any, effectIndex: number) => effectIndex !== index)
        }
      };
    });
  }, []);

  const addRenderImageBlurEffect = useCallback((fileId: string) => {
    if (!fileId) return;
    setRenderImageTransforms(prev => {
      const current = prev[fileId] ?? {};
      return {
        ...prev,
        [fileId]: {
          ...current,
          blurEffects: [...(current.blurEffects ?? []), defaultBlurRegionEffect()]
        }
      };
    });
  }, []);

  const updateRenderImageBlurEffect = useCallback((fileId: string, index: number, patch: Partial<BlurRegionEffect>) => {
    if (!fileId) return;
    setRenderImageTransforms(prev => {
      const current = prev[fileId] ?? {};
      const effects = current.blurEffects ?? [];
      return {
        ...prev,
        [fileId]: {
          ...current,
          blurEffects: effects.map((effect: any, effectIndex: number) => (
            effectIndex === index ? { ...effect, ...patch } : effect
          ))
        }
      };
    });
  }, []);

  const removeRenderImageBlurEffect = useCallback((fileId: string, index: number) => {
    if (!fileId) return;
    setRenderImageTransforms(prev => {
      const current = prev[fileId] ?? {};
      const effects = current.blurEffects ?? [];
      return {
        ...prev,
        [fileId]: {
          ...current,
          blurEffects: effects.filter((_: any, effectIndex: number) => effectIndex !== index)
        }
      };
    });
  }, []);

  const updateRenderAudioTransform = useCallback((fileId: string | null, patch: Partial<{ targetLufs: string; gainDb: string; mute: boolean }>) => {
    if (!fileId) return;
    setRenderAudioTransforms(prev => ({
      ...prev,
      [fileId]: {
        ...(prev[fileId] ?? { targetLufs: '-14', gainDb: '0', mute: false }),
        ...patch
      }
    }));
  }, []);

  const getRenderAudioTransform = useCallback((fileId: string | null) => {
    if (!fileId) return null;
    return renderAudioTransforms[fileId] ?? null;
  }, [renderAudioTransforms]);

  const buildRenderTemplateApplyMap = useCallback((template: RenderTemplate) => {
    const inputs = Object.keys(template.config.inputsMap ?? {});
    const typeOfKey = (key: string) => {
      if (key.startsWith('video')) return 'video';
      if (key.startsWith('audio')) return 'audio';
      if (key.startsWith('subtitle')) return 'subtitle';
      if (key.startsWith('image')) return 'image';
      return null;
    };
    const availableFiles = project?.files ?? [];
    const filesByType = {
      video: availableFiles.filter(file => file.type === 'video'),
      audio: availableFiles.filter(file => file.type === 'audio'),
      subtitle: availableFiles.filter(file => file.type === 'subtitle'),
      image: availableFiles.filter(file => file.type === 'image')
    };
    const indices = { video: 0, audio: 0, subtitle: 0, image: 0 } as Record<string, number>;
    const mapping: Record<string, string> = {};
    inputs.forEach((key) => {
      const type = typeOfKey(key);
      if (!type) return;
      const file = filesByType[type][indices[type]];
      if (file) {
        mapping[key] = file.id;
        indices[type] += 1;
      }
    });
    return mapping;
  }, [project]);

  const commitRenderTemplateApplyMap = useCallback((templateId: string | null, mapping: Record<string, string>) => {
    if (!templateId) return;
    setRenderTemplateApplyMap(mapping);
    setRenderTemplateApplyMapById(prev => ({
      ...prev,
      [templateId]: mapping
    }));
  }, []);

  const restoreRenderTemplateCurrent = useCallback((template: RenderTemplate) => {
    const typeOfKey = (key: string) => {
      if (key.startsWith('video')) return 'video';
      if (key.startsWith('audio')) return 'audio';
      if (key.startsWith('subtitle')) return 'subtitle';
      if (key.startsWith('image')) return 'image';
      return null;
    };
    const mapping: Record<string, string> = {};
    // ... Simplified restore ...
    const generatedMapping = buildRenderTemplateApplyMap(template);
    commitRenderTemplateApplyMap(template.id, generatedMapping);
  }, [buildRenderTemplateApplyMap, commitRenderTemplateApplyMap]);

  const handleRenderTemplateChange = useCallback((value: string) => {
    setRunPipelineRenderTemplateId(value);
    if (value === 'custom') {
      return;
    }
    const template = renderTemplates.find(t => t.id === value);
    if (!template) return;
    const mapping = renderTemplateApplyMapById[template.id] ?? buildRenderTemplateApplyMap(template);
    setRenderTemplateApplyTarget(template);
    commitRenderTemplateApplyMap(template.id, mapping);
    applyRenderTemplate(template, mapping);
  }, [renderTemplates, renderTemplateApplyMapById, buildRenderTemplateApplyMap, commitRenderTemplateApplyMap, applyRenderTemplate]);

  const onRenderTemplatePlaceholderFile = useCallback((placeholderKey: string, fileId: string) => {
    const template = renderTemplates.find(t => t.id === runPipelineRenderTemplateId);
    if (!template || runPipelineRenderTemplateId === 'custom') return;
    const next = { ...renderTemplateApplyMap, [placeholderKey]: fileId };
    commitRenderTemplateApplyMap(template.id, next);
    applyRenderTemplate(template, next);
  }, [renderTemplates, runPipelineRenderTemplateId, renderTemplateApplyMap, commitRenderTemplateApplyMap, applyRenderTemplate]);

  const addRenderStudioFileToTimeline = useCallback((file: VaultFile) => {
    if (!file || !file.id) return;
    setRenderInputFileIds(prev => (prev.includes(file.id) ? prev : [...prev, file.id]));
    if (file.type === 'video') {
      setRenderVideoId(file.id);
      setRenderStudioFocus('timeline');
      setRenderStudioItemType(null);
    }
    if (file.type === 'audio') {
      setRenderAudioId(file.id);
      setRenderStudioFocus('timeline');
      setRenderStudioItemType(null);
    }
    if (file.type === 'subtitle') {
      setRenderSubtitleId(file.id);
      setRenderStudioFocus('timeline');
      setRenderStudioItemType(null);
    }
  }, []);

  const removeRenderStudioTrackFromTimeline = useCallback((track: { type: 'video' | 'audio' | 'subtitle' | 'image' | 'text' | 'effect'; id?: string; index?: number }) => {
    if (!track) return;
    if (track.type === 'text') {
      setRenderTextTrackEnabled(false);
      setRenderParams(prev => ({
        ...prev,
        text: {
          ...prev.text,
          singleText: '',
          singleTextStart: '0',
          singleTextEnd: '',
          singleTextMatchDuration: '0'
        }
      }));
      setRenderStudioFocus('timeline');
      setRenderStudioItemType(null);
      return;
    }
    const targetId =
      track.type === 'image'
        ? track.id
        : track.type === 'video'
          ? renderVideoId
          : track.type === 'audio'
            ? renderAudioId
            : renderSubtitleId;
    if (!targetId) return;
    const nextIds = renderInputFileIds.filter(id => id !== targetId);
    setRenderInputFileIds(nextIds);

    if (track.type === 'video') {
      const nextVideo = project?.files.find(file => (
        file.type === 'video' && nextIds.includes(file.id)
      ));
      setRenderVideoId(nextVideo?.id ?? null);
    }
    if (track.type === 'audio') {
      const nextAudio = project?.files.find(file => (
        file.type === 'audio' && nextIds.includes(file.id)
      ));
      setRenderAudioId(nextAudio?.id ?? null);
    }
    if (track.type === 'subtitle') {
      const nextSubtitle = project?.files.find(file => (
        file.type === 'subtitle' && nextIds.includes(file.id)
      ));
      setRenderSubtitleId(nextSubtitle?.id ?? null);
    }
    setRenderStudioFocus('timeline');
    setRenderStudioItemType(null);
  }, [project, renderInputFileIds, renderVideoId, renderAudioId, renderSubtitleId]);

  function applyRenderTemplate(template: RenderTemplate, mapping: Record<string, string>) {
    // Lấy file ID trực tiếp từ mapping theo placeholder key
    const videoId = mapping['video'] ?? mapping['video1'] ?? null;
    const audioId = mapping['audio'] ?? mapping['audio1'] ?? null;
    const subtitleId = mapping['subtitle'] ?? mapping['subtitle1'] ?? null;
    
    // Fallback: nếu không có trong mapping, lấy file đầu tiên của loại đó
    const selectedFiles = project?.files.filter(file => Object.values(mapping).includes(file.id)) ?? [];
    const firstVideo = selectedFiles.find(file => file.type === 'video');
    const firstImage = selectedFiles.find(file => file.type === 'image');
    const firstAudio = selectedFiles.find(file => file.type === 'audio');
    const firstSubtitle = selectedFiles.find(file => file.type === 'subtitle');

    setRenderVideoId(videoId ?? firstVideo?.id ?? firstImage?.id ?? null);
    setRenderAudioId(audioId ?? firstAudio?.id ?? null);
    setRenderSubtitleId(subtitleId ?? firstSubtitle?.id ?? null);

    const firstVideoItem = template.config.items.find(item => item.type === 'video') ?? null;
    if (firstVideoItem) {
      const transform = firstVideoItem.transform ?? {};
      const crop = (transform.crop ?? {}) as { x?: number; y?: number; w?: number; h?: number };
      const mask = firstVideoItem.mask;
      const scalePercent = (() => {
        const raw = typeof transform.scale === 'number' ? transform.scale : 1;
        return Math.round(raw * 100);
      })();
      const maskLeft = mask ? mask.x : undefined;
      const maskTop = mask ? mask.y : undefined;
      const maskRight = mask ? Math.max(0, 100 - (mask.x + mask.w)) : undefined;
      const maskBottom = mask ? Math.max(0, 100 - (mask.y + mask.h)) : undefined;

      setRenderParams(prev => ({
        ...prev,
        timeline: {
          ...prev.timeline,
          framerate: String(template.config.timeline?.framerate ?? prev.timeline.framerate),
          resolution: String(template.config.timeline?.resolution ?? prev.timeline.resolution),
          levelControl: template.config.timeline?.levelControl ?? prev.timeline.levelControl,
          targetLufs: String(template.config.timeline?.targetLufs ?? prev.timeline.targetLufs),
          exportMode: template.config.timeline?.exportMode ?? prev.timeline.exportMode
        },
        video: {
          ...prev.video,
          fit: transform.fit ?? prev.video.fit,
          positionX: String(transform.x ?? prev.video.positionX),
          positionY: String(transform.y ?? prev.video.positionY),
          scale: String(scalePercent),
          rotation: String(transform.rotation ?? prev.video.rotation),
          opacity: String(transform.opacity ?? prev.video.opacity),
          cropX: String(crop.x ?? prev.video.cropX),
          cropY: String(crop.y ?? prev.video.cropY),
          cropW: String(crop.w ?? prev.video.cropW),
          cropH: String(crop.h ?? prev.video.cropH),
          maskType: mask ? mask.type : prev.video.maskType,
          maskLeft: maskLeft !== undefined ? String(maskLeft) : prev.video.maskLeft,
          maskRight: maskRight !== undefined ? String(maskRight) : prev.video.maskRight,
          maskTop: maskTop !== undefined ? String(maskTop) : prev.video.maskTop,
          maskBottom: maskBottom !== undefined ? String(maskBottom) : prev.video.maskBottom,
          mirror: transform.mirror ?? prev.video.mirror,
          gainDb: String(firstVideoItem.audioMix?.gainDb ?? prev.video.gainDb),
          mute: Boolean(firstVideoItem.audioMix?.mute ?? prev.video.mute)
        }
      }));
    }

    const firstAudioItem = template.config.items.find(item => item.type === 'audio') ?? null;
    if (firstAudioItem?.audioMix) {
      setRenderParams(prev => ({
        ...prev,
        audio: {
          ...prev.audio,
          targetLufs: String(firstAudioItem.audioMix?.targetLufs ?? prev.audio.targetLufs),
          gainDb: String(firstAudioItem.audioMix?.gainDb ?? prev.audio.gainDb),
          mute: Boolean(firstAudioItem.audioMix?.mute ?? prev.audio.mute)
        }
      }));
    }

    // Restore audio transforms for each audio track
    const audioItems = template.config.items.filter(item => item.type === 'audio');
    if (audioItems.length > 0) {
      const audioIdsByRef = Object.keys(mapping)
        .filter(key => key.startsWith('audio'))
        .map(key => mapping[key])
        .filter((id): id is string => Boolean(id));
      setRenderAudioTransforms(prev => {
        const next = { ...prev };
        let fallbackIndex = 0;
        audioItems.forEach((item) => {
          const refKey = item.source?.ref;
          const targetId = refKey ? mapping[refKey] : audioIdsByRef[fallbackIndex++];
          if (!targetId) return;
          const audioMix = item.audioMix ?? {};
          next[targetId] = {
            ...(next[targetId] ?? { targetLufs: '-14', gainDb: '0', mute: false }),
            targetLufs: String(audioMix.targetLufs ?? next[targetId]?.targetLufs ?? '-14'),
            gainDb: String(audioMix.gainDb ?? next[targetId]?.gainDb ?? '0'),
            mute: Boolean(audioMix.mute ?? next[targetId]?.mute ?? false)
          };
        });
        return next;
      });
    }

    const firstSubtitleItem = template.config.items.find(item => item.type === 'subtitle') ?? null;
    if (firstSubtitleItem?.subtitleStyle) {
      const s = firstSubtitleItem.subtitleStyle as any;
      setRenderParams(prev => ({
        ...prev,
        subtitle: {
          ...prev.subtitle,
          fontName: String(s.fontName ?? prev.subtitle.fontName),
          fontSize: String(s.fontSize ?? prev.subtitle.fontSize),
          primaryColor: String(s.primaryColor ?? prev.subtitle.primaryColor),
          outlineColor: String(s.outlineColor ?? prev.subtitle.outlineColor),
          bold: s.bold ? '1' : '0',
          italic: s.italic ? '1' : '0',
          outline: String(s.outline ?? prev.subtitle.outline),
          shadow: String(s.shadow ?? prev.subtitle.shadow),
          alignment: String(s.alignment ?? prev.subtitle.alignment),
          marginL: String(s.marginL ?? prev.subtitle.marginL),
          marginR: String(s.marginR ?? prev.subtitle.marginR),
          marginV: String(s.marginV ?? prev.subtitle.marginV),
          positionMode: String(s.positionMode ?? prev.subtitle.positionMode),
          positionX: String(s.positionX ?? prev.subtitle.positionX),
          positionY: String(s.positionY ?? prev.subtitle.positionY)
        }
      }));
    }

    const imageItems = template.config.items.filter(item => item.type === 'image');
    if (imageItems.length > 0) {
      const imageIdsByRef = Object.keys(mapping)
        .filter(key => key.startsWith('image'))
        .map(key => mapping[key])
        .filter((id): id is string => Boolean(id));
      
      setRenderImageTransforms(prev => {
        const next = { ...prev };
        let fallbackIndex = 0;
        imageItems.forEach((item) => {
          const refKey = item.source?.ref;
          const targetId = refKey ? mapping[refKey] : imageIdsByRef[fallbackIndex++];
          if (!targetId) return;
          const transform = item.transform ?? {};
          const crop = (transform.crop ?? {}) as { x?: number; y?: number; w?: number; h?: number };
          const mask = item.mask;
          const scalePercent = (() => {
            const raw = typeof transform.scale === 'number' ? transform.scale : 1;
            return Math.round(raw * 100);
          })();
          const maskLeft = mask ? mask.x : undefined;
          const maskTop = mask ? mask.y : undefined;
          const maskRight = mask ? Math.max(0, 100 - (mask.x + mask.w)) : undefined;
          const maskBottom = mask ? Math.max(0, 100 - (mask.y + mask.h)) : undefined;
          // const blurEffects = normalizeItemEffects(item.effects) ?? next[targetId]?.blurEffects;
          
          next[targetId] = {
            ...(next[targetId] ?? {}),
            x: String(transform.x ?? next[targetId]?.x ?? '50'),
            y: String(transform.y ?? next[targetId]?.y ?? '50'),
            scale: String(scalePercent),
            rotation: String(transform.rotation ?? next[targetId]?.rotation ?? '0'),
            opacity: String(transform.opacity ?? next[targetId]?.opacity ?? '100'),
            fit: transform.fit ?? next[targetId]?.fit ?? 'contain',
            cropX: String(crop.x ?? next[targetId]?.cropX ?? '0'),
            cropY: String(crop.y ?? next[targetId]?.cropY ?? '0'),
            cropW: String(crop.w ?? next[targetId]?.cropW ?? '100'),
            cropH: String(crop.h ?? next[targetId]?.cropH ?? '100'),
            maskType: mask ? mask.type : (next[targetId]?.maskType ?? 'none'),
            maskLeft: maskLeft !== undefined ? String(maskLeft) : (next[targetId]?.maskLeft ?? '0'),
            maskRight: maskRight !== undefined ? String(maskRight) : (next[targetId]?.maskRight ?? '0'),
            maskTop: maskTop !== undefined ? String(maskTop) : (next[targetId]?.maskTop ?? '0'),
            maskBottom: maskBottom !== undefined ? String(maskBottom) : (next[targetId]?.maskBottom ?? '0'),
            mirror: transform.mirror ?? next[targetId]?.mirror ?? 'none',
            // blurEffects
          };
        });
        return next;
      });
    }

    const textItem = template.config.items.find(item => item.type === 'text');
    if (textItem?.text) {
      const textData = textItem.text;
      const matchDuration = textData.matchDuration === '1';
      setRenderParams(prev => ({
        ...prev,
        text: {
          ...prev.text,
          singleText: textData.value ?? prev.text.singleText,
          singleTextStart: matchDuration ? '0' : String(textData.start ?? 0),
          singleTextEnd: matchDuration ? '' : String(textData.end ?? 0),
          singleTextMatchDuration: textData.matchDuration ?? '0'
        }
      }));
      setRenderTextTrackEnabled(true);
    }
  }

  const onRenderTimelineClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const target = renderTimelineScrollRef.current;
    if (!target) return;
    if (renderTimelineDragRef.current.moved) {
      renderTimelineDragRef.current.moved = false;
      return;
    }
    setRenderStudioFocus('timeline');
    setRenderStudioItemType(null);
    if (timelineDuration <= 0 || renderTimelineViewDuration <= 0) return;
    const rect = target.getBoundingClientRect();
    const x = event.clientX - rect.left + target.scrollLeft;
    const renderTimelineWidth = Math.max(320, renderTimelineViewDuration * 24 * renderTimelineScale);
    const clamped = Math.max(0, Math.min(renderTimelineWidth, x));
    const secondsRaw = (clamped / renderTimelineWidth) * renderTimelineViewDuration;
    const seconds = Math.max(0, Math.min(timelineDuration, secondsRaw));
    setRenderPlayheadSeconds(seconds);
  }, [timelineDuration, renderTimelineViewDuration, renderTimelineScale]);

  return {
    renderParams,
    setRenderParams,
    renderParamsDraft,
    updateRenderParamDraft,
    commitRenderParamDraftValue,
    updateRenderParam,
    renderInputFileIds,
    setRenderInputFileIds,
    renderVideoId,
    setRenderVideoId,
    renderAudioId,
    setRenderAudioId,
    renderSubtitleId,
    setRenderSubtitleId,
    renderImageOrderIds,
    setRenderImageOrderIds,
    renderImageDurations,
    setRenderImageDurations,
    renderImageMatchDuration,
    setRenderImageMatchDuration,
    renderImageTransforms,
    setRenderImageTransforms,
    renderVideoTransforms,
    setRenderVideoTransforms,
    renderAudioTransforms,
    setRenderAudioTransforms,
    updateRenderAudioTransform,
    getRenderAudioTransform,
    renderTrackLabels,
    setRenderTrackLabels,
    timelineDuration,
    renderTimelineViewDuration,
    renderSubtitleLanes,
    renderSelectedItem,
    renderTimelineMinScale,
    renderTimelineMaxScale,
    configV2,
    renderTimelineScale,
    setRenderTimelineScale,
    renderPlayheadSeconds,
    setRenderPlayheadSeconds,
    renderStudioFocus,
    setRenderStudioFocus,
    renderStudioItemType,
    setRenderStudioItemType,
    renderSubtitleCues,
    setRenderSubtitleCues,
    renderTimelineViewportWidth,
    setRenderTimelineViewportWidth,
    renderTextTrackEnabled,
    setRenderTextTrackEnabled,
    renderPreviewUrl,
    setRenderPreviewUrl,
    renderPreviewLoading,
    setRenderPreviewLoading,
    renderPreviewError,
    setRenderPreviewError,
    renderPreviewHold,
    setRenderPreviewHold,
    renderTemplates,
    setRenderTemplates,
    runPipelineRenderTemplateId,
    setRunPipelineRenderTemplateId,
    renderTemplateApplyMap,
    setRenderTemplateApplyMap,
    renderTemplateApplyMapById,
    setRenderTemplateApplyMapById,
    renderTimelineDragRef,
    renderTimelineScrollRef,
    addRenderVideoBlurEffect,
    updateRenderVideoBlurEffect,
    removeRenderVideoBlurEffect,
    onRenderTimelineClick,
    renderVideoFile,
    renderAudioFile,
    renderSubtitleFile,
    isRenderTemplateDirty,
    restoreRenderTemplateCurrent,
    handleRenderTemplateChange,
    addRenderStudioFileToTimeline,
    removeRenderStudioTrackFromTimeline,
    renderTemplateApplyTarget,
    renderTemplateApplyOpen,
    setRenderTemplateApplyOpen,
    addRenderImageBlurEffect,
    updateRenderImageBlurEffect,
    removeRenderImageBlurEffect
  };
}
