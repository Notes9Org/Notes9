"use client"

import { useState, useEffect, useMemo } from "react"
import { useMediaQuery } from "@/hooks/use-media-query"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus, Package, Grid3x3, List } from "lucide-react"
import Link from "next/link"
import { SampleList } from "./sample-list"
import {
  FILTER_ALL,
  ResourceFilterRow,
  ResourceListFilter,
} from "@/components/ui/resource-list-filters"

interface Sample {
  id: string
  sample_code: string
  sample_type: string
  status: string
  quantity: number | null
  quantity_unit: string | null
  storage_location: string | null
  storage_condition: string | null
  experiment_id: string | null
  experiment?: {
    id: string
    name: string
    project_id: string
    project?: { id: string; name: string } | null
  } | null
}

interface SamplesPageContentProps {
  samples: Sample[]
  statusCount: { available: number; in_use: number; depleted: number; disposed: number }
}

export function SamplesPageContent({ samples, statusCount }: SamplesPageContentProps) {
  const isMobile = useMediaQuery("(max-width: 768px)")
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid")
  const [projectFilter, setProjectFilter] = useState(FILTER_ALL)
  const [experimentFilter, setExperimentFilter] = useState(FILTER_ALL)
  const [statusFilter, setStatusFilter] = useState(FILTER_ALL)
  const [typeFilter, setTypeFilter] = useState(FILTER_ALL)

  useEffect(() => {
    if (isMobile) setViewMode("grid")
  }, [isMobile])

  const projectOptions = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of samples) {
      const id = s.experiment?.project?.id
      const name = s.experiment?.project?.name
      if (id && name) m.set(id, name)
    }
    return Array.from(m.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [samples])

  const experimentOptions = useMemo(() => {
    const m = new Map<string, { label: string; project_id: string }>()
    for (const s of samples) {
      const ex = s.experiment
      if (ex?.id && ex.name) {
        m.set(ex.id, { label: ex.name, project_id: ex.project_id })
      }
    }
    return Array.from(m.entries()).map(([value, v]) => ({
      value,
      label: v.label,
      project_id: v.project_id,
    }))
  }, [samples])

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
    const u = new Set(samples.map((s) => s.status).filter(Boolean))
    return Array.from(u)
      .sort()
      .map((value) => ({ value, label: value.replace(/_/g, " ") }))
  }, [samples])

  const typeOptions = useMemo(() => {
    const u = new Set(samples.map((s) => s.sample_type).filter(Boolean))
    return Array.from(u)
      .sort()
      .map((value) => ({ value, label: value.replace(/_/g, " ") }))
  }, [samples])

  const filteredSamples = useMemo(() => {
    return samples.filter((s) => {
      if (projectFilter !== FILTER_ALL) {
        const pid = s.experiment?.project?.id
        if (pid !== projectFilter) return false
      }
      if (experimentFilter !== FILTER_ALL && s.experiment_id !== experimentFilter) {
        return false
      }
      if (statusFilter !== FILTER_ALL && s.status !== statusFilter) return false
      if (typeFilter !== FILTER_ALL && s.sample_type !== typeFilter) return false
      return true
    })
  }, [samples, projectFilter, experimentFilter, statusFilter, typeFilter])

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-muted-foreground">
          Track and manage laboratory samples
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <div className="inline-flex gap-1 rounded-lg border p-1">
            <Button
              variant={viewMode === "grid" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("grid")}
              className="gap-2"
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
            >
              <List className="h-4 w-4" />
              Table
            </Button>
          </div>
          <Button
            asChild
            size="icon"
            variant="ghost"
            className="size-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="New sample"
          >
            <Link href="/samples/new">
              <Plus className="size-4" />
            </Link>
          </Button>
        </div>
      </div>

      <ResourceFilterRow>
        <ResourceListFilter
          label="Project"
          value={projectFilter}
          onValueChange={setProjectFilter}
          options={projectOptions}
          allLabel="All projects"
        />
        <ResourceListFilter
          label="Experiment"
          value={experimentFilter}
          onValueChange={setExperimentFilter}
          options={experimentFilterOptions}
          allLabel="All experiments"
        />
        <ResourceListFilter
          label="Status"
          value={statusFilter}
          onValueChange={setStatusFilter}
          options={statusOptions}
          allLabel="All statuses"
        />
        {typeOptions.length > 0 && (
          <ResourceListFilter
            label="Type"
            value={typeFilter}
            onValueChange={setTypeFilter}
            options={typeOptions}
            allLabel="All types"
          />
        )}
      </ResourceFilterRow>

      {/* Status Overview - same as experiments-style spacing */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Available</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-success">{statusCount.available}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">In Use</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{statusCount.in_use}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Depleted</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-warning">{statusCount.depleted}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Disposed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-muted-foreground">{statusCount.disposed}</div>
          </CardContent>
        </Card>
      </div>

      {filteredSamples.length > 0 ? (
        <SampleList samples={filteredSamples} viewMode={viewMode} setViewMode={setViewMode} hideToolbar />
      ) : (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No samples match the selected filters.
        </p>
      )}
    </div>
  )
}

export function SamplesEmptyState() {
  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-muted-foreground">
          Track and manage laboratory samples
        </p>
        <Button
          asChild
          size="icon"
          variant="ghost"
          className="shrink-0 size-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label="New sample"
        >
          <Link href="/samples/new">
            <Plus className="size-4" />
          </Link>
        </Button>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Package className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground mb-4">No samples recorded</p>
          <Button asChild>
            <Link href="/samples/new">
              <Plus className="h-4 w-4 mr-2" />
              Create First Sample
            </Link>
          </Button>
        </CardContent>
      </Card>
    </>
  )
}
