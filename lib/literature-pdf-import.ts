/**
 * **Staging / repository import from search** tries **`SearchPaper.pdfUrl`** first (same href as the PDF
 * icon), with PMC `…/pdf` → `…/pdf/main.pdf` when the path is the bare folder.
 * If NLM returns HTML (common: Proof-of-Work interstitial on `pmc.ncbi.nlm.nih.gov/.../pdf`), falls back
 * to **PMC Open Access Subset** sources for the **same** article (Europe PMC mirrors + `oa.fcgi` package URL).
 * ScienceDirect `pdfft` URLs are skipped on the server (session-bound).
 *
 * PMC open-access PDF pipeline (server-only; NCBI does not support CORS for these endpoints).
 *
 * 1. **Discovery**, [PMC OA Web Service](https://pmc.ncbi.nlm.nih.gov/tools/oa-service/)
 *    (`https://www.ncbi.nlm.nih.gov/pmc/utils/oa/oa.fcgi?id=PMC…`): XML with
 *    `<link format="pdf" …>` and/or `<link format="tgz" …>` (OA package on FTP as `.tar.gz`).
 * 2. **Download**, [PMC FTP](https://pmc.ncbi.nlm.nih.gov/tools/ftp/) via **HTTPS** (`ftp://` → `https://`).
 *    If only `tgz` is listed, gzip+tar is parsed server-side to extract the `.pdf` (no browser).
 * 3. **PMID → PMCID**, E-utilities `elink` (this module) or
 *    [PMC ID Converter API](https://pmc.ncbi.nlm.nih.gov/tools/id-converter-api/); `oa.fcgi` expects PMC IDs.
 *
 * Next.js must call this from Server Actions, Route Handlers, or other server code, never the browser alone.
 */
import { createHash } from "crypto"

import type { SearchPaper } from "@/types/paper-search"
import type { PdfMatchSource } from "@/types/literature-pdf"
import { LITERATURE_MAX_PDF_SIZE } from "@/types/literature-pdf"
import {
  clampText,
  createLiteraturePdfPath,
  getLiteratureStorageBucket,
  normalizeDoi,
  validatePdfBuffer,
} from "@/lib/literature-pdf-storage"
import { createServiceRoleClient } from "@/lib/supabase-service-role"
import { extractFirstPdfFromTarGz } from "@/lib/pmc-oa-package-pdf"
import {
  callCatalyst,
  CatalystHttpError,
  CatalystUnavailableError,
} from "@/lib/catalyst-client"
import {
  shouldTrySearchCardPdfUrl,
  upgradeInsecurePdfUrlIfKnownHost,
} from "@/lib/literature-pdf-urls"
import { resolveOaSources } from "@/lib/literature-oa-resolve"
import { safeFetch } from "@/lib/net/safe-fetch"
import type { SupabaseClient } from "@supabase/supabase-js"

// ── Shared OA-PDF download cache ─────────────────────────────────────────────
// Open-access PDFs are public and identical for every user, so we cache the
// downloaded bytes once, keyed by the paper's stable identity, and let BOTH
// the "tag in chat" flow (ephemeral-attach) and the "read/stage" flow reuse
// them. This removes the redundant re-download (and re-resolve) when the same
// paper is tagged and then read. Uses the service-role client because the cache
// object lives outside any per-user path prefix.
// ponytail: content-addressed, small objects; if the folder grows, add
// `_oa-pdf-cache/` to the existing staging-cleanup cron. Not blocking.
const OA_PDF_CACHE_PREFIX = "_oa-pdf-cache"

/** Stable cache key for a paper: normalized DOI → PMID → title|year. Null if none. */
export function oaPdfCacheKey(paper: {
  doi?: string | null
  pmid?: string | null
  title?: string | null
  year?: number | null
}): string | null {
  const nd = normalizeDoi(paper.doi)
  const basis = nd
    ? `doi:${nd}`
    : paper.pmid
      ? `pmid:${String(paper.pmid).trim()}`
      : paper.title && paper.title.trim()
        ? `t:${paper.title.trim().toLowerCase()}|${paper.year ?? ""}`
        : null
  if (!basis) return null
  return createHash("sha256").update(basis).digest("hex")
}

/** Read cached OA-PDF bytes for a paper key, or null on any miss/error. */
export async function readOaPdfCache(cacheKey: string): Promise<ArrayBuffer | null> {
  try {
    const svc = createServiceRoleClient()
    const { data, error } = await svc.storage
      .from(getLiteratureStorageBucket())
      .download(`${OA_PDF_CACHE_PREFIX}/${cacheKey}.pdf`)
    if (error || !data) return null
    return await data.arrayBuffer()
  } catch {
    return null
  }
}

/** Best-effort write of downloaded OA-PDF bytes into the shared cache. Never throws. */
export async function writeOaPdfCache(cacheKey: string, buffer: ArrayBuffer): Promise<void> {
  try {
    const svc = createServiceRoleClient()
    await svc.storage
      .from(getLiteratureStorageBucket())
      .upload(`${OA_PDF_CACHE_PREFIX}/${cacheKey}.pdf`, buffer, {
        cacheControl: "3600",
        upsert: true,
        contentType: "application/pdf",
      })
  } catch {
    // Cache population is opportunistic, a failure here must not fail the fetch.
  }
}

export class PdfContentVerificationFailedError extends Error {
  constructor(
    public readonly confidence: number,
    public readonly triedUrls: string[]
  ) {
    super(
      `PDF content did not match the paper title (confidence ${confidence.toFixed(2)}). ` +
        `Tried ${triedUrls.length} candidate URL${triedUrls.length === 1 ? "" : "s"}.`
    )
    this.name = "PdfContentVerificationFailedError"
  }
}

type PdfVerifyAttempt = {
  url: string
  status?: number
  fetched_bytes?: number
  confidence?: number
  extracted_snippet?: string | null
  error?: string | null
}

type PdfVerifyResponse = {
  verified_url: string | null
  confidence: number
  threshold: number
  extracted_title?: string | null
  tried: PdfVerifyAttempt[]
}

/**
 * Call the catalyst verifier. Returns null on any failure (network, missing
 * config, 5xx), the caller treats that as "verification unavailable, fall
 * back to legacy magic-byte check".
 */
