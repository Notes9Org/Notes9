/**
 * lib/analytics/posthog-server.ts
 *
 * Server-side PostHog capture, for events that must fire from route handlers
 * (e.g. AI calls in the Catalyst agent) so they can't be blocked client-side
 * and can carry authoritative props (model, token counts, cost).
 *
 * Fail-soft and inert when unconfigured: captureServer() never throws and is a
 * no-op without a key. Call flushServer() at the end of a request to ensure
 * events are delivered in short-lived serverless invocations.
 */

import { PostHog } from 'posthog-node'
import { POSTHOG_KEY, POSTHOG_HOST, isPostHogConfigured } from '@/lib/analytics/posthog'

let _client: PostHog | null = null

function getClient(): PostHog | null {
  if (!isPostHogConfigured()) return null
  if (!_client) {
    _client = new PostHog(POSTHOG_KEY, {
      host: POSTHOG_HOST,
      // Flush promptly; serverless invocations are short-lived.
      flushAt: 1,
      flushInterval: 0,
    })
  }
  return _client
}

/**
 * Capture a server-side event attributed to a user.
 * `properties` MUST contain only opaque ids / counts / enums, never free text.
 */
export function captureServer(
  distinctId: string,
  event: string,
  properties?: Record<string, string | number | boolean | null>
): void {
  try {
    const client = getClient()
    if (!client) return
    client.capture({ distinctId, event, properties })
  } catch (err) {
    console.warn('[posthog-server] capture failed', err)
  }
}

/**
 * Capture a server-side exception into PostHog Error Tracking.
 * `distinctId` is optional, pass the user id when known (e.g. parsed from the
 * PostHog cookie in the Next.js `onRequestError` hook) so the exception links
 * to a person. Never throws; inert when unconfigured.
 */
export function captureServerException(
  error: unknown,
  distinctId?: string,
  properties?: Record<string, string | number | boolean | null>
): void {
  try {
    const client = getClient()
    if (!client) return
    client.captureException(error, distinctId, properties)
  } catch (err) {
    console.warn('[posthog-server] captureException failed', err)
  }
}

/** Best-effort flush of queued server events. Safe to await. */
export async function flushServer(): Promise<void> {
  try {
    await _client?.flush()
  } catch {
    // ignore flush errors, telemetry must never break the request
  }
}
