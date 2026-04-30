/**
 * Graph Builder - Creates JobGraph from pipeline definitions
 */

import { JobGraph, TaskNode, ConcurrencyConfig, getRuleForTaskType } from './types.js';

export interface PipelineNode {
  id: string;
  type: string;
  label?: string;
  params?: Record<string, any>;
  x?: number;
  y?: number;
}

export interface PipelineEdge {
  source: string;
  target: string;
  outputIndex?: number;
  inputIndex?: number;
}

export interface Pipeline {
  nodes: PipelineNode[];
  edges: PipelineEdge[];
}

export interface JobInputs {
  projectId?: string;
  projectName?: string;
  projectRoot?: string;
  inputPath?: string;
  inputPaths?: string[];
  downloadUrl?: string;
  downloadCookiesFile?: string;
  downloadNoPlaylist?: boolean;
  downloadSubLangs?: string;
  downloadMode?: 'all' | 'subs' | 'media';
  uvrModel?: string;
  uvrBackend?: string;
  uvrOutputFormat?: string;
  ttsVoice?: string;
  ttsRate?: number;
  ttsPitch?: number;
  ttsVolume?: number;
  ttsOverlapMode?: 'overlap' | 'truncate';
  ttsRemoveLineBreaks?: boolean;
  renderConfigV2?: any;
  renderPreviewSeconds?: number;
}

/**
 * Build a JobGraph from a pipeline definition and inputs
 */
export function buildJobGraph(
  pipeline: Pipeline,
  inputs: JobInputs,
  config: ConcurrencyConfig
): JobGraph {
  const jobId = `job-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const tasks = new Map<string, TaskNode>();
  const createdAt = new Date().toISOString();

  // Create tasks from pipeline nodes
  for (const node of pipeline.nodes) {
    const rule = getRuleForTaskType(config, node.type);
    
    const task: TaskNode = {
      id: node.id,
      type: node.type as any,
      name: node.label ?? node.type,
      status: 'pending',
      progress: 0,
      dependencies: [],
      dependents: [],
      priority: rule?.priority ?? 10,
      params: { ...node.params },
    };

    // Merge inputs into task params
    if (inputs.projectRoot) task.params.projectRoot = inputs.projectRoot;
    if (inputs.projectName) task.params.projectName = inputs.projectName;

    // Task-specific params
    if (node.type === 'download' || node.type.startsWith('download_')) {
      if (inputs.downloadUrl) task.params.url = inputs.downloadUrl;
      if (inputs.downloadCookiesFile) task.params.cookiesFile = inputs.downloadCookiesFile;
      if (inputs.downloadNoPlaylist !== undefined) task.params.noPlaylist = inputs.downloadNoPlaylist;
      if (inputs.downloadSubLangs) task.params.subLangs = inputs.downloadSubLangs;
      if (inputs.downloadMode) task.params.downloadMode = inputs.downloadMode;
    }

    if (node.type === 'uvr') {
      if (inputs.uvrModel) task.params.model = inputs.uvrModel;
      if (inputs.uvrBackend) task.params.backend = inputs.uvrBackend;
      if (inputs.uvrOutputFormat) task.params.outputFormat = inputs.uvrOutputFormat;
    }

    if (node.type === 'tts') {
      if (inputs.ttsVoice) task.params.voice = inputs.ttsVoice;
      if (inputs.ttsRate !== undefined) task.params.rate = inputs.ttsRate;
      if (inputs.ttsPitch !== undefined) task.params.pitch = inputs.ttsPitch;
      if (inputs.ttsVolume !== undefined) task.params.volume = inputs.ttsVolume;
      if (inputs.ttsOverlapMode) task.params.overlapMode = inputs.ttsOverlapMode;
      if (inputs.ttsRemoveLineBreaks !== undefined) task.params.removeLineBreaks = inputs.ttsRemoveLineBreaks;
    }

    if (node.type === 'render') {
      if (inputs.renderConfigV2) task.params.configV2 = inputs.renderConfigV2;
      if (inputs.renderPreviewSeconds !== undefined) task.params.previewSeconds = inputs.renderPreviewSeconds;
    }

    tasks.set(node.id, task);
  }

  // Build dependencies from edges
  for (const edge of pipeline.edges) {
    const sourceTask = tasks.get(edge.source);
    const targetTask = tasks.get(edge.target);

    if (sourceTask && targetTask) {
      sourceTask.dependents.push(edge.target);
      targetTask.dependencies.push(edge.source);
    }
  }

  // Find root and leaf tasks
  const rootTasks: string[] = [];
  const leafTasks: string[] = [];

  for (const [taskId, task] of tasks) {
    if (task.dependencies.length === 0) {
      rootTasks.push(taskId);
    }
    if (task.dependents.length === 0) {
      leafTasks.push(taskId);
    }
  }

  // Build job name
  const primaryType = pipeline.nodes[0]?.type ?? 'job';
  const jobName = inputs.projectName 
    ? `${inputs.projectName} - ${primaryType}`
    : primaryType;

  return {
    jobId,
    jobName,
    projectName: inputs.projectName,
    tasks,
    rootTasks,
    leafTasks,
    createdAt,
    status: 'queued',
    progress: 0,
  };
}

/**
 * Create a simple single-task graph
 */
export function createSingleTaskGraph(
  type: TaskNode['type'],
  params: Record<string, any>,
  inputs: JobInputs,
  config: ConcurrencyConfig
): JobGraph {
  const pipeline: Pipeline = {
    nodes: [{ id: `${type}-1`, type, params }],
    edges: [],
  };
  return buildJobGraph(pipeline, { ...inputs, ...params }, config);
}
