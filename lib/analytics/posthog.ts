/**
 * lib/analytics/posthog.ts
 *
 * Shared PostHog configuration. PostHog is the single product-analytics tool
 * for Notes9 (traffic, WAU/MAU, retention, feature usage, per-user activity,
 * and geo-IP location). It replaces the old custom `usage_events` pipeline.
 *
 * The project key (`phc_...`) is a PUBLIC client-side key by design, it is
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

/**
 * UI host, where the PostHog app itself lives (toolbar, links, session-replay
 * playback). Only meaningful when POSTHOG_HOST points at a managed reverse
 * proxy (e.g. https://r.notes9.com); PostHog then needs this to resolve app
 * URLs. Defaults to the US app host to match the US ingestion region.
 */
const _uiHost = process.env.NEXT_PUBLIC_POSTHOG_UI_HOST
export const POSTHOG_UI_HOST =
  _uiHost && _uiHost.length > 0 ? _uiHost : 'https://us.posthog.com'

/** True only when a project key is configured. */
export function isPostHogConfigured(): boolean {
  return POSTHOG_KEY.length > 0
}
