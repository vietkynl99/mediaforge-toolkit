/**
 * Task Executor Base and Factory
 * 
 * Executors are responsible for running specific task types.
 * Each executor handles its own process spawning, progress tracking, and cancellation.
 */

import { TaskNode, TaskResult } from './types.js';
import * as SubtitleAI from '../subtitle-ai.js';
import fs from 'fs/promises';
import path from 'path';
import { MEDIA_VAULT_ROOT } from '../constants.js';

export type ProgressCallback = (progress: number, message?: string) => void;
export type LogCallback = (message: string) => void;

export interface ExecutorContext {
  signal?: AbortSignal;
  onProgress: ProgressCallback;
  onLog: LogCallback;
  onSpawn?: (process: any) => void;
}

/**
 * Base class for task executors
 */
export abstract class TaskExecutor {
  abstract readonly type: string;
  
  /**
   * Execute the task
   */
  abstract execute(task: TaskNode, context: ExecutorContext): Promise<TaskResult>;
  
  /**
   * Validate task parameters before execution
   */
  async validate(task: TaskNode): Promise<{ valid: boolean; error?: string }> {
    return { valid: true };
  }
}

/**
 * Executor registry and factory
 */
class ExecutorRegistry {
  private executors = new Map<string, TaskExecutor>();
  
  register(executor: TaskExecutor): void {
    this.executors.set(executor.type, executor);
  }
  
  get(type: string): TaskExecutor | undefined {
    // Try exact match first
    let executor = this.executors.get(type);
    if (executor) return executor;
    
    // Try prefix match for composite types
    const prefix = type.split('_')[0];
    executor = this.executors.get(prefix);
    return executor;
  }
  
  has(type: string): boolean {
    return this.get(type) !== undefined;
  }
  
  list(): string[] {
    return Array.from(this.executors.keys());
  }
}

export const executorRegistry = new ExecutorRegistry();

/**
 * Helper to check if signal is aborted
 */
export function checkAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error('Task cancelled');
  }
}

/**
 * Helper to wait with abort support
 */
export async function waitWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Task cancelled'));
      return;
    }
    
    const timer = setTimeout(resolve, ms);
    
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new Error('Task cancelled'));
    });
  });
}

/**
 * Executor for AI Translation
 */
export class TranslateTaskExecutor extends TaskExecutor {
  readonly type = 'translate';

  async execute(task: TaskNode, context: ExecutorContext): Promise<TaskResult> {
    const { 
      projectName, 
      subtitleFile, // Relative path to subtitle file
      preset,
      maxSingleLineWords = 12,
      autoSplitLongLines = false,
      batchSize = 50
    } = task.params;

    if (!projectName || !subtitleFile) {
      throw new Error('Missing required params: projectName, subtitleFile');
    }

    const fullPath = path.join(MEDIA_VAULT_ROOT, subtitleFile);
    context.onLog(`Reading subtitle file: ${subtitleFile}`);
    
    let subtitleData;
    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      subtitleData = JSON.parse(content);
    } catch (err) {
      throw new Error(`Failed to read subtitle file: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (!Array.isArray(subtitleData)) {
      throw new Error('Invalid subtitle format: expected an array of cues');
    }

    const totalCues = subtitleData.length;
    context.onLog(`Total cues to translate: ${totalCues}`);

    // Process in batches
    for (let i = 0; i < totalCues; i += batchSize) {
      checkAborted(context.signal);
      
      const batch = subtitleData.slice(i, i + batchSize);
      const contextBefore = i > 0 ? subtitleData.slice(Math.max(0, i - 3), i).map(c => c.text || c.originalText) : [];
      const contextAfter = (i + batchSize < totalCues) ? subtitleData.slice(i + batchSize, i + batchSize + 3).map(c => c.text || c.originalText) : [];

      context.onLog(`Translating batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(totalCues / batchSize)}...`);
      
      const result = await SubtitleAI.translateBatch({
        batch,
        contextBefore,
        contextAfter,
        preset,
        maxSingleLineWords,
        autoSplitLongLines
      });

      // Update the cues in original array
      if (result && Array.isArray(result.text)) {
        // results are in format [{id, text}]
        const translatedItems = result.text;
        for (const item of translatedItems) {
          const cue = subtitleData.find(c => c.id === item.id);
          if (cue) {
            cue.text = item.text;
          }
        }
      }

      const progress = Math.round(((i + batch.length) / totalCues) * 100);
      context.onProgress(progress, `Translated ${i + batch.length}/${totalCues} cues`);
    }

    // Save back to file (or a new file)
    context.onLog(`Saving translated subtitles...`);
    await fs.writeFile(fullPath, JSON.stringify(subtitleData, null, 2), 'utf-8');

    return {
      success: true,
      outputs: [subtitleFile]
    };
  }
}

// Register built-in executors
executorRegistry.register(new TranslateTaskExecutor());
