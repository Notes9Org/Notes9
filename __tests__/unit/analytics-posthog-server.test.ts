/**
 * Tests for lib/analytics/posthog-server.ts — the server-side capture helper.
 * Must be inert (no client constructed, no throw) when unconfigured, and
 * forward to posthog-node when a key is present.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const captureMock = vi.fn()
const flushMock = vi.fn().mockResolvedValue(undefined)
const ctorMock = vi.fn()

vi.mock('posthog-node', () => ({
  PostHog: class {
    constructor(...args: unknown[]) {
      ctorMock(...args)
    }
    capture = (...args: unknown[]) => captureMock(...args)
    flush = (...args: unknown[]) => flushMock(...args)
  },
}))

describe('captureServer', () => {
  beforeEach(() => {
    captureMock.mockReset()
    ctorMock.mockReset()
    flushMock.mockClear()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('is a no-op (no client constructed) when unconfigured', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', '')
    vi.resetModules()
    const { captureServer } = await import('@/lib/analytics/posthog-server')
    captureServer('user-1', 'ai_query_submitted', { model: 'opus' })
    expect(ctorMock).not.toHaveBeenCalled()
    expect(captureMock).not.toHaveBeenCalled()
  })

  it('forwards distinctId, event and properties when configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_test123')
    vi.resetModules()
    const { captureServer } = await import('@/lib/analytics/posthog-server')
    captureServer('user-1', 'ai_query_submitted', { model: 'opus', tokens: 42 })
    expect(captureMock).toHaveBeenCalledWith({
      distinctId: 'user-1',
      event: 'ai_query_submitted',
      properties: { model: 'opus', tokens: 42 },
    })
  })

  it('never throws when the underlying client throws (fail-soft)', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_test123')
    vi.resetModules()
    captureMock.mockImplementationOnce(() => {
      throw new Error('boom')
    })
    const { captureServer } = await import('@/lib/analytics/posthog-server')
    expect(() =>
      captureServer('user-1', 'evt', { a: 1 })
    ).not.toThrow()
  })

  it('flushServer resolves safely even when never configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', '')
    vi.resetModules()
    const { flushServer } = await import('@/lib/analytics/posthog-server')
    await expect(flushServer()).resolves.toBeUndefined()
  })
})
