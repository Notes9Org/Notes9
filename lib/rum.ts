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
