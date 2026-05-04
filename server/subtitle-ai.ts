import { Type } from "@google/genai";
import { callGemini } from "./ai-service.js";

// Helper functions for prompt generation (moved from frontend)
function getHumorRule(humorLevel: number): string {
  if (humorLevel <= 2) {
    return `
Neutral narration.
Translate faithfully with clear Vietnamese subtitles.
No sarcasm or exaggeration.
`;
  }
  if (humorLevel <= 4) {
    return `
Natural conversational narration.
Subtitles should sound like natural spoken Vietnamese.
Very mild humor allowed.
`;
  }
  if (humorLevel <= 6) {
    return `
Playful narration style.

Guidelines:
- Prefer lively spoken Vietnamese
- Slightly expressive wording allowed
- Mild humor or playful tone may appear
`;
  }
  if (humorLevel <= 8) {
    return `
Energetic recap-style narration.

Guidelines:
- Prefer expressive and dynamic Vietnamese phrasing
- Light sarcasm or teasing tone allowed
- Slight exaggeration allowed if meaning remains accurate
- Subtitles should feel entertaining and vivid
`;
  }
  return `
Chaotic comedic narrator mode (MAX LEVEL).

Core Style:
- Rewrite lines with a strong humorous and expressive narration style
- Sound like a sarcastic, over-the-top Vietnamese storyteller by default

Humor Behavior:
- Actively inject humor into lines as a default behavior
- Use exaggeration, teasing, and playful mockery naturally
- Add narrator attitude and personality into phrasing

- Express humor by rewriting the sentence, not by adding extra words
- Replace the original phrasing with a shorter, punchy and expressive version
- Prefer simplifying and compressing the sentence while keeping strong tone and attitude
- Do not keep the original sentence structure if it results in longer output
- Reduce or remove less important details to keep the line concise and impactful
- Break complex ideas into simpler, punchier phrasing

Reactions:
- Naturally include short reactions where it fits (e.g. "ủa gì vậy", "ảo thật", "wtf")
- Integrate reactions into the sentence instead of appending them as extra clauses

Narration feel:
- Lines should feel like a fast, entertaining recap, not a full or literal translation
- Avoid plain, flat, or overly complete phrasing
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
Translate Chinese subtitles into natural Vietnamese.

Output format:
JSON array of objects: [{"id": number, "text": string}]

IMPORTANT:
Return one object per input line using the exact id.
Do not reorder items.
Do not omit items.

Core rules:
1. Speaker & POV consistency: Before translating, check if any name matches a known character. Do NOT add character names not in original text. Keep pronouns consistent.
2. Preserve meaning: Keep core meaning accurate. Do not invent new story events. Tone adaptation allowed.
3. Subtitle readability: Natural spoken Vietnamese storytelling subtitles.
4. Length control + line breaking: Concise (target <1.2x). ${autoSplitLongLines ? `If exceeding ${maxSingleLineWords} words, use "\\n".` : "Line breaks optional."}
5. Short line rule: Chinese <=4 chars -> Vietnamese 1-3 words.
6. Dynamic narration: Expressive phrasing, avoid formal language.
7. Names: Consistent forms. Use character rules if provided.
8. Word choice: Vivid and entertaining Vietnamese.
9. No quotes for emphasis.
10. Context usage: Each subtitle must be independent; neighbor context for reference only.
11. Style priority: Follow narration style if meaning is preserved.

${styleBlock}
${storyContext}
${characterRules}
${neighborContext}

Subtitle data:
${JSON.stringify(batch.map(s => ({ id: s.id, text: s.originalText })))}
`;

  return callGemini({
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
}

export async function aiFixSegments(params: {
  segments: any[];
  preset: any;
}) {
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
Optimize Vietnamese subtitles for readability and CPS.

${styleBlock}
${storyContext}
${characterRules}

Rules:
- Each segment is independent.
- Do NOT merge or split segments.
- Preserve core meaning.
- Prefer concise Vietnamese.
- Apply character name normalization strictly.
- Remove filler words.
- Output Vietnamese only (Latin script).
- Translate any remaining Chinese characters.

Goal:
- Reduce CPS while preserving meaning and fluency.

Special rule:
Chinese text length <=4 characters -> output 2-4 Vietnamese words.

Output format:
JSON array [{id, fixedText}]

Segments:
${JSON.stringify(segments)}
`;

  return callGemini({
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

  const prompt = `Phân tích thể loại dựa trên tiêu đề hoặc bản tóm tắt sau: ${titleOrSummary}.
Chỉ được phép chọn từ danh sách sau:
Genres: ${taxonomy.join(', ')}`;

  return callGemini({
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
