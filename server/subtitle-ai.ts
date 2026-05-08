import { Type } from "@google/genai";
import { callAi } from "./ai-provider.js";
import { IssueType, classifyIssues } from "../shared/types.js";

// Helper functions for prompt generation (moved from frontend)
function getHumorRule(humorLevel: number): string {
  if (humorLevel <= 2) {
    return `Neutral narration. Translate faithfully, no sarcasm or exaggeration.`;
  }
  if (humorLevel <= 4) {
    return `Natural conversational narration. Sound like natural spoken Vietnamese. Very mild humor allowed.`;
  }
  if (humorLevel <= 6) {
    return `Playful narration. Prefer lively spoken Vietnamese. Mild humor, expressive wording allowed.`;
  }
  if (humorLevel <= 8) {
    return `Energetic recap-style narration. Expressive and dynamic phrasing, light sarcasm or exaggeration allowed. Make subtitles feel entertaining and vivid.`;
  }
  return `
Chaotic comedic narrator mode (MAX LEVEL).
- **PERSONA**: You are a "Witty Gen Z Sarcastic Storyteller". You use modern Vietnamese slang (e.g., "ảo thật đấy", "cạn lời", "bay màu") combined with exaggerated, poetic metaphors ("bay bổng") to make the story vivid.
- **VOICE**: Sarcastic, over-the-top, and entertaining. Actively inject humor through teasing and mockery.
- **CONSISTENCY**: You must maintain a steady voice across the entire story. Do not be serious in one batch and funny in another.
- **PRONOUNS**: Stick to established relationships:
  * Enemies/Villains: "Mày - Tao" or "Ngươi - Ta".
  * Master/Disciple or Formal: "Ta - Ngươi" or "Tiền bối - Hậu bối".
  * Romantic/Close: "Anh - Em" or "Chàng - Thiếp" if appropriate.
  * Casual: "Tui - Ông/Bà" or "Cậu - Tớ".
- **STRUCTURE**: Rewrite into shorter, punchier Vietnamese. Keep a strict 1-to-1 mapping. Do NOT merge IDs.
- **STYLE**: Feel like a fast, high-energy recap. Use metaphors and colorful language to make it "bay bổng" but keep it grounded in the original meaning.
`;
}

function getCharacterRules(characterNames: { cn: string; vn: string }[]): string {
  if (!characterNames || characterNames.length === 0) return "";
  return `
Character name normalization:
Canonical characters (Chinese -> Vietnamese):
${characterNames.map(c => `- ${c.cn} → ${c.vn}`).join('\n')}

Important rules:
- Names in the source may be inconsistent (similar characters, pronunciation, or spelling).
- If a name is identical, visually similar, or phonetically similar to a known character, treat it as the SAME person.
- ALWAYS use the provided Vietnamese name.
- NEVER create alternative name variants.
- Do NOT create new characters unless clearly different.
`;
}

export async function translateBatch(params: {
  batch: any[];
  contextBefore: any[];
  contextAfter: any[];
  preset: any;
  maxSingleLineWords: number;
  autoSplitLongLines: boolean;
}) {
  const { batch, contextBefore, contextAfter, preset, maxSingleLineWords, autoSplitLongLines } = params;

  const humorLevel = preset?.humor_level ?? 0;
  const humorRule = getHumorRule(humorLevel);
  const characterRules = getCharacterRules(preset?.character_names || []);

  const styleBlock = `
Genres: ${(preset?.genres || []).join(", ")}

Narration style:
${humorRule}
`;

  const storyContext = preset?.reference?.title_or_summary
    ? `Story context: ${preset.reference.title_or_summary}`
    : "";

  const neighborContext = (contextBefore.length || contextAfter.length)
    ? `
Neighbor subtitles (reference only):
Prev:
${contextBefore.map(c => `- ${c.original} → ${c.translated}`).join('\n')}
Next (Original only):
${contextAfter.map(c => `- ${c.original}`).join('\n')}
` : "";

  const prompt = `
OUTPUT MUST BE 100% VIETNAMESE. NO Chinese characters allowed in the output.

Translate Chinese subtitles into natural Vietnamese.
Output: JSON array [{"id": number, "text": string}] — one object per input, same order, no omissions.
**STRICT RULE: 1-to-1 mapping required. Do NOT merge the content of multiple input IDs into a single output ID. Do NOT repeat the same text for different IDs.**

${styleBlock}
${storyContext}
${characterRules}
${neighborContext}
Rules:
1. Preserve core meaning. Do not invent story events. Tone adaptation allowed.
2. Length: keep all meaningful content — only remove filler/repeated words. Very short source (≤6 Chinese chars) → keep output brief (2-5 Vietnamese words). Longer lines → translate fully, do not compress. ${autoSplitLongLines ? `Use "\\\\n" ONLY when the subtitle exceeds ${maxSingleLineWords} words and needs a visual display break — NOT as a clause separator for short subtitles.` : "Line breaks optional."}
3. Punctuation: Chinese subtitles often lack punctuation. For a subtitle with multiple short clauses, separate them with a comma within the same line — do NOT use "\\n" as a clause separator. Only add punctuation that is grammatically necessary; do not add expressive punctuation not implied by the source.
4. Names: Sino-Vietnamese (Hán-Việt) transcription (e.g. 张凤华 → Trương Phượng Hoa). Do NOT use Pinyin ("Zhang", "Wang", "Li" are WRONG).${characterRules ? " Use character rules if provided." : " Ensure consistent Hán-Việt transcription for names across all segments."}
5. Each subtitle is independent; neighbor context for reference only. **NEVER combine the meaning of adjacent subtitles into one.**
6. Style priority: follow narration style above if meaning is preserved.
7. **NO REPETITION: Do not use the exact same translation for different IDs unless the source text is identical.**

REMINDER: Output text must be 100% Vietnamese. Any Chinese character in output is a critical error.

Subtitle data:
${JSON.stringify(batch.map(s => ({ id: s.id, text: s.originalText })))}
`;

  const result = await callAi({
    prompt,
    responseMimeType: "application/json",
    responseSchema: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.INTEGER },
          text: { type: Type.STRING }
        },
        required: ["id", "text"]
      }
    }
  });

  return { ...result, prompt };
}

