export type LevelControl = 'gain' | 'loudness' | 'lufs';

export type RenderEffectV2 = {
  type: string;
  params?: Record<string, unknown>;
};

export type RenderItemV2 = {
  id: string;
  type: 'video' | 'audio' | 'image' | 'subtitle' | 'text';
  source: { ref?: string; path?: string };
  timeline?: { start?: number; duration?: number; trimStart?: number; trimEnd?: number };
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
    backgroundColor?: string;
    trackLabels?: Record<string, string>;
    imageMatchDuration?: Record<string, boolean>;
  };
  inputsMap: Record<string, string>;
  items: RenderItemV2[];
  effects?: RenderEffectV2[];
};
