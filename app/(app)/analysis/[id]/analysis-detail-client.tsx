"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { cn } from "@/lib/utils"
import { motion, useReducedMotion } from "@/components/literature-reviews/motion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { ChartLine, Table as TableIcon } from "@phosphor-icons/react/ssr"
import type { AnalysisSpec, FigureSpec, Results } from "@/types/analysis"
import { AnalysisWorkspace } from "@/components/analysis"
import {
  DatasetPicker,
  type DatasetFile,
  type DatasetSelection,
  type ParsedSheet,
} from "@/components/analysis/data/dataset-picker"
import { ResultsPanel } from "@/components/analysis/results-panel"
import {
  ColumnRoleGrid,
  detectDtype,
  suggestRole,
  type ColumnAssignment,
  type ColumnRole,
} from "@/components/analysis/data/column-role-grid"
import { TableTypeChip } from "@/components/analysis/data/table-type-chip"
import { DataDrawer } from "@/components/analysis/data/data-drawer"

/** Same spring the literature top-section pill uses, so both read as one system. */
const INDICATOR_SPRING = { type: "spring", stiffness: 500, damping: 40, mass: 0.7 } as const

const SECTIONS = ["analysis", "data"] as const
type Section = (typeof SECTIONS)[number]

function isSection(value: string | null): value is Section {
  return value != null && (SECTIONS as readonly string[]).includes(value)
}

/**
 * Reads the roles already stored on the spec back onto a freshly loaded sheet,
 * falling back to a detected-type suggestion for columns the spec says nothing
 * about. Column names are the join key — that is what AnalysisSpec.roles holds.
 */
function assignmentsForSheet(sheet: ParsedSheet, spec: AnalysisSpec): ColumnAssignment[] {
  const roleFor = (name: string): ColumnRole | null => {
    if (spec.roles.measurement.includes(name)) return "measurement"
    if (spec.roles.group.includes(name)) return "group"
    if (spec.roles.subject?.includes(name)) return "subject"
    return null
  }

  return sheet.header.map((name, index) => {
    const values = sheet.rows.map((row) => row[index])
    const detectedDtype = detectDtype(values)
    return {
      index,
      name,
      dtype: detectedDtype,
      detectedDtype,
      role: roleFor(name) ?? suggestRole(detectedDtype),
      sample: values.filter((v) => v != null && v !== "").slice(0, 3),
    }
  })
}

/** Folds the grid back into the spec's three role arrays. */
function rolesFromColumns(columns: ColumnAssignment[]): AnalysisSpec["roles"] {
  const named = (role: ColumnRole) =>
    columns.filter((c) => c.role === role).map((c) => c.name)
  const subject = named("subject")
  return {
    measurement: named("measurement"),
    group: named("group"),
    subject: subject.length > 0 ? subject : null,
  }
}

