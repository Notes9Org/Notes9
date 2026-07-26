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
  DotsThree,
  FolderOpen,
  FloppyDisk,
  MagnifyingGlass,
  SquaresFour,
  Cube,
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
import { openCatalystPanel } from "@/lib/catalyst-launch"
import type { ExportFormat } from "@/lib/data-analysis/chart-export"
import { useStatsPanel, type Table } from "@/components/data-analysis/stats-panel"
import { useStandardCurve } from "@/components/data-analysis/standard-curve-panel"
import { usePlate, usePlateModel } from "@/components/data-analysis/plate-view"
import { TemplatesDialog } from "@/components/data-analysis/templates-dialog"
import { SaveChartDialog } from "@/components/data-analysis/save-chart-dialog"
import { detectDataKind } from "@/lib/data-analysis/detect"
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
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
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

/* ── Chart types ────────────────────────────────────────────────────────── */
type ChartType =
  | "line" | "scatter" | "bar" | "barStacked" | "barH" | "area"
  | "box" | "violin" | "histogram" | "bubble" | "pie"
  | "scatter3d" | "mesh3d"

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
  { id: "scatter3d", label: "3D Scatter", Icon: Cube, group: "3D" },
  { id: "mesh3d", label: "3D Mesh", Icon: Cube, group: "3D" },
]

const is3D = (t: ChartType) => t === "scatter3d" || t === "mesh3d"

