/**
 * The chart workspace's controls, expressed as an Analysis Spec.
 *
 * The Chart phase grew up holding its settings in React state and drawing
 * straight from them. That works, but a figure described only by component
 * state cannot be saved, reopened, reproduced, put in a figure panel, or
 * checked against the data version it was computed from — Law 1 requires the
 * spec to be the only description of a figure.
 *
 * Rather than rewire every control to dispatch a spec mutation (hundreds of
 * call sites, each a chance to drop a feature), the controls stay exactly as
 * they are and this derives the spec from them. One direction, pure, testable:
 * the rail keeps its behaviour and the spec becomes the record.
 *
 * The map from chart type to figure kind is TOTAL. A chart the user can pick
 * that the spec cannot name would be a figure that silently fails to save.
 */

import { parseSpec, type AnalysisSpec, type FigureKind, type TestKind } from "@/lib/data-analysis/spec/analysis-spec"
import type { Table } from "@/lib/data-analysis/engine/resolver"
import { defaultGroupColumn, inferDesign, inferRoles, legalTests } from "@/lib/data-analysis/semantic/infer"
import { hashTable } from "./bootstrap"

/** Every chart type the workspace offers, mapped onto a figure kind. */
export const CHART_TYPE_TO_FIGURE_KIND: Record<string, FigureKind> = {
  line: "line-timecourse",
  scatter: "xy-scatter-fit",
  area: "area",
  bubble: "bubble",
  bar: "bar-scatter-error",
  barStacked: "stacked-bar",
  barH: "horizontal-bar",
  pie: "pie-composition",
  box: "box",
  violin: "violin",
  histogram: "histogram",
  ecdf: "ecdf",
  qq: "qq",
  heatmap: "heatmap",
  corrMatrix: "correlation-matrix",
  volcano: "volcano",
  blandAltman: "bland-altman",
  roc: "roc",
  km: "kaplan-meier",
  forest: "forest",
  scatter3d: "scatter-3d",
  mesh3d: "surface-3d",
}

/** The reverse direction, for when a spec drives the rail. */
export const FIGURE_KIND_TO_CHART_TYPE: Record<string, string> = Object.fromEntries(
  Object.entries(CHART_TYPE_TO_FIGURE_KIND).map(([chart, kind]) => [kind, chart])
)

/** The workspace's error-bar setting; already the spec's own vocabulary. */
type ErrorMode = AnalysisSpec["figure"]["errorBars"]

