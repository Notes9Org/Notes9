/**
 * **Staging / repository import from search** tries **`SearchPaper.pdfUrl`** first (same href as the PDF
 * icon), with PMC `…/pdf` → `…/pdf/main.pdf` when the path is the bare folder.
 * If NLM returns HTML (common: Proof-of-Work interstitial on `pmc.ncbi.nlm.nih.gov/.../pdf`), falls back
 * to **PMC Open Access Subset** sources for the **same** article (Europe PMC mirrors + `oa.fcgi` package URL).
 * ScienceDirect `pdfft` URLs are skipped on the server (session-bound).
 *
 * PMC open-access PDF pipeline (server-only; NCBI does not support CORS for these endpoints).
 *
 * 1. **Discovery** — [PMC OA Web Service](https://pmc.ncbi.nlm.nih.gov/tools/oa-service/)
 *    (`https://www.ncbi.nlm.nih.gov/pmc/utils/oa/oa.fcgi?id=PMC…`): XML with
 *    `<link format="pdf" …>` and/or `<link format="tgz" …>` (OA package on FTP as `.tar.gz`).
 * 2. **Download** — [PMC FTP](https://pmc.ncbi.nlm.nih.gov/tools/ftp/) via **HTTPS** (`ftp://` → `https://`).
 *    If only `tgz` is listed, gzip+tar is parsed server-side to extract the `.pdf` (no browser).
 * 3. **PMID → PMCID** — E-utilities `elink` (this module) or
 *    [PMC ID Converter API](https://pmc.ncbi.nlm.nih.gov/tools/id-converter-api/); `oa.fcgi` expects PMC IDs.
 *
 * Next.js must call this from Server Actions, Route Handlers, or other server code — never the browser alone.
 */
import { createHash } from "crypto"

import type { SearchPaper } from "@/types/paper-search"
import type { PdfMatchSource } from "@/types/literature-pdf"
import {
  clampText,
  createLiteraturePdfPath,
  getLiteratureStorageBucket,
  validatePdfBuffer,
} from "@/lib/literature-pdf-storage"
import { extractFirstPdfFromTarGz } from "@/lib/pmc-oa-package-pdf"
import type { SupabaseClient } from "@supabase/supabase-js"

/** Shown in User-Agent for NCBI/PMC polite use — must be a reachable contact URL. */
const NOTES9_CONTACT = process.env.NOTES9_CONTACT_URL ?? "https://notes9.com"

const NCBI_USER_AGENT = `Mozilla/5.0 (compatible; Notes9/1.0; +${NOTES9_CONTACT}) literature-pdf-import`

function pdfFetchHeaders(pdfUrl: string): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": NCBI_USER_AGENT,
    Accept: "application/pdf,application/octet-stream,*/*;q=0.8",
  }
  try {
    const host = new URL(pdfUrl).hostname.toLowerCase()
    if (host.includes("ncbi.nlm.nih.gov") || host.endsWith("nih.gov")) {
      headers.Referer = "https://www.ncbi.nlm.nih.gov/"
    } else if (host.includes("europepmc.org")) {
      headers.Referer = "https://europepmc.org/"
    } else if (host.includes("ebi.ac.uk")) {
      headers.Referer = "https://www.ebi.ac.uk/"
    }
  } catch {
    /* ignore invalid URL */
  }
  return headers
}

/**
 * PMID → numeric PMC id via E-utilities `elink` (PubMed → PMC).
 * Prefer `linkname=pubmed_pmc` so we never pick a cited article from `pubmed_pmc_refs`.
 * @see https://pmc.ncbi.nlm.nih.gov/tools/id-converter-api/ (alternative official converter)
 */