async function verifyPdfCandidatesViaCatalyst(params: {
  candidateUrls: string[]
  expectedTitle: string
  accessToken: string
  threshold?: number
}): Promise<PdfVerifyResponse | null> {
  try {
    return await callCatalyst<
      {
        candidate_urls: string[]
        expected_title: string
        threshold?: number
      },
      PdfVerifyResponse
    >(
      "/literature/pdf/verify",
      {
        candidate_urls: params.candidateUrls,
        expected_title: params.expectedTitle,
        ...(params.threshold != null ? { threshold: params.threshold } : {}),
      },
      params.accessToken,
      { timeoutMs: 30_000 }
    )
  } catch (e) {
    // Verification is best-effort: any failure degrades to "unverified" (null)
    // rather than blocking the import. Log so persistent catalyst outages or
    // unexpected errors are diagnosable.
    if (e instanceof CatalystUnavailableError) {
      console.warn("[literature-pdf-import] catalyst unavailable during PDF verification:", e.message)
      return null
    }
    if (e instanceof CatalystHttpError) {
      console.warn("[literature-pdf-import] catalyst HTTP error during PDF verification:", e.message)
      return null
    }
    console.warn("[literature-pdf-import] unexpected error during PDF verification:", e)
    return null
  }
}

/** Shown in User-Agent for NCBI/PMC polite use, must be a reachable contact URL. */
const NOTES9_CONTACT = process.env.NOTES9_CONTACT_URL ?? "https://notes9.com"

/**
 * Polite, self-identifying UA for NCBI / Europe PMC / EBI **API** calls (elink,
 * oa.fcgi): these services run a "polite pool" that *wants* identification.
 */
const NCBI_USER_AGENT = `Mozilla/5.0 (compatible; Notes9/1.0; +${NOTES9_CONTACT})`

/** Hard cap on each NCBI metadata round trip (elink / oa.fcgi). These endpoints
 * sit on the interactive attach path, so a hang must fail fast, not stall it. */
const NCBI_METADATA_TIMEOUT_MS = 5_000

/**
 * Plain real-browser UA for **publisher PDF byte fetches**. Cloudflare-fronted
 * hosts (MDPI, Frontiers, Wiley, …) challenge requests whose UA self-identifies
 * as a bot, so for those hosts we look like a normal browser. (We never bypass a
 * real bot wall; this only avoids being flagged when fetching genuinely-OA PDFs.)
 */
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

/** Hosts that run a polite pool and prefer the identified Notes9 UA. */
function isPolitePoolHost(host: string): boolean {
  return (
    host.endsWith("nih.gov") ||
    host.includes("ncbi.nlm.nih.gov") ||
    host.includes("europepmc.org") ||
    host.endsWith("ebi.ac.uk")
  )
}

export function pdfFetchHeaders(pdfUrl: string): Record<string, string> {
  let host = ""
  try {
    host = new URL(pdfUrl).hostname.toLowerCase()
  } catch {
    /* ignore invalid URL */
  }

  if (isPolitePoolHost(host)) {
    const headers: Record<string, string> = {
      "User-Agent": NCBI_USER_AGENT,
      Accept: "application/pdf,application/octet-stream,*/*;q=0.8",
    }
    if (host.includes("europepmc.org")) headers.Referer = "https://europepmc.org/"
    else if (host.endsWith("ebi.ac.uk")) headers.Referer = "https://www.ebi.ac.uk/"
    else headers.Referer = "https://www.ncbi.nlm.nih.gov/"
    return headers
  }

  // Publisher / repository hosts: look like a real browser to avoid bot-wall 403s.
  const headers: Record<string, string> = {
    "User-Agent": BROWSER_USER_AGENT,
    Accept: "application/pdf,application/xhtml+xml,text/html;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Upgrade-Insecure-Requests": "1",
  }
  // A same-origin Referer (the host root) reads as a click-through from the
  // article page rather than a hot-linked scrape.
  if (host) headers.Referer = `https://${host}/`
  return headers
}

/**
 * Recognize an HTML bot/Proof-of-Work/Cloudflare interstitial served with a 200.
 * These come back as `text/html` (or start with `<`) and never carry the `%PDF`
 * magic bytes, when we see one we skip to the next candidate URL rather than
 * storing the challenge page as if it were the paper.
 */
export function looksLikeHtmlInterstitial(contentType: string | null, head: Uint8Array): boolean {
  if (contentType && /text\/html|application\/xhtml/i.test(contentType)) return true
  // %PDF = 0x25 0x50 0x44 0x46
  const isPdf =
    head.length >= 4 && head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46
  if (isPdf) return false
  // Leading '<' (after optional BOM/whitespace) → HTML/XML document.
  for (let i = 0; i < Math.min(head.length, 8); i++) {
    const b = head[i]
    if (b === 0x20 || b === 0x09 || b === 0x0a || b === 0x0d || b === 0xef || b === 0xbb || b === 0xbf) continue
    return b === 0x3c // '<'
  }
  return false
}

/**
 * PMID → numeric PMC id via E-utilities `elink` (PubMed → PMC).
 * Prefer `linkname=pubmed_pmc` so we never pick a cited article from `pubmed_pmc_refs`.
 * @see https://pmc.ncbi.nlm.nih.gov/tools/id-converter-api/ (alternative official converter)
 */
/**
 * Map a PMID/DOI to its bare numeric PMC id via EuropePMC. EuropePMC's index is
 * more reliable than NCBI elink (which intermittently returns no PMC link for
 * articles that ARE in PMC), so this is the fallback resolver. Returns null on
 * any miss/error, best-effort.
 */
