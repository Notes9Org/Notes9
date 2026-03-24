"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { FileText, Plus, Download, Calendar } from "lucide-react"
import {
  FILTER_ALL,
  ResourceFilterRow,
  ResourceListFilter,
} from "@/components/ui/resource-list-filters"

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

export function ReportsPageClient({ reports }: { reports: ReportRow[] }) {
  const [projectFilter, setProjectFilter] = useState(FILTER_ALL)
  const [experimentFilter, setExperimentFilter] = useState(FILTER_ALL)
  const [statusFilter, setStatusFilter] = useState(FILTER_ALL)
  const [typeFilter, setTypeFilter] = useState(FILTER_ALL)

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
        m.set(r.experiment.id, {
          label: r.experiment.name,
          project_id: r.project_id,
        })
      }
    }
    return Array.from(m.entries()).map(([value, v]) => ({
      value,
      label: v.label,
      project_id: v.project_id,
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

  const statusOptions = useMemo(() => {
    const s = new Set(reports.map((r) => r.status).filter(Boolean))
    return Array.from(s)
      .sort()
      .map((value) => ({ value, label: value.replace(/_/g, " ") }))
  }, [reports])

  const typeOptions = useMemo(() => {
    const s = new Set(reports.map((r) => r.report_type).filter(Boolean))
    return Array.from(s)
      .sort()
      .map((value) => ({ value, label: value.replace(/_/g, " ") }))
  }, [reports])

  const filtered = useMemo(() => {
    return reports.filter((r) => {
      if (projectFilter !== FILTER_ALL && r.project_id !== projectFilter) return false
      if (experimentFilter !== FILTER_ALL && r.experiment_id !== experimentFilter) return false
      if (statusFilter !== FILTER_ALL && r.status !== statusFilter) return false
      if (typeFilter !== FILTER_ALL && r.report_type !== typeFilter) return false
      return true
    })
  }, [reports, projectFilter, experimentFilter, statusFilter, typeFilter])

  if (reports.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <FileText className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground mb-4">No reports generated yet</p>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Generate First Report
          </Button>
        </CardContent>
      </Card>
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
        <ResourceListFilter
          label="Status"
          value={statusFilter}
          onValueChange={setStatusFilter}
          options={statusOptions}
          allLabel="All statuses"
        />
        <ResourceListFilter
          label="Report type"
          value={typeFilter}
          onValueChange={setTypeFilter}
          options={typeOptions}
          allLabel="All types"
        />
      </ResourceFilterRow>

      <div className="space-y-4">
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No reports match the selected filters.</p>
        ) : (
          filtered.map((report) => (
            <Card key={report.id} className="hover:border-primary transition-colors cursor-pointer">
              <CardContent className="flex items-center justify-between pt-6">
                <div className="flex items-start gap-4 flex-1 min-w-0">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <FileText className="h-6 w-6" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{report.title}</h3>
                      <Badge
                        variant={
                          report.status === "final"
                            ? "default"
                            : report.status === "review"
                              ? "secondary"
                              : "outline"
                        }
                      >
                        {report.status}
                      </Badge>
                      <Badge variant="outline">{report.report_type}</Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      {report.project && <span>Project: {report.project.name}</span>}
                      {report.experiment && <span>Experiment: {report.experiment.name}</span>}
                      {report.generated_by && (
                        <span>
                          By: {report.generated_by.first_name} {report.generated_by.last_name}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3 shrink-0" />
                      <span>Created: {new Date(report.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button variant="outline" size="sm">
                    View
                  </Button>
                  <Button variant="ghost" size="sm">
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </>
  )
}

export function ReportsAnalyticsSection() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Experiment Completion Rate</CardTitle>
          <CardDescription>Monthly experiment completion statistics</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[200px] flex items-center justify-center text-muted-foreground">
            Chart placeholder - Experiment completion trend
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Equipment Utilization</CardTitle>
          <CardDescription>Equipment usage across the organization</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[200px] flex items-center justify-center text-muted-foreground">
            Chart placeholder - Equipment usage statistics
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
