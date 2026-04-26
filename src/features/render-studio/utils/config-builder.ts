import {
  RenderConfigV2,
  VaultFolder,
  VaultFile,
  RenderSubtitleAssState,
  DEFAULT_RENDER_PARAMS
} from '../../../types/index';
import {
  coerceNumber
} from '../../../utils/helpers';
import {
  RENDER_TEXT_PARAM_FIELDS
} from '../../../utils/vault';

/**
 * Các hàm helper chuyên dụng cho việc xây dựng Render Config V2
 */

/**
 * Phân loại rank cho các key của template (video -> audio -> subtitle -> image -> text)
 */
/**
 * Xây dựng cấu hình Render mặc định từ danh sách files của project
 */
export const buildDefaultRenderTemplateConfig = (files: VaultFile[]): RenderConfigV2 => {
  const firstVideo = files.find(file => file.type === 'video' && file.relativePath);
  const firstAudio = files.find(file => file.type === 'audio' && file.relativePath);
  const firstSubtitle = files.find(file => file.type === 'subtitle' && file.relativePath);
  const inputsMap: Record<string, string> = {};
  const items: RenderConfigV2['items'] = [];

  if (firstVideo?.relativePath) {
    inputsMap.video = firstVideo.relativePath;
    items.push({
      id: 'video-1',
      name: firstVideo.name || 'video',
      type: 'video',
      source: { ref: 'video' },
      timeline: { start: 0 },
      layer: 10,
      transform: {
        x: coerceNumber(DEFAULT_RENDER_PARAMS.video.positionX, 50),
        y: coerceNumber(DEFAULT_RENDER_PARAMS.video.positionY, 50),
        scale: (coerceNumber(DEFAULT_RENDER_PARAMS.video.scale, 100) ?? 100) / 100,
        rotation: coerceNumber(DEFAULT_RENDER_PARAMS.video.rotation, 0),
        opacity: coerceNumber(DEFAULT_RENDER_PARAMS.video.opacity, 100),
        fit: DEFAULT_RENDER_PARAMS.video.fit as 'contain' | 'cover' | 'stretch',
        crop: {
          x: coerceNumber(DEFAULT_RENDER_PARAMS.video.cropX, 0),
          y: coerceNumber(DEFAULT_RENDER_PARAMS.video.cropY, 0),
          w: coerceNumber(DEFAULT_RENDER_PARAMS.video.cropW, 100),
          h: coerceNumber(DEFAULT_RENDER_PARAMS.video.cropH, 100)
        },
        mirror: DEFAULT_RENDER_PARAMS.video.mirror as 'none' | 'horizontal' | 'vertical' | 'both' | undefined ?? 'none'
      }
    });
  }

  if (firstAudio?.relativePath) {
    inputsMap.audio = firstAudio.relativePath;
    items.push({
      id: 'audio-1',
      name: firstAudio.name || 'audio',
      type: 'audio',
      source: { ref: 'audio' },
      timeline: { start: 0 },
      layer: 0,
      audioMix: {
        levelControl: 'gain',
        targetLufs: coerceNumber(DEFAULT_RENDER_PARAMS.audio.targetLufs, -14),
        gainDb: coerceNumber(DEFAULT_RENDER_PARAMS.audio.gainDb, 0),
        mute: Boolean(DEFAULT_RENDER_PARAMS.audio.mute)
      }
    });
  }

  if (firstSubtitle?.relativePath) {
    inputsMap.subtitle = firstSubtitle.relativePath;
    items.push({
      id: 'subtitle-1',
      name: firstSubtitle.name || 'subtitle',
      type: 'subtitle',
      source: { ref: 'subtitle' },
      timeline: { start: 0 },
      layer: 20,
      subtitleStyle: {
        fontName: DEFAULT_RENDER_PARAMS.subtitle.fontName || 'Arial',
        fontSize: coerceNumber(DEFAULT_RENDER_PARAMS.subtitle.fontSize, 48),
        primaryColor: DEFAULT_RENDER_PARAMS.subtitle.primaryColor,
        outlineColor: DEFAULT_RENDER_PARAMS.subtitle.outlineColor,
        opacity: coerceNumber(DEFAULT_RENDER_PARAMS.subtitle.opacity, 100),
        bold: DEFAULT_RENDER_PARAMS.subtitle.bold === '1',
        italic: DEFAULT_RENDER_PARAMS.subtitle.italic === '1',
        spacing: 0,
        outline: coerceNumber(DEFAULT_RENDER_PARAMS.subtitle.outline, 2),
        shadow: coerceNumber(DEFAULT_RENDER_PARAMS.subtitle.shadow, 2),
        alignment: coerceNumber(DEFAULT_RENDER_PARAMS.subtitle.alignment, 2),
        marginL: coerceNumber(DEFAULT_RENDER_PARAMS.subtitle.marginL, 30),
        marginR: coerceNumber(DEFAULT_RENDER_PARAMS.subtitle.marginR, 30),
        marginV: coerceNumber(DEFAULT_RENDER_PARAMS.subtitle.marginV, 36),
        wrapStyle: 0,
        positionMode: DEFAULT_RENDER_PARAMS.subtitle.positionMode,
        positionX: coerceNumber(DEFAULT_RENDER_PARAMS.subtitle.positionX, 50),
        positionY: coerceNumber(DEFAULT_RENDER_PARAMS.subtitle.positionY, 50)
      }
    });
  }

  return {
    version: '2',
    timeline: {
      levelControl: DEFAULT_RENDER_PARAMS.timeline.levelControl as any,
      targetLufs: coerceNumber(DEFAULT_RENDER_PARAMS.timeline.targetLufs, -14),
      resolution: String(DEFAULT_RENDER_PARAMS.timeline.resolution),
      framerate: coerceNumber(DEFAULT_RENDER_PARAMS.timeline.framerate, 30) ?? 30,
      exportMode: DEFAULT_RENDER_PARAMS.timeline.exportMode as 'video+audio' | 'video only' | 'audio only'
    },
    inputsMap,
    items
  };
};