export async function fetchPmcIdFromEuropePmc(
  pmid: string | null | undefined,
  doi: string | null | undefined,
): Promise<string | null> {
  const query = doi?.trim() ? `DOI:${doi.trim()}` : pmid?.trim() ? `ext_id:${pmid.trim()} AND src:med` : null
  if (!query) return null
  const url =
    `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(query)}` +
    `&format=json&pageSize=1&resultType=lite`
  try {
    const res = await safeFetch(url, {
      headers: pdfFetchHeaders(url),
      signal: AbortSignal.timeout(NCBI_METADATA_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { resultList?: { result?: Array<{ pmcid?: string }> } }
    const pmcid = data?.resultList?.result?.[0]?.pmcid
    const m = pmcid ? /PMC(\d+)/i.exec(pmcid) : null
    return m ? m[1] : null
  } catch {
    return null
  }
}

export async function fetchPmcIdFromPmid(pmid: string): Promise<string | null> {
  const url = new URL("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/elink.fcgi")
  url.searchParams.set("dbfrom", "pubmed")
  url.searchParams.set("db", "pmc")
  url.searchParams.set("id", pmid.trim())
  url.searchParams.set("retmode", "json")
  const apiKey = process.env.NCBI_API_KEY
  if (apiKey) url.searchParams.set("api_key", apiKey)

  // Bounded + non-throwing: a hung eutils endpoint must degrade to "no PMC id"
  // (→ abstract fallback downstream), never stall the caller's request.
  let data: {
    linksets?: Array<{
      linksetdbs?: Array<{
        dbto?: string
        linkname?: string
        links?: Array<string | { id?: string }>
      }>
    }>
  }
  try {
    const res = await safeFetch(url.toString(), {
      headers: { "User-Agent": NCBI_USER_AGENT },
      signal: AbortSignal.timeout(NCBI_METADATA_TIMEOUT_MS),
    })
    if (!res.ok) return null
    data = await res.json()
  } catch {
    return null
  }

  function pmcDigitsFromLinks(links: Array<string | { id?: string }> | undefined): string | null {
    for (const link of links ?? []) {
      const raw = typeof link === "string" ? link : link?.id
      if (raw == null) continue
      const id = String(raw).replace(/^PMC/i, "")
      if (/^\d+$/.test(id)) return id
    }
    return null
  }

  const linksets = data.linksets ?? []
  for (const ls of linksets) {
    const dbs = ls.linksetdbs ?? []
    const pubmedPmc = dbs.find((ldb) => String(ldb.linkname ?? "").toLowerCase() === "pubmed_pmc")
    if (pubmedPmc) {
      const found = pmcDigitsFromLinks(pubmedPmc.links)
      if (found) return found
      continue
    }
    for (const ldb of dbs) {
      if (String(ldb.dbto).toLowerCase() !== "pmc") continue
      const found = pmcDigitsFromLinks(ldb.links)
      if (found) return found
    }
  }
  return null
}

function extractPmcNumericId(paper: SearchPaper): string | null {
  if (paper.pdfUrl) {
    const m = paper.pdfUrl.match(/PMC(\d+)/i)
    if (m) return m[1]
  }
  return null
}

/**
 * PMC mirrors/paths for an article's PDF, ordered **non-gated first**.
 *
 * NLM's own `pmc.ncbi.nlm.nih.gov/.../pdf*` endpoints frequently serve a JS
 * Proof-of-Work bot interstitial (HTML, not PDF bytes), so the Europe PMC render
 * mirror, which streams the PDF without a bot challenge, is tried first. The
 * bare `…/pdf/` folder forms (most POW-prone) come last.
 */
export function buildPmcPdfCandidateUrls(pmcNumeric: string): string[] {
  const id = `PMC${pmcNumeric.replace(/^PMC/i, "")}`
  return [
    // Non-gated Europe PMC render mirrors (different host, no NCBI rate limit).
    `https://europepmc.org/backend/ptpmcrender.fcgi?accid=${encodeURIComponent(id)}&blobtype=pdf`,
    `https://europepmc.org/articles/${id}?pdf=render`,
    // ONE canonical NLM request: the bare /pdf/ folder 301-redirects to the real
    // filename and is fetched via the proof-of-work solver. Firing several PMC URL
    // variants per paper in parallel (the old main.pdf guesses + www duplicates)
    // reads as a bot burst and trips NCBI's reCAPTCHA tier, so we send only this.
    `https://pmc.ncbi.nlm.nih.gov/articles/${id}/pdf/`,
  ]
}

/**
 * PMC OA Web Service (`oa.fcgi`), **only** articles in the PMC Open Access Subset
 * may be auto-fetched; closed/subscription PMC full text is excluded by policy.
 * @see https://pmc.ncbi.nlm.nih.gov/tools/oa-service/
 */
async function queryPmcOpenAccessSubset(pmcNumeric: string): Promise<
  | { ok: true; inSubset: true; oaPdfHttpsUrl: string | null; oaTgzHttpsUrl: string | null }
  | { ok: true; inSubset: false }
  | { ok: false }
> {
  const id = `PMC${pmcNumeric.replace(/^PMC/i, "")}`
  const requestUrl = `https://www.ncbi.nlm.nih.gov/pmc/utils/oa/oa.fcgi?id=${encodeURIComponent(id)}`
  try {
    const res = await safeFetch(requestUrl, {
      headers: { "User-Agent": NCBI_USER_AGENT },
      signal: AbortSignal.timeout(NCBI_METADATA_TIMEOUT_MS),
    })
    if (!res.ok) return { ok: false }
    const xml = await res.text()
    if (/<error\b/i.test(xml)) {
      return { ok: true, inSubset: false }
    }
    if (!/<record\b/i.test(xml)) {
      return { ok: true, inSubset: false }
    }

    let oaPdfHttpsUrl: string | null = null
    let oaTgzHttpsUrl: string | null = null
    for (const m of xml.matchAll(/<link\b[\s\S]*?>/g)) {
      const tag = m[0]
      const hrefMatch = /href\s*=\s*["']([^"']+)["']/i.exec(tag)
      if (!hrefMatch?.[1]) continue
      let href = hrefMatch[1].trim()
      if (href.startsWith("ftp://")) href = `https://${href.slice("ftp://".length)}`
      if (!href.startsWith("http")) continue
      if (/format\s*=\s*["']pdf["']/i.test(tag)) oaPdfHttpsUrl = href
      if (/format\s*=\s*["']tgz["']/i.test(tag)) oaTgzHttpsUrl = href
    }
    return { ok: true, inSubset: true, oaPdfHttpsUrl, oaTgzHttpsUrl }
  } catch {
    return { ok: false }
  }
}

export type LiteraturePmcPdfResolution =
  | "no_pmc"
  | "not_pmc_open_access"
  | "oa_subset_check_failed"
  | "open_access_urls_ready"

export async function resolvePmcOaPdfUrls(paper: SearchPaper): Promise<{
  urls: string[]
  oaPackageTgzUrl: string | null
  /** Direct PDF link from `oa.fcgi` when present (often FTP→HTTPS). */
  oaDirectPdfUrl: string | null
  pmcNumeric: string | null
  resolution: LiteraturePmcPdfResolution
}> {
  let pmcNum = extractPmcNumericId(paper)
  if (!pmcNum && paper.pmid) {
    pmcNum = await fetchPmcIdFromPmid(paper.pmid)
  }
  // NCBI elink intermittently returns no PMC link even for in-PMC articles;
  // EuropePMC maps DOI/PMID → PMCID reliably, so fall back to it before giving up.
  if (!pmcNum) {
    pmcNum = await fetchPmcIdFromEuropePmc(paper.pmid, paper.doi)
  }

  if (!pmcNum) {
    return {
      urls: [],
      oaPackageTgzUrl: null,
      oaDirectPdfUrl: null,
      pmcNumeric: null,
      resolution: "no_pmc",
    }
  }

  // oa.fcgi is only a best-effort source of an extra direct link, it is NOT
  // required to fetch the article PDF (the proof-of-work solver hits pmc.ncbi
  // directly). It also intermittently 5xx/times-out and its ftp:// package links
  // are now dead (404 HTTPS / 550 FTP). So never gate the PMC candidate URLs on
  // it: build them from the PMCID and treat oa.fcgi output as optional.
  const oa = await queryPmcOpenAccessSubset(pmcNum).catch(() => null)
  const oaLinks = oa && oa.ok && oa.inSubset ? oa : null
  const directPdf =
    oaLinks?.oaPdfHttpsUrl && !isDeadNcbiFtpUrl(oaLinks.oaPdfHttpsUrl) ? oaLinks.oaPdfHttpsUrl : null
  const oaTgz =
    oaLinks?.oaTgzHttpsUrl && !isDeadNcbiFtpUrl(oaLinks.oaTgzHttpsUrl) ? oaLinks.oaTgzHttpsUrl : null

  const urls: string[] = []
  if (directPdf) urls.push(directPdf)
  urls.push(...buildPmcPdfCandidateUrls(pmcNum))

  return {
    urls: [...new Set(urls)],
    oaPackageTgzUrl: oaTgz,
    oaDirectPdfUrl: directPdf,
    pmcNumeric: pmcNum,
    resolution: "open_access_urls_ready",
  }
}

export async function fetchPdfFromOaPackageTgz(tgzHttpsUrl: string): Promise<{ buffer: ArrayBuffer; usedUrl: string } | null> {
  const response = await safeFetch(tgzHttpsUrl, {
    headers: pdfFetchHeaders(tgzHttpsUrl),
  })
  if (!response.ok) return null
  const compressed = Buffer.from(await response.arrayBuffer())
  const pdfBuf = extractFirstPdfFromTarGz(compressed)
  if (!pdfBuf) return null
  // usedUrl notes source for metadata (not a direct PDF URL)
  return {
    buffer: new Uint8Array(pdfBuf).buffer,
    usedUrl: `${tgzHttpsUrl}#oa-package-pdf`,
  }
}

export type PdfDownloadResult = { buffer: ArrayBuffer; usedUrl: string }

/** The single literature PDF downloader used by every path (Ask Catalyst attach,
 *  Read/stage import, PMC OA proxy). Candidates race in parallel, first valid
 *  PDF wins and aborts the losers, each fetch is streamed so an HTML bot/POW
 *  interstitial is rejected from its first bytes and an over-cap body is aborted
 *  mid-download instead of buffered whole. Bounded by a per-fetch timeout and a
 *  total budget so no leg can hang the caller. Returns null when nothing yields
 *  a PDF (callers decide whether that's a tgz fallback or a hard failure). */
const PDF_DEFAULT_PER_FETCH_TIMEOUT_MS = 15_000
const PDF_DEFAULT_TOTAL_BUDGET_MS = 20_000

/** Combine a parent AbortSignal with a timeout without assuming AbortSignal.any. */
function pdfDownloadSignal(
  parent: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController()
  const abort = () => controller.abort()
  const timer = setTimeout(abort, timeoutMs)
  if (parent?.aborted) abort()
  else parent?.addEventListener("abort", abort)
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer)
      parent?.removeEventListener("abort", abort)
    },
  }
}

function isPdfMagic(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46
}

/** Append the OpenAlex content api_key at fetch time (kept out of stored URLs). */
function withOpenAlexKey(url: string): string {
  const key = process.env.OPENALEX_CONTENT_API_KEY?.trim()
  if (!key) return url
  return `${url}${url.includes("?") ? "&" : "?"}api_key=${encodeURIComponent(key)}`
}

/** Cookie NCBI's "cloudpmc-viewer" proof-of-work wall expects once solved. */
const PMC_POW_COOKIE = "cloudpmc-viewer-pow"

function isPmcArticlePdfHost(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase() === "pmc.ncbi.nlm.nih.gov"
  } catch {
    return false
  }
}

/** oa.fcgi advertises OA package/pdf as ftp://ftp.ncbi.nlm.nih.gov paths that no
 *  longer resolve, 404 over HTTPS, 550 over anonymous FTP. A guaranteed miss. */
function isDeadNcbiFtpUrl(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase() === "ftp.ncbi.nlm.nih.gov"
  } catch {
    return false
  }
}

/**
 * Solve NCBI's PMC proof-of-work: the smallest nonce whose
 * `sha256(challenge + nonce)` hex digest starts with `difficulty` zero chars.
 * Difficulty 4 averages ~65k hashes (<50 ms); the bound guards a runaway if NCBI
 * raises difficulty (caller treats a throw as "give up → next candidate").
 */
export function solvePmcPow(challenge: string, difficulty: number): number {
  const target = "0".repeat(difficulty)
  for (let nonce = 0; nonce < 50_000_000; nonce++) {
    const hex = createHash("sha256").update(challenge + nonce).digest("hex")
    if (hex.startsWith(target)) return nonce
  }
  throw new Error("PMC proof-of-work not solved within bound")
}

/** Stream a Response body into a single buffer, aborting past `maxBytes`. */
async function bufferResponseBounded(res: Response, maxBytes: number): Promise<Uint8Array | null> {
  if (!res.body) return null
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value || value.length === 0) continue
      chunks.push(value)
      total += value.length
      if (total > maxBytes) return null
    }
  } finally {
    reader.cancel().catch(() => {})
  }
  if (total === 0) return null
  const buf = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    buf.set(c, offset)
    offset += c.length
  }
  return buf
}

