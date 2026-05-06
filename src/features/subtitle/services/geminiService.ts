import { Type } from "@google/genai";
import { SubtitleSegment, TranslationPreset, AiModel } from "../types";
import { timeToSeconds } from "./subtitleLogic";

function normalizeAiText(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\n/g, '\n')  // Handle double-escaped \n
    .replace(/\n+/g, '\n')  // Normalize multiple newlines to single
    .replace(/\s*\n\s*/g, '\n')  // Remove spaces around newlines
    .trim();
}

function countWords(text: string): number {
  const normalized = text
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return 0;
  return normalized.split(' ').length;
}

export function splitToTwoLinesIfLong(text: string, maxWords: number): string {
  if (!text) return text;
  // Normalize: ensure clean newlines and spaces
  const normalized = text
    .replace(/\r\n/g, '\n')
    .replace(/\s*\n\s*/g, '\n')  // Remove spaces around newlines
    .replace(/[ \t]+/g, ' ')     // Normalize spaces
    .trim();
  if (!normalized) return text;

  const strongPunct = /[.!?…。！？]+$/;
  const softPunct = /[,;:，、]+$/;
  const minWordsPerLine = Math.min(2, maxWords);

  const pickSplitIndex = (words: string[], max: number): number => {
    const minIdx = minWordsPerLine;
    const maxIdx = words.length - minWordsPerLine;
    const target = Math.ceil(words.length / 2);
    const window = Math.max(2, Math.floor(words.length * 0.2));
    let bestIdx = Math.max(minIdx, Math.min(target, maxIdx));
    let bestScore = Number.POSITIVE_INFINITY;

    for (let i = minIdx; i <= maxIdx; i++) {
      const w = words[i - 1];
      const isStrong = strongPunct.test(w);
      const isSoft = softPunct.test(w);
      const punctWeight = isStrong ? 0 : isSoft ? 1 : 2;

      const line1 = i;
      const line2 = words.length - i;
      const dist = Math.abs(i - target);
      const imbalance = Math.abs(line1 - line2);
      const maxLine = Math.max(line1, line2);
      const overMax = Math.max(0, maxLine - max);

      const nearMiddle = dist <= window;
      const farFromMiddlePenalty = nearMiddle ? 0 : 1000;
      const score = (farFromMiddlePenalty) + (punctWeight * 100) + (dist * 2) + (imbalance * 5) + (overMax * 10);
      if (score < bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    return bestIdx;
  };

  const splitLine = (line: string): string[] => {
    const words = line.split(' ').filter(Boolean);
    if (words.length <= maxWords) return [line];

    // Prefer 2 lines even if a line exceeds maxWords.
    let splitAt = pickSplitIndex(words, maxWords);
    if (splitAt < minWordsPerLine) splitAt = minWordsPerLine;
    if ((words.length - splitAt) < minWordsPerLine) splitAt = Math.max(minWordsPerLine, words.length - minWordsPerLine);

    let first = words.slice(0, splitAt).join(' ');
    let second = words.slice(splitAt).join(' ');

    // If the second line is too short, rebalance while keeping 2 lines.
    if (countWords(second) < minWordsPerLine) {
      const firstWords = first.split(' ').filter(Boolean);
      const secondWords = second.split(' ').filter(Boolean);
      while (secondWords.length < minWordsPerLine && firstWords.length > minWordsPerLine) {
        secondWords.unshift(firstWords.pop() as string);
      }
      first = firstWords.join(' ');
      second = secondWords.join(' ');
    }

    return [first, second];
  };

  let lines = normalized.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 2) {
    const line1Words = countWords(lines[0]);
    const line2Words = countWords(lines[1]);
    const totalWords = line1Words + line2Words;
    // If total words fit in a single line, merge them with space
    if (totalWords <= maxWords) {
      return lines.join(' ').replace(/\s+/g, ' ').trim();
    }
    // If one line exceeds maxWords, rebalance
    if (totalWords <= maxWords * 2 && (line1Words > maxWords || line2Words > maxWords)) {
      const merged = lines.join(' ').replace(/\s+/g, ' ').trim();
      const rebalanced = splitLine(merged);
      if (rebalanced.length === 2) return rebalanced.join('\n');
    }
  }
  if (lines.length > 2) {
    lines = [lines.join(' ').replace(/\s+/g, ' ').trim()];
  }
  const finalLines = lines.flatMap(splitLine);
  return finalLines.join('\n');
}

function collapseToSingleLineIfShort(text: string, maxWords: number = 10): string {
  if (!text.includes('\n')) return text;
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  // Ensure space between lines when merging
  const singleLine = lines.join(' ').replace(/\s+/g, ' ').trim();
  if (countWords(singleLine) <= maxWords) return singleLine;
  return text;
}

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


