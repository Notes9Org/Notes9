import type { SearchPaper } from "@/types/paper-search"
import { fuzzyFindExcerpt } from "@/lib/fuzzy-text-match"

/** Normalize a DOI for comparison (lowercase, strip resolver prefix + trailing punctuation). */
export function normalizeDoi(raw: string | null | undefined): string | null {
  if (!raw) return null
  const m = raw.match(/10\.\d{4,9}\/[^\s"'<>]+/i)
  if (!m) return null
  return m[0].toLowerCase().replace(/[.,;]+$/, "")
}

/** Extract a PMID from a value or a PubMed URL. */
export function extractPmid(raw: string | null | undefined): string | null {
  if (!raw) return null
  if (/^\d+$/.test(raw.trim())) return raw.trim()
  const m =
    raw.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/i) ||
    raw.match(/[?&]pmid=(\d+)/i) ||
    raw.match(/\/pubmed\/(\d+)/i)
  return m ? m[1] : null
}

/** Title key for fuzzy comparison: lowercase, alphanumeric-only, collapsed spaces. */
function titleKey(title: string | null | undefined): string {
  return (title ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

function hostPath(url: string): string | null {
  try {
    const u = new URL(url)
    return (u.hostname.replace(/^www\./, "") + u.pathname).replace(/\/+$/, "").toLowerCase()
  } catch {
    return null
  }
}

export interface CitationLike {
  title?: string | null
  url?: string | null
  doi?: string | null
}

/**
 * Stable identity for de-duplicating the SAME paper surfaced from different
 * publishers/aggregators (PubMed vs PMC vs publisher). DOI → PMID → normalized
 * title → URL, so two results for one paper collapse to one card.
 */
export function resultDedupeKey(c: CitationLike): string {
  const doi = normalizeDoi(c.doi) ?? normalizeDoi(c.url)
  if (doi) return `doi:${doi}`
  const pmid = extractPmid(c.url)
  if (pmid) return `pmid:${pmid}`
  const title = (c.title ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  if (title.length >= 12) return `title:${title}`
  return `url:${(c.url ?? '').toLowerCase()}`
}

/** Stable key for an AI result (matched paper identity, else its citation). */
export function aiResultDedupeKey(c: {
  paper?: SearchPaper | null
  title?: string | null
  url?: string | null
}): string {
  if (c.paper) {
    return resultDedupeKey({
      title: c.paper.title,
      url: c.paper.articlePageUrl ?? c.paper.pdfUrl,
      doi: c.paper.doi,
    })
  }
  return resultDedupeKey({ title: c.title ?? null, url: c.url ?? null })
}

/**
 * Match an AI citation to a database paper, returning the paper and how it was
 * matched. Order of confidence: DOI → PMID → near-exact title → URL host+path.
 */
export function matchCitationToPaper(
  citation: CitationLike,
  papers: SearchPaper[],
): { paper: SearchPaper | null; matchKind: "doi" | "pmid" | "title" | "url" | "none" } {
  // 1. DOI — extracted from an explicit doi field or the URL.
  const citDoi = normalizeDoi(citation.doi) ?? normalizeDoi(citation.url)
  if (citDoi) {
    const hit = papers.find((p) => normalizeDoi(p.doi) === citDoi)
    if (hit) return { paper: hit, matchKind: "doi" }
  }

  // 2. PMID — from the URL.
  const citPmid = extractPmid(citation.url)
  if (citPmid) {
    const hit = papers.find((p) => p.pmid && p.pmid.trim() === citPmid)
    if (hit) return { paper: hit, matchKind: "pmid" }
  }

  // 3. Title — near-exact (fuzzy ≥ 0.85) to absorb punctuation/casing drift.
  const citTitle = titleKey(citation.title)
  if (citTitle.length >= 12) {
    let best: { paper: SearchPaper; score: number } | null = null
    for (const p of papers) {
      const pk = titleKey(p.title)
      if (!pk) continue
      if (pk === citTitle) return { paper: p, matchKind: "title" }
      const m = fuzzyFindExcerpt(pk, citTitle, { threshold: 0.85 })
      if (m && (!best || m.score > best.score)) best = { paper: p, score: m.score }
    }
    if (best) return { paper: best.paper, matchKind: "title" }
  }

  // 4. URL host+path.
  const citHp = citation.url ? hostPath(citation.url) : null
  if (citHp) {
    const hit = papers.find((p) => {
      for (const u of [p.articlePageUrl, p.pdfUrl, p.doi ? `https://doi.org/${p.doi}` : null]) {
        if (u && hostPath(u) === citHp) return true
      }
      return false
    })
    if (hit) return { paper: hit, matchKind: "url" }
  }

  return { paper: null, matchKind: "none" }
}

/**
 * Build a minimal SearchPaper from an unmatched AI citation, so Save/Read have
 * something to work with. Metadata is thin; the save pipeline backfills the
 * abstract/PDF where possible.
 */
export function citationToSearchPaper(c: CitationLike & { snippet?: string }): SearchPaper {
  const doi = normalizeDoi(c.doi) ?? normalizeDoi(c.url) ?? undefined
  const pmid = extractPmid(c.url) ?? undefined
  return {
    id: `ai:${doi ?? pmid ?? c.url ?? c.title ?? Math.abs(hashString(c.snippet ?? "")).toString(36)}`,
    title: c.title?.trim() || "Untitled result",
    authors: [],
    year: 0,
    journal: "",
    abstract: c.snippet?.trim() ?? "",
    isOpenAccess: false,
    doi,
    pmid,
    articlePageUrl: c.url ?? undefined,
    source: "OpenAlex",
  }
}

/**
 * Pick an abstract for a citation from a fresh paper-search result list. Prefers
 * a confident match (DOI/PMID/title); when the lookup was by DOI/PMID the top
 * result is the paper, so its abstract is trusted; for a title lookup the top
 * result is accepted only when its title is reasonably close (avoids attaching a
 * wrong abstract). Returns '' when nothing trustworthy is found.
 */
/** Word-overlap (Jaccard) of two title keys — tolerant of word order/extra words. */
function titleOverlap(a: string, b: string): number {
  const wa = new Set(a.split(" ").filter((w) => w.length > 2))
  const wb = new Set(b.split(" ").filter((w) => w.length > 2))
  if (wa.size === 0 || wb.size === 0) return 0
  let inter = 0
  for (const w of wa) if (wb.has(w)) inter++
  return inter / Math.min(wa.size, wb.size)
}

export function pickAbstractFromSearch(
  cite: CitationLike,
  list: SearchPaper[],
  searchedById: boolean,
): string {
  if (!list.length) return ""
  // Prefer a confident match anywhere in the list.
  const { paper } = matchCitationToPaper(cite, list)
  if (paper?.abstract?.trim()) return paper.abstract.trim()
  // Otherwise take the first result that actually has an abstract.
  const withAbstract = list.find((p) => p.abstract?.trim())
  if (!withAbstract?.abstract?.trim()) return ""
  // DOI/PMID lookup → the top hit is the paper, trust it.
  if (searchedById) return withAbstract.abstract.trim()
  // Title lookup: the query WAS the title, so the top hit is almost always the
  // paper. Accept it when titles are similar by fuzzy score OR word overlap, and
  // also when we have no title to compare against.
  const ct = titleKey(cite.title)
  const tt = titleKey(withAbstract.title)
  if (
    ct.length < 8 ||
    !tt ||
    titleOverlap(ct, tt) >= 0.4 ||
    !!fuzzyFindExcerpt(tt, ct, { threshold: 0.45 })
  ) {
    return withAbstract.abstract.trim()
  }
  return ""
}

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return h
}
