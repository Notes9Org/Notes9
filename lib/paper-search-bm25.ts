/**
 * Okapi BM25 on a small in-memory corpus (merged search hits).
 * Used to re-rank fused results without external ML dependencies.
 */

const DEFAULT_K1 = 1.5
const DEFAULT_B = 0.75

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^-+|-+$/g, ""))
    .filter((t) => t.length > 1)
}

function termFreqs(tokens: string[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const t of tokens) {
    m.set(t, (m.get(t) ?? 0) + 1)
  }
  return m
}

/**
 * BM25 score per document for `query` against `documents` (same length as output array).
 */
export function bm25Scores(
  documents: string[],
  query: string,
  options?: { k1?: number; b?: number },
): number[] {
  const k1 = options?.k1 ?? DEFAULT_K1
  const b = options?.b ?? DEFAULT_B

  const tokenizedDocs = documents.map((d) => tokenize(d))
  const docLens = tokenizedDocs.map((t) => t.length)
  const N = documents.length
  if (N === 0) return []

  const avgdl = docLens.reduce((a, x) => a + x, 0) / Math.max(1, N)

  const df = new Map<string, number>()
  for (const tokens of tokenizedDocs) {
    const seen = new Set<string>()
    for (const t of tokens) {
      if (seen.has(t)) continue
      seen.add(t)
      df.set(t, (df.get(t) ?? 0) + 1)
    }
  }

  const idf = new Map<string, number>()
  for (const [term, dfi] of df) {
    idf.set(term, Math.log((N - dfi + 0.5) / (dfi + 0.5) + 1))
  }

  const qTokens = tokenize(query)
  if (qTokens.length === 0) return documents.map(() => 0)

  const scores: number[] = []
  for (let i = 0; i < N; i++) {
    const tf = termFreqs(tokenizedDocs[i])
    const dl = docLens[i]
    let score = 0
    for (const term of qTokens) {
      const idfTerm = idf.get(term)
      if (idfTerm == null) continue
      const f = tf.get(term) ?? 0
      if (f === 0) continue
      const denom = f + k1 * (1 - b + (b * dl) / (avgdl || 1))
      score += (idfTerm * f * (k1 + 1)) / denom
    }
    scores.push(score)
  }
  return scores
}

/** Min–max normalize scores to [0, 1]; all-zero → zeros. */
export function normalizeScoresMinMax(scores: number[]): number[] {
  if (scores.length === 0) return []
  const min = Math.min(...scores)
  const max = Math.max(...scores)
  const span = max - min
  if (span <= 1e-12) return scores.map(() => 0)
  return scores.map((s) => (s - min) / span)
}