const ISSUE_FOCUS_TEXT: Record<IssueType, string> = {
  language: `FOCUS: Rewrite to eliminate ALL foreign/non-Vietnamese content
- Translate any remaining Chinese characters using the cn field as reference
- Replace foreign words with proper Vietnamese equivalents
- Use Sino-Vietnamese (Hán-Việt) transcription for names/terms
- Output must be 100% pure Vietnamese Latin script`,
  length: `FOCUS: Reduce and compress
- Shorten the text while preserving core meaning
- Use more concise, punchier phrasing
- Remove filler words and redundant expressions
- Target: fewer words, same meaning`,
};

/**
 * Build the SEGMENT-SPECIFIC OVERRIDES block for the prompt.
 * Groups segments that share the same issue type(s) to avoid repetition.
 * If all segments share an issue, writes it as a global override (no ID label).
 * @param foreignWords - specific foreign words that must be replaced (for language issues)
 */
function buildSegmentOverridesBlock(
  segments: any[],
  segmentIssues?: Map<number, string[]>,
  foreignWords?: string[]
): string {
  if (!segmentIssues || segmentIssues.size === 0) return '';

  // Map each issue key (sorted type list) → list of segment IDs
  const groupMap = new Map<string, { ids: string[]; types: IssueType[] }>();

  for (const s of segments) {
    const issues = segmentIssues.get(Number(s.id)) || [];
    const types = Array.from(classifyIssues(issues)).sort() as IssueType[];
    if (types.length === 0) continue;
    const key = types.join('+');
    if (!groupMap.has(key)) {
      groupMap.set(key, { ids: [], types });
    }
    groupMap.get(key)!.ids.push(String(s.id));
  }

  if (groupMap.size === 0) return '';

  // Build per-type focus text, injecting foreignWords into the language focus if provided
  const buildFocusText = (types: IssueType[]): string => {
    return types.map(t => {
      let text = ISSUE_FOCUS_TEXT[t];
      if (t === 'language' && foreignWords && foreignWords.length > 0) {
        text += `\n- These specific foreign words MUST be replaced (no exception): ${foreignWords.join(', ')}`;
      }
      return text;
    }).join('\n\n');
  };

  const totalSegments = segments.length;
  const globalLines: string[] = [];
  const specificLines: string[] = [];

  for (const { ids, types } of groupMap.values()) {
    const focusText = buildFocusText(types);
    if (ids.length === totalSegments) {
      // All segments share this issue → global, no label
      globalLines.push(focusText);
    } else {
      // Subset only → label with segment IDs
      const label = ids.length === 1
        ? `[Segment #${ids[0]}]`
        : `[Segments #${ids.join(', #')}]`;
      specificLines.push(`${label}:\n${focusText}`);
    }
  }

  const parts: string[] = [];
  if (globalLines.length > 0) {
    parts.push(`OVERRIDES (MANDATORY — apply to all segments):\n${globalLines.join('\n\n')}`);
  }
  if (specificLines.length > 0) {
    parts.push(`SEGMENT-SPECIFIC OVERRIDES (MANDATORY — apply only to listed segments):\n${specificLines.join('\n\n')}`);
  }

  return `\n${parts.join('\n\n')}\n`;
}

