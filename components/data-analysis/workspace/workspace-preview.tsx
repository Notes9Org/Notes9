"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ChartBar, ChartLine, ChartScatter, Circle, GridFour } from "@phosphor-icons/react/ssr"

import { parseSpec, type AnalysisSpec } from "@/lib/data-analysis/spec/analysis-spec"
import { ENGINE_VERSION, type EngineResult } from "@/lib/data-analysis/engine/contract"
import {
  dispatchMutation,
  initHistory,
  canUndo as canUndoOf,
  canRedo as canRedoOf,
  undo as undoHistory,
  redo as redoHistory,
  requiresRecompute,
  type SpecHistory,
} from "@/lib/data-analysis/spec/mutations"

import { computeAnalysis, type EngineProgress } from "@/lib/data-analysis/engine/client"
import type { Table } from "@/lib/data-analysis/engine/resolver"
import {
  EMPTY_PIPELINES,
  activePipeline,
  pipelineReducer,
  type AnalysisPipeline,
  type PipelineState,
} from "@/lib/data-analysis/workspace/pipelines"
import {
  LAYOUT_PRESETS,
  assignPanel,
  layoutFromPreset,
  type FigureLayout,
} from "@/lib/data-analysis/render/figure-layout"
import { AnalysisWorkspace } from "./analysis-workspace"
import { LayoutCanvas } from "./layout-canvas"
import { PipelineTabs } from "./pipeline-tabs"
import { ChartTypeGrid, Field, InspectorSection } from "./inspector"
import { ExclusionDialog } from "./exclusion-dialog"
import { FigureCanvas } from "./figure-canvas"
import { TemplateCard } from "./workspace-toolbar"
import { UniverWorkbookView } from "@/components/spreadsheet/univer-workbook-view"
import * as XLSX from "xlsx"
import { buildSpreadsheetWorkbookSnapshot, snapshotToXlsxWorkbook } from "@/lib/spreadsheet-workbook"
import { hashTable, tableFromGrid } from "@/lib/data-analysis/workspace/bootstrap"
import { legalTests } from "@/lib/data-analysis/semantic/infer"
import {
  RESULTS_SHEET_NAME,
  buildResultsSheet,
  resultsSheetColumnWidths,
} from "@/lib/data-analysis/render/results-sheet"

/**
 * Fixture-driven preview of the workspace.
 *
 * Everything here is real except the engine call: the spec, the mutations, the
 * history and the provenance all flow through the actual layers, so what is
 * being reviewed is the true behaviour of the spec-driven path, not a mockup.
 * The EngineResult is a fixture only because Pyodide's first load is slow and
 * this page exists to review layout and motion.
 */

const FIXTURE_SPEC: AnalysisSpec = (() => {
  const parsed = parseSpec({
    schemaVersion: 1,
    dataset: {
      fileId: null,
      fileName: "viability_48h.xlsx",
      sheet: "Plate 1",
      versionHash: "sha256:9f2ac1d4e88b",
      rowCount: 24,
      columnCount: 3,
    },
    /* Roles name the columns exactly as they appear in the sheet. The renderer
       looks plot rows up by these names, so a spec that referred to them by any
       other spelling would silently draw an empty figure. */
    roles: [
      { column: "Treatment", role: "group", unit: null, source: "project-record", confidence: null },
      { column: "Viability", role: "response", unit: "%", source: "inferred", confidence: 0.94 },
    ],
    design: { source: "project-record", paired: false, replicateType: "biological" },
    analysis: {
      test: "anova-one-way",
      postHoc: "tukey",
      groupColumn: "Treatment",
      responseColumns: ["Viability"],
      alpha: 0.05,
    },
    figure: {
      kind: "bar-scatter-error",
      title: "Viability at 48 h",
      errorBars: "sem",
      x: { label: "Treatment" },
      y: { label: "Viability", unit: "%" },
    },
    export: {},
  })
  if (!parsed.ok) throw new Error("preview fixture invalid")
  return parsed.spec
})()

/**
 * The dataset behind everything on this page.
 *
 * A cell-viability dose series: three treatments, eight biological replicates
 * each. Scatter widens with dose, the way it actually does at the bench, so the
 * error bars and the assumption checks have something real to describe.
 *
 * These 24 rows are the single source for the preview. The workbook below is
 * built from them and the fixture result was produced by running them through
 * the real engine, so the figure, the sheet and the statistics all agree. A
 * preview whose chart disagreed with its own numbers would be exactly the
 * "picture, not a spec" failure the first architectural law rules out.
 */
