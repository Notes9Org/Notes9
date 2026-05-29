/**
 * Shared SSRF allowlist / blocklist and search-card PDF URL helpers.
 *
 * Extracted from `literature-pdf-import.ts` so both that module and
 * `literature-oa-resolve.ts` can import these without creating a circular
 * import (literature-pdf-import.ts imports `resolveOaSources`, which in turn
 * imports these helpers).
 *
 * Server-only: every fetched URL must pass `shouldTrySearchCardPdfUrl` first.
 */

/**
 * Links we can attempt from the server (same href as the search card PDF button).
 * EuropePMC / EBI often return `http://`; we upgrade known hosts to `https` before fetch.
 */
export const PDF_HOSTNAME_ALLOWLIST: ReadonlyArray<string> = [
  "pubmed.ncbi.nlm.nih.gov",
  "www.ncbi.nlm.nih.gov",
  "ncbi.nlm.nih.gov",
  "pmc.ncbi.nlm.nih.gov",
  "europepmc.org",
  "www.ebi.ac.uk",
  "ebi.ac.uk",
  "www.biorxiv.org",
  "www.medrxiv.org",
  "biorxiv.org",
  "medrxiv.org",
  "arxiv.org",
  "www.arxiv.org",
  "www.nature.com",
  "www.science.org",
  "www.cell.com",
  "www.pnas.org",
  "pubs.acs.org",
  "onlinelibrary.wiley.com",
  "link.springer.com",
  "www.tandfonline.com",
  "journals.plos.org",
  "elifesciences.org",
  "www.frontiersin.org",
  "academic.oup.com",
  "www.thelancet.com",
  "jamanetwork.com",
  "ashpublications.org",
  "www.mdpi.com",
  "mdpi.com",
  "zenodo.org",
  "osf.io",
  "assets.researchsquare.com",
  "www.researchsquare.com",
  "www.jbc.org",
  "www.ahajournals.org",
  "www.embopress.org",
  "insight.jci.org",
  "www.jci.org",
  "downloads.hindawi.com",
]

export function hostnameIsBlocked(hostname: string): boolean {
  const h = hostname.toLowerCase()
  if (h === "localhost") return true
  if (h === "metadata.google.internal") return true
  if (/^169\.254\./.test(h)) return true
  if (/^127\./.test(h)) return true
  if (/^10\./.test(h)) return true
  if (/^192\.168\./.test(h)) return true
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) return true
  if (h === "::1") return true
  if (/^fc/.test(h) || /^fd/.test(h)) return true
  return false
}

export function hostnameIsAllowed(hostname: string): boolean {
  const h = hostname.toLowerCase()
  if (PDF_HOSTNAME_ALLOWLIST.includes(h)) return true
  return PDF_HOSTNAME_ALLOWLIST.some((allowed) => h.endsWith("." + allowed))
}

export function shouldTrySearchCardPdfUrl(url: string): boolean {
  const u = url.trim()
  if (!/^https?:\/\//i.test(u)) return false
  const lower = u.toLowerCase()
  if (lower.includes("sciencedirect.com") && lower.includes("pdfft")) return false
  try {
    const parsed = new URL(u)
    if (hostnameIsBlocked(parsed.hostname)) return false
    if (!hostnameIsAllowed(parsed.hostname)) return false
  } catch {
    return false
  }
  return true
}

export function upgradeInsecurePdfUrlIfKnownHost(url: string): string {
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
export function expandSearchCardPdfUrls(cardUrl: string): string[] {
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
