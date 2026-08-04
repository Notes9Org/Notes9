/**
 * Open-access PDF + abstract resolution from a paper's identifiers.
 *
 * The search backend frequently returns hits without a fetchable `pdfUrl` or a real
 * `abstract`. This module gathers OA PDF candidate URLs from every available signal
 * (card href, preprint DOI construction, OpenAlex, Europe PMC, PMC OA subset) and a
 * best-effort abstract, so staging can still download the PDF and backfill the abstract.
 *
 * Server-only. Every candidate URL is passed through `shouldTrySearchCardPdfUrl`
 * (SSRF allowlist/blocklist) before it is returned. Each network call is wrapped in
 * try/catch and returns empty on failure, these run in the background and must stay fast.
 */
import type { SearchPaper } from "@/types/paper-search"
import { normalizeDoi } from "@/lib/literature-pdf-storage"
import {
  expandSearchCardPdfUrls,
  shouldTrySearchCardPdfUrl,
  upgradeInsecurePdfUrlIfKnownHost,
} from "@/lib/literature-pdf-urls"
import { resolvePmcOaPdfUrls } from "@/lib/literature-pdf-import"
import { resolveUnpaywallPdfUrls } from "@/lib/unpaywall"
import { unstable_cache } from "next/cache"

const NOTES9_CONTACT_EMAIL = process.env.OPENALEX_CONTACT_EMAIL
const OA_USER_AGENT = NOTES9_CONTACT_EMAIL
  ? `Notes9/1.0 (mailto:${NOTES9_CONTACT_EMAIL})`
  : "Notes9/1.0"

const NO_ABSTRACT = "no abstract available."

function cleanAbstract(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.toLowerCase() === NO_ABSTRACT) return null
  return trimmed
}

function addCandidate(out: string[], raw: string | null | undefined) {
  if (!raw) return
  const t = upgradeInsecurePdfUrlIfKnownHost(raw.trim())
  if (shouldTrySearchCardPdfUrl(t) && !out.includes(t)) out.push(t)
}

// ── Tier-2 repository-copy locators ────────────────────────────────────────────
// When a paper is tagged open-access but the only copy Tier-1 (OpenAlex / Unpaywall /
// Europe PMC / PMC) can find is the publisher's own bot-walled page, the download
// fails. Semantic Scholar and CORE index the *green-OA* copy (author-deposited,
// institutional-archive, aggregator-hosted) that is reachable in exactly that case.
// Both are keyed by the EXACT DOI (Semantic Scholar also by PMID) so we never fetch a
// different paper than the one requested. Day-long cached like Unpaywall; best-effort.
const TIER2_FETCH_TIMEOUT_MS = 6000

function firstPdfHttpUrl(url: string | null | undefined): string | null {
  return typeof url === "string" && /^https?:\/\//i.test(url.trim()) ? url.trim() : null
}

type SemanticScholarResponse = { openAccessPdf?: { url?: string | null } | null }

/** Pure: pull the OA PDF URL from a Semantic Scholar paper payload. */
export function extractSemanticScholarPdf(data: SemanticScholarResponse | null | undefined): string | null {
  return firstPdfHttpUrl(data?.openAccessPdf?.url)
}

async function fetchSemanticScholarPdfUrl(idParam: string): Promise<string | null> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIER2_FETCH_TIMEOUT_MS)
  try {
    const apiKey = process.env.SEMANTIC_SCHOLAR_API_KEY?.trim()
    const res = await fetch(
      `https://api.semanticscholar.org/graph/v1/paper/${idParam}?fields=openAccessPdf`,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": OA_USER_AGENT,
          ...(apiKey ? { "x-api-key": apiKey } : {}),
        },
        signal: controller.signal,
      },
    )
    if (!res.ok) return null
    return extractSemanticScholarPdf((await res.json()) as SemanticScholarResponse)
  } catch {
    return null // best-effort; a transient failure must not blank the resolve
  } finally {
    clearTimeout(timeoutId)
  }
}

const cachedFetchSemanticScholarPdfUrl = unstable_cache(
  fetchSemanticScholarPdfUrl,
  ["semantic-scholar-oa-pdf"],
  { revalidate: 60 * 60 * 24 },
)

