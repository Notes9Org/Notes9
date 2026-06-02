"use client"

import { useCallback, useEffect, useState, useMemo } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { useAuthUser } from "@/components/auth/auth-provider"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { PaperList, type PaperListItem } from "./paper-list"
import { SetPageBreadcrumb } from "@/components/layout/breadcrumb-context"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { ResourceFilterRow, ResourceListFilter, FILTER_ALL } from "@/components/ui/resource-list-filters"
import { useProjectScope } from "@/contexts/project-scope-context"

interface PapersPageInnerProps {
  projects?: { id: string; name: string }[]
}

export function PapersPageInner({ projects = [] }: PapersPageInnerProps = {}) {
  const user = useAuthUser();
  const searchParams = useSearchParams()
  const router = useRouter()
  const [papers, setPapers] = useState<PaperListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<"grid" | "table">("table")
  const { projectId, projectName } = useProjectScope()
  const [projectFilter, setProjectFilter] = useState(projectId || FILTER_ALL)

  const fetchPapers = useCallback(async () => {
    const supabase = createClient()
    if (!user) {
      setPapers([])
      setFetchError(null)
      setLoading(false)
      return
    }

    const fullSelect = `
      *,
      project:projects(id, name)
    `

    let { data, error } = await supabase
      .from("papers")
      .select(fullSelect)
      .eq("created_by", user.id)
      .order("updated_at", { ascending: false })

    if (error) {
      console.warn("[papers] list query with joins failed, retrying without embeds:", error.message)
      const retry = await supabase
        .from("papers")
        .select("*")
        .eq("created_by", user.id)
        .order("updated_at", { ascending: false })
      data = retry.data
      error = retry.error
    }

    if (error) {
      setFetchError(error.message)
      setPapers([])
      setLoading(false)
      return
    }

    const list = (data as PaperListItem[]) || []

    setFetchError(null)
    setPapers(list)
    setLoading(false)
  }, [])

  useEffect(() => {
    void fetchPapers()
  }, [fetchPapers])

  useEffect(() => {
    if (projectId) {
      setProjectFilter(projectId)
    }
  }, [projectId])

  const projectOptions = useMemo(() => {
    const opts = projects && projects.length > 0 
      ? projects.map((p) => ({ value: p.id, label: p.name }))
      : Array.from(
          new Map(
            papers
              .filter((p) => p.project?.id || (p as { project_id?: string | null }).project_id)
              .map((p) => {
                // pid is guaranteed truthy by the preceding filter.
                const pid = (p.project?.id || (p as { project_id?: string | null }).project_id)!
                return [
                  pid,
                  p.project?.name || `Project ${pid.slice(0, 8)}`,
                ] as const
              })
          ).entries()
        ).map(([value, label]) => ({ value, label }))

    if (projectId && !opts.some((o) => o.value === projectId)) {
      opts.push({ value: projectId, label: projectName || `Project ${projectId.slice(0, 8)}` })
    }

    return opts.sort((a, b) => a.label.localeCompare(b.label))
  }, [papers, projects, projectId, projectName])

  const filteredPapers = useMemo(() => {
    if (projectFilter === FILTER_ALL) return papers
    return papers.filter((p) => {
      const pid = p.project?.id || (p as { project_id?: string | null }).project_id
      return pid === projectFilter
    })
  }, [papers, projectFilter])

  return (
    <div className="space-y-6">
      <SetPageBreadcrumb segments={[]} />

      {fetchError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load writing documents</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>{fetchError}</p>
            <p className="text-sm">
              The <code className="rounded bg-muted px-1 py-0.5 text-xs">papers</code> table may be missing. Run{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">scripts/030_papers_writing.sql</code> in the
              Supabase SQL editor, then refresh this page.
            </p>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground">
          Draft and export research papers with project-based filtering.
        </p>
        <Button asChild className="shrink-0">
          <Link href={projectFilter !== FILTER_ALL ? `/papers/new?project=${projectFilter}` : "/papers/new"}>
            <Plus className="mr-2 h-4 w-4" />
            New Paper
          </Link>
        </Button>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : (
        <>
          <ResourceFilterRow>
            {projectOptions.length > 0 && (
              <ResourceListFilter
                label="Project"
                value={projectFilter}
                onValueChange={setProjectFilter}
                options={projectOptions}
                allLabel="All projects"
              />
            )}
          </ResourceFilterRow>
          <PaperList
            papers={filteredPapers}
            viewMode={viewMode}
            setViewMode={setViewMode}
            onSelectPaper={(p) => router.push(`/papers/${p.id}`)}
            onDeleted={fetchPapers}
            isFiltered={projectFilter !== FILTER_ALL}
          />
        </>
      )}
    </div>
  )
}

