/**
 * The chart workspace's controls, expressed as an Analysis Spec.
 *
 * The Chart phase grew up holding its settings in React state and drawing
 * straight from them. That works, but a figure described only by component
 * state cannot be saved, reopened, reproduced, put in a figure panel, or
 * checked against the data version it was computed from, Law 1 requires the
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

import {
  parseSpec,
  type AnalysisSpec,
  type FigureKind,
  type TestKind,
  type RowFilter,
  type Transform,
  type Exclusion,
} from "@/lib/data-analysis/spec/analysis-spec"
import type { Table } from "@/lib/data-analysis/engine/resolver"
import { defaultGroupColumn, inferDesign, inferRoles, legalTests, type TestCapability } from "@/lib/data-analysis/semantic/infer"
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

/** The statistics slice, in the spec's own vocabulary, as ErrorMode above. */
type Analysis = AnalysisSpec["analysis"]

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
  /**
   * The statistics slice. Every field is optional and every one, when absent,
   * keeps inferring exactly as before: `test` from the chart type, the rest
   * from the schema's own defaults. Set one and the choice is deliberate, so
   * it survives the next derivation instead of being recomputed away.
   */
  test?: TestKind
  postHoc?: Analysis["postHoc"]
  alpha?: number
  tails?: Analysis["tails"]
  referenceLevel?: string | null
  /**
   * The data pipeline. Absent, like the statistics slice above, keeps
   * deriving an empty pipeline exactly as before. These are the fields the AI
   * patches through `data.setFilters` / `data.addTransform` / `data.excludeRow`
   * without a home on `ChartState` they land in the spec and vanish on the
   * next `derivedSpec` recompute, because nothing carries them back into the
   * rail's own state.
   */
  filters?: RowFilter[]
  transforms?: Transform[]
  exclusions?: Exclusion[]
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
const isLegal = (test: TestKind, capabilities: TestCapability[]) =>
  capabilities.find((c) => c.test === test)?.legal === true

function testForChart(chartType: string, capabilities: TestCapability[]): TestKind {
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

  if (wanted && isLegal(wanted, capabilities)) return wanted
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
    filters: state.filters ?? [],
    transforms: state.transforms ?? [],
    exclusions: state.exclusions ?? [],
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

  const capabilities = legalTests(draft.spec, table)
  // A deliberate choice beats the chart-derived default, that is the same
  // sticky-manual-edit rule the column mapping already follows. Except when the
  // named test is not legal for this data: the resolver would reject it, so a
  // spec that cannot run must not be reachable from here, and we fall back to
  // the derived test rather than shipping the impossible one.
  const test =
    state.test && isLegal(state.test, capabilities)
      ? state.test
      : testForChart(state.chartType, capabilities)
  const parsed = parseSpec({
    ...base,
    analysis: {
      test,
      groupColumn,
      responseColumns,
      postHoc:
        state.postHoc ??
        (test === "anova-one-way" || test === "anova-rm" || test === "anova-two-way"
          ? "tukey"
          : test === "kruskal-wallis" || test === "friedman"
            ? "dunn"
            : "none"),
      // Left undefined when unset, which is exactly today's behaviour: the
      // schema's own default fills them in. Repeating those defaults here would
      // give them a second place to drift from.
      alpha: state.alpha,
      tails: state.tails,
      referenceLevel: state.referenceLevel,
    },
    figure,
  })
  if (!parsed.ok) throw new SpecDerivationError(parsed.issues.map((i) => i.message).join("; "))
  return parsed.spec
}

export class SpecDerivationError extends Error {}

/**
 * Drive the rail from a spec, the direction a saved analysis or an AI-proposed
 * patch arrives in.
 *
 * Partial, because the spec is not the whole rail: the caller merges this into
 * the state it already has. Returning a full ChartState would mean every field
 * the spec is silent about gets reset to a default the user never chose.
 *
 * `table` is the live sheet, and it is here as a guard: a spec authored against
 * an older version of the data can name a column that has since gone, and
 * pointing the chart at a column that does not exist draws nothing. The rail's
 * own mapping stands in that case.
 *
 * Everything the spec holds that the rail has no control for, the second axis,
 * brackets and annotations, is deliberately absent rather than undefined:
 * those live on the spec, and the caller keeps them there.
 *
 * The statistics slice does come back, because it has to: the derivation the
 * other way now prefers these over its chart-type guess, so dropping them here
 * would hand the round trip a state whose next derivation quietly recomputes
 * the test the spec had chosen. Filters, transforms and exclusions come back
 * for the same reason: the AI patches them directly (`data.setFilters`,
 * `data.addTransform`, `data.excludeRow`), and dropping them here is exactly
 * how a patch that landed in the spec used to vanish on the next
 * `derivedSpec` recompute.
 */
