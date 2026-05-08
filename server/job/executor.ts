/**
 * Task Executor Base and Factory
 * 
 * Executors are responsible for running specific task types.
 * Each executor handles its own process spawning, progress tracking, and cancellation.
 */

import { TaskNode, TaskResult, SystemConfig, DEFAULT_SYSTEM_CONFIG } from './types.js';
import * as SubtitleAI from '../subtitle-ai.js';
import fs from 'fs/promises';
import path from 'path';
import { MEDIA_VAULT_ROOT } from '../constants.js';
import { parseSrtForTranslation } from '../subtitleCues.js';
import { normalizeAiText, splitToTwoLinesIfLong, collapseToSingleLineIfShort } from '../../shared/text-utils.js';
import { IssueType, classifyIssues } from '../../shared/types.js';

// Debug flag for optimize flow
const DEBUG_OPTIMIZE = ['1', 'true', 'yes', 'on'].includes((process.env.DEBUG_OPTIMIZE ?? '').toLowerCase());
const DEBUG_TRANSLATE = ['1', 'true', 'yes', 'on'].includes((process.env.DEBUG_TRANSLATE ?? '').toLowerCase());

/**
 * Attempts to repair common JSON errors from AI responses
 */
function tryRepairJson(text: string): string {
  let repaired = text.trim();

  // 1. Remove markdown code blocks (always safe)
  repaired = repaired.replace(/^```json\s*/, '').replace(/```$/, '').trim();

  // 2. Fix the specific error: "id":5" -> "id":5
  // ONLY fix if it's immediately followed by the next expected key "text" or "fixedText"
  // This ensures we are targeting the structural part of JSON, not the content of a string.
  repaired = repaired.replace(/(^|[{,])\s*"id":\s*(\d+)"\s*(?=,\s*"text":|,\s*"fixedText":)/g, '$1"id":$2');

  // 3. If it's an array and missing the closing bracket due to truncation
  if (repaired.startsWith('[') && !repaired.endsWith(']')) {
    const lastObjectEnd = repaired.lastIndexOf('}');
    if (lastObjectEnd !== -1) {
      const potentiallyRepaired = repaired.substring(0, lastObjectEnd + 1) + ']';
      try {
        // Only apply if the result is actually valid JSON
        JSON.parse(potentiallyRepaired);
        repaired = potentiallyRepaired;
      } catch {
        // Not repairable this way
      }
    }
  }

  return repaired;
}

/**
 * Parse ID range string like "1-10, 12, 15-20" into array of IDs
 */
function parseIdRanges(rangeStr: string): number[] {
  const ids: number[] = [];
  const parts = rangeStr.split(',');

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    // Check if it's a range like "1-10"
    if (trimmed.includes('-')) {
      const [startStr, endStr] = trimmed.split('-');
      const start = parseInt(startStr.trim(), 10);
      const end = parseInt(endStr.trim(), 10);
      if (!isNaN(start) && !isNaN(end)) {
        for (let i = start; i <= end; i++) {
          ids.push(i);
        }
      }
    } else {
      // Single ID
      const id = parseInt(trimmed, 10);
      if (!isNaN(id)) {
        ids.push(id);
      }
    }
  }

  return ids;
}

export type ProgressCallback = (progress: number, message?: string, processed?: number, total?: number) => void;
export type LogCallback = (message: string) => void;

export interface ExecutorContext {
  signal?: AbortSignal;
  onProgress: ProgressCallback;
  onLog: LogCallback;
  onSpawn?: (process: any) => void;
  config?: SystemConfig;
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
  
  /**
   * Register an executor with additional type aliases
   */
  registerWithAliases(executor: TaskExecutor, aliases: string[]): void {
    this.executors.set(executor.type, executor);
    for (const alias of aliases) {
      this.executors.set(alias, executor);
    }
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
 * Shared helper: Load and parse subtitle file
 */
async function loadSubtitleFile(
  subtitleFile: string,
  onLog: LogCallback
): Promise<{
  subtitleData: any[];
  isSktProject: boolean;
  originalProject: any;
  fullPath: string;
  totalCues: number;
}> {
  const fullPath = path.join(MEDIA_VAULT_ROOT, subtitleFile);
  onLog(`Reading subtitle file: ${subtitleFile}`);
  
  let subtitleData: any[];
  let isSktProject = false;
  let originalProject: any = null;

  const content = await fs.readFile(fullPath, 'utf-8');
  const lowerPath = fullPath.toLowerCase();
  
  if (lowerPath.endsWith('.srt')) {
    subtitleData = parseSrtForTranslation(content);
    onLog(`Parsed as SRT format with ${subtitleData.length} segments`);
  } else {
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
  }

  return { subtitleData, isSktProject, originalProject, fullPath, totalCues: subtitleData.length };
}

/**
 * Shared helper: Save subtitle file
 */
async function saveSubtitleFile(
  fullPath: string,
  subtitleData: any[],
  isSktProject: boolean,
  originalProject: any,
  onLog: LogCallback
): Promise<void> {
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
    onLog(`WARNING: Failed to save: ${saveErr instanceof Error ? saveErr.message : String(saveErr)}`);
  }
}

/**
 * Shared helper: Parse AI JSON response with repair fallback
 */
function parseAiJsonResponse(text: string, onLog: LogCallback): any[] {
  let items: any[];
  
  try {
    items = JSON.parse(text);
  } catch (firstErr) {
    const repaired = tryRepairJson(text);
    onLog(`WARNING: Malformed AI JSON detected. Original response (${text.length} chars):\n${text}`);
    onLog(`WARNING: Attempted repair. Repaired JSON:\n${repaired}`);
    try {
      items = JSON.parse(repaired);
      onLog(`NOTICE: Successfully recovered from malformed AI JSON response using repair utility.`);
    } catch (secondErr) {
      onLog(`ERROR: Failed to parse AI response as JSON even after repair.`);
      onLog(`ERROR: Parse error: ${secondErr instanceof Error ? secondErr.message : String(secondErr)}`);
      throw new Error(`Failed to parse AI response as JSON`);
    }
  }
  
  if (!Array.isArray(items)) {
    onLog(`ERROR: Parsed response is not an array. Got: ${typeof items}`);
    throw new Error('AI response was not a valid array format');
  }
  
  return items;
}

/**
 * Executor for AI Subtitle Processing (Translate & Optimize)
 * Handles both 'translate' and 'optimize' task types
 */
export class SubtitleAiTaskExecutor extends TaskExecutor {
  readonly type = 'subtitle-ai'; // Base type, handles both translate and optimize

  async execute(task: TaskNode, context: ExecutorContext): Promise<TaskResult> {
    const { type } = task;
    const params = task.params;
    
    // Get settings from config
    const config = context.config ?? DEFAULT_SYSTEM_CONFIG;
    const aiConfig = config.ai ?? {};
    const provider = aiConfig.provider ?? 'gemini';
    const model = provider === 'openrouter' 
      ? (aiConfig.openrouterModel ?? 'openrouter/auto')
      : (aiConfig.geminiModel ?? 'gemini-2.5-flash');
    
    // Use task-specific batch size
    const batchSize = type === 'translate' 
      ? (aiConfig.translationBatchSize ?? 50)
      : (aiConfig.optimizationBatchSize ?? 30);

    context.onLog(`AI Settings: provider=${provider}, model=${model}, batchSize=${batchSize}`);

    const { projectName, subtitleFile } = params;
    if (!projectName || !subtitleFile) {
      throw new Error('Missing required params: projectName, subtitleFile');
    }

    // Load subtitle file
    let { subtitleData, isSktProject, originalProject, fullPath, totalCues } = 
      await loadSubtitleFile(subtitleFile, context.onLog);

    // Route to appropriate handler based on task type
    if (type === 'translate') {
      return this.executeTranslate(task, context, {
        subtitleData, isSktProject, originalProject, fullPath, totalCues, batchSize, aiConfig
      });
    } else if (type === 'optimize') {
      return this.executeOptimize(task, context, {
        subtitleData, isSktProject, originalProject, fullPath, totalCues, batchSize, aiConfig
      });
    }
    
    throw new Error(`Unknown task type: ${type}`);
  }

  private async executeTranslate(
    task: TaskNode,
    context: ExecutorContext,
    state: {
      subtitleData: any[];
      isSktProject: boolean;
      originalProject: any;
      fullPath: string;
      totalCues: number;
      batchSize: number;
      aiConfig: any;
    }
  ): Promise<TaskResult> {
    const { subtitleData, isSktProject, originalProject, fullPath, totalCues, batchSize, aiConfig } = state;
    const { preset, maxSingleLineWords, autoSplitLongLines, targetIds } = task.params;
    const subtitleFile = task.params.subtitleFile;

    const effectiveMaxSingleLineWords = maxSingleLineWords ?? aiConfig.maxSingleLineWords ?? 12;
    const effectiveAutoSplitLongLines = autoSplitLongLines ?? aiConfig.autoSplitLongLines ?? false;

    context.onLog(`Translation Settings: maxSingleLineWords=${effectiveMaxSingleLineWords}, autoSplitLongLines=${effectiveAutoSplitLongLines}`);

    // Filter segments to translate
    let cuesToProcess = subtitleData;
    if (Array.isArray(targetIds)) {
      const idSet = new Set(targetIds.map((id: any) => String(id)));
      cuesToProcess = subtitleData.filter((c: any) => idSet.has(String(c.id)));
      context.onLog(`Filtering to ${cuesToProcess.length} specific segments based on targetIds.`);
    } else {
      cuesToProcess = subtitleData.filter((c: any) => {
        const hasTranslation = (c.translatedText && c.translatedText.trim()) ||
                               (c.translated && c.translated.trim());
        return !hasTranslation;
      });
      context.onLog(`Translating ${cuesToProcess.length} untranslated segments (out of ${totalCues} total).`);
    }

    const totalToProcess = cuesToProcess.length;
    if (totalToProcess === 0) {
      context.onLog('No segments to translate. Skipping.');
      return { success: true, outputs: [subtitleFile] };
    }

    // Process in batches
    for (let i = 0; i < totalToProcess; i += batchSize) {
      checkAborted(context.signal);
      
      const batch = cuesToProcess.slice(i, i + batchSize);
      const originalIdx = subtitleData.findIndex((c: any) => String(c.id) === String(batch[0].id));
      
      const contextBefore = originalIdx > 0 
        ? subtitleData.slice(Math.max(0, originalIdx - 5), originalIdx).map((c: any) => ({
            original: c.originalText || c.original || "",
            translated: c.translatedText || c.text || c.translated || ""
          }))
        : [];
      const contextAfter = (originalIdx + batch.length < totalCues) 
        ? subtitleData.slice(originalIdx + batch.length, originalIdx + batch.length + 5).map((c: any) => ({
            original: c.originalText || c.original || "",
            translated: c.translatedText || c.text || c.translated || ""
          }))
        : [];

      context.onLog(`Translating batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(totalToProcess / batchSize)} (${batch.length} segments)...`);
      
      try {
        const result = await SubtitleAI.translateBatch({
          batch,
          contextBefore,
          contextAfter,
          preset,
          maxSingleLineWords: effectiveMaxSingleLineWords,
          autoSplitLongLines: effectiveAutoSplitLongLines
        });

        if (DEBUG_TRANSLATE) {
          context.onLog(`[DEBUG_TRANSLATE] Prompt: ${result.prompt}`);
          context.onLog(`[DEBUG_TRANSLATE] Result: ${result.text}`);
        }

        if (result && typeof result.text === 'string') {
          const translatedItems = parseAiJsonResponse(result.text, context.onLog);
          
          for (const item of translatedItems) {
            const cue = subtitleData.find((c: any) => String(c.id) === String(item.id));
            if (cue) {
              let processedText = normalizeAiText(item.text);
              if (effectiveAutoSplitLongLines) {
                processedText = splitToTwoLinesIfLong(processedText, effectiveMaxSingleLineWords);
              }
              processedText = collapseToSingleLineIfShort(processedText, effectiveMaxSingleLineWords);
              cue.translatedText = processedText;
              cue.text = processedText;
              cue.translated = processedText;
            }

            if (isSktProject && originalProject?.segments) {
              const originalSeg = originalProject.segments.find((s: any) => String(s.id) === String(item.id));
              if (originalSeg) {
                let processedText = normalizeAiText(item.text);
                if (effectiveAutoSplitLongLines) {
                  processedText = splitToTwoLinesIfLong(processedText, effectiveMaxSingleLineWords);
                }
                processedText = collapseToSingleLineIfShort(processedText, effectiveMaxSingleLineWords);
                originalSeg.translated = processedText;
              }
            }
          }
        }
      } catch (aiErr) {
        const aiErrorMsg = `AI Translation failed: ${aiErr instanceof Error ? aiErr.message : String(aiErr)}`;
        context.onLog(`CRITICAL ERROR: ${aiErrorMsg}`);
        throw new Error(aiErrorMsg);
      }

      const progress = Math.round(((i + batch.length) / totalToProcess) * 100);
      const processed = Math.min(i + batchSize, totalToProcess);
      context.onProgress(progress, `Translated ${processed}/${totalToProcess} segments`, processed, totalToProcess);

      await saveSubtitleFile(fullPath, subtitleData, isSktProject, originalProject, context.onLog);
    }

    return { success: true, outputs: [subtitleFile] };
  }

  private async executeOptimize(
    task: TaskNode,
    context: ExecutorContext,
    state: {
      subtitleData: any[];
      isSktProject: boolean;
      originalProject: any;
      fullPath: string;
      totalCues: number;
      batchSize: number;
      aiConfig: any;
    }
  ): Promise<TaskResult> {
    const { subtitleData, isSktProject, originalProject, fullPath, totalCues, batchSize } = state;
    const { preset, targetIds, targetIssues } = task.params;
    const subtitleFile = task.params.subtitleFile;

    // Filter segments to optimize
    let cuesToProcess = subtitleData;
    if (Array.isArray(targetIds)) {
      const idSet = new Set(targetIds.map((id: any) => String(id)));
      cuesToProcess = subtitleData.filter((c: any) => idSet.has(String(c.id)));
      context.onLog(`Filtering to ${cuesToProcess.length} specific segments based on targetIds.`);
    } else {
      cuesToProcess = subtitleData.filter((c: any) => {
        const hasTranslation = (c.translatedText && c.translatedText.trim()) ||
                               (c.translated && c.translated.trim());
        return hasTranslation;
      });
      context.onLog(`Optimizing ${cuesToProcess.length} translated segments (out of ${totalCues} total).`);
    }

    const totalToProcess = cuesToProcess.length;
    if (totalToProcess === 0) {
      context.onLog('No translated segments to optimize. Skipping.');
      return { success: true, outputs: [subtitleFile] };
    }

    // Build issue map
    const issueMap = new Map<number, string[]>();
    const foreignWordsMap = new Map<number, string[]>();

    if (Array.isArray(targetIssues)) {
      for (const item of targetIssues) {
        const ids = parseIdRanges(String(item.id));
        const issueStrings: string[] = [];
        if (Array.isArray(item.issues)) {
          for (const issueType of item.issues) {
            if (issueType === 'language') issueStrings.push('Translation contains non-Vietnamese word(s)');
            else if (issueType === 'length') issueStrings.push('CPS is in the warning range (25-40)');
          }
        }
        const fw = Array.isArray(item.foreignWords) ? item.foreignWords : [];
        for (const id of ids) {
          issueMap.set(id, issueStrings);
          if (fw.length > 0) foreignWordsMap.set(id, fw);
        }
      }
    }

    // Helper to apply fixed items
    const applyFixedItems = (fixedItems: any[]): number => {
      let matched = 0;
      for (const item of fixedItems) {
        const cue = subtitleData.find((c: any) => String(c.id) === String(item.id));
        if (cue && item.fixedText) {
          matched++;
          const prevText = (cue.translatedText || cue.text || '').trim();
          const nextText = normalizeAiText(item.fixedText).trim();
          if (!cue.optimizeHistory) cue.optimizeHistory = [];
          if (cue.optimizeHistory.length === 0 && prevText && prevText !== nextText) {
            cue.optimizeHistory.push(prevText);
          }
          if (!cue.optimizeHistory.includes(nextText)) {
            cue.optimizeHistory.push(nextText);
          }
          cue.translatedText = nextText;
          cue.text = nextText;
          cue.translated = nextText;
        }
        if (isSktProject && originalProject?.segments) {
          const originalSeg = originalProject.segments.find((s: any) => String(s.id) === String(item.id));
          if (originalSeg && item.fixedText) {
            const prevText = (originalSeg.translated || '').trim();
            const nextText = normalizeAiText(item.fixedText).trim();
            if (!originalSeg.optimize_history) originalSeg.optimize_history = [];
            if (originalSeg.optimize_history.length === 0 && prevText && prevText !== nextText) {
              originalSeg.optimize_history.push(prevText);
            }
            if (!originalSeg.optimize_history.includes(nextText)) {
              originalSeg.optimize_history.push(nextText);
            }
            originalSeg.translated = nextText;
          }
        }
      }
      return matched;
    };

    // Process in batches
    for (let i = 0; i < totalToProcess; i += batchSize) {
      checkAborted(context.signal);

      const batch = cuesToProcess.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(totalToProcess / batchSize);

      const segmentsForAI = batch.map((c: any) => ({
        id: c.id,
        cn: c.originalText || c.original || "",
        vn: c.translatedText || c.text || c.translated || ""
      }));

      // Group by issue type
      const issueGroups = new Map<string, { segs: any[]; groupIssueMap: Map<number, string[]>; groupForeignWords: Set<string> }>();
      for (const seg of segmentsForAI) {
        let issues = issueMap.get(Number(seg.id)) || [];
        if (issues.length === 0 && issueMap.has(-1)) {
          issues = issueMap.get(-1) || [];
        }
        const typeKey = Array.from(classifyIssues(issues)).sort().join('+') || '__none__';
        if (!issueGroups.has(typeKey)) {
          issueGroups.set(typeKey, { segs: [], groupIssueMap: new Map(), groupForeignWords: new Set() });
        }
        const group = issueGroups.get(typeKey)!;
        group.segs.push(seg);
        if (issues.length > 0) group.groupIssueMap.set(Number(seg.id), issues);
        const fw = foreignWordsMap.get(Number(seg.id)) || [];
        for (const word of fw) group.groupForeignWords.add(word);
      }

      const groupCount = issueGroups.size;
      context.onLog(`Optimizing batch ${batchNum}/${totalBatches} (${batch.length} segments, ${groupCount} issue group${groupCount !== 1 ? 's' : ''})...`);

      let batchMatched = 0;
      let groupIdx = 0;
      for (const [typeKey, { segs, groupIssueMap, groupForeignWords }] of issueGroups) {
        groupIdx++;
        checkAborted(context.signal);

        if (groupCount > 1) {
          context.onLog(`  Group ${groupIdx}/${groupCount} [${typeKey}]: ${segs.length} segment${segs.length !== 1 ? 's' : ''}`);
        }

        try {
          const result = await SubtitleAI.aiFixSegments({
            segments: segs,
            preset,
            segmentIssues: groupIssueMap.size > 0 ? groupIssueMap : undefined,
            foreignWords: groupForeignWords.size > 0 ? Array.from(groupForeignWords) : undefined
          });

          if (DEBUG_OPTIMIZE) {
            context.onLog(`[DEBUG_OPTIMIZE] Prompt: ${result.prompt}`);
            context.onLog(`[DEBUG_OPTIMIZE] Result: ${result.text}`);
          }

          if (result && typeof result.text === 'string') {
            const fixedItems = parseAiJsonResponse(result.text, context.onLog);
            const matched = applyFixedItems(fixedItems);
            batchMatched += matched;
            if (groupCount > 1) {
              context.onLog(`  Matched and optimized ${matched} segments in group [${typeKey}].`);
            }
          }
        } catch (aiErr) {
          const aiErrorMsg = `AI Optimization failed for group [${typeKey}]: ${aiErr instanceof Error ? aiErr.message : String(aiErr)}`;
          context.onLog(`CRITICAL ERROR: ${aiErrorMsg}`);
          throw new Error(aiErrorMsg);
        }
      }

      context.onLog(`Matched and optimized ${batchMatched} segments.`);

      const progress = Math.round(((i + batch.length) / totalToProcess) * 100);
      const processed = Math.min(i + batchSize, totalToProcess);
      context.onProgress(progress, `Optimized ${processed}/${totalToProcess} segments`, processed, totalToProcess);

      await saveSubtitleFile(fullPath, subtitleData, isSktProject, originalProject, context.onLog);
    }

    return { success: true, outputs: [subtitleFile] };
  }
}

// Register built-in executors
// SubtitleAiTaskExecutor handles both 'translate' and 'optimize' task types
executorRegistry.registerWithAliases(new SubtitleAiTaskExecutor(), ['translate', 'optimize']);
