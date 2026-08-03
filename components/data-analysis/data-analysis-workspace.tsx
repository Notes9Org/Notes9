"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import * as XLSX from "xlsx"
import { AnimatePresence, motion } from "framer-motion"
import {
  ChartLine,
  ChartBar,
  ChartScatter,
  ChartPolar,
  ChartPieSlice,
  Function as FnIcon,
  UploadSimple,
  DownloadSimple,
  Sliders,
  Table as TableIcon,
  ChartBarHorizontal,
  Circle,
  ChartLineUp,
  Waveform,
  GridNine,
  GridFour,
  Copy,
  SlidersHorizontal,
  PushPin,
  Sigma,
  TrendUp,
  CaretLeft,
  CaretRight,
  CaretDown,
  ArrowsOutSimple,
  ArrowsInSimple,
  Palette,
  Ruler,
  TextAa,
  FolderOpen,
  FloppyDisk,
  MagnifyingGlass,
  SquaresFour,
  Cube,
  Cursor,
  ArrowRight,
  ArrowUp,
  Plus,
  Check,
  Sparkle,
} from "@phosphor-icons/react/ssr"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import type { DataFileRow } from "@/components/data-analysis/data-files-list"
import { UniverWorkbookView, type SheetSelection } from "@/components/spreadsheet/univer-workbook-view"
import { CatalystSectionHero } from "@/components/catalyst/catalyst-section-hero"
import { PlotlyChart, type PlotlyEdits, type ChartExportFn, type ChartElement, type ChartMenuGroup } from "@/components/data-analysis/plotly-chart"
import { ExportMenu } from "@/components/data-analysis/export-menu"
import { openCatalystPanel } from "@/lib/catalyst-launch"
import type { ExportFormat } from "@/lib/data-analysis/chart-export"
import { useStatsPanel, type Table } from "@/components/data-analysis/stats-panel"
import { describe as describeStats } from "@/lib/data-analysis/statistics"
import { normalInv } from "@/lib/data-analysis/distributions"
import { rocCurve, kaplanMeier, blandAltman } from "@/lib/data-analysis/chart-transforms"
import { useStandardCurve } from "@/components/data-analysis/standard-curve-panel"
import { usePlate, usePlateModel } from "@/components/data-analysis/plate-view"
import { TemplatesDialog } from "@/components/data-analysis/templates-dialog"
import { SaveChartDialog } from "@/components/data-analysis/save-chart-dialog"
import { detectDataKind } from "@/lib/data-analysis/detect"
import {
  PALETTE_DEFINITIONS,
  getPalette,
  palettesByKind,
  sampleRamp,
  type PaletteKind,
} from "@/lib/data-analysis/render/palettes"
import { ERROR_BAR_LABEL, ERROR_BAR_OPTIONS } from "@/lib/data-analysis/render/plotly-adapter"
import { Dock, DockTab, useDockLayout } from "@/components/data-analysis/workspace/docks"
import { LayoutCanvas } from "@/components/data-analysis/workspace/layout-canvas"
import { PipelineTabs } from "@/components/data-analysis/workspace/pipeline-tabs"
import { ResultsCard } from "@/components/data-analysis/workspace/results-card"
import {
  RESULTS_SHEET_NAME,
  buildResultsSheet,
  resultsSheetColumnWidths,
} from "@/lib/data-analysis/render/results-sheet"
import {
  LAYOUT_PRESETS,
  assignPanel,
  layoutFromPreset,
  type FigureLayout,
} from "@/lib/data-analysis/render/figure-layout"
import {
  specFromChartState,
  tableFromChartRows,
  type ChartState,
} from "@/lib/data-analysis/workspace/chart-state-spec"
import { requestSpecPatch, type SpecPatchOutcome } from "@/lib/data-analysis/ai/spec-author-client"
import { applyAiPatch, describeMutation, initHistory } from "@/lib/data-analysis/spec/mutations"
import { aiNotice, railEditsFromSpec } from "@/lib/data-analysis/workspace/spec-prompt"
import { computeAnalysis } from "@/lib/data-analysis/engine/client"
import type { EngineResult } from "@/lib/data-analysis/engine/contract"
import type { Table as SpecTable } from "@/lib/data-analysis/engine/resolver"
import type { AnalysisPipeline } from "@/lib/data-analysis/workspace/pipelines"
import { BUILTIN_TEMPLATES, ELISA_AOA, type AnalysisTemplate } from "@/lib/data-analysis/templates"
import {
  buildSpreadsheetWorkbookSnapshot,
  snapshotToXlsxWorkbook,
  readSpreadsheetWorkbook,
  downloadSnapshotAsXlsxFile,
  type UniverWorkbookSnapshot,
} from "@/lib/spreadsheet-workbook"

function buildSnapshotFromAoa(aoa: (string | number)[][], sheetName: string, fileName: string): UniverWorkbookSnapshot {
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const wb = XLSX.utils.book_new()
  // Excel/SheetJS reject : \ / ? * [ ] and names > 31 chars, so sanitize
  // (e.g. "Bradford / BCA protein" would otherwise throw and abort the apply).
  const safeName = (sheetName || "Sheet1").replace(/[:\\/?*[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31) || "Sheet1"
  XLSX.utils.book_append_sheet(wb, ws, safeName)
  return buildSpreadsheetWorkbookSnapshot(fileName, wb)
}

function snapshotToTable(snapshot: UniverWorkbookSnapshot): Table {
  try {
    const wb = snapshotToXlsxWorkbook(snapshot)
    const ws = wb.Sheets[wb.SheetNames[0]]
    if (!ws) return { columns: [], rows: [] }
    const aoa = XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1, blankrows: false })
    const header = (aoa[0] ?? []).map((c) => String(c ?? "").trim()).filter(Boolean)
    const rows = aoa.slice(1).map((r) => {
      const o: Record<string, number | string> = {}
      header.forEach((h, i) => {
        const v = r[i]
        o[h] = typeof v === "number" ? v : v == null || v === "" ? "" : isFinite(Number(v)) ? Number(v) : String(v)
      })
      return o
    })
    return { columns: header, rows }
  } catch {
    return { columns: [], rows: [] }
  }
}

/** Error-bar representation for aggregated replicates. */
type ErrorMode = "none" | "sd" | "sem" | "ci90" | "ci95" | "ci99" | "range" | "iqr" | "mad"

/**
 * Aggregate rows sharing an X value into mean ± error, preserving first-seen
 * order. Powers Prism-style bar/point charts with error bars and an optional
 * overlay of the individual replicate points.
 */
function aggregateByX(
  rows: Record<string, number | string>[],
  xKey: string,
  yKey: string,
  errKind: Exclude<ErrorMode, "none">,
): { cats: (string | number)[]; mean: number[]; err: number[]; points: { x: string | number; y: number }[] } {
  const order: (string | number)[] = []
  const groups = new Map<string, number[]>()
  const catOf = new Map<string, string | number>()
  for (const r of rows) {
    const xv = r[xKey] as string | number
    const key = String(xv)
    if (!groups.has(key)) {
      groups.set(key, [])
      order.push(xv)
      catOf.set(key, xv)
    }
    const yv = Number(r[yKey])
    if (isFinite(yv)) groups.get(key)!.push(yv)
  }
  const cats: (string | number)[] = []
  const mean: number[] = []
  const err: number[] = []
  const points: { x: string | number; y: number }[] = []
  for (const xv of order) {
    const ys = groups.get(String(xv))!
    if (!ys.length) continue
    const d = describeStats(ys)
    cats.push(xv)
    // Robust bars are drawn around the median, since that is the centre they
    // describe; quoting an IQR around a mean would place the bar off the
    // statistic it belongs to.
    mean.push(errKind === "iqr" || errKind === "mad" ? d.median : d.mean)
    err.push(errorBarValue(ys, d, errKind))
    for (const y of ys) points.push({ x: xv, y })
  }
  return { cats, mean, err, points }
}

/**
 * The half-length of one error bar.
 *
 * Confidence intervals come from `describeStats`, which computes them from the
 * t distribution — at bench n the normal approximation is materially too
 * narrow, so a "95% CI" drawn at 1.96·SEM would understate the interval it
 * claims to be.
 */
function errorBarValue(
  ys: number[],
  d: ReturnType<typeof describeStats>,
  kind: Exclude<ErrorMode, "none">,
): number {
  const n = ys.length
  switch (kind) {
    case "sd":
      return d.sd
    case "sem":
      return d.sem
    case "ci95":
      return d.ci95[1] - d.mean
    case "ci90":
    case "ci99": {
      if (n < 2) return 0
      const level = kind === "ci90" ? 0.9 : 0.99
      // describeStats only carries the 95% interval, so the other levels are
      // rescaled through the t multipliers rather than re-deriving the SEM.
      const t95 = studentT(n - 1, 0.95)
      const t = studentT(n - 1, level)
      return t95 > 0 ? ((d.ci95[1] - d.mean) / t95) * t : 0
    }
    case "range":
      return Math.max(...ys) - d.mean
    case "iqr": {
      const sorted = [...ys].sort((a, b) => a - b)
      const q = (p: number) => {
        const idx = (sorted.length - 1) * p
        const lo = Math.floor(idx)
        const hi = Math.ceil(idx)
        return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
      }
      return q(0.75) - q(0.25)
    }
    case "mad": {
      const deviations = ys.map((v) => Math.abs(v - d.median)).sort((a, b) => a - b)
      const mid = (deviations.length - 1) / 2
      const mad =
        deviations.length % 2
          ? deviations[mid]
          : (deviations[Math.floor(mid)] + deviations[Math.ceil(mid)]) / 2
      // Scaled so a robust bar is comparable with the SD bar it replaces.
      return mad * 1.4826
    }
  }
}

/** Two-sided t critical value, by bisection on the normal-inverse-seeded CDF. */
function studentT(df: number, level: number): number {
  if (df <= 0) return 0
  const target = 1 - (1 - level) / 2
  let lo = 0
  let hi = 100
  for (let i = 0; i < 120; i++) {
    const mid = (lo + hi) / 2
    if (studentCdf(mid, df) < target) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

function studentCdf(t: number, df: number): number {
  // Regularised incomplete beta via its continued fraction (Lentz).
  const x = df / (df + t * t)
  const a = df / 2
  const b = 0.5
  const p = 0.5 * regularisedBeta(a, b, x)
  return t > 0 ? 1 - p : p
}

function regularisedBeta(a: number, b: number, x: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  if (x >= (a + 1) / (a + b + 2)) return 1 - regularisedBeta(b, a, 1 - x)
  const front =
    Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x)) / a
  let f = 1
  let c = 1
  let dd = 0
  for (let i = 0; i <= 300; i++) {
    const m = Math.floor(i / 2)
    const numerator =
      i === 0
        ? 1
        : i % 2 === 0
          ? (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m))
          : -((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1))
    dd = 1 + numerator * dd
    if (Math.abs(dd) < 1e-30) dd = 1e-30
    dd = 1 / dd
    c = 1 + numerator / c
    if (Math.abs(c) < 1e-30) c = 1e-30
    const delta = c * dd
    f *= delta
    if (Math.abs(1 - delta) < 1e-12) break
  }
  return front * (f - 1)
}

function lnGamma(z: number): number {
  const g = [
    676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ]
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z)
  const zz = z - 1
  let x = 0.99999999999980993
  for (let i = 0; i < g.length; i++) x += g[i] / (zz + i + 1)
  const t = zz + g.length - 0.5
  return 0.5 * Math.log(2 * Math.PI) + (zz + 0.5) * Math.log(t) - t + Math.log(x)
}

/** Pearson r between two paired numeric arrays (for correlation matrices). */
function pearsonR(a: number[], b: number[]): number {
  const xs: number[] = []
  const ys: number[] = []
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (isFinite(a[i]) && isFinite(b[i])) {
      xs.push(a[i])
      ys.push(b[i])
    }
  }
  const n = xs.length
  if (n < 2) return NaN
  const mx = xs.reduce((s, v) => s + v, 0) / n
  const my = ys.reduce((s, v) => s + v, 0) / n
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my)
    sxx += (xs[i] - mx) ** 2
    syy += (ys[i] - my) ** 2
  }
  return sxx === 0 || syy === 0 ? NaN : sxy / Math.sqrt(sxx * syy)
}

/* ── Chart types ────────────────────────────────────────────────────────── */
type ChartType =
  | "line" | "scatter" | "bar" | "barStacked" | "barH" | "area"
  | "box" | "violin" | "histogram" | "ecdf" | "qq" | "bubble" | "pie"
  | "heatmap" | "corrMatrix"
  | "volcano" | "blandAltman" | "roc" | "km" | "forest"
  | "scatter3d" | "mesh3d"

/** The order chart groups are offered in, in the picker and the context menu. */
const CHART_GROUP_ORDER: string[] = ["XY", "Categorical", "Distribution", "Matrix", "Scientific", "3D"]

const CHART_TYPES: { id: ChartType; label: string; Icon: React.ComponentType<{ className?: string; weight?: "bold" | "fill" }>; group: string }[] = [
  { id: "line", label: "Line", Icon: ChartLine, group: "XY" },
  { id: "scatter", label: "Scatter", Icon: ChartScatter, group: "XY" },
  { id: "area", label: "Area", Icon: ChartPolar, group: "XY" },
  { id: "bubble", label: "Bubble", Icon: Circle, group: "XY" },
  { id: "bar", label: "Bar", Icon: ChartBar, group: "Categorical" },
  { id: "barStacked", label: "Stacked", Icon: ChartBar, group: "Categorical" },
  { id: "barH", label: "Horizontal", Icon: ChartBarHorizontal, group: "Categorical" },
  { id: "pie", label: "Pie", Icon: ChartPieSlice, group: "Categorical" },
  { id: "box", label: "Box", Icon: ChartBarHorizontal, group: "Distribution" },
  { id: "violin", label: "Violin", Icon: Waveform, group: "Distribution" },
  { id: "histogram", label: "Histogram", Icon: ChartLineUp, group: "Distribution" },
  { id: "ecdf", label: "Cumulative (ECDF)", Icon: ChartLineUp, group: "Distribution" },
  { id: "qq", label: "Q–Q (normal)", Icon: ChartScatter, group: "Distribution" },
  { id: "heatmap", label: "Heatmap", Icon: GridNine, group: "Matrix" },
  { id: "corrMatrix", label: "Correlation matrix", Icon: GridNine, group: "Matrix" },
  { id: "volcano", label: "Volcano", Icon: ChartScatter, group: "Scientific" },
  { id: "blandAltman", label: "Bland–Altman", Icon: ChartScatter, group: "Scientific" },
  { id: "roc", label: "ROC curve", Icon: TrendUp, group: "Scientific" },
  { id: "km", label: "Kaplan–Meier", Icon: ChartLineUp, group: "Scientific" },
  { id: "forest", label: "Forest", Icon: ChartBarHorizontal, group: "Scientific" },
  { id: "scatter3d", label: "3D Scatter", Icon: Cube, group: "3D" },
  { id: "mesh3d", label: "3D Mesh", Icon: Cube, group: "3D" },
]

const is3D = (t: ChartType) => t === "scatter3d" || t === "mesh3d"

