"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { resolveInitialProjectIdParam } from "@/lib/url-project-param"
import { useProjectScope } from "@/contexts/project-scope-context"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty"
import {
  FILTER_ALL,
  ResourceFilterRow,
  ResourceListFilter,
} from "@/components/ui/resource-list-filters"
import { ChartLine, Warning } from "@phosphor-icons/react/ssr"

export type AnalysisRow = {
  id: string
  title: string
  table_type: string
  analysis_type: string
  status: string
  created_at: string
  updated_at: string
  experiment_id: string
  project_id: string | null
  experiment_name: string | null
  project_name: string | null
}

type Option = { id: string; name: string }
type ExperimentOption = Option & { project_id: string | null }

/** analyses.status CHECK — draft | running | ready | failed. */
const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  ready: "default",
  running: "secondary",
  draft: "outline",
  failed: "destructive",
}

/** Turns `two_way_anova` into `Two way anova` for the table cell. */
function humanise(value: string): string {
  const spaced = value.replace(/_/g, " ")
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

export function AnalysisListClient({
  analyses,
  projects,
  experiments,
  loadError,
}: {
  analyses: AnalysisRow[]
  projects: Option[]
  experiments: ExperimentOption[]
  loadError: string | null
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const scope = useProjectScope()

  const [projectFilter, setProjectFilter] = useState(FILTER_ALL)
  const [experimentFilter, setExperimentFilter] = useState(FILTER_ALL)

  // Read-only URL sync (same pattern as Data & Files): the sidebar context
  // arrives as ?project=/?experiment= and prefills the filters; changing a
  // filter here is a LOCAL viewing choice and deliberately does not write back
  // to the URL, so browsing another project never flips the global context.
  useEffect(() => {
    const raw = searchParams.get("project")
    const resolved = resolveInitialProjectIdParam(
      raw ?? undefined,
      projects.map((p) => p.id),
    )
    setProjectFilter(resolved ?? FILTER_ALL)
  }, [searchParams, projects])

  useEffect(() => {
    const raw = searchParams.get("experiment")
    const valid = raw && experiments.some((e) => e.id === raw)
    setExperimentFilter(valid ? raw : FILTER_ALL)
  }, [searchParams, experiments])

  // Keep the experiment filter consistent with the selected project.
  useEffect(() => {
    if (projectFilter === FILTER_ALL) return
    setExperimentFilter((current) => {
      if (current === FILTER_ALL) return current
      const exp = experiments.find((e) => e.id === current)
      if (!exp || exp.project_id !== projectFilter) return FILTER_ALL
      return current
    })
  }, [projectFilter, experiments])

  const experimentFilterOptions = useMemo(() => {
    const pool =
      projectFilter === FILTER_ALL
        ? experiments
        : experiments.filter((e) => e.project_id === projectFilter)
    return pool.map((e) => ({ value: e.id, label: e.name }))
  }, [experiments, projectFilter])

  const filteredAnalyses = useMemo(() => {
    return analyses.filter((a) => {
      if (projectFilter !== FILTER_ALL && a.project_id !== projectFilter) return false
      if (experimentFilter !== FILTER_ALL && a.experiment_id !== experimentFilter) return false
      return true
    })
  }, [analyses, projectFilter, experimentFilter])

  // An analysis always starts from a data file, so "New analysis" hands off to
  // /analysis/new — the workspace in its unrun state — with the current scope
  // carried over to prefill the experiment picker.
  // ponytail: a link, not a create dialog; /analysis/new holds the spec until
  // Run succeeds, so no draft row is ever written.
  const newAnalysisHref = useMemo(() => {
    const qs = new URLSearchParams()
    const project = projectFilter !== FILTER_ALL ? projectFilter : scope.projectId
    const experiment =
      experimentFilter !== FILTER_ALL ? experimentFilter : scope.pinnedExperimentId
    if (project) qs.set("project", project)
    if (experiment) qs.set("experiment", experiment)
    const suffix = qs.toString()
    return suffix ? `/analysis/new?${suffix}` : "/analysis/new"
  }, [projectFilter, experimentFilter, scope.projectId, scope.pinnedExperimentId])

  if (loadError) {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Warning aria-hidden />
          </EmptyMedia>
          <EmptyTitle>Could not load analyses</EmptyTitle>
          <EmptyDescription>{loadError}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" size="sm" onClick={() => router.refresh()}>
            Try again
          </Button>
        </EmptyContent>
      </Empty>
    )
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-muted-foreground">
          Every statistical analysis across your experiments. Change the filters to browse
          other projects and experiments.
        </p>
        <div className="shrink-0">
          <Button asChild size="sm">
            <Link href={newAnalysisHref}>New analysis</Link>
          </Button>
        </div>
      </div>

      <ResourceFilterRow>
        <ResourceListFilter
          label="Project"
          value={projectFilter}
          onValueChange={setProjectFilter}
          options={projects.map((p) => ({ value: p.id, label: p.name }))}
          allLabel="All projects"
        />
        <ResourceListFilter
          label="Experiment"
          value={experimentFilter}
          onValueChange={setExperimentFilter}
          options={experimentFilterOptions}
          allLabel="All experiments"
        />
      </ResourceFilterRow>

      {analyses.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ChartLine aria-hidden />
            </EmptyMedia>
            <EmptyTitle>No analyses yet</EmptyTitle>
            <EmptyDescription>
              An analysis starts from a data file: pick one, assign each column a role,
              and the test and figure follow.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild size="sm">
              <Link href={newAnalysisHref}>Choose a data file</Link>
            </Button>
          </EmptyContent>
        </Empty>
      ) : filteredAnalyses.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center text-sm text-muted-foreground">
          <p>No analyses match the selected filters.</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setProjectFilter(FILTER_ALL)
              setExperimentFilter(FILTER_ALL)
            }}
          >
            Clear filters
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead className="hidden md:table-cell">Test</TableHead>
                <TableHead className="hidden lg:table-cell">Table</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Experiment</TableHead>
                <TableHead className="hidden lg:table-cell">Project</TableHead>
                <TableHead className="hidden lg:table-cell">Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAnalyses.map((analysis) => (
                <TableRow
                  key={analysis.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/analysis/${analysis.id}`)}
                >
                  <TableCell>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="shrink-0 text-muted-foreground">
                        <ChartLine className="size-4" />
                      </span>
                      <span className="truncate font-medium" title={analysis.title}>
                        {analysis.title}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {humanise(analysis.analysis_type)}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <Badge variant="secondary" className="capitalize">
                      {analysis.table_type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={STATUS_VARIANT[analysis.status] ?? "outline"}
                      className="capitalize"
                    >
                      {analysis.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[180px]">
                    <span
                      className="truncate block"
                      title={analysis.experiment_name ?? undefined}
                    >
                      {analysis.experiment_name ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell max-w-[160px]">
                    <span
                      className="truncate block"
                      title={analysis.project_name ?? undefined}
                    >
                      {analysis.project_name ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell whitespace-nowrap text-muted-foreground">
                    {new Date(analysis.updated_at).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  )
}
