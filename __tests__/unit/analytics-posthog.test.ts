/**
 * Tests for the PostHog analytics layer that replaced the custom usage_events
 * pipeline + AWS RUM: config resolution, the lib/rum compatibility shim, and
 * the server-side capture helper. All must be fail-soft and inert when
 * PostHog is unconfigured.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// lib/rum.ts — recordRumEvent forwards to posthog.capture (compat shim)
// ---------------------------------------------------------------------------

const captureMock = vi.fn()
vi.mock('posthog-js', () => ({
  default: { capture: (...args: unknown[]) => captureMock(...args) },
}))

describe('lib/rum recordRumEvent (PostHog shim)', () => {
  beforeEach(() => {
    captureMock.mockReset()
    // Configured so the isPostHogConfigured() guard lets capture through.
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_test')
    vi.resetModules()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('forwards event name and data to posthog.capture', async () => {
    const { recordRumEvent } = await import('@/lib/rum')
    recordRumEvent('auth_signed_in', { method: 'password' })
    expect(captureMock).toHaveBeenCalledTimes(1)
    expect(captureMock).toHaveBeenCalledWith('auth_signed_in', {
      method: 'password',
    })
  })

  it('defaults data to an empty object', async () => {
    const { recordRumEvent } = await import('@/lib/rum')
    recordRumEvent('page_ready')
    expect(captureMock).toHaveBeenCalledWith('page_ready', {})
  })

  it('never throws when posthog.capture throws (fail-soft)', async () => {
    captureMock.mockImplementationOnce(() => {
      throw new Error('network down')
    })
    const { recordRumEvent } = await import('@/lib/rum')
    expect(() => recordRumEvent('boom', {})).not.toThrow()
  })

  it('is inert (never calls capture) when PostHog is unconfigured', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', '')
    vi.resetModules()
    const { recordRumEvent } = await import('@/lib/rum')
    recordRumEvent('auth_signed_in', { method: 'password' })
    expect(captureMock).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// lib/analytics/posthog.ts — config resolution
// ---------------------------------------------------------------------------

describe('lib/analytics/posthog config', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('isPostHogConfigured() is false when the key is unset', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', '')
    vi.resetModules()
    const mod = await import('@/lib/analytics/posthog')
    expect(mod.isPostHogConfigured()).toBe(false)
  })

  it('isPostHogConfigured() is true when a key is present', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_test123')
    vi.resetModules()
    const mod = await import('@/lib/analytics/posthog')
    expect(mod.isPostHogConfigured()).toBe(true)
    expect(mod.POSTHOG_KEY).toBe('phc_test123')
  })

  it('defaults the host to US cloud when unset', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_HOST', '')
    vi.resetModules()
    const mod = await import('@/lib/analytics/posthog')
    expect(mod.POSTHOG_HOST).toBe('https://us.i.posthog.com')
  })

  it('honours an explicit EU host', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_HOST', 'https://eu.i.posthog.com')
    vi.resetModules()
    const mod = await import('@/lib/analytics/posthog')
    expect(mod.POSTHOG_HOST).toBe('https://eu.i.posthog.com')
  })
})
