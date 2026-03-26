/**
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
  resolution: LiteraturePmcPdfResolution
}> {
  let pmcNum = extractPmcNumericId(paper)
  if (!pmcNum && paper.pmid) {
    pmcNum = await fetchPmcIdFromPmid(paper.pmid)
  }

  if (!pmcNum) {
    return { urls: [], oaPackageTgzUrl: null, resolution: "no_pmc" }
  }

  const oa = await queryPmcOpenAccessSubset(pmcNum)
  if (!oa.ok) {
    return { urls: [], oaPackageTgzUrl: null, resolution: "oa_subset_check_failed" }
  }
  if (!oa.inSubset) {
    return { urls: [], oaPackageTgzUrl: null, resolution: "not_pmc_open_access" }
  }

  const urls: string[] = []
  if (oa.oaPdfHttpsUrl) urls.push(oa.oaPdfHttpsUrl)
  urls.push(...buildPmcPdfCandidateUrls(pmcNum))

  return {
    urls: [...new Set(urls)],
    oaPackageTgzUrl: oa.oaTgzHttpsUrl,
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

export async function tryImportPdfForPaper(params: {
  supabase: SupabaseClient
  userId: string
  literatureId: string
  paper: SearchPaper
  matchSource: PdfMatchSource
}) {
  const { urls: pdfUrls, oaPackageTgzUrl, resolution } = await resolvePmcOaPdfUrls(params.paper)

  if (resolution === "no_pmc") {
    await params.supabase
      .from("literature_reviews")
      .update({ pdf_import_status: "none", pdf_metadata: null })
      .eq("id", params.literatureId)
    return { ok: false as const, reason: "no_open_access_pdf" as const }
  }

  if (resolution === "not_pmc_open_access") {
    await params.supabase
      .from("literature_reviews")
      .update({
        pdf_import_status: "none",
        pdf_metadata: { not_pmc_open_access_subset: true },
      })
      .eq("id", params.literatureId)
    return { ok: false as const, reason: "not_pmc_open_access" as const }
  }

  if (resolution === "oa_subset_check_failed") {
    await params.supabase
      .from("literature_reviews")
      .update({
        pdf_import_status: "none",
        pdf_metadata: { pmc_oa_check_failed: true },
      })
      .eq("id", params.literatureId)
    return { ok: false as const, reason: "oa_subset_check_failed" as const }
  }

  try {
    await importLiteraturePdfFromRemote({
      supabase: params.supabase,
      userId: params.userId,
      literatureId: params.literatureId,
      pdfUrls,
      oaPackageTgzUrl,
      matchSource: params.matchSource,
    })
    return { ok: true as const }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "PDF import failed"
    await params.supabase
      .from("literature_reviews")
      .update({
        pdf_import_status: "failed",
        pdf_metadata: {
          import_error: message,
          tried_urls: [...pdfUrls, ...(oaPackageTgzUrl ? [oaPackageTgzUrl] : [])],
        },
      })
      .eq("id", params.literatureId)
    return { ok: false as const, reason: "fetch_failed" as const, message }
  }
}
