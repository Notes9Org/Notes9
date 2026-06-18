/**
 * lib/telemetry/track.ts
 *
 * Lightweight product-telemetry emitter (Workstream A).
 *
 * PURPOSE
 * -------
 * Captures product-analytics events (page views, feature dwell time, key user
 * actions) and delivers them in batches to /api/telemetry/events. This is
 * SEPARATE from CloudWatch RUM (lib/rum.ts), which captures infrastructure
 * metrics. These events feed the "Nani" usage dashboard (Workstream B).
 *
 * PII DISCIPLINE — read this before adding fields
 * ------------------------------------------------
 * `properties` MUST contain ONLY:
 *   - Opaque IDs (entity UUIDs, route slugs, enum values)
 *   - Counts / sizes / durations (integers)
 *   - Fixed taxonomy labels (strings from a known enum)
 *   - Boolean flags
 *
 * NEVER put in `properties` (or any other field on a tracked event):
 *   - Free text the user typed (queries, note content, search strings)
 *   - Email addresses or display names
 *   - Any PII whatsoever
 *
 * user_id and organization_id are derived server-side by the ingest route
 * from the auth token. The client does NOT send them — only the per-tab
 * client_session_id (an opaque UUID with no link to any user identifier).
 *
 * DESIGN
 * ------
 * - Batched: events queue in memory; flush on timer, visibility change, and
 *   unload. Keeps network round-trips minimal.
 * - SSR-safe: every DOM/window access is guarded by `typeof window !== 'undefined'`.
 * - Zero dependencies: no third-party libraries.
 * - Fail-soft: flush errors are caught and logged to console.warn only.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TrackOptions {
  /** The product feature area (e.g. 'experiments', 'lab_notes', 'catalyst'). */
  feature?: string
  /** The UI surface within that feature (e.g. 'editor', 'sidebar', 'chat'). */
  surface?: string
  /**
   * Structured metadata. Opaque IDs, counts, and enum labels ONLY.
   * NEVER include free text the user typed or any PII.
   */
  properties?: Record<string, string | number | boolean | null>
  /** Elapsed time in milliseconds (e.g. feature dwell time). */
  durationMs?: number
}

interface QueuedEvent {
  event_name: string
  feature?: string
  surface?: string
  properties: Record<string, string | number | boolean | null>
  duration_ms?: number
  occurred_at: string
  client_session_id: string
}

// ---------------------------------------------------------------------------
// Session ID
// ---------------------------------------------------------------------------

/**
 * A per-tab opaque UUID, stored in sessionStorage. It is NOT linked to any
 * user identity on the client side — the ingest route resolves user_id from
 * the auth cookie. The session ID is used only to group events within a single
 * browser tab session for funnel analysis.
 */
function getClientSessionId(): string {
  if (typeof window === 'undefined') return 'ssr'
  try {
    const key = 'n9_tel_sid'
    let sid = sessionStorage.getItem(key)
    if (!sid) {
      sid = crypto.randomUUID()
      sessionStorage.setItem(key, sid)
    }
    return sid
  } catch {
    // sessionStorage unavailable (e.g. private browsing in some browsers)
    return 'no-storage'
  }
}

// ---------------------------------------------------------------------------
// Internal queue and flush logic
// ---------------------------------------------------------------------------

const _queue: QueuedEvent[] = []
let _flushTimer: ReturnType<typeof setTimeout> | null = null
const FLUSH_INTERVAL_MS = 5_000
const FLUSH_ENDPOINT = '/api/telemetry/events'

function _enqueue(event: QueuedEvent): void {
  _queue.push(event)
  // Start the debounce timer if not already running.
  if (_flushTimer === null && typeof window !== 'undefined') {
    _flushTimer = setTimeout(_flush, FLUSH_INTERVAL_MS)
  }
}

async function _flush(): Promise<void> {
  if (typeof window === 'undefined') return
  _flushTimer = null

  if (_queue.length === 0) return

  // Drain the queue atomically to avoid losing events on concurrent flush.
  const batch = _queue.splice(0, _queue.length)
  if (batch.length === 0) return

  const body = JSON.stringify({ events: batch })

  try {
    // Prefer sendBeacon for unload scenarios (non-blocking, best-effort).
    if (
      typeof navigator !== 'undefined' &&
      typeof navigator.sendBeacon === 'function'
    ) {
      const sent = navigator.sendBeacon(
        FLUSH_ENDPOINT,
        new Blob([body], { type: 'application/json' })
      )
      if (sent) return
      // sendBeacon returns false when the queue is full — fall through to fetch.
    }

    // Fallback: fetch with keepalive so it survives a page navigation.
    await fetch(FLUSH_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    })
  } catch (err) {
    // Telemetry must never break the app. Log and discard.
    if (typeof console !== 'undefined') {
      console.warn('[telemetry] flush failed', err)
    }
  }
}

// ---------------------------------------------------------------------------
// Page-lifecycle listeners (registered once, lazily)
// ---------------------------------------------------------------------------

let _listenersRegistered = false

function _ensureListeners(): void {
  if (_listenersRegistered || typeof window === 'undefined') return
  _listenersRegistered = true

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      _flush()
    }
  })

  window.addEventListener('pagehide', _flush)

  // beforeunload is a fallback — pagehide is preferred on mobile.
  window.addEventListener('beforeunload', _flush)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Track a product analytics event.
 *
 * SSR-safe: this function is a no-op when called during server-side rendering.
 *
 * @param eventName   Short, snake_case event identifier (e.g. 'feature_view',
 *                    'button_click', 'catalyst_query_submitted').
 * @param options     Optional metadata. See TrackOptions for PII constraints.
 *
 * @example
 *   // Feature view with dwell time (emitted by use-feature-timer)
 *   track('feature_view', { feature: 'experiments', durationMs: 4200 })
 *
 *   // Action with structured context — NO free text, only IDs/enums
 *   track('catalyst_submitted', { feature: 'catalyst', properties: { mode: 'rag' } })
 */
export function track(
  eventName: string,
  options: TrackOptions = {}
): void {
  // No-op in SSR.
  if (typeof window === 'undefined') return

  _ensureListeners()

  const event: QueuedEvent = {
    event_name: eventName,
    ...(options.feature !== undefined && { feature: options.feature }),
    ...(options.surface !== undefined && { surface: options.surface }),
    properties: options.properties ?? {},
    ...(options.durationMs !== undefined && { duration_ms: Math.round(options.durationMs) }),
    occurred_at: new Date().toISOString(),
    client_session_id: getClientSessionId(),
  }

  _enqueue(event)
}

/**
 * Force an immediate flush of the pending event queue.
 * Normally not needed — the timer and visibility change handle this.
 * Exposed for testing and for critical event paths.
 */
export function flushTelemetry(): Promise<void> {
  return _flush()
}

/**
 * Return the current queue length (for testing).
 * @internal
 */
export function _queueLength(): number {
  return _queue.length
}

/**
 * Clear the queue without flushing (for testing).
 * @internal
 */
export function _clearQueue(): void {
  _queue.length = 0
  if (_flushTimer !== null) {
    clearTimeout(_flushTimer)
    _flushTimer = null
  }
}
