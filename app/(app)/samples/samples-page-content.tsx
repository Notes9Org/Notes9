"use client"

import { useState, useMemo, useEffect } from "react"
import { useMediaQuery } from "@/hooks/use-media-query"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus, Package, Grid3x3, List, Dna, Atom } from "lucide-react"
import Link from "next/link"
import { SampleList } from "./sample-list"
import {
  FILTER_ALL,
  ResourceFilterRow,
  ResourceListFilter,
} from "@/components/ui/resource-list-filters"
import { ViewModeToggle } from "@/components/ui/view-mode-toggle"

interface Sample {
  id: string
  sample_code: string
  sample_type: string
  status: string
  quantity: number | null
  quantity_unit: string | null
  storage_location: string | null
  storage_condition: string | null
  concentration?: number | null
  concentration_unit?: string | null
  created_at: string
  updated_at?: string | null
  experiment_id: string | null
  sample_files?: { id: string; file_kind: string }[]
  sample_projects?: { project: { id: string; name: string } | null }[]
  sample_experiments?: {
    experiment: {
      id: string
      name: string
      project_id: string
      project?: { id: string; name: string } | null
    } | null
  }[]
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
  const [viewMode, setViewMode] = useState<"grid" | "table">("table")
  const [projectFilter, setProjectFilter] = useState(FILTER_ALL)
  const [experimentFilter, setExperimentFilter] = useState(FILTER_ALL)
  const [statusFilter, setStatusFilter] = useState(FILTER_ALL)
  const [typeFilter, setTypeFilter] = useState(FILTER_ALL)

  const filtersActive =
    projectFilter !== FILTER_ALL ||
    experimentFilter !== FILTER_ALL ||
    statusFilter !== FILTER_ALL ||
    typeFilter !== FILTER_ALL

  const clearFilters = () => {
    setProjectFilter(FILTER_ALL)
    setExperimentFilter(FILTER_ALL)
    setStatusFilter(FILTER_ALL)
    setTypeFilter(FILTER_ALL)
  }

  const projectOptions = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of samples) {
      for (const link of s.sample_projects ?? []) {
        if (link.project?.id && link.project.name) m.set(link.project.id, link.project.name)
      }
      for (const link of s.sample_experiments ?? []) {
        const project = link.experiment?.project
        if (project?.id && project.name) m.set(project.id, project.name)
      }
      if (s.experiment?.project?.id && s.experiment.project.name) {
        m.set(s.experiment.project.id, s.experiment.project.name)
      }
    }
    return Array.from(m.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [samples])

  const experimentOptions = useMemo(() => {
    const m = new Map<string, { label: string; project_id: string }>()
    for (const s of samples) {
      for (const link of s.sample_experiments ?? []) {
        const ex = link.experiment
        if (ex?.id && ex.name) {
          m.set(ex.id, { label: ex.name, project_id: ex.project_id })
        }
      }
      if (s.experiment?.id && s.experiment.name) {
        m.set(s.experiment.id, { label: s.experiment.name, project_id: s.experiment.project_id })
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
        const projectIds = new Set<string>()
        for (const link of s.sample_projects ?? []) {
          if (link.project?.id) projectIds.add(link.project.id)
        }
        for (const link of s.sample_experiments ?? []) {
          if (link.experiment?.project?.id) projectIds.add(link.experiment.project.id)
        }
        if (s.experiment?.project?.id) projectIds.add(s.experiment.project.id)
        if (!projectIds.has(projectFilter)) return false
      }
      if (
        experimentFilter !== FILTER_ALL &&
        s.experiment_id !== experimentFilter &&
        !(s.sample_experiments ?? []).some((link) => link.experiment?.id === experimentFilter)
      ) {
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
          <ViewModeToggle value={viewMode} onChange={setViewMode} tableDisabled={isMobile} />
          <Button asChild size="sm" className="gap-2" aria-label="New sample" data-tour="create-sample">
            <Link href="/samples/new">
              <Plus className="size-4" />
              New sample
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
      <div data-tour="sample-stats" className="grid gap-4 grid-cols-2 md:grid-cols-4">
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
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-10 text-center">
            <p className="text-sm text-muted-foreground">No samples match the selected filters.</p>
            {filtersActive ? (
              <Button variant="outline" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export function SamplesEmptyState() {
  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground">
          Track and manage laboratory samples
        </p>
        <Button asChild size="sm" className="gap-2" aria-label="New sample">
          <Link href="/samples/new">
            <Plus className="size-4" />
            New sample
          </Link>
        </Button>
      </div>
      <Card>
        <CardContent className="flex flex-col items-stretch px-6 py-10 sm:px-10">
          <div className="mx-auto mb-8 max-w-lg text-center">
            <Package
              className="mx-auto mb-4 h-12 w-12 text-muted-foreground"
              aria-hidden
            />
            <h2 className="mb-2 text-lg font-semibold text-foreground">
              No samples yet
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Add a sample for any type you track in the lab (cells, reagents, DNA constructs, proteins,
              and more). Open the sample and upload files to visualize maps and structures.
            </p>
          </div>

          <div className="mx-auto mb-8 grid w-full max-w-2xl gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border/80 bg-muted/30 p-4 text-left">
              <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-md border bg-background">
                <Dna className="h-4 w-4 text-primary" aria-hidden />
              </div>
              <p className="text-sm font-medium text-foreground">
                Plasmids and DNA sequences
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                Circular and linear maps, plus simple workflow tools: custom annotations, selection
                details, sequence alignment, and CRISPR guide exploration — right from the molecular
                files tab.
              </p>
            </div>
            <div className="rounded-lg border border-border/80 bg-muted/30 p-4 text-left">
              <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-md border bg-background">
                <Atom className="h-4 w-4 text-primary" aria-hidden />
              </div>
              <p className="text-sm font-medium text-foreground">
                Protein structures
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                Load PDB or mmCIF structures to view in 3D with sequence-linked highlighting,
                representation and color presets, spin and camera controls, and optional
                superposition with RMSD readout when you have two structures on the same sample.
              </p>
            </div>
          </div>

          <Button asChild className="mx-auto w-full sm:w-auto">
            <Link href="/samples/new">
              <Plus className="mr-2 h-4 w-4" />
              Create first sample
            </Link>
          </Button>
        </CardContent>
      </Card>
    </>
  )
}