/**
 * Fetch a `pmc.ncbi.nlm.nih.gov` article PDF that is gated behind NCBI's
 * JavaScript proof-of-work wall ("cloudpmc-viewer"). If the first response is
 * already a PDF (no wall), it is returned directly. Otherwise POW_CHALLENGE /
 * POW_DIFFICULTY are parsed from the interstitial, the hashcash is solved, and
 * the URL is re-requested with the `cloudpmc-viewer-pow` cookie. Returns null
 * (never throws) so the caller falls through to the next candidate.
 */
async function fetchPmcPdfWithPow(
  url: string,
  signal: AbortSignal,
  maxBytes: number,
): Promise<PdfDownloadResult | null> {
  try {
    const headers = pdfFetchHeaders(url)
    const first = await safeFetch(url, { headers, signal })
    if (!first.ok || !first.body) return null

    const ct = (first.headers.get("content-type") || "").toLowerCase()
    if (ct.includes("application/pdf")) {
      const buf = await bufferResponseBounded(first, maxBytes)
      return buf && isPdfMagic(buf) ? { buffer: buf.buffer as ArrayBuffer, usedUrl: url } : null
    }

    // The interstitial is a small HTML page carrying the PoW parameters.
    const html = Buffer.from((await bufferResponseBounded(first, 256 * 1024)) ?? new Uint8Array()).toString("utf8")
    const challenge = /POW_CHALLENGE\s*=\s*"([^"]+)"/.exec(html)?.[1]
    const difficulty = Number(/POW_DIFFICULTY\s*=\s*"?(\d+)/.exec(html)?.[1] ?? "")
    if (!challenge || !Number.isFinite(difficulty) || difficulty < 1 || difficulty > 6) return null

    const nonce = solvePmcPow(challenge, difficulty)
    // Re-request the RESOLVED url (first.url), the interstitial's challenge is
    // bound to the final path (e.g. /pdf/main.pdf). Re-requesting the original
    // bare /pdf/ folder would 301 again and the PoW cookie would not validate.
    const resolvedUrl = first.url || url
    const second = await safeFetch(resolvedUrl, {
      headers: { ...headers, Cookie: `${PMC_POW_COOKIE}=${challenge},${nonce}` },
      signal,
    })
    if (!second.ok) return null
    const buf = await bufferResponseBounded(second, maxBytes)
    return buf && isPdfMagic(buf) ? { buffer: buf.buffer as ArrayBuffer, usedUrl: resolvedUrl } : null
  } catch {
    return null
  }
}

