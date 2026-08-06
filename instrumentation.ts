/**
 * instrumentation.ts
 *
 * Next.js server instrumentation. The `onRequestError` hook forwards
 * server-side exceptions (Server Components, route handlers, server actions)
 * into PostHog Error Tracking, attributed to the user when the PostHog cookie
 * is present.
 *
 * Fully inert when NEXT_PUBLIC_POSTHOG_KEY is unset.
 */

import type { Instrumentation } from 'next'

/**
 * PostHog stores the browser distinct_id in a cookie named
 * `ph_<projectApiKey>_posthog` holding JSON like { distinct_id, ... }.
 * Parse it best-effort from the request Cookie header so server exceptions
 * link to the same person as client events.
 */
function distinctIdFromCookie(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
  if (!key) return undefined
  try {
    const name = `ph_${key}_posthog`
    for (const part of cookieHeader.split(';')) {
      const [rawName, ...rest] = part.trim().split('=')
      if (rawName !== name) continue
      const decoded = decodeURIComponent(rest.join('='))
      const parsed = JSON.parse(decoded) as { distinct_id?: string }
      return typeof parsed.distinct_id === 'string' ? parsed.distinct_id : undefined
    }
  } catch {
    // Malformed/absent cookie, attribute anonymously.
  }
  return undefined
}

export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context
) => {
  // Error Tracking capture only runs on the Node.js runtime (posthog-node).
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return

  try {
    const { captureServerException, flushServer } = await import(
      '@/lib/analytics/posthog-server'
    )
    const cookieHeader =
      (request.headers?.cookie as string | undefined) ??
      (request.headers?.['cookie'] as string | undefined)
    const distinctId = distinctIdFromCookie(cookieHeader)
    captureServerException(err, distinctId, {
      path: request.path ?? null,
      method: request.method ?? null,
      router: context.routerKind ?? null,
      route: context.routePath ?? null,
    })
    await flushServer()
  } catch {
    // Instrumentation must never break request handling.
  }
}
