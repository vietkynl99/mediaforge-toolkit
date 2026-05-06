/**
 * Task Executor Base and Factory
 * 
 * Executors are responsible for running specific task types.
 * Each executor handles its own process spawning, progress tracking, and cancellation.
 */

import { TaskNode, TaskResult, ConcurrencyConfig, DEFAULT_CONCURRENCY_CONFIG } from './types.js';
import * as SubtitleAI from '../subtitle-ai.js';
import fs from 'fs/promises';
import path from 'path';
import { MEDIA_VAULT_ROOT } from '../constants.js';

export type ProgressCallback = (progress: number, message?: string, processed?: number, total?: number) => void;
export type LogCallback = (message: string) => void;

export interface ExecutorContext {
  signal?: AbortSignal;
  onProgress: ProgressCallback;
  onLog: LogCallback;
  onSpawn?: (process: any) => void;
  config?: ConcurrencyConfig;
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
      maxSingleLineWords,
      autoSplitLongLines,
      targetIds // Array of IDs to translate (optional)
    } = task.params;

    // Get settings from config
    const config = context.config ?? DEFAULT_CONCURRENCY_CONFIG;
    const aiConfig = config.ai ?? {};
    const provider = aiConfig.provider ?? 'gemini';
    const model = provider === 'openrouter' 
      ? (aiConfig.openrouterModel ?? 'openrouter/auto')
      : (aiConfig.geminiModel ?? aiConfig.model ?? 'gemini-2.5-flash');
    const batchSize = aiConfig.translationBatchSize ?? 20;
    const effectiveMaxSingleLineWords = maxSingleLineWords ?? aiConfig.maxSingleLineWords ?? 12;
    const effectiveAutoSplitLongLines = autoSplitLongLines ?? aiConfig.autoSplitLongLines ?? false;

    // Log all AI settings being used
    context.onLog(`AI Settings: provider=${provider}, model=${model}`);
    context.onLog(`Translation Settings: batchSize=${batchSize}, maxSingleLineWords=${effectiveMaxSingleLineWords}, autoSplitLongLines=${effectiveAutoSplitLongLines}`);

    if (!projectName || !subtitleFile) {
      throw new Error('Missing required params: projectName, subtitleFile');
    }

    const fullPath = path.join(MEDIA_VAULT_ROOT, subtitleFile);
    context.onLog(`Reading subtitle file: ${subtitleFile}`);
    
    let subtitleData: any;
    let isSktProject = false;
    let originalProject: any = null;

    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      const parsed = JSON.parse(content);
      
      if (parsed && parsed.version === "1.0" && Array.isArray(parsed.segments)) {
        isSktProject = true;
        originalProject = parsed;
        subtitleData = parsed.segments.map((s: any) => ({
          id: String(s.id),
          startTime: s.start,
          endTime: s.end,
          originalText: s.original,
          translatedText: s.translated,
          text: s.translated
        }));
      } else if (Array.isArray(parsed)) {
        subtitleData = parsed.map((s: any) => ({
          ...s,
          id: String(s.id)
        }));
      } else {
        throw new Error('Invalid subtitle format: expected an array of cues or a .sktproject object');
      }
    } catch (err) {
      const errorMsg = `Failed to read or parse subtitle file at ${fullPath}: ${err instanceof Error ? err.message : String(err)}`;
      context.onLog(`ERROR: ${errorMsg}`);
      throw new Error(errorMsg);
    }

    const totalCues = subtitleData.length;
    context.onLog(`Total cues in file: ${totalCues}`);

    // Filter segments to translate
    let cuesToTranslate = subtitleData;
    if (Array.isArray(targetIds)) {
      // Specific IDs requested
      const idSet = new Set(targetIds.map(id => String(id)));
      cuesToTranslate = subtitleData.filter((c: any) => idSet.has(String(c.id)));
      context.onLog(`Filtering job to ${cuesToTranslate.length} specific segments based on targetIds.`);
    } else {
      // No targetIds = translate all untranslated segments
      cuesToTranslate = subtitleData.filter((c: any) => {
        // Check if segment has a translation
        const hasTranslation = (c.translatedText && c.translatedText.trim()) ||
                               (c.translated && c.translated.trim());
        return !hasTranslation;
      });
      context.onLog(`Translating ${cuesToTranslate.length} untranslated segments (out of ${totalCues} total).`);
    }

    const totalToTranslate = cuesToTranslate.length;
    if (totalToTranslate === 0) {
      context.onLog('No segments matching targetIds found or needed. Skipping.');
      return { success: true, outputs: [subtitleFile] };
    }

    // Process in batches
    for (let i = 0; i < totalToTranslate; i += batchSize) {
      checkAborted(context.signal);
      
      const batch = cuesToTranslate.slice(i, i + batchSize);
      
      // Find context from the original subtitleData to maintain sequence awareness
      const firstInBatch = batch[0];
      const lastInBatch = batch[batch.length - 1];
      const originalIdx = subtitleData.findIndex((c: any) => String(c.id) === String(firstInBatch.id));
      
      const contextBefore = originalIdx > 0 
        ? subtitleData.slice(Math.max(0, originalIdx - 3), originalIdx).map((c: any) => c.originalText || c.text || "") 
        : [];
      const contextAfter = (originalIdx + batch.length < totalCues) 
        ? subtitleData.slice(originalIdx + batch.length, originalIdx + batch.length + 3).map((c: any) => c.originalText || c.text || "") 
        : [];

      context.onLog(`Translating batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(totalToTranslate / batchSize)} (${batch.length} segments)...`);
      
      try {
        const result = await SubtitleAI.translateBatch({
          batch,
          contextBefore,
          contextAfter,
          preset,
          maxSingleLineWords: effectiveMaxSingleLineWords,
          autoSplitLongLines: effectiveAutoSplitLongLines
        });

        // Parse AI response - result.text is a JSON string
        if (result && typeof result.text === 'string') {
          let translatedItems: any[] = [];
          try {
            translatedItems = JSON.parse(result.text);
          } catch (parseErr) {
            context.onLog(`ERROR: Failed to parse AI response as JSON: ${parseErr}`);
            context.onLog(`ERROR: AI response text (first 500 chars): ${result.text.substring(0, 500)}`);
            context.onLog(`ERROR: Full AI response length: ${result.text.length} characters`);
            throw new Error(`Failed to parse AI response as JSON. Response was: ${result.text.substring(0, 200)}...`);
          }
          
          if (!Array.isArray(translatedItems)) {
            context.onLog(`ERROR: Parsed response is not an array. Got: ${typeof translatedItems}`);
            context.onLog(`ERROR: Parsed value: ${JSON.stringify(translatedItems).substring(0, 300)}`);
            throw new Error('AI response was not a valid array format');
          }
          
          let matchedCount = 0;
          for (const item of translatedItems) {
            // Find cue in our working array - use loose equality or cast to string for ID comparison
            const cue = subtitleData.find((c: any) => String(c.id) === String(item.id));
            if (cue) {
              matchedCount++;
              cue.translatedText = item.text;
              cue.text = item.text;
              cue.translated = item.text; // Ensure all variants are set
            }

            // ALSO update the originalProject.segments directly if it's an sktproject
            if (isSktProject && originalProject?.segments) {
              const originalSeg = originalProject.segments.find((s: any) => String(s.id) === String(item.id));
              if (originalSeg) {
                originalSeg.translated = item.text;
              }
            }
          }
        }
      } catch (aiErr) {
        const aiErrorMsg = `AI Translation failed for batch: ${aiErr instanceof Error ? aiErr.message : JSON.stringify(aiErr)}`;
        context.onLog(`CRITICAL ERROR: ${aiErrorMsg}`);
        throw new Error(aiErrorMsg);
      }

      const progress = Math.round(((i + batch.length) / totalToTranslate) * 100);
      const processed = Math.min(i + batchSize, totalToTranslate);
      context.onProgress(progress, `Translated ${processed}/${totalToTranslate} requested cues`, processed, totalToTranslate);

      // Ghi dữ liệu xuống file sau mỗi batch thành công
      try {
        if (isSktProject) {
          // Cập nhật lại mảng segments trong project gốc
          originalProject.segments = subtitleData.map((s: any) => ({
            id: s.id,
            start: s.startTime,
            end: s.endTime,
            original: s.originalText || s.original || "",
            translated: s.translatedText || s.text || s.translated || "",
            optimize_history: s.optimizeHistory || []
          }));
          originalProject.updated_at = new Date().toISOString();
          await fs.writeFile(fullPath, JSON.stringify(originalProject, null, 2), 'utf-8');
        } else {
          context.onLog(`Saving batch progress to JSON file...`);
          await fs.writeFile(fullPath, JSON.stringify(subtitleData, null, 2), 'utf-8');
        }
      } catch (saveErr) {
        context.onLog(`WARNING: Failed to save intermediate results: ${saveErr instanceof Error ? saveErr.message : String(saveErr)}`);
      }
    }

    return {
      success: true,
      outputs: [subtitleFile]
    };
  }
}

