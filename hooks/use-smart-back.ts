"use client"

import { useRouter } from "next/navigation"

/**
 * Hook for smart back navigation with fallback to a default path.
 * Prevents issues when user opens page in new tab (no history) or
 * navigates from external links.
 * 
 * @param fallbackPath - The path to navigate to if no history exists
 * @returns A function that performs smart back navigation
 */
export function useSmartBack(fallbackPath: string) {
  const router = useRouter()
  
  return () => {
    // Check if there's actual navigation history
    // window.history.length > 1 means there are previous pages
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back()
    } else {
      // No history, navigate to fallback
      router.push(fallbackPath)
    }
  }
}
