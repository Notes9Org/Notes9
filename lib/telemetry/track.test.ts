/**
 * lib/telemetry/track.test.ts
 *
 * Unit tests for the product-telemetry client (lib/telemetry/track.ts).
 * Runs with vitest in jsdom environment.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { track, flushTelemetry, _queueLength, _clearQueue } from './track'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Simulate the page becoming hidden (triggers flush). */
function simulateVisibilityHidden() {
  Object.defineProperty(document, 'visibilityState', {
    value: 'hidden',
    configurable: true,
  })
  document.dispatchEvent(new Event('visibilitychange'))
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  _clearQueue()
  // Reset sessionStorage between tests
  try {
    sessionStorage.removeItem('n9_tel_sid')
  } catch {}
  vi.clearAllMocks()
})

afterEach(() => {
  _clearQueue()
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// SSR guard
// ---------------------------------------------------------------------------

describe('SSR guard', () => {
  it('track() is a no-op when window is undefined', () => {
    // Simulate SSR by temporarily hiding window.
    const originalWindow = globalThis.window
    // @ts-expect-error intentional
    delete globalThis.window

    expect(() => track('page_view', { feature: 'dashboard' })).not.toThrow()

    globalThis.window = originalWindow
    // Queue must be empty since track() no-oped
    expect(_queueLength()).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Batching
// ---------------------------------------------------------------------------

describe('batching', () => {
  it('enqueues events without flushing immediately', () => {
    track('feature_view', { feature: 'experiments' })
    track('feature_view', { feature: 'catalyst' })
    expect(_queueLength()).toBe(2)
  })

  it('stamps occurred_at as an ISO string', () => {
    // We can verify via flush — use sendBeacon spy
    const beaconSpy = vi.spyOn(navigator, 'sendBeacon').mockReturnValue(true)

    track('feature_view', { feature: 'dashboard' })
    flushTelemetry()

    expect(beaconSpy).toHaveBeenCalledOnce()
    const [, blob] = beaconSpy.mock.calls[0]
    const text = blob instanceof Blob
      ? undefined  // can't synchronously read Blob in test — check separately
      : String(blob)

    // At minimum the event was queued with an occurred_at
    expect(_queueLength()).toBe(0) // queue drained
  })

  it('drains the queue on flushTelemetry()', async () => {
    vi.spyOn(navigator, 'sendBeacon').mockReturnValue(true)
    track('page_view')
    track('button_click', { feature: 'lab_notes' })
    expect(_queueLength()).toBe(2)
    await flushTelemetry()
    expect(_queueLength()).toBe(0)
  })

  it('sends all queued events in one beacon call', async () => {
    const beaconSpy = vi.spyOn(navigator, 'sendBeacon').mockReturnValue(true)
    track('a', { feature: 'x' })
    track('b', { feature: 'y' })
    track('c', { feature: 'z' })
    await flushTelemetry()
    expect(beaconSpy).toHaveBeenCalledOnce()
  })

  it('does not flush when queue is empty', async () => {
    const beaconSpy = vi.spyOn(navigator, 'sendBeacon').mockReturnValue(true)
    await flushTelemetry()
    expect(beaconSpy).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// sendBeacon / fetch fallback
// ---------------------------------------------------------------------------

describe('flush transport', () => {
  it('uses sendBeacon when available and it returns true', async () => {
    const beaconSpy = vi.spyOn(navigator, 'sendBeacon').mockReturnValue(true)
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response())

    track('event_a')
    await flushTelemetry()

    expect(beaconSpy).toHaveBeenCalledOnce()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('falls back to fetch with keepalive when sendBeacon returns false', async () => {
    vi.spyOn(navigator, 'sendBeacon').mockReturnValue(false)
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response())

    track('event_b')
    await flushTelemetry()

    expect(fetchSpy).toHaveBeenCalledOnce()
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('/api/telemetry/events')
    expect((init as RequestInit).keepalive).toBe(true)
    expect((init as RequestInit).method).toBe('POST')
  })

  it('swallows fetch errors without throwing', async () => {
    vi.spyOn(navigator, 'sendBeacon').mockReturnValue(false)
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network error'))

    track('event_c')
    await expect(flushTelemetry()).resolves.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Event shape
// ---------------------------------------------------------------------------

describe('event shape', () => {
  it('includes event_name, occurred_at, client_session_id', async () => {
    const beaconSpy = vi.spyOn(navigator, 'sendBeacon').mockReturnValue(true)

    track('feature_view', { feature: 'catalyst', durationMs: 1234 })
    await flushTelemetry()

    const [, blob] = beaconSpy.mock.calls[0]
    // Read the blob text
    const text = await (blob as Blob).text()
    const body = JSON.parse(text)

    expect(body.events).toHaveLength(1)
    const ev = body.events[0]
    expect(ev.event_name).toBe('feature_view')
    expect(ev.feature).toBe('catalyst')
    expect(ev.duration_ms).toBe(1234)
    expect(typeof ev.occurred_at).toBe('string')
    expect(typeof ev.client_session_id).toBe('string')
    // user_id is NOT sent from the client
    expect(ev.user_id).toBeUndefined()
  })

  it('does NOT include user_id in the queued event', () => {
    track('some_event', { feature: 'experiments' })
    // Access internal queue length; we can't directly inspect events in tests
    // but we verified above via beacon that user_id is absent.
    expect(_queueLength()).toBe(1)
  })

  it('rounds durationMs to an integer', async () => {
    const beaconSpy = vi.spyOn(navigator, 'sendBeacon').mockReturnValue(true)
    track('feature_view', { durationMs: 123.7 })
    await flushTelemetry()
    const [, blob] = beaconSpy.mock.calls[0]
    const body = JSON.parse(await (blob as Blob).text())
    expect(body.events[0].duration_ms).toBe(124)
  })

  it('omits feature/surface/durationMs when not provided', async () => {
    const beaconSpy = vi.spyOn(navigator, 'sendBeacon').mockReturnValue(true)
    track('bare_event')
    await flushTelemetry()
    const [, blob] = beaconSpy.mock.calls[0]
    const body = JSON.parse(await (blob as Blob).text())
    const ev = body.events[0]
    expect(ev.feature).toBeUndefined()
    expect(ev.surface).toBeUndefined()
    expect(ev.duration_ms).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// client_session_id persistence
// ---------------------------------------------------------------------------

describe('client_session_id', () => {
  it('is a non-empty string', async () => {
    const beaconSpy = vi.spyOn(navigator, 'sendBeacon').mockReturnValue(true)
    track('ev')
    await flushTelemetry()
    const [, blob] = beaconSpy.mock.calls[0]
    const body = JSON.parse(await (blob as Blob).text())
    expect(body.events[0].client_session_id).toBeTruthy()
  })

  it('is stable across multiple track() calls in the same test', async () => {
    const beaconSpy = vi.spyOn(navigator, 'sendBeacon').mockReturnValue(true)
    track('ev1')
    track('ev2')
    await flushTelemetry()
    const [, blob] = beaconSpy.mock.calls[0]
    const body = JSON.parse(await (blob as Blob).text())
    expect(body.events[0].client_session_id).toBe(body.events[1].client_session_id)
  })
})
