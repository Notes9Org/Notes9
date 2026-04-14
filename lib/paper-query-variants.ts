/**
 * Natural-language query → search variants, PubMed term, and BM25 expansion.
 *
 * Design principle: ALL logic is structural and linguistic — zero domain-specific
 * lookup tables for synonyms, acronyms, or MeSH descriptors.
 *
 * Why no tables?
 *   PubMed's Automatic Term Mapping (ATM) has 30+ years of biomedical ontology built in.
 *   It maps unquoted tokens (SMFA, CKD, EGFR, author names, …) to MeSH, author fields,
 *   and synonym variants automatically — but ONLY when the query is NOT wrapped in a
 *   parenthesised full-sentence expression. This file prepares clean keyword inputs that
 *   let ATM work correctly for any domain, without us maintaining a growing list of terms.
 *
 * Structural rules that replace the old tables:
 *   - ALL-CAPS tokens (≥2 chars): detected structurally → promoted first in compact output
 *     so PubMed ATM and OpenAlex treat them with higher weight.
 *   - Author pattern "by firstname lastname": detected as a linguistic pattern → converted
 *     to a `(Lastname F[au])` field clause in the PubMed query.
 *   - Broad OR fallback for verbose NL questions: structural token extraction → provides
 *     recall without any domain knowledge.
 *   - Stop-word filtering: standard English NLP stop words, not a medical dictionary.
 *
 * The only maintained list is SEARCH_TYPO_REPLACEMENTS: common misspellings found in
 * voice/pasted queries that are linguistic artifacts, not domain knowledge.
 */

/** Max extra OR clauses appended to PubMed `term` (excluding date filter). */
export const PUBMED_MAX_EXTRA_CLAUSES = 6

/**
 * Budget for `encodeURIComponent(expandedPubMedTerm)` before the `[dp]` date wrapper.
 * Conservative for proxies/CDNs in front of NCBI E-utilities (~2048–4096 total URL limits).
 */
export const PUBMED_EXPANDED_TERM_MAX_ENCODED = 3000

// ─── URL-budget enforcement ────────────────────────────────────────────────

function truncateToEncodedMax(s: string, maxEncoded: number): string {
  let lo = 0
  let hi = s.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (encodeURIComponent(s.slice(0, mid)).length <= maxEncoded) lo = mid
    else hi = mid - 1
  }
  const out = s.slice(0, lo).trim()
  return out.length > 0 ? out : s.slice(0, Math.min(1, s.length))
}

/**
 * Drop OR-clauses from the tail (then hard-truncate as last resort) so the
 * PubMed `term` fits within GET URL budgets.
 */
export function capExpandedPubMedTermEncodedLength(
  term: string,
  maxEncoded: number = PUBMED_EXPANDED_TERM_MAX_ENCODED,
): { term: string; clipped: boolean } {
  const t = term.trim()
  if (!t) return { term: t, clipped: false }
  if (encodeURIComponent(t).length <= maxEncoded) return { term: t, clipped: false }

  const parts = t.split(" OR ").map((p) => p.trim()).filter(Boolean)
  if (parts.length === 0) return { term: t, clipped: false }

  let clipped = false
  const cur = [...parts]
  while (cur.length > 1 && encodeURIComponent(cur.join(" OR ")).length > maxEncoded) {
    cur.pop()
    clipped = true
  }

  let out = cur.join(" OR ")
  if (encodeURIComponent(out).length > maxEncoded) {
    clipped = true
    out = truncateToEncodedMax(out, maxEncoded)
  }
  return { term: out, clipped }
}

// ─── Typo normalisation (linguistic, not domain) ──────────────────────────

/**
 * Common misspellings found in pasted / voice queries.
 * These are spelling artifacts, not medical domain knowledge.
 * Add entries when a typo shows up repeatedly — no function changes needed.
 */
const SEARCH_TYPO_REPLACEMENTS: Array<{ re: RegExp; to: string }> = [
  { re: /\bmethodolgy\b/gi, to: "methodology" },
  { re: /\bpharmacokinetcs\b/gi, to: "pharmacokinetics" },
  { re: /\bmetabolsim\b/gi, to: "metabolism" },
]

/** Apply typo corrections to every query before any processing. */
export function normalizeAcademicSearchText(s: string): string {
  let t = s
  for (const { re, to } of SEARCH_TYPO_REPLACEMENTS) {
    t = t.replace(re, to)
  }
  return t
}

// ─── Standard NLP stop words ───────────────────────────────────────────────

const STOP = new Set([
  "the", "a", "an", "and", "or", "in", "of", "to", "for",
  "is", "are", "was", "were", "with", "on", "at", "by", "from", "as",
  "what", "how", "why", "when", "does", "do", "did",
  "about", "into", "any", "some", "this", "that", "these", "those",
  "be", "been", "being", "have", "has", "had",
  "we", "our", "their", "its",
])

// ─── Internal helpers ──────────────────────────────────────────────────────

function uniquePreserveOrder(strings: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const s of strings) {
    const k = s.trim().toLowerCase()
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(s.trim())
  }
  return out
}

