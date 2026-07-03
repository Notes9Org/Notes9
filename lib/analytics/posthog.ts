/**
 * lib/analytics/posthog.ts
 *
 * Shared PostHog configuration. PostHog is the single product-analytics tool
 * for Notes9 (traffic, WAU/MAU, retention, feature usage, per-user activity,
 * and geo-IP location). It replaces the old custom `usage_events` pipeline.
 *
 * The project key (`phc_...`) is a PUBLIC client-side key by design — it is
 * safe to ship in the browser bundle. Everything is inert when the key is
 * unset, so local dev / preview without keys never breaks.
 */

/** Public PostHog project key (safe to expose client-side). */
export const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? ''

/**
 * PostHog ingestion host. Must match the cloud region of your PostHog project
 * (US = `https://us.i.posthog.com`, EU = `https://eu.i.posthog.com`).
 */
const _host = process.env.NEXT_PUBLIC_POSTHOG_HOST
export const POSTHOG_HOST =
  _host && _host.length > 0 ? _host : 'https://us.i.posthog.com'

/** True only when a project key is configured. */
export function isPostHogConfigured(): boolean {
  return POSTHOG_KEY.length > 0
}
