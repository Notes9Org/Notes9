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
 * try/catch and returns empty on failure — these run in the background and must stay fast.
 */
import type { SearchPaper } from "@/types/paper-search"
import { normalizeDoi } from "@/lib/literature-pdf-storage"
import {
  expandSearchCardPdfUrls,
  shouldTrySearchCardPdfUrl,
  upgradeInsecurePdfUrlIfKnownHost,
} from "@/lib/literature-pdf-urls"
import { resolvePmcOaPdfUrls } from "@/lib/literature-pdf-import"

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

async function resolveFromOpenAlex(
  normalizedDoi: string | null
): Promise<{ pdfUrl: string | null; abstract: string | null }> {
  if (!normalizedDoi) return { pdfUrl: null, abstract: null }
  try {
    const url = `https://api.openalex.org/works/doi:${encodeURIComponent(normalizedDoi)}`
    const res = await fetch(url, {
      headers: { "User-Agent": OA_USER_AGENT, Accept: "application/json" },
      next: { revalidate: 0 },
    })
    if (!res.ok) return { pdfUrl: null, abstract: null }
    const data = (await res.json()) as {
      best_oa_location?: { pdf_url?: string | null; url_for_pdf?: string | null } | null
      primary_location?: { pdf_url?: string | null } | null
      abstract_inverted_index?: Record<string, number[]> | null
    }
    const pdfUrl =
      data.best_oa_location?.pdf_url ||
      data.best_oa_location?.url_for_pdf ||
      data.primary_location?.pdf_url ||
      null
    const abstract = abstractFromInvertedIndex(data.abstract_inverted_index)
    return { pdfUrl, abstract }
  } catch {
    return { pdfUrl: null, abstract: null }
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

/**
 * Gather OA PDF candidate URLs from every available signal on the paper, plus a best-effort
 * abstract. URLs are de-duped (order preserved) and every one passes the SSRF allowlist check.
 */
export async function resolveOaSources(
  paper: SearchPaper
): Promise<{ pdfUrls: string[]; oaPackageTgzUrl: string | null; abstract: string | null }> {
  const normalizedDoi = normalizeDoi(paper.doi)
  const pdfUrls: string[] = []

  // 1. Card href (expanded: PMC folder → main.pdf, http → https).
  if (paper.pdfUrl?.trim()) {
    for (const u of expandSearchCardPdfUrls(paper.pdfUrl.trim())) {
      addCandidate(pdfUrls, u)
    }
  }

  // 2. Preprint construction from DOI.
  if (normalizedDoi) {
    for (const u of preprintPdfUrlsFromDoi(normalizedDoi, paper.source)) {
      addCandidate(pdfUrls, u)
    }
  }

  // 2b. arXiv papers without a DOI: derive the id from the card/article URL.
  const arxivId = arxivIdFromUrl(paper.pdfUrl) ?? arxivIdFromUrl(paper.articlePageUrl)
  if (arxivId) {
    addCandidate(pdfUrls, `https://arxiv.org/pdf/${arxivId}`)
  }

  // 3 + 4. Network resolvers (OpenAlex, Europe PMC) — run together; resilient to failure.
  const [openAlex, europePmc] = await Promise.all([
    resolveFromOpenAlex(normalizedDoi),
    resolveFromEuropePmc(paper, normalizedDoi),
  ])
  addCandidate(pdfUrls, openAlex.pdfUrl)
  addCandidate(pdfUrls, europePmc.pdfUrl)

  // 5. PMC OA subset (also surfaces the OA package .tgz fallback).
  let oaPackageTgzUrl: string | null = null
  try {
    const pmc = await resolvePmcOaPdfUrls(paper)
    for (const u of pmc.urls) addCandidate(pdfUrls, u)
    oaPackageTgzUrl = pmc.oaPackageTgzUrl
  } catch {
    /* ignore — PMC resolution is best-effort */
  }

  // Abstract: Europe PMC → OpenAlex, then preprint-API fallbacks for brand-new
  // papers not yet indexed. Fallbacks only fire when the earlier sources are null.
  let abstract = europePmc.abstract ?? openAlex.abstract ?? null
  if (abstract == null) {
    abstract = await resolveFromBiorxivApi(normalizedDoi, paper.source)
  }
  if (abstract == null) {
    abstract = await resolveFromArxivAtom(arxivId)
  }

  return { pdfUrls, oaPackageTgzUrl, abstract }
}
