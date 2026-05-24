"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useMediaQuery } from "@/hooks/use-media-query"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Users, ArrowUpRight, Grid3x3, List, Plus, FlaskConical } from 'lucide-react'
import { formatEntityTitle } from "@/lib/format-title"
import {
  FILTER_ALL,
  ResourceFilterRow,
  ResourceListFilter,
} from "@/components/ui/resource-list-filters"
import { ViewModeToggle } from "@/components/ui/view-mode-toggle"
import { CATALYST_MENTION_DRAG_MIME } from "@/lib/catalyst-mention-types"

// Format date consistently to avoid hydration mismatch between server/client locales
const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr)
  // Use ISO format parts for consistency: YYYY-MM-DD
  return date.toISOString().split('T')[0]
}

interface Project {
  id: string
  name: string
  description: string | null
  status: string
  priority: string | null
  start_date: string | null
  end_date: string | null
  created_at: string
  no_of_members: number
  no_of_experiments: number
  created_by: {
    first_name: string
    last_name: string
  } | null
}

/** Client wrapper: single-line header (description + Grid/Table toggle + New button) + list */
export function ProjectsPageContent({ projects }: { projects: Project[] }) {
  const isMobile = useMediaQuery("(max-width: 768px)")
  const [viewMode, setViewMode] = useState<"grid" | "table">("table")
  const [statusFilter, setStatusFilter] = useState(FILTER_ALL)
  const [priorityFilter, setPriorityFilter] = useState(FILTER_ALL)

  useEffect(() => {
    if (isMobile) setViewMode("grid")
  }, [isMobile])

  // Hard-coded enums (matches the project creation form). Counts surface the
  // current distribution so empty buckets stay discoverable.
  const PROJECT_STATUSES = ["planning", "active", "on_hold", "completed", "archived"] as const
  const PROJECT_PRIORITIES = ["low", "medium", "high", "critical"] as const

  const statusOptions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const p of projects) {
      if (p.status) counts.set(p.status, (counts.get(p.status) ?? 0) + 1)
    }
    return PROJECT_STATUSES.map((value) => ({
      value,
      label: `${value.replace(/_/g, " ")} (${counts.get(value) ?? 0})`,
    }))
  }, [projects])

  const priorityOptions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const p of projects) {
      if (p.priority) counts.set(p.priority, (counts.get(p.priority) ?? 0) + 1)
    }
    return PROJECT_PRIORITIES.map((value) => ({
      value,
      label: `${value} (${counts.get(value) ?? 0})`,
    }))
  }, [projects])

  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      if (statusFilter !== FILTER_ALL && p.status !== statusFilter) return false
      if (priorityFilter !== FILTER_ALL && (p.priority || "") !== priorityFilter) return false
      return true
    })
  }, [projects, statusFilter, priorityFilter])

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-muted-foreground">
          Manage your research initiatives and experiments
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <ViewModeToggle value={viewMode} onChange={setViewMode} tableDisabled={isMobile} />
          <Button id="tour-create-project" asChild size="icon" variant="ghost" className="size-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" aria-label="New project">
            <Link href="/projects/new">
              <Plus className="size-4" />
            </Link>
          </Button>
        </div>
      </div>

      <ResourceFilterRow>
        <ResourceListFilter
          label="Status"
          value={statusFilter}
          onValueChange={setStatusFilter}
          options={statusOptions}
          allLabel="All statuses"
        />
        <ResourceListFilter
          label="Priority"
          value={priorityFilter}
          onValueChange={setPriorityFilter}
          options={priorityOptions}
          allLabel="All priorities"
        />
      </ResourceFilterRow>

      <ProjectList projects={filteredProjects} viewMode={viewMode} setViewMode={setViewMode} hideToolbar />
    </div>
  )
}

interface ProjectListProps {
  projects: Project[]
  viewMode?: "grid" | "table"
  setViewMode?: (mode: "grid" | "table") => void
  hideToolbar?: boolean
}