const PREVIEW_ROWS: { well: string; treatment: string; viability: number }[] = [
  { well: "A1", treatment: "Vehicle", viability: 98.2 },
  { well: "A2", treatment: "Vehicle", viability: 94.7 },
  { well: "A3", treatment: "Vehicle", viability: 101.3 },
  { well: "A4", treatment: "Vehicle", viability: 96.5 },
  { well: "A5", treatment: "Vehicle", viability: 99.8 },
  { well: "A6", treatment: "Vehicle", viability: 93.4 },
  { well: "A7", treatment: "Vehicle", viability: 100.6 },
  { well: "A8", treatment: "Vehicle", viability: 95.1 },
  { well: "B1", treatment: "10 uM", viability: 82.4 },
  { well: "B2", treatment: "10 uM", viability: 74.1 },
  { well: "B3", treatment: "10 uM", viability: 79.8 },
  { well: "B4", treatment: "10 uM", viability: 88.6 },
  { well: "B5", treatment: "10 uM", viability: 71.3 },
  { well: "B6", treatment: "10 uM", viability: 84.9 },
  { well: "B7", treatment: "10 uM", viability: 77.2 },
  { well: "B8", treatment: "10 uM", viability: 80.5 },
  { well: "C1", treatment: "50 uM", viability: 58.1 },
  { well: "C2", treatment: "50 uM", viability: 47.6 },
  { well: "C3", treatment: "50 uM", viability: 63.4 },
  { well: "C4", treatment: "50 uM", viability: 52.9 },
  { well: "C5", treatment: "50 uM", viability: 41.8 },
  { well: "C6", treatment: "50 uM", viability: 66.2 },
  { well: "C7", treatment: "50 uM", viability: 55.3 },
  { well: "C8", treatment: "50 uM", viability: 49.7 },
]

const FIXTURE_RESULT: EngineResult = {
  engineVersion: ENGINE_VERSION,
  dataVersionHash: "sha256:9f2ac1d4e88b",
  specHash: "4c1f9a77b2d3e5081abc",
  computedAt: new Date().toISOString(),
  durationMs: 184,
  descriptives: [],
  test: {
    test: "One-way ANOVA",
    statistic: 105.41804742633528,
    df: "2, 21",
    pValue: 1.1191841239221155e-11,
    effectSizes: [
      { name: "eta-squared", value: 0.9094187640913066, ciLow: null, ciHigh: null },
    ],
    assumptions: [
      {
        name: "Normality (Shapiro-Wilk)",
        statistic: 0.9907,
        pValue: 0.9976,
        passed: true,
        verdict: "Residuals are consistent with a normal distribution.",
        alternative: null,
      },
      {
        name: "Equal variance (Levene)",
        statistic: 2.7373,
        pValue: 0.0878,
        passed: true,
        verdict: "Group variances are comparable.",
        alternative: null,
      },
    ],
    pairwise: [
      {
        groupA: "Vehicle",
        groupB: "10 uM",
        meanDifference: 17.6,
        ciLow: 10.081,
        ciHigh: 25.119,
        pValue: 2.137e-5,
        pAdjusted: 2.137e-5,
        correctionMethod: "tukey",
        significant: true,
      },
      {
        groupA: "Vehicle",
        groupB: "50 uM",
        meanDifference: 43.075,
        ciLow: 35.556,
        ciHigh: 50.594,
        pValue: 6.599e-12,
        pAdjusted: 6.599e-12,
        correctionMethod: "tukey",
        significant: true,
      },
      {
        groupA: "10 uM",
        groupB: "50 uM",
        meanDifference: 25.475,
        ciLow: 17.956,
        ciHigh: 32.994,
        pValue: 8.327e-8,
        pAdjusted: 8.327e-8,
        correctionMethod: "tukey",
        significant: true,
      },
    ],
    terms: [],
    groupSizes: { Vehicle: 8, "10 uM": 8, "50 uM": 8 },
    reportSentence:
      "One-way ANOVA: F(2, 21) = 105.418, p < 0.0001, η² = 0.909 (n = 24 across 3 groups). Post-hoc: tukey.",
  },
  curveFit: null,
  survival: null,
  testRan: null,
  error: null,
  exclusionImpact: null,
  plotData: PREVIEW_ROWS.map((r) => ({
    rowId: r.well,
    values: { Well: r.well, Treatment: r.treatment, Viability: r.viability },
    excluded: false,
  })),
  warnings: [],
}

/**
 * The sheet behind the figure. Built the same way the live workspace builds one
 * (aoa → SheetJS → Univer snapshot) so the preview exercises the real path.
 */
const PREVIEW_WORKBOOK = (() => {
  const aoa: (string | number)[][] = [
    ["Well", "Treatment", "Viability"],
    ...PREVIEW_ROWS.map((r) => [r.well, r.treatment, r.viability]),
  ]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Plate 1")
  return buildSpreadsheetWorkbookSnapshot("viability_48h.xlsx", wb)
})()

/**
 * The same 24 rows as a resolver Table.
 *
 * Running the live engine over this is what proves the whole chain, resolver,
 * worker, Pyodide, scipy, contract, renderer, rather than only the half of it
 * a fixture exercises.
 */
const PREVIEW_TABLE: Table = {
  columns: ["Well", "Treatment", "Viability"],
  rows: PREVIEW_ROWS.map((r) => ({
    rowId: r.well,
    values: { Well: r.well, Treatment: r.treatment, Viability: r.viability },
  })),
}

/**
 * A second, unrelated experiment.
 *
 * Present so the figure layout has something real to compose: a published
 * figure's panels almost always come from different experiments, and a layout
 * demonstrated with two views of one sheet would not show the thing that
 * actually matters, that panel B can be a different chart, of a different
 * design, from a different file.
 */
