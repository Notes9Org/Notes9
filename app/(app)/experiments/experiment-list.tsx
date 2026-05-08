"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useMediaQuery } from "@/hooks/use-media-query"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { FlaskConical, User, ArrowUpRight, Grid3x3, List, Plus, X } from 'lucide-react'
import { HtmlContentTruncated } from '@/components/html-content'
import {
  FILTER_ALL,
  ResourceFilterRow,
  ResourceListFilter,
} from "@/components/ui/resource-list-filters"
import { CATALYST_MENTION_DRAG_MIME } from "@/lib/catalyst-mention-types"

export type ExperimentsProjectContext = { id: string; name: string }

// Format date consistently to avoid hydration mismatch between server/client locales
const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr)
  // Use ISO format parts for consistency: YYYY-MM-DD
  return date.toISOString().split('T')[0]
}

interface Experiment {
  id: string
  name: string
  description: string | null
  status: string
  start_date: string | null
  completion_date: string | null
  created_at: string
  project_id: string
  project: {
    id: string
    name: string
  } | null
  assigned_to: {
    first_name: string
    last_name: string
  } | null
}

function experimentDetailHref(experimentId: string, linkProjectId?: string | null) {
  if (linkProjectId) return `/experiments/${experimentId}?project=${linkProjectId}`
  return `/experiments/${experimentId}`
}