/** Per-chart column-assignment guidance for charts with special role semantics. */
const BINDING_HINTS: Partial<Record<ChartType, string>> = {
  volcano: "X = log₂ fold-change · Y = p-value",
  blandAltman: "Y = the two methods to compare (assign 2 columns)",
  roc: "X = binary truth (0/1) · Y = score",
  km: "X = time · Y = event (1 = event, 0 = censored)",
  forest: "X = estimate · Y = lower & upper CI (2 columns); label = first text column",
  heatmap: "Y = value columns (rows form the matrix)",
  corrMatrix: "Y = columns to correlate (defaults to all numeric)",
}

/**
 * The palette catalogue, shared with the spec-driven renderer so a colour
 * chosen here means the same thing there. Keyed by id; `getPalette` also
 * accepts the display names saved by earlier versions of this workspace.
 */
const PALETTES: Record<string, string[]> = Object.fromEntries(
  PALETTE_DEFINITIONS.map((p) => [p.id, p.colours])
)

/**
 * The palette picker.
 *
 * Grouped by what each family is FOR, because the distinction is not cosmetic:
 * a sequential ramp on unordered groups implies a ranking the data does not
 * have. Colour-blind-safe sets are marked rather than merely listed first, so
 * the choice is informed instead of accidental.
 */