const GROWTH_ROWS: { well: string; strain: string; hours: number; od: number }[] = [
  ["WT", [0.05, 0.09, 0.21, 0.48, 0.92, 1.24, 1.41, 1.52]],
  ["Δmut", [0.05, 0.07, 0.13, 0.26, 0.44, 0.61, 0.7, 0.78]],
].flatMap(([strain, series]) =>
  (series as number[]).map((od, i) => ({
    well: `${strain as string}-${i}`,
    strain: strain as string,
    hours: [0, 2, 4, 6, 8, 10, 12, 24][i],
    od,
  }))
)

const GROWTH_TABLE: Table = {
  columns: ["Well", "Strain", "Hours", "OD600"],
  rows: GROWTH_ROWS.map((r) => ({
    rowId: r.well,
    values: { Well: r.well, Strain: r.strain, Hours: r.hours, OD600: r.od },
  })),
}

const GROWTH_SPEC: AnalysisSpec = (() => {
  const parsed = parseSpec({
    schemaVersion: 1,
    dataset: {
      fileId: null,
      fileName: "growth_curve.xlsx",
      sheet: "OD600",
      versionHash: "sha256:7bd41c9a2e60",
      rowCount: GROWTH_ROWS.length,
      columnCount: 4,
    },
    roles: [
      { column: "Strain", role: "group", unit: null, source: "inferred", confidence: 0.86 },
      { column: "Hours", role: "time", unit: "h", source: "inferred", confidence: 0.9 },
      { column: "OD600", role: "response", unit: null, source: "inferred", confidence: 0.8 },
    ],
    design: { source: "inferred", paired: false, replicateType: "biological" },
    analysis: {
      test: "none",
      groupColumn: "Strain",
      responseColumns: ["OD600"],
      alpha: 0.05,
    },
    figure: {
      kind: "line-timecourse",
      title: "Growth curve",
      errorBars: "none",
      x: { label: "Time", unit: "h" },
      y: { label: "OD600" },
      palette: "tol-bright",
    },
    export: {},
  })
  if (!parsed.ok) throw new Error("growth fixture invalid")
  return parsed.spec
})()

/**
 * Read the edited sheet back out as a Table.
 *
 * Returns null rather than an empty table when the snapshot cannot be parsed,
 * so a transient state during an edit never wipes the analysis's data.
 */
function tableFromSnapshot(snapshot: Record<string, unknown>): Table | null {
  try {
    const wb = snapshotToXlsxWorkbook(snapshot as never)
    // Never the results sheet: it is a rendering of the result, and reading it
    // back would let a reported number become an input to the analysis that
    // produced it.
    const name = wb.SheetNames.find((n) => n !== RESULTS_SHEET_NAME) ?? wb.SheetNames[0]
    const ws = wb.Sheets[name]
    if (!ws) return null
    const aoa = XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1, blankrows: false })
    if (aoa.length < 2) return null
    return tableFromGrid(aoa)
  } catch {
    return null
  }
}

/** Human wording for a row id, used wherever a point has to be named. */
function describeRow(rowId: string | null): string | undefined {
  if (!rowId) return undefined
  const row = PREVIEW_ROWS.find((r) => r.well === rowId)
  return row ? `Well ${row.well}, ${row.treatment}, ${row.viability}%` : `Well ${rowId}`
}

/** Human names for the engine's test ids. */
const TEST_LABELS: Record<string, string> = {
  none: "None (draw the data only)",
  descriptives: "Descriptive statistics",
  normality: "Normality test",
  "t-one-sample": "One-sample t-test",
  "t-unpaired": "Unpaired t-test (Student)",
  "t-welch": "Unpaired t-test (Welch)",
  "t-paired": "Paired t-test",
  "mann-whitney": "Mann-Whitney U",
  "wilcoxon-signed-rank": "Wilcoxon signed-rank",
  "anova-one-way": "One-way ANOVA",
  "anova-rm": "Repeated-measures ANOVA",
  "anova-two-way": "Two-way ANOVA",
  "kruskal-wallis": "Kruskal-Wallis",
  friedman: "Friedman",
  "mixed-effects": "Mixed-effects model",
  "chi-square": "Chi-square",
  "fisher-exact": "Fisher's exact",
  "correlation-pearson": "Pearson correlation",
  "correlation-spearman": "Spearman correlation",
  "linear-regression": "Linear regression",
  "nonlinear-regression": "Nonlinear regression (dose-response)",
  "kaplan-meier": "Kaplan-Meier survival",
}

/** Every chart kind the spec defines, so none is unreachable from the UI. */
const CHART_TYPES = [
  { id: "bar-scatter-error" as const, label: "Bar", icon: ChartBar },
  { id: "grouped-bar" as const, label: "Grouped", icon: ChartBar },
  { id: "box" as const, label: "Box", icon: ChartBar },
  { id: "violin" as const, label: "Violin", icon: ChartBar },
  { id: "line-timecourse" as const, label: "Line", icon: ChartLine },
  { id: "xy-scatter-fit" as const, label: "XY fit", icon: ChartScatter },
  { id: "dose-response" as const, label: "Dose", icon: ChartLine },
  { id: "kaplan-meier" as const, label: "Survival", icon: ChartLine },
  { id: "heatmap" as const, label: "Heatmap", icon: GridFour },
  { id: "volcano" as const, label: "Volcano", icon: ChartScatter },
  { id: "histogram" as const, label: "Histogram", icon: ChartBar },
  { id: "pie-composition" as const, label: "Pie", icon: Circle },
]