export function AnalysisDetailClient({
  title,
  status,
  experimentId,
  experimentName,
  projectName,
  spec: initialSpec,
  results,
  figureSpec,
  files,
}: {
  analysisId: string
  title: string
  status: string
  experimentId: string
  experimentName: string | null
  projectName: string | null
  spec: AnalysisSpec
  results: Results | null
  /** Null until the analysis has actually been run — there is no figure yet. */
  figureSpec: FigureSpec | null
  files: DatasetFile[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const reduce = useReducedMotion()

  const paramSection = searchParams.get("section")
  const [section, setSection] = useState<Section>(
    isSection(paramSection) ? paramSection : "analysis",
  )

  // Mirror the control to `?section=` so the tab survives a reload and a shared
  // link lands on the same half of the workspace. `replace` keeps the back
  // button pointed at the list, not at every tab flip.
  useEffect(() => {
    if (paramSection === section) return
    const next = new URLSearchParams(searchParams.toString())
    next.set("section", section)
    router.replace(`${pathname}?${next.toString()}`, { scroll: false })
  }, [section, paramSection, pathname, router, searchParams])

  const [spec, setSpec] = useState<AnalysisSpec>(initialSpec)
  const [sheet, setSheet] = useState<ParsedSheet | null>(null)
  const [columns, setColumns] = useState<ColumnAssignment[]>([])

  const source: DatasetSelection = useMemo(
    () => ({
      data_id: spec.source.data_id,
      sheet: spec.source.sheet,
      range: spec.source.range,
    }),
    [spec.source],
  )

  const excludedRows = spec.params.excluded_rows ?? []

  const handleSourceChange = useCallback(
    (selection: DatasetSelection, loaded: ParsedSheet | null) => {
      setSpec((current) => ({ ...current, source: { ...selection } }))
      setSheet(loaded)
      setColumns(loaded ? assignmentsForSheet(loaded, spec) : [])
    },
    [spec],
  )

  const handleRoleChange = useCallback(
    (index: number, patch: Partial<Pick<ColumnAssignment, "role" | "dtype">>) => {
      const next = columns.map((c) => (c.index === index ? { ...c, ...patch } : c))
      setColumns(next)
      setSpec((s) => ({ ...s, roles: rolesFromColumns(next) }))
    },
    [columns],
  )

  const handleToggleExclude = useCallback((rowIndex: number) => {
    setSpec((current) => {
      const set = new Set(current.params.excluded_rows ?? [])
      if (set.has(rowIndex)) set.delete(rowIndex)
      else set.add(rowIndex)
      return {
        ...current,
        params: { ...current.params, excluded_rows: [...set].sort((a, b) => a - b) },
      }
    })
  }, [])

  const dataDrawer = (
    <DataDrawer
      results={results}
      header={sheet?.header ?? []}
      rows={sheet?.rows ?? []}
      excludedRows={excludedRows}
      onToggleExclude={handleToggleExclude}
    />
  )

  // §03: the Analysis rail is the analytical record; the role grid belongs to
  // Data. Rendering the grid on both is why a finished analysis showed an empty
  // "No columns to assign" panel.
  const leftPanel =
    section === "analysis" ? (
      <ResultsPanel results={results} />
    ) : (
      <div className="space-y-4">
        <TableTypeChip columns={columns} />
        <ColumnRoleGrid columns={columns} onChange={handleRoleChange} />
      </div>
    )

  const renderTab = (value: Section, label: string, Icon: typeof ChartLine) => (
    <button
      type="button"
      onClick={() => setSection(value)}
      aria-pressed={section === value}
      className={cn(
        "relative inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors duration-200",
        section === value ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {section === value &&
        (reduce ? (
          <span className="absolute inset-0 rounded-xl bg-background shadow-sm ring-1 ring-border/50" />
        ) : (
          <motion.span
            layoutId="analysis-section-pill"
            className="absolute inset-0 rounded-xl bg-background shadow-sm ring-1 ring-border/50"
            transition={INDICATOR_SPRING}
          />
        ))}
      <span className="relative z-10 inline-flex items-center gap-2">
        <Icon className="size-4" aria-hidden />
        {label}
      </span>
    </button>
  )

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold" title={title}>
            {title}
          </h1>
          <p className="text-sm text-muted-foreground">
            {[experimentName, projectName].filter(Boolean).join(" · ") || "No experiment"}
          </p>
        </div>
        <Badge variant="outline" className="capitalize">
          {status}
        </Badge>
      </div>

      <div className="glass-panel inline-flex rounded-2xl p-1 shadow-sm">
        {renderTab("analysis", "Analysis", ChartLine)}
        {renderTab("data", "Data", TableIcon)}
      </div>

      {section === "analysis" ? (
        figureSpec ? (
          <AnalysisWorkspace
            initialSpec={figureSpec}
            leftPanel={leftPanel}
            dataDrawer={dataDrawer}
          />
        ) : (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ChartLine aria-hidden />
              </EmptyMedia>
              <EmptyTitle>Nothing plotted yet</EmptyTitle>
              <EmptyDescription>
                This analysis has no figure. Assign column roles in the Data section —
                the test and the figure follow from them.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" size="sm" onClick={() => setSection("data")}>
                Go to Data
              </Button>
            </EmptyContent>
          </Empty>
        )
      ) : (
        <div className="space-y-6">
          <DatasetPicker
            experimentId={experimentId}
            files={files}
            value={source}
            onChange={handleSourceChange}
          />
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold">Column roles</h2>
              <TableTypeChip columns={columns} />
            </div>
            <ColumnRoleGrid columns={columns} onChange={handleRoleChange} />
          </div>
          {dataDrawer}
        </div>
      )}
    </div>
  )
}
