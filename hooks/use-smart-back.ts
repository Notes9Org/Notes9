"use client"

import { useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"

const IN_APP_NAV_KEY = "notes9:inAppNavCount"
const PRESERVED_PARAMS = ["project"] as const

/**
 * Hook for smart back navigation with fallback to a default path.
 * Tracks in-app navigation via sessionStorage rather than the unreliable
 * `window.history.length`, which counts pre-app entries (login, redirects)
 * and would otherwise send users back outside the app.
 *
 * Preserves the current `?project=` (and any other PRESERVED_PARAMS) when
 * falling back, so users who entered a create page from a scoped list land
 * back on the same scoped list instead of the global one.
 *
 * @param fallbackPath - The path to navigate to if no in-app history exists
 * @returns A function that performs smart back navigation
 */
export function useSmartBack(fallbackPath: string) {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (typeof window === "undefined") return
    const current = Number(window.sessionStorage.getItem(IN_APP_NAV_KEY) || "0")
    window.sessionStorage.setItem(IN_APP_NAV_KEY, String(current + 1))
  }, [])

  return () => {
    if (typeof window === "undefined") {
      router.push(decorateFallback(fallbackPath, searchParams))
      return
    }
    const inAppCount = Number(window.sessionStorage.getItem(IN_APP_NAV_KEY) || "0")
    if (inAppCount > 1) {
      router.back()
    } else {
      router.push(decorateFallback(fallbackPath, searchParams))
    }
  }
}

/**
 * Carry preserved query params from the current URL onto the fallback path,
 * unless the fallback already includes that param. Returns the original path
 * unchanged if there are no relevant params to carry.
 */
export function decorateFallback(
  fallbackPath: string,
  searchParams: ReturnType<typeof useSearchParams>,
): string {
  if (!searchParams) return fallbackPath
  const [pathWithQuery, hash] = fallbackPath.split("#")
  const [path, existingQs] = pathWithQuery.split("?")
  const next = new URLSearchParams(existingQs ?? "")
  let mutated = false
  for (const key of PRESERVED_PARAMS) {
    if (next.has(key)) continue
    const value = searchParams.get(key)
    if (value) {
      next.set(key, value)
      mutated = true
    }
  }
  if (!mutated && !existingQs) return fallbackPath
  const qs = next.toString()
  return `${path}${qs ? `?${qs}` : ""}${hash ? `#${hash}` : ""}`
}
