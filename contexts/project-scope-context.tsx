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
  experimentId: string | null
  experimentName: string | null
  loading: boolean
  clearScope: () => void
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
  const [persistedProjectId, setPersistedProjectId] = useState<string | null>(null)

  useEffect(() => {
    // Only access localStorage on the client
    try {
      const saved = localStorage.getItem("n9_last_project_id")
      if (saved) setPersistedProjectId(saved)
    } catch (e) {}
  }, [])

  const [projectName, setProjectName] = useState<string | null>(null)
  const [experimentId, setExperimentId] = useState<string | null>(null)
  const [experimentName, setExperimentName] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const cache = useRef<Map<string, { pId: string | null, pName: string | null, eId: string | null, eName: string | null }>>(new Map())

  // We derive the target URL to resolve based on whether a ?project param is forcing a scope
  // If ?project is present, we resolve `/projects/[id]` to get the project name.
  // Otherwise we resolve the actual pathname.
  const pathToResolve = queryProjectId ? `/projects/${queryProjectId}` : pathname

  useEffect(() => {
    if (!pathToResolve) {
      setProjectName(null)
      setExperimentId(null)
      setExperimentName(null)
      return
    }

    const cached = cache.current.get(pathToResolve)
    if (cached) {
      if (cached.pId) setPersistedProjectId(cached.pId)
      setProjectName(cached.pName)
      setExperimentId(cached.eId)
      setExperimentName(cached.eName)
      return
    }

    let cancelled = false
    setLoading(true)

    fetch(`/api/resolve-scope?path=${encodeURIComponent(pathToResolve)}`)
      .then(res => res.json())
      .then(data => {
        if (cancelled) return
        const pId = data.projectId || null
        const pName = data.projectName || null
        const eId = data.experimentId || null
        const eName = data.experimentName || null

        cache.current.set(pathToResolve, { pId, pName, eId, eName })
        if (pId) setPersistedProjectId(pId)
        setProjectName(pName)
        setExperimentId(eId)
        setExperimentName(eName)
        setLoading(false)
      })
      .catch(err => {
        console.error(err)
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [pathToResolve])

  useEffect(() => {
    if (persistedProjectId) {
      try {
        localStorage.setItem("n9_last_project_id", persistedProjectId)
      } catch (e) {}
    }
  }, [persistedProjectId])

  const projectId = persistedProjectId

  const clearScope = () => {
    try {
      localStorage.removeItem("n9_last_project_id")
    } catch (e) {}
    setPersistedProjectId(null)
  }

  const value = useMemo<ProjectScope>(
    () => ({
      projectId,
      projectName,
      projectColor: projectId ? colorFromId(projectId) : null,
      experimentId,
      experimentName,
      loading,
      clearScope,
    }),
    [projectId, projectName, experimentId, experimentName, loading]
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
    return { projectId: null, projectName: null, projectColor: null, experimentId: null, experimentName: null, loading: false, clearScope: () => {} }
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