export function ProjectList({ projects, viewMode: controlledView, setViewMode: setControlledView, hideToolbar }: ProjectListProps) {
  const isMobile = useMediaQuery("(max-width: 768px)")
  const [internalView, setInternalView] = useState<"grid" | "table">("table")
  const viewMode = controlledView ?? internalView
  const setViewMode = setControlledView ?? setInternalView
  const effectiveViewMode = isMobile ? "grid" : viewMode

  // Helper function to get better status display
  const getStatusDisplay = (status: string) => {
    const statusMap: Record<string, string> = {
      'active': 'Active',
      'completed': 'Completed',
      'planning': 'Planning',
      'on_hold': 'On Hold',
      'cancelled': 'Cancelled',
      'archived': 'Archived'
    }
    return statusMap[status] || status.replace('_', ' ')
  }

  // Helper function for priority display
  const getPriorityDisplay = (priority: string) => {
    const priorityMap: Record<string, string> = {
      'critical': 'Critical',
      'high': 'High',
      'medium': 'Medium',
      'low': 'Low'
    }
    return priorityMap[priority] || priority
  }

  if (!projects || projects.length === 0) {
    return null
  }

  return (
    <>
      {/* View Toggle - only when not in header */}
      {!hideToolbar && (
        <div className="flex justify-end mb-4">
          <ViewModeToggle value={viewMode} onChange={setViewMode} tableDisabled={isMobile} />
        </div>
      )}

      {/* Grid View - Use auto-fill with fixed card sizes to prevent expansion */}
      {effectiveViewMode === "grid" && (
        <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(280px,1fr))]">
          {projects.map((project) => (
            <Card
              key={project.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(
                  CATALYST_MENTION_DRAG_MIME,
                  JSON.stringify({
                    kind: "project",
                    id: project.id,
                    title: project.name,
                  })
                )
                e.dataTransfer.effectAllowed = "copy"
              }}
              className="hover:border-primary transition-colors flex flex-col min-w-0 overflow-hidden"
            >
              <CardHeader className="pb-3 min-w-0">
                <div className="space-y-2 min-w-0">
                  <CardTitle className="text-lg text-foreground leading-tight min-w-0 line-clamp-2 [overflow-wrap:normal] [word-break:normal]">
                    {formatEntityTitle(project.name)}
                  </CardTitle>
                  {project.description && (
                    <CardDescription className="text-sm min-w-0 line-clamp-2 [overflow-wrap:normal] [word-break:normal]">
                      {project.description}
                    </CardDescription>
                  )}
                </div>
                {/* Status and priority badges in separate row */}
                <div className="flex items-center justify-between pt-2 gap-2 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap min-w-0 overflow-hidden">
                    <Badge
                      variant={
                        project.status === "active"
                          ? "default"
                          : project.status === "completed"
                            ? "secondary"
                            : "outline"
                      }
                      className="text-xs font-medium whitespace-nowrap shrink-0 max-w-full overflow-hidden text-ellipsis"
                    >
                      {getStatusDisplay(project.status)}
                    </Badge>
                    {project.priority && (
                      <Badge
                        variant={
                          project.priority === "critical" || project.priority === "high"
                            ? "destructive"
                            : "outline"
                        }
                        className="text-xs font-medium whitespace-nowrap shrink-0 max-w-full overflow-hidden text-ellipsis"
                      >
                        {getPriorityDisplay(project.priority)}
                      </Badge>
                    )}
                  </div>
                  {project.start_date && (
                    <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0 overflow-hidden text-ellipsis max-w-[80px]">
                      {new Date(project.start_date).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4 flex-1 flex flex-col pt-0 min-w-0">
                <div className="space-y-3 flex-1 min-w-0">
                  <div className="flex items-center justify-between text-sm gap-2 min-w-0">
                    <div className="flex items-center gap-1 text-muted-foreground min-w-0 overflow-hidden">
                      <Users className="h-4 w-4 shrink-0" />
                      <span className="truncate text-ellipsis overflow-hidden">
                        {Math.max(1, project.no_of_members)} {Math.max(1, project.no_of_members) === 1 ? 'member' : 'members'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-muted-foreground min-w-0 overflow-hidden">
                      <FlaskConical className="h-4 w-4 shrink-0" />
                      <span className="truncate text-ellipsis overflow-hidden">
                        {project.no_of_experiments} {project.no_of_experiments === 1 ? "experiment" : "experiments"}
                      </span>
                    </div>
                  </div>
                  {project.created_by && (
                    <div className="flex items-center gap-1 text-sm text-muted-foreground min-w-0 overflow-hidden">
                      <span className="text-xs shrink-0">Lead:</span>
                      <span className="truncate text-ellipsis overflow-hidden">
                        {project.created_by.first_name} {project.created_by.last_name}
                      </span>
                    </div>
                  )}
                </div>
                <Button variant="outline" size="sm" className="w-full mt-auto shrink-0" asChild>
                  <Link href={`/projects/${project.id}`}>
                    <ArrowUpRight className="h-4 w-4 mr-2" />
                    <span className="truncate">View Project</span>
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Table View */}
      {effectiveViewMode === "table" && (
        <ProjectTableView projects={projects} />
      )}
    </>
  )
}

function ProjectTableView({ projects }: { projects: Project[] }) {
  const router = useRouter()
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-foreground">All Projects</CardTitle>
        <CardDescription>Complete list of research projects</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="relative w-full overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[300px]">Project</TableHead>
                <TableHead className="min-w-[120px]">Created</TableHead>
                <TableHead className="text-right min-w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((project) => (
                <TableRow
                  key={project.id}
                  draggable
                  className="cursor-pointer"
                  onDragStart={(e) => {
                    e.dataTransfer.setData(
                      CATALYST_MENTION_DRAG_MIME,
                      JSON.stringify({
                        kind: "project",
                        id: project.id,
                        title: project.name,
                      })
                    )
                    e.dataTransfer.effectAllowed = "copy"
                  }}
                  onClick={() => router.push(`/projects/${project.id}`)}
                >
                  <TableCell className="font-medium text-foreground">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-primary shrink-0" />
                      <span className="truncate">{formatEntityTitle(project.name)}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(project.created_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      asChild
                      onClick={(e: React.MouseEvent) => e.stopPropagation()}
                      aria-label={`Open project ${project.name}`}
                    >
                      <Link href={`/projects/${project.id}`}>
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
