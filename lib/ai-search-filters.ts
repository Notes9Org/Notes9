import type { AiSearchResult } from "@/types/ai-search"

export type PaperType =
  | "review"
  | "meta-analysis"
  | "clinical-trial"
  | "research"
  | "book-chapter"
  | "other"

export type AiSortMode = "relevance" | "cited" | "recent"

export interface AiResultFilters {
  sort: AiSortMode
  yearFrom: number | null
  yearTo: number | null
  minCitations: number | null
  types: PaperType[]
  openAccessOnly: boolean
}

export const DEFAULT_AI_FILTERS: AiResultFilters = {
  sort: "relevance",
  yearFrom: null,
  yearTo: null,
  minCitations: null,
  types: [],
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
  if (f.openAccessOnly) n++
  return n
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
    if (f.openAccessOnly && !(p?.isOpenAccess || p?.pdfUrl)) return false
    if (f.types.length > 0 && !f.types.includes(inferPaperType(r))) return false
    return true
  })

  const sorted = [...filtered]
  if (f.sort === "cited") {
    sorted.sort((a, b) => (b.paper?.citedByCount ?? -1) - (a.paper?.citedByCount ?? -1))
  } else if (f.sort === "recent") {
    sorted.sort((a, b) => (b.paper?.year ?? 0) - (a.paper?.year ?? 0))
  }
  // "relevance" keeps the AI's citation order.
  return sorted
}