/**
 * Detect ALL-CAPS tokens (≥2 chars) in a string.
 * Structural proxy for acronym detection — no lookup table required.
 * Works for any domain: SMFA, EGFR, CKD, PCR, ELISA, TNF, etc.
 */
function detectAllCapsAcronyms(text: string): string[] {
  const matches = text.match(/\b[A-Z]{2,}\b/g) ?? []
  return [...new Set(matches)]
}

// ─── Entity extraction ─────────────────────────────────────────────────────

/**
 * Extract significant tokens from a query (stop-filtered, length ≥ 3).
 */
export function extractEntities(query: string): string[] {
  const cleaned = query.replace(/[^\w\s]/g, " ")
  const words = cleaned.split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w.toLowerCase()))
  return uniquePreserveOrder(words)
}

// ─── Question boilerplate stripping ───────────────────────────────────────

function stripQuestionBoilerplate(s: string): string {
  return s
    .trim()
    .replace(/\?+$/, "")
    .replace(
      /^(?:what|why|how|when|who|which|where)\s+(?:is|are|was|were|do|does|did|should|can|could|would|will)\s+/i,
      "",
    )
    .replace(/^(?:please\s+)?(?:tell me|describe|explain|find|search for|list)\s+/i, "")
    .replace(/^the\s+/i, "")
    .trim()
}

// ─── API search query (compact, keyword-only) ──────────────────────────────

/**
 * Short keyword line for PubMed (primary AND query), OpenAlex, and Europe PMC.
 *
 * Strategy:
 *  1. Normalize typos.
 *  2. Strip question boilerplate ("What is the …", "How does …").
 *  3. Remove trailing "by firstname lastname" author pattern (handled separately
 *     by pubMedAuthorHintClause as a field-qualified [au] clause).
 *  4. Promote ALL-CAPS tokens first (structural acronym detection — no table).
 *  5. Append remaining stop-filtered content words up to 8 tokens total.
 *
 * Sending these unquoted, unparenthesised tokens to PubMed enables its
 * Automatic Term Mapping to expand them to MeSH, author names, etc. for free.
 */
export function literatureApiSearchQuery(userQuery: string): string {
  const raw = normalizeAcademicSearchText(userQuery.trim())
  if (!raw) return raw

  const stripped = stripQuestionBoilerplate(raw)

  // Strip trailing author pattern so person names don't dilute the keyword AND query
  const withoutAuthor = stripped.replace(/\bby\s+[a-z]{2,14}\s+[a-z]{2,22}\s*$/i, "").trim()
  const source = withoutAuthor || stripped

  const tokens = source.match(/\b[\w-]+\b/g) ?? raw.match(/\b[\w-]+\b/g) ?? []
  const seen = new Set<string>()
  const out: string[] = []

  // Promote ALL-CAPS acronyms first (structural detection, no table needed)
  for (const tok of tokens) {
    if (/^[A-Z]{2,}$/.test(tok) && !seen.has(tok.toLowerCase())) {
      seen.add(tok.toLowerCase())
      out.push(tok)
    }
  }

  // Append remaining content tokens (stop-filtered)
  for (const w of tokens) {
    const lower = w.toLowerCase()
    if (lower.length < 3 || STOP.has(lower) || seen.has(lower)) continue
    seen.add(lower)
    out.push(w)
    if (out.length >= 8) break
  }

  return out.length > 0 ? out.join(" ") : raw
}

// ─── PubMed broad-OR fallback ──────────────────────────────────────────────

/**
 * For verbose / question-style queries, PubMed AND-joins all tokens → often 0 hits.
 * Returns an OR-group of key tokens so at least one term matches (high recall).
 * Returns null for short keyword queries that don't need a fallback.
 */
export function broadPubMedFallbackOrClause(userQuery: string): string | null {
  const raw = normalizeAcademicSearchText(userQuery.trim())
  if (!raw) return null

  const wc = (raw.match(/\b[\w-]+\b/g) ?? []).length
  const isVerbose = wc >= 10 || /^(?:what|why|how|when|who|which|where)\b/i.test(raw)
  if (!isVerbose) return null

  const kw = literatureApiSearchQuery(raw)
  const parts = kw.split(/\s+/).filter(Boolean)
  if (parts.length < 2) return null

  return parts.slice(0, 8).join(" OR ")
}

// ─── PubMed author hint ────────────────────────────────────────────────────

/** Words that can follow "by" but are not person names. */
const NOT_PERSON_NAME_TOKENS = new Set([
  "assay", "paper", "study", "studies", "model", "trial", "vaccine",
  "analysis", "review", "report", "research", "data", "results",
  "method", "methods",
])

function capitalizeWord(w: string): string {
  return w.slice(0, 1).toUpperCase() + w.slice(1).toLowerCase()
}

/**
 * Detects "… by firstname lastname" at the end of a query and returns a PubMed
 * author search clause `(Lastname F[au])`. Returns null when no author is found.
 * Purely linguistic pattern — no person-name dictionary required.
 */
