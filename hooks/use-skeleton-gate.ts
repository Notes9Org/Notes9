"use client"

import { useEffect, useRef, useState } from "react"

/**
 * Anti-flicker gate for skeletons and loading states — the fix for the
 * "hollow effect doesn't match the page load" glitch (see
 * docs/GLASS_REVAMP_PLAN.md §5).
 *
 * Two failure modes it removes:
 * 1. **Skeleton flash** — data resolves in <150ms but the skeleton still
 *    painted for a frame or two, so the page "blinks hollow". The gate holds
 *    the skeleton back for `appearDelay` ms; fast loads never show one.
 * 2. **Skeleton snap** — the skeleton appeared and was immediately replaced,
 *    a jarring one-frame swap. Once shown, the gate keeps it visible for at
 *    least `minVisible` ms so the shimmer completes a believable beat and the
 *    content swap lands on a settled frame.
 *
 * Usage:
 *   const showSkeleton = useSkeletonGate(isLoading)
 *   if (showSkeleton) return <PageSkeleton />
 *   if (isLoading) return null            // fast path: brief blank beats a flash
 *   return <Content />
 */
export function useSkeletonGate(
  loading: boolean,
  { appearDelay = 150, minVisible = 350 }: { appearDelay?: number; minVisible?: number } = {},
): boolean {
  const [visible, setVisible] = useState(false)
  const shownAtRef = useRef<number | null>(null)

  useEffect(() => {
    if (loading) {
      if (visible) return
      const t = setTimeout(() => {
        shownAtRef.current = Date.now()
        setVisible(true)
      }, appearDelay)
      return () => clearTimeout(t)
    }
    // Load finished. If the skeleton never appeared, nothing to do; if it did,
    // hold it until it has been on screen for minVisible ms.
    if (!visible) return
    const shownFor = shownAtRef.current ? Date.now() - shownAtRef.current : Infinity
    const remaining = Math.max(0, minVisible - shownFor)
    const t = setTimeout(() => {
      shownAtRef.current = null
      setVisible(false)
    }, remaining)
    return () => clearTimeout(t)
  }, [loading, visible, appearDelay, minVisible])

  return visible
}
