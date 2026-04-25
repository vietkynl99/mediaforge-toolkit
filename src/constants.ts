import { 
  Download, 
  FileAudio, 
  FileVideo,
  File
} from 'lucide-react';
import { TaskTemplate, PipelineSummary } from './types/index';

export const buildSingleTaskGraph = (task: { type: string; label: string; inputs: string[]; outputs: string[] }) => ({
  nodes: [
    {
      id: `${task.type}-1`,
      type: task.type,
      label: task.label,
      inputs: task.inputs,
      outputs: task.outputs,
      x: 120,
      y: 80
    }
  ],
  edges: []
});

export const AVAILABLE_TASKS: TaskTemplate[] = [
  {
    type: 'download',
    label: 'Download',
    desc: 'Download video and subtitles using yt-dlp.',
    inputs: ['URL'],
    outputs: ['Project'],
    params: [
      { name: 'downloadMode', desc: 'Download scope: all | subs | media.', type: 'string', default: 'all' },
      { name: 'subLangs', desc: 'Subtitle language codes (comma-separated).', type: 'string', default: 'ai-zh' },
      { name: 'noPlaylist', desc: 'Disable playlist downloads.', type: 'boolean', default: true }
    ]
  },
  {
    type: 'uvr',
    label: 'Vocal Removal',
    desc: 'Separate stems using UVR5.',
    inputs: ['Video/Audio'],
    outputs: ['Audio'],
    params: [
      { name: 'backend', desc: 'Processing backend', type: 'string', default: 'vr' },
      { name: 'model', desc: 'Model file to use', type: 'string', default: 'MGM_MAIN_v4.pth' },
      { name: 'outputFormat', desc: 'Output audio format', type: 'string', default: 'Mp3' }
    ]
  },
  {
    type: 'tts',
    label: 'Text-to-Speech',
    desc: 'Generate speech audio from subtitle.',
    inputs: ['Subtitle'],
    outputs: ['Audio'],
    params: [
      { name: 'voice', desc: 'Voice name', type: 'string', default: 'vi-VN-HoaiMyNeural' },
      { name: 'rate', desc: 'Speaking rate factor', type: 'number', default: 1 },
      { name: 'pitch', desc: 'Pitch in semitone', type: 'number', default: 0 }
    ],
    preview: 'tts'
  },
  {
    type: 'render',
    label: 'Render',
    desc: 'Combine video, audio, and subtitle into final output.',
    inputs: ['Files'],
    outputs: ['Video'],
    params: [
      { name: 'timeline.framerate', desc: 'Frame rate', type: 'number', default: 30 },
      { name: 'timeline.resolution', desc: 'Output resolution (e.g. 1920x1080)', type: 'string', default: '1920x1080' },
      { name: 'video.speed', desc: 'Playback speed', type: 'number', default: 1 },
      { name: 'video.volume', desc: 'Video audio volume (%)', type: 'number', default: 100 },
      { name: 'video.scale', desc: 'Scale (%)', type: 'number', default: 100 },
      { name: 'video.opacity', desc: 'Opacity (%)', type: 'number', default: 100 },
      { name: 'video.colorLut', desc: 'Color LUT id', type: 'string', default: '' },
      { name: 'video.cropX', desc: 'Crop X (%)', type: 'number', default: 0 },
      { name: 'video.cropY', desc: 'Crop Y (%)', type: 'number', default: 0 },
      { name: 'video.cropW', desc: 'Crop W (%)', type: 'number', default: 100 },
      { name: 'video.cropH', desc: 'Crop H (%)', type: 'number', default: 100 },
      { name: 'audio.gainDb', desc: 'Gain (dB)', type: 'number', default: 0 },
      { name: 'audio.mute', desc: 'Mute audio', type: 'boolean', default: false },
      { name: 'subtitle.fontName', desc: 'ASS Fontname (libass)', type: 'string', default: 'Arial' },
      { name: 'subtitle.fontSize', desc: 'Font size (px at PlayRes)', type: 'number', default: 72 },
      { name: 'subtitle.primaryColor', desc: 'Primary fill #RRGGBB', type: 'string', default: '#ffffff' },
      { name: 'subtitle.outlineColor', desc: 'Outline #RRGGBB', type: 'string', default: '#000000' },
      { name: 'subtitle.opacity', desc: 'Subtitle opacity (%)', type: 'number', default: 100 },
      { name: 'text.textOpacity', desc: 'Text track opacity (%)', type: 'number', default: 100 },
      { name: 'subtitle.bold', desc: '1 = bold', type: 'string', default: '0' },
      { name: 'subtitle.italic', desc: '1 = italic', type: 'string', default: '0' },
      { name: 'subtitle.spacing', desc: 'Character spacing', type: 'number', default: 0 },
      { name: 'subtitle.outline', desc: 'Outline width', type: 'number', default: 2 },
      { name: 'subtitle.shadow', desc: 'Shadow depth', type: 'number', default: 2 },
      { name: 'subtitle.alignment', desc: 'ASS numpad 1–9', type: 'number', default: 2 },
      { name: 'subtitle.marginL', desc: 'MarginL px (PlayRes)', type: 'number', default: 30 },
      { name: 'subtitle.marginR', desc: 'MarginR px (PlayRes)', type: 'number', default: 30 },
      { name: 'subtitle.marginV', desc: 'MarginV px (PlayRes)', type: 'number', default: 36 },
      { name: 'subtitle.wrapStyle', desc: 'Script WrapStyle 0–3', type: 'number', default: 0 },
      { name: 'text.textAutoMoveEnabled', desc: 'Text track auto move enabled (1/0)', type: 'string', default: '0' },
      { name: 'text.textAutoMoveInterval', desc: 'Text track auto move interval (s)', type: 'number', default: 0 },
      { name: 'text.textAutoMovePositions', desc: 'Text track auto move positions (x,y % list)', type: 'string', default: '' }
    ]
  }
];