export interface ChartState {
  chartType: string
  xKey: string
  yKeys: string[]
  zKey?: string
  sizeKey?: string
  title: string
  subtitle?: string
  xLabel: string
  xUnit?: string
  yLabel: string
  yUnit?: string
  yLog?: boolean
  xLog?: boolean
  showGrid?: boolean
  showLegend?: boolean
  legendPos?: string
  paletteName: string
  errorMode: ErrorMode
  fontFamily?: string
  titleSize?: number
  axisTitleSize?: number
  width?: number
  height?: number
  xMin?: string | number | null
  xMax?: string | number | null
  yMin?: string | number | null
  yMax?: string | number | null
  nticks?: string | number | null
  /** The author's figure legend; null uses the generated wording. */
  caption?: string | null
  seriesStyles?: Record<
    string,
    { color?: string; width?: number; dash?: string; marker?: string; size?: number; opacity?: number; axis?: "y" | "y2" }
  >
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

const LEGEND_POSITIONS = new Set(["bottom", "right", "top", "none"])
const LINE_STYLES = new Set(["solid", "dash", "dot", "dashdot", "none"])
const POINT_SHAPES = new Set(["circle", "square", "diamond", "triangle", "cross", "x", "star"])

/**
 * Choose the test the chart implies.
 *
 * A chart type carries a question: a dose-response chart is asking for a fit, a
 * survival chart for a log-rank. Taking the test from the chart means the
 * statistics panel answers the question the figure is posing, instead of
 * whatever was last selected. The capability matrix still has the final say, so
 * a chart can never request a test this data cannot support.
 */
function testForChart(chartType: string, draft: AnalysisSpec, table: Table): TestKind {
  const wanted: TestKind | null =
    chartType === "km"
      ? "kaplan-meier"
      : chartType === "scatter" || chartType === "bubble"
        ? "correlation-pearson"
        : chartType === "corrMatrix"
          ? "correlation-pearson"
          : chartType === "bar" || chartType === "box" || chartType === "violin" || chartType === "barStacked" || chartType === "barH"
            ? null // decided by the design below
            : null

  const capabilities = legalTests(draft, table)
  if (wanted && capabilities.find((c) => c.test === wanted)?.legal) return wanted
  const recommended = capabilities.find((c) => c.legal && c.recommended)
  return recommended?.test ?? "none"
}

/**
 * Build the spec for the chart currently configured.
 *
 * `table` is the live sheet, so the roles, the design and therefore the legal
 * tests all track the data the user is actually looking at.
 */
export function specFromChartState(
  state: ChartState,
  table: Table,
  meta: { fileName: string; sheet?: string | null } = { fileName: "analysis.xlsx" }
): AnalysisSpec {
  const roles = inferRoles(table).map(({ rationale: _r, ...role }) => role)
  const { rationale: _d, ...design } = inferDesign(table, roles)

  // What the user mapped wins over what was inferred: they chose these columns
  // in the rail, and re-guessing them would fight the choice.
  const responseColumns = state.yKeys.length > 0 ? state.yKeys : roles.filter((r) => r.role === "response").map((r) => r.column)
  const groupColumn = state.xKey || defaultGroupColumn(roles)

  const base = {
    schemaVersion: 1 as const,
    dataset: {
      fileId: null,
      fileName: meta.fileName,
      sheet: meta.sheet ?? null,
      versionHash: hashTable(table),
      rowCount: table.rows.length,
      columnCount: table.columns.length,
    },
    roles,
    design,
    export: {},
  }

  const figure = {
    kind: CHART_TYPE_TO_FIGURE_KIND[state.chartType] ?? "bar-scatter-error",
    title: state.title,
    subtitle: state.subtitle || null,
    caption: state.caption ?? null,
    errorBars: state.errorMode,
    palette: state.paletteName,
    showGridlines: state.showGrid ?? true,
    showLegend: state.showLegend ?? true,
    legendPosition: LEGEND_POSITIONS.has(state.legendPos ?? "")
      ? (state.legendPos as "bottom" | "right" | "top" | "none")
      : "bottom",
    fontFamily: state.fontFamily === "serif" || state.fontFamily === "mono" ? state.fontFamily : "sans",
    titleFontSize: state.titleSize ?? 17,
    axisFontSize: state.axisTitleSize ?? 13,
    width: state.width ?? 720,
    height: state.height ?? 520,
    x: {
      label: state.xLabel,
      unit: state.xUnit || null,
      scale: state.xLog ? ("log10" as const) : ("linear" as const),
      min: num(state.xMin),
      max: num(state.xMax),
      tickCount: num(state.nticks),
    },
    y: {
      label: state.yLabel,
      unit: state.yUnit || null,
      scale: state.yLog ? ("log10" as const) : ("linear" as const),
      min: num(state.yMin),
      max: num(state.yMax),
    },
    // Per-series overrides carry across unchanged; they are the lab's figure
    // look, and losing them on save is the complaint §Tier1.2 is about.
    series: Object.entries(state.seriesStyles ?? {}).map(([key, s]) => ({
      key,
      colour: s.color ?? null,
      pointShape: POINT_SHAPES.has(s.marker ?? "") ? s.marker : "circle",
      pointSize: s.size ?? 6,
      opacity: s.opacity ?? 1,
      lineStyle: LINE_STYLES.has(s.dash ?? "") ? s.dash : "solid",
      lineWidth: s.width ?? 2,
      axis: s.axis === "y2" ? ("right" as const) : ("left" as const),
    })),
  }

  const draft = parseSpec({
    ...base,
    analysis: { test: "none", groupColumn, responseColumns },
    figure,
  })
  if (!draft.ok) {
    // A spec that will not parse must not take the figure down with it. The
    // caller falls back to the un-specced render path.
    throw new SpecDerivationError(draft.issues.map((i) => i.message).join("; "))
  }

  const test = testForChart(state.chartType, draft.spec, table)
  const parsed = parseSpec({
    ...base,
    analysis: {
      test,
      groupColumn,
      responseColumns,
      postHoc:
        test === "anova-one-way" || test === "anova-rm" || test === "anova-two-way"
          ? "tukey"
          : test === "kruskal-wallis" || test === "friedman"
            ? "dunn"
            : "none",
    },
    figure,
  })
  if (!parsed.ok) throw new SpecDerivationError(parsed.issues.map((i) => i.message).join("; "))
  return parsed.spec
}

export class SpecDerivationError extends Error {}

/** Rows keyed by column name, as the chart workspace holds them, become a Table. */
export function tableFromChartRows(
  columns: string[],
  rows: Record<string, number | string>[]
): Table {
  return {
    columns,
    // The sheet's own row number, so a mark traced back to a row lands where
    // the user can find it. Header occupies row 1.
    rows: rows.map((values, i) => ({ rowId: `row-${i + 2}`, values })),
  }
}
