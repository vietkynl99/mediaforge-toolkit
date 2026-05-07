import { Type } from "@google/genai";
import { callAi } from "./ai-provider.js";

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
- Sound like a sarcastic, over-the-top Vietnamese storyteller.
- Actively inject humor: exaggeration, teasing, mockery, attitude.
- Rewrite into shorter, punchier Vietnamese — compress meaning, cut filler, break complex ideas into snappy phrases.
- Do not keep the original sentence structure if it results in longer output.
- Sprinkle short reactions (e.g. "ủa gì vậy", "ảo thật") woven into the sentence, not appended.
- Feel like a fast entertaining recap, not a literal translation.
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
  contextBefore: string[];
  contextAfter: string[];
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
Prev: ${JSON.stringify(contextBefore)}
Next: ${JSON.stringify(contextAfter)}
` : "";

  const prompt = `
OUTPUT MUST BE 100% VIETNAMESE. NO Chinese characters allowed in the output.

Translate Chinese subtitles into natural Vietnamese.
Output: JSON array [{"id": number, "text": string}] — one object per input, same order, no omissions.

${styleBlock}
${storyContext}
${characterRules}
${neighborContext}
Rules:
1. Preserve core meaning. Do not invent story events. Tone adaptation allowed.
2. Length: keep all meaningful content — only remove filler/repeated words. Very short source (≤6 Chinese chars) → keep output brief (2-5 Vietnamese words). Longer lines → translate fully, do not compress. ${autoSplitLongLines ? `Use "\\\\n" ONLY when the subtitle exceeds ${maxSingleLineWords} words and needs a visual display break — NOT as a clause separator for short subtitles.` : "Line breaks optional."}
3. Punctuation: Chinese subtitles often lack punctuation. For a subtitle with multiple short clauses, separate them with a comma within the same line — do NOT use "\\n" as a clause separator. Only add punctuation that is grammatically necessary; do not add expressive punctuation not implied by the source.
4. Names: Sino-Vietnamese (Hán-Việt) transcription (e.g. 张凤华 → Trương Phượng Hoa). Do NOT use Pinyin ("Zhang", "Wang", "Li" are WRONG).${characterRules ? " Use character rules if provided." : ""}
5. Each subtitle is independent; neighbor context for reference only.
6. Style priority: follow narration style above if meaning is preserved.

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

export async function aiFixSegments(params: {
  segments: any[];
  preset: any;
}): Promise<{ text?: string; usage?: any; prompt?: string }> {
  const { segments, preset } = params;
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

  const prompt = `
CRITICAL: OUTPUT MUST BE 100% VIETNAMESE. Any Chinese character in the output is a hard failure.

Fix and optimize Vietnamese subtitles. Translate any remaining Chinese to Vietnamese.
Output: JSON array [{"id": number, "fixedText": string}]

${styleBlock}
${storyContext}
${characterRules}

Input:
- cn: Original Chinese (reference — use to understand meaning and fix mistranslations)
- vn: Current Vietnamese draft (may contain untranslated Chinese characters)

Rules:
1. Translate ALL Chinese characters in vn using cn as reference.
2. Names/proper nouns: Sino-Vietnamese (Hán-Việt) transcription (e.g. 张凤华 → Trương Phượng Hoa, 问天宗 → Vấn Thiên Tông). Do NOT use Pinyin ("Zhang", "Wang" are WRONG).${characterRules ? " Use character rules if provided." : ""}
3. Organizations/titles: translate meaningfully using Hán-Việt.
4. Each segment is independent. Do NOT merge or split segments.
5. Fix mistranslations by comparing vn against cn. Preserve core meaning.
6. Punctuation: add natural punctuation only where grammatically necessary. Do not add expressive punctuation not implied by the source.
7. Length: preserve all meaningful content — only remove filler/repeated words. Very short source (≤6 Chinese chars) → keep output brief (2-5 Vietnamese words). Longer lines → fix and keep full meaning, do not compress.

REMINDER: Every fixedText must be pure Vietnamese Latin script. Zero Chinese characters allowed.

Segments:
${JSON.stringify(segments)}
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
  "genres": ["thể loại 1", "thể loại 2"],
  "humor_level": số từ 0 đến 10
}

Quy tắc:
- genres: chọn 1-5 thể loại phù hợp nhất từ danh sách
- humor_level: 0-2 (nghiêm túc), 3-5 (tự nhiên), 6-8 (hài hước nhẹ), 9-10 (hài hước cao)`;

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
        },
        humor_level: {
          type: Type.NUMBER,
          description: "Mức độ hài hước từ 0 đến 10"
        }
      },
      required: ["genres", "humor_level"]
    }
  });
}