function PalettePicker({
  value,
  onChange,
}: {
  value: string
  onChange: (id: string) => void
}) {
  const groups = palettesByKind()
  const current = getPalette(value)
  const sections: { kind: PaletteKind; label: string; hint: string }[] = [
    { kind: "qualitative", label: "Categories", hint: "Separate groups with no order" },
    { kind: "sequential", label: "Magnitude", hint: "Low to high, for heatmaps" },
    { kind: "diverging", label: "Diverging", hint: "Distance either side of a midpoint" },
  ]

  return (
    <Field label="Palette">
      <div className="space-y-3">
        {sections.map((section) => (
          <div key={section.kind}>
            <p className="mb-1 flex items-baseline gap-1.5 text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground/80">
              {section.label}
              <span className="font-normal normal-case tracking-normal text-muted-foreground/60">
                {section.hint}
              </span>
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {groups[section.kind].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onChange(p.id)}
                  title={`${p.note}${p.cvdSafe ? " Colour-blind safe." : ""}${p.print ? " Reads in greyscale." : ""}`}
                  className={cn(
                    "flex flex-col gap-1 rounded-lg border px-2 py-1.5 text-left transition-colors",
                    current.id === p.id
                      ? "border-[var(--n9-accent,#965034)]/50 bg-[var(--n9-accent,#965034)]/10"
                      : "border-border hover:bg-muted/40",
                  )}
                >
                  <span className="flex overflow-hidden rounded-[3px]">
                    {(p.kind === "qualitative" ? p.colours.slice(0, 6) : sampleRamp(p.id, 6)).map(
                      (c, i) => (
                        <span key={i} className="h-3 flex-1" style={{ background: c }} />
                      ),
                    )}
                  </span>
                  <span className="flex items-center gap-1">
                    <span
                      className={cn(
                        "truncate text-[11px]",
                        current.id === p.id
                          ? "font-semibold text-[var(--n9-accent,#965034)]"
                          : "font-medium",
                      )}
                    >
                      {p.label}
                    </span>
                    {p.cvdSafe && (
                      <span
                        title="Colour-blind safe"
                        className="shrink-0 rounded-sm bg-emerald-500/15 px-1 text-[9px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400"
                      >
                        CVD
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Field>
  )
}

/** Per-series appearance overrides (default from the palette). */
type SeriesStyle = { color?: string; width?: number; dash?: string; marker?: string; size?: number; opacity?: number; axis?: "y" | "y2" }
const DASH_OPTIONS = ["solid", "dash", "dot", "dashdot"] as const
const MARKER_OPTIONS = ["circle", "square", "diamond", "triangle-up", "cross", "x", "star"] as const
const FONT_OPTIONS = [
  { label: "Sans", value: "system-ui, -apple-system, sans-serif" },
  { label: "Serif", value: "Georgia, 'Times New Roman', serif" },
  { label: "Mono", value: "ui-monospace, 'SF Mono', Menlo, monospace" },
]

const DATA_W = 400
const SET_W = 344
const SESSION_KEY = "n9-data-analysis-session"

/** Matches at ≥1280px — the width where the 3-pane side rails make sense. */
function useIsWide() {
  const [wide, setWide] = useState(true)
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1280px)")
    const on = () => setWide(mq.matches)
    on()
    mq.addEventListener("change", on)
    return () => mq.removeEventListener("change", on)
  }, [])
  return wide
}

/* ── Uncontrolled Univer host ────────────────────────────────────────────────
   The sheet stays mounted for the whole session (it lives in the left rail,
   present on every tab), so it never remounts on tab or panel changes. Collapse
   is done by animating the RAIL's outer width while this host keeps a CONSTANT
   inner width — Univer's canvas width never changes, so it can't blank or
   re-init. Edits report out via onPersistSnapshot only (never fed back to the
   prop), so live editing never triggers a remount either. `mountKey` bumps on
   import — the one time a fresh workbook must replace the instance. */
function SheetHost({
  mountSnapshot,
  mountKey,
  onPersist,
  heightClass,
  compact,
  onSelectionChange,
}: {
  mountSnapshot: UniverWorkbookSnapshot
  mountKey: number
  onPersist: (s: UniverWorkbookSnapshot) => void
  heightClass: string
  compact: boolean
  onSelectionChange?: (sel: SheetSelection | null) => void
}) {
  return (
    <UniverWorkbookView
      instanceKey={mountKey}
      workbookSnapshot={mountSnapshot}
      variant="workspace"
      compact={compact}
      heightClass={heightClass}
      onPersistSnapshot={onPersist}
      onSelectionChange={onSelectionChange}
    />
  )
}

type Phase = "chart" | "stats" | "curve" | "plate" | "workspace"

const PHASES: { id: Phase; label: string; Icon: React.ComponentType<{ className?: string; weight?: "regular" | "bold" | "fill" }> }[] = [
  { id: "chart", label: "Chart", Icon: ChartLine },
  { id: "stats", label: "Statistics", Icon: Sigma },
  { id: "curve", label: "Standard curve", Icon: TrendUp },
  { id: "plate", label: "Plate", Icon: GridNine },
  // Multi-panel figure assembly (Prism's "Layouts", Tier 1 #8). Panels draw
  // from the spec this workspace derives, so a figure composed here is the same
  // figure the Chart phase shows.
  { id: "workspace", label: "Figure layout", Icon: GridFour },
]

export function DataAnalysisWorkspace({
  files = [],
  projects = [],
  experiments = [],
}: {
  files?: DataFileRow[]
  projects?: { id: string; name: string }[]
  experiments?: { id: string; name: string; project_id: string | null }[]
}) {
  const router = useRouter()
  const initial = useMemo(() => buildSnapshotFromAoa(ELISA_AOA, "ELISA", "ELISA standard curve.xlsx"), [])
  const [mountSnapshot, setMountSnapshot] = useState<UniverWorkbookSnapshot>(initial)
  const [mountKey, setMountKey] = useState(0)
  const [liveSnapshot, setLiveSnapshot] = useState<UniverWorkbookSnapshot>(initial)

  const liveRef = useRef(liveSnapshot)
  liveRef.current = liveSnapshot

  const fileRef = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<Phase>("chart")
  // Dock geometry (open/closed and width) is shared with the spec-driven
  // workspace and persists per browser, so a layout set once survives reloads.
  const docks = useDockLayout("n9.data-analysis.docks")
  const { setOpen: setDockOpen } = docks
  const [dataMax, setDataMax] = useState(false)
  const [sheetSel, setSheetSel] = useState<SheetSelection | null>(null)
  const wide = useIsWide()

  // Maximize the sheet to a full editor (full ribbon) for heavy editing of large
  // data; restore returns to the compact rail. Re-init at the new size/variant
  // from the latest data so edits carry over.
  const toggleDataMax = useCallback(() => {
    setDataMax((v) => !v)
    setMountSnapshot(liveRef.current)
    setMountKey((k) => k + 1)
  }, [])

  const table = useMemo(() => snapshotToTable(liveSnapshot), [liveSnapshot])

  const sheetFileName =
    typeof liveSnapshot.name === "string" && liveSnapshot.name ? liveSnapshot.name : "analysis.xlsx"
  /** The live sheet, in the shape the spec layer resolves against. */
  const specTable = useMemo<SpecTable>(
    () => tableFromChartRows(table.columns, table.rows),
    [table]
  )


  const numericCols = useMemo(() => table.columns.filter((c) => table.rows.some((r) => typeof r[c] === "number")), [table])

  // Raw sheet grid (header row included) — the plate mirrors this 1:1, live.
  const grid = useMemo<(string | number)[][]>(() => {
    try {
      const wb = snapshotToXlsxWorkbook(liveSnapshot)
      const ws = wb.Sheets[wb.SheetNames[0]]
      if (!ws) return []
      return XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1, blankrows: true })
    } catch {
      return []
    }
  }, [liveSnapshot])

  // Data-aware tabs: Chart + Statistics always show; Standard curve / Plate
  // appear only when the data looks like a dose-response/ELISA or a microplate.
  const detected = useMemo(() => detectDataKind(table.columns, table.rows, grid), [table.columns, table.rows, grid])
  /** Pinning keeps the standard curve offered on a sheet that does not look like one. */
  const [curvePinned, setCurvePinned] = useState(false)

  /* chart config */
  /** The author's figure legend. Null means "use the generated wording". */
  const [caption, setCaption] = useState<string | null>(null)
  const [chartType, setChartType] = useState<ChartType>("line")
  const [xKey, setXKey] = useState("")
  const [yKeys, setYKeys] = useState<string[]>([])
  const [zKey, setZKey] = useState("")
  const [sizeKey, setSizeKey] = useState("")
  const [title, setTitle] = useState("ELISA standard curve")
  const [xLabel, setXLabel] = useState("Concentration")
  const [xUnit, setXUnit] = useState("pg/mL")
  const [yLabel, setYLabel] = useState("OD₄₅₀")
  const [yUnit, setYUnit] = useState("")
  const [yLog, setYLog] = useState(false)
  /** A log x is what a dose-response needs; concentration spans decades. */
  const [xLog, setXLog] = useState(false)
  const [showGrid, setShowGrid] = useState(true)
  const [showLegend, setShowLegend] = useState(true)
  const [markers, setMarkers] = useState(true)
  const [paletteName, setPaletteName] = useState("okabe-ito")

  // Granular per-element editing
  const [seriesStyles, setSeriesStyles] = useState<Record<string, SeriesStyle>>({})
  const [editSeries, setEditSeries] = useState<string>("")
  const [xMin, setXMin] = useState("")
  const [xMax, setXMax] = useState("")
  const [yMin, setYMin] = useState("")
  const [yMax, setYMax] = useState("")
  const [nticks, setNticks] = useState("")
  const [fontFamily, setFontFamily] = useState("system-ui, -apple-system, sans-serif")
  const [titleSize, setTitleSize] = useState(17)
  const [axisTitleSize, setAxisTitleSize] = useState(13)
  // Prism-style chart features
  const [errorMode, setErrorMode] = useState<ErrorMode>("none")
  const [showPoints, setShowPoints] = useState(false)
  const [subtitle, setSubtitle] = useState("")
  const [legendPos, setLegendPos] = useState<"bottom" | "right" | "top">("bottom")
  const [hlines, setHlines] = useState("")
  const [vlines, setVlines] = useState("")
  const [chartH, setChartH] = useState(560)
  /**
   * The statistics the spec chooses rather than the chart implies.
   *
   * Undefined is the state this rail has always been in: the test comes from
   * the chart type and the rest from the schema's defaults. They exist as state
   * because a spec can now arrive with a deliberate choice in it — from a
   * template, a reopened analysis, or the assistant — and a choice that is not
   * held anywhere is recomputed away on the next derivation.
   */
  const [statTest, setStatTest] = useState<ChartState["test"]>(undefined)
  const [statPostHoc, setStatPostHoc] = useState<ChartState["postHoc"]>(undefined)
  const [statAlpha, setStatAlpha] = useState<number | undefined>(undefined)
  const [statTails, setStatTails] = useState<ChartState["tails"]>(undefined)
  const [statReferenceLevel, setStatReferenceLevel] = useState<string | null | undefined>(undefined)
  const setStyle = useCallback((series: string, patch: Partial<SeriesStyle>) => {
    setSeriesStyles((prev) => ({ ...prev, [series]: { ...prev[series], ...patch } }))
  }, [])

  // Publication export
  const chartExportRef = useRef<ChartExportFn | null>(null)
  const chartImageRef = useRef<(() => Promise<string | null>) | null>(null)
  const chartBoxRef = useRef<HTMLDivElement | null>(null)
  const [saveChartOpen, setSaveChartOpen] = useState(false)
  const runExport = useCallback(async (opts: Parameters<ChartExportFn>[0]) => {
    if (chartExportRef.current) await chartExportRef.current(opts)
  }, [])
  const getChartSize = useCallback(() => {
    const el = chartBoxRef.current
    return el ? { width: el.clientWidth, height: el.clientHeight } : null
  }, [])
  const getChartPng = useCallback(() => (chartImageRef.current ? chartImageRef.current() : Promise.resolve(null)), [])

  const seededRef = useRef(false)
  if (!seededRef.current && table.columns.length) {
    seededRef.current = true
    setXKey(table.columns[0])
    setYKeys(numericCols.filter((c) => c !== table.columns[0]).slice(0, 2))
  }

  // `getPalette` also accepts the display names saved by earlier versions, so a
  // chart saved before the catalogue existed still opens with its own colours.
  const palette = getPalette(paletteName).colours

  /**
   * The chart rail's settings, as an Analysis Spec.
   *
   * Derived rather than dispatched: every control keeps the behaviour it has,
   * and the spec becomes the record underneath. This is what lets one figure be
   * saved, reopened, reproduced, dropped into a figure panel, and checked
   * against the data version it was computed from.
   */
  const derivedSpec = useMemo(() => {
    try {
      return specFromChartState(
        {
          chartType, xKey, yKeys, zKey, sizeKey, title, subtitle, xLabel, xUnit, yLabel, yUnit,
          yLog, xLog, showGrid, showLegend, legendPos, paletteName, errorMode, fontFamily,
          titleSize, axisTitleSize, xMin, xMax, yMin, yMax, nticks, seriesStyles, caption,
          test: statTest, postHoc: statPostHoc, alpha: statAlpha, tails: statTails,
          referenceLevel: statReferenceLevel,
        },
        specTable,
        { fileName: sheetFileName }
      )
    } catch {
      // A spec that will not derive must never take the figure down with it.
      return null
    }
  }, [
    chartType, xKey, yKeys, zKey, sizeKey, title, subtitle, xLabel, xUnit, yLabel, yUnit,
    yLog, xLog, showGrid, showLegend, legendPos, paletteName, errorMode, fontFamily,
    titleSize, axisTitleSize, xMin, xMax, yMin, yMax, nticks, seriesStyles, caption,
    statTest, statPostHoc, statAlpha, statTails, statReferenceLevel,
    specTable, sheetFileName,
  ])

  const visiblePhases = useMemo(
    () =>
      PHASES.filter((p) => {
        // The plate map is hidden for now. The model behind it still runs — the
        // standard curve reads the plate layout to know which wells are
        // standards — so this hides the tab, it does not remove the feature.
        if (p.id === "plate") return false
        /**
         * Standard curve is the one phase with a structural precondition: it
         * needs standards (a known concentration against a signal) before it
         * can fit anything, so offering it on a sheet that has none is offering
         * a dead end. Three independent signals earn it:
         *
         *   structure — a concentration-like column beside a signal column, or
         *               a numeric column whose ratios form a serial dilution;
         *   intent    — the chart or the test already asks for a fit, so the
         *               panel that performs it should be reachable;
         *   memory    — pinned, and pinning sticks (§Tier 1.3).
         */
        if (p.id === "curve") {
          return (
            detected.standardCurve ||
            derivedSpec?.figure.kind === "dose-response" ||
            derivedSpec?.analysis.test === "nonlinear-regression" ||
            curvePinned
          )
        }
        // Everything else is offered outright. Hiding a view you have used
        // because the next sheet looks different is worse than one tab too many.
        return true
      }),
    [detected, derivedSpec, curvePinned],
  )
  useEffect(() => {
    if (!visiblePhases.some((p) => p.id === phase)) setPhase("chart")
  }, [visiblePhases, phase])

  /**
   * The engine's answer for that spec.
   *
   * Debounced, because Pyodide is a real round trip and the rail can change on
   * every keystroke. `attemptedRef` stops a spec the engine refuses from being
   * retried forever.
   */
  const [engineResult, setEngineResult] = useState<EngineResult | null>(null)
  const [engineBusy, setEngineBusy] = useState(false)
  const [engineNote, setEngineNote] = useState<string | null>(null)
  const attemptedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!derivedSpec || specTable.rows.length === 0) return
    const signature = `${derivedSpec.dataset.versionHash}|${JSON.stringify(derivedSpec.analysis)}`
    if (attemptedRef.current === signature) return
    const timer = setTimeout(async () => {
      attemptedRef.current = signature
      setEngineBusy(true)
      setEngineNote(null)
      try {
        const outcome = await computeAnalysis(derivedSpec, specTable, { force: true })
        if (outcome.ok) setEngineResult(outcome.result)
        else if ("blocked" in outcome) {
          setEngineResult(null)
          setEngineNote(outcome.blocked.map((b) => b.message).join(" "))
        } else {
          setEngineResult(null)
          setEngineNote(outcome.question.question)
        }
      } catch (err) {
        setEngineNote(err instanceof Error ? err.message : String(err))
      } finally {
        setEngineBusy(false)
      }
    }, 700)
    return () => clearTimeout(timer)
  }, [derivedSpec, specTable])

  const [figureLayout, setFigureLayout] = useState<FigureLayout>(() => {
    const preset = LAYOUT_PRESETS.find((p) => p.id === "single")!
    const base = layoutFromPreset(preset, "Figure 1")
    return assignPanel(base, base.panels[0].id, "current")
  })
  const activeY = yKeys.filter((k) => table.columns.includes(k))
  const editKey = activeY.includes(editSeries) ? editSeries : activeY[0] ?? ""
  const editIdx = Math.max(0, activeY.indexOf(editKey))
  const curStyle: SeriesStyle = seriesStyles[editKey] ?? {}
  const curColor = curStyle.color ?? palette[editIdx % palette.length]
  const xAxisLabel = [xLabel, xUnit && `(${xUnit})`].filter(Boolean).join(" ")
  const yAxisLabel = [yLabel, yUnit && `(${yUnit})`].filter(Boolean).join(" ")
  const rows = useMemo(() => table.rows.filter((r) => r[xKey] !== "" && r[xKey] != null), [table.rows, xKey])

  const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark")
  const ink = isDark ? "#e9e2d7" : "#2c2418"
  const gridColor = isDark ? "#3a2e24" : "#e8ded3"

  const plotData = useMemo<Record<string, unknown>[]>(() => {
    const x = rows.map((r) => r[xKey])
    const lineMode = markers ? "lines+markers" : "lines"
    if (chartType === "pie") {
      const k = activeY[0]
      if (!k) return []
      return [{ type: "pie", labels: x, values: rows.map((r) => Number(r[k])), hole: 0.35, marker: { colors: palette } }]
    }
    if (chartType === "histogram") {
      return activeY.map((k, i) => ({ type: "histogram", x: table.rows.map((r) => Number(r[k])), name: k, opacity: 0.7, marker: { color: palette[i % palette.length] } }))
    }
    if (chartType === "box" || chartType === "violin") {
      return activeY.map((k, i) => ({
        type: chartType, y: table.rows.map((r) => Number(r[k])).filter((v) => isFinite(v)), name: k,
        boxpoints: "all", jitter: 0.4, pointpos: 0, marker: { color: palette[i % palette.length] }, line: { color: palette[i % palette.length] },
        ...(chartType === "violin" ? { meanline: { visible: true }, points: "all" } : {}),
      }))
    }
    if (chartType === "ecdf") {
      return activeY.map((k, i) => {
        const vals = table.rows.map((r) => Number(r[k])).filter((v) => isFinite(v)).sort((a, b) => a - b)
        const n = vals.length
        return { type: "scatter", mode: "lines", line: { shape: "hv", color: palette[i % palette.length], width: 2 }, x: vals, y: vals.map((_, idx) => (idx + 1) / n), name: k }
      })
    }
    if (chartType === "qq") {
      return activeY.map((k, i) => {
        const vals = table.rows.map((r) => Number(r[k])).filter((v) => isFinite(v)).sort((a, b) => a - b)
        const n = vals.length
        const theo = vals.map((_, idx) => normalInv((idx + 0.5) / n))
        return { type: "scatter", mode: "markers", x: theo, y: vals, name: k, marker: { color: palette[i % palette.length], size: 7 } }
      })
    }
    if (chartType === "heatmap") {
      const cols = activeY.length ? activeY : numericCols
      if (!cols.length) return []
      const z = rows.map((r) => cols.map((c) => Number(r[c])))
      const yLabels = rows.map((r, i) => (r[xKey] != null && r[xKey] !== "" ? String(r[xKey]) : `${i + 1}`))
      return [{ type: "heatmap", z, x: cols, y: yLabels, colorscale: "Viridis", colorbar: { thickness: 12 } }]
    }
    if (chartType === "corrMatrix") {
      const cols = (activeY.length >= 2 ? activeY : numericCols).filter((c) => numericCols.includes(c))
      if (cols.length < 2) return []
      const series = cols.map((c) => table.rows.map((r) => Number(r[c])))
      const z = series.map((a) => series.map((b) => pearsonR(a, b)))
      return [{ type: "heatmap", z, x: cols, y: cols, colorscale: "RdBu", reversescale: true, zmid: 0, zmin: -1, zmax: 1, colorbar: { thickness: 12 }, hovertemplate: "%{x} · %{y}: r = %{z:.2f}<extra></extra>" }]
    }
    if (chartType === "volcano") {
      // X = log₂ fold-change column, Y = p-value column → plot vs −log₁₀(p).
      const fcCol = xKey
      const pCol = activeY[0]
      if (!fcCol || !pCol) return []
      const pts = table.rows
        .map((r) => ({ x: Number(r[fcCol]), p: Number(r[pCol]) }))
        .filter((d) => isFinite(d.x) && isFinite(d.p) && d.p > 0)
      if (!pts.length) return []
      const yv = pts.map((d) => -Math.log10(d.p))
      const xVals = pts.map((d) => d.x)
      const colors = pts.map((d) => (Math.abs(d.x) >= 1 && d.p < 0.05 ? (d.x > 0 ? "#D55E00" : "#0072B2") : "#9aa0a6"))
      const xr = [Math.min(...xVals), Math.max(...xVals)]
      const yThresh = -Math.log10(0.05)
      const yMaxV = Math.max(...yv, yThresh + 0.5)
      return [
        { type: "scatter", mode: "markers", x: xVals, y: yv, marker: { color: colors, size: 6 }, name: "points", hovertemplate: "log₂FC %{x:.2f}<br>−log₁₀p %{y:.2f}<extra></extra>" },
        { type: "scatter", mode: "lines", x: xr, y: [yThresh, yThresh], line: { dash: "dot", color: "#999", width: 1 }, showlegend: false, hoverinfo: "skip" },
        { type: "scatter", mode: "lines", x: [1, 1], y: [0, yMaxV], line: { dash: "dot", color: "#999", width: 1 }, showlegend: false, hoverinfo: "skip" },
        { type: "scatter", mode: "lines", x: [-1, -1], y: [0, yMaxV], line: { dash: "dot", color: "#999", width: 1 }, showlegend: false, hoverinfo: "skip" },
      ]
    }
    if (chartType === "blandAltman") {
      // First two Y columns = the two measurement methods.
      const [aCol, bCol] = activeY
      if (!aCol || !bCol) return []
      const ba = blandAltman(table.rows.map((r) => Number(r[aCol])), table.rows.map((r) => Number(r[bCol])))
      if (!ba.mean.length) return []
      const xr = [Math.min(...ba.mean), Math.max(...ba.mean)]
      const hline = (v: number, color: string, dash: string, name: string) => ({ type: "scatter", mode: "lines", x: xr, y: [v, v], line: { color, dash, width: 1.4 }, name, hoverinfo: "skip" })
      return [
        { type: "scatter", mode: "markers", x: ba.mean, y: ba.diff, marker: { color: palette[0], size: 8 }, name: "differences" },
        hline(ba.bias, "#965034", "solid", `bias ${ba.bias.toFixed(2)}`),
        hline(ba.loaHigh, "#D55E00", "dash", "+1.96 SD"),
        hline(ba.loaLow, "#D55E00", "dash", "−1.96 SD"),
      ]
    }
    if (chartType === "roc") {
      // X = binary truth column, Y = score column.
      const truthCol = xKey
      const scoreCol = activeY[0]
      if (!truthCol || !scoreCol) return []
      const roc = rocCurve(table.rows.map((r) => Number(r[truthCol])), table.rows.map((r) => Number(r[scoreCol])))
      if (!roc.fpr.length) return []
      return [
        { type: "scatter", mode: "lines", x: roc.fpr, y: roc.tpr, name: `ROC (AUC = ${isFinite(roc.auc) ? roc.auc.toFixed(3) : "—"})`, line: { color: palette[0], width: 2.5, shape: "hv" }, fill: "tozeroy", fillcolor: "rgba(0,114,178,0.12)" },
        { type: "scatter", mode: "lines", x: [0, 1], y: [0, 1], line: { dash: "dash", color: "#999", width: 1 }, showlegend: false, hoverinfo: "skip" },
      ]
    }
    if (chartType === "km") {
      // X = time column, Y = event column (1 = event, 0 = censored).
      const timeCol = xKey
      const eventCol = activeY[0]
      if (!timeCol || !eventCol) return []
      const km = kaplanMeier(table.rows.map((r) => Number(r[timeCol])), table.rows.map((r) => Number(r[eventCol])))
      if (!km.time.length) return []
      return [{ type: "scatter", mode: "lines", line: { shape: "hv", color: palette[0], width: 2 }, x: km.time, y: km.survival, name: "survival" }]
    }
    if (chartType === "forest") {
      // X = point-estimate column, Y = [lower CI, upper CI] columns; row label
      // is the first non-numeric column.
      const estCol = xKey
      const [lowCol, highCol] = activeY
      if (!estCol || !lowCol || !highCol) return []
      const labelCol = table.columns.find((c) => !numericCols.includes(c))
      const items = table.rows
        .map((r, i) => ({
          label: labelCol && r[labelCol] != null && r[labelCol] !== "" ? String(r[labelCol]) : `Row ${i + 1}`,
          est: Number(r[estCol]),
          low: Number(r[lowCol]),
          high: Number(r[highCol]),
        }))
        .filter((d) => isFinite(d.est) && isFinite(d.low) && isFinite(d.high))
      if (!items.length) return []
      return [{
        type: "scatter",
        mode: "markers",
        x: items.map((d) => d.est),
        y: items.map((d) => d.label),
        error_x: { type: "data", symmetric: false, array: items.map((d) => d.high - d.est), arrayminus: items.map((d) => d.est - d.low), thickness: 1.4, width: 5, color: palette[0] },
        marker: { color: palette[0], size: 9, symbol: "square" },
        name: "effect",
      }]
    }
    if (is3D(chartType)) {
      const yk = activeY[0]
      if (!yk || !zKey) return []
      const x3 = rows.map((r) => Number(r[xKey]))
      const y3 = rows.map((r) => Number(r[yk]))
      const z3 = rows.map((r) => Number(r[zKey]))
      if (chartType === "mesh3d") return [{ type: "mesh3d", x: x3, y: y3, z: z3, intensity: z3, colorscale: "Viridis", opacity: 0.85, showscale: true }]
      const st = seriesStyles[yk] ?? {}
      return [{ type: "scatter3d", mode: "markers", x: x3, y: y3, z: z3, name: yk, marker: { size: st.size ?? 4, color: st.color ?? z3, colorscale: st.color ? undefined : "Viridis", showscale: !st.color } }]
    }
    // 2D charts — optionally aggregate replicates by X into mean ± error, with
    // an overlay of the individual points (the Prism bar/scatter idiom).
    const traces: Record<string, unknown>[] = []
    const canAggregate = errorMode !== "none" && ["line", "scatter", "bar", "barStacked", "barH", "area"].includes(chartType)
    activeY.forEach((k, i) => {
      const st = seriesStyles[k] ?? {}
      const color = st.color ?? palette[i % palette.length]
      const opacity = st.opacity ?? 1
      const yaxis = st.axis === "y2" ? "y2" : "y"

      if (canAggregate) {
        const agg = aggregateByX(rows, xKey, k, errorMode as "sd" | "sem" | "ci95")
        const errBar = { type: "data", array: agg.err, visible: true, thickness: 1.4, width: 5, color }
        if (chartType === "bar" || chartType === "barStacked")
          traces.push({ type: "bar", x: agg.cats, y: agg.mean, name: k, opacity, yaxis, marker: { color }, error_y: errBar })
        else if (chartType === "barH")
          traces.push({ type: "bar", orientation: "h", y: agg.cats, x: agg.mean, name: k, opacity, marker: { color }, error_x: errBar })
        else if (chartType === "area")
          traces.push({ type: "scatter", mode: "lines", fill: "tozeroy", x: agg.cats, y: agg.mean, name: k, opacity, yaxis, line: { color, width: st.width ?? 2, dash: st.dash ?? "solid" }, error_y: errBar })
        else if (chartType === "scatter")
          traces.push({ type: "scatter", mode: "markers", x: agg.cats, y: agg.mean, name: k, opacity, yaxis, marker: { color, size: st.size ?? 9, symbol: st.marker ?? "circle" }, error_y: errBar })
        else
          traces.push({ type: "scatter", mode: lineMode, x: agg.cats, y: agg.mean, name: k, opacity, yaxis, line: { color, width: st.width ?? 2.5, dash: st.dash ?? "solid" }, marker: { color, size: st.size ?? 7, symbol: st.marker ?? "circle" }, error_y: errBar })
        if (showPoints)
          traces.push({ type: "scatter", mode: "markers", x: agg.points.map((p) => p.x), y: agg.points.map((p) => p.y), name: `${k} points`, yaxis, showlegend: false, opacity: 0.55, marker: { color, size: 5, symbol: "circle-open" } })
        return
      }

      const y = rows.map((r) => Number(r[k]))
      if (chartType === "bar" || chartType === "barStacked") { traces.push({ type: "bar", x, y, name: k, opacity, yaxis, marker: { color } }); return }
      if (chartType === "barH") { traces.push({ type: "bar", orientation: "h", y: x, x: y, name: k, opacity, marker: { color } }); return }
      if (chartType === "area") { traces.push({ type: "scatter", mode: "lines", fill: "tozeroy", x, y, name: k, opacity, yaxis, line: { color, width: st.width ?? 2, dash: st.dash ?? "solid" } }); return }
      if (chartType === "scatter") { traces.push({ type: "scatter", mode: "markers", x, y, name: k, opacity, yaxis, marker: { color, size: st.size ?? 9, symbol: st.marker ?? "circle" } }); return }
      if (chartType === "bubble") {
        const sizes = sizeKey ? rows.map((r) => Number(r[sizeKey])) : y
        const mx = Math.max(...sizes.map((s) => Math.abs(s)), 1)
        traces.push({ type: "scatter", mode: "markers", x, y, name: k, opacity, yaxis, marker: { color, symbol: st.marker ?? "circle", size: sizes.map((s) => 8 + (Math.abs(s) / mx) * 34), sizemode: "diameter" } })
        return
      }
      traces.push({ type: "scatter", mode: lineMode, x, y, name: k, opacity, yaxis, line: { color, width: st.width ?? 2.5, dash: st.dash ?? "solid" }, marker: { color, size: st.size ?? 7, symbol: st.marker ?? "circle" } })
    })
    return traces
  }, [rows, xKey, activeY, zKey, chartType, palette, markers, sizeKey, table.rows, numericCols, seriesStyles, errorMode, showPoints])

  const plotLayout = useMemo<Record<string, unknown>>(() => {
    const horizontal = chartType === "barH"
    const num = (s: string) => (s.trim() !== "" && isFinite(Number(s)) ? Number(s) : null)
    const xRange = num(xMin) != null && num(xMax) != null ? [num(xMin), num(xMax)] : undefined
    const yRange = num(yMin) != null && num(yMax) != null ? [num(yMin), num(yMax)] : undefined
    const tickN = num(nticks) ?? undefined
    const refColor = isDark ? "#8a7a68" : "#b0a08c"
    const parseNums = (s: string) => s.split(",").map((v) => Number(v.trim())).filter((v) => isFinite(v))
    const shapes: Record<string, unknown>[] = [
      ...parseNums(hlines).map((v) => ({ type: "line", xref: "paper", x0: 0, x1: 1, yref: "y", y0: v, y1: v, line: { color: refColor, width: 1, dash: "dash" } })),
      ...parseNums(vlines).map((v) => ({ type: "line", yref: "paper", y0: 0, y1: 1, xref: "x", x0: v, x1: v, line: { color: refColor, width: 1, dash: "dash" } })),
    ]
    return {
      title: { text: subtitle ? `${title}<br><span style="font-size:${Math.round(titleSize * 0.62)}px;opacity:0.62">${subtitle}</span>` : title, font: { size: titleSize, color: ink } },
      margin: { t: subtitle ? 66 : 48, r: 20, b: 60, l: 70 },
      shapes,
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      font: { family: fontFamily, color: ink, size: 12 },
      colorway: palette,
      xaxis: {
        title: { text: horizontal ? yAxisLabel : xAxisLabel, font: { size: axisTitleSize } },
        showgrid: showGrid, gridcolor: gridColor, zeroline: false,
        type: (chartType === "bar" || chartType === "barStacked") ? "category" : horizontal && yLog ? "log" : xLog && !horizontal ? "log" : "-",
        ...(xRange ? { range: xRange, autorange: false } : {}),
        ...(tickN ? { nticks: tickN } : {}),
      },
      yaxis: {
        title: { text: horizontal ? xAxisLabel : yAxisLabel, font: { size: axisTitleSize } },
        showgrid: showGrid, gridcolor: gridColor, zeroline: false,
        type: horizontal ? "category" : yLog ? "log" : "-",
        ...(yRange ? { range: yRange, autorange: false } : {}),
      },
      showlegend: showLegend,
      legend:
        legendPos === "right"
          ? { orientation: "v", x: 1.02, y: 1 }
          : legendPos === "top"
            ? { orientation: "h", y: 1.12 }
            : { orientation: "h", y: -0.22 },
      barmode: chartType === "barStacked" ? "stack" : "group",
      violingap: 0.3,
      ...(is3D(chartType)
        ? {
            scene: {
              xaxis: { title: { text: xAxisLabel }, gridcolor: gridColor },
              yaxis: { title: { text: yAxisLabel }, gridcolor: gridColor },
              zaxis: { title: { text: zKey || "Z" }, gridcolor: gridColor },
            },
          }
        : {}),
      ...(activeY.some((k) => seriesStyles[k]?.axis === "y2")
        ? {
            yaxis2: {
              title: { text: "Secondary", font: { size: axisTitleSize } },
              overlaying: "y",
              side: "right",
              showgrid: false,
              zeroline: false,
            },
          }
        : {}),
    }
  }, [title, ink, palette, xAxisLabel, yAxisLabel, showGrid, gridColor, chartType, yLog, xLog, showLegend, xMin, xMax, yMin, yMax, nticks, fontFamily, titleSize, axisTitleSize, zKey, activeY, seriesStyles, subtitle, legendPos, hlines, vlines, isDark])

  // Edits made directly on the chart (double-click title / axis) flow back here.
  const handleChartEdit = useCallback((e: PlotlyEdits) => {
    if (e.title != null) setTitle(e.title)
    if (e.xLabel != null) { setXLabel(e.xLabel); setXUnit("") }
    if (e.yLabel != null) { setYLabel(e.yLabel); setYUnit("") }
  }, [])

  // Right-click "Edit ▸ <element>" (or double-click an element) opens the
  // inspector scrolled to that section; a clicked series selects itself.
  const [flashId, setFlashId] = useState<string | null>(null)
  /**
   * Which rail section is showing. "all" stacks them as before.
   *
   * Filtering rather than scrolling: an automatic scroll moves the content out
   * from under the pointer and leaves you unsure whether you arrived, and it
   * still leaves everything else to scroll past. Showing one section at a time
   * means the thing you asked for is simply there, at the top, with nothing
   * below it to wade through.
   */
  /** The workspace given the whole viewport. */
  const [fullscreen, setFullscreen] = useState(false)
  useEffect(() => {
    if (!fullscreen) return
    const onKey = (e: KeyboardEvent) => {
      // Escape is what people try first, and without it a full-screen surface
      // with no browser chrome feels like a trap.
      if (e.key === "Escape") setFullscreen(false)
    }
    window.addEventListener("keydown", onKey)
    // The page behind must not scroll while the overlay is up.
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = previous
    }
  }, [fullscreen])

  const [railSection, setRailSection] = useState<string>("all")
  /**
   * Sections that belong to the same idea.
   *
   * Titles and typography are both "text on the figure"; palette and per-series
   * styling are both "colour". Splitting them made two jump-bar entries for one
   * decision. They keep their own blocks and headings — this only makes them
   * filter together, so choosing Text shows both, adjacent, with everything
   * between hidden.
   */
  const RAIL_GROUPS: Record<string, string> = useMemo(
    () => ({ "cs-type-face": "cs-title", "cs-series": "cs-palette" }),
    [],
  )
  const showRail = useCallback(
    (id: string) => railSection === "all" || railSection === (RAIL_GROUPS[id] ?? id),
    [railSection, RAIL_GROUPS],
  )

  /** Used by the chart's context menu to open the rail at a given section. */
  const jumpToSection = useCallback((id: string) => {
    setRailSection(id)
  }, [])

  const onEditElement = useCallback(
    (el: ChartElement, detail?: { series?: string }) => {
      const section: Record<ChartElement, string> = {
        title: "cs-title", xaxis: "cs-axes", yaxis: "cs-axes",
        series: "cs-series", legend: "cs-toggles", annotation: "cs-toggles",
      }
      if (el === "series" && detail?.series) setEditSeries(detail.series)
      // Clicking a chart element jumps to its control, so the settings dock has
      // to be open for the scroll target to exist.
      setDockOpen("right", true)
      const id = section[el]
      setFlashId(id)
      requestAnimationFrame(() =>
        requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })),
      )
      window.setTimeout(() => setFlashId(null), 1500)
    },
    [setDockOpen],
  )

  // Fire an AI request straight from the chart's right-click menu.
  const askCatalyst = useCallback(
    (kind: "explain" | "improve" | "summary" | "stats") => {
      const cols = table.columns.join(", ")
      const preview = table.rows
        .slice(0, 12)
        .map((r) => table.columns.map((c) => r[c]).join("\t"))
        .join("\n")
      const context = `Data columns: ${cols}. ${table.rows.length} rows. Current chart: ${chartType} of ${activeY.join(", ") || "—"} vs ${xKey}, titled "${title}".\n\nFirst rows (tab-separated):\n${cols}\n${preview}`
      const ask =
        kind === "explain" ? "Explain what this chart shows and the main trend or result."
        : kind === "improve" ? "Suggest the most appropriate chart type and any transformations for this data, and why."
        : kind === "summary" ? "Summarise the key findings from this data in a few bullet points."
        : "Recommend which statistical test(s) are appropriate for this data and what to compare."
      openCatalystPanel({ query: `${ask}\n\n${context}`, scope: "lab", autoSend: true })
    },
    [table.columns, table.rows, chartType, activeY, xKey, title],
  )

  // The statistics actions are defined below (they need the derived spec), so
  // the menu reaches them through refs rather than forcing a declaration order.
  const addStatsSheetRef = useRef<() => void>(() => undefined)
  const copyStatsRef = useRef<() => void>(() => undefined)
  const exportStatsRef = useRef<() => void>(() => undefined)

  const chartMenuGroups = useMemo<ChartMenuGroup[]>(
    () => [
      {
        label: "Ask Catalyst",
        items: [
          { label: "Explain this chart", onClick: () => askCatalyst("explain") },
          { label: "Suggest a better chart", onClick: () => askCatalyst("improve") },
          { label: "Summarise the results", onClick: () => askCatalyst("summary") },
          { label: "Which statistical test?", onClick: () => askCatalyst("stats") },
        ],
      },
      // One entry per intent, not one per category. The menu was twelve rows
      // deep before the built-in zoom and export items even began; grouping by
      // what you are trying to do keeps the first screen readable, and the
      // headings inside each submenu carry the finer structure.
      {
        label: "Chart type",
        items: CHART_GROUP_ORDER.flatMap((group) =>
          CHART_TYPES.filter((t) => t.group === group).map((t) => ({
            label: t.label,
            section: group,
            checked: chartType === t.id,
            onClick: () => setChartType(t.id),
          })),
        ),
      },
      {
        label: "Style",
        items: [
          ...ERROR_BAR_OPTIONS.map((o) => ({
            label: o.id === "none" ? "No error bars" : ERROR_BAR_LABEL[o.id],
            section: "Error bars",
            checked: errorMode === o.id,
            onClick: () => setErrorMode(o.id),
          })),
          ...PALETTE_DEFINITIONS.map((p) => ({
            label: p.label,
            section: "Palette",
            hint: p.cvdSafe ? "CVD" : undefined,
            checked: paletteName === p.id,
            onClick: () => setPaletteName(p.id),
          })),
          { label: "Gridlines", section: "Show", checked: showGrid, onClick: () => setShowGrid(!showGrid) },
          { label: "Legend", section: "Show", checked: showLegend, onClick: () => setShowLegend(!showLegend) },
          { label: "Markers", section: "Show", checked: markers, onClick: () => setMarkers(!markers) },
          { label: "Log X axis", section: "Show", checked: xLog, onClick: () => setXLog(!xLog) },
          { label: "Log Y axis", section: "Show", checked: yLog, onClick: () => setYLog(!yLog) },
          { label: "Individual points", section: "Show", checked: showPoints, onClick: () => setShowPoints(!showPoints) },
        ],
      },
      {
        label: "Statistics",
        items: [
          { label: "Add to the sheet", onClick: () => addStatsSheetRef.current() },
          { label: "Copy", onClick: () => copyStatsRef.current() },
          { label: "Export (.xlsx)", onClick: () => exportStatsRef.current() },
        ],
      },
      {
        label: "Open settings",
        items: RAIL_SECTIONS.map((sec) => ({
          label: sec.label,
          onClick: () => {
            setDockOpen("right", true)
            jumpToSection(sec.id)
          },
        })),
      },
    ],
    [
      askCatalyst, chartType, errorMode, paletteName, showGrid, showLegend, markers, yLog, xLog,
      showPoints, jumpToSection, setDockOpen,
    ],
  )

  const hasPlot = activeY.length > 0 && plotData.length > 0


  // Feature hooks (called unconditionally; each renders lazily where placed).
  // The plate model is shared so the plate layout drives the standard curve.
  const plateModel = usePlateModel(grid)
  const stats = useStatsPanel(table, numericCols)
  const curve = useStandardCurve(table, numericCols, plateModel)
  const plate = usePlate(plateModel)

  /* ── Analyses (tabs) ──────────────────────────────────────────────────────
     Several analyses of the same sheet, open at once. Each is a saved chart
     configuration — the very object `.n9a` export already serialises — so a tab
     costs nothing new to persist and everything the rail can express travels
     with it. Switching tabs stores the configuration you are leaving and
     applies the one you are entering. */
  const [analyses, setAnalyses] = useState<{ id: string; name: string; config: unknown }[]>([])
  const [activeAnalysisId, setActiveAnalysisId] = useState<string>("a1")
  const analysisSeq = useRef(1)
  const buildConfigRef = useRef<() => unknown>(() => ({}))

  /**
   * Tab handlers work off a ref of the list, and apply the incoming
   * configuration OUTSIDE the state updater.
   *
   * `applyConfig` is thirty `setState` calls. Running it inside an updater
   * makes it a side effect of computing state, which React may invoke twice and
   * may discard — which is exactly how switching tabs left the previous tab's
   * settings on screen.
   */
  const analysesRef = useRef(analyses)
  analysesRef.current = analyses

  /** Fold the current rail state back into the active tab before leaving it. */
  const captureActive = useCallback(
    () =>
      analysesRef.current.map((a) =>
        a.id === activeAnalysisId ? { ...a, config: buildConfigRef.current() } : a
      ),
    [activeAnalysisId]
  )

  const switchAnalysis = useCallback(
    (id: string) => {
      if (id === activeAnalysisId) return
      const saved = captureActive()
      const target = saved.find((a) => a.id === id)
      if (!target) return
      setAnalyses(saved)
      setActiveAnalysisId(id)
      applyConfigRef.current(target.config)
    },
    [activeAnalysisId, captureActive]
  )

  const newAnalysis = useCallback(() => {
    const id = `a${++analysisSeq.current}`
    setAnalyses([
      ...captureActive(),
      { id, name: `Analysis ${analysisSeq.current}`, config: buildConfigRef.current() },
    ])
    setActiveAnalysisId(id)
  }, [captureActive])

  const duplicateAnalysis = useCallback(
    (id: string) => {
      const saved = captureActive()
      const index = saved.findIndex((a) => a.id === id)
      if (index === -1) return
      const newId = `a${++analysisSeq.current}`
      const copy = { id: newId, name: `${saved[index].name} (copy)`, config: saved[index].config }
      const next = [...saved]
      next.splice(index + 1, 0, copy)
      setAnalyses(next)
      setActiveAnalysisId(newId)
      applyConfigRef.current(copy.config)
    },
    [captureActive]
  )

  const closeAnalysis = useCallback(
    (id: string) => {
      const list = analysesRef.current
      // Never close the last one: an empty workspace has no affordance to start
      // a new analysis from.
      if (list.length <= 1) return
      const index = list.findIndex((a) => a.id === id)
      const next = list.filter((a) => a.id !== id)
      setAnalyses(next)
      if (id === activeAnalysisId) {
        const neighbour = next[index] ?? next[index - 1]
        if (neighbour) {
          setActiveAnalysisId(neighbour.id)
          applyConfigRef.current(neighbour.config)
        }
      }
    },
    [activeAnalysisId]
  )

  /* ── Import (local + from Notes9 library) · Save ──────────────────────────── */
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [librarySearch, setLibrarySearch] = useState("")
  const [loadingFileId, setLoadingFileId] = useState<string | null>(null)

  const tabularFiles = useMemo(
    () =>
      files.filter(
        (f) => /\.(xlsx|xls|csv|tsv)$/i.test(f.file_name) || (f.file_type != null && /(spreadsheet|csv|excel)/i.test(f.file_type)),
      ),
    [files],
  )

  // Refs, not values: `buildConfig` closes over ~30 pieces of rail state and is
  // rebuilt every render, so a tab handler capturing it directly would save a
  // stale configuration.
  useEffect(() => {
    buildConfigRef.current = buildConfig
    applyConfigRef.current = applyConfig as (c: unknown) => void
  })

  useEffect(() => {
    if (analyses.length === 0) {
      setAnalyses([{ id: "a1", name: title || "Analysis 1", config: buildConfigRef.current() }])
    }
  }, [analyses.length, title])

  /**
   * Every open analysis, as a figure-layout panel source.
   *
   * Each tab's stored configuration derives its own spec, so a panel can draw
   * any of them — which is the point of layouts: a published figure's panels
   * come from different analyses, not different views of one.
   */
  const layoutPipelines = useMemo<AnalysisPipeline[]>(() => {
    const out: AnalysisPipeline[] = []
    for (const a of analyses) {
      // The active tab's spec comes from the live rail; the others from the
      // configuration they were left in.
      const spec =
        a.id === activeAnalysisId
          ? derivedSpec
          : (() => {
              try {
                return specFromChartState(a.config as never, specTable, { fileName: sheetFileName })
              } catch {
                return null
              }
            })()
      if (!spec) continue
      out.push({
        id: a.id,
        name: a.name,
        spec,
        table: specTable,
        result: a.id === activeAnalysisId ? engineResult : null,
        stale: a.id === activeAnalysisId ? engineResult === null : true,
      })
    }
    return out
  }, [analyses, activeAnalysisId, derivedSpec, specTable, engineResult, sheetFileName])

  const loadSnapshot = useCallback((snap: UniverWorkbookSnapshot) => {
    seededRef.current = false
    setLiveSnapshot(snap)
    setMountSnapshot(snap)
    setMountKey((k) => k + 1)
  }, [])

  // Serialize / restore the full analysis config (chart + plate) for .n9a save
  // and session persistence.
  const buildConfig = () => ({
    chartType, xKey, yKeys, zKey, sizeKey, title, xLabel, xUnit, yLabel, yUnit, yLog, showGrid, showLegend, markers, paletteName,
    seriesStyles, xMin, xMax, yMin, yMax, nticks, fontFamily, titleSize, axisTitleSize,
    errorMode, showPoints, subtitle, legendPos, hlines, vlines, chartH, caption, xLog,
    test: statTest, postHoc: statPostHoc, alpha: statAlpha, tails: statTails,
    referenceLevel: statReferenceLevel,
    plate: { format: plateModel.format, originRow: plateModel.originRow, originCol: plateModel.originCol, roleOverrides: plateModel.roleOverrides, annOverrides: plateModel.annOverrides },
    phase,
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyConfigRef = useRef<(c: unknown) => void>(() => undefined)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyConfig = useCallback((c: any) => {
    if (!c || typeof c !== "object") return
    if (c.chartType) setChartType(c.chartType)
    if (typeof c.xKey === "string") setXKey(c.xKey)
    if (Array.isArray(c.yKeys)) setYKeys(c.yKeys)
    if (typeof c.zKey === "string") setZKey(c.zKey)
    if (typeof c.sizeKey === "string") setSizeKey(c.sizeKey)
    if (typeof c.title === "string") setTitle(c.title)
    if (typeof c.xLabel === "string") setXLabel(c.xLabel)
    if (typeof c.xUnit === "string") setXUnit(c.xUnit)
    if (typeof c.yLabel === "string") setYLabel(c.yLabel)
    if (typeof c.yUnit === "string") setYUnit(c.yUnit)
    if (typeof c.yLog === "boolean") setYLog(c.yLog)
    if (typeof c.xLog === "boolean") setXLog(c.xLog)
    if (typeof c.showGrid === "boolean") setShowGrid(c.showGrid)
    if (typeof c.showLegend === "boolean") setShowLegend(c.showLegend)
    if (typeof c.markers === "boolean") setMarkers(c.markers)
    if (typeof c.paletteName === "string") setPaletteName(c.paletteName)
    if (c.seriesStyles && typeof c.seriesStyles === "object") setSeriesStyles(c.seriesStyles)
    if (typeof c.xMin === "string") setXMin(c.xMin)
    if (typeof c.xMax === "string") setXMax(c.xMax)
    if (typeof c.yMin === "string") setYMin(c.yMin)
    if (typeof c.yMax === "string") setYMax(c.yMax)
    if (typeof c.nticks === "string") setNticks(c.nticks)
    if (typeof c.fontFamily === "string") setFontFamily(c.fontFamily)
    if (typeof c.titleSize === "number") setTitleSize(c.titleSize)
    if (typeof c.axisTitleSize === "number") setAxisTitleSize(c.axisTitleSize)
    if (typeof c.errorMode === "string") setErrorMode(c.errorMode)
    if (typeof c.showPoints === "boolean") setShowPoints(c.showPoints)
    if (typeof c.subtitle === "string") setSubtitle(c.subtitle)
    setCaption(typeof c.caption === "string" ? c.caption : null)
    if (typeof c.legendPos === "string") setLegendPos(c.legendPos)
    if (typeof c.hlines === "string") setHlines(c.hlines)
    if (typeof c.vlines === "string") setVlines(c.vlines)
    if (typeof c.chartH === "number") setChartH(c.chartH)
    // The statistics slice. Null on the reference level is a value ("compare
    // against no baseline"), so it is accepted alongside a column name.
    if (typeof c.test === "string") setStatTest(c.test)
    if (typeof c.postHoc === "string") setStatPostHoc(c.postHoc)
    if (typeof c.alpha === "number") setStatAlpha(c.alpha)
    if (typeof c.tails === "string") setStatTails(c.tails)
    if (c.referenceLevel === null || typeof c.referenceLevel === "string") setStatReferenceLevel(c.referenceLevel)
    if (c.plate) {
      if (c.plate.format) plateModel.setFormat(c.plate.format)
      if (typeof c.plate.originRow === "number") plateModel.setOriginRow(c.plate.originRow)
      if (typeof c.plate.originCol === "number") plateModel.setOriginCol(c.plate.originCol)
      if (c.plate.roleOverrides || c.plate.annOverrides) plateModel.applyOverrides(c.plate.roleOverrides ?? {}, c.plate.annOverrides ?? {})
    }
    if (c.phase) setPhase(c.phase)
    seededRef.current = true // config supplies the mappings; don't auto-seed over them
  }, [plateModel])

  /* ── Ask for a change, in words ────────────────────────────────────────────
     A sentence and a control are the same edit: both end as typed mutations on
     the spec, so what arrives here moves the rail the user is looking at rather
     than opening a conversation about it. That is the difference from the
     Catalyst composer at the top of the page, which answers questions and
     changes nothing — and the reason this is a second, narrower entry point
     rather than a second use of that one.

     Nothing below is load-bearing for the deterministic path. If the assistant
     is off, every control, the engine and the statistics still work. */
  const [aiPrompt, setAiPrompt] = useState("")
  const [aiBusy, setAiBusy] = useState(false)
  const [aiReply, setAiReply] = useState<{ outcome: SpecPatchOutcome; applied: string[] } | null>(null)
  const aiAbortRef = useRef<AbortController | null>(null)

  /** The hard precondition, mirrored from the route: no resolved rows, no ask. */
  const aiReady = derivedSpec !== null && specTable.rows.length > 0

  const askForChange = useCallback(async () => {
    const prompt = aiPrompt.trim()
    if (!prompt || !derivedSpec || specTable.rows.length === 0) return

    // A new request supersedes the one in flight. The old one resolves as
    // "aborted", which is deliberately silent: it was replaced, not failed.
    aiAbortRef.current?.abort()
    const controller = new AbortController()
    aiAbortRef.current = controller
    setAiBusy(true)
    try {
      const outcome = await requestSpecPatch({
        prompt,
        spec: derivedSpec,
        table: specTable,
        signal: controller.signal,
      })
      if (outcome.outcome === "aborted") return

      let applied: string[] = []
      if (outcome.outcome === "patch" && outcome.mutations.length > 0) {
        // `initHistory` starts with an empty sticky set on purpose: this rail
        // holds its settings in React state rather than dispatching mutations,
        // so there is no record of which paths were edited by hand and nothing
        // for a patch to collide with. The patch still goes through
        // `applyAiPatch` so the spec and the sentences describing it come from
        // the one code path the rest of L6 uses.
        const patched = applyAiPatch(initHistory(derivedSpec), outcome.mutations)
        applied = patched.applied.map(describeMutation)
        const edits = railEditsFromSpec(derivedSpec, patched.history.spec, specTable)
        // Merged over the current configuration, not applied alone: `applyConfig`
        // is a total setter, and handing it a partial config would reset the
        // fields the patch never mentioned.
        if (Object.keys(edits).length > 0) {
          applyConfigRef.current({ ...(buildConfigRef.current() as object), ...edits })
        }
      }
      setAiReply({ outcome, applied })
      // The box empties only when the request is finished with. A question back
      // means the user is about to rephrase, and deleting what they wrote would
      // make them type it again.
      if (outcome.outcome === "patch" && !outcome.clarificationNeeded) setAiPrompt("")
    } finally {
      // A superseded request no longer owns the busy flag — the one that
      // replaced it does.
      if (aiAbortRef.current === controller) {
        aiAbortRef.current = null
        setAiBusy(false)
      }
    }
  }, [aiPrompt, derivedSpec, specTable])

  // Import: local spreadsheet/CSV, or a saved .n9a analysis bundle.
  const onImport = useCallback(
    (file: File) => {
      const isBundle = /\.(n9a|json)$/i.test(file.name)
      file.arrayBuffer().then((buf) => {
        if (isBundle) {
          try {
            const parsed = JSON.parse(new TextDecoder().decode(buf))
            if (parsed?.workbook) loadSnapshot(parsed.workbook as UniverWorkbookSnapshot)
            if (parsed?.config) applyConfig(parsed.config)
            toast.success(`Opened ${file.name}`)
          } catch {
            toast.error("Couldn't read that analysis file")
          }
          return
        }
        const wb = readSpreadsheetWorkbook(buf, file.name)
        loadSnapshot(buildSpreadsheetWorkbookSnapshot(file.name, wb))
      })
    },
    [loadSnapshot, applyConfig],
  )

  const loadLibraryFile = useCallback(
    async (file: DataFileRow) => {
      setLoadingFileId(file.id)
      try {
        const url = `/api/experiments/${file.experiment_id}/data-files/${file.id}/workbook`
        let res = await fetch(url)
        let data = await res.json()
        if (!data?.workbook_snapshot) {
          // Backfill the snapshot from the stored file, then re-read.
          await fetch(url, { method: "POST" })
          res = await fetch(url)
          data = await res.json()
        }
        if (data?.workbook_snapshot) {
          loadSnapshot(data.workbook_snapshot as UniverWorkbookSnapshot)
          toast.success(`Loaded ${file.file_name}`)
          setLibraryOpen(false)
        } else {
          toast.error("This file has no spreadsheet content to analyze")
        }
      } catch {
        toast.error("Failed to load file")
      } finally {
        setLoadingFileId(null)
      }
    },
    [loadSnapshot],
  )

  const saveAnalysis = useCallback(() => {
    const bundle = { kind: "notes9-analysis", version: 1, savedAt: new Date().toISOString(), workbook: liveSnapshot, config: buildConfig() }
    const blob = new Blob([JSON.stringify(bundle)], { type: "application/json" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `${(title || "analysis").replace(/\s+/g, "-").toLowerCase()}.n9a`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    toast.success("Analysis saved")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveSnapshot, title])

  /* ── Session persistence: data + config always resume ─────────────────────── */
  const configJson = JSON.stringify(buildConfig())
  const restoredRef = useRef(false)
  // Restore once on mount (client-only, so no SSR hydration mismatch).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY)
      if (raw) {
        const saved = JSON.parse(raw)
        if (saved?.workbook) loadSnapshot(saved.workbook as UniverWorkbookSnapshot)
        if (saved?.config) applyConfig(saved.config)
      }
    } catch {
      /* ignore corrupt session */
    }
    restoredRef.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // Debounced autosave of workbook + config after restore.
  useEffect(() => {
    if (!restoredRef.current) return
    const t = setTimeout(() => {
      try {
        localStorage.setItem(SESSION_KEY, JSON.stringify({ savedAt: new Date().toISOString(), workbook: liveSnapshot, config: JSON.parse(configJson) }))
      } catch {
        /* quota / serialize failure — non-fatal */
      }
    }, 800)
    return () => clearTimeout(t)
  }, [liveSnapshot, configJson])

  /* ── Templates (gallery + saved setups live server-side via TemplatesDialog) ── */
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const applyTemplate = useCallback(
    (t: AnalysisTemplate) => {
      try {
        if (t.aoa) loadSnapshot(buildSnapshotFromAoa(t.aoa, t.name, `${t.name}.xlsx`))
        applyConfig({ ...t.config, phase: t.phase })
        toast.success(`Applied “${t.name}”`)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't apply that template")
      }
    },
    [loadSnapshot, applyConfig],
  )

  const chartCanvas = (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card/80 shadow-sm backdrop-blur-sm">
      <PaneHeader Icon={ChartLine} title="Chart">
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-[11px] text-muted-foreground lg:block">Double-click to edit · right-click for menu</span>
          <ExportMenu variant="ghost" disabled={!hasPlot} defaultName={title} onExport={runExport} getPng={getChartPng} getCanvasSize={getChartSize} onSaveToLibrary={() => setSaveChartOpen(true)} />
        </div>
      </PaneHeader>
      <div className="p-2">
        <div ref={chartBoxRef} className="w-full" style={{ height: chartH }}>
          {hasPlot ? (
            <PlotlyChart data={plotData} layout={plotLayout} onEdit={handleChartEdit} onEditElement={onEditElement} extraGroups={chartMenuGroups} exportApiRef={chartExportRef} renderApiRef={chartImageRef} className="h-full w-full" />
          ) : (
            <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border px-6 text-center text-sm text-muted-foreground">
              {is3D(chartType) ? "Assign an X, a Y and a Z column (right) to plot in 3D." : "Choose a chart type and at least one Y series."}
            </div>
          )}
        </div>
      </div>
    </div>
  )

  // Column the current sheet selection points at (for X/Y series binding).
  const selColumn = sheetSel?.columnHeader && table.columns.includes(sheetSel.columnHeader) ? sheetSel.columnHeader : null
  const selNumeric = selColumn ? numericCols.includes(selColumn) : false

  const chartSettings = (
    <div className="space-y-4">
      {/* Section jump bar.
          The rail is eight sections deep, and the ones people reach for most
          (axes, typography, export) were the furthest down. This puts every
          section one click away instead of one scroll, and highlights the one
          you land on so the jump is legible rather than a silent scroll. */}
      <div className="sticky top-0 z-10 -mx-4 mb-1 border-b border-border/50 bg-card/95 px-4 py-1.5 backdrop-blur-sm">
        <div className="flex items-center gap-0.5 overflow-x-auto">
          <button
            type="button"
            onClick={() => setRailSection("all")}
            title="Show every setting"
            className={cn(
              "shrink-0 rounded-md px-2 py-1 text-[11.5px] font-medium transition-colors",
              railSection === "all"
                ? "bg-[var(--n9-accent,#965034)]/12 text-[var(--n9-accent,#965034)]"
                : "text-muted-foreground/70 hover:bg-muted hover:text-foreground",
            )}
          >
            All
          </button>
          {RAIL_SECTIONS.map((sec) => (
            <button
              key={sec.id}
              type="button"
              onClick={() => setRailSection(sec.id)}
              title={sec.label}
              aria-label={sec.label}
              aria-pressed={railSection === sec.id}
              className={cn(
                "shrink-0 rounded-md p-1.5 transition-colors",
                railSection === sec.id
                  ? "bg-[var(--n9-accent,#965034)]/12 text-[var(--n9-accent,#965034)]"
                  : "text-muted-foreground/70 hover:bg-muted hover:text-foreground",
              )}
            >
              <sec.Icon className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
        {railSection !== "all" && (
          <p className="mt-1 text-[11px] text-muted-foreground/80">
            <span className="font-semibold text-foreground">
              {RAIL_SECTIONS.find((sec) => sec.id === railSection)?.label}
            </span>
            <span className="mx-1 opacity-50">·</span>
            <button type="button" onClick={() => setRailSection("all")} className="underline underline-offset-2 hover:text-foreground">
              show all
            </button>
          </p>
        )}
      </div>

      <div id="cs-type" className={cn(!showRail("cs-type") && "!hidden", "scroll-mt-3 rounded-lg transition-shadow", flashId === "cs-type" && "ring-2 ring-[var(--n9-accent,#965034)]/40")}>
        <SectionLabel><FnIcon className="h-3.5 w-3.5" /> Chart type</SectionLabel>
        <div className="grid grid-cols-4 gap-1.5">
          {CHART_TYPES.map((t) => (
            <button key={t.id} onClick={() => setChartType(t.id)} title={t.label}
              className={cn("flex flex-col items-center gap-1 rounded-lg border p-2 text-[10px] transition-colors",
                chartType === t.id
                  ? "border-[var(--n9-accent,#965034)]/40 bg-[var(--n9-accent,#965034)]/10 font-semibold text-[var(--n9-accent,#965034)]"
                  : "border-border text-muted-foreground hover:text-foreground")}>
              <t.Icon className="h-4 w-4" weight="bold" /> {t.label}
            </button>
          ))}
        </div>
      </div>
      <div id="cs-data" className={cn(!showRail("cs-data") && "!hidden", "scroll-mt-3 space-y-4 rounded-lg transition-shadow", flashId === "cs-data" && "ring-2 ring-[var(--n9-accent,#965034)]/40")}>
      <SectionLabel><TableIcon className="h-3.5 w-3.5" /> Data</SectionLabel>
      {/* Bind the selected sheet cell → chart title / axis / series.
          Two clearly-separated intents: use the cell's TEXT as a title, or
          plot its COLUMN as data. */}
      <AnimatePresence initial={false}>
        {sheetSel && (sheetSel.text !== "" || selColumn) && (
          <motion.div
            key="sheet-sel"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="rounded-xl border border-[var(--n9-accent,#965034)]/25 bg-gradient-to-b from-[var(--n9-accent,#965034)]/[0.09] to-[var(--n9-accent,#965034)]/[0.02]">
              <div className="flex items-center gap-2 border-b border-[var(--n9-accent,#965034)]/15 px-3 py-2">
                <Cursor className="h-4 w-4 text-[var(--n9-accent,#965034)]" weight="fill" />
                <span className="text-sm font-medium">From the sheet</span>
                <span className="ml-auto rounded-md bg-[var(--n9-accent,#965034)]/12 px-1.5 py-0.5 font-mono text-[11px] font-medium text-[var(--n9-accent,#965034)]">{sheetSel.a1}</span>
              </div>
              <div className="space-y-3 p-3">
                <div className="rounded-lg border border-border/60 bg-background/70 px-2.5 py-1.5">
                  <div className="truncate text-sm font-medium" title={sheetSel.text}>
                    {sheetSel.text || <span className="text-muted-foreground">(empty cell)</span>}
                  </div>
                </div>

                {sheetSel.text && (
                  <div>
                    <p className="mb-1.5 text-xs text-muted-foreground">Set a title from this text</p>
                    <div className="grid grid-cols-3 gap-1.5">
                      <BindBtn icon={ChartLine} label="Chart" active={title === sheetSel.text} onClick={() => setTitle(sheetSel.text)} />
                      <BindBtn icon={ArrowRight} label="X axis" active={xLabel === sheetSel.text} onClick={() => { setXLabel(sheetSel.text); setXUnit("") }} />
                      <BindBtn icon={ArrowUp} label="Y axis" active={yLabel === sheetSel.text} onClick={() => { setYLabel(sheetSel.text); setYUnit("") }} />
                    </div>
                  </div>
                )}

                {selColumn && (
                  <div>
                    <p className="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      Plot column
                      <span className="max-w-[10rem] truncate font-medium text-foreground" title={selColumn}>{selColumn}</span>
                      <span className={cn("rounded px-1 py-px text-[10px] font-medium", selNumeric ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground")}>{selNumeric ? "numeric" : "text"}</span>
                    </p>
                    <div className="grid grid-cols-2 gap-1.5">
                      <BindBtn icon={ArrowRight} label="Set as X" active={xKey === selColumn} onClick={() => setXKey(selColumn)} />
                      <BindBtn icon={Plus} label="Add as Y" active={yKeys.includes(selColumn)} disabled={!selNumeric} onClick={() => setYKeys((p) => (p.includes(selColumn) ? p : [...p, selColumn]))} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <Field label={`Columns — assign axes${is3D(chartType) ? " (X · Y · Z)" : ""}`}>
        <div className="space-y-1 rounded-md border border-input bg-background p-1.5">
          {table.columns.map((c) => {
            const numeric = numericCols.includes(c)
            const isX = xKey === c
            const isY = yKeys.includes(c)
            const isZ = zKey === c
            return (
              <div key={c} className="flex items-center gap-1.5">
                <span className="min-w-0 flex-1 truncate text-xs" title={c}>{c}{!numeric && <span className="ml-1 text-[10px] text-muted-foreground/60">(text)</span>}</span>
                <AssignBtn active={isX} onClick={() => setXKey(c)}>X</AssignBtn>
                <AssignBtn active={isY} disabled={!numeric} onClick={() => setYKeys((p) => (isY ? p.filter((k) => k !== c) : [...p, c]))}>Y</AssignBtn>
                {is3D(chartType) && <AssignBtn active={isZ} disabled={!numeric} onClick={() => setZKey(c)}>Z</AssignBtn>}
              </div>
            )
          })}
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">Click a column&rsquo;s X / Y{is3D(chartType) ? " / Z" : ""} to plot it. Multiple Y series overlay.</p>
        {BINDING_HINTS[chartType] && (
          <p className="mt-1 rounded-md bg-[var(--n9-accent,#965034)]/8 px-2 py-1 text-[11px] font-medium text-[var(--n9-accent,#965034)]">{BINDING_HINTS[chartType]}</p>
        )}
      </Field>
      {chartType === "bubble" && (
        <Field label="Bubble size (column)">
          <NativeSelect value={sizeKey || "__y__"} onChange={(v) => setSizeKey(v === "__y__" ? "" : v)}>
            <option value="__y__">Same as Y</option>
            {numericCols.map((c) => (<option key={c} value={c}>{c}</option>))}
          </NativeSelect>
        </Field>
      )}
      </div>
      <div id="cs-title" className={cn(!showRail("cs-title") && "!hidden", "scroll-mt-3 space-y-4 rounded-lg transition-shadow", flashId === "cs-title" && "ring-2 ring-[var(--n9-accent,#965034)]/40")}>
        <Field label="Chart title"><Input className="h-9" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="Subtitle"><Input className="h-9" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="optional" /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="X label"><Input className="h-9" value={xLabel} onChange={(e) => setXLabel(e.target.value)} /></Field>
          <Field label="X unit"><Input className="h-9" value={xUnit} onChange={(e) => setXUnit(e.target.value)} /></Field>
          <Field label="Y label"><Input className="h-9" value={yLabel} onChange={(e) => setYLabel(e.target.value)} /></Field>
          <Field label="Y unit"><Input className="h-9" value={yUnit} onChange={(e) => setYUnit(e.target.value)} /></Field>
        </div>
      </div>
      <div id="cs-toggles" className={cn(!showRail("cs-toggles") && "!hidden", "scroll-mt-3 flex flex-col gap-2.5 border-t border-border pt-3 text-sm transition-shadow", flashId === "cs-toggles" && "rounded-lg ring-2 ring-[var(--n9-accent,#965034)]/40")}>
        <Toggle label="Show markers" checked={markers} onChange={setMarkers} />
        <Toggle label="Log X axis" checked={xLog} onChange={setXLog} />
        <Toggle label="Log Y axis" checked={yLog} onChange={setYLog} />
        <Toggle label="Gridlines" checked={showGrid} onChange={setShowGrid} />
        <Toggle label="Legend" checked={showLegend} onChange={setShowLegend} />
        {showLegend && (
          <div className="flex items-center justify-between gap-2 pl-0.5">
            <span className="text-xs text-muted-foreground">Legend position</span>
            <div className="inline-flex rounded-md border border-border bg-background p-0.5 text-xs">
              {(["bottom", "right", "top"] as const).map((pos) => (
                <button key={pos} onClick={() => setLegendPos(pos)}
                  className={cn("rounded px-2 py-0.5 capitalize transition-colors", legendPos === pos ? "bg-[var(--n9-accent,#965034)] text-white" : "text-muted-foreground hover:text-foreground")}>
                  {pos}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Error bars, individual points & reference lines (Prism-style) */}
      <div id="cs-error" className={cn(!showRail("cs-error") && "!hidden", "flex scroll-mt-3 flex-col gap-2.5 border-t border-border pt-3 transition-shadow", flashId === "cs-error" && "rounded-lg ring-2 ring-[var(--n9-accent,#965034)]/40")}>
        <SectionLabel><TrendUp className="h-3.5 w-3.5" /> Error &amp; annotations</SectionLabel>
        <Field label="Error bars (aggregate replicate rows sharing an X value)">
          <NativeSelect value={errorMode} onChange={(v) => setErrorMode(v as ErrorMode)}>
            {ERROR_BAR_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.id === "none" ? "None" : ERROR_BAR_LABEL[o.id]}
              </option>
            ))}
          </NativeSelect>
          {errorMode !== "none" && (
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
              {ERROR_BAR_OPTIONS.find((o) => o.id === errorMode)?.note}
            </p>
          )}
        </Field>
        {errorMode !== "none" && <Toggle label="Overlay individual points" checked={showPoints} onChange={setShowPoints} />}
        <div className="grid grid-cols-2 gap-2">
          <Field label="Reference line — Y"><Input className="h-9" value={hlines} onChange={(e) => setHlines(e.target.value)} placeholder="e.g. 0, 1.5" /></Field>
          <Field label="Reference line — X"><Input className="h-9" value={vlines} onChange={(e) => setVlines(e.target.value)} placeholder="e.g. 10" /></Field>
        </div>
        <RangeRow label="Canvas height" value={chartH} min={320} max={820} step={20} onChange={setChartH} />
      </div>

      {/* Per-series style inspector */}
      {activeY.length > 0 && (
        <div id="cs-series" className={cn(!showRail("cs-series") && "!hidden", "scroll-mt-3 border-t border-border pt-3 transition-shadow", flashId === "cs-series" && "rounded-lg ring-2 ring-[var(--n9-accent,#965034)]/40")}>
          <SectionLabel><Palette className="h-3.5 w-3.5" /> Series style</SectionLabel>
          {activeY.length > 1 && (
            <div className="mb-2.5 flex flex-wrap gap-1">
              {activeY.map((k, i) => (
                <button key={k} onClick={() => setEditSeries(k)}
                  className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors",
                    k === editKey ? "border-[var(--n9-accent,#965034)]/40 bg-[var(--n9-accent,#965034)]/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground")}>
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: seriesStyles[k]?.color ?? palette[i % palette.length] }} />
                  {k}
                </button>
              ))}
            </div>
          )}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">Color</span>
              <div className="flex items-center gap-1.5">
                <input type="color" value={toHex(curColor)} onChange={(e) => setStyle(editKey, { color: e.target.value })} className="h-7 w-10 cursor-pointer rounded border border-border bg-transparent p-0.5" />
                {curStyle.color && <button onClick={() => setStyle(editKey, { color: undefined })} className="text-[11px] text-muted-foreground hover:text-foreground">reset</button>}
              </div>
            </div>
            <RangeRow label="Line width" value={curStyle.width ?? (chartType === "area" ? 2 : 2.5)} min={0.5} max={6} step={0.5} onChange={(v) => setStyle(editKey, { width: v })} />
            <RangeRow label="Marker size" value={curStyle.size ?? 7} min={0} max={20} step={1} onChange={(v) => setStyle(editKey, { size: v })} />
            <RangeRow label="Opacity" value={curStyle.opacity ?? 1} min={0.1} max={1} step={0.05} onChange={(v) => setStyle(editKey, { opacity: v })} />
            <Field label="Line style">
              <DashPicker value={curStyle.dash ?? "solid"} onChange={(v) => setStyle(editKey, { dash: v })} />
            </Field>
            <Field label="Marker">
              <MarkerPicker value={curStyle.marker ?? "circle"} onChange={(v) => setStyle(editKey, { marker: v })} />
            </Field>
            <div className="flex items-center justify-between gap-2 pt-0.5">
              <span className="text-xs text-muted-foreground">Y axis (dual-axis)</span>
              <div className="inline-flex rounded-md border border-border bg-background p-0.5 text-xs">
                {(["y", "y2"] as const).map((ax) => (
                  <button key={ax} onClick={() => setStyle(editKey, { axis: ax })}
                    className={cn("rounded px-2 py-0.5 transition-colors", (curStyle.axis ?? "y") === ax ? "bg-[var(--n9-accent,#965034)] text-white" : "text-muted-foreground hover:text-foreground")}>
                    {ax === "y" ? "Left" : "Right"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      <div id="cs-palette" className={cn(!showRail("cs-palette") && "!hidden", "scroll-mt-3 rounded-lg transition-shadow", flashId === "cs-palette" && "ring-2 ring-[var(--n9-accent,#965034)]/40")}>
        <PalettePicker value={paletteName} onChange={setPaletteName} />
      </div>

      {/* Axes */}
      <div id="cs-axes" className={cn(!showRail("cs-axes") && "!hidden", "scroll-mt-3 border-t border-border pt-3 transition-shadow", flashId === "cs-axes" && "rounded-lg ring-2 ring-[var(--n9-accent,#965034)]/40")}>
        <SectionLabel><Ruler className="h-3.5 w-3.5" /> Axes</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          <Field label="X min"><Input className="h-9" value={xMin} onChange={(e) => setXMin(e.target.value)} placeholder="auto" /></Field>
          <Field label="X max"><Input className="h-9" value={xMax} onChange={(e) => setXMax(e.target.value)} placeholder="auto" /></Field>
          <Field label="Y min"><Input className="h-9" value={yMin} onChange={(e) => setYMin(e.target.value)} placeholder="auto" /></Field>
          <Field label="Y max"><Input className="h-9" value={yMax} onChange={(e) => setYMax(e.target.value)} placeholder="auto" /></Field>
        </div>
        <div className="mt-2">
          <Field label="Approx. tick count (X)"><Input className="h-9" value={nticks} onChange={(e) => setNticks(e.target.value)} placeholder="auto" /></Field>
        </div>
      </div>

      {/* Fonts */}
      <div id="cs-type-face" className={cn(!showRail("cs-type-face") && "!hidden", "scroll-mt-3 border-t border-border pt-3 transition-shadow", flashId === "cs-type-face" && "rounded-lg ring-2 ring-[var(--n9-accent,#965034)]/40")}>
        <SectionLabel><TextAa className="h-3.5 w-3.5" /> Typography</SectionLabel>
        <Field label="Font family">
          <NativeSelect value={fontFamily} onChange={setFontFamily}>
            {FONT_OPTIONS.map((f) => (<option key={f.label} value={f.value}>{f.label}</option>))}
          </NativeSelect>
        </Field>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <RangeRow label="Title size" value={titleSize} min={11} max={28} step={1} onChange={setTitleSize} />
          <RangeRow label="Axis size" value={axisTitleSize} min={9} max={20} step={1} onChange={setAxisTitleSize} />
        </div>
      </div>

      {/* Publication export — same advanced menu as the chart header */}
      <div id="cs-export" className={cn(!showRail("cs-export") && "!hidden", "scroll-mt-3 border-t border-border pt-3 transition-shadow", flashId === "cs-export" && "rounded-lg ring-2 ring-[var(--n9-accent,#965034)]/40")}>
        <SectionLabel><DownloadSimple className="h-3.5 w-3.5" /> Export figure</SectionLabel>
        {/* Inline, not a button that opens a panel: this section IS the export
            panel, and making it a trigger meant two clicks and two surfaces for
            one job. */}
        <ExportMenu variant="inline" disabled={!hasPlot} defaultName={title} onExport={runExport} getPng={getChartPng} getCanvasSize={getChartSize} onSaveToLibrary={() => setSaveChartOpen(true)} />
      </div>
    </div>
  )

  /**
   * The Statistics phase, with the validated engine's answer above the
   * workspace's own summaries.
   *
   * The engine is the authority: it runs the same scipy/statsmodels code the
   * validation corpus is asserted against, so its result leads. The existing
   * panel stays beneath it because it carries per-column summaries and the
   * exploratory tables the engine result does not replace.
   */
  /**
   * Put the statistics into the spreadsheet as their own sheet.
   *
   * The result stops being something you can only look at: it becomes cells you
   * can sort, format, paste and export with the data it came from. Written as a
   * new sheet rather than over the data, and regenerated on every press, so it
   * is a report and never an input.
   */
  const addStatsSheet = useCallback(() => {
    if (!derivedSpec) return
    try {
      const wb = snapshotToXlsxWorkbook(liveRef.current)
      const rows = buildResultsSheet(derivedSpec, engineResult, { analysisName: title })
      const ws = XLSX.utils.aoa_to_sheet(rows)
      ws["!cols"] = resultsSheetColumnWidths(rows)
      // A fresh name each time, so pressing it twice does not overwrite the
      // sheet the user may already have annotated.
      let name = RESULTS_SHEET_NAME
      let n = 2
      while (wb.SheetNames.includes(name)) name = `${RESULTS_SHEET_NAME} ${n++}`
      XLSX.utils.book_append_sheet(wb, ws, name)
      loadSnapshot(buildSpreadsheetWorkbookSnapshot(sheetFileName, wb))
      toast.success(`Statistics added to the sheet as "${name}"`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add the statistics sheet")
    }
  }, [derivedSpec, engineResult, title, sheetFileName, loadSnapshot])

  /** The statistics as tab-separated text, for pasting anywhere. */
  const copyStats = useCallback(async () => {
    if (!derivedSpec) return
    const rows = buildResultsSheet(derivedSpec, engineResult, { analysisName: title })
    const text = rows.map((r) => r.map((c) => (c === null ? "" : String(c))).join("\t")).join("\n")
    try {
      await navigator.clipboard.writeText(text)
      toast.success("Statistics copied")
    } catch {
      toast.error("The clipboard is blocked; use Export instead")
    }
  }, [derivedSpec, engineResult, title])

  /** The statistics as their own workbook, alongside the data they describe. */
  const exportStats = useCallback(() => {
    if (!derivedSpec) return
    const wb = XLSX.utils.book_new()
    const dataAoa: (string | number)[][] = [
      table.columns,
      ...table.rows.map((r) => table.columns.map((c) => (r[c] ?? "") as string | number)),
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dataAoa), "Data")
    const rows = buildResultsSheet(derivedSpec, engineResult, { analysisName: title })
    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws["!cols"] = resultsSheetColumnWidths(rows)
    XLSX.utils.book_append_sheet(wb, ws, RESULTS_SHEET_NAME)
    XLSX.writeFile(wb, `${(title || "analysis").replace(/[^\w-]+/g, "-")}-statistics.xlsx`)
  }, [derivedSpec, engineResult, title, table])

  useEffect(() => {
    addStatsSheetRef.current = addStatsSheet
    copyStatsRef.current = copyStats
    exportStatsRef.current = exportStats
  }, [addStatsSheet, copyStats, exportStats])

  const statsCanvas = (
    <div className="flex flex-col gap-3">
      {derivedSpec && (
        <div className="flex flex-wrap items-center gap-2">
          {/* The platform's own Button, the same one Import / Save / Templates
              use, rather than three hand-rolled lookalikes. */}
          <Button variant="outline" size="sm" onClick={addStatsSheet}>
            <TableIcon className="mr-1.5 h-4 w-4" /> Add to sheet
          </Button>
          <Button variant="outline" size="sm" onClick={copyStats}>
            <Copy className="mr-1.5 h-4 w-4" /> Copy
          </Button>
          <Button variant="outline" size="sm" onClick={exportStats}>
            <DownloadSimple className="mr-1.5 h-4 w-4" /> Export (.xlsx)
          </Button>
          <span className="text-[11.5px] text-muted-foreground/70">
            Every number here came from the engine, not from this page.
          </span>
        </div>
      )}
      {derivedSpec && (
        <ResultsCard
          spec={derivedSpec}
          result={engineResult}
          computing={engineBusy}
          onEditCaption={setCaption}
        />
      )}
      {engineNote && !engineBusy && (
        <p className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2 text-[12.5px] text-amber-800 dark:text-amber-300">
          {engineNote}
        </p>
      )}
      {stats.canvas}
    </div>
  )

  const curveSettings = (
    <div className="flex flex-col gap-3">
      <label className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/20 p-2.5 text-[12.5px]">
        <input
          type="checkbox"
          checked={curvePinned}
          onChange={(e) => setCurvePinned(e.target.checked)}
          className="mt-0.5 accent-[var(--n9-accent,#965034)]"
        />
        <span>
          <span className="font-medium">Always offer this tab</span>
          <span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">
            {detected.standardCurve
              ? "This sheet already looks like a standard curve, so the tab is offered anyway."
              : "This sheet has no concentration-and-signal pair, so the tab is normally hidden. Pin it to keep it."}
          </span>
        </span>
      </label>
      {curve.settings}
    </div>
  )

  const aiNote = aiReply ? aiNotice(aiReply.outcome) : null

  /* One line to ask, the answer underneath. The answer is capped rather than
     unbounded: a long rationale must not push the sheet off the screen. */
  const specPrompt = (
    <div className="rounded-2xl border border-border bg-card/80 shadow-sm backdrop-blur-sm">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void askForChange()
        }}
        aria-label="Change this analysis by describing it"
        className="flex items-center gap-2 px-3 py-2"
      >
        <Sparkle className="h-4 w-4 shrink-0 text-[var(--n9-accent,#965034)]" weight="fill" aria-hidden />
        <Input
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
          disabled={!aiReady}
          aria-label="Describe the change you want"
          placeholder={
            aiReady
              ? "Describe a change — “log the Y axis”, “colour-blind-safe palette”, “compare the groups with a Mann-Whitney”"
              : "Import or type some data, then describe a change"
          }
          className="h-8 min-w-0 flex-1 border-0 bg-transparent px-0 text-[13px] shadow-none focus-visible:ring-0"
        />
        <Button
          type="submit"
          variant="outline"
          size="sm"
          disabled={!aiReady || aiBusy || aiPrompt.trim().length === 0}
        >
          {aiBusy ? "Working…" : "Apply"}
        </Button>
      </form>

      {aiReply && (
        <div className="max-h-56 overflow-y-auto border-t border-border/60 px-3 py-2 text-[12.5px] leading-relaxed">
          {aiReply.outcome.outcome === "patch" ? (
            <div className="flex flex-col gap-2">
              {aiReply.outcome.rationale && <p className="text-foreground/90">{aiReply.outcome.rationale}</p>}
              {aiReply.applied.length > 0 ? (
                <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
                  {aiReply.applied.map((description, i) => (
                    <li key={i}>{description}</li>
                  ))}
                </ul>
              ) : aiReply.outcome.clarificationNeeded ? null : (
                <p className="text-muted-foreground">Nothing needed changing — the figure already matches.</p>
              )}
              {aiReply.outcome.clarificationNeeded && (
                // A question, not an error. Whatever was applied still stands;
                // this is the assistant asking for the one thing it lacks.
                <p className="rounded-lg border border-[var(--n9-accent,#965034)]/25 bg-[var(--n9-accent,#965034)]/[0.06] px-2.5 py-1.5 text-foreground/90">
                  {aiReply.outcome.clarificationNeeded}
                </p>
              )}
              {aiReply.outcome.rejected.length > 0 && (
                // A rejection is information: something was proposed, left out,
                // and the reason is worth reading. It is not a failure.
                <div className="text-muted-foreground">
                  <span className="font-medium text-foreground/80">Left out of the change:</span>
                  <ul className="list-disc space-y-0.5 pl-4">
                    {aiReply.outcome.rejected.map((r, i) => (
                      <li key={i}>{r.reason || "No reason given."}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : aiNote ? (
            <div className="flex flex-col gap-1">
              <p className="font-medium text-foreground/90">{aiNote.title}</p>
              <p className="text-muted-foreground">{aiNote.body}</p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )

  const canvasForPhase = phase === "chart" ? chartCanvas : phase === "stats" ? statsCanvas : phase === "curve" ? curve.canvas : plate.canvas
  const settingsForPhase = phase === "chart" ? chartSettings : phase === "stats" ? stats.settings : phase === "curve" ? curveSettings : plate.settings
  const activePhase = PHASES.find((p) => p.id === phase)!
  const ActiveIcon = activePhase.Icon

  return (
    <div
      className={cn(
        "flex flex-col gap-4",
        // Full screen is a container change, not a different tree: the same
        // workspace, given the whole viewport. Rendering a second copy would
        // remount Univer and Plotly and lose the user's cursor and zoom.
        fullscreen &&
          "fixed inset-0 z-50 overflow-auto bg-[color:var(--background)] p-4 md:p-6",
      )}
    >
      {!fullscreen && (
        <CatalystSectionHero scope="lab" placeholder="Ask Catalyst to analyze your data, pick a chart, or explain a result…" />
      )}

      {/* Analyses. Several views of one sheet: the dose-response beside the
          timecourse beside the plate, each keeping its own chart, statistics and
          settings, and each available as a panel in a figure layout. */}
      <PipelineTabs
        pipelines={analyses.map((a) => ({
          id: a.id,
          name: a.name,
          spec: derivedSpec!,
          table: specTable,
          result: a.id === activeAnalysisId ? engineResult : null,
          stale: a.id === activeAnalysisId ? engineResult === null : true,
        }))}
        activeId={activeAnalysisId}
        onActivate={switchAnalysis}
        onNew={newAnalysis}
        onClose={closeAnalysis}
        onDuplicate={duplicateAnalysis}
        onRename={(id, name) =>
          setAnalyses((list) => list.map((a) => (a.id === id ? { ...a, name } : a)))
        }
      />

      {/* Scoped to the analysis above it, and deliberately below the tabs: what
          it changes is this analysis, not the page. */}
      {specPrompt}

      {/* Tabs + toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={phase} onValueChange={(v) => setPhase(v as Phase)} className="w-auto">
          <TabsList>
            <AnimatePresence initial={false} mode="popLayout">
              {visiblePhases.map((p) => {
                // A specialized tab (curve/plate) surfaced because the data
                // matched gets a subtle accent dot — no pill, no chip.
                const auto =
                  (p.id === "curve" && detected.standardCurve) || (p.id === "plate" && detected.plate)
                return (
                  <motion.div
                    key={p.id}
                    layout
                    initial={{ opacity: 0, width: 0, scale: 0.9 }}
                    animate={{ opacity: 1, width: "auto", scale: 1 }}
                    exit={{ opacity: 0, width: 0, scale: 0.9 }}
                    transition={{ type: "spring", stiffness: 500, damping: 40, mass: 0.7 }}
                    style={{ overflow: "hidden" }}
                  >
                    <TabsTrigger value={p.id} className="gap-1.5">
                      <p.Icon className="h-4 w-4" weight={phase === p.id ? "fill" : "regular"} />
                      {p.label}
                      {auto && (
                        <span
                          title="Your data suits this view"
                          className="ml-0.5 h-1.5 w-1.5 rounded-full bg-[var(--n9-accent,#965034)]"
                        />
                      )}
                      {p.id === "curve" && curvePinned && !detected.standardCurve && (
                        <PushPin
                          className="ml-0.5 h-3 w-3 text-muted-foreground/60"
                          weight="fill"
                        />
                      )}
                    </TabsTrigger>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </TabsList>
        </Tabs>

        <input ref={fileRef} type="file" accept=".csv,.tsv,.xlsx,.xls,.n9a,.json" className="hidden" onChange={(e) => { if (e.target.files?.[0]) onImport(e.target.files[0]); e.target.value = "" }} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm"><UploadSimple className="mr-1.5 h-4 w-4" /> Import <CaretDown className="ml-1 h-3.5 w-3.5" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem onClick={() => fileRef.current?.click()}>
              <UploadSimple className="mr-2 h-4 w-4" /> Upload from computer
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setLibraryOpen(true)} disabled={tabularFiles.length === 0}>
              <FolderOpen className="mr-2 h-4 w-4" /> From your data files
              {tabularFiles.length > 0 && <span className="ml-auto text-xs text-muted-foreground">{tabularFiles.length}</span>}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm"><DownloadSimple className="mr-1.5 h-4 w-4" /> Save <CaretDown className="ml-1 h-3.5 w-3.5" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60">
            {phase === "chart" && (
              <DropdownMenuItem onClick={() => setSaveChartOpen(true)}>
                <ChartLine className="mr-2 h-4 w-4" /> Save chart to data files
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => setTemplatesOpen(true)}>
              <SquaresFour className="mr-2 h-4 w-4" /> Save as template…
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => downloadSnapshotAsXlsxFile(liveSnapshot, "analysis.xlsx")}>
              <DownloadSimple className="mr-2 h-4 w-4" /> Export data (.xlsx)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={saveAnalysis}>
              <FloppyDisk className="mr-2 h-4 w-4" /> Save analysis (.n9a)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="outline" size="sm" onClick={() => setTemplatesOpen(true)}><SquaresFour className="mr-1.5 h-4 w-4" /> Templates</Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setFullscreen((v) => !v)}
          title={fullscreen ? "Leave full screen (Esc)" : "Use the whole window"}
        >
          {fullscreen ? (
            <><ArrowsInSimple className="mr-1.5 h-4 w-4" /> Exit full screen</>
          ) : (
            <><ArrowsOutSimple className="mr-1.5 h-4 w-4" /> Full screen</>
          )}
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">{table.rows.length} rows · {table.columns.length} cols</span>
      </div>

      {/* Maximized data editor — full ribbon, full width, for heavy editing */}
      {dataMax && (
        <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card/80 shadow-sm backdrop-blur-sm">
          <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
            <TableIcon className="h-4 w-4 text-[var(--n9-accent,#965034)]" />
            <span className="text-sm font-semibold">Data editor</span>
            <span className="text-[11px] text-muted-foreground">{table.rows.length} rows · {table.columns.length} cols · edits flow to every view</span>
            <button onClick={toggleDataMax} className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              <ArrowsInSimple className="h-4 w-4" /> Done
            </button>
          </div>
          <div className="p-2">
            <SheetHost mountSnapshot={mountSnapshot} mountKey={mountKey} onPersist={setLiveSnapshot} onSelectionChange={setSheetSel} heightClass="h-[calc(100vh-13rem)]" compact={false} />
          </div>
        </div>
      )}

      {/* The spec-driven workspace takes the whole area: it brings its own docks
          (data, statistics, settings) and its own analysis tabs, so nesting it
          inside this page's rails would give two sets of the same chrome. It
          reads the sheet loaded above, so both phases analyse one dataset. */}
      {!dataMax && phase === "workspace" && (
        <div className="flex min-h-[calc(100vh-24rem)] flex-col">
          <LayoutCanvas
            layout={figureLayout}
            pipelines={layoutPipelines}
            onChange={setFigureLayout}
            className="flex-1"
          />
        </div>
      )}

      {/* Data dock (left) · canvas (centre) · settings dock (right).
          The docks are the shared primitive from the spec-driven workspace, so
          both surfaces collapse, drag-resize and remember their widths the same
          way. On a narrow viewport `wide` is false and they stack full-width,
          where dragging a rail edge would be meaningless. */}
      {!dataMax && phase !== "workspace" && (
      <div className={cn("flex min-h-0 flex-col gap-1.5", wide && "xl:flex-row xl:items-stretch")}>
        {wide && !docks.layout.left.open && (
          <DockTab
            side="left"
            label="Data"
            icon={<TableIcon className="h-3.5 w-3.5" />}
            onOpen={() => docks.setOpen("left", true)}
          />
        )}
        {wide ? (
          <Dock
            side="left"
            open={docks.layout.left.open}
            size={docks.layout.left.size}
            onToggle={() => docks.toggle("left")}
            onResize={(s) => docks.resize("left", s)}
            title="Data"
            icon={<TableIcon className="h-3.5 w-3.5 text-muted-foreground" />}
            /* This page scrolls rather than filling the viewport, so the dock
               has to state its own height; without one the sheet inside it
               stretches to its full row count and the page grows to match. */
            className="h-[620px]"
            bodyClassName="overflow-hidden"
            actions={
              <button
                onClick={toggleDataMax}
                title="Maximize data editor"
                className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ArrowsOutSimple className="h-4 w-4" />
              </button>
            }
          >
            {/* The sheet stays mounted through a collapse: remounting Univer
                would drop the user's cursor and selection. */}
            <div className="h-full p-2">
              <SheetHost mountSnapshot={mountSnapshot} mountKey={mountKey} onPersist={setLiveSnapshot} onSelectionChange={setSheetSel} heightClass="h-full" compact />
            </div>
          </Dock>
        ) : (
          <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card/80 shadow-sm backdrop-blur-sm">
            <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
              <TableIcon className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold">Data</span>
              <button onClick={toggleDataMax} title="Maximize data editor" className="ml-auto rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                <ArrowsOutSimple className="h-4 w-4" />
              </button>
            </div>
            <div className="p-2">
              <SheetHost mountSnapshot={mountSnapshot} mountKey={mountKey} onPersist={setLiveSnapshot} onSelectionChange={setSheetSel} heightClass="h-[560px]" compact />
            </div>
          </div>
        )}

        {/* Canvas — always visible */}
        <div className="min-w-0 flex-1">
          <motion.div key={phase} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            {canvasForPhase}
          </motion.div>
        </div>

        {wide ? (
          <Dock
            side="right"
            open={docks.layout.right.open}
            size={docks.layout.right.size}
            onToggle={() => docks.toggle("right")}
            onResize={(s) => docks.resize("right", s)}
            title={`${activePhase.label} settings`}
            icon={<ActiveIcon className="h-3.5 w-3.5 text-muted-foreground" weight="fill" />}
            className="h-[620px] xl:sticky xl:top-4"
          >
            <div className="p-4">{settingsForPhase}</div>
          </Dock>
        ) : (
          <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card/80 shadow-sm backdrop-blur-sm">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <ActiveIcon className="h-4 w-4 text-muted-foreground" weight="fill" />
              <span className="text-sm font-semibold">{activePhase.label} settings</span>
            </div>
            <div className="p-4">{settingsForPhase}</div>
          </div>
        )}
        {wide && !docks.layout.right.open && (
          <DockTab
            side="right"
            label="Settings"
            icon={<ActiveIcon className="h-3.5 w-3.5" weight="fill" />}
            onOpen={() => docks.setOpen("right", true)}
          />
        )}
      </div>
      )}

      {/* Import from the Notes9 library */}
      <Dialog open={libraryOpen} onOpenChange={setLibraryOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Import from your data files</DialogTitle>
            <DialogDescription>Load a spreadsheet or CSV you&rsquo;ve uploaded to an experiment straight into the analysis workspace.</DialogDescription>
          </DialogHeader>
          <div className="relative">
            <MagnifyingGlass className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={librarySearch} onChange={(e) => setLibrarySearch(e.target.value)} placeholder="Search files…" className="pl-8" />
          </div>
          <div className="max-h-[50vh] space-y-1 overflow-y-auto">
            {tabularFiles
              .filter((f) => {
                const q = librarySearch.toLowerCase()
                return !q || f.file_name.toLowerCase().includes(q) || (f.experiment_name ?? "").toLowerCase().includes(q) || (f.project_name ?? "").toLowerCase().includes(q)
              })
              .map((f) => (
                <button
                  key={f.id}
                  onClick={() => loadLibraryFile(f)}
                  disabled={loadingFileId != null}
                  className="flex w-full items-center gap-3 rounded-lg border border-border px-3 py-2 text-left transition-colors hover:bg-muted/50 disabled:opacity-50"
                >
                  <TableIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{f.file_name}</div>
                    <div className="truncate text-xs text-muted-foreground">{f.experiment_name ?? "—"}{f.project_name ? ` · ${f.project_name}` : ""}</div>
                  </div>
                  <span className="shrink-0 text-xs font-medium text-[var(--n9-accent,#965034)]">{loadingFileId === f.id ? "Loading…" : "Load"}</span>
                </button>
              ))}
            {tabularFiles.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">No spreadsheet or CSV files in your library yet.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Templates gallery (modern, server-backed) */}
      <TemplatesDialog
        open={templatesOpen}
        onOpenChange={setTemplatesOpen}
        onApplyBuiltin={applyTemplate}
        onApplyConfig={(c, p) => applyConfig({ ...c, phase: p })}
        getCurrentConfig={() => ({ config: buildConfig(), phase })}
      />

      {/* Save the current chart into the data-files library */}
      <SaveChartDialog
        open={saveChartOpen}
        onOpenChange={setSaveChartOpen}
        projects={projects}
        experiments={experiments}
        defaultName={title}
        getPng={getChartPng}
        onSaved={() => router.refresh()}
      />
    </div>
  )
}

function PaneHeader({ Icon, title, children }: { Icon: React.ComponentType<{ className?: string }>; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span className="text-sm font-semibold">{title}</span>
      {children}
    </div>
  )
}
/** The rail's sections, in the order they appear, for the jump bar. */
const RAIL_SECTIONS: { id: string; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "cs-type", label: "Chart type", Icon: FnIcon },
  { id: "cs-data", label: "Data and axes assignment", Icon: TableIcon },
  { id: "cs-title", label: "Text — titles, labels and typography", Icon: TextAa },
  { id: "cs-palette", label: "Colour — palette and series style", Icon: Palette },
  { id: "cs-toggles", label: "Display", Icon: SlidersHorizontal },
  { id: "cs-error", label: "Error bars and annotations", Icon: TrendUp },
  { id: "cs-axes", label: "Axes", Icon: Ruler },
  { id: "cs-export", label: "Export figure", Icon: DownloadSimple },
]

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">{children}</div>
}
function RangeRow({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-foreground/70">{value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[var(--n9-accent,#965034)]" />
    </div>
  )
}
/** Coerce a palette/hex color to a 6-digit hex the native color input accepts. */
function toHex(c: string): string {
  return /^#[0-9a-f]{6}$/i.test(c) ? c : "#000000"
}
/** Action button in the "From the sheet" pane. When `active`, the target
    already holds this value, so it reads as done (accent fill + check). */
function BindBtn({ icon: Icon, label, active, disabled, onClick }: { icon: React.ComponentType<{ className?: string }>; label: string; active?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        active
          ? "border-[var(--n9-accent,#965034)] bg-[var(--n9-accent,#965034)] text-white"
          : "border-input bg-background text-foreground hover:border-[var(--n9-accent,#965034)]/40 hover:bg-[var(--n9-accent,#965034)]/[0.06]",
      )}
    >
      {active ? <Check className="h-3.5 w-3.5" weight="bold" /> : <Icon className="h-3.5 w-3.5" />}
      {label}
    </button>
  )
}
function AssignBtn({ active, disabled, onClick, children }: { active: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-6 w-6 items-center justify-center rounded-md border text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-30",
        active ? "border-transparent bg-[var(--n9-accent,#965034)] text-white" : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}
/** Native <select> styled to look modern, with a Phosphor chevron — no shadcn. */
function NativeSelect({ value, onChange, className, children }: { value: string; onChange: (v: string) => void; className?: string; children: React.ReactNode }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn("h-9 w-full appearance-none rounded-lg border border-input bg-background pl-3 pr-8 text-sm outline-none transition-colors hover:border-border focus:border-[var(--n9-accent,#965034)]/50 focus:ring-2 focus:ring-[var(--n9-accent,#965034)]/20", className)}
      >
        {children}
      </select>
      <CaretDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
    </div>
  )
}

const DASH_DASHARRAY: Record<string, string> = { solid: "", dash: "6 3", dot: "1.5 3", dashdot: "6 3 1.5 3" }
/** Segmented control for the line dash style, each option a live line preview. */
function DashPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {DASH_OPTIONS.map((d) => {
        const active = (value || "solid") === d
        return (
          <button
            key={d}
            type="button"
            onClick={() => onChange(d)}
            title={d}
            className={cn(
              "flex h-9 items-center justify-center rounded-lg border transition-colors",
              active ? "border-[var(--n9-accent,#965034)] bg-[var(--n9-accent,#965034)]/10 text-[var(--n9-accent,#965034)]" : "border-input bg-background text-muted-foreground hover:border-border",
            )}
          >
            <svg width="30" height="8" viewBox="0 0 30 8">
              <line x1="1" y1="4" x2="29" y2="4" stroke="currentColor" strokeWidth="2" strokeDasharray={DASH_DASHARRAY[d]} strokeLinecap="round" />
            </svg>
          </button>
        )
      })}
    </div>
  )
}

function markerGlyph(m: string) {
  switch (m) {
    case "square": return <rect x="2.5" y="2.5" width="7" height="7" />
    case "diamond": return <path d="M6 1.5 L10.5 6 L6 10.5 L1.5 6 Z" />
    case "triangle-up": return <path d="M6 2 L10.5 10 L1.5 10 Z" />
    case "cross": return <path d="M4.5 1.8 h3 v2.7 h2.7 v3 h-2.7 v2.7 h-3 v-2.7 h-2.7 v-3 h2.7 Z" />
    case "x": return <path d="M3 3 L9 9 M9 3 L3 9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    case "star": return <path d="M6 1 L7.15 4.3 L10.6 4.4 L7.85 6.5 L8.8 9.9 L6 7.9 L3.2 9.9 L4.15 6.5 L1.4 4.4 L4.85 4.3 Z" />
    default: return <circle cx="6" cy="6" r="3.8" />
  }
}
/** Glyph grid for the marker shape, each option rendered as its true shape. */
function MarkerPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {MARKER_OPTIONS.map((m) => {
        const active = (value || "circle") === m
        return (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            title={m.replace("-", " ")}
            className={cn(
              "flex h-9 items-center justify-center rounded-lg border transition-colors",
              active ? "border-[var(--n9-accent,#965034)] bg-[var(--n9-accent,#965034)]/10 text-[var(--n9-accent,#965034)]" : "border-input bg-background text-muted-foreground hover:border-border",
            )}
          >
            <svg width="14" height="14" viewBox="0 0 12 12" fill="currentColor">{markerGlyph(m)}</svg>
          </button>
        )
      })}
    </div>
  )
}
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-2 text-sm text-foreground">
      <span>{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} className="data-[state=checked]:bg-[var(--n9-accent,#965034)]" />
    </label>
  )
}
