/**
 * Unpaywall OA PDF resolution (server-only).
 *
 * Unpaywall (https://unpaywall.org/products/api) is the canonical "where is the
 * free, legally-hosted PDF for this DOI" service — it aggregates OA copies across
 * every publisher and repository, so it routinely finds a non-gated mirror when
 * OpenAlex / Europe PMC / a guessed publisher URL do not. This is the single most
 * reliable locator for "the paper is open access but we still couldn't fetch it".
 *
 * Unpaywall requires a real contact email (it rejects placeholders and 422s
 * without one) — but it does NOT need a *registered* address: any reachable email
 * identifies the caller to their polite pool. So the caller passes the signed-in
 * user's own email (we already have it from Supabase auth); `UNPAYWALL_EMAIL` is
 * only an optional override. When no email is available at all, every function
 * here no-ops gracefully (returns null) so callers fall back to other resolvers.
 */

import { unstable_cache } from "next/cache"

const FETCH_TIMEOUT_MS = 8000

type UnpaywallOaLocation = {
  url_for_pdf?: string | null
  url?: string | null
  host_type?: string | null
  version?: string | null
}

type UnpaywallResponse = {
  error?: boolean
  is_oa?: boolean
  best_oa_location?: UnpaywallOaLocation | null
  oa_locations?: UnpaywallOaLocation[] | null
}

/**
 * Resolve the contact email to send to Unpaywall: the caller-supplied address
 * (the signed-in user's email) first, then an optional `UNPAYWALL_EMAIL` override.
 * A blank/whitespace value is treated as absent.
 */
export function unpaywallContactEmail(preferred?: string | null): string | null {
  const fromUser = preferred?.trim()
  if (fromUser) return fromUser
  const fromEnv = process.env.UNPAYWALL_EMAIL?.trim()
  return fromEnv || null
}

/** True when an Unpaywall contact email is available (user email or env override). */
export function unpaywallEnabled(preferred?: string | null): boolean {
  return Boolean(unpaywallContactEmail(preferred))
}

/** Normalize a DOI to Unpaywall's expected bare lowercase form. */
function normalizeDoi(doi: string | null | undefined): string | null {
  if (!doi) return null
  const d = doi
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .trim()
    .toLowerCase()
  return d || null
}