export async function aiFixSegments(params: {
  segments: any[];
  preset: any;
  segmentIssues?: Map<number, string[]>;
  /** Specific foreign words to replace, collected from all segments in this batch */
  foreignWords?: string[];
}): Promise<{ text?: string; usage?: any; prompt?: string }> {
  const { segments, preset, segmentIssues, foreignWords } = params;
  const humorLevel = preset?.humor_level ?? 0;
  const humorRule = getHumorRule(humorLevel);
  const characterRules = getCharacterRules(preset?.character_names || []);

  const styleBlock = `
Genres: ${(preset?.genres || []).join(", ")}

Narration style:
${humorRule}
`;

  const storyContext = preset?.reference?.title_or_summary
    ? `Story context: ${preset.reference.title_or_summary}`
    : "";

  const segmentOverridesBlock = buildSegmentOverridesBlock(segments, segmentIssues, foreignWords);

  const prompt = `
CRITICAL: OUTPUT MUST BE 100% VIETNAMESE. Any Chinese character in the output is a hard failure.

Fix and optimize Vietnamese subtitles. Translate any remaining Chinese to Vietnamese.
Output: JSON array [{"id": number, "fixedText": string}]

${styleBlock}
${storyContext}
${characterRules}
${segmentOverridesBlock}
Input fields:
- cn: Original Chinese (reference — use to understand meaning and fix mistranslations)
- vn: Current Vietnamese draft (may contain untranslated Chinese characters)

Rules:
1. Translate ALL Chinese characters in vn using cn as reference.
2. Names/proper nouns: Sino-Vietnamese (Hán-Việt) transcription (e.g. 张凤华 → Trương Phượng Hoa, 问天宗 → Vấn Thiên Tông). Do NOT use Pinyin ("Zhang", "Wang" are WRONG).${characterRules ? " Use character rules if provided." : ""}
3. Organizations/titles: translate meaningfully using Hán-Việt.
4. Each segment is independent. Do NOT merge or split segments.
5. Fix mistranslations by comparing vn against cn. Preserve core meaning.
6. Punctuation: add natural punctuation only where grammatically necessary. Do not add expressive punctuation not implied by the source.
7. Length: preserve all meaningful content — only remove filler/repeated words. Very short source (≤6 Chinese chars) → keep output brief (2-5 Vietnamese words). Longer lines → translate fully; compress only if explicitly instructed by an OVERRIDE above.

REMINDER: Every fixedText must be pure Vietnamese Latin script. Zero Chinese characters allowed.

Segments:
${JSON.stringify(segments.map(s => ({ id: s.id, cn: s.cn, vn: s.vn })))}
`;

  const result = await callAi({
    prompt,
    responseMimeType: "application/json",
    responseSchema: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.INTEGER },
          fixedText: { type: Type.STRING },
        },
        required: ["id", "fixedText"],
      },
    },
  });

  return { ...result, prompt };
}

export async function analyzeTranslationStyle(params: { titleOrSummary: string }) {
  const { titleOrSummary } = params;
  const taxonomy = [
    "Tu tiên", "Tiên hiệp", "Huyền huyễn", "Hệ thống", "Xuyên không",
    "Trọng sinh", "Dị giới", "Dị năng", "Thần thoại", "Quỷ dị",
    "Huyền nghi", "Mạt thế", "Đô thị", "Tổng tài", "Thương chiến",
    "Hắc đạo", "Gia đấu", "Học đường", "Showbiz", "Hành động",
    "Chiến đấu", "Sinh tồn", "Báo thù", "Trinh thám", "Kịch tính",
    "Hài hước", "Hài hước đen", "Parody", "Châm biếm"
  ];

  const prompt = `Phân tích thể loại dựa trên tiêu đề hoặc bản tóm tắt sau: ${titleOrSummary}

Chỉ được phép chọn thể loại từ danh sách sau:
${taxonomy.join(', ')}

Trả về JSON với format chính xác sau:
{
  "genres": ["thể loại 1", "thể loại 2"]
}

Quy tắc:
- genres: chọn 1-5 thể loại phù hợp nhất từ danh sách`;

  return callAi({
    prompt,
    responseMimeType: "application/json",
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        genres: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "1-5 thể loại phù hợp nhất từ danh sách."
        }
      },
      required: ["genres"]
    }
  });
}