/** Resolve an OA PDF URL via Semantic Scholar's `openAccessPdf`, keyed by exact DOI
 *  (else PMID). Keyless works; `SEMANTIC_SCHOLAR_API_KEY` is an optional override.
 *  Best-effort → null. */
export async function resolveFromSemanticScholar(
  normalizedDoi: string | null,
  pmid?: string | number | null,
): Promise<string | null> {
  const pmidStr = pmid != null ? String(pmid).trim() : ""
  const idParam = normalizedDoi
    ? `DOI:${encodeURIComponent(normalizedDoi)}`
    : pmidStr
      ? `PMID:${encodeURIComponent(pmidStr)}`
      : null
  if (!idParam) return null
  return cachedFetchSemanticScholarPdfUrl(idParam)
}

type CoreWork = { doi?: string | null; downloadUrl?: string | null }
type CoreSearchResponse = { results?: CoreWork[] | null }

/** Pure: pick the download URL of the CORE result whose DOI EXACTLY matches the
 *  requested one, CORE's search is fuzzy and can return neighbouring works, and we
 *  must never download a different paper than the one asked for. */
export function pickCoreDownloadUrl(
  results: CoreWork[] | null | undefined,
  normalizedDoi: string,
): string | null {
  for (const w of results ?? []) {
    if (normalizeDoi(w.doi) !== normalizedDoi) continue
    const url = firstPdfHttpUrl(w.downloadUrl)
    if (url) return url
  }
  return null
}

async function fetchCorePdfUrl(normalizedDoi: string): Promise<string | null> {
  const apiKey = process.env.CORE_API_KEY?.trim()
  if (!apiKey) return null
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIER2_FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(
      `https://api.core.ac.uk/v3/search/works?q=${encodeURIComponent(`doi:"${normalizedDoi}"`)}&limit=10`,
      {
        headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
      },
    )
    if (!res.ok) return null
    const data = (await res.json()) as CoreSearchResponse
    return pickCoreDownloadUrl(data.results, normalizedDoi)
  } catch {
    return null // best-effort
  } finally {
    clearTimeout(timeoutId)
  }
}

const cachedFetchCorePdfUrl = unstable_cache(
  fetchCorePdfUrl,
  ["core-oa-pdf"],
  { revalidate: 60 * 60 * 24 },
)

/** Resolve an OA PDF URL via CORE (green-OA aggregator), matched by exact DOI.
 *  No-op returning null without `CORE_API_KEY`. Best-effort → null. */
export async function resolveFromCore(normalizedDoi: string | null): Promise<string | null> {
  if (!normalizedDoi) return null
  if (!process.env.CORE_API_KEY?.trim()) return null // no key → no-op
  return cachedFetchCorePdfUrl(normalizedDoi)
}

/** bioRxiv/medRxiv/arXiv PDF URLs reconstructed from a DOI. */
function preprintPdfUrlsFromDoi(doi: string, source: SearchPaper["source"]): string[] {
  const out: string[] = []
  const lower = doi.toLowerCase()

  // bioRxiv / medRxiv: newer DOIs use varying prefixes (e.g. 10.64898/...), so trust
  // `source` rather than the prefix. Push both versioned (v1) and version-less URLs;
  // the server redirects the version-less form to the latest revision.
  if (source === "BioRxiv") {
    out.push(
      `https://www.biorxiv.org/content/${doi}v1.full.pdf`,
      `https://www.biorxiv.org/content/${doi}.full.pdf`
    )
  } else if (source === "MedRxiv") {
    out.push(
      `https://www.medrxiv.org/content/${doi}v1.full.pdf`,
      `https://www.medrxiv.org/content/${doi}.full.pdf`
    )
  } else if (/^10\.1101\//.test(lower)) {
    // Source unknown but classic 10.1101 prefix → try both servers, both forms.
    out.push(
      `https://www.biorxiv.org/content/${doi}v1.full.pdf`,
      `https://www.biorxiv.org/content/${doi}.full.pdf`,
      `https://www.medrxiv.org/content/${doi}v1.full.pdf`,
      `https://www.medrxiv.org/content/${doi}.full.pdf`
    )
  }

  // arXiv: 10.48550/arXiv.<id>
  const arxiv = lower.match(/^10\.48550\/arxiv\.(.+)$/i)
  if (arxiv?.[1]) {
    out.push(`https://arxiv.org/pdf/${arxiv[1]}`)
  }

  return out
}