const PALETTES: Record<string, string[]> = {
  "Okabe–Ito": ["#0072B2", "#D55E00", "#009E73", "#CC79A7", "#E69F00", "#56B4E9", "#F0E442"],
  Notes9: ["#965034", "#c07b5a", "#8f9f86", "#7a8fa7", "#c5a46d", "#9b4722"],
  Viridis: ["#440154", "#3b528b", "#21908d", "#5dc863", "#fde725", "#27ad81"],
  Grayscale: ["#111111", "#555555", "#888888", "#aaaaaa", "#cccccc"],
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

type Phase = "chart" | "stats" | "curve" | "plate"

const PHASES: { id: Phase; label: string; Icon: React.ComponentType<{ className?: string; weight?: "regular" | "bold" | "fill" }> }[] = [
  { id: "chart", label: "Chart", Icon: ChartLine },
  { id: "stats", label: "Statistics", Icon: Sigma },
  { id: "curve", label: "Standard curve", Icon: TrendUp },
  { id: "plate", label: "Plate", Icon: GridNine },
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
  const [dataOpen, setDataOpen] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(true)
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
  const [showAllTabs, setShowAllTabs] = useState(false)
  const visiblePhases = useMemo(
    () =>
      PHASES.filter(
        (p) =>
          p.id === "chart" ||
          p.id === "stats" ||
          showAllTabs ||
          (p.id === "curve" && detected.standardCurve) ||
          (p.id === "plate" && detected.plate),
      ),
    [detected, showAllTabs],
  )
  useEffect(() => {
    if (!visiblePhases.some((p) => p.id === phase)) setPhase("chart")
  }, [visiblePhases, phase])

  /* chart config */
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
  const [showGrid, setShowGrid] = useState(true)
  const [showLegend, setShowLegend] = useState(true)
  const [markers, setMarkers] = useState(true)
  const [paletteName, setPaletteName] = useState("Okabe–Ito")

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
  const setStyle = useCallback((series: string, patch: Partial<SeriesStyle>) => {
    setSeriesStyles((prev) => ({ ...prev, [series]: { ...prev[series], ...patch } }))
  }, [])

  // Publication export
  const chartExportRef = useRef<ChartExportFn | null>(null)
  const chartImageRef = useRef<(() => Promise<string | null>) | null>(null)
  const [saveChartOpen, setSaveChartOpen] = useState(false)
  const [exFormat, setExFormat] = useState<ExportFormat>("png")
  const [exDpi, setExDpi] = useState(600)
  const [exporting, setExporting] = useState(false)
  const doExport = useCallback(async () => {
    if (!chartExportRef.current) return
    setExporting(true)
    try {
      await chartExportRef.current({ format: exFormat, dpi: exDpi, filename: (title || "figure").replace(/\s+/g, "-").toLowerCase() })
    } finally {
      setExporting(false)
    }
  }, [exFormat, exDpi, title])

  const seededRef = useRef(false)
  if (!seededRef.current && table.columns.length) {
    seededRef.current = true
    setXKey(table.columns[0])
    setYKeys(numericCols.filter((c) => c !== table.columns[0]).slice(0, 2))
  }

  const palette = PALETTES[paletteName] ?? PALETTES["Okabe–Ito"]
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
    return activeY.map((k, i) => {
      const st = seriesStyles[k] ?? {}
      const color = st.color ?? palette[i % palette.length]
      const opacity = st.opacity ?? 1
      const yaxis = st.axis === "y2" ? "y2" : "y"
      const y = rows.map((r) => Number(r[k]))
      if (chartType === "bar" || chartType === "barStacked") return { type: "bar", x, y, name: k, opacity, yaxis, marker: { color } }
      if (chartType === "barH") return { type: "bar", orientation: "h", y: x, x: y, name: k, opacity, marker: { color } }
      if (chartType === "area") return { type: "scatter", mode: "lines", fill: "tozeroy", x, y, name: k, opacity, yaxis, line: { color, width: st.width ?? 2, dash: st.dash ?? "solid" } }
      if (chartType === "scatter") return { type: "scatter", mode: "markers", x, y, name: k, opacity, yaxis, marker: { color, size: st.size ?? 9, symbol: st.marker ?? "circle" } }
      if (chartType === "bubble") {
        const sizes = sizeKey ? rows.map((r) => Number(r[sizeKey])) : y
        const mx = Math.max(...sizes.map((s) => Math.abs(s)), 1)
        return { type: "scatter", mode: "markers", x, y, name: k, opacity, yaxis, marker: { color, symbol: st.marker ?? "circle", size: sizes.map((s) => 8 + (Math.abs(s) / mx) * 34), sizemode: "diameter" } }
      }
      return { type: "scatter", mode: lineMode, x, y, name: k, opacity, yaxis, line: { color, width: st.width ?? 2.5, dash: st.dash ?? "solid" }, marker: { color, size: st.size ?? 7, symbol: st.marker ?? "circle" } }
    })
  }, [rows, xKey, activeY, zKey, chartType, palette, markers, sizeKey, table.rows, seriesStyles])

  const plotLayout = useMemo<Record<string, unknown>>(() => {
    const horizontal = chartType === "barH"
    const num = (s: string) => (s.trim() !== "" && isFinite(Number(s)) ? Number(s) : null)
    const xRange = num(xMin) != null && num(xMax) != null ? [num(xMin), num(xMax)] : undefined
    const yRange = num(yMin) != null && num(yMax) != null ? [num(yMin), num(yMax)] : undefined
    const tickN = num(nticks) ?? undefined
    return {
      title: { text: title, font: { size: titleSize, color: ink } },
      margin: { t: 48, r: 20, b: 60, l: 70 },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      font: { family: fontFamily, color: ink, size: 12 },
      colorway: palette,
      xaxis: {
        title: { text: horizontal ? yAxisLabel : xAxisLabel, font: { size: axisTitleSize } },
        showgrid: showGrid, gridcolor: gridColor, zeroline: false,
        type: (chartType === "bar" || chartType === "barStacked") ? "category" : horizontal && yLog ? "log" : "-",
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
      legend: { orientation: "h", y: -0.22 },
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
  }, [title, ink, palette, xAxisLabel, yAxisLabel, showGrid, gridColor, chartType, yLog, showLegend, xMin, xMax, yMin, yMax, nticks, fontFamily, titleSize, axisTitleSize, zKey, activeY, seriesStyles])

  // Edits made directly on the chart (double-click title / axis) flow back here.
  const handleChartEdit = useCallback((e: PlotlyEdits) => {
    if (e.title != null) setTitle(e.title)
    if (e.xLabel != null) { setXLabel(e.xLabel); setXUnit("") }
    if (e.yLabel != null) { setYLabel(e.yLabel); setYUnit("") }
  }, [])

  // Right-click "Edit ▸ <element>" (or double-click an element) opens the
  // inspector scrolled to that section; a clicked series selects itself.
  const [flashId, setFlashId] = useState<string | null>(null)
  const onEditElement = useCallback(
    (el: ChartElement, detail?: { series?: string }) => {
      const section: Record<ChartElement, string> = {
        title: "cs-title", xaxis: "cs-axes", yaxis: "cs-axes",
        series: "cs-series", legend: "cs-toggles", annotation: "cs-toggles",
      }
      if (el === "series" && detail?.series) setEditSeries(detail.series)
      setSettingsOpen(true)
      const id = section[el]
      setFlashId(id)
      requestAnimationFrame(() =>
        requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })),
      )
      window.setTimeout(() => setFlashId(null), 1500)
    },
    [],
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
      { label: "Change chart type", items: CHART_TYPES.map((t) => ({ label: t.label, onClick: () => setChartType(t.id) })) },
      { label: "Palette", items: Object.keys(PALETTES).map((p) => ({ label: p, onClick: () => setPaletteName(p) })) },
    ],
    [askCatalyst],
  )

  const hasPlot = activeY.length > 0 && plotData.length > 0

  // Feature hooks (called unconditionally; each renders lazily where placed).
  // The plate model is shared so the plate layout drives the standard curve.
  const plateModel = usePlateModel(grid)
  const stats = useStatsPanel(table, numericCols)
  const curve = useStandardCurve(table, numericCols, plateModel)
  const plate = usePlate(plateModel)

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
    plate: { format: plateModel.format, originRow: plateModel.originRow, originCol: plateModel.originCol, roleOverrides: plateModel.roleOverrides, annOverrides: plateModel.annOverrides },
    phase,
  })
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
    if (c.plate) {
      if (c.plate.format) plateModel.setFormat(c.plate.format)
      if (typeof c.plate.originRow === "number") plateModel.setOriginRow(c.plate.originRow)
      if (typeof c.plate.originCol === "number") plateModel.setOriginCol(c.plate.originCol)
      if (c.plate.roleOverrides || c.plate.annOverrides) plateModel.applyOverrides(c.plate.roleOverrides ?? {}, c.plate.annOverrides ?? {})
    }
    if (c.phase) setPhase(c.phase)
    seededRef.current = true // config supplies the mappings; don't auto-seed over them
  }, [plateModel])

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
      if (t.aoa) loadSnapshot(buildSnapshotFromAoa(t.aoa, t.name.slice(0, 28), `${t.name}.xlsx`))
      applyConfig({ ...t.config, phase: t.phase })
      toast.success(`Applied “${t.name}”`)
    },
    [loadSnapshot, applyConfig],
  )

  const chartCanvas = (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card/80 shadow-sm backdrop-blur-sm">
      <PaneHeader Icon={ChartLine} title="Chart">
        <span className="ml-auto hidden text-[11px] text-muted-foreground sm:block">Double-click title / axes to edit · drag to move · menu → SVG</span>
      </PaneHeader>
      <div className="p-2">
        <div className="h-[560px] w-full">
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
      {/* Bind the selected sheet cell → chart title / axis / series */}
      {sheetSel && (sheetSel.text !== "" || selColumn) && (
        <div className="rounded-xl border border-[var(--n9-accent,#965034)]/25 bg-[var(--n9-accent,#965034)]/[0.06] p-3">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--n9-accent,#965034)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--n9-accent,#965034)]" />
            Selected cell {sheetSel.a1}
          </div>
          <div className="truncate text-sm font-medium">{sheetSel.text || "(empty)"}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <ApplyChip onClick={() => setTitle(sheetSel.text)} disabled={!sheetSel.text}>Chart title</ApplyChip>
            <ApplyChip onClick={() => { setXLabel(sheetSel.text); setXUnit("") }} disabled={!sheetSel.text}>X title</ApplyChip>
            <ApplyChip onClick={() => { setYLabel(sheetSel.text); setYUnit("") }} disabled={!sheetSel.text}>Y title</ApplyChip>
            {selColumn && <ApplyChip onClick={() => setXKey(selColumn)}>X = {selColumn}</ApplyChip>}
            {selColumn && selNumeric && (
              <ApplyChip onClick={() => setYKeys((p) => (p.includes(selColumn) ? p : [...p, selColumn]))}>+ Y = {selColumn}</ApplyChip>
            )}
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">Click a cell in the sheet, then apply it here.</p>
        </div>
      )}
      <div>
        <SectionLabel><FnIcon className="h-3.5 w-3.5" /> Chart type</SectionLabel>
        <div className="grid grid-cols-4 gap-1.5">
          {CHART_TYPES.map((t) => (
            <button key={t.id} onClick={() => setChartType(t.id)} title={t.label}
              className={cn("flex flex-col items-center gap-1 rounded-lg border p-2 text-[10px] transition-colors",
                chartType === t.id ? "border-[var(--n9-accent,#965034)]/40 bg-[var(--n9-accent,#965034)]/10 text-[var(--n9-accent,#965034)]" : "border-border text-muted-foreground hover:text-foreground")}>
              <t.Icon className="h-4 w-4" weight="bold" /> {t.label}
            </button>
          ))}
        </div>
      </div>
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
      </Field>
      {chartType === "bubble" && (
        <Field label="Bubble size (column)">
          <NativeSelect value={sizeKey || "__y__"} onChange={(v) => setSizeKey(v === "__y__" ? "" : v)}>
            <option value="__y__">Same as Y</option>
            {numericCols.map((c) => (<option key={c} value={c}>{c}</option>))}
          </NativeSelect>
        </Field>
      )}
      <div id="cs-title" className={cn("space-y-4 rounded-lg transition-shadow", flashId === "cs-title" && "ring-2 ring-[var(--n9-accent,#965034)]/40")}>
        <Field label="Chart title"><Input className="h-9" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="X label"><Input className="h-9" value={xLabel} onChange={(e) => setXLabel(e.target.value)} /></Field>
          <Field label="X unit"><Input className="h-9" value={xUnit} onChange={(e) => setXUnit(e.target.value)} /></Field>
          <Field label="Y label"><Input className="h-9" value={yLabel} onChange={(e) => setYLabel(e.target.value)} /></Field>
          <Field label="Y unit"><Input className="h-9" value={yUnit} onChange={(e) => setYUnit(e.target.value)} /></Field>
        </div>
      </div>
      <Field label="Palette">
        <div className="grid grid-cols-2 gap-1.5">
          {Object.entries(PALETTES).map(([name, colors]) => (
            <button
              key={name}
              onClick={() => setPaletteName(name)}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-2 py-1.5 transition-colors",
                paletteName === name ? "border-[var(--n9-accent,#965034)]/50 bg-[var(--n9-accent,#965034)]/10" : "border-border hover:bg-muted/40",
              )}
            >
              <span className="flex">
                {colors.slice(0, 5).map((c, i) => (
                  <span key={i} className="-ml-0.5 h-3.5 w-3.5 rounded-full border border-background first:ml-0" style={{ background: c }} />
                ))}
              </span>
              <span className="truncate text-[11px] font-medium">{name}</span>
            </button>
          ))}
        </div>
      </Field>
      <div id="cs-toggles" className={cn("flex flex-col gap-2.5 border-t border-border pt-3 text-sm transition-shadow", flashId === "cs-toggles" && "rounded-lg ring-2 ring-[var(--n9-accent,#965034)]/40")}>
        <Toggle label="Show markers" checked={markers} onChange={setMarkers} />
        <Toggle label="Log Y axis" checked={yLog} onChange={setYLog} />
        <Toggle label="Gridlines" checked={showGrid} onChange={setShowGrid} />
        <Toggle label="Legend" checked={showLegend} onChange={setShowLegend} />
      </div>

      {/* Per-series style inspector */}
      {activeY.length > 0 && (
        <div id="cs-series" className={cn("border-t border-border pt-3 transition-shadow", flashId === "cs-series" && "rounded-lg ring-2 ring-[var(--n9-accent,#965034)]/40")}>
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

      {/* Axes */}
      <div id="cs-axes" className={cn("border-t border-border pt-3 transition-shadow", flashId === "cs-axes" && "rounded-lg ring-2 ring-[var(--n9-accent,#965034)]/40")}>
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
      <div className="border-t border-border pt-3">
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

      {/* Publication export */}
      <div className="border-t border-border pt-3">
        <SectionLabel><DownloadSimple className="h-3.5 w-3.5" /> Export figure</SectionLabel>
        <div className="grid grid-cols-4 gap-1.5">
          {(["png", "jpeg", "tiff", "svg"] as ExportFormat[]).map((f) => (
            <button key={f} onClick={() => setExFormat(f)}
              className={cn("rounded-md border py-1.5 text-[11px] font-medium uppercase transition-colors",
                exFormat === f ? "border-[var(--n9-accent,#965034)]/40 bg-[var(--n9-accent,#965034)]/10 text-[var(--n9-accent,#965034)]" : "border-border text-muted-foreground hover:text-foreground")}>
              {f === "jpeg" ? "JPG" : f}
            </button>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <div className={cn("inline-flex flex-1 rounded-lg border border-border bg-background p-0.5 text-xs", exFormat === "svg" && "pointer-events-none opacity-40")}>
            {[300, 600].map((d) => (
              <button key={d} onClick={() => setExDpi(d)}
                className={cn("flex-1 rounded-md px-2 py-1 font-medium transition-colors", exDpi === d ? "bg-[var(--n9-accent,#965034)] text-white" : "text-muted-foreground hover:text-foreground")}>
                {d} dpi
              </button>
            ))}
          </div>
        </div>
        <button onClick={doExport} disabled={!hasPlot || exporting}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--n9-accent,#965034)] px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50">
          <DownloadSimple className="h-4 w-4" /> {exporting ? "Rendering…" : exFormat === "svg" ? "Download SVG (vector)" : `Download ${exFormat === "jpeg" ? "JPG" : exFormat.toUpperCase()} · ${exDpi} dpi`}
        </button>
        <p className="mt-1.5 text-[11px] text-muted-foreground">TIFF & PNG embed the DPI for print; SVG is vector (scale-free). Or use the chart menu’s camera icon.</p>
      </div>
    </div>
  )

  const canvasForPhase = phase === "chart" ? chartCanvas : phase === "stats" ? stats.canvas : phase === "curve" ? curve.canvas : plate.canvas
  const settingsForPhase = phase === "chart" ? chartSettings : phase === "stats" ? stats.settings : phase === "curve" ? curve.settings : plate.settings
  const activePhase = PHASES.find((p) => p.id === phase)!
  const ActiveIcon = activePhase.Icon

  return (
    <div className="flex flex-col gap-4">
      <CatalystSectionHero scope="lab" placeholder="Ask Catalyst to analyze your data, pick a chart, or explain a result…" />

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
                      {auto && !showAllTabs && (
                        <span
                          title="Surfaced automatically for your data"
                          className="ml-0.5 h-1.5 w-1.5 rounded-full bg-[var(--n9-accent,#965034)]"
                        />
                      )}
                    </TabsTrigger>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </TabsList>
        </Tabs>
        {visiblePhases.length < PHASES.length && (
          <button
            onClick={() => setShowAllTabs(true)}
            title="Show all analysis tools"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <DotsThree className="h-4 w-4" weight="bold" />
          </button>
        )}
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

      {/* 3-pane: Data rail (left) · canvas (center) · settings rail (right) */}
      {!dataMax && (
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
        {/* Data rail — sheet stays mounted; only the rail width animates */}
        <motion.aside
          initial={false}
          animate={{ width: wide ? (dataOpen ? DATA_W : 0) : "100%", opacity: dataOpen || !wide ? 1 : 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 36 }}
          className="shrink-0 overflow-hidden"
        >
          <div style={{ width: wide ? DATA_W : "100%" }} className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card/80 shadow-sm backdrop-blur-sm">
            <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
              {wide ? (
                <button onClick={() => setDataOpen(false)} title="Hide data" className="-ml-1 flex items-center gap-2 rounded-md px-1 py-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                  <TableIcon className="h-4 w-4" />
                  <span className="text-sm font-semibold text-foreground">Data</span>
                  <CaretLeft className="h-3.5 w-3.5" />
                </button>
              ) : (
                <><TableIcon className="h-4 w-4 text-muted-foreground" /><span className="text-sm font-semibold">Data</span></>
              )}
              <button onClick={toggleDataMax} title="Maximize data editor" className="ml-auto rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                <ArrowsOutSimple className="h-4 w-4" />
              </button>
            </div>
            <div className="p-2">
              <SheetHost mountSnapshot={mountSnapshot} mountKey={mountKey} onPersist={setLiveSnapshot} onSelectionChange={setSheetSel} heightClass="h-[560px]" compact />
            </div>
          </div>
        </motion.aside>

        {/* Collapsed Data rail — the data symbol reopens it */}
        {wide && !dataOpen && (
          <button onClick={() => setDataOpen(true)} className="group flex h-[620px] shrink-0 flex-col items-center gap-2 rounded-2xl border border-border bg-card/70 px-2 py-3 text-muted-foreground shadow-sm transition-colors hover:bg-card hover:text-foreground" title="Show data">
            <TableIcon className="h-5 w-5 text-[var(--n9-accent,#965034)]" />
            <CaretRight className="h-4 w-4" />
            <span className="mt-1 text-[11px] font-medium [writing-mode:vertical-rl]">Data</span>
          </button>
        )}

        {/* Canvas — always visible */}
        <div className="min-w-0 flex-1">
          <motion.div key={phase} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            {canvasForPhase}
          </motion.div>
        </div>

        {/* Settings rail — collapsible */}
        {wide && !settingsOpen && (
          <button onClick={() => setSettingsOpen(true)} className="flex h-[620px] shrink-0 flex-col items-center gap-2 rounded-2xl border border-border bg-card/70 px-2 py-3 text-muted-foreground shadow-sm transition-colors hover:bg-card hover:text-foreground" title={`Show ${activePhase.label} settings`}>
            <ActiveIcon className="h-5 w-5 text-[var(--n9-accent,#965034)]" weight="fill" />
            <CaretLeft className="h-4 w-4" />
            <span className="mt-1 text-[11px] font-medium [writing-mode:vertical-rl]">Settings</span>
          </button>
        )}
        <motion.aside
          initial={false}
          animate={{ width: wide ? (settingsOpen ? SET_W : 0) : "100%", opacity: settingsOpen || !wide ? 1 : 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 36 }}
          className={cn("shrink-0 overflow-hidden", !settingsOpen && wide && "pointer-events-none")}
        >
          <div style={{ width: wide ? SET_W : "100%" }} className="flex h-[620px] flex-col overflow-hidden rounded-2xl border border-border bg-card/80 shadow-sm backdrop-blur-sm xl:sticky xl:top-4">
            <div className="flex items-center gap-2 border-b border-border bg-[var(--n9-accent,#965034)]/[0.06] px-4 py-3">
              <ActiveIcon className="h-4 w-4 text-[var(--n9-accent,#965034)]" weight="fill" />
              <span className="text-sm font-semibold">{activePhase.label}</span>
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">settings</span>
              {wide && (
                <button onClick={() => setSettingsOpen(false)} className="ml-auto rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"><CaretRight className="h-4 w-4" /></button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {settingsForPhase}
            </div>
          </div>
        </motion.aside>
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
        getPng={() => (chartImageRef.current ? chartImageRef.current() : Promise.resolve(null))}
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
function ApplyChip({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-md border border-[var(--n9-accent,#965034)]/30 bg-background px-2 py-0.5 text-[11px] font-medium text-[var(--n9-accent,#965034)] transition-colors hover:bg-[var(--n9-accent,#965034)]/12 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
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
