"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DatasetPicker,
  type DatasetFile,
  type DatasetSelection,
  type ParsedSheet,
} from "@/components/analysis/data/dataset-picker"
import {
  ColumnRoleGrid,
  detectDtype,
  suggestRole,
  type ColumnAssignment,
  type ColumnRole,
} from "@/components/analysis/data/column-role-grid"
import { TableTypeChip, deriveTableType } from "@/components/analysis/data/table-type-chip"
import type { AnalysisSpec } from "@/types/analysis"

type Project = { id: string; name: string }
type Experiment = { id: string; name: string; project_id: string | null }
type DataFile = DatasetFile & { experiment_id: string; project_id: string | null }

/** One catalog entry as served by GET /api/analyses/catalog. */
type CatalogEntry = {
  analysis_type: string
  default_figure: string
  requires: Record<string, unknown>
  assumptions: string[]
  params: { name: string; default?: unknown; required?: boolean }[]
}

/** Folds the role grid back into the spec's three role arrays. */
function rolesFromColumns(columns: ColumnAssignment[]): AnalysisSpec["roles"] {
  const named = (role: ColumnRole) =>
    columns.filter((c) => c.role === role).map((c) => c.name)
  const subject = named("subject")
  // xy analyses read the independent variable FIRST: linear_regression takes
  // measurement[0] as x and measurement[1] as y. Appending x after measurement
  // silently transposes the fit — plotting concentration against response.
  const x = named("x")
  return {
    measurement: [...x, ...named("measurement")],
    group: named("group"),
    subject: subject.length > 0 ? subject : null,
  }
}

/**
 * Params come from the catalog's own schema, not a hardcoded floor: the Python
 * dataclasses deliberately default nothing (scipy's and R's defaults differ, and
 * the spec exists so the same JSON reproduces the same numbers), and each
 * analysis pins different keys — `tails` is absent for linear_regression, for
 * instance. So we echo the declared defaults back and override only alpha.
 */
function paramsFromSchema(entry: CatalogEntry, alpha: number): AnalysisSpec["params"] {
  const params: Record<string, unknown> = {}
  for (const field of entry.params ?? []) {
    if (field.default !== undefined) params[field.name] = field.default
  }
  params.alpha = alpha
  params.missing ??= "listwise_delete"
  params.excluded_rows ??= []
  return params as AnalysisSpec["params"]
}

/** Column-oriented payload for /analysis/run, numeric columns coerced. */
function dataFromSheet(sheet: ParsedSheet, columns: ColumnAssignment[]) {
  const data: Record<string, (string | number | null)[]> = {}
  for (const col of columns) {
    if (col.role === "ignore") continue
    data[col.name] = sheet.rows.map((row) => {
      const raw = row[col.index]
      if (col.dtype !== "number") return raw ?? null
      if (raw == null || raw === "") return null
      const n = Number(raw)
      return Number.isFinite(n) ? n : null
    })
  }
  return data
}

/**
 * The workspace before anything has been run. Same two sections as
 * /analysis/[id] — Data sets the source up, Analysis holds the plan — but the
 * plan card is authored from the catalog rather than proposed by a model.
 * When POST /api/analyses/propose lands it fills THIS card and presses THIS
 * Run, so nothing here is throwaway.
 */
