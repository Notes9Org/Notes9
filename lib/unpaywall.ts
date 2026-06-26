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

type UnpaywallOaLocation = {
  url_for_pdf?: string | null
  url?: string | null
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
 * Resolve a single DOI to its best OA PDF URL via Unpaywall. Returns `null` on any
 * failure (no email configured, network error, not OA, no PDF) — best-effort.
 */
export async function resolveUnpaywallPdfUrl(
  doi: string | null | undefined,
  contactEmail?: string | null,
): Promise<string | null> {
  const email = unpaywallContactEmail(contactEmail)
  if (!email) return null
  const normalized = normalizeDoi(doi)
  if (!normalized) return null
  try {
    const apiUrl = `https://api.unpaywall.org/v2/${encodeURIComponent(normalized)}?email=${encodeURIComponent(email)}`
    const res = await fetch(apiUrl, { headers: { Accept: "application/json" }, next: { revalidate: 0 } })
    if (!res.ok) return null
    const data = (await res.json()) as UnpaywallResponse
    if (data.error === true) return null
    return extractPdfFromUnpaywallPayload(data)
  } catch (e) {
    console.warn("[unpaywall] lookup failed for DOI", normalized, e instanceof Error ? e.message : String(e))
    return null
  }
}
