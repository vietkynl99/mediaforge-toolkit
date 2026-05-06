/**
 * Core types for the DAG-based job scheduling system
 */

export type TaskStatus = 'pending' | 'ready' | 'running' | 'completed' | 'failed' | 'cancelled';

export type ResourceType = 'cpu' | 'gpu' | 'network';

export type TaskType = 'download' | 'uvr' | 'tts' | 'render' | 'translate';

export interface TaskNode {
  id: string;
  type: TaskType;
  name: string;
  status: TaskStatus;
  progress: number;
  dependencies: string[];  // Task IDs must complete before this task
  dependents: string[];    // Task IDs that depend on this task
  priority: number;         // Higher = more urgent
  params: Record<string, any>;
  outputs?: string[];
  error?: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface JobGraph {
  jobId: string;
  jobName: string;
  projectName?: string;
  tasks: Map<string, TaskNode>;
  rootTasks: string[];   // Tasks with no dependencies
  leafTasks: string[];   // Tasks with no dependents
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  error?: string;
}

/**
 * Concurrency configuration
 */
export interface ConcurrencyRule {
  taskType: string;
  maxConcurrent: number;      // Max tasks of this type running simultaneously
  resourceType: ResourceType; // Which resource pool this task consumes
  priority: number;           // Default priority for this task type
}

export type AiProviderType = 'gemini' | 'openrouter';

export type AiModel = 'gemini-2.5-flash' | 'gemini-2.5-pro' | 'gemini-3-flash-preview' | 'gemini-3-pro-preview';

export interface ConcurrencyConfig {
  rules: ConcurrencyRule[];
  globalLimits: Record<ResourceType, number>;
  ai?: {
    provider?: AiProviderType;
    // Legacy fields (for backward compatibility)
    model?: AiModel;
    apiKey?: string;
    // Gemini settings
    geminiModel?: string;
    geminiApiKey?: string;
    // OpenRouter settings
    openrouterModel?: string;
    openrouterApiKey?: string;
    // Common settings
    cpsThreshold?: {
      safeMax: number;
      warningMax: number;
    };
    translationBatchSize?: number;
    maxSingleLineWords?: number;
    autoSplitLongLines?: boolean;
  };
}

export const DEFAULT_CONCURRENCY_CONFIG: ConcurrencyConfig = {
  rules: [
    { taskType: 'download', maxConcurrent: 4, resourceType: 'network', priority: 4 },
    { taskType: 'uvr', maxConcurrent: 1, resourceType: 'cpu', priority: 3 },
    { taskType: 'tts', maxConcurrent: 2, resourceType: 'network', priority: 2 },
    { taskType: 'translate', maxConcurrent: 2, resourceType: 'network', priority: 2 },
    { taskType: 'render', maxConcurrent: 1, resourceType: 'cpu', priority: 1 },
  ],
  globalLimits: {
    cpu: 8,
    gpu: 1,
    network: 4,
  },
  ai: {
    provider: 'gemini',
    // Legacy fields
    model: 'gemini-2.5-flash',
    apiKey: '',
    // Gemini settings
    geminiModel: 'gemini-2.5-flash',
    geminiApiKey: '',
    // OpenRouter settings
    openrouterModel: 'openrouter/auto',
    openrouterApiKey: '',
    // Common settings
    cpsThreshold: {
      safeMax: 25,
      warningMax: 40,
    },
    translationBatchSize: 100,
    maxSingleLineWords: 10,
    autoSplitLongLines: true,
  },
};

/**
 * Helper to get rule for a task type
 */
export function getRuleForTaskType(config: ConcurrencyConfig, taskType: string): ConcurrencyRule | undefined {
  // Exact match first
  let rule = config.rules.find(r => r.taskType === taskType);
  if (rule) return rule;
  
  // Prefix match for composite types (e.g., 'download_subs' matches 'download')
  const prefix = taskType.split('_')[0];
  rule = config.rules.find(r => r.taskType === prefix);
  return rule;
}

/**
 * Task executor result
 */
export interface TaskResult {
  success: boolean;
  outputs: string[];
  error?: string;
  log?: string;
}
