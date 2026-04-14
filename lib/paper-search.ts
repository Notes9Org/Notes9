/**
 * Literature search aggregates PubMed, Europe PMC (preprints + non-preprint index), and OpenAlex.
 * - Query variants + synonym / MeSH hints for PubMed (`paper-query-variants`); verbose NL → compact line for OpenAlex/Europe/preprints + PubMed OR-token fallback.
 * - Bounded second OpenAlex pass when PubMed is thin.
 * - Relevance sort: BM25 on title+abstract plus citation and source signals (`paper-search-bm25`); second PubMed pass from DOIs/titles when the first pass is thin.
 * - Europe PMC: journal/year/authors from journalInfo, firstPublicationDate, authorList.
 * - Sort modes: relevance (“best match” — re-ranks the **full merged** pool, no extra cap), recent (year descending), cited.
 * - Queries with recency wording ("recent papers", …) add a publication-year floor in relevance mode.
 *
 * Optional env: `NCBI_API_KEY`, `OPENALEX_CONTACT_EMAIL`, `UNPAYWALL_EMAIL` (Unpaywall — use a real address; see https://unpaywall.org/products/api ).
 * Crossref (no key) adds stable `application/pdf` links only — not ScienceDirect `pdfft` (those URLs require short-lived session tokens).
 * For Elsevier `10.1016/` DOIs we set `articlePageUrl` (PII article page) so "View source" opens the publisher page where PDF download works in-browser.
 */
import type { PaperSearchOptions, PaperSearchSortMode, SearchPaper } from "@/types/paper-search"
import {
  broadPubMedFallbackOrClause,
  buildExpandedPubMedTerm,
  capExpandedPubMedTermEncodedLength,
  expandEuropeFreeTextQuery,
  expandQueryForLexicalScoring,
  generateQueryVariants,
  literatureApiSearchQuery,
} from "@/lib/paper-query-variants"
import { bm25Scores, normalizeScoresMinMax } from "@/lib/paper-search-bm25"
import { citationBoostForSearchRank } from "@/lib/paper-search-citation-boost"

export {
  buildExpandedPubMedTerm,
  broadPubMedFallbackOrClause,
  capExpandedPubMedTermEncodedLength,
  generateQueryVariants,
  literatureApiSearchQuery,
  normalizeAcademicSearchText,
  PUBMED_EXPANDED_TERM_MAX_ENCODED,
  pubMedAuthorHintClause,
} from "@/lib/paper-query-variants"
export { citationBoostForSearchRank } from "@/lib/paper-search-citation-boost"

/** PubMed IDs retrieved per search (efetch follows with same count). */
const PUBMED_RETMAX = 80
/** Europe PMC `pageSize` per request (preprints + indexed). */
const EUROPE_PMC_PAGE = 60
/** OpenAlex `per_page` (max 200). */
const OPENALEX_PER_PAGE = 60
/**
 * When first-pass PubMed returns fewer than this many rows, run follow-up retrieval:
 * optional second OpenAlex query (`variants[1]`), then a second PubMed `esearch` from DOIs/titles found elsewhere.
 * Tune for recall vs latency (typical 12–20).
 */
const PUBMED_SECOND_PASS_THRESHOLD = 14
const MAX_SECOND_PASS_DOIS = 10
const MAX_SECOND_PASS_TITLE_CLAUSES = 4
const TITLE_SNIPPET_LEN = 100
/** Max DOIs to look up per search (Unpaywall); keeps latency predictable. */
const UNPAYWALL_MAX_DOIS = 36
const UNPAYWALL_CONCURRENCY = 6
/** Default years-back when `sort` is `recent` or when the query implies recency. */
const DEFAULT_RECENT_YEAR_WINDOW = 5

const SOURCE_PRIORITY: Record<SearchPaper["source"], number> = {
  PubMed: 100,
  "Europe PMC": 85,
  BioRxiv: 75,
  MedRxiv: 75,
  Preprint: 70,
  OpenAlex: 60,
}

function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function ncbiApiKeyParam(): string {
  const key = process.env.NCBI_API_KEY?.trim()
  return key ? `&api_key=${encodeURIComponent(key)}` : ""
}

function normalizeDoiKey(doi?: string): string | undefined {
  if (!doi) return undefined
  const d = doi
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .trim()
    .toLowerCase()
  return d || undefined
}

function cleanDoiFromPublisher(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const s = String(raw).trim()
  const m = s.match(/10\.\d{4,}\/[\S]+/i)
  if (!m) return undefined
  return m[0].replace(/[.,;:\])]+$/, "")
}

function titleDedupeKey(title: string, year: number): string {
  const t = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  const yPart = year > 1900 && year <= 2100 ? String(year) : "na"
  return `${yPart}|${t}`
}

function dedupeKeyForPaper(p: SearchPaper): string {
  if (p.pmid) return `pmid:${p.pmid}`
  const dk = normalizeDoiKey(p.doi)
  if (dk) return `doi:${dk}`
  return `title:${titleDedupeKey(p.title, p.year)}`
}

function stablePublicId(p: SearchPaper): string {
  if (p.pmid) return p.pmid
  const dk = normalizeDoiKey(p.doi)
  if (dk) return dk
  return p.id
}