/**
 * One fetch + streaming validation of a candidate PDF URL. `retryable` is true
 * when the failure looks transient (403/429 or an HTML challenge/interstitial)
 * so the caller can retry a Cloudflare-fronted host once.
 */
async function fetchAndValidatePdf(
  url: string,
  signal: AbortSignal,
  maxBytes: number,
): Promise<{ pdf: PdfDownloadResult | null; retryable: boolean }> {
  const startedAt = Date.now()
  const host = safeHost(url)
  const log = (outcome: string, extra?: Record<string, unknown>) =>
    console.log(
      `[oa] fetch host=${host} outcome=${outcome} ms=${Date.now() - startedAt}` +
        (extra ? " " + Object.entries(extra).map(([k, v]) => `${k}=${v}`).join(" ") : ""),
    )

  const res = await safeFetch(url, { headers: pdfFetchHeaders(url), signal })
  const ct = (res.headers.get("content-type") || "").toLowerCase()
  if (!res.ok || !res.body) {
    const retryable = res.status === 403 || res.status === 429
    log("http-error", { status: res.status, retryable })
    return { pdf: null, retryable }
  }

  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  let sniffed = false
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value || value.length === 0) continue
      chunks.push(value)
      total += value.length
      if (!sniffed && total >= 8) {
        sniffed = true
        const head = new Uint8Array(8)
        let filled = 0
        for (const c of chunks) {
          const take = Math.min(c.length, 8 - filled)
          head.set(c.subarray(0, take), filled)
          filled += take
          if (filled >= 8) break
        }
        // Reject an HTML bot/verification page before downloading its whole body.
        if (looksLikeHtmlInterstitial(ct, head)) {
          log("html-wall", { ct })
          return { pdf: null, retryable: true }
        }
      }
      if (total > maxBytes) {
        log("too-big", { bytes: total, maxBytes })
        return { pdf: null, retryable: false }
      }
    }
  } finally {
    reader.cancel().catch(() => {})
  }

  if (total === 0) {
    log("empty")
    return { pdf: null, retryable: false }
  }
  const buf = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    buf.set(c, offset)
    offset += c.length
  }
  if (ct.includes("application/pdf") || isPdfMagic(buf)) {
    log("ok", { bytes: total, ct: ct || "none" })
    return { pdf: { buffer: buf.buffer as ArrayBuffer, usedUrl: url }, retryable: false }
  }
  log("not-pdf", { bytes: total, ct: ct || "none" })
  return { pdf: null, retryable: false }
}

/** Host of a URL for logging; never throws on a malformed URL. */
function safeHost(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return "invalid-url"
  }
}

async function tryDownloadOnePdf(
  url: string,
  parentSignal: AbortSignal,
  maxBytes: number,
  perFetchTimeoutMs: number,
): Promise<PdfDownloadResult | null> {
  // SEC-001 (N9-2/N9-14): this is the SINGLE choke point every PDF download
  // URL passes through — `downloadFirstPdf` (called by the remote-import path,
  // `fetchOpenAccessPdfBufferByIds`, AND `ephemeral-attach/route.ts` with the
  // paper's raw, unvalidated `pdfUrl`) always funnels here. The allowlist check
  // used to be an opt-in the caller had to remember; enforcing it here makes it
  // impossible to bypass regardless of which caller supplied the URL.
  if (!shouldTrySearchCardPdfUrl(url)) return null
  const { signal, dispose } = pdfDownloadSignal(parentSignal, perFetchTimeoutMs)
  try {
    let host = ""
    try {
      host = new URL(url).hostname.toLowerCase()
    } catch {
      /* ignore */
    }
    // OpenAlex serves the hosted PDF from content.openalex.org with the api_key as
    // a query param. Append it here (not in the resolved/stored URL) so the secret
    // never lands in tried_urls; record the clean `url` as usedUrl.
    const fetchUrl = host === "content.openalex.org" ? withOpenAlexKey(url) : url
    const maxAttempts = 2
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const { pdf, retryable } = await fetchAndValidatePdf(fetchUrl, signal, maxBytes)
      if (pdf) return { buffer: pdf.buffer, usedUrl: url }
      if (!retryable || attempt === maxAttempts) return null
    }
    return null
  } catch {
    return null
  } finally {
    dispose()
  }
}