/**
 * Executor for AI Optimization
 */
export class OptimizeTaskExecutor extends TaskExecutor {
  readonly type = 'optimize';

  async execute(task: TaskNode, context: ExecutorContext): Promise<TaskResult> {
    const {
      projectName,
      subtitleFile, // Relative path to subtitle file
      preset,
      targetIds // Array of IDs to optimize (optional)
    } = task.params;

    // Get settings from config
    const config = context.config ?? DEFAULT_CONCURRENCY_CONFIG;
    const aiConfig = config.ai ?? {};
    const provider = aiConfig.provider ?? 'gemini';
    const model = provider === 'openrouter' 
      ? (aiConfig.openrouterModel ?? 'openrouter/auto')
      : (aiConfig.geminiModel ?? aiConfig.model ?? 'gemini-2.5-flash');
    const batchSize = aiConfig.translationBatchSize ?? 20;

    // Log all AI settings being used
    context.onLog(`AI Settings: provider=${provider}, model=${model}`);
    context.onLog(`Optimization Settings: batchSize=${batchSize}`);

    if (!projectName || !subtitleFile) {
      throw new Error('Missing required params: projectName, subtitleFile');
    }

    const fullPath = path.join(MEDIA_VAULT_ROOT, subtitleFile);
    context.onLog(`Reading subtitle file: ${subtitleFile}`);

    let subtitleData: any;
    let isSktProject = false;
    let originalProject: any = null;

    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      const parsed = JSON.parse(content);

      if (parsed && parsed.version === "1.0" && Array.isArray(parsed.segments)) {
        isSktProject = true;
        originalProject = parsed;
        subtitleData = parsed.segments.map((s: any) => ({
          id: String(s.id),
          startTime: s.start,
          endTime: s.end,
          originalText: s.original,
          translatedText: s.translated,
          text: s.translated
        }));
      } else if (Array.isArray(parsed)) {
        subtitleData = parsed.map((s: any) => ({
          ...s,
          id: String(s.id)
        }));
      } else {
        throw new Error('Invalid subtitle format: expected an array of cues or a .sktproject object');
      }
    } catch (err) {
      const errorMsg = `Failed to read or parse subtitle file at ${fullPath}: ${err instanceof Error ? err.message : String(err)}`;
      context.onLog(`ERROR: ${errorMsg}`);
      throw new Error(errorMsg);
    }

