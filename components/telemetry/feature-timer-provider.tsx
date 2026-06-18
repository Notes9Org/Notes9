'use client'

/**
 * components/telemetry/feature-timer-provider.tsx
 *
 * Thin client component that activates the feature dwell timer.
 *
 * app/(app)/layout.tsx is a server component, so the hook cannot live there
 * directly. This zero-render client wrapper mounts the hook once for the
 * entire authenticated app shell.
 */

import { useFeatureTimer } from '@/hooks/use-feature-timer'

export function FeatureTimerProvider(): null {
  useFeatureTimer()
  return null
}