export async function downloadFirstPdf(
  urls: string[],
  opts?: {
    signal?: AbortSignal
    maxBytes?: number
    perFetchTimeoutMs?: number
    totalBudgetMs?: number
    /** URLs that arrive after the race starts (e.g. a resolver running in
     *  parallel), they JOIN the race instead of blocking its start. */
    lateUrls?: Promise<string[]>
  },
): Promise<PdfDownloadResult | null> {
  const maxBytes = opts?.maxBytes ?? LITERATURE_MAX_PDF_SIZE
  const perFetchTimeoutMs = opts?.perFetchTimeoutMs ?? PDF_DEFAULT_PER_FETCH_TIMEOUT_MS
  const totalBudgetMs = opts?.totalBudgetMs ?? PDF_DEFAULT_TOTAL_BUDGET_MS
  if (urls.length === 0 && !opts?.lateUrls) return null

  const controller = new AbortController()
  const onParentAbort = () => controller.abort()
  if (opts?.signal?.aborted) controller.abort()
  else opts?.signal?.addEventListener("abort", onParentAbort)
  const budget = setTimeout(() => controller.abort(), totalBudgetMs)
  try {
    return await new Promise<PdfDownloadResult | null>((resolve) => {
      const seen = new Set<string>()
      let pending = 0
      let moreComing = Boolean(opts?.lateUrls)
      const settleIfDrained = () => {
        if (pending === 0 && !moreComing) resolve(null)
      }
      const enter = (url: string) => {
        if (!url || seen.has(url)) return
        seen.add(url)
        pending++
        void tryDownloadOnePdf(url, controller.signal, maxBytes, perFetchTimeoutMs).then((r) => {
          pending--
          if (r) {
            resolve(r)
            controller.abort() // cancel the losers
          } else {
            settleIfDrained()
          }
        })
      }
      for (const url of urls) enter(url)
      if (opts?.lateUrls) {
        void opts.lateUrls.then((late) => {
          moreComing = false
          for (const url of late) enter(url)
          settleIfDrained()
        })
      } else {
        settleIfDrained()
      }
    })
  } finally {
    clearTimeout(budget)
    controller.abort()
    opts?.signal?.removeEventListener("abort", onParentAbort)
  }
}

function searchPaperFromPmidOrPmc(pmid: string | null, pmcRaw: string | null): SearchPaper | null {
  const pmcDigits = pmcRaw?.replace(/^PMC/i, "").trim() ?? ""
  const validPmc = /^\d+$/.test(pmcDigits) ? pmcDigits : null
  const validPmid = pmid?.trim() || null
  if (!validPmid && !validPmc) return null
  return {
    id: validPmid ?? `pmc-${validPmc}`,
    title: "",
    authors: [],
    year: new Date().getFullYear(),
    journal: "",
    abstract: "",
    isOpenAccess: true,
    pmid: validPmid ?? undefined,
    pdfUrl: validPmc ? `https://pmc.ncbi.nlm.nih.gov/articles/PMC${validPmc}/pdf/` : undefined,
    source: "PubMed",
  }
}

/**
 * Server-only: fetches a PMC PDF via PubMed linkage (same logic as staging import).
 * No CORS, safe from Route Handlers / Server Actions. Fails if PMID has no PMC id,
 * NLM cannot serve bytes (e.g. POW interstitial), or the article is not in the OA subset
 * where no direct PDF URL exists.
 */
export async function fetchOpenAccessPdfBufferByIds(params: {
  pmid?: string | null
  pmc?: string | null
}): Promise<{ buffer: ArrayBuffer; usedUrl: string }> {
  const paper = searchPaperFromPmidOrPmc(params.pmid ?? null, params.pmc ?? null)
  if (!paper) {
    throw new Error("Provide a PubMed ID (pmid) and/or PMC id (pmc)")
  }
  const { urls, resolution, oaPackageTgzUrl } = await resolvePmcOaPdfUrls(paper)
  if (resolution !== "open_access_urls_ready" || urls.length === 0) {
    throw new Error("Could not resolve any PDF URL for this id")
  }
  // Background import (not the interactive attach): allow generous budgets so a
  // large legitimate PDF still completes, matching the old unbounded behavior.
  const direct = await downloadFirstPdf(urls, { perFetchTimeoutMs: 30_000, totalBudgetMs: 45_000 })
  if (direct) return direct
  if (oaPackageTgzUrl) {
    const fromTgz = await fetchPdfFromOaPackageTgz(oaPackageTgzUrl)
    if (fromTgz) return fromTgz
  }
  throw new Error("Could not download a PDF from any resolved URL")
}