export const PREFERRED_TTS_VOICES = ['vi-VN-HoaiMyNeural', 'vi-VN-NamMinhNeural'];

export const DOWNLOAD_MODE_OPTIONS = [
  { value: 'all', label: 'All (subs + audio + video)' },
  { value: 'subs', label: 'Subtitles only' },
  { value: 'media', label: 'Audio + video only' }
];

export const RENDER_STUDIO_PATH = '/render-studio';

export const RENDER_TIMELINE_VIEW_PAD = 0.12;
export const RENDER_TIMELINE_MAX_VIEW_DURATION = 20;

export const RENDER_BLUR_FEATHER_MAX = 10;

export const RENDER_PREVIEW_BLACK_DATA_URL =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAgAAAQABAAD//gAQTGF2YzU4LjU0LjEwMAD/2wBDAAg+Pkk+SVVVVVVVVWRdZGhoaGRkZGRoaGhwcHCDg4NwcHBoaHBwfHyDg4+Tj4eHg4eTk5ubm7q6srLZ2eD/////xABLAAEBAAAAAAAAAAAAAAAAAAAACAEBAAAAAAAAAAAAAAAAAAAAABABAAAAAAAAAAAAAAAAAAAAABEBAAAAAAAAAAAAAAAAAAAAAP/AABEIAPABQAMBIgACEQADEQD/2gANK6EDEQA/AJ/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB//9k=';

export const TAB_PATH_MAP: Record<string, string> = {
  dashboard: '/dashboard',
  forge: '/pipeline-forge',
  vault: '/media-vault',
  settings: '/settings',
  logs: '/logs'
};

export const TASK_PIPELINE_PREFIX = 'task:';

export const resolvePipelineIcon = (pipeline: PipelineSummary) => {
  const type = pipeline.primaryType ?? (pipeline.kind === 'task' ? pipeline.id.slice(TASK_PIPELINE_PREFIX.length) : null);
  const task = type ? AVAILABLE_TASKS.find(item => item.type === type) : null;
  return (task as any)?.icon ?? File;
};
