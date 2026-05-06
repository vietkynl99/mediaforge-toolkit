import { Type } from "@google/genai";
import { SubtitleSegment, TranslationPreset, AiModel } from "../types";
import { timeToSeconds } from "./subtitleLogic";
import { normalizeAiText, splitToTwoLinesIfLong, collapseToSingleLineIfShort } from '../../../../shared/text-utils.js';

async function callBackendAi(endpoint: string, params: any) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'AI call failed');
  }

  return response.json();
}

/**
 * Translates a single batch of segments with surrounding context. 
 * Tolerant to partial AI responses for improved reliability.
 */
export async function translateBatch(
  batch: SubtitleSegment[],
  contextBefore: string[],
  contextAfter: string[],
  preset: TranslationPreset | null,
  model: AiModel,
  apiKey: string,
  maxSingleLineWords: number,
  autoSplitLongLines: boolean
): Promise<{ translatedTexts: { id: number; text: string }[]; tokens: number }> {

  try {
    const result = await callBackendAi('/api/subtitle/ai/translate', {
      batch,
      contextBefore,
      contextAfter,
      preset,
      maxSingleLineWords,
      autoSplitLongLines
    });

    const parsed = JSON.parse(result.text || "[]");
    if (!Array.isArray(parsed)) {
      throw new Error("Invalid response format: Expected a JSON array.");
    }

    const allowedIds = new Set(batch.map(s => s.id));
    const seenIds = new Set<number>();
    const translatedBatch = parsed
      .filter((item: any) => {
        if (!item || typeof item.id !== 'number' || typeof item.text !== 'string') return false;
        if (!allowedIds.has(item.id)) return false;
        if (seenIds.has(item.id)) return false;
        seenIds.add(item.id);
        return true;
      })
      .map((item: any) => {
        let normalized = normalizeAiText(item.text);
        if (autoSplitLongLines) {
          normalized = splitToTwoLinesIfLong(normalized, maxSingleLineWords);
        }
        const collapsed = collapseToSingleLineIfShort(normalized, maxSingleLineWords);
        return { id: item.id, text: collapsed };
      });

    return {
      translatedTexts: translatedBatch,
      tokens: result.usage?.totalTokenCount || 0
    };

  } catch (error) {
    console.error("Batch translation error:", error);
    throw error;
  }
}

export async function extractTitleFromFilename(filename: string, model: AiModel, apiKey: string): Promise<{ title: string, tokens: number }> {
  const cleaned = filename.replace(/\.srt$/i, '').trim();
  
  const result = await callBackendAi('/api/subtitle/ai/call', {
    prompt: `Extract the core title from this filename, ignoring tags/groups: ${cleaned}`
  });
  
  const title = result.text || cleaned;
  const tokens = result.usage?.totalTokenCount || 0;
  return { title, tokens };
}

export async function analyzeTranslationStyle(titleOrSummary: string, model: string, apiKey: string): Promise<{ preset: TranslationPreset, tokens: number }> {

  try {
    const result = await callBackendAi('/api/subtitle/ai/analyze-style', {
      titleOrSummary
    });

    const rawText = result.text || "{}";
    let parsed: any = {};

    try {
      parsed = JSON.parse(rawText);
    } catch (parseError) {
      console.error("Failed to parse analyze-style response:", rawText);
      throw new Error("AI returned invalid JSON response");
    }

    const tokens = result.usage?.totalTokenCount || 0;

    // Validate that we got actual data from AI
    const genres = Array.isArray(parsed.genres) ? parsed.genres : [];
    const humorLevel = typeof parsed.humor_level === 'number' ? parsed.humor_level : 0;

    // Log warning if AI returned incomplete data
    if (genres.length === 0 && humorLevel === 0) {
      console.warn("Analyze style returned empty data. Raw response:", rawText);
    }

    const preset: TranslationPreset = {
      reference: {
        title_or_summary: titleOrSummary
      },
      genres,
      character_names: [],
      humor_level: humorLevel
    };

    return { preset, tokens };
  } catch (error) {
    console.error("Analyze style error:", error);
    throw error;
  }
}

export async function aiFixSegments(
  segments: SubtitleSegment[],
  preset: TranslationPreset | null,
  model: AiModel,
  apiKey: string,
  targetCPS: number = 20
): Promise<{ segments: SubtitleSegment[]; tokens: number }> {

  const payload = segments.map((s) => {
    const duration = Math.max(timeToSeconds(s.endTime) - timeToSeconds(s.startTime), 0.1);
    const currentText = s.translatedText || "";
    const currentCps = currentText.length / duration;

    return {
      id: s.id,
      cn: s.originalText || "",
      vn: currentText,
      duration,
      currentCps,
    };
  });

  try {
    const result = await callBackendAi('/api/subtitle/ai/optimize', {
      segments: payload,
      preset
    });

    const fixes = JSON.parse(result.text || "[]");
    const tokens = result.usage?.totalTokenCount || 0;

    const updatedSegments = segments.map((s) => {
      const fix = fixes.find((f: any) => f.id === s.id);

      if (!fix) return s;

      let text = normalizeAiText(fix.fixedText.trim());

      return {
        ...s,
        translatedText: text,
      };
    });

    return { segments: updatedSegments, tokens };
  } catch (error) {
    console.error("AI Fix error:", error);
    throw error;
  }
}


