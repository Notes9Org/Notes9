"use client"

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { isLikelyUuid } from "@/lib/url-project-param"

/**
 * Pull a likely-UUID project id out of `/projects/<id>(/...)` paths so the
 * scope context reflects project pages without the caller needing to also
 * tack `?project=<id>` onto the URL.
 */
function projectIdFromPath(pathname: string | null): string | null {
  if (!pathname) return null
  const match = pathname.match(/^\/projects\/([^/?#]+)/)
  const candidate = match?.[1]
  return candidate && isLikelyUuid(candidate) ? candidate : null
}

export type ProjectScope = {
  projectId: string | null
  projectName: string | null
  projectColor: string | null
  loading: boolean
}

const ProjectScopeContext = createContext<ProjectScope | null>(null)

/**
 * Reads `?project=<id>` from the URL and resolves it to a project name once,
 * caching the result so every section page can render `● Project ▸ Section`
 * in the breadcrumb without each page re-fetching.
 *
 * Color is derived deterministically from the project id so the breadcrumb
 * dot stays stable even before the projects table loads.
 */
export function ProjectScopeProvider({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const rawProject = searchParams?.get("project") ?? null
  const queryProjectId = rawProject && isLikelyUuid(rawProject) ? rawProject : null
  // Query param wins (so a section page under /projects/<a> can still scope to
  // <b> via ?project=<b>); fall back to the path-derived id on /projects/<id>.
  const projectId = queryProjectId ?? projectIdFromPath(pathname)

  const [projectName, setProjectName] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const cache = useRef<Map<string, string>>(new Map())
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    if (!projectId) {
      setProjectName(null)
      return
    }
    const cached = cache.current.get(projectId)
    if (cached) {
      setProjectName(cached)
      return
    }
    let cancelled = false
    setLoading(true)
    supabase
      .from("projects")
      .select("name")
      .eq("id", projectId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        const name = data?.name ?? null
        if (name) cache.current.set(projectId, name)
        setProjectName(name)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectId, supabase])

  const value = useMemo<ProjectScope>(
    () => ({
      projectId,
      projectName,
      projectColor: projectId ? colorFromId(projectId) : null,
      loading,
    }),
    [projectId, projectName, loading]
  )

  return (
    <ProjectScopeContext.Provider value={value}>
      {children}
    </ProjectScopeContext.Provider>
  )
}

export function useProjectScope(): ProjectScope {
  const ctx = useContext(ProjectScopeContext)
  if (!ctx) {
    return { projectId: null, projectName: null, projectColor: null, loading: false }
  }
  return ctx
}

/**
 * Notes9 project-dot palette. Tuned to the warm/cream theme: warm brown, sage,
 * dusty rose, copper, slate. No lilac or saturated blues.
 */
const DOT_PALETTE = [
  "#965034", // n9-accent
  "#5e7a4a", // sage
  "#b56b54", // copper
  "#6b7280", // slate
  "#a8754f", // tawny
  "#7c5c3f", // walnut
] as const

export function colorFromId(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0
  }
  return DOT_PALETTE[Math.abs(hash) % DOT_PALETTE.length]
}
