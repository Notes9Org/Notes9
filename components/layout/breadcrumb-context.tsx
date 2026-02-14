"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import { usePathname } from "next/navigation"

export type BreadcrumbSegment = { label: string; href?: string }

type BreadcrumbContextValue = {
  segments: BreadcrumbSegment[]
  setSegments: (segments: BreadcrumbSegment[]) => void
}

const BreadcrumbContext = createContext<BreadcrumbContextValue | null>(null)

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [segments, setSegmentsState] = useState<BreadcrumbSegment[]>([])
  const setSegments = useCallback((s: BreadcrumbSegment[]) => setSegmentsState(s), [])
  const pathname = usePathname()

  // Auto-reset breadcrumbs on route change so stale segments never survive navigation
  useEffect(() => {
    setSegmentsState([])
  }, [pathname])

  return (
    <BreadcrumbContext.Provider value={{ segments, setSegments }}>
      {children}
    </BreadcrumbContext.Provider>
  )
}

export function useBreadcrumb() {
  const ctx = useContext(BreadcrumbContext)
  if (!ctx) return { segments: [] as BreadcrumbSegment[], setSegments: () => {} }
  return ctx
}

/** Call from pages to set the path shown in the header. Omit "Dashboard" — it is filtered out. */
export function SetPageBreadcrumb({ segments }: { segments: BreadcrumbSegment[] }) {
  const { setSegments } = useBreadcrumb()
  useEffect(() => {
    setSegments(segments)
    return () => setSegments([])
  }, [segments, setSegments])
  return null
}
