import { RenderConfigV2, RenderItemV2, RenderEffectV2, LevelControl, BlurRegionEffect } from '../../shared/types';
export type { RenderConfigV2, RenderItemV2, RenderEffectV2, LevelControl, BlurRegionEffect };

export interface RenderSubtitleAssState {
  fontName: string;
  fontSize: string;
  primaryColor: string;
  outlineColor: string;
  opacity: string;
  textOpacity: string;
  bold: string;
  italic: string;
  spacing: string;
  outline: string;
  shadow: string;
  alignment: string;
  marginL: string;
  marginR: string;
  marginV: string;
  wrapStyle: string;
  positionMode: string;
  positionX: string;
  positionY: string;
  textAutoMoveEnabled?: string;
  textAutoMoveInterval?: string;
  textAutoMovePositions?: string;
  singleText?: string;
  singleTextStart?: string;
  singleTextEnd?: string;
  singleTextMatchDuration?: string;
}

export const DEFAULT_RENDER_SUBTITLE_ASS: RenderSubtitleAssState = {
  fontName: 'Arial',
  fontSize: '48',
  primaryColor: '#ffffff',
  outlineColor: '#000000',
  opacity: '100',
  textOpacity: '100',
  bold: '0',
  italic: '0',
  spacing: '0',
  outline: '2',
  shadow: '2',
  alignment: '2',
  marginL: '30',
  marginR: '30',
  marginV: '36',
  wrapStyle: '0',
  positionMode: 'anchor',
  positionX: '50',
  positionY: '50',
  textAutoMoveEnabled: '0',
  textAutoMoveInterval: '0',
  textAutoMovePositions: '',
  singleText: '',
  singleTextStart: '0',
  singleTextEnd: '',
  singleTextMatchDuration: '0'
};

export const BASE_SUBTITLE_STYLE: RenderSubtitleAssState = { ...DEFAULT_RENDER_SUBTITLE_ASS };

export interface SubtitleStylePreset {
  id: string;
  label: string;
  style: Partial<RenderSubtitleAssState>;
}

export const SUBTITLE_STYLE_PRESETS: SubtitleStylePreset[] = [
  {
    id: 'default',
    label: 'Default',
    style: { ...BASE_SUBTITLE_STYLE }
  },
  {
    id: 'bold-white',
    label: 'Bold',
    style: { ...BASE_SUBTITLE_STYLE, bold: '1', outline: '3', shadow: '3' }
  },
  {
    id: 'yellow',
    label: 'Yellow',
    style: { ...BASE_SUBTITLE_STYLE, primaryColor: '#ffd400' }
  },
  {
    id: 'cyan',
    label: 'Cyan',
    style: { ...BASE_SUBTITLE_STYLE, primaryColor: '#56d7ff' }
  },
  {
    id: 'pink',
    label: 'Pink',
    style: { ...BASE_SUBTITLE_STYLE, primaryColor: '#ff6ad5' }
  },
  {
    id: 'green',
    label: 'Green',
    style: { ...BASE_SUBTITLE_STYLE, primaryColor: '#9dff57' }
  },
  {
    id: 'red',
    label: 'Red',
    style: { ...BASE_SUBTITLE_STYLE, primaryColor: '#ff6b6b' }
  },
  {
    id: 'orange',
    label: 'Orange',
    style: { ...BASE_SUBTITLE_STYLE, primaryColor: '#ff9f1c' }
  },
  {
    id: 'blue',
    label: 'Blue',
    style: { ...BASE_SUBTITLE_STYLE, primaryColor: '#4dabff' }
  },
  {
    id: 'dark-box',
    label: 'Dark Box',
    style: {
      ...BASE_SUBTITLE_STYLE,
      outline: '0',
      shadow: '0'
    }
  },
  {
    id: 'light-box',
    label: 'Light Box',
    style: {
      ...BASE_SUBTITLE_STYLE,
      primaryColor: '#111111',
      outlineColor: '#ffffff',
      outline: '0',
      shadow: '0'
    }
  },
  {
    id: 'outline-only',
    label: 'Outline',
    style: {
      ...BASE_SUBTITLE_STYLE,
      outline: '4',
      shadow: '0'
    }
  }
];

export const VIET_SUBTITLE_FONTS = [
  'Be Vietnam Pro',
  'Noto Sans',
  'Noto Sans Display',
  'Roboto',
  'Inter',
  'Montserrat',
  'Lato',
  'Open Sans',
  'Source Sans 3',
  'Poppins',
  'Merriweather',
  'Playfair Display',
  'Times New Roman',
  'Arial',
  'Tahoma',
  'Verdana',
  'Segoe UI',
  'Georgia',
  'Courier New',
  'Oswald',
  'Quicksand',
  'Noto Sans JP',
  'Noto Sans SC',
  'Noto Sans TC',
  'Noto Sans KR'
];

export const DEFAULT_RENDER_PARAMS = {
  timeline: {
    framerate: '30',
    resolution: '1920x1080',
    levelControl: 'gain',
    targetLufs: '-14',
    exportMode: 'video+audio'
  },
  video: {
    trimStart: '',
    trimEnd: '',
    speed: '1',
    volume: '100',
    fit: 'contain',
    positionX: '50',
    positionY: '50',
    scale: '100',
    rotation: '0',
    opacity: '100',
    colorLut: '',
    cropX: '0',
    cropY: '0',
    cropW: '100',
    cropH: '100',
    maskType: 'none',
    maskLeft: '0',
    maskRight: '0',
    maskTop: '0',
    maskBottom: '0',
    mirror: 'none',
    fadeIn: '0',
    fadeOut: '0',
    targetLufs: '-14',
    gainDb: '0',
    mute: false
  },
  audio: {
    levelControl: 'lufs',
    targetLufs: '-14',
    gainDb: '0',
    mute: false,
    fadeIn: '0',
    fadeOut: '0'
  },
  subtitle: { ...DEFAULT_RENDER_SUBTITLE_ASS },
  text: { ...DEFAULT_RENDER_SUBTITLE_ASS }
};

export type RenderTemplate = {
  id: string;
  name: string;
  config: RenderConfigV2;
  updatedAt: string;
};
