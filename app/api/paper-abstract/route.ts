import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current-user'
import { cleanScrapedAbstract, decodeHtmlEntities } from '@/lib/literature-abstract-display'

/**
 * Lightweight, fast per-paper resolver — used to fill in abstracts AND the
 * open-access PDF link / identity metadata on AI search results without running
 * the slow full literature search. Hits OpenAlex directly by DOI → PMID → title
 * (one request) and reads the abstract (from its inverted index), the best
 * open-access PDF URL, and identifiers. For a title lookup the top hit is only
 * trusted when titles are similar, so we never attach the wrong paper.
 */
export const maxDuration = 20

function reconstructAbstract(inv: Record<string, number[]> | undefined | null): string {
  if (!inv || typeof inv !== 'object') return ''
  const positions: Array<[number, string]> = []
  for (const [word, idxs] of Object.entries(inv)) {
    if (!Array.isArray(idxs)) continue
    for (const i of idxs) positions.push([i, word])
  }
  if (positions.length === 0) return ''
  positions.sort((a, b) => a[0] - b[0])
  return positions.map((p) => p[1]).join(' ')
}

function norm(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function titlesSimilar(a: string, b: string): boolean {
  const wa = new Set(norm(a).split(' ').filter((w) => w.length > 2))
  const wb = new Set(norm(b).split(' ').filter((w) => w.length > 2))
  if (wa.size === 0 || wb.size === 0) return false
  let inter = 0
  for (const w of wa) if (wb.has(w)) inter++
  return inter / Math.min(wa.size, wb.size) >= 0.4
}

type OpenAlexLocation = {
  pdf_url?: string | null
  landing_page_url?: string | null
  is_oa?: boolean
  source?: { display_name?: string | null } | null
}

type OpenAlexWork = {
  display_name?: string
  abstract_inverted_index?: Record<string, number[]>
  abstract?: string
  doi?: string | null
  publication_year?: number | null
  ids?: { pmid?: string | null } | null
  open_access?: { is_oa?: boolean; oa_url?: string | null } | null
  best_oa_location?: OpenAlexLocation | null
  primary_location?: OpenAlexLocation | null
  authorships?: Array<{ author?: { display_name?: string | null } | null }> | null
}

/** Resolved per-paper payload returned to the client. */
interface ResolvedPaper {
  abstract: string
  pdfUrl: string | null
  articlePageUrl: string | null
  isOpenAccess: boolean
  doi: string | null
  pmid: string | null
  year: number | null
  journal: string | null
  authors: string[]
}

const EMPTY: ResolvedPaper = {
  abstract: '',
  pdfUrl: null,
  articlePageUrl: null,
  isOpenAccess: false,
  doi: null,
  pmid: null,
  year: null,
  journal: null,
  authors: [],
}

function userAgent(): string {
  const mail = process.env.OPENALEX_CONTACT_EMAIL?.trim()
  return mail
    ? `Notes9/1.0 (mailto:${mail})`
    : 'Notes9/1.0 (https://openalex.org; literature search)'
}

function abstractOf(work: OpenAlexWork | null | undefined): string {
  if (!work) return ''
  const fromInverted = reconstructAbstract(work.abstract_inverted_index)
  const raw = fromInverted || (typeof work.abstract === 'string' ? work.abstract : '')
  return raw ? cleanScrapedAbstract(raw) ?? raw : ''
}

/** Pull the best open-access PDF link + identity fields off an OpenAlex work. */
function resolveFrom(work: OpenAlexWork | null | undefined): ResolvedPaper {
  if (!work) return EMPTY
  const best = work.best_oa_location ?? null
  const primary = work.primary_location ?? null
  const isOpenAccess = !!(work.open_access?.is_oa || best?.is_oa || best?.pdf_url)
  // Prefer a direct PDF; fall back to OA landing/url so the importer can still
  // resolve a PMC/OA copy from the identifiers.
  const pdfUrl =
    best?.pdf_url ||
    primary?.pdf_url ||
    (isOpenAccess ? work.open_access?.oa_url || null : null) ||
    null
  const articlePageUrl =
    best?.landing_page_url || primary?.landing_page_url || work.open_access?.oa_url || null
  const doi = work.doi ? work.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '') : null
  const pmid = work.ids?.pmid ? String(work.ids.pmid).replace(/\D/g, '') || null : null
  const journal = best?.source?.display_name || primary?.source?.display_name || null
  const authors =
    work.authorships
      ?.map((a) => a.author?.display_name?.trim())
      .filter((n): n is string => !!n)
      .slice(0, 25) ?? []
  return {
    abstract: abstractOf(work),
    pdfUrl,
    articlePageUrl,
    isOpenAccess,
    doi,
    pmid,
    year: typeof work.publication_year === 'number' ? work.publication_year : null,
    journal,
    authors,
  }
}