function mergePaperRows(a: SearchPaper, b: SearchPaper): SearchPaper {
  const pa = SOURCE_PRIORITY[a.source] ?? 0
  const pb = SOURCE_PRIORITY[b.source] ?? 0
  const primary = pa >= pb ? a : b
  const secondary = pa >= pb ? b : a
  const merged: SearchPaper = {
    ...primary,
    id: stablePublicId({
      ...primary,
      pmid: primary.pmid || secondary.pmid,
      doi: primary.doi || secondary.doi,
    }),
    pmid: primary.pmid || secondary.pmid,
    doi: cleanDoiFromPublisher(primary.doi || secondary.doi),
    pdfUrl: primary.pdfUrl || secondary.pdfUrl,
    articlePageUrl: primary.articlePageUrl || secondary.articlePageUrl,
    abstract:
      primary.abstract.length >= secondary.abstract.length &&
      primary.abstract !== "No abstract available."
        ? primary.abstract
        : secondary.abstract !== "No abstract available."
          ? secondary.abstract
          : primary.abstract,
    authors:
      primary.authors[0] !== "Unknown Author" ? primary.authors : secondary.authors,
    isOpenAccess: primary.isOpenAccess || secondary.isOpenAccess,
    journal:
      primary.journal && primary.journal !== "Unknown Journal"
        ? primary.journal
        : secondary.journal,
    citedByCount: Math.max(primary.citedByCount ?? 0, secondary.citedByCount ?? 0) || undefined,
  }
  merged.id = stablePublicId(merged)
  return merged
}

/**
 * Merge batches in order. Later duplicates enrich earlier rows.
 * Deduplication: same PMID, same normalized DOI, or same title+year fingerprint (`dedupeKeyForPaper`).
 */
function mergeOrderedBatches(batches: SearchPaper[][]): SearchPaper[] {
  const map = new Map<string, SearchPaper>()
  const order: string[] = []
  for (const batch of batches) {
    for (const p of batch) {
      const k = dedupeKeyForPaper(p)
      if (!map.has(k)) {
        map.set(k, p)
        order.push(k)
      } else {
        map.set(k, mergePaperRows(map.get(k)!, p))
      }
    }
  }
  return order.map((k) => map.get(k)!)
}

/** Append-first batch merge: keeps order of `base`, appends new keys from `extra`. */
function mergeFlatFollowedByBatch(base: SearchPaper[], extra: SearchPaper[]): SearchPaper[] {
  return mergeOrderedBatches([base, extra])
}

/**
 * Publication-year floor from natural-language recency (used in relevance mode).
 */
export function inferPublicationYearFloor(userQuery: string): number | null {
  const q = userQuery.trim()
  if (!q) return null
  const lower = q.toLowerCase()
  if (/\[\s*dp\s*\]/i.test(q)) return null

  const cy = new Date().getFullYear()
  const lastNyears = lower.match(/\b(?:last|past)\s+(\d{1,2})\s+years?\b/)
  if (lastNyears) {
    const n = parseInt(lastNyears[1], 10)
    if (!Number.isNaN(n) && n > 0) {
      return Math.max(1900, cy - Math.min(n, 50))
    }
  }
  if (/\bthis year\b/.test(lower)) return cy
  if (/\blast year\b/.test(lower)) return cy - 1

  const recencyIntent =
    /\b(recent|recently)\b/.test(lower) ||
    /\b(?:latest|newest|upcoming)\b/.test(lower) ||
    /\bnew\s+papers?\b/.test(lower) ||
    /\bcurrent\s+papers?\b/.test(lower) ||
    /\bcutting[- ]edge\b/.test(lower) ||
    /\bstate\s+of\s+the\s+art\b/.test(lower)

  if (recencyIntent) return Math.max(1900, cy - DEFAULT_RECENT_YEAR_WINDOW)
  return null
}

function clampRecentYears(n: number | undefined): number {
  const y = n ?? DEFAULT_RECENT_YEAR_WINDOW
  return Math.min(30, Math.max(1, Math.floor(y)))
}

function appendPubMedDateFilter(term: string, yearFloor: number | null): string {
  if (yearFloor == null || !term.trim()) return term
  const cy = new Date().getFullYear()
  return `(${term}) AND (${yearFloor}:${cy}[dp])`
}

function appendEuropePmcYearFilter(innerQuery: string, yearFloor: number | null): string {
  if (yearFloor == null) return innerQuery
  const cy = new Date().getFullYear()
  return `${innerQuery} AND PUB_YEAR:[${yearFloor} TO ${cy}]`
}

function resolveYearFloorForSearch(
  trimmed: string,
  sort: PaperSearchSortMode,
  recentYears: number,
): number | null {
  if (sort === "recent") {
    const cy = new Date().getFullYear()
    return Math.max(1900, cy - clampRecentYears(recentYears))
  }
  if (sort === "cited") return null
  return inferPublicationYearFloor(trimmed)
}

