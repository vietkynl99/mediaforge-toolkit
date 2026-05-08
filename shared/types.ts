export type LevelControl = 'gain' | 'loudness' | 'lufs';

/** Issue types for subtitle optimization */
export type IssueType = 'language' | 'length';

export type BlurRegionEffect = {
  type: 'blur_region';
  left: number;
  right: number;
  top: number;
  bottom: number;
  sigma: number;
  feather: number;
};

export type RenderEffectV2 = {
  type: string;
  params?: Record<string, unknown>;
};

export type RenderItemV2 = {
  id: string;
  name?: string;
  type: 'video' | 'audio' | 'image' | 'subtitle' | 'text';
  /**
   * Whether this track is visible/active during rendering.
   * Applies to video, image, subtitle, and text tracks.
   * Defaults to true when undefined. When false, the track is skipped entirely.
   */
  visible?: boolean;
  source: { ref?: string; path?: string };
  timeline?: { start?: number; duration?: number; trimStart?: number; trimEnd?: number; matchDuration?: boolean };
  layer?: number;
  mask?: { type: 'rect' | 'circle'; x: number; y: number; w: number; h: number };
  text?: { value: string; start?: number; end?: number; matchDuration?: string };
  transform?: {
    x?: number;
    y?: number;
    scale?: number;
    rotation?: number;
    opacity?: number;
    fit?: 'contain' | 'cover' | 'stretch';
    crop?: { x: number; y: number; w: number; h: number };
    mirror?: 'none' | 'horizontal' | 'vertical' | 'both';
  };
  audioMix?: {
    levelControl?: LevelControl;
    targetLufs?: number;
    gainDb?: number;
    mute?: boolean;
    /**
     * List of time segments where audio should be muted.
     * Each segment has start and end times in seconds.
     * During these segments, audio volume is set to 0.
     */
    muteSegments?: { start: number; end: number }[];
    fadeIn?: number;
    fadeOut?: number;
    delay?: number;
    group?: string;
  };
  subtitleStyle?: Record<string, unknown>;
  effects?: RenderEffectV2[];
};

export type RenderConfigV2 = {
  version: '2';
  timeline: {
    levelControl?: LevelControl;
    targetLufs?: number;
    resolution: string;
    framerate: number;
    duration?: number;
    start?: number;
    exportMode?: 'video+audio' | 'video only' | 'audio only';
  };
  inputsMap: Record<string, string>;
  items: RenderItemV2[];
  effects?: RenderEffectV2[];
};

// AI Provider Types
export type AiProviderType = 'gemini' | 'openrouter';

export interface AiProviderConfig {
  provider: AiProviderType;
  // Gemini settings
  geminiModel?: string;
  geminiApiKey?: string;
  // OpenRouter settings
  openrouterModel?: string;
  openrouterApiKey?: string;
  // Common settings
  translationBatchSize?: number;
  maxSingleLineWords?: number;
  autoSplitLongLines?: boolean;
  cpsThreshold?: {
    safeMax: number;
    warningMax: number;
  };
}

export interface AiCallParams {
  systemInstruction?: string;
  prompt: string;
  temperature?: number;
  responseMimeType?: string;
  responseSchema?: any;
  onLog?: (message: string) => void;
  signal?: AbortSignal;
}

export interface AiCallResult {
  text: string;
  usage?: {
    totalTokenCount?: number;
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
}

/**
 * Classify issue types from issue strings.
 * Returns a Set of issue types: 'language' | 'length'
 */
export function classifyIssues(issues: string[]): Set<IssueType> {
  const types = new Set<IssueType>();
  for (const i of issues) {
    const lower = i.toLowerCase();
    if (lower.includes('non-vietnamese word') ||
        (lower.includes('non-vietnamese characters') && !lower.includes('word'))) {
      types.add('language');
    }
    if (lower.includes('more than 2 lines') ||
        lower.includes('too many words') ||
        lower.includes('cps exceeds')) {
      types.add('length');
    }
  }
  return types;
}