    const totalCues = subtitleData.length;
    context.onLog(`Total cues in file: ${totalCues}`);

    // Filter segments to optimize (only translated ones)
    let cuesToOptimize = subtitleData;
    if (Array.isArray(targetIds)) {
      // Specific IDs requested
      const idSet = new Set(targetIds.map(id => String(id)));
      cuesToOptimize = subtitleData.filter((c: any) => idSet.has(String(c.id)));
      context.onLog(`Filtering job to ${cuesToOptimize.length} specific segments based on targetIds.`);
    } else {
      // No targetIds = optimize all translated segments
      cuesToOptimize = subtitleData.filter((c: any) => {
        const hasTranslation = (c.translatedText && c.translatedText.trim()) ||
                               (c.translated && c.translated.trim());
        return hasTranslation;
      });
      context.onLog(`Optimizing ${cuesToOptimize.length} translated segments (out of ${totalCues} total).`);
    }

    const totalToOptimize = cuesToOptimize.length;
    if (totalToOptimize === 0) {
      context.onLog('No translated segments found to optimize. Skipping.');
      return { success: true, outputs: [subtitleFile] };
    }

    // Process in batches
    for (let i = 0; i < totalToOptimize; i += batchSize) {
      checkAborted(context.signal);

      const batch = cuesToOptimize.slice(i, i + batchSize);

      context.onLog(`Optimizing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(totalToOptimize / batchSize)} (${batch.length} segments)...`);

      try {
        // Prepare segments for AI fix
        const segmentsForAI = batch.map((c: any) => ({
          id: c.id,
          text: c.translatedText || c.text || c.translated
        }));

        const result = await SubtitleAI.aiFixSegments({
          segments: segmentsForAI,
          preset
        });

        // Parse AI response
        if (result && typeof result.text === 'string') {
          let fixedItems: any[] = [];
          try {
            fixedItems = JSON.parse(result.text);
          } catch (parseErr) {
            context.onLog(`ERROR: Failed to parse AI response as JSON: ${parseErr}`);
            context.onLog(`ERROR: AI response text (first 500 chars): ${result.text.substring(0, 500)}`);
            context.onLog(`ERROR: Full AI response length: ${result.text.length} characters`);
            throw new Error(`Failed to parse AI response as JSON. Response was: ${result.text.substring(0, 200)}...`);
          }

          if (!Array.isArray(fixedItems)) {
            context.onLog(`ERROR: Parsed response is not an array. Got: ${typeof fixedItems}`);
            context.onLog(`ERROR: Parsed value: ${JSON.stringify(fixedItems).substring(0, 300)}`);
            throw new Error('AI response was not a valid array format');
          }

          let matchedCount = 0;
          for (const item of fixedItems) {
            const cue = subtitleData.find((c: any) => String(c.id) === String(item.id));
            if (cue && item.fixedText) {
              matchedCount++;
              // Store optimize history
              if (!cue.optimizeHistory) cue.optimizeHistory = [];
              cue.optimizeHistory.push(cue.translatedText || cue.text);
              // Update with fixed text
              cue.translatedText = item.fixedText;
              cue.text = item.fixedText;
              cue.translated = item.fixedText;
            }

            // Update originalProject.segments if it's an sktproject
            if (isSktProject && originalProject?.segments) {
              const originalSeg = originalProject.segments.find((s: any) => String(s.id) === String(item.id));
              if (originalSeg && item.fixedText) {
                if (!originalSeg.optimize_history) originalSeg.optimize_history = [];
                originalSeg.optimize_history.push(originalSeg.translated);
                originalSeg.translated = item.fixedText;
              }
            }
          }
          context.onLog(`Matched and optimized ${matchedCount} segments.`);
        }
      } catch (aiErr) {
        const aiErrorMsg = `AI Optimization failed for batch: ${aiErr instanceof Error ? aiErr.message : JSON.stringify(aiErr)}`;
        context.onLog(`CRITICAL ERROR: ${aiErrorMsg}`);
        throw new Error(aiErrorMsg);
      }

      const progress = Math.round(((i + batch.length) / totalToOptimize) * 100);
      const processed = Math.min(i + batchSize, totalToOptimize);
      context.onProgress(progress, `Optimized ${processed}/${totalToOptimize} segments`, processed, totalToOptimize);

      // Save progress after each batch
      try {
        if (isSktProject) {
          originalProject.segments = subtitleData.map((s: any) => ({
            id: s.id,
            start: s.startTime,
            end: s.endTime,
            original: s.originalText || s.original || "",
            translated: s.translatedText || s.text || s.translated || "",
            optimize_history: s.optimizeHistory || []
          }));
          originalProject.updated_at = new Date().toISOString();
          await fs.writeFile(fullPath, JSON.stringify(originalProject, null, 2), 'utf-8');
        } else {
          await fs.writeFile(fullPath, JSON.stringify(subtitleData, null, 2), 'utf-8');
        }
      } catch (saveErr) {
        context.onLog(`WARNING: Failed to save intermediate results: ${saveErr instanceof Error ? saveErr.message : String(saveErr)}`);
      }
    }

    return {
      success: true,
      outputs: [subtitleFile]
    };
  }
}

// Register built-in executors
executorRegistry.register(new TranslateTaskExecutor());
executorRegistry.register(new OptimizeTaskExecutor());