/** Client wrapper: single-line header (description + Grid/Table toggle + New button) + list */
export function ExperimentsPageContent({
  experiments,
  projectContext = null,
  linkProjectId = null,
}: {
  experiments: Experiment[]
  projectContext?: ExperimentsProjectContext | null
  linkProjectId?: string | null
}) {
  const isMobile = useMediaQuery("(max-width: 768px)")
  const [viewMode, setViewMode] = useState<"grid" | "table">("table")
  const [projectFilter, setProjectFilter] = useState(FILTER_ALL)
  const [statusFilter, setStatusFilter] = useState(FILTER_ALL)

  const baseExperiments = useMemo(() => {
    if (!projectContext) return experiments
    return experiments.filter((e) => e.project_id === projectContext.id)
  }, [experiments, projectContext])

  // On mobile, lock to grid view (and switch to grid when resizing to mobile)
  useEffect(() => {
    if (isMobile) setViewMode("grid")
  }, [isMobile])

  const projectOptions = useMemo(() => {
    const m = new Map<string, string>()
    for (const e of baseExperiments) {
      const id = e.project_id
      const name = e.project?.name
      if (id && name) m.set(id, name)
    }
    return Array.from(m.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [baseExperiments])

  const statusOptions = useMemo(() => {
    const s = new Set<string>()
    for (const e of baseExperiments) {
      if (e.status) s.add(e.status)
    }
    return Array.from(s)
      .sort()
      .map((value) => ({ value, label: value.replace(/_/g, " ") }))
  }, [baseExperiments])

  const filteredExperiments = useMemo(() => {
    return baseExperiments.filter((e) => {
      if (!projectContext && projectFilter !== FILTER_ALL && e.project_id !== projectFilter) {
        return false
      }
      if (statusFilter !== FILTER_ALL && e.status !== statusFilter) return false
      return true
    })
  }, [baseExperiments, projectContext, projectFilter, statusFilter])

  const newExperimentHref = linkProjectId
    ? `/experiments/new?project=${linkProjectId}`
    : "/experiments/new"

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-muted-foreground">
          Manage and track all experimental procedures
        </p>
        <div className="flex items-center gap-2 shrink-0">
          {projectContext ? (
            <Button asChild variant="outline" size="sm" className="gap-2">
              <Link href="/experiments">
                <X className="h-4 w-4" />
                Remove project filter
              </Link>
            </Button>
          ) : null}
          <div className="inline-flex gap-1 rounded-lg border p-1">
            <Button
              variant={viewMode === "grid" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("grid")}
              className="gap-2"
              aria-label="Switch to grid view"
            >
              <Grid3x3 className="h-4 w-4" />
              Grid
            </Button>
            <Button
              variant={isMobile ? "ghost" : viewMode === "table" ? "default" : "ghost"}
              size="sm"
              onClick={() => !isMobile && setViewMode("table")}
              className="gap-2"
              disabled={isMobile}
              aria-disabled={isMobile}
              aria-label="Switch to table view"
            >
              <List className="h-4 w-4" />
              Table
            </Button>
          </div>
          <Button id="tour-create-experiment" asChild size="icon" variant="ghost" className="size-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" aria-label="New experiment">
            <Link href={newExperimentHref}>
              <Plus className="size-4" />
            </Link>
          </Button>
        </div>
      </div>

      <ResourceFilterRow>
        {!projectContext ? (
        <ResourceListFilter
          label="Project"
          value={projectFilter}
          onValueChange={setProjectFilter}
          options={projectOptions}
          allLabel="All projects"
        />
        ) : null}
        <ResourceListFilter
          label="Status"
          value={statusFilter}
          onValueChange={setStatusFilter}
          options={statusOptions}
          allLabel="All statuses"
        />
      </ResourceFilterRow>

      {filteredExperiments.length > 0 ? (
        <ExperimentList
          experiments={filteredExperiments}
          viewMode={viewMode}
          setViewMode={setViewMode}
          hideToolbar
          linkProjectId={linkProjectId}
        />
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground space-y-2">
            <p>
              {projectContext
                ? `No experiments in ${projectContext.name} yet.`
                : "No experiments match the selected filters."}
            </p>
            {projectContext ? (
              <p>
                <Link
                  href={newExperimentHref}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  Create an experiment
                </Link>
                {" · "}
                <Link href="/experiments" className="underline-offset-4 hover:underline">
                  All experiments
                </Link>
              </p>
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

interface ExperimentListProps {
  experiments: Experiment[]
  viewMode?: "grid" | "table"
  setViewMode?: (mode: "grid" | "table") => void
  hideToolbar?: boolean
  linkProjectId?: string | null
}

export function ExperimentList({
  experiments,
  viewMode: controlledView,
  setViewMode: setControlledView,
  hideToolbar,
  linkProjectId = null,
}: ExperimentListProps) {
  const isMobile = useMediaQuery("(max-width: 768px)")
  const [internalView, setInternalView] = useState<"grid" | "table">("table")
  const viewMode = controlledView ?? internalView
  const setViewMode = setControlledView ?? setInternalView
  const effectiveViewMode = isMobile ? "grid" : viewMode

  // Helper function to get shorter status text for better display
  const getStatusDisplay = (status: string) => {
    const statusMap: Record<string, string> = {
      'in_progress': 'In Progress',
      'completed': 'Completed',
      'planning': 'Planning',
      'planned': 'Planned',
      'data_ready': 'Data Ready',
      'on_hold': 'On Hold',
      'cancelled': 'Cancelled'
    }
    return statusMap[status] || status.replace('_', ' ')
  }

  if (!experiments || experiments.length === 0) {
    return null
  }

  return (
    <>
      {/* View Toggle - only when not in header */}
      {!hideToolbar && (
        <div className="flex justify-end mb-4">
          <div className="inline-flex gap-1 rounded-lg border p-1">
            <Button
              variant={effectiveViewMode === "grid" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("grid")}
              className="gap-2"
              aria-label="Switch to grid view"
            >
              <Grid3x3 className="h-4 w-4" />
              Grid
            </Button>
            <Button
              variant={isMobile ? "ghost" : effectiveViewMode === "table" ? "default" : "ghost"}
              size="sm"
              onClick={() => !isMobile && setViewMode("table")}
              className="gap-2"
              disabled={isMobile}
              aria-disabled={isMobile}
              aria-label="Switch to table view"
            >
              <List className="h-4 w-4" />
              Table
            </Button>
          </div>
        </div>
      )}

      {/* Grid View - Use auto-fill with fixed card sizes to prevent expansion */}
      {effectiveViewMode === "grid" && (
        <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(280px,1fr))]">
          {experiments.map((experiment) => (
            <Card
              key={experiment.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(
                  CATALYST_MENTION_DRAG_MIME,
                  JSON.stringify({
                    kind: "experiment",
                    id: experiment.id,
                    title: experiment.name,
                  })
                )
                e.dataTransfer.effectAllowed = "copy"
              }}
              className="hover:border-primary transition-colors flex flex-col min-w-0 overflow-hidden"
            >
              <CardHeader className="pb-3 min-w-0">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <FlaskConical className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1 overflow-hidden">
                    <CardTitle className="text-base text-foreground leading-tight min-w-0 overflow-hidden text-ellipsis" style={{
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      wordBreak: 'normal',
                      overflowWrap: 'normal'
                    }}>
                      {experiment.name}
                    </CardTitle>
                    {experiment.project && (
                      <CardDescription className="text-xs min-w-0 overflow-hidden text-ellipsis" style={{
                        wordBreak: 'normal',
                        overflowWrap: 'normal'
                      }}>
                        {experiment.project.name}
                      </CardDescription>
                    )}
                  </div>
                </div>
                {/* Status badge moved to separate row for better spacing */}
                <div className="flex items-center justify-between pt-2 gap-2 min-w-0">
                  <Badge
                    variant={
                      experiment.status === "in_progress"
                        ? "default"
                        : experiment.status === "completed"
                          ? "secondary"
                          : "outline"
                    }
                    className="text-xs font-medium whitespace-nowrap shrink-0 max-w-full overflow-hidden text-ellipsis"
                  >
                    {getStatusDisplay(experiment.status)}
                  </Badge>
                  {experiment.start_date && (
                    <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0 overflow-hidden text-ellipsis max-w-20">
                      {new Date(experiment.start_date).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3 flex-1 flex flex-col pt-0 min-w-0">
                <div className="space-y-2 flex-1 min-w-0">
                  {experiment.assigned_to && (
                    <div className="flex items-center gap-1 text-sm text-muted-foreground min-w-0 overflow-hidden">
                      <User className="h-3 w-3 shrink-0" />
                      <span className="truncate text-ellipsis overflow-hidden">
                        {experiment.assigned_to.first_name} {experiment.assigned_to.last_name}
                      </span>
                    </div>
                  )}
                  <HtmlContentTruncated
                    content={experiment.description}
                    className="text-sm text-muted-foreground min-w-0 overflow-hidden text-ellipsis"
                    style={{
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      wordBreak: 'normal',
                      overflowWrap: 'normal'
                    } as React.CSSProperties}
                  />
                </div>
                <Button variant="outline" size="sm" className="w-full mt-auto shrink-0" asChild>
                  <Link href={experimentDetailHref(experiment.id, linkProjectId)}>
                    <ArrowUpRight className="h-4 w-4 mr-2" />
                    <span className="truncate">View Details</span>
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Table View */}
      {effectiveViewMode === "table" && (
        <ExperimentTableView experiments={experiments} linkProjectId={linkProjectId} />
      )}
    </>
  )
}

function ExperimentTableView({ experiments, linkProjectId }: { experiments: Experiment[]; linkProjectId?: string | null }) {
  const router = useRouter()
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-foreground">All Experiments</CardTitle>
        <CardDescription>Complete list of experimental procedures</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="relative w-full overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[300px]">Experiment</TableHead>
                <TableHead className="min-w-[120px]">Created</TableHead>
                <TableHead className="text-right min-w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {experiments.map((experiment) => (
                <TableRow
                  key={experiment.id}
                  draggable
                  className="cursor-pointer"
                  onDragStart={(e) => {
                    e.dataTransfer.setData(
                      CATALYST_MENTION_DRAG_MIME,
                      JSON.stringify({
                        kind: "experiment",
                        id: experiment.id,
                        title: experiment.name,
                      })
                    )
                    e.dataTransfer.effectAllowed = "copy"
                  }}
                  onClick={() => router.push(experimentDetailHref(experiment.id, linkProjectId))}
                >
                  <TableCell className="font-medium text-foreground">
                    <div className="flex items-center gap-2">
                      <FlaskConical className="h-4 w-4 text-primary shrink-0" />
                      <span className="truncate">{experiment.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(experiment.created_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" asChild onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                      <Link href={experimentDetailHref(experiment.id, linkProjectId)}>
                        <ArrowUpRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
