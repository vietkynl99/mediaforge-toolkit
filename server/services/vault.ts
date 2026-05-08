/**
 * Vault Module - File management, metadata, and vault reading
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { MEDIA_VAULT_ROOT, OUTPUT_DIR_NAMES } from '../constants.js';
import { runFfprobe } from './ffprobe.js';

// ─── Types ────────────────────────────────────────────────────────────

export type VaultFileDTO = {
  name: string;
  relativePath: string;
  sizeBytes: number;
  modifiedAt: string;
  type: 'video' | 'audio' | 'subtitle' | 'image' | 'output' | 'other';
  extension: string;
  durationSeconds?: number;
  linkedTo?: string;
  uvr?: {
    processedAt: string;
    backend?: string;
    model?: string;
    outputFormat?: string;
    outputs?: string[];
    role?: 'source' | 'output';
    sourceRelativePath?: string;
  };
  tts?: {
    processedAt: string;
    voice?: string;
    rate?: number;
    pitch?: number;
    overlapSeconds?: number;
    overlapMode?: 'overlap' | 'truncate';
    removeLineBreaks?: boolean;
    outputSignature?: string;
    outputDetails?: Record<string, {
      processedAt?: string;
      voice?: string;
      rate?: number;
      pitch?: number;
      overlapSeconds?: number;
      overlapMode?: 'overlap' | 'truncate';
      removeLineBreaks?: boolean;
      outputSignature?: string;
    }>;
    outputs?: string[];
    role?: 'source' | 'output';
    sourceRelativePath?: string;
  };
};

export type VaultFolderDTO = {
  name: string;
  path: string;
  files: VaultFileDTO[];
  status?: string;
};

// ─── Constants ────────────────────────────────────────────────────────

export const VIDEO_EXT = new Set(['.mp4', '.mkv', '.mov', '.avi', '.webm', '.m4v']);
export const AUDIO_EXT = new Set(['.wav', '.mp3', '.aac', '.flac', '.ogg', '.m4a']);
export const SUB_EXT = new Set(['.srt', '.vtt', '.ass', '.ssa', '.sub', '.sktproject']);
export const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tif', '.tiff']);

// ─── File Type Checkers ───────────────────────────────────────────────

export const isVideoFile = (filePath: string) => VIDEO_EXT.has(path.extname(filePath).toLowerCase());
export const isAudioFile = (filePath: string) => AUDIO_EXT.has(path.extname(filePath).toLowerCase());
export const isSubtitleFile = (filePath: string) => SUB_EXT.has(path.extname(filePath).toLowerCase());
export const isImageFile = (filePath: string) => IMAGE_EXT.has(path.extname(filePath).toLowerCase());

// ─── Safe Path Resolution ─────────────────────────────────────────────

export const resolveSafePath = (relativePath: string, vaultRoot: string) => {
  const normalized = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '');
  const fullPath = path.resolve(vaultRoot, normalized);
  const rootPath = path.resolve(vaultRoot);
  if (!fullPath.startsWith(`${rootPath}${path.sep}`) && fullPath !== rootPath) {
    return null;
  }
  return fullPath;
};

// ─── Content Type Mapping ─────────────────────────────────────────────

export const getContentType = (ext: string) => {
  const map: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.mkv': 'video/x-matroska',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.aac': 'audio/aac',
    '.flac': 'audio/flac',
    '.m4a': 'audio/mp4',
    '.ogg': 'audio/ogg',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.srt': 'application/x-subrip',
    '.vtt': 'text/vtt',
    '.ass': 'text/x-ssa',
    '.ssa': 'text/x-ssa',
    '.sktproject': 'application/json',
  };
  return map[ext.toLowerCase()] || 'application/octet-stream';
};

// ─── Duration Cache ───────────────────────────────────────────────────

const durationCache = new Map<string, { mtimeMs: number; duration: number }>();

// ─── Utility Functions ─────────────────────────────────────────────────

export const isOutputFile = (filePath: string, name: string) => {
  const lowered = `${filePath}/${name}`.toLowerCase();
  if (lowered.includes('/output/') || lowered.includes('/outputs/') || lowered.includes('/export/') || lowered.includes('/exports/')) {
    return true;
  }
  return lowered.includes('output') || lowered.includes('export') || lowered.includes('render') || lowered.includes('subbed');
};

export const detectType = (filePath: string, name: string): VaultFileDTO['type'] => {
  const ext = path.extname(name).toLowerCase();
  if (VIDEO_EXT.has(ext)) return 'video';
  if (AUDIO_EXT.has(ext)) return 'audio';
  if (SUB_EXT.has(ext)) return 'subtitle';
  if (IMAGE_EXT.has(ext)) return 'image';
  if (isOutputFile(filePath, name)) return 'output';
  return 'other';
};

export const parseTimeToSeconds = (value: string) => {
  const parts = value.replace(',', '.').split(':');
  if (parts.length < 3) return 0;
  const [hh, mm, ss] = parts;
  const seconds = Number.parseFloat(ss);
  return Number(hh) * 3600 + Number(mm) * 60 + seconds;
};

export const parseSubtitleDuration = (content: string, extension?: string) => {
  // Handle .sktproject JSON format
  if (extension === '.sktproject') {
    try {
      const json = JSON.parse(content);
      if (json.segments && Array.isArray(json.segments) && json.segments.length > 0) {
        const lastSegment = json.segments[json.segments.length - 1];
        if (lastSegment.end) {
          return parseTimeToSeconds(lastSegment.end);
        }
      }
    } catch {
      return 0;
    }
    return 0;
  }

  // Handle SRT/VTT/ASS formats
  const regex = /(\d{1,2}:\d{2}:\d{2}(?:[.,]\d{1,3})?)\s*-->\s*(\d{1,2}:\d{2}:\d{2}(?:[.,]\d{1,3})?)/g;
  let match: RegExpExecArray | null = null;
  let lastEnd = '';
  while ((match = regex.exec(content))) {
    lastEnd = match[2];
  }
  return lastEnd ? parseTimeToSeconds(lastEnd) : 0;
};

export const getDurationSeconds = async (fullPath: string, type: VaultFileDTO['type'], stats: { mtimeMs: number }) => {
  if (type !== 'video' && type !== 'audio' && type !== 'subtitle') return undefined;
  const cacheKey = `${fullPath}:${type}`;
  const cached = durationCache.get(cacheKey);
  if (cached && cached.mtimeMs === stats.mtimeMs) return cached.duration;

  try {
    let duration = 0;
    if (type === 'subtitle') {
      const content = await fs.readFile(fullPath, 'utf-8');
      const extension = path.extname(fullPath).toLowerCase();
      duration = parseSubtitleDuration(content, extension);
    } else {
      duration = await runFfprobe(fullPath);
    }
    if (duration > 0) {
      durationCache.set(cacheKey, { mtimeMs: stats.mtimeMs, duration });
      return duration;
    }
  } catch {
    return undefined;
  }
  return undefined;
};

// ─── Metadata Reading ─────────────────────────────────────────────────

export const buildUvrOutputMap = (uvrMeta: Map<string, VaultFileDTO['uvr']>) => {
  const outputMap = new Map<string, VaultFileDTO['uvr']>();
  for (const [sourceRelativePath, meta] of uvrMeta.entries()) {
    if (!meta?.outputs?.length) continue;
    meta.outputs.forEach(outputPath => {
      outputMap.set(outputPath, { ...meta, role: 'output', sourceRelativePath });
    });
  }
  return outputMap;
};

export const buildTtsOutputMap = (ttsMeta: Map<string, VaultFileDTO['tts']>) => {
  const outputMap = new Map<string, VaultFileDTO['tts']>();
  for (const [sourceRelativePath, meta] of ttsMeta.entries()) {
    if (!meta?.outputs?.length) continue;
    meta.outputs.forEach(outputPath => {
      const details = meta.outputDetails?.[outputPath];
      outputMap.set(outputPath, {
        ...meta,
        processedAt: details?.processedAt || meta.processedAt,
        voice: details?.voice ?? meta.voice,
        rate: details?.rate ?? meta.rate,
        pitch: details?.pitch ?? meta.pitch,
        overlapSeconds: details?.overlapSeconds ?? meta.overlapSeconds,
        overlapMode: details?.overlapMode ?? meta.overlapMode,
        removeLineBreaks: details?.removeLineBreaks ?? meta.removeLineBreaks,
        outputSignature: details?.outputSignature ?? meta.outputSignature,
        role: 'output',
        sourceRelativePath
      });
    });
  }
  return outputMap;
};

export const readProjectTtsMeta = async (projectRoot: string) => {
  const metaFile = path.join(projectRoot, '.mediaforge', 'tts.json');
  try {
    const raw = await fs.readFile(metaFile, 'utf-8');
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed) {
      return parsed as Record<string, VaultFileDTO['tts']>;
    }
  } catch {
    return {};
  }
  return {};
};

export const readProjectUvrMeta = async (projectRoot: string) => {
  const metaFile = path.join(projectRoot, '.mediaforge', 'uvr.json');
  try {
    const raw = await fs.readFile(metaFile, 'utf-8');
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed) {
      return parsed as Record<string, VaultFileDTO['uvr']>;
    }
  } catch {
    return {};
  }
  return {};
};

// Note: readProjectMeta and readVault need to be in index.ts due to dependencies
// But we can export the helper functions

export const readFilesFromDir = async (
  dirPath: string,
  basePath: string,
  includeSubdir = false,
  uvrMeta?: Map<string, VaultFileDTO['uvr']>,
  ttsMeta?: Map<string, VaultFileDTO['tts']>
) => {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files: VaultFileDTO[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const fullPath = path.join(dirPath, entry.name);
    const stats = await fs.stat(fullPath);
    const relativePath = path.relative(basePath, fullPath);
    const type = detectType(dirPath, entry.name);
    const durationSeconds = await getDurationSeconds(fullPath, type, stats);
    files.push({
      name: entry.name,
      relativePath,
      sizeBytes: stats.size,
      modifiedAt: stats.mtime.toISOString(),
      type: includeSubdir && type !== 'subtitle' && type !== 'video' && type !== 'audio'
        && type !== 'image'
        ? 'output'
        : type,
      extension: path.extname(entry.name).toLowerCase(),
      durationSeconds,
      uvr: uvrMeta?.get(relativePath),
      tts: ttsMeta?.get(relativePath),
      linkedTo: ttsMeta?.get(relativePath)?.sourceRelativePath ?? uvrMeta?.get(relativePath)?.sourceRelativePath
    });
  }

  return files;
};
