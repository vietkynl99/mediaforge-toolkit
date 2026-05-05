// Subtitle feature types adapted from SubtitleToolKit

export type SubtitleStatus = 'idle' | 'loading' | 'processing' | 'success' | 'partial-success' | 'error' | 'retry' | 'clearing';

export type SubtitleSeverity = 'safe' | 'warning' | 'critical';

// Alias for backward compatibility
export type Severity = SubtitleSeverity;

export type SubtitleAiModel = 'gemini-2.5-flash' | 'gemini-2.5-pro' | 'gemini-3-flash-preview' | 'gemini-3-pro-preview';

// Alias for backward compatibility
export type AiModel = SubtitleAiModel;

// AI Provider type
export type AiProviderType = 'gemini' | 'openrouter';

export interface TranslationPreset {
  reference: {
    title_or_summary: string;
  };
  genres: string[];
  character_names?: { id: number; cn: string; vn: string }[];
  humor_level: number;
}

export interface SubtitleSegment {
  id: number;
  startTime: string; // HH:MM:SS,mmm
  endTime: string;
  originalText: string | null; // Nullable for VN-only segments
  translatedText: string | null; // Nullable for CN-only segments
  optimizeHistory?: string[];
  isProcessing?: boolean;
  errors: SubtitleError[];
  severity: SubtitleSeverity;
  cps: number;
  issueList: string[];
}

export interface SktProject {
  version: string;
  original_title: string;
  created_at: string;
  updated_at: string;
  preset: TranslationPreset | null;
  segments: {
    id: number;
    start: string;
    end: string;
    original: string;
    translated: string;
    optimize_history?: string[];
  }[];
}

export interface SubtitleError {
  type: 'local' | 'heavy';
  message: string;
}

export interface HistogramBucket {
  range: string;
  min: number;
  max: number;
  count: number;
  percentage: number;
}

export interface AnalysisResult {
  totalLines: number;
  tooLongLines: number;
  singleLineLongLines: number;
  tooFastLines: number;
  timelineOverlapLines: number;
  invalidTimingLines: number;
  foreignWordLines: number;
  originalLangIssueLines: number;
  translatedLangIssueLines: number;
  translationQuoteIssueLines: number;
  avgCPS: number;
  minCPS: number;
  maxCPS: number;
  medianCPS: number;
  cpsGroups: {
    safe: number; 
    warning: number;
    critical: number;
  };
  cpsHistogram: HistogramBucket[];
}

export interface SubtitleAppSettings {
  cpsThreshold: {
    safeMax: number;
    warningMax: number;
  };
  translationBatchSize: number;
  // Provider settings
  provider?: AiProviderType;
  // Legacy fields (backward compatibility)
  aiModel?: SubtitleAiModel;
  apiKey?: string;
  // Gemini settings
  geminiModel?: string;
  geminiApiKey?: string;
  // OpenRouter settings
  openrouterModel?: string;
  openrouterApiKey?: string;
  // Common settings
  maxSingleLineWords: number;
  autoSplitLongLines: boolean;
}

export interface SplitMetadata {
  range: string;
  start: string;
  end: string;
  segments: number;
  duration: string;
}

export interface UsageStats {
  requests: number;
  tokens: number;
  segments?: number;
}

export interface ApiUsage {
  style: UsageStats;
  translate: UsageStats;
  optimize: UsageStats;
}

export const DEFAULT_SUBTITLE_SETTINGS: SubtitleAppSettings = {
  cpsThreshold: {
    safeMax: 25,
    warningMax: 40
  },
  translationBatchSize: 100,
  maxSingleLineWords: 12,
  autoSplitLongLines: false,
  // Provider settings
  provider: 'gemini',
  // Legacy fields
  aiModel: 'gemini-2.5-flash' as const,
  apiKey: '',
  // Gemini settings
  geminiModel: 'gemini-2.5-flash',
  geminiApiKey: '',
  // OpenRouter settings
  openrouterModel: 'openrouter/auto',
  openrouterApiKey: ''
};