function escapePubMedPhrase(text: string): string {
  return text
    .replace(/[^\w\s\-.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, TITLE_SNIPPET_LEN)
}

function collectPmids(papers: SearchPaper[]): Set<string> {
  const s = new Set<string>()
  for (const p of papers) {
    if (p.pmid) s.add(p.pmid)
  }
  return s
}

/**
 * Second PubMed pass: OR together DOI clauses, else short title[tiab] clauses from discovery sources.
 */
function buildSecondPassPubMedTerm(candidates: SearchPaper[], existingPmids: Set<string>): string | null {
  const dois = new Set<string>()
  for (const p of candidates) {
    const d = normalizeDoiKey(p.doi)
    if (d) dois.add(d)
  }
  const doiList = [...dois].slice(0, MAX_SECOND_PASS_DOIS)
  if (doiList.length > 0) {
    return doiList.map((d) => `${d}[doi]`).join(" OR ")
  }

  const titles: string[] = []
  for (const p of candidates) {
    if (p.pmid && existingPmids.has(p.pmid)) continue
    const snippet = escapePubMedPhrase(p.title)
    if (snippet.length >= 20 && !titles.includes(snippet)) titles.push(snippet)
    if (titles.length >= MAX_SECOND_PASS_TITLE_CLAUSES) break
  }
  if (titles.length === 0) return null
  return titles.map((t) => `${t}[tiab]`).join(" OR ")
}

const RECENCY_TOKEN_CHAFF = new Set([
  "recent",
  "recently",
  "latest",
  "newest",
  "papers",
  "paper",
  "upcoming",
])

/** Extract significant tokens + light synonym injection for scoring. */
function buildRelevanceTokens(raw: string, omitRecencyChaff: boolean): Set<string> {
  let s = raw.toLowerCase()
  s = s.replace(/\basos?\b/g, "aso antisense oligonucleotide oligonucleotide")
  s = s.replace(/\bantisense\b/g, "antisense oligonucleotide")
  s = s.replace(/\begfr\b/g, "egfr epidermal growth factor receptor")
  s = s.replace(/\buptake\b/g, "uptake uptake internalization")
  const parts = s.split(/[^a-z0-9]+/).filter((t) => t.length > 1)
  const filtered = omitRecencyChaff ? parts.filter((t) => !RECENCY_TOKEN_CHAFF.has(t)) : parts
  return new Set(filtered)
}

function relevanceScore(
  paper: SearchPaper,
  tokens: Set<string>,
  rawLower: string,
  omitRecencyChaff: boolean,
): number {
  const blob = `${paper.title} ${paper.abstract} ${paper.journal}`.toLowerCase()
  let score = 0
  for (const t of tokens) {
    if (t.length < 2) continue
    if (blob.includes(t)) score += 2
  }
  let bigramSource = rawLower
  if (omitRecencyChaff) {
    bigramSource = rawLower
      .replace(/\brecent(?:ly)?\b/g, " ")
      .replace(/\b(?:latest|newest|upcoming)\b/g, " ")
      .replace(/\bnew\s+papers?\b/g, " ")
      .replace(/\bcurrent\s+papers?\b/g, " ")
      .replace(/\bpapers?\b/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  }
  const words = bigramSource.split(/[^a-z0-9]+/).filter((w) => w.length > 2)
  for (let i = 0; i < words.length - 1; i++) {
    const bigram = `${words[i]} ${words[i + 1]}`
    if (blob.includes(bigram)) score += 4
  }
  if (paper.source === "PubMed") score += 3
  if (paper.pmid) score += 1
  if (paper.abstract && paper.abstract !== "No abstract available.") score += 1
  return score
}

function firstHttpUrl(...candidates: Array<string | null | undefined>): string | undefined {
  for (const c of candidates) {
    if (typeof c === "string" && /^https?:\/\//i.test(c.trim())) return c.trim()
  }
  return undefined
}

type UnpaywallOaLoc = {
  url_for_pdf?: string | null
  url?: string | null
}

function extractPdfFromUnpaywallPayload(data: {
  is_oa?: boolean
  best_oa_location?: UnpaywallOaLoc | null
  oa_locations?: UnpaywallOaLoc[]
}): string | undefined {
  const best = data.best_oa_location
  let pdf = firstHttpUrl(best?.url_for_pdf ?? undefined)
  if (!pdf && best?.url && /\.pdf(\?|#|$)/i.test(String(best.url))) {
    pdf = String(best.url).trim()
  }
  if (pdf) return pdf
  for (const loc of data.oa_locations ?? []) {
    pdf = firstHttpUrl(loc.url_for_pdf ?? undefined)
    if (!pdf && loc.url && /\.pdf(\?|#|$)/i.test(String(loc.url))) {
      pdf = String(loc.url).trim()
    }
    if (pdf) return pdf
  }
  return undefined
}

/**
 * Unpaywall — requires real `UNPAYWALL_EMAIL` (Unpaywall rejects placeholder emails).
 */
async function enrichPapersPdfFromUnpaywall(papers: SearchPaper[]): Promise<SearchPaper[]> {
  const email = process.env.UNPAYWALL_EMAIL?.trim()
  if (!email) return papers

  const allDois: string[] = []
  for (const p of papers) {
    const d = normalizeDoiKey(p.doi)
    if (d && !p.pdfUrl) allDois.push(d)
  }
  const unique = [...new Set(allDois)].slice(0, UNPAYWALL_MAX_DOIS)
  if (unique.length === 0) return papers

  const pdfByDoi = new Map<string, string>()
  const oaByDoi = new Map<string, boolean>()

  for (let i = 0; i < unique.length; i += UNPAYWALL_CONCURRENCY) {
    const chunk = unique.slice(i, i + UNPAYWALL_CONCURRENCY)
    await Promise.all(
      chunk.map(async (doi) => {
        try {
          const apiUrl = `https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=${encodeURIComponent(email)}`
          const res = await fetch(apiUrl)
          if (!res.ok) return
          const raw = (await res.json()) as { error?: boolean; message?: string }
          if (raw.error === true) return
          const data = raw as {
            is_oa?: boolean
            best_oa_location?: UnpaywallOaLoc | null
            oa_locations?: UnpaywallOaLoc[]
          }
          if (data.is_oa) oaByDoi.set(doi.toLowerCase(), true)
          const pdf = extractPdfFromUnpaywallPayload(data)
          if (pdf) pdfByDoi.set(doi.toLowerCase(), pdf)
        } catch {
          /* ignore per-DOI failures */
        }
      }),
    )
  }

  return papers.map((p) => {
    const d = normalizeDoiKey(p.doi)
    if (!d || p.pdfUrl) return p
    const pdf = pdfByDoi.get(d.toLowerCase())
    if (!pdf) return p
    return {
      ...p,
      pdfUrl: pdf,
      isOpenAccess: p.isOpenAccess || Boolean(oaByDoi.get(d.toLowerCase())),
    }
  })
}

/**
 * Crossref: stable `application/pdf` URLs only; Elsevier `10.1016/` + PII → public **article** page (not pdfft —
 * pdfft links need per-session Cloudflare/publisher tokens and break when copied or fetched server-side).
 */
async function fetchCrossrefEnrichment(doi: string): Promise<{
  pdfUrl?: string
  articlePageUrl?: string
}> {
  const norm = normalizeDoiKey(doi)
  if (!norm) return {}
  try {
    const mail =
      process.env.UNPAYWALL_EMAIL?.trim() || process.env.OPENALEX_CONTACT_EMAIL?.trim()
    const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(norm)}`, {
      headers: {
        Accept: "application/json",
        ...(mail ? { "User-Agent": `Notes9/1.0 (mailto:${mail})` } : {}),
      },
    })
    if (!res.ok) return {}
    const json = (await res.json()) as {
      message?: {
        link?: Array<{ URL?: string; "content-type"?: string }>
        "alternative-id"?: string[]
      }
    }
    const m = json.message
    if (!m) return {}
    let pdfUrl: string | undefined
    for (const link of m.link ?? []) {
      const ct = (link["content-type"] || "").toLowerCase()
      if (ct.includes("pdf") && link.URL) {
        const u = firstHttpUrl(link.URL)
        if (u) {
          pdfUrl = u
          break
        }
      }
    }
    const pii = (m["alternative-id"] ?? []).find(
      (id) => typeof id === "string" && /^S\d{5,}$/i.test(id),
    )
    let articlePageUrl: string | undefined
    if (pii && norm.startsWith("10.1016/")) {
      articlePageUrl = `https://www.sciencedirect.com/science/article/pii/${encodeURIComponent(pii)}`
    }
    return { pdfUrl, articlePageUrl }
  } catch {
    return {}
  }
}

async function enrichPapersFromCrossref(papers: SearchPaper[]): Promise<SearchPaper[]> {
  const allDois: string[] = []
  for (const p of papers) {
    const d = normalizeDoiKey(p.doi)
    if (!d) continue
    if (!p.pdfUrl || !p.articlePageUrl) allDois.push(d)
  }
  const unique = [...new Set(allDois)].slice(0, UNPAYWALL_MAX_DOIS)
  if (unique.length === 0) return papers

  const pdfByDoi = new Map<string, string>()
  const pageByDoi = new Map<string, string>()

  for (let i = 0; i < unique.length; i += UNPAYWALL_CONCURRENCY) {
    const chunk = unique.slice(i, i + UNPAYWALL_CONCURRENCY)
    await Promise.all(
      chunk.map(async (doi) => {
        const { pdfUrl, articlePageUrl } = await fetchCrossrefEnrichment(doi)
        if (pdfUrl) pdfByDoi.set(doi.toLowerCase(), pdfUrl)
        if (articlePageUrl) pageByDoi.set(doi.toLowerCase(), articlePageUrl)
      }),
    )
  }

  return papers.map((p) => {
    const d = normalizeDoiKey(p.doi)
    if (!d) return p
    const key = d.toLowerCase()
    const pdf = !p.pdfUrl ? pdfByDoi.get(key) : undefined
    const page = !p.articlePageUrl ? pageByDoi.get(key) : undefined
    if (!pdf && !page) return p
    return {
      ...p,
      ...(pdf ? { pdfUrl: pdf } : {}),
      ...(page ? { articlePageUrl: page } : {}),
    }
  })
}

async function enrichPapersMissingPdf(papers: SearchPaper[]): Promise<SearchPaper[]> {
  const afterUw = await enrichPapersPdfFromUnpaywall(papers)
  return enrichPapersFromCrossref(afterUw)
}

function rerankByRelevance(
  papers: SearchPaper[],
  originalQuery: string,
  yearFloor: number | null,
): SearchPaper[] {
  const lexQuery = expandQueryForLexicalScoring(originalQuery)
  const docs = papers.map((p) => `${p.title} ${p.abstract}`)
  const bm25Raw = bm25Scores(docs, lexQuery)
  const bm25Norm = normalizeScoresMinMax(bm25Raw)
  const cy = new Date().getFullYear()
  const maxPriority = 100
  const scored = papers.map((p, idx) => {
    let s = (bm25Norm[idx] ?? 0) * 58
    s += citationBoostForSearchRank(p.citedByCount)
    s += ((SOURCE_PRIORITY[p.source] ?? 60) / maxPriority) * 14
    if (p.abstract && p.abstract !== "No abstract available.") s += 2
    if (p.pmid) s += 1

    if (yearFloor != null) {
      const y = p.year
      if (y >= yearFloor && y <= cy) {
        s += Math.min(24, (y - yearFloor + 1) * 0.35)
      } else if (y < yearFloor) {
        s -= 35
      }
    }
    return { p, s, idx }
  })
  scored.sort((a, b) => {
    if (b.s !== a.s) return b.s - a.s
    if (yearFloor != null && b.p.year !== a.p.year) return b.p.year - a.p.year
    return a.idx - b.idx
  })
  return scored.map((x) => x.p)
}

/** Newest first: order by publication year only (desc), then stable tie-break. Unknown/bad years sink to the bottom. */
function rerankByRecent(
  papers: SearchPaper[],
  _originalQuery: string,
  yearFloor: number | null,
): SearchPaper[] {
  const cy = new Date().getFullYear()
  const withMeta = papers.map((p, idx) => {
    const y = p.year
    const valid = y >= 1900 && y <= cy + 1
    const sortYear = valid ? y : 0
    const inFloor = yearFloor == null || (valid && y >= yearFloor && y <= cy)
    return { p, idx, sortYear, inFloor }
  })
  withMeta.sort((a, b) => {
    if (yearFloor != null && a.inFloor !== b.inFloor) return a.inFloor ? -1 : 1
    if (b.sortYear !== a.sortYear) return b.sortYear - a.sortYear
    return a.p.title.localeCompare(b.p.title)
  })
  return withMeta.map((x) => x.p)
}

function rerankByCitations(papers: SearchPaper[], originalQuery: string): SearchPaper[] {
  const rawLower = originalQuery.trim().toLowerCase()
  const tokens = buildRelevanceTokens(originalQuery, false)
  const scored = papers.map((p, idx) => {
    const cites = p.citedByCount ?? 0
    const rel = relevanceScore(p, tokens, rawLower, false)
    return { p, cites, rel, y: p.year, idx }
  })
  scored.sort((a, b) => {
    if (b.cites !== a.cites) return b.cites - a.cites
    if (b.y !== a.y) return b.y - a.y
    if (b.rel !== a.rel) return b.rel - a.rel
    return a.idx - b.idx
  })
  return scored.map((x) => x.p)
}

function applyResultOrdering(
  papers: SearchPaper[],
  originalQuery: string,
  sort: PaperSearchSortMode,
  yearFloor: number | null,
): SearchPaper[] {
  if (sort === "recent") return rerankByRecent(papers, originalQuery, yearFloor)
  if (sort === "cited") return rerankByCitations(papers, originalQuery)
  return rerankByRelevance(papers, originalQuery, yearFloor)
}

async function fetchPubMedByTerm(
  term: string,
  opts?: { esearchSort?: "relevance" | "pub_date" },
): Promise<SearchPaper[]> {
  if (!term.trim()) return []
  try {
    const keyParam = ncbiApiKeyParam()
    const sort = opts?.esearchSort === "pub_date" ? "pub_date" : "relevance"
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(
      term,
    )}&retmode=json&retmax=${PUBMED_RETMAX}&sort=${encodeURIComponent(sort)}${keyParam}`

    const searchRes = await fetch(searchUrl)
    const searchData = await searchRes.json()

    const ids = searchData.esearchresult?.idlist || []
    if (ids.length === 0) return []

    const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${ids.join(
      ",",
    )}&retmode=xml${keyParam}`

    const fetchRes = await fetch(fetchUrl)
    const textData = await fetchRes.text()

    const papers: SearchPaper[] = []
    const articleMatches = textData.match(/<PubmedArticle>[\s\S]*?<\/PubmedArticle>/g) || []

    for (let i = 0; i < articleMatches.length; i++) {
      const article = articleMatches[i]

      const titleMatch = article.match(/<ArticleTitle>(.*?)<\/ArticleTitle>/)
      const title = titleMatch
        ? decodeXml(titleMatch[1].replace(/<[^>]*>/g, ""))
        : "Untitled Paper"

      const abstractBlocks = article.match(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g) || []
      let abstract = "No abstract available."
      if (abstractBlocks.length > 0) {
        abstract = abstractBlocks
          .map((block) => {
            const inner = block.replace(/^<AbstractText[^>]*>/, "").replace(/<\/AbstractText>$/, "")
            return decodeXml(inner.replace(/<[^>]*>/g, " "))
          })
          .join(" ")
          .replace(/\s+/g, " ")
          .trim()
      }

      const doiMatch = article.match(/<ArticleId IdType="doi">(.*?)<\/ArticleId>/)
      const doi = doiMatch ? cleanDoiFromPublisher(doiMatch[1]) : undefined
      const pmcidMatch = article.match(/<ArticleId IdType="pmc">(PMC\d+)<\/ArticleId>/i)
      const pmcid = pmcidMatch ? pmcidMatch[1] : undefined

      const pmidMatch = article.match(/<PMID[^>]*>(.*?)<\/PMID>/)
      const pmid = pmidMatch ? pmidMatch[1] : undefined

      const authors: string[] = []
      const authorMatches = article.match(/<Author[^>]*>[\s\S]*?<\/Author>/g) || []

      for (const authorXml of authorMatches.slice(0, 5)) {
        const lastNameMatch = authorXml.match(/<LastName>(.*?)<\/LastName>/)
        const initialsMatch = authorXml.match(/<Initials>(.*?)<\/Initials>/)

        if (lastNameMatch) {
          const lastName = lastNameMatch[1]
          const initials = initialsMatch ? initialsMatch[1] : ""
          authors.push(`${lastName} ${initials}`.trim())
        }
      }

      const journalMatch =
        article.match(/<Title>(.*?)<\/Title>/) ||
        article.match(/<ISOAbbreviation>(.*?)<\/ISOAbbreviation>/)
      const journal = journalMatch ? journalMatch[1] : "Unknown Journal"

      let year = 1900
      const yearTag = article.match(/<PubDate>[\s\S]*?<Year>(\d{4})<\/Year>/)
      if (yearTag) {
        year = parseInt(yearTag[1], 10)
      } else {
        const medlineYear = article.match(/<MedlineDate>(\d{4})/)
        if (medlineYear) year = parseInt(medlineYear[1], 10)
      }

      papers.push({
        id: pmid || `pubmed-${i}`,
        title,
        abstract,
        authors: authors.length > 0 ? authors : ["Unknown Author"],
        year,
        journal,
        doi,
        pmid,
        pdfUrl: pmcid ? `https://pmc.ncbi.nlm.nih.gov/articles/${pmcid}/pdf/` : undefined,
        isOpenAccess: Boolean(pmcid),
        source: "PubMed",
      })
    }

    return papers
  } catch (error) {
    console.error("PubMed API Error:", error)
    return []
  }
}

export async function searchPubMed(query: string): Promise<SearchPaper[]> {
  return fetchPubMedByTerm(buildExpandedPubMedTerm(query))
}

function extractYearEuropePmc(art: Record<string, unknown>): number | null {
  const py = art.pubYear
  if (py !== undefined && py !== null && String(py).trim()) {
    const y = parseInt(String(py), 10)
    if (!Number.isNaN(y) && y >= 1900 && y <= 2100) return y
  }
  const fpd = art.firstPublicationDate as string | undefined
  if (fpd) {
    const m = String(fpd).match(/^(\d{4})/)
    if (m) {
      const y = parseInt(m[1], 10)
      if (!Number.isNaN(y) && y >= 1900 && y <= 2100) return y
    }
  }
  const epub = art.epubDate as string | undefined
  if (epub) {
    const m = String(epub).match(/^(\d{4})/)
    if (m) {
      const y = parseInt(m[1], 10)
      if (!Number.isNaN(y) && y >= 1900 && y <= 2100) return y
    }
  }
  return null
}

function extractJournalEuropePmc(art: Record<string, unknown>): string {
  const jt = art.journalTitle as string | undefined
  if (jt?.trim()) return jt.trim()

  const ji = art.journalInfo as
    | {
        journalTitle?: string
        medAbbreviation?: string
        journal?: { title?: string; medAbbr?: string }
      }
    | undefined
  if (ji?.journalTitle?.trim()) return ji.journalTitle.trim()
  if (ji?.medAbbreviation?.trim()) return ji.medAbbreviation.trim()
  if (ji?.journal?.title?.trim()) return ji.journal.title.trim()
  if (ji?.journal?.medAbbr?.trim()) return ji.journal.medAbbr.trim()

  const br = art.bookOrReportDetails as { publisher?: string; bookTitle?: string } | undefined
  if (br?.bookTitle?.trim()) return br.bookTitle.trim()
  if (br?.publisher?.trim()) return br.publisher.trim()

  return "Unknown Journal"
}

function extractAuthorsEuropePmc(art: Record<string, unknown>): string[] {
  const as = art.authorString as string | undefined
  if (as?.trim()) {
    return as
      .split(/[;,]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 5)
  }

  const al = art.authorList as { author?: unknown } | undefined
  const raw = al?.author
  const arr = Array.isArray(raw) ? raw : raw != null ? [raw] : []

  const out: string[] = []
  for (const item of arr.slice(0, 5)) {
    if (typeof item === "string") {
      if (item.trim()) out.push(item.trim())
      continue
    }
    if (item && typeof item === "object") {
      const x = item as Record<string, string | undefined>
      const fn = x.firstName || x.givenName
      const ln = x.lastName || x.familyName || x.fullName
      const collective = x.collectiveName
      const name = [fn, ln].filter(Boolean).join(" ").trim() || (collective?.trim() ?? "")
      if (name) out.push(name)
    }
  }

  return out.length ? out : ["Unknown Author"]
}

function mapEuropePmcArticle(
  art: Record<string, unknown>,
  sourceLabel: SearchPaper["source"],
): SearchPaper | null {
  const title = (art.title as string) || "Untitled"
  const abstract = (art.abstractText as string) || "No abstract available."
  const rawDoi = art.doi as string | undefined
  const doi = rawDoi ? cleanDoiFromPublisher(rawDoi) : undefined

  const y = extractYearEuropePmc(art)
  const year = y ?? 1900

  const journalTitle = extractJournalEuropePmc(art)
  const src = String(art.source || "").toUpperCase()
  const pmidRaw = art.pmid as string | number | undefined
  const idField = String(art.id || "")
  const pmid =
    pmidRaw !== undefined && pmidRaw !== null && String(pmidRaw).trim()
      ? String(pmidRaw).replace(/\D/g, "")
      : src === "MED" && /^\d+$/.test(idField)
        ? idField
        : undefined

  const authors = extractAuthorsEuropePmc(art)

  const fullTextUrlList = art.fullTextUrlList as
    | { fullTextUrl?: Array<{ documentStyle?: string; url?: string }> }
    | undefined
  const pdfUrl =
    fullTextUrlList?.fullTextUrl?.find(
      (entry) => String(entry.documentStyle || "").toLowerCase() === "pdf",
    )?.url || (art.fullTextUrl as string | undefined)

  const isOpenAccess =
    Boolean(art.isOpenAccess === "Y" || art.isOpenAccess === true) ||
    Boolean(art.inEPMC === "Y" || art.inEPMC === true) ||
    Boolean(art.hasPDF === "Y" || art.hasPDF === true)

  let preprintSource = sourceLabel
  if (sourceLabel === "Preprint") {
    const j = journalTitle.toLowerCase()
    if (j.includes("biorxiv")) preprintSource = "BioRxiv"
    else if (j.includes("medrxiv")) preprintSource = "MedRxiv"
  }

  const id = pmid || (doi ? `epmc-${doi}` : idField || `epmc-${title.slice(0, 24)}`)

  const citeRaw = art.citedByCount as number | string | undefined
  let citedByCount: number | undefined
  if (citeRaw !== undefined && citeRaw !== null) {
    const n = typeof citeRaw === "number" ? citeRaw : parseInt(String(citeRaw), 10)
    if (!Number.isNaN(n) && n > 0) citedByCount = n
  }

  return {
    id,
    title,
    abstract,
    authors,
    year,
    journal: journalTitle,
    doi,
    pmid,
    pdfUrl,
    isOpenAccess,
    source: preprintSource,
    ...(citedByCount ? { citedByCount } : {}),
  }
}

/** Preprints only (BioRxiv, MedRxiv, etc.) */
export async function searchPreprints(
  query: string,
  yearFloor: number | null = null,
): Promise<SearchPaper[]> {
  try {
    const expanded = expandEuropeFreeTextQuery(query)
    const q = appendEuropePmcYearFilter(`${expanded} AND (SRC:PPR)`, yearFloor)
    const searchUrl = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(
      q,
    )}&format=json&pageSize=${EUROPE_PMC_PAGE}&resultType=core`

    const response = await fetch(searchUrl)
    const data = await response.json()

    const papers: SearchPaper[] = []
    const articles = data.resultList?.result || []

    for (const art of articles) {
      const row = mapEuropePmcArticle(art as Record<string, unknown>, "Preprint")
      if (row) papers.push(row)
    }

    return papers
  } catch (error) {
    console.error("Europe PMC preprints error:", error)
    return []
  }
}

/** Journals and PMC-indexed literature (excludes preprint server slice). */
export async function searchEuropePMCIndexed(
  query: string,
  yearFloor: number | null = null,
): Promise<SearchPaper[]> {
  try {
    const expanded = expandEuropeFreeTextQuery(query)
    const q = appendEuropePmcYearFilter(`(${expanded}) NOT (SRC:PPR)`, yearFloor)
    const searchUrl = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(
      q,
    )}&format=json&pageSize=${EUROPE_PMC_PAGE}&resultType=core`

    const response = await fetch(searchUrl)
    const data = await response.json()

    const papers: SearchPaper[] = []
    const articles = data.resultList?.result || []

    for (const art of articles) {
      const row = mapEuropePmcArticle(art as Record<string, unknown>, "Europe PMC")
      if (row) {
        row.source = "Europe PMC"
        papers.push(row)
      }
    }

    return papers
  } catch (error) {
    console.error("Europe PMC indexed error:", error)
    return []
  }
}

function abstractFromOpenAlexInverted(inv: Record<string, number[]> | undefined): string {
  if (!inv || typeof inv !== "object") return "No abstract available."
  let maxPos = 0
  for (const positions of Object.values(inv)) {
    for (const pos of positions) maxPos = Math.max(maxPos, pos)
  }
  const arr: string[] = new Array(maxPos + 1).fill("")
  for (const [word, positions] of Object.entries(inv)) {
    for (const pos of positions) {
      arr[pos] = word
    }
  }
  const text = arr.join(" ").replace(/\s+/g, " ").trim()
  return text || "No abstract available."
}

function pmidFromOpenAlex(ids: { pmid?: string } | undefined): string | undefined {
  if (!ids?.pmid) return undefined
  const s = String(ids.pmid)
  const m = s.match(/(\d{5,})\s*$/)
  return m ? m[1] : undefined
}

function yearFromOpenAlex(work: Record<string, unknown>): number {
  const py = work.publication_year as number | null | undefined
  if (py != null && py >= 1900 && py <= 2100) return py
  const pd = work.publication_date as string | undefined
  if (pd) {
    const m = String(pd).match(/^(\d{4})/)
    if (m) {
      const y = parseInt(m[1], 10)
      if (!Number.isNaN(y)) return y
    }
  }
  return 1900
}

export async function searchOpenAlex(
  query: string,
  opts?: { yearFloor?: number | null; primarySort?: "relevance" | "cited_by_count" },
): Promise<SearchPaper[]> {
  try {
    const trimmed = query.trim()
    if (!trimmed) return []

    const mail = process.env.OPENALEX_CONTACT_EMAIL?.trim()
    const userAgent = mail
      ? `Notes9/1.0 (mailto:${mail})`
      : "Notes9/1.0 (https://openalex.org; literature search)"

    const cy = new Date().getFullYear()
    const params = new URLSearchParams()
    params.set("search", trimmed)
    params.set("per_page", String(OPENALEX_PER_PAGE))
    const yearFloor = opts?.yearFloor ?? null
    if (yearFloor != null) {
      params.set("filter", `publication_year:${yearFloor}-${cy}`)
    }
    if (opts?.primarySort === "cited_by_count") {
      params.set("sort", "cited_by_count:desc")
    }

    const url = `https://api.openalex.org/works?${params.toString()}`

    const response = await fetch(url, { headers: { "User-Agent": userAgent } })
    if (!response.ok) {
      console.error("OpenAlex HTTP", response.status)
      return []
    }

    const data = await response.json()
    const results = data.results || []
    const papers: SearchPaper[] = []

    for (const work of results) {
      const w = work as Record<string, unknown>
      const title = (w.display_name as string) || "Untitled"
      const year = yearFromOpenAlex(w)
      const rawCites = w.cited_by_count as number | null | undefined
      const citedByCount =
        typeof rawCites === "number" && rawCites > 0 ? rawCites : undefined
      const ids = w.ids as { doi?: string; pmid?: string } | undefined
      const doi = cleanDoiFromPublisher(ids?.doi)
      const pmid = pmidFromOpenAlex(ids)

      const inv = w.abstract_inverted_index as Record<string, number[]> | undefined
      let abstract = abstractFromOpenAlexInverted(inv)
      if (abstract === "No abstract available." && typeof w.abstract === "string") {
        abstract = w.abstract
      }

      const authorships = w.authorships as Array<{ author?: { display_name?: string } }> | undefined
      const authors =
        authorships
          ?.map((a) => a.author?.display_name)
          .filter(Boolean)
          .slice(0, 5) as string[]
      const authorList = authors?.length ? authors : ["Unknown Author"]

      const primary = w.primary_location as {
        source?: { display_name?: string }
        pdf_url?: string | null
        landing_page_url?: string | null
      } | undefined
      const journal = primary?.source?.display_name || "Unknown Journal"

      const oa = w.open_access as { is_oa?: boolean; oa_url?: string | null } | undefined
      const best = w.best_oa_location as {
        url_for_pdf?: string | null
        pdf_url?: string | null
      } | undefined
      const pdfUrl = firstHttpUrl(
        best?.url_for_pdf,
        best?.pdf_url,
        primary?.pdf_url,
      )

      const openAlexId = String(w.id || "")
      const shortId = openAlexId.split("/").pop() || `oa-${papers.length}`

      papers.push({
        id: pmid || doi || shortId,
        title,
        abstract,
        authors: authorList,
        year,
        journal,
        doi,
        pmid,
        pdfUrl,
        isOpenAccess: Boolean(oa?.is_oa),
        source: "OpenAlex",
        ...(citedByCount != null ? { citedByCount } : {}),
      })
    }

    return papers
  } catch (error) {
    console.error("OpenAlex error:", error)
    return []
  }
}

function normalizePaperSearchOptions(options: PaperSearchOptions | undefined): {
  sort: PaperSearchSortMode
  recentYears: number
  openAccessOnly: boolean
} {
  const sort = options?.sort === "recent" || options?.sort === "cited" ? options.sort : "relevance"
  return {
    sort,
    recentYears: clampRecentYears(options?.recentYears),
    openAccessOnly: Boolean(options?.openAccessOnly),
  }
}

export type PaperSearchPipelineMeta = {
  /** Keyword line sent to OpenAlex / Europe PMC / preprints (NL questions use a compact form). */
  apiSearchQuery: string
  /** PubMed `term` included a leading token-OR group for verbose / question-style queries. */
  pubMedBroadOrUsed: boolean
  pubmedFirstPassHits: number
  /** `encodeURIComponent(pubMedTerm)` length after expansion + date filter (actual esearch URL is longer). */
  pubMedTermEncodedLength: number
  pubMedTermClipped: boolean
  /** True when a second OpenAlex query was issued (PubMed thin + alternate variant exists). */
  secondPassOpenAlexAttempted: boolean
  /** True when the second OpenAlex call returned at least one work and was merged. */
  secondPassOpenAlexMerged: boolean
  /** True when DOI/title second PubMed `esearch` ran and returned rows. */
  secondPassPubMedRan: boolean
}

const emptyPipelineMeta = (): PaperSearchPipelineMeta => ({
  apiSearchQuery: "",
  pubMedBroadOrUsed: false,
  pubmedFirstPassHits: 0,
  pubMedTermEncodedLength: 0,
  pubMedTermClipped: false,
  secondPassOpenAlexAttempted: false,
  secondPassOpenAlexMerged: false,
  secondPassPubMedRan: false,
})

/**
 * Full pipeline with `variants` plus `pipeline` stats for debugging / observability (`?debug=1` on the API route).
 */
export async function searchPapersWithMeta(
  query: string,
  options: PaperSearchOptions = {},
): Promise<{ papers: SearchPaper[]; variants: string[]; pipeline: PaperSearchPipelineMeta }> {
  const trimmed = query.trim()
  if (!trimmed) return { papers: [], variants: [], pipeline: emptyPipelineMeta() }

  try {
    const variants = generateQueryVariants(trimmed, 4)
    const apiSearch = literatureApiSearchQuery(trimmed)
    const pubMedBroadOrUsed = Boolean(broadPubMedFallbackOrClause(trimmed))
    const { sort, recentYears, openAccessOnly } = normalizePaperSearchOptions(options)
    const yearFloor = resolveYearFloorForSearch(trimmed, sort, recentYears)
    const expandedRaw = buildExpandedPubMedTerm(trimmed)
    const capped = capExpandedPubMedTermEncodedLength(expandedRaw)
    const pubMedTerm = appendPubMedDateFilter(capped.term, yearFloor)
    const pubMedTermEncodedLength = encodeURIComponent(pubMedTerm).length
    const pubMedEsort = sort === "recent" ? "pub_date" : "relevance"
    const openAlexPrimarySort = sort === "cited" ? "cited_by_count" : "relevance"

    const [pubMedResults, preprintResults, europeIndexed, openAlexResults] = await Promise.all([
      fetchPubMedByTerm(pubMedTerm, { esearchSort: pubMedEsort }),
      searchPreprints(apiSearch, yearFloor),
      searchEuropePMCIndexed(apiSearch, yearFloor),
      searchOpenAlex(apiSearch, { yearFloor, primarySort: openAlexPrimarySort }),
    ])

    let openAlexBatch = openAlexResults
    const secondPassOpenAlexAttempted =
      variants.length > 1 &&
      variants[1].trim().toLowerCase() !== trimmed.toLowerCase() &&
      pubMedResults.length < PUBMED_SECOND_PASS_THRESHOLD

    let secondPassOpenAlexMerged = false
    if (secondPassOpenAlexAttempted) {
      const secondOaQuery = literatureApiSearchQuery(variants[1])
      const extraOa = await searchOpenAlex(secondOaQuery, {
        yearFloor,
        primarySort: openAlexPrimarySort,
      })
      if (extraOa.length > 0) {
        secondPassOpenAlexMerged = true
        openAlexBatch = mergeOrderedBatches([openAlexResults, extraOa])
      }
    }

    let merged = mergeOrderedBatches([
      pubMedResults,
      preprintResults,
      europeIndexed,
      openAlexBatch,
    ])

    let secondPassPubMedRan = false
    if (pubMedResults.length < PUBMED_SECOND_PASS_THRESHOLD) {
      const candidates = [...openAlexBatch, ...europeIndexed, ...preprintResults]
      const secondTerm = buildSecondPassPubMedTerm(candidates, collectPmids(pubMedResults))
      if (secondTerm) {
        const secondWithDates = appendPubMedDateFilter(secondTerm, yearFloor)
        const extraPubmed = await fetchPubMedByTerm(secondWithDates, {
          esearchSort: pubMedEsort,
        })
        if (extraPubmed.length > 0) {
          secondPassPubMedRan = true
          merged = mergeFlatFollowedByBatch(merged, extraPubmed)
        }
      }
    }

    // Order only — never slice by sort mode; pool size is controlled by per-source limits above.
    let ranked = applyResultOrdering(merged, trimmed, sort, yearFloor)
    ranked = await enrichPapersMissingPdf(ranked)
    if (openAccessOnly) {
      ranked = ranked.filter((p) => p.isOpenAccess)
    }
    return {
      papers: ranked,
      variants,
      pipeline: {
        apiSearchQuery: apiSearch,
        pubMedBroadOrUsed,
        pubmedFirstPassHits: pubMedResults.length,
        pubMedTermEncodedLength,
        pubMedTermClipped: capped.clipped,
        secondPassOpenAlexAttempted,
        secondPassOpenAlexMerged,
        secondPassPubMedRan,
      },
    }
  } catch (error) {
    console.error("Paper search error:", error)
    return { papers: [], variants: [], pipeline: emptyPipelineMeta() }
  }
}

export async function searchPapers(
  query: string,
  options: PaperSearchOptions = {},
): Promise<SearchPaper[]> {
  return (await searchPapersWithMeta(query, options)).papers
}