async function fetchWork(url: string): Promise<OpenAlexWork | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': userAgent() } })
    if (!res.ok) return null
    return (await res.json()) as OpenAlexWork
  } catch {
    return null
  }
}

// ── Europe PMC fallback ─────────────────────────────────────────────────────
// OpenAlex sometimes lacks an abstract (or an OA PDF link) for biomedical
// papers that Europe PMC has. We query it to fill any gaps, so every cited
// paper gets an abstract and open-access papers reliably get a PDF.

type EuropePmcResult = {
  title?: string
  abstractText?: string
  isOpenAccess?: string
  pmid?: string
  pmcid?: string
  doi?: string
  pubYear?: string
  authorString?: string
  journalInfo?: { journal?: { title?: string } }
  fullTextUrlList?: { fullTextUrl?: Array<{ documentStyle?: string; availability?: string; url?: string }> }
}

function epmcPdfUrl(r: EuropePmcResult): string | null {
  const urls = r.fullTextUrlList?.fullTextUrl ?? []
  const pdf = urls.find((u) => (u.documentStyle || '').toLowerCase() === 'pdf')
  if (pdf?.url) return pdf.url
  // PMC open-access copy → the importer can fetch the OA PDF from the PMC id.
  if (r.pmcid) return `https://www.ncbi.nlm.nih.gov/pmc/articles/${r.pmcid}/pdf/`
  return null
}

async function fetchEuropePmc(queryExpr: string, wantTitle: string): Promise<ResolvedPaper | null> {
  try {
    const params = new URLSearchParams({
      query: queryExpr,
      resultType: 'core',
      format: 'json',
      pageSize: '1',
    })
    const res = await fetch(
      `https://www.ebi.ac.uk/europepmc/webservices/rest/search?${params.toString()}`,
      { headers: { 'User-Agent': userAgent() } },
    )
    if (!res.ok) return null
    const data = (await res.json()) as { resultList?: { result?: EuropePmcResult[] } }
    const r = data.resultList?.result?.[0]
    if (!r || !r.title) return null
    // Title queries can drift — only trust a similar title.
    if (wantTitle && !titlesSimilar(wantTitle, r.title)) return null
    const rawAbstract = typeof r.abstractText === 'string' ? r.abstractText : ''
    const abstract = rawAbstract ? cleanScrapedAbstract(rawAbstract) ?? rawAbstract : ''
    const pdfUrl = epmcPdfUrl(r)
    return {
      abstract,
      pdfUrl,
      articlePageUrl: r.pmcid ? `https://www.ncbi.nlm.nih.gov/pmc/articles/${r.pmcid}/` : null,
      isOpenAccess: r.isOpenAccess === 'Y' || !!pdfUrl,
      doi: r.doi ?? null,
      pmid: r.pmid ? String(r.pmid).replace(/\D/g, '') || null : null,
      year: r.pubYear ? parseInt(r.pubYear, 10) || null : null,
      journal: r.journalInfo?.journal?.title ?? null,
      authors: r.authorString
        ? r.authorString.split(',').map((a) => a.trim()).filter(Boolean).slice(0, 25)
        : [],
    }
  } catch {
    return null
  }
}

