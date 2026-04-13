/**
 * Sliding-window fuzzy text matcher used to locate an AI-returned excerpt
 * inside a document (TipTap HTML text or PDF page text).
 *
 * The algorithm normalises whitespace + case, then slides a window over the
 * haystack scoring each candidate with a trigram-Jaccard similarity.  The best
 * match above `threshold` is returned with its *original* (un-normalised)
 * character offsets so the caller can map back to DOM / ProseMirror positions.
 */

export interface FuzzyMatchResult {
  /** Start index in the *original* haystack string. */
  start: number;
  /** End index (exclusive) in the original haystack. */
  end: number;
  /** Similarity score 0–1. */
  score: number;
}

function normalise(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

function trigrams(s: string): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i <= s.length - 3; i++) {
    set.add(s.slice(i, i + 3));
  }
  return set;
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const t of a) {
    if (b.has(t)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Build a mapping from normalised-string index back to original-string index.
 * This lets us return start/end in the *original* haystack even though we
 * search in the normalised version.
 */
function buildIndexMap(original: string): number[] {
  const map: number[] = [];
  let inWhitespace = false;
  let leading = true;

  for (let i = 0; i < original.length; i++) {
    const isWs = /\s/.test(original[i]);

    if (leading) {
      if (isWs) continue;
      leading = false;
    }

    if (isWs) {
      if (!inWhitespace) {
        map.push(i);
        inWhitespace = true;
      }
    } else {
      map.push(i);
      inWhitespace = false;
    }
  }

  // Trim trailing space that normalise() would remove
  while (map.length > 0 && /\s/.test(original[map[map.length - 1]])) {
    map.pop();
  }

  return map;
}

export function fuzzyFindExcerpt(
  haystack: string,
  needle: string,
  options?: { threshold?: number },
): FuzzyMatchResult | null {
  const threshold = options?.threshold ?? 0.45;
  const normNeedle = normalise(needle);
  if (normNeedle.length < 3) return null;

  const normHaystack = normalise(haystack);
  if (normHaystack.length < 3) return null;

  // Fast path: exact substring match in normalised space
  const exactIdx = normHaystack.indexOf(normNeedle);
  if (exactIdx !== -1) {
    const idxMap = buildIndexMap(haystack);
    const origStart = idxMap[exactIdx] ?? 0;
    const endMapped = exactIdx + normNeedle.length - 1;
    const origEnd = (idxMap[endMapped] ?? origStart) + 1;
    return { start: origStart, end: origEnd, score: 1 };
  }

  const needleTrigrams = trigrams(normNeedle);
  const nLen = normNeedle.length;
  const windowMin = Math.max(3, Math.floor(nLen * 0.7));
  const windowMax = Math.ceil(nLen * 1.4);

  let best: { normStart: number; normEnd: number; score: number } | null = null;

  for (let wLen = nLen; wLen >= windowMin; wLen = Math.floor(wLen * 0.85)) {
    for (let i = 0; i <= normHaystack.length - wLen; i++) {
      const windowStr = normHaystack.slice(i, i + wLen);
      const score = jaccardSimilarity(needleTrigrams, trigrams(windowStr));
      if (score > (best?.score ?? 0)) {
        best = { normStart: i, normEnd: i + wLen, score };
      }
    }
    if (best && best.score > 0.85) break;
  }

  if (!best) {
    for (let wLen = nLen + 1; wLen <= Math.min(windowMax, normHaystack.length); wLen = Math.ceil(wLen * 1.15)) {
      for (let i = 0; i <= normHaystack.length - wLen; i++) {
        const windowStr = normHaystack.slice(i, i + wLen);
        const score = jaccardSimilarity(needleTrigrams, trigrams(windowStr));
        if (score > (best?.score ?? 0)) {
          best = { normStart: i, normEnd: i + wLen, score };
        }
      }
      if (best && best.score > 0.85) break;
    }
  }

  if (!best || best.score < threshold) return null;

  const idxMap = buildIndexMap(haystack);
  const origStart = idxMap[best.normStart] ?? 0;
  const endMapped = best.normEnd - 1;
  const origEnd = (idxMap[endMapped] ?? origStart) + 1;

  return { start: origStart, end: origEnd, score: best.score };
}
