import posthog from 'posthog-js'
import { isPostHogConfigured } from './posthog'

/**
 * Did anyone actually learn the shortcuts?
 *
 * The point of putting hints next to controls is that researchers pick bindings
 * up while working. Without this event that claim is unfalsifiable: before it,
 * the only events in the app were `$pageview` and `feature_view`, so there was
 * no way to tell a keyboard invocation from a click, and no baseline to compare
 * a release against.
 *
 * One event, two facts: which action, and how it was reached.
 */
export type ShortcutInvocationSource = 'keyboard' | 'pointer'

export function trackShortcutInvocation(
  id: string,
  via: ShortcutInvocationSource,
): void {
  if (!isPostHogConfigured()) return
  try {
    posthog.capture('shortcut_invoked', { shortcut_id: id, via })
  } catch {
    // Telemetry must never take an action down with it — the user pressed a key
    // and expects the thing to happen, not to hear about our analytics.
  }
}