/** Extract an arXiv id from a pdf/abs URL (e.g. arxiv.org/abs/2401.01234v2 → 2401.01234). */
function arxivIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const m = url.match(/arxiv\.org\/(?:abs|pdf)\/([^\s?#]+?)(?:v\d+)?(?:\.pdf)?$/i)
  return m?.[1] ?? null
}

/**
 * Abstract fallback for brand-new bioRxiv/medRxiv preprints not yet in OpenAlex/EuropePMC.
 * Only meaningful when source is BioRxiv/MedRxiv and a DOI is present.
 */
async function resolveFromBiorxivApi(
  doi: string | null,
  source: SearchPaper["source"]
): Promise<string | null> {
  if (!doi) return null
  const server = source === "BioRxiv" ? "biorxiv" : source === "MedRxiv" ? "medrxiv" : null
  if (!server) return null
  try {
    const url = `https://api.biorxiv.org/details/${server}/${encodeURIComponent(doi)}`
    const res = await fetch(url, {
      headers: { "User-Agent": OA_USER_AGENT, Accept: "application/json" },
      next: { revalidate: 0 },
    })
    if (!res.ok) return null
    const data = (await res.json()) as {
      collection?: Array<{ abstract?: string | null }>
    }
    return cleanAbstract(data.collection?.[0]?.abstract)
  } catch {
    return null
  }
}

/** Abstract fallback for brand-new arXiv preprints via the Atom API. */
async function resolveFromArxivAtom(arxivId: string | null): Promise<string | null> {
  if (!arxivId) return null
  try {
    const url = `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(arxivId)}`
    const res = await fetch(url, {
      headers: { "User-Agent": OA_USER_AGENT, Accept: "application/atom+xml" },
      next: { revalidate: 0 },
    })
    if (!res.ok) return null
    const xml = await res.text()
    const m = xml.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i)
    if (!m?.[1]) return null
    return cleanAbstract(m[1].replace(/\s+/g, " "))
  } catch {
    return null
  }
}

/** Reconstruct an abstract from OpenAlex `abstract_inverted_index`. */
function abstractFromInvertedIndex(
  index: Record<string, number[]> | null | undefined
): string | null {
  if (!index) return null
  const words: string[] = []
  for (const [word, positions] of Object.entries(index)) {
    for (const pos of positions) {
      words[pos] = word
    }
  }
  const joined = words.filter((w) => w != null).join(" ").trim()
  return cleanAbstract(joined)
}

/**
 * OpenAlex-hosted OA PDF endpoint for a work id (e.g. `W1775749144`). The
 * `api_key` is intentionally NOT included here, it is appended by the downloader
 * at fetch time so the secret never lands in a stored candidate URL / tried_urls.
 */
export function openAlexContentPdfUrl(workId: string): string {
  return `https://content.openalex.org/works/${workId}.pdf`
}

async function resolveFromOpenAlex(
  normalizedDoi: string | null
): Promise<{ pdfUrls: string[]; abstract: string | null }> {
  if (!normalizedDoi) return { pdfUrls: [], abstract: null }
  try {
    const url = `https://api.openalex.org/works/doi:${encodeURIComponent(normalizedDoi)}`
    const res = await fetch(url, {
      headers: { "User-Agent": OA_USER_AGENT, Accept: "application/json" },
      next: { revalidate: 0 },
    })
    if (!res.ok) return { pdfUrls: [], abstract: null }
    const data = (await res.json()) as {
      id?: string | null
      abstract_inverted_index?: Record<string, number[]> | null
      best_oa_location?: { pdf_url?: string | null } | null
      locations?: Array<{ pdf_url?: string | null }> | null
    }
    // Two independent PDF sources, tried in order:
    // 1. OpenAlex's own hosted copy at content.openalex.org, bypasses every
    //    publisher / PMC bot-wall. Short work id (e.g. W123…) from `id`; the
    //    api_key is appended at fetch time so it never lands in a stored URL.
    // 2. External repository PDFs OpenAlex already lists in best_oa_location /
    //    locations[].pdf_url (PMC, university repos, arXiv…). These rescue
    //    hybrid papers OpenAlex never mirrored but a green-OA copy exists for.
    //    The downloader validates %PDF magic, so publisher landing pages that
    //    aren't real PDFs are rejected downstream.
    const workId = /\/(W\d+)$/i.exec(data.id ?? "")?.[1] ?? null
    const candidates = [
      workId ? openAlexContentPdfUrl(workId) : null,
      data.best_oa_location?.pdf_url,
      ...(data.locations ?? []).map((l) => l?.pdf_url),
    ]
    const seen = new Set<string>()
    const pdfUrls: string[] = []
    for (const c of candidates) {
      const u = c?.trim()
      if (u && /^https?:\/\//i.test(u) && !seen.has(u)) {
        seen.add(u)
        pdfUrls.push(u)
      }
    }
    const abstract = abstractFromInvertedIndex(data.abstract_inverted_index)
    return { pdfUrls, abstract }
  } catch {
    return { pdfUrls: [], abstract: null }
  }
}

async function resolveFromEuropePmc(
  paper: SearchPaper,
  normalizedDoi: string | null
): Promise<{ pdfUrl: string | null; abstract: string | null }> {
  const pmid = paper.pmid?.trim()
  let query: string | null = null
  if (pmid) {
    query = `EXT_ID:${pmid} AND SRC:MED`
  } else if (normalizedDoi) {
    query = `DOI:"${normalizedDoi}"`
  }
  if (!query) return { pdfUrl: null, abstract: null }

  try {
    const url =
      `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(query)}` +
      `&format=json&pageSize=1&resultType=core`
    const res = await fetch(url, {
      headers: { "User-Agent": OA_USER_AGENT, Accept: "application/json" },
      next: { revalidate: 0 },
    })
    if (!res.ok) return { pdfUrl: null, abstract: null }
    const data = (await res.json()) as {
      resultList?: {
        result?: Array<{
          abstractText?: string | null
          fullTextUrlList?: {
            fullTextUrl?: Array<{ documentStyle?: string | null; url?: string | null }>
          }
        }>
      }
    }
    const first = data.resultList?.result?.[0]
    if (!first) return { pdfUrl: null, abstract: null }
    const pdfUrl =
      first.fullTextUrlList?.fullTextUrl?.find(
        (e) => String(e.documentStyle ?? "").toLowerCase() === "pdf" && e.url
      )?.url ?? null
    return { pdfUrl, abstract: cleanAbstract(first.abstractText) }
  } catch {
    return { pdfUrl: null, abstract: null }
  }
}

export type OaSources = { pdfUrls: string[]; oaPackageTgzUrl: string | null; abstract: string | null }

// Short-lived in-process cache of resolved OA candidates, keyed by paper
// identity (DOI, else PMID). A paper's OA locations don't change minute to
// minute, and every attach/read/stage re-resolves live against Unpaywall /
// OpenAlex / Europe PMC / NCBI, so without this a retry (or a second paper
// from the same upstream) re-races those slow calls under a tight budget, which
// is exactly the "failed first, worked second" flakiness. Positive hits live
// 30 min; a resolution that found NOTHING is negative-cached only briefly (see
// OA_CACHE_NEGATIVE_TTL_MS) so a transient miss doesn't pin an OA paper as empty. In-process
// only (per server instance) and self-bounding, no external store.
//
// The negative TTL is deliberately short (1 min): a "found nothing" is often a
// transient upstream timeout, not a truly non-OA paper, and a 5-min negative cache
// made the user's "open again" retry return the same empty result for minutes. One
// minute still absorbs rapid repeat clicks without pinning a transient miss.
const OA_CACHE_TTL_MS = 30 * 60 * 1000
const OA_CACHE_NEGATIVE_TTL_MS = 60 * 1000
const OA_CACHE_MAX_ENTRIES = 500
const oaSourcesCache = new Map<string, { value: OaSources; expiresAt: number }>()

function oaCacheKey(paper: SearchPaper): string | null {
  const doi = normalizeDoi(paper.doi)
  if (doi) return `doi:${doi}`
  if (paper.pmid) return `pmid:${String(paper.pmid).trim()}`
  return null // title/pdfUrl-only papers aren't stably keyable, skip the cache
}

/**
 * Cached wrapper over {@link resolveOaSourcesUncached}. This is the entry point
 * every consumer should use. Papers without a DOI or PMID bypass the cache.
 */
export async function resolveOaSources(
  paper: SearchPaper,
  opts?: { contactEmail?: string | null }
): Promise<OaSources> {
  const key = oaCacheKey(paper)
  if (key) {
    const hit = oaSourcesCache.get(key)
    if (hit && hit.expiresAt > Date.now()) return hit.value
  }
  const value = await resolveOaSourcesUncached(paper, opts)
  if (key) {
    const foundSomething = value.pdfUrls.length > 0 || value.oaPackageTgzUrl != null
    const ttl = foundSomething ? OA_CACHE_TTL_MS : OA_CACHE_NEGATIVE_TTL_MS
    // Cheap bound: clear the whole map when it grows too large (cache, not store).
    if (oaSourcesCache.size >= OA_CACHE_MAX_ENTRIES) oaSourcesCache.clear()
    oaSourcesCache.set(key, { value, expiresAt: Date.now() + ttl })
  }
  return value
}

/**
 * Gather OA PDF candidate URLs from every available signal on the paper, plus a best-effort
 * abstract. URLs are de-duped (order preserved) and every one passes the SSRF allowlist check.
 *
 * `contactEmail` is the signed-in user's email, sent to Unpaywall as the polite-pool
 * contact (it does not need to be registered); falls back to `UNPAYWALL_EMAIL`.
 */
export async function resolveOaSourcesUncached(
  paper: SearchPaper,
  opts?: { contactEmail?: string | null }
): Promise<OaSources> {
  // Multi-source OA resolution over official REST APIs only (no HTML scraping).
  // All sources run in parallel (they're independent + free); candidates are
  // merged in priority order and the downloader races them, keeping the first
  // that yields real %PDF bytes and rejecting walls/landing-pages. Priority:
  //   1. OpenAlex hosted (content.openalex.org), bypasses every publisher/PMC
  //      bot-wall; api_key appended at fetch time, never in a stored URL.
  //   2. OpenAlex-tracked repository PDFs (PMC, HAL, university repos, arXiv).
  //   3. Europe PMC full-text, clean, unblocked PDFs for life-science papers.
  //   4. CORE, universal green-OA aggregator (needs CORE_API_KEY, else no-op).
  //   5. Preprint servers (bioRxiv/medRxiv/arXiv) derived from the DOI.
  //   6. Semantic Scholar openAccessPdf.
  const normalizedDoi = normalizeDoi(paper.doi)
  const [openAlex, europePmc, coreUrl, s2Url] = await Promise.all([
    resolveFromOpenAlex(normalizedDoi),
    resolveFromEuropePmc(paper, normalizedDoi),
    resolveFromCore(normalizedDoi),
    resolveFromSemanticScholar(normalizedDoi, paper.pmid),
  ])
  const preprintUrls = paper.doi ? preprintPdfUrlsFromDoi(paper.doi, paper.source) : []

  const seen = new Set<string>()
  const pdfUrls: string[] = []
  for (const u of [
    ...openAlex.pdfUrls,
    europePmc.pdfUrl,
    coreUrl,
    ...preprintUrls,
    s2Url,
  ]) {
    const url = u?.trim()
    if (url && /^https?:\/\//i.test(url) && !seen.has(url)) {
      seen.add(url)
      pdfUrls.push(url)
    }
  }
  console.log(
    `[oa] resolve doi=${normalizedDoi ?? "none"} pmid=${paper.pmid ?? "none"}` +
      ` openalex=${openAlex.pdfUrls.length} europepmc=${europePmc.pdfUrl ? 1 : 0}` +
      ` core=${coreUrl ? 1 : 0} preprint=${preprintUrls.length} s2=${s2Url ? 1 : 0}` +
      ` merged=${pdfUrls.length}`,
  )
  const abstract = openAlex.abstract ?? europePmc.abstract ?? null
  return { pdfUrls, oaPackageTgzUrl: null, abstract }
}
