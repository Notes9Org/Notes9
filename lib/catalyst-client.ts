/**
 * Thin HTTP client for the catalyst FastAPI service (AI/catalyst/), and the
 * SINGLE place that resolves every AI-backend base URL for the app.
 *
 * Catalyst is the same FastAPI app that already serves /chat and /biomni —
 * `/literature/*` routes are mounted on it. We resolve the base URL from
 * `CATALYST_URL` (preferred, for forward-compat if catalyst ever splits off)
 * and fall back to the existing `CHAT_API_URL` so no new env var is needed.
 *
 * Used by:
 *  - `app/api/search-papers/route.ts` → POST /literature/search
 *  - `lib/literature-pdf-import.ts`    → POST /literature/pdf/verify (Phase 3)
 *  - ~19 proxy routes under `app/api/{chat,agent,ai,literature,reports,usage}/*`
 *
 * A few backends are genuinely separate services (not the main catalyst
 * backend) and get their own clearly-named resolver below, still living in
 * this one file: `aiServiceBaseUrl()` (legacy AI_SERVICE_URL + its own bearer
 * token, used only when a route must choose between it and the Supabase-token
 * catalyst path), `biomniAgentJsonUrl()`/`biomniAgentStreamUrl()` (Biomni
 * literature research-design Lambda), and `compareAgentBaseUrl()`/
 * `compareAgentStreamUrl()` (paper-comparison agent, defaults to catalyst's
 * `/paper-analyzer`). See docs/ENVIRONMENT_VARIABLES.md for the full list.
 */

// The primary literature path is now a Claude web-search agent: live web search
// (several server-side fetches) + canonical grounding. That can run 40–110 s on
// a cold/loaded catalyst; the baseline DB fan-out is < 10 s. Cap at 150 s so the
// web agent's results actually reach the user — aborting earlier silently serves
// the stale legacy in-process DB search, which is exactly what we replaced.
const DEFAULT_TIMEOUT_MS = 150_000
const RETRY_STATUS = new Set([502, 503])

export class CatalystUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CatalystUnavailableError"
  }
}

export class CatalystHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown
  ) {
    super(message)
    this.name = "CatalystHttpError"
  }
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "")
}

/** First non-empty, trimmed, trailing-slash-stripped value; "" if none configured. */
function firstConfigured(...vars: Array<string | undefined>): string {
  for (const v of vars) {
    const trimmed = v?.trim()
    if (trimmed) return stripTrailingSlash(trimmed)
  }
  return ""
}

function resolveCatalystBaseUrl(): string {
  return firstConfigured(process.env.CATALYST_URL, process.env.CHAT_API_URL)
}

export function catalystBaseUrl(): string {
  const url = resolveCatalystBaseUrl()
  if (!url) {
    throw new CatalystUnavailableError(
      "Neither CATALYST_URL nor CHAT_API_URL is configured. Set one to the catalyst FastAPI base URL."
    )
  }
  return url
}

/** Same precedence as `catalystBaseUrl()` but returns "" instead of throwing when unconfigured. */
export function tryCatalystBaseUrl(): string {
  return resolveCatalystBaseUrl()
}

/**
 * Legacy alternate AI service (`AI_SERVICE_URL`), authenticated with a static
 * `AI_SERVICE_BEARER_TOKEN` instead of the user's Supabase token. Kept as its
 * own resolver (not folded into `catalystBaseUrl()`'s precedence) because
 * `app/api/{chat,ai/paper-chat,reports/generate}` need both values
 * independently to pick which auth branch to use.
 */
export function aiServiceBaseUrl(): string {
  return firstConfigured(process.env.AI_SERVICE_URL)
}

/** Biomni literature research-design agent — a separate Lambda, not the main catalyst backend. */
export function biomniAgentJsonUrl(): string {
  const explicit = firstConfigured(process.env.LITERATURE_BIOMNI_AGENT_URL)
  if (explicit) return explicit
  const base = firstConfigured(process.env.BIOMNI_FUNCTION_URL)
  return base ? `${base}/biomni/literature` : ""
}

export function biomniAgentStreamUrl(): string {
  const explicit = firstConfigured(process.env.LITERATURE_BIOMNI_STREAM_URL)
  if (explicit) return explicit
  const base = firstConfigured(process.env.BIOMNI_FUNCTION_URL)
  return base ? `${base}/biomni/literature/stream` : ""
}

/** Paper-comparison agent. Defaults to the main catalyst backend's `/paper-analyzer` path. */
export function compareAgentBaseUrl(): string {
  const explicit = firstConfigured(process.env.LITERATURE_COMPARE_AGENT_URL)
  if (explicit) return explicit
  const catalyst = tryCatalystBaseUrl()
  return catalyst ? `${catalyst}/paper-analyzer` : ""
}

export function compareAgentStreamUrl(): string {
  const explicit = firstConfigured(process.env.LITERATURE_COMPARE_STREAM_URL)
  if (explicit) return explicit
  const base = compareAgentBaseUrl()
  return base ? `${base}/stream` : ""
}

/** POST JSON to a catalyst path with the user's Supabase access token. */
export async function callCatalyst<TBody, TResp>(
  path: string,
  body: TBody,
  accessToken: string,
  options?: { timeoutMs?: number; signal?: AbortSignal }
): Promise<TResp> {
  const url = `${catalystBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS

  const attempt = async (): Promise<TResp> => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    if (options?.signal) {
      options.signal.addEventListener("abort", () => controller.abort(), {
        once: true,
      })
    }
    let res: Response
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }

    if (!res.ok) {
      let parsed: unknown
      try {
        parsed = await res.json()
      } catch {
        parsed = await res.text().catch(() => undefined)
      }
      const err = new CatalystHttpError(
        `Catalyst ${path} returned ${res.status}`,
        res.status,
        parsed
      )
      throw err
    }
    return (await res.json()) as TResp
  }

  try {
    return await attempt()
  } catch (e) {
    if (e instanceof CatalystHttpError && RETRY_STATUS.has(e.status)) {
      return await attempt()
    }
    throw e
  }
}
