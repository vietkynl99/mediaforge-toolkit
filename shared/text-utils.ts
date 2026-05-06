/**
 * Shared text processing utilities for subtitle handling
 * Used by both frontend (geminiService) and backend (executor)
 */

/**
 * Count words in text (split by spaces)
 */
export function countWords(text: string): number {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return 0;
  return normalized.split(' ').length;
}

/**
 * Normalize AI text: handle escaped newlines, clean up formatting
 */
export function normalizeAiText(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\n/g, '\n')  // Handle double-escaped \n
    .replace(/\n+/g, '\n')  // Normalize multiple newlines to single
    .replace(/\s*\n\s*/g, '\n')  // Remove spaces around newlines
    .trim();
}

/**
 * Split long single-line text into two lines if word count exceeds maxWords
 */
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

/**
 * Collapse multi-line text to single line if total words <= maxWords
 */
export function collapseToSingleLineIfShort(text: string, maxWords: number): string {
  if (!text.includes('\n')) return text;
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  // Ensure space between lines when merging
  const singleLine = lines.join(' ').replace(/\s+/g, ' ').trim();
  if (countWords(singleLine) <= maxWords) return singleLine;
  return text;
}
