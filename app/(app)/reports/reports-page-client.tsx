"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { FileText, Plus, Trash2, ArrowUpRight, Sparkles } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { buttonVariants } from "@/components/ui/button"
import {
  FILTER_ALL,
  ResourceFilterRow,
  ResourceListFilter,
} from "@/components/ui/resource-list-filters"
import { PageHeading } from "@/components/ui/page-heading"
import { ReportGeneratorDialog } from "./report-generator-dialog"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { useProjectScope } from "@/contexts/project-scope-context"

export type ReportRow = {
  id: string
  title: string
  status: string
  report_type: string
  created_at: string
  project_id: string | null
  experiment_id: string | null
  project: { id: string; name: string } | null
  experiment: { id: string; name: string } | null
  generated_by: { first_name: string; last_name: string } | null
}

interface ReportsPageClientProps {
  reports: ReportRow[]
  projects?: { id: string; name: string }[]
  experiments?: { id: string; name: string; project_id: string }[]
  userId?: string
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

export function ReportsPageClient({ reports: initialReports, projects, experiments, userId }: ReportsPageClientProps) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const { projectId, projectName } = useProjectScope()
  const [reports, setReports] = useState(initialReports)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [projectFilter, setProjectFilter] = useState(projectId || FILTER_ALL)
  const [experimentFilter, setExperimentFilter] = useState(FILTER_ALL)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search)
      if (params.get("new") === "true") {
        setDialogOpen(true)
        // Clean up url parameters without reloading
        const proj = params.get("project")
        const cleanUrl = window.location.pathname + (proj ? `?project=${proj}` : "")
        router.replace(cleanUrl)
      }
    }
  }, [router])

  useEffect(() => {
    if (projectId) {
      setProjectFilter(projectId)
    }
  }, [projectId])

  const projectOptions = useMemo(() => {
    if (projects && projects.length > 0) {
      return projects.map((p) => ({ value: p.id, label: p.name })).sort((a, b) => a.label.localeCompare(b.label))
    }
    const m = new Map<string, string>()
    for (const r of reports) {
      if (r.project?.id && r.project?.name) m.set(r.project.id, r.project.name)
    }
    if (projectId && projectName) {
      m.set(projectId, projectName)
    }
    return Array.from(m.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [reports, projects, projectId, projectName])

  const experimentOptions = useMemo(() => {
    if (experiments && experiments.length > 0) {
      return experiments.map((e) => ({ value: e.id, label: e.name, project_id: e.project_id })).sort((a, b) => a.label.localeCompare(b.label))
    }
    const m = new Map<string, { label: string; project_id: string | null }>()
    for (const r of reports) {
      if (r.experiment?.id && r.experiment?.name) {
        m.set(r.experiment.id, { label: r.experiment.name, project_id: r.project_id })
      }
    }
    return Array.from(m.entries()).map(([value, v]) => ({
      value, label: v.label, project_id: v.project_id,
    })).sort((a, b) => a.label.localeCompare(b.label))
  }, [reports, experiments])

  useEffect(() => {
    if (projectFilter === FILTER_ALL) return
    setExperimentFilter((current) => {
      if (current === FILTER_ALL) return current
      const row = experimentOptions.find((e) => e.value === current)
      if (!row || row.project_id !== projectFilter) return FILTER_ALL
      return current
    })
  }, [projectFilter, experimentOptions])

  const experimentFilterOptions = useMemo(() => {
    if (projectFilter === FILTER_ALL) {
      return experimentOptions.map(({ value, label }) => ({ value, label }))
    }
    return experimentOptions
      .filter((e) => e.project_id === projectFilter)
      .map(({ value, label }) => ({ value, label }))
  }, [experimentOptions, projectFilter])

  const filtered = useMemo(() => {
    return reports.filter((r) => {
      if (projectFilter !== FILTER_ALL && r.project_id !== projectFilter) return false
      if (experimentFilter !== FILTER_ALL && r.experiment_id !== experimentFilter) return false
      return true
    })
  }, [reports, projectFilter, experimentFilter])

  const requestDelete = (e: React.MouseEvent, report: ReportRow) => {
    e.stopPropagation()
    setDeleteTarget({ id: report.id, title: report.title })
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      const { error } = await supabase.from("reports").delete().eq("id", deleteTarget.id)
      if (error) {
        toast.error(`Failed to delete: ${error.message}`)
        return
      }
      setReports((prev) => prev.filter((r) => r.id !== deleteTarget.id))
      toast.success("Report deleted")
      setDeleteTarget(null)
    } finally {
      setIsDeleting(false)
    }
  }

  const visibleIds = filtered.map((r) => r.id)
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id))
  const someVisibleSelected = visibleIds.some((id) => selectedIds.includes(id)) && !allVisibleSelected

  const toggleSelected = (id: string, checked: boolean) => {
    setSelectedIds((current) =>
      checked ? [...current, id] : current.filter((selectedId) => selectedId !== id)
    )
  }

  const toggleSelectAllVisible = (checked: boolean) => {
    setSelectedIds((current) => {
      if (checked) return Array.from(new Set([...current, ...visibleIds]))
      return current.filter((id) => !visibleIds.includes(id))
    })
  }

  const confirmBulkDelete = async () => {
    if (selectedIds.length === 0) return
    setIsDeleting(true)
    try {
      const { error } = await supabase.from("reports").delete().in("id", selectedIds)
      if (error) {
        toast.error(`Failed to delete: ${error.message}`)
        return
      }
      setReports((prev) => prev.filter((r) => !selectedIds.includes(r.id)))
      toast.success(`${selectedIds.length} reports deleted`)
      setSelectedIds([])
      setBulkDeleteOpen(false)
    } finally {
      setIsDeleting(false)
    }
  }

  // Title block shared by both states. The "Generate" action is intentionally
  // NOT here — the empty state shows a single prominent CTA in its card, and
  // the populated state appends the header action below. This avoids two
  // identical "Generate" buttons rendering on the same screen.
  const titleBlock = (
    <div>
      <PageHeading>
        Reports &amp; Analytics
      </PageHeading>
      <p className="text-muted-foreground mt-1 text-sm">
        View and generate research reports
      </p>
    </div>
  )

  // Header matches every other top-level list page (Experiments, Projects, …).
  const pageHeader = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {titleBlock}
      <Button onClick={() => setDialogOpen(true)} data-tour="generate-report" className="w-full sm:w-auto">
        <Sparkles className="h-4 w-4 mr-2" />
        Generate AI report
      </Button>
    </div>
  )



  return (
    <div className="space-y-6">
      {pageHeader}
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
        {experimentFilterOptions.length > 0 && (
          <ResourceListFilter
            label="Experiment"
            value={experimentFilter}
            onValueChange={setExperimentFilter}
            options={experimentFilterOptions}
            allLabel="All experiments"
          />
        )}
      </ResourceFilterRow>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-foreground font-medium mb-1">
              {reports.length === 0 ? "No reports generated yet" : "No reports match the selected filters"}
            </p>
            <p className="text-sm text-muted-foreground max-w-md mb-6">
              {reports.length === 0 
                ? "Describe what you want to understand and Catalyst will pull your experiment data into a structured analysis."
                : "Try clearing your filters or generate a new report for this project."}
            </p>
            <Button onClick={() => setDialogOpen(true)}>
              <Sparkles className="h-4 w-4 mr-2" />
              {reports.length === 0 ? "Generate first AI report" : "Generate AI report"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {selectedIds.length > 0 && (
            <div className="flex items-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setBulkDeleteOpen(true)}
                className="bg-rose-50 text-rose-600 border border-rose-100 font-semibold hover:bg-rose-100 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-900/10 dark:hover:bg-rose-900/30"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Selected ({selectedIds.length})
              </Button>
            </div>
          )}
          <div className="relative w-full overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[48px]">
                    <Checkbox
                      checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
                      onCheckedChange={(checked) => toggleSelectAllVisible(checked === true)}
                      aria-label="Select all visible reports"
                      className="data-[state=checked]:bg-rose-50 data-[state=checked]:text-rose-600 data-[state=checked]:border-rose-200 dark:data-[state=checked]:bg-rose-950/30 dark:data-[state=checked]:text-rose-400 dark:data-[state=checked]:border-rose-900/30"
                    />
                  </TableHead>
                  <TableHead className="min-w-[300px]">Report</TableHead>
                  <TableHead className="min-w-[120px]">Created</TableHead>
                  <TableHead className="text-right min-w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
            <TableBody>
              {filtered.map((report) => (
                <TableRow
                  key={report.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/reports/${report.id}`)}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedIds.includes(report.id)}
                      onCheckedChange={(checked) => toggleSelected(report.id, checked === true)}
                      aria-label={`Select ${report.title}`}
                      className="data-[state=checked]:bg-rose-50 data-[state=checked]:text-rose-600 data-[state=checked]:border-rose-200 dark:data-[state=checked]:bg-rose-950/30 dark:data-[state=checked]:text-rose-400 dark:data-[state=checked]:border-rose-900/30"
                    />
                  </TableCell>
                  <TableCell className="font-medium text-foreground">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary shrink-0" />
                      <span className="truncate">{report.title}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(report.created_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/reports/${report.id}`} onClick={(e) => e.stopPropagation()}>
                          <ArrowUpRight className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => requestDelete(e, report)}
                        title="Delete report"
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        </div>
      )}

      <ReportGeneratorDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        projects={projects ?? []}
        experiments={experiments ?? []}
        userId={userId ?? ""}
      />

      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete report?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? (
                <>
                  This will permanently delete <strong>"{deleteTarget.title}"</strong>. This action cannot be undone.
                </>
              ) : (
                "This action cannot be undone."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={isDeleting}
              className={buttonVariants({ variant: "destructive" })}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.length} reports?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the selected reports. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmBulkDelete}
              disabled={isDeleting}
              className={buttonVariants({ variant: "destructive" })}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