export async function importLiteraturePdfFromRemote(params: {
  supabase: SupabaseClient
  userId: string
  literatureId: string
  pdfUrls: string[]
  oaPackageTgzUrl?: string | null
  matchSource: PdfMatchSource
  catalogNote?: string
  /**
   * Title to verify the downloaded PDF against. When set together with
   * `accessToken`, the catalyst /literature/pdf/verify endpoint is called
   * before download. If verification fails (confidence < threshold), this
   * function throws `PdfContentVerificationFailedError` and no PDF is stored.
   * Pass null / undefined to keep the legacy "trust the URL" behavior.
   */
  expectedTitle?: string | null
  /** Supabase access token used for the catalyst verify call. */
  accessToken?: string | null
  /** Optional override; defaults to catalyst's server-side default (0.55). */
  verifyThreshold?: number
  /** When set, write the downloaded bytes through to the shared OA-PDF cache. */
  cacheKey?: string | null
}) {
  if (params.pdfUrls.length === 0 && !params.oaPackageTgzUrl) {
    throw new Error("No PDF URLs to try")
  }

  console.log(
    `[oa] import-start literatureId=${params.literatureId} candidates=${params.pdfUrls.length}` +
      ` hosts=[${params.pdfUrls.map(safeHost).join(",")}]` +
      (params.oaPackageTgzUrl ? " tgz=1" : ""),
  )

  // Content verification (Phase 3 of snuggly-meandering-pinwheel).
  // When the expected title and an access token are provided, route the
  // candidate URLs through catalyst first so we only download PDFs that
  // demonstrably match the paper.
  let verifyResult: PdfVerifyResponse | null = null
  let pdfUrlsToTry = params.pdfUrls
  const expectedTitle = params.expectedTitle?.trim()
  if (expectedTitle && params.accessToken && params.pdfUrls.length > 0) {
    verifyResult = await verifyPdfCandidatesViaCatalyst({
      candidateUrls: params.pdfUrls,
      expectedTitle,
      accessToken: params.accessToken,
      ...(params.verifyThreshold != null ? { threshold: params.verifyThreshold } : {}),
    })
    if (verifyResult) {
      if (!verifyResult.verified_url) {
        throw new PdfContentVerificationFailedError(
          verifyResult.confidence,
          verifyResult.tried.map((t) => t.url)
        )
      }
      // Restrict the download to the URL that verified.
      pdfUrlsToTry = [verifyResult.verified_url]
    }
  }

  let buffer: ArrayBuffer
  let usedUrl: string
  if (pdfUrlsToTry.length > 0) {
    const r = await downloadFirstPdf(pdfUrlsToTry, { perFetchTimeoutMs: 30_000, totalBudgetMs: 45_000 })
    if (r) {
      buffer = r.buffer
      usedUrl = r.usedUrl
    } else {
      if (!params.oaPackageTgzUrl) throw new Error("Could not download a PDF from any resolved URL")
      const fromTgz = await fetchPdfFromOaPackageTgz(params.oaPackageTgzUrl)
      if (!fromTgz) throw new Error("Could not download a PDF from any resolved URL")
      buffer = fromTgz.buffer
      usedUrl = fromTgz.usedUrl
    }
  } else {
    const fromTgz = await fetchPdfFromOaPackageTgz(params.oaPackageTgzUrl!)
    if (!fromTgz) throw new Error("OA package did not contain a valid PDF")
    buffer = fromTgz.buffer
    usedUrl = fromTgz.usedUrl
  }

  console.log(
    `[oa] import-ok literatureId=${params.literatureId} won=${safeHost(usedUrl)}` +
      ` bytes=${buffer.byteLength}`,
  )

  const triedUrls = [...params.pdfUrls, ...(params.oaPackageTgzUrl ? [params.oaPackageTgzUrl] : [])]
  await persistLiteraturePdfBuffer({
    supabase: params.supabase,
    userId: params.userId,
    literatureId: params.literatureId,
    buffer,
    usedUrl,
    triedUrls,
    matchSource: params.matchSource,
    catalogNote: params.catalogNote ?? null,
    verifyResult,
    cacheKey: params.cacheKey ?? null,
  })
}

/**
 * Store downloaded PDF bytes for a literature row: upload to the per-user
 * literature path, checksum, and mark the row `success`. Shared by the remote
 * import path and the shared-cache reuse path. When `cacheKey` is set, the bytes
 * are also written through to the shared OA-PDF cache (best-effort) so a later
 * tag/read of the same paper skips the network.
 */
async function persistLiteraturePdfBuffer(params: {
  supabase: SupabaseClient
  userId: string
  literatureId: string
  buffer: ArrayBuffer
  usedUrl: string
  triedUrls: string[]
  matchSource: PdfMatchSource
  catalogNote?: string | null
  verifyResult?: PdfVerifyResponse | null
  cacheKey?: string | null
}): Promise<void> {
  const len = params.buffer.byteLength
  const checksum = createHash("sha256").update(Buffer.from(params.buffer)).digest("hex")
  const fileName = `${params.literatureId}.pdf`
  const storagePath = createLiteraturePdfPath(params.userId, params.literatureId, fileName)
  const storage = params.supabase.storage.from(getLiteratureStorageBucket())

  const { error: uploadError } = await storage.upload(storagePath, params.buffer, {
    cacheControl: "3600",
    upsert: false,
    contentType: "application/pdf",
  })

  if (uploadError) {
    throw new Error(uploadError.message)
  }

  const pdfMetadata: Record<string, unknown> = {
    source_url: params.usedUrl,
    tried_urls: params.triedUrls,
    ...(params.catalogNote ? { note: params.catalogNote } : {}),
  }
  if (params.verifyResult) {
    pdfMetadata.pdf_match_confidence = params.verifyResult.confidence
    pdfMetadata.pdf_match_threshold = params.verifyResult.threshold
    if (params.verifyResult.extracted_title) {
      pdfMetadata.pdf_extracted_title_snippet = params.verifyResult.extracted_title
    }
  }

  const { error: updateError } = await params.supabase
    .from("literature_reviews")
    .update({
      pdf_file_url: storagePath,
      pdf_file_name: clampText(fileName, "pdf_file_name"),
      pdf_file_size: len,
      pdf_file_type: clampText("application/pdf", "pdf_file_type"),
      pdf_storage_path: clampText(storagePath, "pdf_storage_path"),
      pdf_uploaded_at: new Date().toISOString(),
      pdf_checksum: clampText(checksum, "pdf_checksum"),
      pdf_match_source: clampText(params.matchSource, "pdf_match_source"),
      pdf_import_status: "success",
      pdf_metadata: pdfMetadata,
    })
    .eq("id", params.literatureId)

  if (updateError) {
    await storage.remove([storagePath])
    throw new Error(updateError.message)
  }

  if (params.cacheKey) {
    await writeOaPdfCache(params.cacheKey, params.buffer)
  }
}

/**
 * URLs that tend to return raw PDF bytes from the server (NLM `…/pdf` and `…/pdf/*.pdf` often serve a
 * JS Proof-of-Work interstitial instead). Same PMC article as the search card.
 */
