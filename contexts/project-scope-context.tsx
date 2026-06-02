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
import { isLikelyUuid } from "@/lib/url-project-param"
import { recordRecentProject } from "@/lib/recent-projects"

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

function experimentIdFromPath(pathname: string | null): string | null {
  if (!pathname) return null
  const match = pathname.match(/^\/experiments\/([^/?#]+)/)
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
  /** `?project=…&experiment=…` for project-scoped sidebar links */
  scopedQueryString: string
}

const ProjectScopeContext = createContext<ProjectScope | null>(null)

const ENTITY_PATH_RE =
  /^\/(projects|experiments|lab-notes|protocols|samples|data|reports|equipment|papers|literature-reviews)\/([^/?#]+)/

/**
 * Reads `?project=<id>` and `?experiment=<id>` from the URL and resolves names
 * once, caching the result so breadcrumbs and the sidebar stay in sync.
 */
export function ProjectScopeProvider({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const rawProject = searchParams?.get("project") ?? null
  const rawExperiment = searchParams?.get("experiment") ?? null
  const queryProjectId = rawProject && isLikelyUuid(rawProject) ? rawProject : null
  const queryExperimentId =
    rawExperiment && isLikelyUuid(rawExperiment) ? rawExperiment : null

  // localStorage is undefined during SSR — short-circuit on the server so the
  // initializer never throws (this runs on every server render). The catch then
  // only guards real client-side failures (private mode / quota), which stay
  // silent by design: a missing key is an expected first-visit state, not an error.
  const [persistedProjectId, setPersistedProjectId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null
    try { return localStorage.getItem("n9_last_project_id") } catch { return null }
  })
  const [persistedExperimentId, setPersistedExperimentId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null
    try { return localStorage.getItem("n9_last_experiment_id") } catch { return null }
  })

  const [projectName, setProjectName] = useState<string | null>(null)
  const [experimentId, setExperimentId] = useState<string | null>(null)
  const [experimentName, setExperimentName] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const cache = useRef<
    Map<
      string,
      {
        pId: string | null
        pName: string | null
        eId: string | null
        eName: string | null
      }
    >
  >(new Map())

  const pathProjectId = projectIdFromPath(pathname)
  const pathExperimentId = experimentIdFromPath(pathname)
  const hasEntityId = ENTITY_PATH_RE.test(pathname ?? "")

  const pathToResolve = useMemo(() => {
    if (hasEntityId) return pathname
    if (pathExperimentId) return pathname
    if (queryExperimentId) return `/experiments/${queryExperimentId}`
    if (queryProjectId) return `/projects/${queryProjectId}`
    if (persistedExperimentId) return `/experiments/${persistedExperimentId}`
    if (persistedProjectId) return `/projects/${persistedProjectId}`
    return pathname
  }, [
    hasEntityId,
    pathname,
    pathExperimentId,
    queryExperimentId,
    queryProjectId,
    persistedExperimentId,
    persistedProjectId,
  ])

  const resolveFallbackProjectId =
    queryProjectId ?? pathProjectId ?? persistedProjectId ?? ""

  useEffect(() => {
    if (!pathToResolve) {
      setProjectName(null)
      setExperimentId(null)
      setExperimentName(null)
      return
    }

    const cacheKey = `${pathToResolve}|${resolveFallbackProjectId}`
    const cached = cache.current.get(cacheKey)
    if (cached) {
      if (cached.pId) setPersistedProjectId(cached.pId)
      if (cached.eId) setPersistedExperimentId(cached.eId)
      setProjectName(cached.pName)
      setExperimentId(cached.eId)
      setExperimentName(cached.eName)
      return
    }

    let cancelled = false
    setLoading(true)

    const params = new URLSearchParams({
      path: pathToResolve,
      fallback: resolveFallbackProjectId,
    })
    if (queryExperimentId) params.set("experiment", queryExperimentId)

    fetch(`/api/resolve-scope?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        const pId = data.projectId || null
        const pName = data.projectName || null
        const eId = data.experimentId || queryExperimentId || null
        const eName = data.experimentName || null

        cache.current.set(cacheKey, { pId, pName, eId, eName })
        if (pId) setPersistedProjectId(pId)
        if (eId) setPersistedExperimentId(eId)
        setProjectName(pName)
        setExperimentId(eId)
        setExperimentName(eName)
        setLoading(false)
      })
      .catch((err) => {
        console.error(err)
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [pathToResolve, resolveFallbackProjectId, queryExperimentId])

  useEffect(() => {
    try {
      if (persistedProjectId) {
        localStorage.setItem("n9_last_project_id", persistedProjectId)
      }
      if (persistedExperimentId) {
        localStorage.setItem("n9_last_experiment_id", persistedExperimentId)
      }
    } catch (e) {
      console.warn("[ProjectScope] localStorage write failed:", e)
    }
  }, [persistedProjectId, persistedExperimentId])

  const activeProjectId =
    pathProjectId ?? queryProjectId ?? persistedProjectId

  useEffect(() => {
    if (activeProjectId) recordRecentProject(activeProjectId)
  }, [activeProjectId])

  const projectId =
    queryProjectId ?? pathProjectId ?? persistedProjectId

  const clearScope = () => {
    try {
      localStorage.removeItem("n9_last_project_id")
      localStorage.removeItem("n9_last_experiment_id")
    } catch (e) {
      console.warn("[ProjectScope] localStorage clear failed:", e)
    }
    setPersistedProjectId(null)
    setPersistedExperimentId(null)
    setExperimentId(null)
    setExperimentName(null)
  }

  const scopedQueryString = useMemo(() => {
    const params = new URLSearchParams()
    if (projectId) params.set("project", projectId)
    const activeExperiment =
      experimentId ?? queryExperimentId ?? persistedExperimentId
    if (activeExperiment) params.set("experiment", activeExperiment)
    const qs = params.toString()
    return qs ? `?${qs}` : ""
  }, [projectId, experimentId, queryExperimentId, persistedExperimentId])

  const value = useMemo<ProjectScope>(
    () => ({
      projectId,
      projectName,
      projectColor: projectId ? colorFromId(projectId) : null,
      experimentId: experimentId ?? queryExperimentId ?? persistedExperimentId,
      experimentName,
      loading,
      clearScope,
      scopedQueryString,
    }),
    [
      projectId,
      projectName,
      experimentId,
      queryExperimentId,
      persistedExperimentId,
      experimentName,
      loading,
      scopedQueryString,
    ],
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
    return {
      projectId: null,
      projectName: null,
      projectColor: null,
      experimentId: null,
      experimentName: null,
      loading: false,
      clearScope: () => {},
      scopedQueryString: "",
    }
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
