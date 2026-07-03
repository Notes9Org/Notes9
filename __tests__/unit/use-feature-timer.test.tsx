/**
 * Tests for hooks/use-feature-timer.ts after its rewire from the custom
 * telemetry pipeline to PostHog: the pure route→feature mapping, and that a
 * dwell of >= 500ms emits a `feature_view` PostHog event on unmount.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'

let mockPathname = '/experiments'
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}))

const captureMock = vi.fn()
vi.mock('posthog-js', () => ({
  default: { capture: (...args: unknown[]) => captureMock(...args) },
}))

// PostHog reported as configured so the isPostHogConfigured() guard lets
// capture through in this test.
vi.mock('@/lib/analytics/posthog', () => ({
  isPostHogConfigured: () => true,
}))

import { featureFromPathname, useFeatureTimer } from '@/hooks/use-feature-timer'

describe('featureFromPathname', () => {
  it('maps known first segments to stable feature labels', () => {
    expect(featureFromPathname('/experiments')).toBe('experiments')
    expect(featureFromPathname('/lab-notes/123')).toBe('lab_notes')
    expect(featureFromPathname('/research-map')).toBe('research_map')
    expect(featureFromPathname('/catalyst')).toBe('catalyst')
    expect(featureFromPathname('/agent-studio')).toBe('agent_studio')
  })

  it('falls back to "other" for unmapped paths', () => {
    expect(featureFromPathname('/totally-unknown')).toBe('other')
    expect(featureFromPathname('/')).toBe('other')
  })

  it('ignores query-string-like content (path segment only)', () => {
    expect(featureFromPathname('/literature/search')).toBe('literature')
  })
})

describe('useFeatureTimer dwell emission', () => {
  beforeEach(() => {
    captureMock.mockReset()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('emits a feature_view PostHog event with duration on unmount when dwell >= 500ms', () => {
    mockPathname = '/experiments'
    const { unmount } = renderHook(() => useFeatureTimer())

    // Simulate the user dwelling for 600ms.
    vi.advanceTimersByTime(600)
    unmount()

    expect(captureMock).toHaveBeenCalledTimes(1)
    const [event, props] = captureMock.mock.calls[0]
    expect(event).toBe('feature_view')
    expect(props.feature).toBe('experiments')
    expect(props.duration_ms).toBeGreaterThanOrEqual(500)
  })

  it('does NOT emit for a sub-500ms bounce', () => {
    mockPathname = '/experiments'
    const { unmount } = renderHook(() => useFeatureTimer())
    vi.advanceTimersByTime(100)
    unmount()
    expect(captureMock).not.toHaveBeenCalled()
  })
})
