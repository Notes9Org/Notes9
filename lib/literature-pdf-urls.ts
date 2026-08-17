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

/**
 * Whether the hostname allowlist is *enforced* on PDF downloads.
 *
 * Off by default. The allowlist is 40 exact hostnames and it does not survive
 * contact with real open-access hosting: `doi.org` — which OpenAlex, Unpaywall
 * and Crossref hand back constantly — was absent, as were BMC, BMJ, Springer's
 * apex domain, figshare and every CDN. Enforcing it silently dropped those
 * downloads (`tryDownloadOnePdf` returns null, no error surfaced).
 *
 * The actual SSRF control is `safeFetch`, which resolves and rejects private,
 * loopback, link-local, ULA and IPv4-mapped addresses on every request and is
 * unconditional. This flag governs defence-in-depth only, never that guard.
 *
 * Read lazily rather than at module load so tests and server routes see the
 * current value; `process.env` is inlined to undefined in client bundles, which
 * lands on the safe default of "not enforced".
 */
export function pdfHostAllowlistEnforced(): boolean {
  const raw = (typeof process !== "undefined" ? process.env?.NOTES9_ENFORCE_PDF_HOST_ALLOWLIST : "") ?? ""
  return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase())
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

/**
 * The gate PDF download paths actually use.
 *
 * Splits the two controls that `shouldTrySearchCardPdfUrl` conflates:
 *
 *  - scheme check and `hostnameIsBlocked` are **always** applied. These are the
 *    SSRF pre-checks (N9-2) that keep a metadata-IP or loopback `pdfUrl` from
 *    ever reaching the network layer, and nothing here may switch them off.
 *  - `hostnameIsAllowed` is the *publisher* allowlist, applied only when
 *    `pdfHostAllowlistEnforced()` is on. Applying it unconditionally is what
 *    stopped open-access downloads: `doi.org` is not on the list.
 */
export function pdfUrlIsFetchable(url: string): boolean {
  const u = url.trim()
  if (!/^https?:\/\//i.test(u)) return false
  const lower = u.toLowerCase()
  if (lower.includes("sciencedirect.com") && lower.includes("pdfft")) return false
  try {
    const parsed = new URL(u)
    if (hostnameIsBlocked(parsed.hostname)) return false
    if (pdfHostAllowlistEnforced() && !hostnameIsAllowed(parsed.hostname)) return false
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
 * Only URLs tied to what search showed, primary card href, then same-article fallbacks (PMC folder → main.pdf).
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