// ── Semantic Scholar fallback ───────────────────────────────────────────────
// Broad cross-domain coverage; good for papers OpenAlex/Europe PMC miss.

type S2Paper = {
  abstract?: string | null
  openAccessPdf?: { url?: string | null } | null
  title?: string | null
  year?: number | null
  venue?: string | null
  authors?: Array<{ name?: string | null }> | null
  externalIds?: { DOI?: string | null; PubMed?: string | null } | null
}

async function fetchSemanticScholar(idPath: string, wantTitle: string): Promise<ResolvedPaper | null> {
  try {
    const fields = 'abstract,openAccessPdf,title,year,venue,authors,externalIds'
    const isSearch = idPath.startsWith('search:')
    const url = isSearch
      ? `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(idPath.slice(7))}&limit=1&fields=${fields}`
      : `https://api.semanticscholar.org/graph/v1/paper/${idPath}?fields=${fields}`
    const res = await fetch(url, { headers: { 'User-Agent': userAgent() } })
    if (!res.ok) return null
    const json = (await res.json()) as { data?: S2Paper[] } & S2Paper
    const paper: S2Paper | null = isSearch ? json.data?.[0] ?? null : json
    if (!paper || !paper.title) return null
    if (wantTitle && !titlesSimilar(wantTitle, paper.title)) return null
    const rawAbstract = typeof paper.abstract === 'string' ? paper.abstract : ''
    const abstract = rawAbstract ? cleanScrapedAbstract(rawAbstract) ?? rawAbstract : ''
    const pdfUrl = paper.openAccessPdf?.url ?? null
    return {
      abstract,
      pdfUrl,
      articlePageUrl: null,
      isOpenAccess: !!pdfUrl,
      doi: paper.externalIds?.DOI ?? null,
      pmid: paper.externalIds?.PubMed ?? null,
      year: typeof paper.year === 'number' ? paper.year : null,
      journal: paper.venue ?? null,
      authors:
        paper.authors?.map((a) => a.name?.trim()).filter((n): n is string => !!n).slice(0, 25) ?? [],
    }
  } catch {
    return null
  }
}

// ── Source-page extraction ──────────────────────────────────────────────────
// Last resort for web citations with only a URL: fetch the page and read the
// abstract from standard scholarly meta tags (citation_abstract / Dublin Core /
// Open Graph). Catches publisher + PubMed pages that the indexes didn't match.

