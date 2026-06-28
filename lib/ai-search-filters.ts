import type { AiSearchResult } from "@/types/ai-search"

export type PaperType =
  | "review"
  | "meta-analysis"
  | "clinical-trial"
  | "research"
  | "book-chapter"
  | "other"

export type AiSortMode = "relevance" | "cited" | "recent" | "openAccess"

export interface AiResultFilters {
  sort: AiSortMode
  yearFrom: number | null
  yearTo: number | null
  minCitations: number | null
  types: PaperType[]
  journals: string[]
  openAccessOnly: boolean
}

export const DEFAULT_AI_FILTERS: AiResultFilters = {
  // Relevance is the default: the AI returns results in relevance order and that
  // ordering must never be demoted. "Open access first" is an explicit opt-in
  // (it intentionally reorders OA papers ahead of more-relevant non-OA ones).
  sort: "relevance",
  yearFrom: null,
  yearTo: null,
  minCitations: null,
  types: [],
  journals: [],
  openAccessOnly: false,
}

export const PAPER_TYPE_LABELS: Record<PaperType, string> = {
  review: "Review",
  "meta-analysis": "Meta-analysis",
  "clinical-trial": "Clinical trial",
  research: "Research article",
  "book-chapter": "Book chapter",
  other: "Other",
}

export const PAPER_TYPE_ORDER: PaperType[] = [
  "research",
  "review",
  "meta-analysis",
  "clinical-trial",
  "book-chapter",
  "other",
]

/** Heuristic paper-type from title + abstract + snippet (the API gives no type). */
export function inferPaperType(r: AiSearchResult): PaperType {
  const t = `${r.paper?.title ?? r.aiTitle ?? ""} ${r.paper?.abstract ?? ""} ${r.snippet ?? ""}`.toLowerCase()
  if (/meta[-\s]?analysis/.test(t)) return "meta-analysis"
  if (/systematic review|scoping review|literature review|\breview\b/.test(t)) return "review"
  if (/randomi[sz]ed controlled trial|\brct\b|clinical trial|phase\s?(i{1,3}|[1-4])\b/.test(t)) return "clinical-trial"
  if (/book chapter|\bchapter\s\d/.test(t)) return "book-chapter"
  return "research"
}

export function countActiveFilters(f: AiResultFilters): number {
  let n = 0
  if (f.sort !== "relevance") n++
  if (f.yearFrom != null) n++
  if (f.yearTo != null) n++
  if (f.minCitations != null) n++
  if (f.types.length > 0) n++
  if (f.journals.length > 0) n++
  if (f.openAccessOnly) n++
  return n
}

/** Distinct journals in the result set, most frequent first — drives the
 *  Journal/Source filter options (grounded in the actual results, not hardcoded). */
export function journalOptions(results: AiSearchResult[]): string[] {
  const counts = new Map<string, number>()
  for (const r of results) {
    const j = r.paper?.journal?.trim()
    if (!j || j.toLowerCase() === "unknown journal") continue
    counts.set(j, (counts.get(j) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([j]) => j)
}

/** Min/max publication year present in the result set (null when none have a
 *  year) — used to ground the year-range inputs in the real data. */
export function yearBounds(results: AiSearchResult[]): { min: number; max: number } | null {
  const years = results.map((r) => r.paper?.year).filter((y): y is number => typeof y === "number" && y > 0)
  if (years.length === 0) return null
  return { min: Math.min(...years), max: Math.max(...years) }
}

/**
 * Filter + sort AI results. Year / citation filters only exclude results that
 * HAVE that metadata and fall out of range — AI-cited results lacking metadata
 * are kept (so a relevant citation is never silently dropped), except the
 * open-access filter which requires a confirmable OA/PDF.
 */
export function applyAiFilters(results: AiSearchResult[], f: AiResultFilters): AiSearchResult[] {
  const filtered = results.filter((r) => {
    const p = r.paper
    const year = p?.year && p.year > 0 ? p.year : null
    if (f.yearFrom != null && year != null && year < f.yearFrom) return false
    if (f.yearTo != null && year != null && year > f.yearTo) return false
    const cites = typeof p?.citedByCount === "number" ? p.citedByCount : null
    if (f.minCitations != null && cites != null && cites < f.minCitations) return false
    // OA-only matches the card badge: *true* open access, not merely "a PDF link
    // exists" (full-text availability ≠ open access).
    if (f.openAccessOnly && !p?.isOpenAccess) return false
    if (f.types.length > 0 && !f.types.includes(inferPaperType(r))) return false
    if (f.journals.length > 0) {
      const j = p?.journal?.trim()
      if (!j || !f.journals.includes(j)) return false
    }
    return true
  })

  const sorted = [...filtered]
  if (f.sort === "cited") {
    sorted.sort((a, b) => (b.paper?.citedByCount ?? -1) - (a.paper?.citedByCount ?? -1))
  } else if (f.sort === "recent") {
    sorted.sort((a, b) => (b.paper?.year ?? 0) - (a.paper?.year ?? 0))
  } else if (f.sort === "openAccess") {
    // Open-access papers first, then preserve AI relevance order within each group
    sorted.sort((a, b) => {
      const aOA = a.paper?.isOpenAccess ? 1 : 0
      const bOA = b.paper?.isOpenAccess ? 1 : 0
      return bOA - aOA
    })
  }
  // "relevance" keeps the AI's citation order.
  return sorted
}
