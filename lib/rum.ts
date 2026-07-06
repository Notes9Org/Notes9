/**
 * lib/rum.ts
 *
 * Compatibility shim. The app formerly used AWS CloudWatch RUM for event
 * recording. Product/error analytics are now unified on PostHog (one tool).
 * This module preserves the `recordRumEvent(type, data)` surface so existing
 * call sites keep working unchanged — every event is forwarded to PostHog.
 *
 * Fail-soft and inert when PostHog is unconfigured.
 */

import posthog from 'posthog-js'
import { isPostHogConfigured } from '@/lib/analytics/posthog'

/**
 * Record a client-side product/analytics event. Forwarded to PostHog.
 * `data` MUST contain only opaque ids / counts / enums — never free text/PII.
 *
 * Inert when PostHog is unconfigured (no key) so local/preview environments
 * never emit "you must initialize PostHog" console noise.
 */
export function recordRumEvent(
  type: string,
  data: Record<string, unknown> = {}
): void {
  try {
    if (typeof window === 'undefined' || !isPostHogConfigured()) return
    posthog.capture(type, data)
  } catch {
    // Analytics must never break the app.
  }
}

/**
 * Capture a client-side exception into PostHog Error Tracking (stack traces,
 * grouping, alerting) as a structured `$exception` — richer than the free-text
 * `page_error` product event. Callers should keep firing `recordRumEvent` too
 * where existing dashboards reference it.
 *
 * `context` MUST contain only opaque ids / enums / routes — never free text/PII.
 * Inert when PostHog is unconfigured; never throws.
 */
export function captureClientException(
  error: unknown,
  context: Record<string, unknown> = {}
): void {
  try {
    if (typeof window === 'undefined' || !isPostHogConfigured()) return
    posthog.captureException(error, context)
  } catch {
    // Error tracking must never break the app.
  }
}
