"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { FileText, Plus, Trash2, ArrowUpRight } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  FILTER_ALL,
  ResourceFilterRow,
  ResourceListFilter,
} from "@/components/ui/resource-list-filters"
import { ReportGeneratorDialog } from "./report-generator-dialog"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"

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
  const [reports, setReports] = useState(initialReports)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [projectFilter, setProjectFilter] = useState(FILTER_ALL)
  const [experimentFilter, setExperimentFilter] = useState(FILTER_ALL)

  const projectOptions = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of reports) {
      if (r.project?.id && r.project?.name) m.set(r.project.id, r.project.name)
    }
    return Array.from(m.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [reports])

  const experimentOptions = useMemo(() => {
    const m = new Map<string, { label: string; project_id: string | null }>()
    for (const r of reports) {
      if (r.experiment?.id && r.experiment?.name) {
        m.set(r.experiment.id, { label: r.experiment.name, project_id: r.project_id })
      }
    }
    return Array.from(m.entries()).map(([value, v]) => ({
      value, label: v.label, project_id: v.project_id,
    }))
  }, [reports])

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

  const handleDelete = async (e: React.MouseEvent, reportId: string) => {
    e.stopPropagation()
    if (!confirm("Delete this report? This cannot be undone.")) return
    const supabase = createClient()
    const { error } = await supabase.from("reports").delete().eq("id", reportId)
    if (error) {
      toast.error(`Failed to delete: ${error.message}`)
    } else {
      setReports((prev) => prev.filter((r) => r.id !== reportId))
      toast.success("Report deleted")
    }
  }

  if (reports.length === 0) {
    return (
      <>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">No reports generated yet</p>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Generate First Report
            </Button>
          </CardContent>
        </Card>
        <ReportGeneratorDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          projects={projects ?? []}
          experiments={experiments ?? []}
          userId={userId ?? ""}
        />
      </>
    )
  }

  return (
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
        {experimentFilterOptions.length > 0 && (
          <ResourceListFilter
            label="Experiment"
            value={experimentFilter}
            onValueChange={setExperimentFilter}
            options={experimentFilterOptions}
            allLabel="All experiments"
          />
        )}
        <div className="flex items-end ml-auto">
          <Button onClick={() => setDialogOpen(true)} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Generate Report
          </Button>
        </div>
      </ResourceFilterRow>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">No reports match the selected filters.</p>
      ) : (
        <div className="relative w-full overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
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
                        onClick={(e) => handleDelete(e, report.id)}
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
      )}

      <ReportGeneratorDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        projects={projects ?? []}
        experiments={experiments ?? []}
        userId={userId ?? ""}
      />
    </>
  )
}