function firstHttpUrl(...candidates: Array<string | null | undefined>): string | null {
  for (const c of candidates) {
    if (typeof c === "string" && /^https?:\/\//i.test(c.trim())) return c.trim()
  }
  return null
}

/** Pick a PDF URL from an Unpaywall payload: prefer `best_oa_location`, then any
 *  `oa_locations` entry. Accepts a `.url` only when it clearly points at a PDF. */
export function extractPdfFromUnpaywallPayload(data: UnpaywallResponse): string | null {
  const fromLoc = (loc: UnpaywallOaLocation | null | undefined): string | null => {
    if (!loc) return null
    const byPdf = firstHttpUrl(loc.url_for_pdf)
    if (byPdf) return byPdf
    if (loc.url && /\.pdf(\?|#|$)/i.test(String(loc.url))) return String(loc.url).trim()
    return null
  }
  const best = fromLoc(data.best_oa_location)
  if (best) return best
  for (const loc of data.oa_locations ?? []) {
    const u = fromLoc(loc)
    if (u) return u
  }
  return null
}

/**
 * Harvest EVERY OA PDF URL Unpaywall knows for a work, ordered by how likely the
 * host is to serve the PDF without a bot-wall:
 *   1. `best_oa_location` (Unpaywall's own pick)
 *   2. repository / green-OA copies (institutional repos, PMC, arXiv, Zenodo) —
 *      these almost never bot-wall, so they rescue papers whose publisher does
 *      (Elsevier/Cell 403, Nature Cloudflare, etc.)
 *   3. everything else (publisher gold-OA: Frontiers, PLOS, MDPI, …)
 * Deduped, order-preserving. Returning many candidates lets the downloader race
 * them and keep the first that actually yields PDF bytes — the core of robust,
 * publisher-agnostic OA retrieval.
 */
export function extractAllPdfUrlsFromUnpaywallPayload(data: UnpaywallResponse): string[] {
  const pdfOf = (loc: UnpaywallOaLocation | null | undefined): string | null => {
    if (!loc) return null
    const byPdf = firstHttpUrl(loc.url_for_pdf)
    if (byPdf) return byPdf
    if (loc.url && /\.pdf(\?|#|$)/i.test(String(loc.url))) return String(loc.url).trim()
    return null
  }
  const locations = data.oa_locations ?? []
  const repository = locations.filter((l) => (l.host_type ?? "").toLowerCase() === "repository")
  const other = locations.filter((l) => (l.host_type ?? "").toLowerCase() !== "repository")

  const ordered: Array<UnpaywallOaLocation | null | undefined> = [
    data.best_oa_location,
    ...repository,
    ...other,
  ]
  const seen = new Set<string>()
  const urls: string[] = []
  for (const loc of ordered) {
    const u = pdfOf(loc)
    if (u && !seen.has(u)) {
      seen.add(u)
      urls.push(u)
    }
  }
  return urls
}

/**
 * Raw Unpaywall lookup by (already-normalized) DOI + contact email. Timed out
 * via AbortController — same pattern as lib/supabase/middleware.ts — so one
 * slow/hanging Unpaywall response can't stall a request indefinitely.
 */
// Throws on any non-result (network error, not OA, no PDF) so the caller's cache
// wrapper never stores a negative — a transient Unpaywall timeout must not
// suppress a real OA PDF for the whole cache window.
async function fetchUnpaywallPdfUrlsOrThrow(normalizedDoi: string, email: string): Promise<string[]> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const apiUrl = `https://api.unpaywall.org/v2/${encodeURIComponent(normalizedDoi)}?email=${encodeURIComponent(email)}`
    const res = await fetch(apiUrl, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = (await res.json()) as UnpaywallResponse
    if (data.error === true) throw new Error("unpaywall error flag")
    const urls = extractAllPdfUrlsFromUnpaywallPayload(data)
    if (urls.length === 0) throw new Error("no OA PDF")
    return urls
  } finally {
    clearTimeout(timeoutId)
  }
}

// A resolved DOI → OA PDF location set is effectively immutable, so cache
// successes for a day. `unstable_cache` does NOT cache thrown errors, so
// negatives (miss/timeout) are retried on the next lookup rather than pinned 24h.
const cachedFetchUnpaywallPdfUrls = unstable_cache(
  fetchUnpaywallPdfUrlsOrThrow,
  ["unpaywall-doi-lookup"],
  { revalidate: 60 * 60 * 24 },
)

/**
 * Resolve a DOI to ALL known OA PDF URLs via Unpaywall, ordered best/repository
 * first. Returns `[]` on any failure (no email, network error, not OA) — best-effort.
 */
export async function resolveUnpaywallPdfUrls(
  doi: string | null | undefined,
  contactEmail?: string | null,
): Promise<string[]> {
  const email = unpaywallContactEmail(contactEmail)
  if (!email) return []
  const normalized = normalizeDoi(doi)
  if (!normalized) return []
  try {
    return await cachedFetchUnpaywallPdfUrls(normalized, email)
  } catch (e) {
    console.warn("[unpaywall] lookup failed for DOI", normalized, e instanceof Error ? e.message : String(e))
    return []
  }
}

/** Best single OA PDF URL for a DOI (first of {@link resolveUnpaywallPdfUrls}). */
export async function resolveUnpaywallPdfUrl(
  doi: string | null | undefined,
  contactEmail?: string | null,
): Promise<string | null> {
  return (await resolveUnpaywallPdfUrls(doi, contactEmail))[0] ?? null
}