export function NewAnalysisClient({
  projects,
  experiments,
  files,
  initialProjectId,
  initialExperimentId,
}: {
  projects: Project[]
  experiments: Experiment[]
  files: DataFile[]
  initialProjectId: string | null
  initialExperimentId: string | null
}) {
  const router = useRouter()

  const [projectId, setProjectId] = useState<string | null>(initialProjectId)
  const [experimentId, setExperimentId] = useState<string | null>(initialExperimentId)
  const [section, setSection] = useState<"data" | "analysis">("data")

  const [selection, setSelection] = useState<DatasetSelection | null>(null)
  const [sheet, setSheet] = useState<ParsedSheet | null>(null)
  const [columns, setColumns] = useState<ColumnAssignment[]>([])

  const [catalog, setCatalog] = useState<CatalogEntry[]>([])
  const [analysisType, setAnalysisType] = useState<string | null>(null)
  const [alpha, setAlpha] = useState(0.05)

  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const experimentOptions = useMemo(
    () => (projectId ? experiments.filter((e) => e.project_id === projectId) : experiments),
    [experiments, projectId],
  )

  const experimentFiles = useMemo(
    () => files.filter((f) => f.experiment_id === experimentId),
    [files, experimentId],
  )

  const tableType = useMemo(() => deriveTableType(columns.map((c) => c.role)), [columns])

  const handleDataset = useCallback((next: DatasetSelection, parsed: ParsedSheet | null) => {
    setSelection(next)
    setSheet(parsed)
    setColumns(
      parsed
        ? parsed.header.map((name, index) => {
            const values = parsed.rows.map((row) => row[index])
            const dtype = detectDtype(values)
            return {
              index,
              name,
              dtype,
              detectedDtype: dtype,
              role: suggestRole(dtype),
              sample: values.filter((v) => v != null && v !== "").slice(0, 3),
            }
          })
        : [],
    )
  }, [])

  const handleRoleChange = useCallback(
    (index: number, patch: Partial<Pick<ColumnAssignment, "role" | "dtype">>) => {
      setColumns((prev) => prev.map((c) => (c.index === index ? { ...c, ...patch } : c)))
    },
    [],
  )

  // The catalog is declared on the backend and never mirrored here, so the
  // runnable analyses re-fetch whenever the derived shape changes.
  useEffect(() => {
    if (!tableType) {
      setCatalog([])
      setAnalysisType(null)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/analyses/catalog?table_type=${tableType}`)
        if (!res.ok) throw new Error("Could not load the analysis catalog.")
        const body = await res.json()
        // Tolerate either the wrapped object or a bare list.
        const entries: CatalogEntry[] = Array.isArray(body) ? body : (body.analyses ?? [])
        if (cancelled) return
        setCatalog(entries)
        setAnalysisType((current) =>
          current && entries.some((e) => e.analysis_type === current)
            ? current
            : (entries[0]?.analysis_type ?? null),
        )
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Catalog unavailable.")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tableType])

  const entry = catalog.find((e) => e.analysis_type === analysisType) ?? null
  const ready = Boolean(experimentId && selection && sheet && tableType && entry)

  async function handleRun() {
    if (!ready || !entry || !selection || !sheet || !tableType || !experimentId) return
    setRunning(true)
    setError(null)

    const spec: AnalysisSpec = {
      schema_version: 1,
      table_type: tableType,
      analysis_type: entry.analysis_type,
      runtime: "python",
      source: selection,
      roles: rolesFromColumns(columns),
      params: paramsFromSchema(entry, alpha),
      transforms: [],
      figure: { template: entry.default_figure },
    }

    try {
      const res = await fetch("/api/analyses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          experiment_id: experimentId,
          project_id: projectId,
          analysis_spec: spec,
          source_data_id: selection.data_id,
          data: dataFromSheet(sheet, columns),
        }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error ?? "The analysis could not be run.")
      // The route answers { analysis: row } — never push a bare body.id, that
      // lands on /analysis/undefined with the row already written.
      const id = body?.analysis?.id
      if (typeof id !== "string") throw new Error("The analysis ran but its id was missing.")
      router.push(`/analysis/${id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "The analysis could not be run.")
      setRunning(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">New analysis</h1>
        <div className="inline-flex rounded-2xl bg-muted p-1">
          {(["data", "analysis"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSection(s)}
              className={`rounded-xl px-4 py-1.5 text-sm capitalize transition ${
                section === s ? "bg-background shadow-sm ring-1 ring-border/50" : "text-muted-foreground"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* An analysis belongs to an experiment (experiment_id is NOT NULL), so
          this picker is the first gate — prefilled from project scope. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="new-analysis-project">Project</Label>
          <Select
            value={projectId ?? ""}
            onValueChange={(v) => {
              setProjectId(v)
              setExperimentId((current) => {
                const exp = experiments.find((e) => e.id === current)
                return exp && exp.project_id === v ? current : null
              })
            }}
          >
            <SelectTrigger id="new-analysis-project">
              <SelectValue placeholder="Choose a project" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="new-analysis-experiment">Experiment (required)</Label>
          <Select value={experimentId ?? ""} onValueChange={setExperimentId}>
            <SelectTrigger id="new-analysis-experiment">
              <SelectValue placeholder="Choose an experiment" />
            </SelectTrigger>
            <SelectContent>
              {experimentOptions.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {section === "data" ? (
        <div className="space-y-4">
          {!experimentId ? (
            <p className="text-sm text-muted-foreground">
              Choose an experiment to see its data files.
            </p>
          ) : experimentFiles.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-center">
              <p className="text-sm text-muted-foreground">
                No tabular files in this experiment yet.
              </p>
              <Button asChild variant="outline" size="sm" className="mt-3">
                <Link href={`/data?experiment=${experimentId}`}>Upload a data file</Link>
              </Button>
            </div>
          ) : (
            <>
              <DatasetPicker
                experimentId={experimentId}
                files={experimentFiles}
                value={selection}
                onChange={handleDataset}
              />
              {columns.length > 0 && (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Detected shape</span>
                    <TableTypeChip columns={columns} />
                  </div>
                  <ColumnRoleGrid columns={columns} onChange={handleRoleChange} />
                </>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* ponytail: the prompt box is the propose-mode seam (§06). Inert
              until POST /api/analyses/propose exists — shown, not faked. */}
          <div className="rounded-xl border border-dashed p-4">
            <p className="text-sm text-muted-foreground">
              Describing the analysis in plain language is not wired up yet — pick it below.
            </p>
          </div>

          {!tableType ? (
            <p className="text-sm text-muted-foreground">
              Assign column roles in the Data section first — the runnable analyses depend on
              the table shape they describe.
            </p>
          ) : (
            <div className="space-y-4 rounded-xl border p-4">
              <div className="space-y-2">
                <Label htmlFor="new-analysis-type">Analysis</Label>
                <Select value={analysisType ?? ""} onValueChange={setAnalysisType}>
                  <SelectTrigger id="new-analysis-type">
                    <SelectValue placeholder="Choose an analysis" />
                  </SelectTrigger>
                  <SelectContent>
                    {catalog.map((c) => (
                      <SelectItem key={c.analysis_type} value={c.analysis_type}>
                        {c.analysis_type.replace(/_/g, " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-analysis-alpha">Significance level (α)</Label>
                <input
                  id="new-analysis-alpha"
                  type="number"
                  step="0.01"
                  min="0.001"
                  max="0.5"
                  value={alpha}
                  onChange={(e) => setAlpha(Number(e.target.value))}
                  className="h-9 w-28 rounded-md border bg-background px-3 text-sm"
                />
              </div>

              {entry && entry.assumptions.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  Checks after the run: {entry.assumptions.join(", ")}
                </p>
              )}
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button onClick={handleRun} disabled={!ready || running}>
              {running ? "Running…" : "Run"}
            </Button>
            {!ready && (
              <span className="text-sm text-muted-foreground">
                Needs an experiment, a data file, column roles, and an analysis.
              </span>
            )}
          </div>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