function buildOaSubsetServerFetchablePdfUrls(
  oaDirectPdfUrl: string | null,
  pmcNumeric: string,
): string[] {
  const id = `PMC${pmcNumeric.replace(/^PMC/i, "")}`
  const raw: string[] = []
  if (oaDirectPdfUrl) raw.push(oaDirectPdfUrl)
  raw.push(
    `https://europepmc.org/backend/ptpmcrender.fcgi?accid=${encodeURIComponent(id)}&blobtype=pdf`,
    `https://europepmc.org/articles/${id}?pdf=render`,
  )
  const out: string[] = []
  for (const u of raw) {
    const t = upgradeInsecurePdfUrlIfKnownHost(u.trim())
    if (shouldTrySearchCardPdfUrl(t) && !out.includes(t)) out.push(t)
  }
  return out
}

export type TryImportPdfResult =
  | { ok: true; resolvedAbstract: string | null }
  | { ok: false; reason: "no_open_access_pdf"; resolvedAbstract: string | null }
  | { ok: false; reason: "fetch_failed"; message: string; resolvedAbstract: string | null }

/**
 * Resolve OA PDF candidate URLs from ALL of the paper's identifiers (card href, preprint DOIs,
 * OpenAlex, Europe PMC, PMC OA subset), then download the first that returns real PDF bytes.
 * Also surfaces a resolved abstract so callers can backfill a blank one. Keeps the PMC OA-subset
 * package fallback in the catch block (NLM `/pdf` often serves a POW interstitial, not bytes).
 */
export async function tryImportPdfForPaper(params: {
  supabase: SupabaseClient
  userId: string
  literatureId: string
  paper: SearchPaper
  matchSource: PdfMatchSource
  /** Signed-in user's email, passed to Unpaywall as the polite-pool contact. */
  contactEmail?: string | null
}): Promise<TryImportPdfResult> {
  console.log(
    `[lit] import-try literatureId=${params.literatureId} source=${params.matchSource} doi=${params.paper.doi ?? "-"} pmid=${params.paper.pmid ?? "-"}`,
  )

  // Deterministic "already have it" short-circuit. Every entry point (stage a
  // search hit, save to library, drag-drop) funnels through here, so checking the
  // row's own stored PDF once, not just the TTL OA cache below, which expires
  // is what stops the same paper being re-resolved and re-downloaded on reopen.
  const { data: existingRow } = await params.supabase
    .from("literature_reviews")
    .select("pdf_storage_path, pdf_import_status")
    .eq("id", params.literatureId)
    .maybeSingle()
  if (existingRow?.pdf_import_status === "success" && existingRow.pdf_storage_path) {
    console.log(
      `[lit] import-skip literatureId=${params.literatureId} reason=already_stored path=${existingRow.pdf_storage_path}`,
    )
    return { ok: true as const, resolvedAbstract: params.paper.abstract ?? null }
  }

  // Shared OA-PDF cache: if this exact paper was already downloaded (e.g. tagged
  // into chat first), reuse those bytes instead of re-resolving + re-downloading.
  const cacheKey = oaPdfCacheKey(params.paper)
  if (cacheKey) {
    const cached = await readOaPdfCache(cacheKey)
    if (cached) {
      try {
        await persistLiteraturePdfBuffer({
          supabase: params.supabase,
          userId: params.userId,
          literatureId: params.literatureId,
          buffer: cached,
          usedUrl: "oa-pdf-cache",
          triedUrls: [],
          matchSource: params.matchSource,
          catalogNote: "reused_shared_oa_pdf_cache",
        })
        console.log(`[lit] import-cache-hit literatureId=${params.literatureId} key=${cacheKey}`)
        return { ok: true as const, resolvedAbstract: params.paper.abstract ?? null }
      } catch {
        // Persisting the cached copy failed, fall through to a fresh fetch.
      }
    }
  }

  const resolved = await resolveOaSources(params.paper, { contactEmail: params.contactEmail })
  const pdfUrls = resolved.pdfUrls
  const resolvedAbstract = resolved.abstract

  if (pdfUrls.length === 0 && !resolved.oaPackageTgzUrl) {
    await params.supabase
      .from("literature_reviews")
      .update({
        pdf_import_status: "none",
        pdf_metadata: { note: "no_open_access_pdf_resolved" },
      })
      .eq("id", params.literatureId)
    console.log(`[lit] import-none literatureId=${params.literatureId} reason=no_open_access_pdf`)
    return { ok: false as const, reason: "no_open_access_pdf" as const, resolvedAbstract }
  }

  try {
    await importLiteraturePdfFromRemote({
      supabase: params.supabase,
      userId: params.userId,
      literatureId: params.literatureId,
      pdfUrls,
      oaPackageTgzUrl: resolved.oaPackageTgzUrl,
      matchSource: params.matchSource,
      cacheKey,
    })
    return { ok: true as const, resolvedAbstract }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "PDF import failed"
    const pmc = await resolvePmcOaPdfUrls(params.paper)
    let oaFallbackMeta: Record<string, unknown> = {}

    if (pmc.resolution === "open_access_urls_ready" && pmc.pmcNumeric) {
      const fallbackUrls = buildOaSubsetServerFetchablePdfUrls(
        pmc.oaDirectPdfUrl,
        pmc.pmcNumeric,
      )
      try {
        await importLiteraturePdfFromRemote({
          supabase: params.supabase,
          userId: params.userId,
          literatureId: params.literatureId,
          pdfUrls: fallbackUrls,
          oaPackageTgzUrl: pmc.oaPackageTgzUrl,
          matchSource: params.matchSource,
          catalogNote:
            "after_resolved_urls_non_pdf: OA subset mirrors / OA package (NLM /pdf may return POW interstitial)",
          cacheKey,
        })
        return { ok: true as const, resolvedAbstract }
      } catch (e2: unknown) {
        oaFallbackMeta = {
          oa_subset_fallback_tried_urls: [...fallbackUrls, ...(pmc.oaPackageTgzUrl ? [pmc.oaPackageTgzUrl] : [])],
          oa_subset_fallback_error: e2 instanceof Error ? e2.message : "PDF import failed",
        }
      }
    }

    await params.supabase
      .from("literature_reviews")
      .update({
        pdf_import_status: "failed",
        pdf_metadata: {
          import_error: message,
          tried_urls: pdfUrls,
          ...oaFallbackMeta,
        },
      })
      .eq("id", params.literatureId)
    console.log(`[lit] import-fail literatureId=${params.literatureId} reason=fetch_failed msg=${message}`)
    return { ok: false as const, reason: "fetch_failed" as const, message, resolvedAbstract }
  }
}
