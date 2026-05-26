"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { usePathname } from "next/navigation"

function serializeSegments(s: BreadcrumbSegment[]): string {
  return s.map((seg) => `${seg.label}|${seg.href ?? ''}`).join('')
}

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

  const value = useMemo<BreadcrumbContextValue>(
    () => ({ segments, setSegments }),
    [segments, setSegments],
  )

  return (
    <BreadcrumbContext.Provider value={value}>
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
  const lastKeyRef = useRef<string | null>(null)
  // Equality-guarded sync. Most callers pass inline array literals that fail
  // referential equality every render; without this guard, every parent
  // render would call setSegments → context-value change → AppLayoutBody +
  // every breadcrumb consumer re-renders. We compare serialized content so
  // an identical breadcrumb is a no-op.
  useEffect(() => {
    // Empty segments → header auto-builds from pathname (protocols, samples, etc.)
    if (segments.length === 0) return
    const key = serializeSegments(segments)
    if (lastKeyRef.current === key) return
    lastKeyRef.current = key
    setSegments(segments)
  }, [segments, setSegments])
  return null
}

/**
 * Section-page convenience: prepends a passed-in project context to the breadcrumb,
 * yielding `● Project ▸ Section [▸ Item]`. The caller passes scope explicitly to
 * avoid a circular import between this file and `contexts/project-scope-context`.
 */
export function SetScopedBreadcrumb({
  scope,
  sectionSegments,
}: {
  scope: { projectId: string | null; projectName: string | null }
  sectionSegments: BreadcrumbSegment[]
}) {
  const { setSegments } = useBreadcrumb()
  const lastKeyRef = useRef<string | null>(null)
  useEffect(() => {
    const merged: BreadcrumbSegment[] = scope.projectId && scope.projectName
      ? [
          { label: scope.projectName, href: `/projects/${scope.projectId}` },
          ...sectionSegments,
        ]
      : sectionSegments
    const key = serializeSegments(merged)
    if (lastKeyRef.current === key) return
    lastKeyRef.current = key
    setSegments(merged)
  }, [scope.projectId, scope.projectName, sectionSegments, setSegments])
  return null
}