const META_PATTERNS = [
  /<meta[^>]+name=["']citation_abstract["'][^>]+content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']citation_abstract["']/i,
  /<meta[^>]+name=["']dc\.description["'][^>]+content=["']([^"']+)["']/i,
  /<meta[^>]+name=["']DC\.Description["'][^>]+content=["']([^"']+)["']/i,
  /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
  /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
]

async function fetchAbstractFromUrl(url: string): Promise<string> {
  if (!/^https?:\/\//i.test(url)) return ''
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 8000)
    const res = await fetch(url, {
      headers: { 'User-Agent': userAgent(), Accept: 'text/html,application/xhtml+xml' },
      signal: ctrl.signal,
      redirect: 'follow',
    })
    clearTimeout(timer)
    if (!res.ok) return ''
    const html = (await res.text()).slice(0, 800_000)
    for (const re of META_PATTERNS) {
      const m = html.match(re)
      if (m?.[1] && m[1].trim().length > 80) {
        const decoded = decodeHtmlEntities(m[1])
        const cleaned = (cleanScrapedAbstract(decoded) ?? decoded).trim()
        if (cleaned.length > 80) return cleaned
      }
    }
    return ''
  } catch {
    return ''
  }
}

/** Fill empty fields of `base` from `extra` (used to merge fallbacks onto OpenAlex). */
function mergeResolved(base: ResolvedPaper, extra: ResolvedPaper | null): ResolvedPaper {
  if (!extra) return base
  return {
    abstract: base.abstract || extra.abstract,
    pdfUrl: base.pdfUrl || extra.pdfUrl,
    articlePageUrl: base.articlePageUrl || extra.articlePageUrl,
    isOpenAccess: base.isOpenAccess || extra.isOpenAccess,
    doi: base.doi || extra.doi,
    pmid: base.pmid || extra.pmid,
    year: base.year || extra.year,
    journal: base.journal || extra.journal,
    authors: base.authors.length ? base.authors : extra.authors,
  }
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const p = request.nextUrl.searchParams
  const doi = p.get('doi')?.trim() || ''
  const pmid = p.get('pmid')?.trim() || ''
  const title = p.get('title')?.trim() || ''
  const sourceUrl = p.get('url')?.trim() || ''

  const cleanDoi = doi ? doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '') : ''
  const validPmid = pmid && /^\d+$/.test(pmid) ? pmid : ''
  const titleQuery = title.length >= 8 ? title : ''

  try {
    let resolved: ResolvedPaper | null = null

    // 1. OpenAlex — DOI → PMID → title (the title hit must be a similar title).
    if (cleanDoi) {
      const work = await fetchWork(`https://api.openalex.org/works/doi:${encodeURIComponent(cleanDoi)}`)
      if (work) resolved = resolveFrom(work)
    }
    if (!resolved && validPmid) {
      const work = await fetchWork(`https://api.openalex.org/works/pmid:${validPmid}`)
      if (work) resolved = resolveFrom(work)
    }
    if (!resolved && title && title.length >= 8) {
      const params = new URLSearchParams({ search: title, per_page: '1' })
      const res = await fetchWork(`https://api.openalex.org/works?${params.toString()}`)
      const list = (res as unknown as { results?: OpenAlexWork[] })?.results
      const top = Array.isArray(list) ? list[0] : null
      if (top && top.display_name && titlesSimilar(title, top.display_name)) {
        resolved = resolveFrom(top)
      }
    }

    // 2. Europe PMC fallback — fills a missing abstract and/or open-access PDF
    //    that OpenAlex didn't have (common for biomedical literature).
    if (!resolved || !resolved.abstract || !resolved.pdfUrl) {
      let epmc: ResolvedPaper | null = null
      if (cleanDoi) epmc = await fetchEuropePmc(`DOI:"${cleanDoi}"`, '')
      if (!epmc && validPmid) epmc = await fetchEuropePmc(`EXT_ID:${validPmid} AND SRC:MED`, '')
      if (!epmc && titleQuery) epmc = await fetchEuropePmc(`TITLE:"${titleQuery.replace(/"/g, '')}"`, titleQuery)
      resolved = mergeResolved(resolved ?? EMPTY, epmc)
    }

    // 3. Semantic Scholar fallback — broad coverage for whatever's still missing.
    if (!resolved.abstract || !resolved.pdfUrl) {
      let s2: ResolvedPaper | null = null
      if (cleanDoi) s2 = await fetchSemanticScholar(`DOI:${cleanDoi}`, '')
      if (!s2 && validPmid) s2 = await fetchSemanticScholar(`PMID:${validPmid}`, '')
      if (!s2 && titleQuery) s2 = await fetchSemanticScholar(`search:${titleQuery}`, titleQuery)
      resolved = mergeResolved(resolved, s2)
    }

    // 4. Source page — read the abstract straight off the cited page's scholarly
    //    meta tags when the indexes never matched it (web-only citations).
    if (!resolved.abstract && sourceUrl) {
      const fromPage = await fetchAbstractFromUrl(sourceUrl)
      if (fromPage) resolved = { ...resolved, abstract: fromPage }
    }

    return NextResponse.json(resolved)
  } catch {
    return NextResponse.json(EMPTY)
  }
}