/** The analyses the preview opens with: two experiments, two chart kinds. */
function initialPipelines(): PipelineState {
  let state = EMPTY_PIPELINES
  state = pipelineReducer(state, {
    kind: "open",
    pipeline: {
      id: "viability",
      name: "Viability 48 h, dose series",
      spec: FIXTURE_SPEC,
      table: PREVIEW_TABLE,
      result: FIXTURE_RESULT,
      stale: false,
    },
  })
  state = pipelineReducer(state, {
    kind: "open",
    pipeline: {
      id: "growth",
      name: "Growth curve, OD600",
      spec: GROWTH_SPEC,
      table: GROWTH_TABLE,
      result: null,
      stale: true,
    },
  })
  return pipelineReducer(state, { kind: "activate", id: "viability" })
}

/**
 * The spec-driven analysis workspace.
 *
 * Takes whatever pipelines it is given, so the same component serves the demo
 * data and a sheet the user just imported. When nothing is supplied it opens
 * the two built-in experiments, which is what makes the figure layout show
 * something real the first time it is opened.
 */
export function SpecAnalysisWorkspace({
  pipelines: seed,
}: {
  pipelines?: AnalysisPipeline[]
} = {}) {
  const [pipelineState, setPipelineState] = useState<PipelineState>(() => {
    if (!seed || seed.length === 0) return initialPipelines()
    let state = EMPTY_PIPELINES
    for (const pipeline of seed) state = pipelineReducer(state, { kind: "open", pipeline })
    return pipelineReducer(state, { kind: "activate", id: seed[0].id })
  })
  const [view, setView] = useState<"analysis" | "layout">("analysis")
  const [layout, setLayout] = useState<FigureLayout>(() => {
    // Two panels, pre-bound to the two analyses, so the composition is visible
    // immediately rather than after four clicks.
    const base = layoutFromPreset(
      LAYOUT_PRESETS.find((p) => p.id === "side-by-side")!,
      "Figure 1"
    )
    const ids = (seed && seed.length > 0 ? seed : []).map((p) => p.id)
    const [first, second] = ids.length > 0 ? ids : ["viability", "growth"]
    return assignPanel(
      assignPanel(base, base.panels[0].id, first ?? null),
      base.panels[1].id,
      second ?? null
    )
  })

  /**
   * Undo history, per analysis. Each tab has its own edit stack: undoing in one
   * analysis must not reach into another's history, which a single shared stack
   * would do the moment you switched tabs.
   */
  const [histories, setHistories] = useState<Record<string, SpecHistory>>(() =>
    Object.fromEntries(pipelineState.pipelines.map((p) => [p.id, initHistory(p.spec)]))
  )

  const [excluding, setExcluding] = useState<string | null>(null)
  const [selectedRow, setSelectedRow] = useState<string | null>(null)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [computing, setComputing] = useState(false)
  const [liveProgress, setLiveProgress] = useState<EngineProgress | null>(null)
  const [liveError, setLiveError] = useState<string | null>(null)
  const nextId = useRef(1)

  const active = activePipeline(pipelineState)
  const activeId = pipelineState.activeId
  /**
   * The spreadsheet for whichever analysis is showing.
   *
   * Built from the pipeline's own table rather than a fixture, so the pane
   * shows the rows the figure and the statistics were actually computed from.
   * A data pane that disagreed with the figure beside it would be worse than
   * no data pane at all.
   */
  /**
   * A cell was edited in the data pane.
   *
   * The sheet becomes the pipeline's new table and the result is dropped, so
   * the figure and the statistics cannot go on showing numbers computed from
   * the previous rows. Recompute is deliberately not automatic: Pyodide is a
   * real round trip, and firing one per keystroke would make typing in the
   * sheet feel like the engine is fighting you. The tab's stale dot and the
   * Run button are the prompt.
   */
  const onSheetEdited = useCallback(
    (snapshot: Record<string, unknown>) => {
      if (!activeId) return
      const table = tableFromSnapshot(snapshot)
      if (!table || table.rows.length === 0) return
      setPipelineState((s) => {
        const current = s.pipelines.find((p) => p.id === activeId)
        // Univer persists on selection changes too, so only a genuine change of
        // contents counts, otherwise clicking a cell would discard the result.
        if (current && hashTable(current.table) === hashTable(table)) return s
        return pipelineReducer(s, { kind: "setTable", id: activeId, table })
      })
    },
    [activeId]
  )

  /**
   * Which tests this analysis's data and design can support.
   *
   * The same function the AI seam uses, so the menu and the model can never
   * disagree about what is offerable.
   */
  const capabilities = useMemo(
    () => (active ? legalTests(active.spec, active.table) : []),
    [active]
  )

  const activeWorkbook = useMemo(() => {
    const table = active?.table ?? PREVIEW_TABLE
    const aoa: (string | number)[][] = [
      table.columns,
      ...table.rows.map((r) => table.columns.map((c) => (r.values[c] ?? "") as string | number)),
    ]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Data")

    // The result rides along as a second sheet, so the analysis and the data
    // travel together: a collaborator who opens the file gets the numbers the
    // analysis produced, not only the ones it was run on. Regenerated from the
    // engine result every time, nothing is ever read back out of it.
    if (active) {
      const stats = XLSX.utils.aoa_to_sheet(
        buildResultsSheet(active.spec, active.result, { analysisName: active.name })
      )
      stats["!cols"] = resultsSheetColumnWidths(
        buildResultsSheet(active.spec, active.result, { analysisName: active.name })
      )
      XLSX.utils.book_append_sheet(wb, stats, RESULTS_SHEET_NAME)
    }
    return buildSpreadsheetWorkbookSnapshot(active?.spec.dataset.fileName ?? "analysis.xlsx", wb)
  }, [active])
  const history = (activeId && histories[activeId]) || initHistory(FIXTURE_SPEC)
  const spec = active?.spec ?? FIXTURE_SPEC
  const result = active?.result ?? null

  // Style edits land instantly; data edits flash the compute indicator so the
  // Law 5 split is observable in the preview.
  const dispatch = (mutation: Parameters<typeof dispatchMutation>[1]) => {
    if (!activeId) return
    // Law 5 decides whether this reaches the engine. `requiresRecompute` is the
    // single authority, passing a flag by hand at each call site is how a
    // palette change ends up triggering a round trip.
    const needsEngine = requiresRecompute(mutation)
    setHistories((all) => {
      const next = dispatchMutation(all[activeId] ?? initHistory(spec), mutation, "user")
      setPipelineState((s) =>
        pipelineReducer(s, { kind: "setSpec", id: activeId, spec: next.spec, stale: needsEngine })
      )
      return { ...all, [activeId]: next }
    })
  }

  const stepHistory = (step: typeof undoHistory) => {
    if (!activeId) return
    setHistories((all) => {
      const next = step(all[activeId] ?? initHistory(spec))
      setPipelineState((s) => pipelineReducer(s, { kind: "setSpec", id: activeId, spec: next.spec }))
      return { ...all, [activeId]: next }
    })
  }

  /** Run one analysis through the real engine. */
  const runPipeline = async (id: string) => {
    const target = pipelineState.pipelines.find((p) => p.id === id)
    if (!target) return
    setComputing(true)
    setLiveError(null)
    try {
      const outcome = await computeAnalysis(target.spec, target.table, {
        force: true,
        onProgress: setLiveProgress,
      })
      if (outcome.ok) {
        setPipelineState((s) => pipelineReducer(s, { kind: "setResult", id, result: outcome.result }))
      } else if ("blocked" in outcome) {
        setLiveError(outcome.blocked.map((b) => b.message).join(" "))
      } else {
        setLiveError(outcome.question.question)
      }
    } catch (err) {
      setLiveError(err instanceof Error ? err.message : String(err))
    } finally {
      setComputing(false)
      setLiveProgress(null)
    }
  }

  /** Compute every panel's analysis, so the whole figure is drawn from engine output. */
  const runAll = async () => {
    for (const p of pipelineState.pipelines) {
      if (!p.result) await runPipeline(p.id)
    }
  }

  /**
   * Total reactivity (§1.2b): a data or analysis edit recomputes on its own.
   *
   * Debounced, because Pyodide is a real round trip and firing one per
   * keystroke would make typing in the sheet feel like the engine is fighting
   * you. A failed run is not retried for the same inputs, `attemptedRef` holds
   * what was last tried, so an analysis the engine refuses does not spin.
   */
  const attemptedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!active || !active.stale || computing) return
    const signature = `${active.id}|${hashTable(active.table)}|${JSON.stringify(active.spec.analysis)}|${JSON.stringify(active.spec.transforms)}|${JSON.stringify(active.spec.filters)}|${JSON.stringify(active.spec.exclusions)}`
    if (attemptedRef.current === signature) return
    const timer = setTimeout(() => {
      attemptedRef.current = signature
      void runPipeline(active.id)
    }, 600)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, active?.stale, active?.spec, active?.table, computing])

  const newPipeline = () => {
    const id = `analysis-${nextId.current++}`
    setHistories((all) => ({ ...all, [id]: initHistory(active?.spec ?? FIXTURE_SPEC) }))
    setPipelineState((s) =>
      pipelineReducer(s, {
        kind: "open",
        pipeline: {
          id,
          name: "New analysis",
          spec: active?.spec ?? FIXTURE_SPEC,
          table: active?.table ?? PREVIEW_TABLE,
          result: null,
          stale: true,
        },
      })
    )
    setView("analysis")
  }

  const duplicatePipeline = (id: string) => {
    const newId = `analysis-${nextId.current++}`
    const source = pipelineState.pipelines.find((p) => p.id === id)
    if (source) setHistories((all) => ({ ...all, [newId]: initHistory(source.spec) }))
    setPipelineState((s) => pipelineReducer(s, { kind: "duplicate", id, newId }))
    setView("analysis")
  }

  /**
   * Export the workbook: the data and the Statistics sheet in one file.
   *
   * The result sheet is regenerated here rather than read off the screen, so
   * the file always carries the numbers the current spec produced.
   */
  const exportWorkbook = () => {
    if (!active) return
    const aoa: (string | number)[][] = [
      active.table.columns,
      ...active.table.rows.map((r) =>
        active.table.columns.map((c) => (r.values[c] ?? "") as string | number)
      ),
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Data")
    const stats = buildResultsSheet(active.spec, active.result, { analysisName: active.name })
    const statsSheet = XLSX.utils.aoa_to_sheet(stats)
    statsSheet["!cols"] = resultsSheetColumnWidths(stats)
    XLSX.utils.book_append_sheet(wb, statsSheet, RESULTS_SHEET_NAME)
    XLSX.writeFile(wb, `${active.name.replace(/[^\w-]+/g, "-")}.xlsx`)
  }

  /** The spec itself, so an analysis can be reopened or handed on. */
  const exportBundle = () => {
    if (!active) return
    const blob = new Blob(
      [JSON.stringify({ name: active.name, spec: active.spec, result: active.result }, null, 2)],
      { type: "application/json" }
    )
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${active.name.replace(/[^\w-]+/g, "-")}.n9a.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  /** The figure at the spec's export size, via Plotly's own renderer. */
  const exportFigure = async () => {
    const host = document.querySelector<HTMLElement>(".js-plotly-plot")
    if (!host || !active) return
    const plotly = (await import("plotly.js-dist-min").then(
      (m) => (m as { default?: unknown }).default ?? m
    )) as { downloadImage: (el: HTMLElement, opts: Record<string, unknown>) => Promise<string> }
    await plotly.downloadImage(host, {
      format: active.spec.export.format === "svg" ? "svg" : "png",
      width: active.spec.figure.width,
      height: active.spec.figure.height,
      scale: 3,
      filename: active.name.replace(/[^\w-]+/g, "-"),
    })
  }

  const tabs = (
    <PipelineTabs
      pipelines={pipelineState.pipelines}
      activeId={activeId}
      layoutActive={view === "layout"}
      onActivate={(id) => {
        setPipelineState((s) => pipelineReducer(s, { kind: "activate", id }))
        setView("analysis")
      }}
      onOpenLayout={() => setView("layout")}
      onNew={newPipeline}
      onClose={(id) => setPipelineState((s) => pipelineReducer(s, { kind: "close", id }))}
      onDuplicate={duplicatePipeline}
      onRename={(id, name) => setPipelineState((s) => pipelineReducer(s, { kind: "rename", id, name }))}
      className="mx-4 mt-3"
    />
  )

  if (view === "layout") {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {tabs}
        <div className="flex items-center gap-2 px-4 pt-3">
          <p className="text-[12.5px] text-muted-foreground">
            Panels draw from the analyses above; each keeps its own data, chart and statistics.
          </p>
          <button
            type="button"
            onClick={runAll}
            disabled={computing}
            className="ml-auto rounded-md border border-border/70 px-2.5 py-1 text-[12px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60"
          >
            {computing ? (liveProgress?.detail ?? "Running…") : "Compute every panel"}
          </button>
          {liveError && (
            <span className="text-[11.5px] text-amber-700 dark:text-amber-400">{liveError}</span>
          )}
        </div>
        <LayoutCanvas
          layout={layout}
          pipelines={pipelineState.pipelines}
          onChange={setLayout}
          onOpenPipeline={(id) => {
            setPipelineState((s) => pipelineReducer(s, { kind: "activate", id }))
            setView("analysis")
          }}
          className="min-h-0 flex-1 p-4"
        />
      </div>
    )
  }

  return (
    <>
      {tabs}
      <AnalysisWorkspace
        spec={spec}
        result={result}
        computing={computing}
        name={active?.name ?? "Analysis"}
        onRename={(name) =>
          activeId && setPipelineState((s) => pipelineReducer(s, { kind: "rename", id: activeId, name }))
        }
        revisionNo={3}
        saveState="saved"
        history={history.past.map((p) => p.applied)}
        canUndo={canUndoOf(history)}
        canRedo={canRedoOf(history)}
        onUndo={() => stepHistory(undoHistory)}
        onRedo={() => stepHistory(redoHistory)}
        onSave={() => undefined}
        onFreeze={() => undefined}
        toolbar={{
          counts: { rows: 24, columns: 3, libraryFiles: 19 },
          onOpenTemplates: () => setTemplatesOpen(true),
          onUploadFile: () => undefined,
          onImportFromLibrary: () => undefined,
          onSaveChartToLibrary: () => undefined,
          onSaveAsTemplate: () => undefined,
          onExportData: exportWorkbook,
          onExportAnalysisBundle: exportBundle,
          onExportFigure: exportFigure,
        }}
        canvas={
          <>
            <FigureCanvas
              spec={spec}
              result={result}
              onSelectRow={setSelectedRow}
              onExcludeRow={setExcluding}
            />
            <div className="mt-1 flex min-h-[1.75rem] flex-wrap items-center gap-x-3 gap-y-1 px-1">
              {/* The data-to-figure link, made visible: clicking a mark names
                  the row it came from. */}
              <p className="text-[12px] text-muted-foreground">
                {selectedRow
                  ? `Selected ${describeRow(selectedRow)}`
                  : "Click a point to trace it back to its row."}
              </p>
              <button
                type="button"
                onClick={() => activeId && runPipeline(activeId)}
                disabled={computing || !activeId}
                className="ml-auto rounded-md border border-border/70 px-2 py-1 text-[12px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60"
              >
                {computing
                  ? (liveProgress?.detail ?? "Running…")
                  : result
                    ? "Re-run in the engine"
                    : "Run in the real engine"}
              </button>
              {result && !computing && !active?.stale && (
                <span className="text-[11.5px] text-emerald-700 dark:text-emerald-400">
                  Computed by {result.engineVersion} in {result.durationMs} ms
                </span>
              )}
              {liveError && (
                <span className="text-[11.5px] text-amber-700 dark:text-amber-400">{liveError}</span>
              )}
            </div>
          </>
        }
        dataTable={
          /* The real Univer sheet, mounted exactly as the live workspace does
             it. The data pane has to be the spreadsheet, not a read-only table:
             §2 Tier 0 requires editing a cell to update the figure and the
             statistics live, and that round trip only exists if this is the
             genuine editable surface. */
          <UniverWorkbookView
            /* Keyed by analysis: switching tabs must show that analysis's own
               rows, not the previous one's. */
            key={activeId ?? "none"}
            instanceKey={`analysis-sheet-${activeId ?? "none"}`}
            workbookSnapshot={activeWorkbook}
            variant="workspace"
            compact
            heightClass="h-full"
            /* §2 Tier 0: editing a cell updates the figure and the statistics.
               Without this the sheet is a read-only display that merely looks
               editable, which is worse than not showing it. */
            onPersistSnapshot={onSheetEdited}
          />
        }
        inspectorData={
          <>
            <InspectorSection title="Chart type">
              <ChartTypeGrid
                options={CHART_TYPES}
                value={spec.figure.kind}
                onChange={(kind) => dispatch({ kind: "figure.setKind", value: kind })}
              />
            </InspectorSection>

            <InspectorSection title="Test" hint="Chosen from the recorded design">
              <Field label="Statistical test">
                <select
                  value={spec.analysis.test}
                  onChange={(e) =>
                    dispatch(
                      { kind: "analysis.setTest", value: e.target.value as typeof spec.analysis.test }
                    )
                  }
                  className="h-10 w-full rounded-lg border border-border/70 bg-background px-3 text-[13.5px] outline-none transition-colors focus:border-[var(--n9-accent)]/50"
                >
                  {/* Every test the engine implements is listed. The ones this
                      data and design cannot support are disabled rather than
                      hidden, with the reason on the option, so the menu teaches
                      the constraint instead of silently omitting the answer. */}
                  <option value="none">None (draw the data only)</option>
                  {capabilities.map((c) => (
                    <option
                      key={c.test}
                      value={c.test}
                      disabled={!c.legal}
                      title={c.legal ? undefined : `${c.reason ?? ""} ${c.fix ?? ""}`.trim()}
                    >
                      {TEST_LABELS[c.test] ?? c.test}
                      {c.recommended ? "  (suits this design)" : ""}
                      {c.legal ? "" : `  - ${c.reason ?? "not available for this data"}`}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Post-hoc correction">
                <select
                  value={spec.analysis.postHoc}
                  onChange={(e) =>
                    dispatch(
                      {
                        kind: "analysis.setPostHoc",
                        value: e.target.value as typeof spec.analysis.postHoc,
                      }
                    )
                  }
                  className="h-10 w-full rounded-lg border border-border/70 bg-background px-3 text-[13.5px] outline-none transition-colors focus:border-[var(--n9-accent)]/50"
                >
                  <option value="none">None</option>
                  <option value="tukey">Tukey (all pairs)</option>
                  <option value="dunnett">Dunnett (vs control)</option>
                  <option value="dunn">Dunn (after Kruskal-Wallis)</option>
                  <option value="holm-sidak">Holm-Šídák</option>
                  <option value="sidak">Šídák</option>
                  <option value="bonferroni">Bonferroni</option>
                </select>
              </Field>
            </InspectorSection>

            <InspectorSection title="Error bars" hint="Changes what is drawn">
              <Field label="Type">
                <select
                  value={spec.figure.errorBars}
                  onChange={(e) =>
                    dispatch(
                      {
                        kind: "figure.setErrorBars",
                        value: e.target.value as typeof spec.figure.errorBars,
                      }
                    )
                  }
                  className="h-10 w-full rounded-lg border border-border/70 bg-background px-3 text-[13.5px] outline-none transition-colors focus:border-[var(--n9-accent)]/50"
                >
                  <option value="sd">SD</option>
                  <option value="sem">SEM</option>
                  <option value="ci95">95% CI</option>
                  <option value="iqr">IQR</option>
                  <option value="none">None</option>
                </select>
              </Field>
            </InspectorSection>
          </>
        }
        inspectorStyle={
          <>
            <InspectorSection title="Titles">
              <Field label="Figure title">
                <input
                  value={spec.figure.title ?? ""}
                  onChange={(e) => dispatch({ kind: "figure.setTitle", value: e.target.value })}
                  className="h-10 w-full rounded-lg border border-border/70 bg-background px-3 text-[13.5px] outline-none transition-colors focus:border-[var(--n9-accent)]/50"
                />
              </Field>
              <Field label="Y axis label">
                <input
                  value={spec.figure.y.label ?? ""}
                  onChange={(e) =>
                    dispatch({ kind: "axis.set", axis: "y", patch: { label: e.target.value } })
                  }
                  className="h-10 w-full rounded-lg border border-border/70 bg-background px-3 text-[13.5px] outline-none transition-colors focus:border-[var(--n9-accent)]/50"
                />
              </Field>
            </InspectorSection>

            <InspectorSection title="Typeface" hint="Serif when the journal asks for it">
              <Field label="Figure font">
                <select
                  value={spec.figure.fontFamily}
                  onChange={(e) =>
                    dispatch({
                      kind: "figure.setFont",
                      family: e.target.value as typeof spec.figure.fontFamily,
                    })
                  }
                  className="h-10 w-full rounded-lg border border-border/70 bg-background px-3 text-[13.5px] outline-none transition-colors focus:border-[var(--n9-accent)]/50"
                >
                  <option value="sans">Sans (matches the app)</option>
                  <option value="serif">Serif</option>
                  <option value="mono">Monospace</option>
                </select>
              </Field>
            </InspectorSection>

            <InspectorSection title="Palette" hint="Colour-blind safe by default">
              <Field label="Colours">
                <select
                  value={spec.figure.palette}
                  onChange={(e) =>
                    dispatch({
                      kind: "figure.setPalette",
                      value: e.target.value as typeof spec.figure.palette,
                    })
                  }
                  className="h-10 w-full rounded-lg border border-border/70 bg-background px-3 text-[13.5px] outline-none transition-colors focus:border-[var(--n9-accent)]/50"
                >
                  <option value="okabe-ito">Okabe–Ito</option>
                  <option value="notes9">Notes9</option>
                  <option value="viridis">Viridis</option>
                  <option value="grayscale">Grayscale</option>
                </select>
              </Field>
            </InspectorSection>

            <InspectorSection title="Layout">
              <Field label="Legend">
                <select
                  value={spec.figure.legendPosition}
                  onChange={(e) =>
                    dispatch({
                      kind: "figure.setLegend",
                      show: e.target.value !== "none",
                      position: e.target.value as typeof spec.figure.legendPosition,
                    })
                  }
                  className="h-10 w-full rounded-lg border border-border/70 bg-background px-3 text-[13.5px] outline-none transition-colors focus:border-[var(--n9-accent)]/50"
                >
                  <option value="bottom">Bottom</option>
                  <option value="right">Right</option>
                  <option value="top">Top</option>
                  <option value="none">Hidden</option>
                </select>
              </Field>
              <label className="flex items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  checked={spec.figure.showGridlines}
                  onChange={(e) =>
                    dispatch({ kind: "figure.setGridlines", value: e.target.checked })
                  }
                  className="accent-[var(--n9-accent)]"
                />
                Gridlines
              </label>
            </InspectorSection>
          </>
        }
      />

      {templatesOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/25 p-6 backdrop-blur-[3px]"
          onClick={() => setTemplatesOpen(false)}
        >
          <div
            className="w-[min(46rem,100%)] rounded-2xl border border-border bg-background p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-[15px] font-semibold">Analysis templates</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Start from a bench-ready analysis, or reuse a setup you have saved.
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ["ELISA quantification", "Immunoassay", "4PL standard curve with back-calculation"],
                ["Dose-response / IC50", "Pharmacology", "log(agonist) vs response, EC50 with CI"],
                ["Growth curve", "Microbiology", "Time-course with error bars"],
                ["Bradford / BCA protein", "Protein", "Linear standard curve"],
                ["qPCR Cq", "Molecular", "Delta-delta Ct with replicate collapse"],
                ["Enzyme kinetics", "Enzymology", "Michaelis-Menten, Vmax and Km"],
              ].map(([name, category, description]) => (
                <TemplateCard
                  key={name}
                  name={name}
                  category={category}
                  description={description}
                  builtin
                  onApply={() => setTemplatesOpen(false)}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      <ExclusionDialog
        open={excluding !== null}
        rowId={excluding ?? ""}
        rowSummary={describeRow(excluding)}
        preview={{ withPoint: 0.0731, withoutPoint: 0.0286, alpha: 0.05 }}
        currentUserId="preview-user"
        onCancel={() => setExcluding(null)}
        onConfirm={(exclusion) => {
          dispatch({ kind: "data.excludeRow", exclusion })
          setExcluding(null)
        }}
      />
    </>
  )
}

/** The fixture-seeded form, used by the preview route. */
export function WorkspacePreview() {
  return <SpecAnalysisWorkspace />
}
