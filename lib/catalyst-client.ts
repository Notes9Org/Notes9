/**
 * Thin HTTP client for the catalyst FastAPI service (AI/catalyst/).
 *
 * Catalyst is the same FastAPI app that already serves /chat and /biomni —
 * `/literature/*` routes are mounted on it. We resolve the base URL from
 * `CATALYST_URL` (preferred, for forward-compat if catalyst ever splits off)
 * and fall back to the existing `CHAT_API_URL` so no new env var is needed.
 *
 * Used by:
 *  - `app/api/search-papers/route.ts` → POST /literature/search
 *  - `lib/literature-pdf-import.ts`    → POST /literature/pdf/verify (Phase 3)
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

function catalystBaseUrl(): string {
  const raw = (process.env.CATALYST_URL?.trim() || process.env.CHAT_API_URL?.trim()) ?? ""
  if (!raw) {
    throw new CatalystUnavailableError(
      "Neither CATALYST_URL nor CHAT_API_URL is configured. Set one to the catalyst FastAPI base URL."
    )
  }
  return raw.replace(/\/+$/, "")
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