export async function fetchPmcIdFromPmid(pmid: string): Promise<string | null> {
  const url = new URL("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/elink.fcgi")
  url.searchParams.set("dbfrom", "pubmed")
  url.searchParams.set("db", "pmc")
  url.searchParams.set("id", pmid.trim())
  url.searchParams.set("retmode", "json")
  const apiKey = process.env.NCBI_API_KEY
  if (apiKey) url.searchParams.set("api_key", apiKey)

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": NCBI_USER_AGENT },
    next: { revalidate: 0 },
  })
  if (!res.ok) return null

  const data = (await res.json()) as {
    linksets?: Array<{
      linksetdbs?: Array<{
        dbto?: string
        linkname?: string
        links?: Array<string | { id?: string }>
      }>
    }>
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
 * PMC often serves HTML at .../pdf/ while the file is at .../pdf/main.pdf.
 * Try several mirrors and path patterns.
 */
export function buildPmcPdfCandidateUrls(pmcNumeric: string): string[] {
  const id = `PMC${pmcNumeric.replace(/^PMC/i, "")}`
  return [
    `https://pmc.ncbi.nlm.nih.gov/articles/${id}/pdf/main.pdf`,
    `https://www.ncbi.nlm.nih.gov/pmc/articles/${id}/pdf/main.pdf`,
    `https://europepmc.org/backend/ptpmcrender.fcgi?accid=${encodeURIComponent(id)}&blobtype=pdf`,
    `https://pmc.ncbi.nlm.nih.gov/articles/${id}/pdf/`,
    `https://www.ncbi.nlm.nih.gov/pmc/articles/${id}/pdf/`,
    `https://europepmc.org/articles/${id}?pdf=render`,
  ]
}

/**
 * PMC OA Web Service (`oa.fcgi`) — **only** articles in the PMC Open Access Subset
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
    const res = await fetch(requestUrl, {
      headers: { "User-Agent": NCBI_USER_AGENT },
      next: { revalidate: 0 },
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

async function resolvePmcOaPdfUrls(paper: SearchPaper): Promise<{
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

  if (!pmcNum) {
    return {
      urls: [],
      oaPackageTgzUrl: null,
      oaDirectPdfUrl: null,
      pmcNumeric: null,
      resolution: "no_pmc",
    }
  }

  const oa = await queryPmcOpenAccessSubset(pmcNum)
  if (!oa.ok) {
    return {
      urls: [],
      oaPackageTgzUrl: null,
      oaDirectPdfUrl: null,
      pmcNumeric: pmcNum,
      resolution: "oa_subset_check_failed",
    }
  }
  if (!oa.inSubset) {
    return {
      urls: [],
      oaPackageTgzUrl: null,
      oaDirectPdfUrl: null,
      pmcNumeric: pmcNum,
      resolution: "not_pmc_open_access",
    }
  }

  const urls: string[] = []
  if (oa.oaPdfHttpsUrl) urls.push(oa.oaPdfHttpsUrl)
  urls.push(...buildPmcPdfCandidateUrls(pmcNum))

  return {
    urls: [...new Set(urls)],
    oaPackageTgzUrl: oa.oaTgzHttpsUrl,
    oaDirectPdfUrl: oa.oaPdfHttpsUrl,
    pmcNumeric: pmcNum,
    resolution: "open_access_urls_ready",
  }
}

/**
 * URLs for automatic PDF download: **PMC Open Access Subset only** (confirmed via NLM
 * `oa.fcgi`), then NLM/Europe PMC mirrors. Non-OA PMC and publisher links are excluded.
 */
export async function collectLiteraturePdfFetchUrls(paper: SearchPaper): Promise<string[]> {
  const { urls } = await resolvePmcOaPdfUrls(paper)
  return urls
}

async function fetchPdfFromOaPackageTgz(tgzHttpsUrl: string): Promise<{ buffer: ArrayBuffer; usedUrl: string } | null> {
  const response = await fetch(tgzHttpsUrl, {
    headers: pdfFetchHeaders(tgzHttpsUrl),
    redirect: "follow",
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

async function fetchFirstPdfBuffer(urls: string[]): Promise<{ buffer: ArrayBuffer; usedUrl: string }> {
  let lastIssue = "Source did not return a PDF"

  for (const pdfUrl of urls) {
    try {
      const response = await fetch(pdfUrl, {
        headers: pdfFetchHeaders(pdfUrl),
        redirect: "follow",
      })
      if (!response.ok) {
        lastIssue = `Failed to fetch PDF (${response.status})`
        continue
      }

      const buffer = await response.arrayBuffer()
      const len = buffer.byteLength
      const headerErr = validatePdfBuffer(len, new Uint8Array(buffer.slice(0, 8)))
      if (!headerErr) {
        return { buffer, usedUrl: pdfUrl }
      }
      lastIssue = headerErr
    } catch (e) {
      lastIssue = e instanceof Error ? e.message : "Fetch failed"
    }
  }

  throw new Error(lastIssue)
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
 * No CORS — safe from Route Handlers / Server Actions. Fails if PMID has no PMC id,
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
  try {
    return await fetchFirstPdfBuffer(urls)
  } catch (e) {
    if (!oaPackageTgzUrl) throw e
    const fromTgz = await fetchPdfFromOaPackageTgz(oaPackageTgzUrl)
    if (!fromTgz) throw e
    return fromTgz
  }
}

export async function importLiteraturePdfFromRemote(params: {
  supabase: SupabaseClient
  userId: string
  literatureId: string
  pdfUrls: string[]
  oaPackageTgzUrl?: string | null
  matchSource: PdfMatchSource
  catalogNote?: string
}) {
  if (params.pdfUrls.length === 0 && !params.oaPackageTgzUrl) {
    throw new Error("No PDF URLs to try")
  }

  let buffer: ArrayBuffer
  let usedUrl: string
  if (params.pdfUrls.length > 0) {
    try {
      const r = await fetchFirstPdfBuffer(params.pdfUrls)
      buffer = r.buffer
      usedUrl = r.usedUrl
    } catch (e) {
      if (!params.oaPackageTgzUrl) throw e
      const fromTgz = await fetchPdfFromOaPackageTgz(params.oaPackageTgzUrl)
      if (!fromTgz) throw e
      buffer = fromTgz.buffer
      usedUrl = fromTgz.usedUrl
    }
  } else {
    const fromTgz = await fetchPdfFromOaPackageTgz(params.oaPackageTgzUrl!)
    if (!fromTgz) throw new Error("OA package did not contain a valid PDF")
    buffer = fromTgz.buffer
    usedUrl = fromTgz.usedUrl
  }

  const len = buffer.byteLength
  const triedUrls = [...params.pdfUrls, ...(params.oaPackageTgzUrl ? [params.oaPackageTgzUrl] : [])]

  const checksum = createHash("sha256").update(Buffer.from(buffer)).digest("hex")
  const fileName = `${params.literatureId}.pdf`
  const storagePath = createLiteraturePdfPath(params.userId, params.literatureId, fileName)
  const storage = params.supabase.storage.from(getLiteratureStorageBucket())

  const { error: uploadError } = await storage.upload(storagePath, buffer, {
    cacheControl: "3600",
    upsert: false,
    contentType: "application/pdf",
  })

  if (uploadError) {
    throw new Error(uploadError.message)
  }

  const { data: urlData } = storage.getPublicUrl(storagePath)
  const { error: updateError } = await params.supabase
    .from("literature_reviews")
    .update({
      pdf_file_url: urlData.publicUrl,
      pdf_file_name: clampText(fileName, "pdf_file_name"),
      pdf_file_size: len,
      pdf_file_type: clampText("application/pdf", "pdf_file_type"),
      pdf_storage_path: clampText(storagePath, "pdf_storage_path"),
      pdf_uploaded_at: new Date().toISOString(),
      pdf_checksum: clampText(checksum, "pdf_checksum"),
      pdf_match_source: clampText(params.matchSource, "pdf_match_source"),
      pdf_import_status: "success",
      pdf_metadata: {
        source_url: usedUrl,
        tried_urls: triedUrls,
        ...(params.catalogNote ? { note: params.catalogNote } : {}),
      },
    })
    .eq("id", params.literatureId)

  if (updateError) {
    await storage.remove([storagePath])
    throw new Error(updateError.message)
  }
}

/**
 * Links we can attempt from the server (same href as the search card PDF button).
 * EuropePMC / EBI often return `http://`; we upgrade known hosts to `https` before fetch.
 */
function shouldTrySearchCardPdfUrl(url: string): boolean {
  const u = url.trim()
  if (!/^https?:\/\//i.test(u)) return false
  const lower = u.toLowerCase()
  if (lower.includes("sciencedirect.com") && lower.includes("pdfft")) return false
  return true
}

function upgradeInsecurePdfUrlIfKnownHost(url: string): string {
  try {
    const parsed = new URL(url.trim())
    if (parsed.protocol !== "http:") return url.trim()
    const host = parsed.hostname.toLowerCase()
    const upgrade =
      host.includes("europepmc.org") ||
      host.includes("ebi.ac.uk") ||
      host.endsWith("nih.gov")
    if (!upgrade) return url.trim()
    parsed.protocol = "https:"
    return parsed.toString()
  } catch {
    return url.trim()
  }
}

/**
 * Only URLs tied to what search showed — primary card href, then same-article fallbacks (PMC folder → main.pdf).
 */
function expandSearchCardPdfUrls(cardUrl: string): string[] {
  const primary = upgradeInsecurePdfUrlIfKnownHost(cardUrl.trim())
  const out: string[] = []
  const add = (raw: string) => {
    const t = upgradeInsecurePdfUrlIfKnownHost(raw.trim())
    if (shouldTrySearchCardPdfUrl(t) && !out.includes(t)) out.push(t)
  }
  add(primary)
  try {
    const parsed = new URL(primary)
    const host = parsed.hostname.toLowerCase()
    const isNlmPmc =
      host === "pmc.ncbi.nlm.nih.gov" ||
      host === "www.ncbi.nlm.nih.gov"
    if (isNlmPmc) {
      const path = parsed.pathname.replace(/\/+$/, "")
      if (path.endsWith("/pdf") && !path.toLowerCase().endsWith(".pdf")) {
        add(`${parsed.origin}${path}/main.pdf`)
      }
    }
  } catch {
    /* ignore */
  }
  return out
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

/**
 * Import from `paper.pdfUrl` first; if the response is not a PDF (e.g. NLM POW page), use OA-subset
 * mirrors / package for the **same** PMC article.
 */
export async function tryImportPdfForPaper(params: {
  supabase: SupabaseClient
  userId: string
  literatureId: string
  paper: SearchPaper
  matchSource: PdfMatchSource
}) {
  const cardPdf = params.paper.pdfUrl?.trim()
  if (!cardPdf) {
    await params.supabase
      .from("literature_reviews")
      .update({
        pdf_import_status: "none",
        pdf_metadata: { note: "no_pdf_url_on_search_hit" },
      })
      .eq("id", params.literatureId)
    return { ok: false as const, reason: "no_open_access_pdf" as const }
  }

  const pdfUrls = expandSearchCardPdfUrls(cardPdf)
  if (pdfUrls.length === 0) {
    await params.supabase
      .from("literature_reviews")
      .update({
        pdf_import_status: "none",
        pdf_metadata: { search_pdf_url: cardPdf, note: "url_not_allowed_for_server_fetch" },
      })
      .eq("id", params.literatureId)
    return { ok: false as const, reason: "no_open_access_pdf" as const }
  }

  try {
    await importLiteraturePdfFromRemote({
      supabase: params.supabase,
      userId: params.userId,
      literatureId: params.literatureId,
      pdfUrls,
      oaPackageTgzUrl: null,
      matchSource: params.matchSource,
    })
    return { ok: true as const }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "PDF import failed"
    const resolved = await resolvePmcOaPdfUrls(params.paper)
    let oaFallbackMeta: Record<string, unknown> = {}

    if (resolved.resolution === "open_access_urls_ready" && resolved.pmcNumeric) {
      const fallbackUrls = buildOaSubsetServerFetchablePdfUrls(
        resolved.oaDirectPdfUrl,
        resolved.pmcNumeric,
      )
      try {
        await importLiteraturePdfFromRemote({
          supabase: params.supabase,
          userId: params.userId,
          literatureId: params.literatureId,
          pdfUrls: fallbackUrls,
          oaPackageTgzUrl: resolved.oaPackageTgzUrl,
          matchSource: params.matchSource,
          catalogNote:
            "after_search_card_url_non_pdf: OA subset mirrors / OA package (NLM /pdf may return POW interstitial)",
        })
        return { ok: true as const }
      } catch (e2: unknown) {
        oaFallbackMeta = {
          oa_subset_fallback_tried_urls: [...fallbackUrls, ...(resolved.oaPackageTgzUrl ? [resolved.oaPackageTgzUrl] : [])],
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
          search_pdf_url: cardPdf,
          ...oaFallbackMeta,
        },
      })
      .eq("id", params.literatureId)
    return { ok: false as const, reason: "fetch_failed" as const, message }
  }
}
