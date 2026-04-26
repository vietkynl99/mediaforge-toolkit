import { VaultFile, VaultFolder, VaultFileType } from '../types/vault';

import { num } from './helpers';
import type { BlurRegionEffect } from '../types';

export const normalizeLoadedRenderEffects = (raw: unknown): BlurRegionEffect[] | undefined => {
  if (!Array.isArray(raw)) return undefined;
  const out: BlurRegionEffect[] = [];
  raw.forEach(item => {
    if (!item || typeof item !== 'object') return;
    const o = item as Record<string, unknown>;
    if (o.type !== 'blur_region') return;
    const sigma = Math.min(80, Math.max(0.5, num(o.sigma, 15)));
    const feather = Math.min(10, Math.max(0, num(o.feather, 0)));
    
    let left: number;
    let right: number;
    let top: number;
    let bottom: number;
    if (
      o.left !== undefined ||
      o.right !== undefined ||
      o.top !== undefined ||
      o.bottom !== undefined
    ) {
      left = Math.min(100, Math.max(0, num(o.left, 0)));
      right = Math.min(100, Math.max(0, num(o.right, 0)));
      top = Math.min(100, Math.max(0, num(o.top, 0)));
      bottom = Math.min(100, Math.max(0, num(o.bottom, 0)));
    } else {
      const x = Math.min(100, Math.max(0, num(o.x, 0)));
      const y = Math.min(100, Math.max(0, num(o.y, 0)));
      const w = Math.min(100, Math.max(0, num(o.w, 0)));
      const h = Math.min(100, Math.max(0, num(o.h, 0)));
      if (w <= 0 || h <= 0) return;
      left = x;
      top = y;
      right = Math.min(100, Math.max(0, 100 - x - w));
      bottom = Math.min(100, Math.max(0, 100 - y - h));
    }

    if (left + right >= 100 || top + bottom >= 100) return;
    out.push({ type: 'blur_region', left, right, top, bottom, sigma, feather });
  });
  return out;
};

export const normalizeItemEffects = (effects: Array<{ type: string; params?: Record<string, unknown> }> | undefined) => {
  if (!Array.isArray(effects) || effects.length === 0) return undefined;
  const flattened = effects.map(effect => ({
    type: effect.type,
    ...(effect.params ?? {})
  }));
  return normalizeLoadedRenderEffects(flattened);
};

export const computeFolderStatus = (files: VaultFile[]) => {
  if (files.some(file => file.status === 'error')) return 'error';
  const hasVideo = files.some(file => file.type === 'video');
  const hasSubtitle = files.some(file => file.type === 'subtitle');
  const hasOutput = files.some(file => file.type === 'output');
  if (hasVideo && hasSubtitle && hasOutput) return 'complete';
  if (hasVideo && (hasSubtitle || hasOutput)) return 'partial';
  return 'raw';
};

export const previewGroups = (folder: VaultFolder) => ([
  { type: 'video' as VaultFileType, label: 'Video' },
  { type: 'audio' as VaultFileType, label: 'Audio' },
  { type: 'subtitle' as VaultFileType, label: 'Subtitle' },
  { type: 'image' as VaultFileType, label: 'Image' },
  { type: 'other' as VaultFileType, label: 'Other' }
]).map(group => ({
  ...group,
  items: folder.files.filter(file => file.type === group.type)
}));

export const buildTooltip = (files: VaultFile[]) =>
  files.length ? files.map(file => file.name).join('\n') : 'No files';

export const computePlaceholderKeyByFileId = (
  files: Array<{ id: string; type: string }>,
  renderInputFileIds: string[]
): Record<string, string> => {
  const selected = renderInputFileIds
    .map(id => files.find(file => file.id === id))
    .filter((file): file is NonNullable<typeof file> => Boolean(file));
  const counts: Record<'video' | 'audio' | 'subtitle' | 'image', number> = {
    video: 0,
    audio: 0,
    subtitle: 0,
    image: 0
  };
  const fileIdToKey: Record<string, string> = {};
  selected.forEach(file => {
    if (file.type !== 'video' && file.type !== 'audio' && file.type !== 'subtitle' && file.type !== 'image') return;
    const t = file.type as 'video' | 'audio' | 'subtitle' | 'image';
    counts[t] += 1;
    const key = counts[t] === 1 ? file.type : `${file.type}${counts[t]}`;
    fileIdToKey[file.id] = key;
  });
  return fileIdToKey;
};

export const RENDER_TEXT_PARAM_FIELDS = new Set([
  'singleText',
  'singleTextStart',
  'singleTextEnd',
  'singleTextMatchDuration',
  'textOpacity',
  'textAutoMoveEnabled',
  'textAutoMoveInterval',
  'textAutoMovePositions'
]);

/**
 * Encode inputs sang URL format: "video:abc123,audio:def456,subtitle:xyz789"
 */
export const encodeInputsToUrl = (params: {
  renderVideoId: string | null;
  renderAudioId: string | null;
  renderSubtitleId: string | null;
  renderImageOrderIds: string[];
}): string => {
  const parts: string[] = [];
  if (params.renderVideoId) parts.push(`video:${params.renderVideoId}`);
  if (params.renderAudioId) parts.push(`audio:${params.renderAudioId}`);
  if (params.renderSubtitleId) parts.push(`subtitle:${params.renderSubtitleId}`);
  params.renderImageOrderIds.forEach((id, index) => {
    const key = index === 0 ? 'image' : `image${index + 1}`;
    parts.push(`${key}:${id}`);
  });
  return parts.join(',');
};

/**
 * Decode inputs từ URL format: "video:abc123,audio:def456,subtitle:xyz789"
 */
export const decodeInputsFromUrl = (input: string | null): {
  videoId: string | null;
  audioId: string | null;
  subtitleId: string | null;
  imageIds: string[];
  allIds: string[];
} => {
  const result = {
    videoId: null as string | null,
    audioId: null as string | null,
    subtitleId: null as string | null,
    imageIds: [] as string[],
    allIds: [] as string[]
  };

  if (!input) return result;

  input.split(',').forEach(part => {
    const [key, value] = part.split(':');
    if (!key || !value) return;
    
    if (key === 'video') {
      result.videoId = value;
      result.allIds.push(value);
    } else if (key === 'audio') {
      result.audioId = value;
      result.allIds.push(value);
    } else if (key === 'subtitle') {
      result.subtitleId = value;
      result.allIds.push(value);
    } else if (key.startsWith('image')) {
      result.imageIds.push(value);
      result.allIds.push(value);
    }
  });

  return result;
};
