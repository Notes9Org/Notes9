"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

const IN_APP_NAV_KEY = "notes9:inAppNavCount"

/**
 * Hook for smart back navigation with fallback to a default path.
 * Tracks in-app navigation via sessionStorage rather than the unreliable
 * `window.history.length`, which counts pre-app entries (login, redirects)
 * and would otherwise send users back outside the app.
 *
 * @param fallbackPath - The path to navigate to if no in-app history exists
 * @returns A function that performs smart back navigation
 */
export function useSmartBack(fallbackPath: string) {
  const router = useRouter()

  useEffect(() => {
    if (typeof window === "undefined") return
    const current = Number(window.sessionStorage.getItem(IN_APP_NAV_KEY) || "0")
    window.sessionStorage.setItem(IN_APP_NAV_KEY, String(current + 1))
  }, [])

  return () => {
    if (typeof window === "undefined") {
      router.push(fallbackPath)
      return
    }
    const inAppCount = Number(window.sessionStorage.getItem(IN_APP_NAV_KEY) || "0")
    if (inAppCount > 1) {
      router.back()
    } else {
      router.push(fallbackPath)
    }
  }
}
