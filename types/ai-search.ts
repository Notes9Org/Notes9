import type { SearchPaper } from "@/types/paper-search"

/** How a citation from the AI answer was matched to a database paper. */
export type AiSearchMatchKind = "doi" | "pmid" | "title" | "url" | "none"

/**
 * A single AI-search result: a paper the AI cited in its summary, shown in the
 * center column with the exact relevant snippet (not the abstract). When the
 * citation was matched to a database paper we carry full metadata so Read / Save
 * work; otherwise only the AI-provided title/url/snippet are available.
 */
export interface AiSearchResult {
  /** Inline citation label from the AI answer ("1", "2", "3.1"). */
  citeLabel: string
  /** Exact snippet relevant to the query — prefers cited_text, then excerpt. */
  snippet: string
  /** Title the AI reported (used when no DB match). */
  aiTitle: string | null
  /** Source URL the AI cited (DOI/PubMed/publisher/web). */
  sourceUrl: string | null
  /** Full database metadata when the citation matched a known paper. */
  paper: SearchPaper | null
  /** How the match was made (drives a confidence hint in the UI). */
  matchKind: AiSearchMatchKind
  /**
   * Abstract for the result, always populated when one can be found — from the
   * matched database paper, the AI source payload, or a background lookup of the
   * paper by DOI/PMID/title. Mirrors the abstract shown on database results.
   */
  abstract: string | null
  /**
   * Stable identity for this result. Used both to dedupe and as the abstract
   * cache key, so the value written by the background lookup is read back by the
   * exact same key (no recomputation that could drift).
   */
  dedupeKey: string
  /** Best lookup term for fetching a missing abstract (DOI → PMID → title). */
  lookupTerm: string | null
  /** Whether the lookup term is an id (DOI/PMID) — its top hit is trustworthy. */
  lookupById: boolean
  /**
   * True while this result has no abstract yet but a background lookup is going
   * to (or is currently) fetching one. Drives a loading shimmer so the abstract
   * fades in smoothly instead of flashing "unavailable" then popping in.
   */
  abstractPending: boolean
  /**
   * Per-paper, query-relevant AI summary produced by the backend
   * (/literature/ai-search). Shown as "Why it matters". Null until it streams in.
   */
  aiSummary?: string | null
  /** True while the per-paper summary is still being generated (drives a shimmer). */
  summaryPending?: boolean
}