export function chartStateFromSpec(spec: AnalysisSpec, table: Table): Partial<ChartState> {
  const { figure, analysis } = spec
  const columns = new Set(table.columns)
  const responseColumns = analysis.responseColumns.filter((c) => columns.has(c))

  const state: Partial<ChartState> = {
    // Null is a value here, not an absence: it is what "use the generated
    // wording" looks like, so it has to overwrite an inherited caption.
    caption: figure.caption,
    subtitle: figure.subtitle ?? undefined,
    xUnit: figure.x.unit ?? undefined,
    yUnit: figure.y.unit ?? undefined,
    xLog: figure.x.scale === "log10",
    yLog: figure.y.scale === "log10",
    xMin: figure.x.min,
    xMax: figure.x.max,
    yMin: figure.y.min,
    yMax: figure.y.max,
    nticks: figure.x.tickCount,
    errorMode: figure.errorBars,
    // Guarded the same way `responseColumns` is above: a filter naming a
    // column the current sheet doesn't have would otherwise have `matches`
    // (engine/resolver.ts) evaluate against `undefined` and silently drop
    // every row on the next recompute.
    filters: spec.filters.filter((f) => columns.has(f.column)),
    transforms: spec.transforms,
    exclusions: spec.exclusions,
    // The statistics the panel owns. A parsed spec always has all five, so
    // reading them back is a plain copy, and null on the reference level is a
    // value ("no reference"), the same as on the caption above.
    test: analysis.test,
    postHoc: analysis.postHoc,
    alpha: analysis.alpha,
    tails: analysis.tails,
    referenceLevel: analysis.referenceLevel,
    paletteName: figure.palette,
    showGrid: figure.showGridlines,
    showLegend: figure.showLegend,
    legendPos: figure.legendPosition,
    fontFamily: figure.fontFamily,
    titleSize: figure.titleFontSize,
    axisTitleSize: figure.axisFontSize,
    width: figure.width,
    height: figure.height,
    seriesStyles: Object.fromEntries(
      figure.series.map((s) => [
        s.key,
        {
          color: s.colour ?? undefined,
          width: s.lineWidth,
          dash: s.lineStyle,
          marker: s.pointShape,
          size: s.pointSize,
          opacity: s.opacity,
          axis: s.axis === "right" ? ("y2" as const) : ("y" as const),
        },
      ])
    ),
  }

  // The rail's required fields can be set but never cleared, so a spec that is
  // silent on one leaves the user's own value standing.
  //
  // The chart type is the same case for a different reason: the map is total
  // out of the rail but not back into it, dose-response and grouped-bar are
  // spec kinds with no control to select them. Guessing the nearest chart would
  // quietly redraw the figure as a different one.
  const chartType = FIGURE_KIND_TO_CHART_TYPE[figure.kind]
  if (chartType) state.chartType = chartType
  if (figure.title !== null) state.title = figure.title
  if (figure.x.label !== null) state.xLabel = figure.x.label
  if (figure.y.label !== null) state.yLabel = figure.y.label
  if (analysis.groupColumn && columns.has(analysis.groupColumn)) state.xKey = analysis.groupColumn
  if (responseColumns.length > 0) state.yKeys = responseColumns

  return state
}

/**
 * The signature `derivedSpec`'s recompute effect watches. Mirrors
 * `requiresRecompute` (`lib/data-analysis/spec/mutations.ts`), the codebase's
 * own statement of Law 5, "style edits never recompute; data and analysis
 * edits always do", plus `figure.errorBars`, which that rule already marks
 * recompute-worthy but which nothing here previously watched: a real
 * pre-existing miss, not a deliberate omission.
 *
 * Deliberately excludes `design`/`roles` (already a pure function of
 * `versionHash`, via `inferDesign`/`inferRoles`) and `figure.kind` (a
 * chart-type change already flows through `testForChart` into
 * `analysis.test`; watching the kind directly would add a ~2s Pyodide round
 * trip to every chart-type click for analysis the signature already covers).
 * Do not "fix" that omission, it is the point.
 */
export function recomputeSignature(spec: AnalysisSpec): string {
  return JSON.stringify([
    spec.dataset.versionHash,
    spec.analysis,
    spec.filters,
    spec.transforms,
    spec.exclusions,
    spec.figure.errorBars,
  ])
}

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
