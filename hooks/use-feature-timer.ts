'use client'

/**
 * hooks/use-feature-timer.ts
 *
 * Feature-dwell timer hook (Workstream A).
 *
 * Tracks how long the user spends on each product feature and emits a
 * `feature_view` event via lib/telemetry/track.ts when the user navigates
 * away, the tab is hidden, or the component unmounts.
 *
 * Wire this ONCE in app/(app)/layout.tsx (the authenticated app shell) so
 * every route change is captured without polluting individual page components.
 *
 * Route-to-feature mapping is intentionally a small explicit map rather than
 * a regex taxonomy — the set of features is stable and known. Adding a new
 * feature requires one line here.
 *
 * PII: no user content is captured. The `feature` field is derived from the
 * URL path segment — never from query strings or content the user typed.
 */

import { useEffect, useRef, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { track } from '@/lib/telemetry/track'

// ---------------------------------------------------------------------------
// Route → feature mapping
// ---------------------------------------------------------------------------

/**
 * Map a pathname to a stable feature label.
 * Uses the first meaningful path segment after the locale/root.
 * Returns 'other' for unmapped paths.
 */
export function featureFromPathname(pathname: string): string {
  // Strip leading slash and split. The (app) route group is transparent.
  const segments = pathname.replace(/^\//, '').split('/')

  // The first non-empty segment names the feature area.
  const first = segments[0] ?? ''

  const FEATURE_MAP: Record<string, string> = {
    dashboard: 'dashboard',
    experiments: 'experiments',
    'lab-notes': 'lab_notes',
    'lab-notes-list': 'lab_notes',
    samples: 'samples',
    protocols: 'protocols',
    equipment: 'equipment',
    literature: 'literature',
    'literature-reviews': 'literature',
    papers: 'papers',
    reports: 'reports',
    'research-map': 'research_map',
    catalyst: 'catalyst',
    data: 'data',
    org: 'org',
    settings: 'settings',
    projects: 'projects',
    'agent-studio': 'agent_studio',
  }

  return FEATURE_MAP[first] ?? 'other'
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Emit a `feature_view` event with dwell time whenever the active feature
 * changes (route navigation), when the tab becomes hidden, or on unmount.
 *
 * @example
 *   // In app/(app)/layout.tsx:
 *   export default function AppGroupLayout({ children }) {
 *     useFeatureTimer()
 *     return <>{children}</>
 *   }
 */
export function useFeatureTimer(): void {
  const pathname = usePathname()
  const enterTimeRef = useRef<number>(Date.now())
  const currentFeatureRef = useRef<string>(featureFromPathname(pathname ?? ''))

  // Emit the dwell event for the feature that just ended.
  const emitDwell = useCallback((feature: string, enterTime: number) => {
    const durationMs = Date.now() - enterTime
    // Only track dwell times ≥ 500 ms to filter out accidental or bounce visits.
    if (durationMs >= 500) {
      track('feature_view', {
        feature,
        properties: {},
        durationMs,
      })
    }
  }, [])

  // When the pathname changes, emit dwell for the PREVIOUS feature and record
  // the entry time for the NEW feature.
  useEffect(() => {
    if (typeof window === 'undefined') return

    const newFeature = featureFromPathname(pathname ?? '')
    const prevFeature = currentFeatureRef.current
    const prevEnterTime = enterTimeRef.current

    if (newFeature !== prevFeature) {
      emitDwell(prevFeature, prevEnterTime)
      currentFeatureRef.current = newFeature
      enterTimeRef.current = Date.now()
    }
  }, [pathname, emitDwell])

  // Emit dwell when the tab becomes hidden (user switches tabs / minimizes).
  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        emitDwell(currentFeatureRef.current, enterTimeRef.current)
        // Reset enter time so we don't double-count when the tab refocuses.
        enterTimeRef.current = Date.now()
      } else if (document.visibilityState === 'visible') {
        // Tab came back into focus — restart the timer.
        enterTimeRef.current = Date.now()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [emitDwell])

  // Emit dwell on unmount (e.g. user signs out).
  useEffect(() => {
    return () => {
      emitDwell(currentFeatureRef.current, enterTimeRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