export function pubMedAuthorHintClause(normalizedQuery: string): string | null {
  const s = normalizedQuery.trim()
  const m = s.match(/\bby\s+([a-z]{2,14})\s+([a-z]{2,22})\s*$/i)
  if (!m) return null
  const first = m[1]!.toLowerCase()
  const last = m[2]!.toLowerCase()
  if (STOP.has(first) || STOP.has(last)) return null
  if (NOT_PERSON_NAME_TOKENS.has(first) || NOT_PERSON_NAME_TOKENS.has(last)) return null
  return `(${capitalizeWord(last)} ${first[0]!.toUpperCase()}[au])`
}

// ─── Query variant generation ──────────────────────────────────────────────

/**
 * NL query → small list of search strings (primary first).
 *
 * Variants are structural, not synonym-based:
 *  0: original normalized query (for OpenAlex/Europe PMC NL search)
 *  1: compact keyword form (for second-pass OpenAlex or fallback)
 *  2: top entities joined (shorter still)
 *
 * No synonym tables: each API handles expansion internally with its own NLP.
 */
export function generateQueryVariants(userQuery: string, maxVariants = 4): string[] {
  const raw = normalizeAcademicSearchText(userQuery.trim())
  if (!raw) return []

  const compact = literatureApiSearchQuery(raw)
  const entities = extractEntities(raw)

  const variants: string[] = [raw]

  if (compact && compact.toLowerCase() !== raw.toLowerCase()) {
    variants.push(compact)
  }

  if (entities.length >= 2) {
    const short = entities.slice(0, 4).join(" ")
    if (short.toLowerCase() !== compact.toLowerCase() && short.toLowerCase() !== raw.toLowerCase()) {
      variants.push(short)
    }
  }

  // ALL-CAPS acronyms joined with the top entity (alternative signal for OpenAlex)
  const acronyms = detectAllCapsAcronyms(raw)
  if (acronyms.length > 0 && entities.length > 0) {
    const acroVariant = [...acronyms, ...entities.slice(0, 3)].join(" ")
    variants.push(acroVariant)
  }

  return uniquePreserveOrder(variants).slice(0, Math.max(1, maxVariants))
}

// ─── PubMed expanded term ──────────────────────────────────────────────────

/**
 * PubMed `term` before date filter.
 *
 * Structure (joined with OR, URL-capped):
 *  1. Compact AND query + optional author field clause
 *     — unquoted tokens → PubMed ATM handles MeSH mapping, acronym expansion,
 *       synonym variants, and author-name recognition for ANY domain automatically.
 *  2. Broad token-OR group (only for verbose/question queries, for high recall)
 *
 * Why no MeSH hints or synonym [tiab] expansions?
 *   PubMed ATM already performs this mapping internally when tokens are unquoted.
 *   Explicit MeSH or synonym injection only helps if ATM fails, and requires a
 *   growing domain-specific table to be maintained manually.
 */
export function buildExpandedPubMedTerm(userQuery: string): string {
  const q = normalizeAcademicSearchText(userQuery.trim())
  if (!q) return q

  const compact = literatureApiSearchQuery(q)
  const auth = pubMedAuthorHintClause(q)

  // Primary: compact keywords (ATM-eligible) + author field qualifier
  const primary = auth ? `${compact} ${auth}` : compact

  const broadOr = broadPubMedFallbackOrClause(q)
  const parts: string[] = [primary]
  if (broadOr) parts.push(`(${broadOr})`)

  const merged = uniquePreserveOrder(parts)
  if (merged.length === 1) return merged[0]!

  const { term } = capExpandedPubMedTermEncodedLength(merged.join(" OR "))
  return term
}

// ─── Europe PMC expansion ──────────────────────────────────────────────────

/**
 * Europe PMC free-text query: compact keyword form of the user query.
 * Europe PMC is a full-text search engine with its own NLP/stemming pipeline;
 * sending a clean keyword string outperforms sending the full NL question.
 */
export function expandEuropeFreeTextQuery(userQuery: string): string {
  return literatureApiSearchQuery(normalizeAcademicSearchText(userQuery.trim()))
}

// ─── BM25 / lexical scoring expansion ─────────────────────────────────────

/**
 * Query string for BM25 re-ranking.
 *
 * Returns the normalized user query as-is. BM25 scores documents on token
 * overlap with this query — injecting synonyms or acronym expansions adds
 * noise that hurts precision. The retrieved papers already contain the
 * relevant vocabulary; BM25 surfaces the ones with the most matching terms.
 */
export function expandQueryForLexicalScoring(rawInput: string): string {
  return normalizeAcademicSearchText(rawInput.trim())
}

// ─── Backward-compatible stub ──────────────────────────────────────────────

/**
 * @deprecated MeSH hints are now handled automatically by PubMed ATM when
 * tokens are sent unquoted. This function always returns an empty array and
 * will be removed in a future release.
 */
export function meshHintsForQuery(_query: string, _maxHints = 4): string[] {
  return []
}