/**
 * Tóm tắt RenderConfigV2 để debug (xóa bớt các trường dư thừa)
 */
export const summarizeRenderConfigForDebug = (config: RenderConfigV2 | null | undefined) => {
  if (!config) return null;
  const summary: Record<string, unknown> = {
    timeline: {
      start: config.timeline?.start ?? 0,
      duration: config.timeline?.duration ?? null,
      framerate: config.timeline?.framerate ?? null,
      resolution: config.timeline?.resolution ?? null,
      exportMode: config.timeline?.exportMode ?? null
    },
    items: Array.isArray(config.items)
      ? config.items.map(item => ({
        id: item.id,
        type: item.type,
        timeline: item.timeline ?? null,
        text: item.type === 'text'
          ? {
            start: item.text?.start ?? null,
            end: item.text?.end ?? null,
            matchDuration: item.text?.matchDuration ?? null
          }
          : undefined
      }))
      : []
  };
  return summary;
};

/**
 * Chuẩn hóa Template để so sánh (xóa bỏ các trường layer nếu chỉ có 1 item cùng loại)
 */
export const normalizeTemplateForComparison = (config: RenderConfigV2): RenderConfigV2 => {
  const typeCounts = (config.items ?? []).reduce((acc, item) => {
    const key = String(item.type || '');
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  let items = (config.items ?? []).map(item => {
    const typeKey = String(item.type || '');
    if ((typeCounts[typeKey] ?? 0) <= 1 && item.layer !== undefined) {
      const { layer: _layer, ...rest } = item;
      return rest as RenderConfigV2['items'][number];
    }
    return item;
  });

  items = items.sort((a, b) => {
    const refA = a.source?.ref || (a.type === 'text' ? 'text' : a.type);
    const refB = b.source?.ref || (b.type === 'text' ? 'text' : b.type);
    return compareTemplateKeys(refA, refB);
  });

  return {
    ...config,
    items
  };
};

export const renderTemplateKeyRank = (key: string) => {
  const normalized = (key || '').toLowerCase();
  if (normalized === 'video' || normalized.startsWith('video')) return 0;
  if (normalized === 'audio' || normalized.startsWith('audio')) return 1;
  if (normalized === 'subtitle' || normalized.startsWith('subtitle')) return 2;
  if (normalized === 'image' || normalized.startsWith('image')) return 3;
  if (normalized === 'text') return 4;
  return 9;
};

/**
 * Tách key của template thành phần chữ và phần số (vd: video1 -> {base: 'video', index: 1})
 */
export const parseTemplateKey = (key: string) => {
  const normalized = (key || '').toLowerCase();
  const match = normalized.match(/^([a-z_]+?)(\d+)?$/i);
  if (!match) {
    return { base: normalized, index: Number.MAX_SAFE_INTEGER };
  }
  const base = match[1] || normalized;
  const index = match[2] ? Number(match[2]) : 1;
  return {
    base,
    index: Number.isFinite(index) ? index : Number.MAX_SAFE_INTEGER
  };
};

/**
 * So sánh 2 key của template để sắp xếp
 */
export const compareTemplateKeys = (left: string, right: string) => {
  const rankDiff = renderTemplateKeyRank(left) - renderTemplateKeyRank(right);
  if (rankDiff !== 0) return rankDiff;
  const l = parseTemplateKey(left);
  const r = parseTemplateKey(right);
  if (l.base !== r.base) return l.base.localeCompare(r.base);
  if (l.index !== r.index) return l.index - r.index;
  return left.localeCompare(right);
};

/**
 * Sắp xếp một Record dựa trên key của template
 */
export const sortRecordByTemplateKey = <T,>(record: Record<string, T> | undefined) => {
  if (!record || typeof record !== 'object') return record;
  return Object.keys(record)
    .sort(compareTemplateKeys)
    .reduce((acc, key) => {
      acc[key] = record[key];
      return acc;
    }, {} as Record<string, T>);
};

/**
 * Xây dựng cấu hình Template từ RenderConfigV2 hiện tại (xóa các thông tin cụ thể theo file/project)
 */
export const buildTemplateFromConfig = (config: RenderConfigV2): RenderConfigV2 => {
  const normalizedInputsMap = Object.keys(config.inputsMap ?? {})
    .sort(compareTemplateKeys)
    .reduce((acc, key) => {
      acc[key] = '';
      return acc;
    }, {} as Record<string, string>);

  const normalizedItems = [...(config.items ?? [])].map(item => {
    const nextItem: RenderConfigV2['items'][number] = { ...item };
    if (nextItem.timeline) {
      const { duration: _duration, ...timelineWithoutDuration } = nextItem.timeline;
      nextItem.timeline = timelineWithoutDuration;
    }
    if (nextItem.type === 'text' && nextItem.text) {
      const matchDuration = String(nextItem.text.matchDuration ?? '0') === '1';
      if (matchDuration) {
        const { start: _start, end: _end, ...textWithoutRange } = nextItem.text;
        nextItem.text = textWithoutRange;
      }
    }
    if (nextItem.audioMix) {
      const { levelControl: _levelControl, ...audioMixRest } = nextItem.audioMix;
      if (Object.keys(audioMixRest).length > 0) {
        nextItem.audioMix = audioMixRest;
      } else {
        delete nextItem.audioMix;
      }
    }
    return nextItem;
  });

  const { duration: _duration, ...timelineWithoutDuration } = (config.timeline ?? {}) as RenderConfigV2['timeline'];
  const exportMode = timelineWithoutDuration.exportMode ?? 'video+audio';

  return {
    version: '2',
    timeline: {
      ...timelineWithoutDuration,
      exportMode
    },
    inputsMap: normalizedInputsMap,
    items: normalizedItems
  };
};

export const buildMaskFromParams = (
  maskType: string | undefined,
  params: {
    left?: string | number;
    right?: string | number;
    top?: string | number;
    bottom?: string | number;
    x?: string | number;
    y?: string | number;
    w?: string | number;
    h?: string | number;
  }
) => {
  if (!maskType || maskType === 'none') return null;

  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

  if (params.left !== undefined || params.right !== undefined || params.top !== undefined || params.bottom !== undefined) {
    const leftRaw = coerceNumber(params.left, 0);
    const rightRaw = coerceNumber(params.right, 0);
    const topRaw = coerceNumber(params.top, 0);
    const bottomRaw = coerceNumber(params.bottom, 0);

    const left = clamp(leftRaw ?? 0, 0, 100);
    const right = clamp(rightRaw ?? 0, 0, 100);
    const top = clamp(topRaw ?? 0, 0, 100);
    const bottom = clamp(bottomRaw ?? 0, 0, 100);
    const w = clamp(100 - left - right, 0.1, 100);
    const h = clamp(100 - top - bottom, 0.1, 100);

    return {
      type: maskType === 'circle' ? 'circle' : 'rect',
      x: left,
      y: top,
      w,
      h
    };
  }

  const x = clamp(coerceNumber(params.x, 0) ?? 0, 0, 100);
  const y = clamp(coerceNumber(params.y, 0) ?? 0, 0, 100);
  const w = clamp(coerceNumber(params.w, 100) ?? 100, 0.1, 100);
  const h = clamp(coerceNumber(params.h, 100) ?? 100, 0.1, 100);

  return {
    type: maskType === 'circle' ? 'circle' : 'rect',
    x,
    y,
    w,
    h
  };
};

export const buildBlurEffectsFromRaw = (raw: any) => {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  return raw.map(effect => ({
    type: 'blur_region',
    params: {
      left: effect.left,
      right: effect.right,
      top: effect.top,
      bottom: effect.bottom,
      sigma: effect.sigma,
      feather: effect.feather
    }
  }));
};

export const parseAutoMovePositions = (raw: string): Array<{ x: number; y: number }> => {
  if (!raw || typeof raw !== 'string') return [];
  return raw
    .split(/[\n;]+/)
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => {
      const parts = item.split(/[, ]+/).filter(Boolean);
      if (parts.length < 2) return null;
      const x = coerceNumber(parts[0], NaN);
      const y = coerceNumber(parts[1], NaN);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return {
        x: Math.max(0, Math.min(100, x)),
        y: Math.max(0, Math.min(100, y))
      };
    })
    .filter((pos): pos is { x: number; y: number } => pos !== null);
};

export interface RenderConfigParams {
  project: VaultFolder;
  renderInputFileIds: string[];
  renderParams: any;
  renderTrackLabels: Record<string, string>;
  renderImageDurations: Record<string, string>;
  renderImageMatchDuration: Record<string, boolean>;
  renderImageTransforms: Record<string, any>;
  renderVideoTransforms: Record<string, any>;
  renderVideoId: string | null;
  renderTimelineDuration: number;
}

export function buildRenderConfigV2(params: RenderConfigParams): RenderConfigV2 | null {
  const {
    project,
    renderInputFileIds,
    renderParams,
    renderTrackLabels,
    renderImageDurations,
    renderImageMatchDuration,
    renderImageTransforms,
    renderVideoTransforms,
    renderVideoId,
    renderTimelineDuration
  } = params;

  if (!project) return null;
  const selected = renderInputFileIds
    .map(id => project.files.find(file => file.id === id))
    .filter((file): file is VaultFile => file !== undefined);
  if (!selected.length) return null;

  const counts = { video: 0, audio: 0, subtitle: 0, image: 0 } as Record<string, number>;
  const inputsMap: Record<string, string> = {};
  const items: RenderConfigV2['items'] = [];

  const timelineResolution = renderParams.timeline.resolution || '1920x1080';
  const timelineFramerate = coerceNumber(renderParams.timeline.framerate, 30) ?? 30;
  const targetLufs = coerceNumber(renderParams.timeline?.targetLufs, -14) ?? -14;

  const normalizeScaleFactor = (value: string | number | null | undefined, fallbackPercent = 100) => {
    const numeric = coerceNumber(value, fallbackPercent) ?? fallbackPercent;
    return numeric > 2 ? numeric / 100 : numeric;
  };

  const subtitleBaseStyle = { ...renderParams.subtitle } as Record<string, any>;
  const textBaseStyle = { ...renderParams.text } as Record<string, any>;
  const {
    singleText,
    singleTextStart,
    singleTextEnd,
    singleTextMatchDuration,
    textOpacity,
    textAutoMoveEnabled,
    textAutoMoveInterval,
    textAutoMovePositions
  } = renderParams.text;

  const autoMoveEnabled = String(textAutoMoveEnabled) === '1';
  const parsedAutoMoveInterval = coerceNumber(textAutoMoveInterval, 0) ?? 0;
  const parsedAutoMovePositions = parseAutoMovePositions(textAutoMovePositions || '');

  selected.forEach((file) => {
    if (!file.relativePath) return;
    if (file.type !== 'video' && file.type !== 'audio' && file.type !== 'subtitle' && file.type !== 'image') return;

    counts[file.type] += 1;
    const key = counts[file.type] === 1 ? file.type : `${file.type}${counts[file.type]}`;
    inputsMap[key] = file.relativePath;

    const labelFromUser = (renderTrackLabels[key] ?? '').trim();
    const name = labelFromUser || file.name || key;

    const baseItem: any = {
      id: `${file.type}-${counts[file.type]}`,
      name,
      type: file.type,
      source: { ref: key }
    };

    if (file.type === 'video' || file.type === 'image') {
      if (file.type === 'image') {
        const isMatch = renderImageMatchDuration[file.id];
        const duration = (isMatch && renderTimelineDuration > 0)
          ? renderTimelineDuration
          : (coerceNumber(renderImageDurations[file.id], 5) ?? 5);
        baseItem.timeline = {
          start: 0,
          duration,
          ...(isMatch ? { matchDuration: true } : {})
        };

        const t = renderImageTransforms[file.id];
        if (t) {
          baseItem.transform = {
            x: coerceNumber(t.x, 50),
            y: coerceNumber(t.y, 50),
            scale: normalizeScaleFactor(t.scale, 100),
            rotation: coerceNumber(t.rotation, 0),
            opacity: coerceNumber(t.opacity, 100),
            fit: t.fit ?? 'contain',
            crop: {
              x: coerceNumber(t.cropX, 0),
              y: coerceNumber(t.cropY, 0),
              w: coerceNumber(t.cropW, 100),
              h: coerceNumber(t.cropH, 100)
            },
            mirror: t.mirror ?? 'none'
          };
          const mask = buildMaskFromParams(t.maskType, t);
          if (mask) baseItem.mask = mask;
          const imageBlurEffects = buildBlurEffectsFromRaw(t.blurEffects);
          if (imageBlurEffects && imageBlurEffects.length > 0) baseItem.effects = imageBlurEffects;
        }
      }

      if (!baseItem.transform && file.type === 'video') {
        baseItem.transform = {
          x: coerceNumber(renderParams.video.positionX, 50),
          y: coerceNumber(renderParams.video.positionY, 50),
          scale: normalizeScaleFactor(renderParams.video.scale, 100),
          rotation: coerceNumber(renderParams.video.rotation, 0),
          opacity: coerceNumber(renderParams.video.opacity, 100),
          fit: renderParams.video.fit as any,
          crop: {
            x: coerceNumber(renderParams.video.cropX, 0),
            y: coerceNumber(renderParams.video.cropY, 0),
            w: coerceNumber(renderParams.video.cropW, 100),
            h: coerceNumber(renderParams.video.cropH, 100)
          },
          mirror: renderParams.video.mirror ?? 'none'
        };
        const mask = buildMaskFromParams(renderParams.video.maskType, renderParams.video);
        if (mask) baseItem.mask = mask;
      }

      if (file.type === 'video') {
        const videoBlurEffects = buildBlurEffectsFromRaw(renderVideoTransforms[file.id]?.blurEffects);
        if (videoBlurEffects && videoBlurEffects.length > 0) baseItem.effects = videoBlurEffects;
        baseItem.audioMix = {
          levelControl: renderParams.timeline.levelControl as any,
          targetLufs: coerceNumber(renderParams.video.targetLufs, -14),
          gainDb: coerceNumber(renderParams.video.gainDb, 0),
          mute: Boolean(renderParams.video.mute)
        };
      }
    }

    if (file.type === 'audio') {
      baseItem.audioMix = {
        levelControl: renderParams.timeline.levelControl as any,
        targetLufs: coerceNumber(renderParams.audio.targetLufs, -14),
        gainDb: coerceNumber(renderParams.audio.gainDb, 0),
        mute: Boolean(renderParams.audio.mute)
      };
    }

    if (file.type === 'subtitle') {
      baseItem.subtitleStyle = {
        fontName: subtitleBaseStyle.fontName || 'Arial',
        fontSize: coerceNumber(subtitleBaseStyle.fontSize, 48),
        primaryColor: subtitleBaseStyle.primaryColor,
        outlineColor: subtitleBaseStyle.outlineColor,
        opacity: coerceNumber(subtitleBaseStyle.opacity, 100),
        bold: subtitleBaseStyle.bold === '1',
        italic: subtitleBaseStyle.italic === '1',
        spacing: 0,
        outline: coerceNumber(subtitleBaseStyle.outline, 2),
        shadow: coerceNumber(subtitleBaseStyle.shadow, 2),
        alignment: coerceNumber(subtitleBaseStyle.alignment, 2),
        marginL: coerceNumber(subtitleBaseStyle.marginL, 30),
        marginR: coerceNumber(subtitleBaseStyle.marginR, 30),
        marginV: coerceNumber(subtitleBaseStyle.marginV, 36),
        wrapStyle: 0,
        positionMode: subtitleBaseStyle.positionMode,
        positionX: coerceNumber(subtitleBaseStyle.positionX, 50),
        positionY: coerceNumber(subtitleBaseStyle.positionY, 50)
      };
    }

    items.push(baseItem);
  });

  const singleTextValue = String(singleText ?? '').trim();
  if (singleTextValue) {
    const isSingleTextMatchDuration = String(singleTextMatchDuration ?? '0') === '1';
    const start = isSingleTextMatchDuration ? 0 : (coerceNumber(singleTextStart, 0) ?? 0);
    const fallbackEnd = renderTimelineDuration > 0 ? renderTimelineDuration : start + 5;
    const end = isSingleTextMatchDuration ? fallbackEnd : (coerceNumber(singleTextEnd, fallbackEnd) ?? fallbackEnd);

    const textSubtitleStyle: Record<string, unknown> = {
      ...textBaseStyle,
      opacity: coerceNumber(textOpacity, 100),
      spacing: 0,
      wrapStyle: 0
    };
    if (autoMoveEnabled && parsedAutoMoveInterval > 0 && parsedAutoMovePositions.length >= 2) {
      textSubtitleStyle.autoMoveInterval = parsedAutoMoveInterval;
      textSubtitleStyle.autoMovePositions = parsedAutoMovePositions;
    }

    const textLabel = (renderTrackLabels.text ?? '').trim() || 'Text';
    items.push({
      id: 'text-track',
      name: textLabel,
      type: 'text',
      source: {},
      timeline: { start, duration: Math.max(0.01, end - start) },
      text: { value: singleTextValue },
      subtitleStyle: textSubtitleStyle
    });
  }

  return {
    version: '2',
    timeline: {
      resolution: timelineResolution,
      framerate: timelineFramerate,
      levelControl: renderParams.timeline.levelControl as any,
      targetLufs: targetLufs,
      exportMode: renderParams.timeline.exportMode as 'video+audio' | 'video only' | 'audio only' || 'video+audio'
    },
    inputsMap,
    items
  };
}
