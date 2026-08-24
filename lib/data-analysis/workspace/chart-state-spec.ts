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
  type SeriesStyle,
} from "@/lib/data-analysis/spec/analysis-spec"
import type { SpecMutation } from "@/lib/data-analysis/spec/mutations"
import type { Table } from "@/lib/data-analysis/engine/resolver"
import { defaultGroupColumn, inferDesign, inferRoles, legalTests, type TestCapability } from "@/lib/data-analysis/semantic/infer"
import { applyRecord, rolesFromRecord, type ExperimentRecord } from "@/lib/data-analysis/semantic/record"
import { hashTable, recallRowIds } from "./bootstrap"

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

/**
 * What the pipeline is when the sheet underneath it is replaced: nothing.
 *
 * `tableFromChartRows` mints `rowId` from POSITION (`row-${i + 2}`, the sheet's
 * own row number), so `row-7` exists in every sheet that has seven rows. Carry
 * an exclusion across an import and it does not fail to resolve, it resolves
 * against a DIFFERENT measurement while still naming the original author, the
 * original reason and the original timestamp. §8.1 exists to prevent exactly
 * that: a falsified provenance record is worse than a lost one. Filters and
 * transforms go the same way, one rung down -- they name columns the new sheet
 * need not have.
 *
 * Minting `rowId` with the dataset's identity folded in was considered and
 * rejected. Those ids are persisted inside every saved analysis and every
 * exported `.n9a`, so re-minting them re-points or orphans every exclusion
 * already on file (`snapshot-table.ts` documents the same hazard for the header
 * row). That trades a falsified record for a lost one across the whole corpus.
 * There is also nothing to mint them FROM: an identity stable enough to survive
 * someone fixing a typo in a cell, yet different after an import, does not exist
 * anywhere in this data model, and the sheet is editable in place.
 * The decision lives here instead of inline in the workspace shell so it is one
 * value, testable, with the reasoning attached to it.
 */
export const PIPELINE_FOR_NEW_SHEET: Required<
  Pick<ChartState, "filters" | "transforms" | "exclusions">
> = { filters: [], transforms: [], exclusions: [] }

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

const LEGEND_POSITIONS = new Set(["bottom", "right", "top", "none"])
const LINE_STYLES = new Set(["solid", "dash", "dot", "dashdot", "none"])
const POINT_SHAPES = new Set(["circle", "square", "diamond", "triangle", "cross", "x", "star"])

/** The rail holds a CSS stack; the spec names one of three faces. */
const figureFontFamily = (v: string | undefined): AnalysisSpec["figure"]["fontFamily"] =>
  v === "serif" || v === "mono" ? v : "sans"

/**
 * One rail series entry as the spec's `SeriesStyle`. Shared by the derivation
 * below and by `seriesStyleMutation`, so the mutation a colour picker
 * dispatches cannot describe a different style from the one the derivation
 * would have produced from the same rail state.
 */
function figureSeriesStyle(key: string, s: NonNullable<ChartState["seriesStyles"]>[string]): SeriesStyle {
  return {
    key,
    colour: s.color ?? null,
    pointShape: (POINT_SHAPES.has(s.marker ?? "") ? s.marker : "circle") as SeriesStyle["pointShape"],
    pointSize: s.size ?? 6,
    opacity: s.opacity ?? 1,
    jitter: 0,
    lineStyle: (LINE_STYLES.has(s.dash ?? "") ? s.dash : "solid") as SeriesStyle["lineStyle"],
    lineWidth: s.width ?? 2,
    axis: s.axis === "y2" ? "right" : "left",
  }
}

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

/**
 * A statistical-test RECOMMENDATION for the chart type, evidence attached.
 *
 * ADR-025: this used to decide `analysis.test` outright. It only offers now —
 * `specFromChartState` never calls it, and the return value is surfaced as a
 * `PrepOffer` (`prep-offers.ts`) the researcher accepts or ignores. `null`
 * means there is nothing to recommend, not "none": the caller must not turn
 * that into a written choice either.
 */
export function recommendTestForChart(
  chartType: string,
  capabilities: TestCapability[]
): { test: TestKind; rationale: string } | null {
  const wanted: TestKind | null =
    chartType === "km"
      ? "kaplan-meier"
      : chartType === "scatter" || chartType === "bubble"
        ? "correlation-pearson"
        : chartType === "corrMatrix"
          ? "correlation-pearson"
          : null

  if (wanted && isLegal(wanted, capabilities)) {
    return { test: wanted, rationale: `"${chartType}" charts are conventionally analysed with ${wanted}.` }
  }
  const recommended = capabilities.find((c) => c.legal && c.recommended)
  if (recommended) {
    return { test: recommended.test, rationale: `The data's design supports ${recommended.test}.` }
  }
  return null
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
  meta: { fileName: string; sheet?: string | null } = { fileName: "analysis.xlsx" },
  /**
   * The notes9 experiment record for the open sheet, when the workspace knows
   * which experiment it came from. Absent, everything below infers from the
   * file exactly as before; present, the roles it establishes are not
   * re-guessed and the design it declares is cross-checked against the file.
   */
  record?: ExperimentRecord | null
): AnalysisSpec {
  const known = record ? rolesFromRecord(table, record) : []
  const roles = inferRoles(table, known).map(({ rationale: _r, ...role }) => role)
  const { rationale: _d, ...fileDesign } = inferDesign(
    table,
    roles,
    record?.design ?? undefined
  )
  const design = record ? applyRecord(table, roles, fileDesign, record) : fileDesign

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
    fontFamily: figureFontFamily(state.fontFamily),
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
    series: Object.entries(state.seriesStyles ?? {}).map(([key, s]) => figureSeriesStyle(key, s)),
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
  // ADR-025: `analysis.test` is only ever what the researcher accepted, never
  // a chart-type guess substituted on their behalf — that is precisely the
  // artefact-records-a-test-no-human-chose failure ADR-025 exists to close.
  // `recommendTestForChart` offers a recommendation elsewhere; this function
  // must not call it. A named test that is not legal for this data cannot
  // ship either (the resolver would reject it), so that falls back to "none"
  // rather than to a recommendation.
  const test: TestKind = state.test && isLegal(state.test, capabilities) ? state.test : "none"
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

/* ── The rail, as mutations ────────────────────────────────────────────────*/

/**
 * The style controls that now dispatch instead of only setting React state.
 *
 * Deliberately NOT the whole rail. `markers`, `showPoints`, `hlines`, `vlines`
 * and `chartH` have no field in the spec at all — `railFromConfig` excludes
 * them for exactly that reason — so there is no mutation to dispatch and no
 * sticky path to defend. The binding controls (`chartType`, `xKey`, `yKeys`,
 * `zKey`, `sizeKey`) and the statistics slice do have mutations, but they
 * change what the ENGINE computes rather than how it is drawn, so routing them
 * moves the recompute gate as well as the history and belongs in its own change.
 */
export type RailControlKey =
  | "title" | "subtitle" | "caption"
  | "xLabel" | "xUnit" | "yLabel" | "yUnit"
  | "xLog" | "yLog" | "xMin" | "xMax" | "yMin" | "yMax" | "nticks"
  | "showGrid" | "showLegend" | "legendPos"
  | "paletteName" | "fontFamily" | "titleSize" | "axisTitleSize"
  | "errorMode"

/**
 * The typed mutation a rail control means, read off the rail state AFTER the
 * change.
 *
 * Every conversion here is the one `specFromChartState` already performs on the
 * same field — the CSS stack narrowed to one of three faces, the axis-limit
 * text parsed to a number or null, the empty unit string read as absent. That
 * is not a coincidence to be maintained by hand: `chart-state-spec.test.ts`
 * asserts, per control, that applying this mutation to the spec derived from
 * the state BEFORE lands exactly on the spec derived from the state AFTER. A
 * conversion that drifts from `specFromChartState` fails that test, which is
 * also the backward-compatibility guarantee — a saved analysis still derives
 * through the same function it always did, and the mutations only describe the
 * steps between two of its outputs.
 *
 * `null` means the control has no spec effect worth recording.
 */
export function railControlMutation(key: RailControlKey, next: ChartState): SpecMutation | null {
  switch (key) {
    case "title":
      return { kind: "figure.setTitle", value: next.title }
    case "subtitle":
      return { kind: "figure.setSubtitle", value: next.subtitle || null }
    case "caption":
      return { kind: "figure.setCaption", value: next.caption ?? null }
    // Label and unit travel together, as the legend's show/position do below.
    // The spec keeps them on one path, and one control moves both: binding an
    // axis title from a sheet cell sets the label and clears the unit. A
    // mutation naming only half of that would under-describe the edit it is the
    // record of. Re-stating the unchanged half is a no-op — `axis.set` merges.
    case "xLabel":
    case "xUnit":
      return { kind: "axis.set", axis: "x", patch: { label: next.xLabel, unit: next.xUnit || null } }
    case "yLabel":
    case "yUnit":
      return { kind: "axis.set", axis: "y", patch: { label: next.yLabel, unit: next.yUnit || null } }
    case "xLog":
      return { kind: "axis.set", axis: "x", patch: { scale: next.xLog ? "log10" : "linear" } }
    case "yLog":
      return { kind: "axis.set", axis: "y", patch: { scale: next.yLog ? "log10" : "linear" } }
    case "xMin":
      return { kind: "axis.set", axis: "x", patch: { min: num(next.xMin) } }
    case "xMax":
      return { kind: "axis.set", axis: "x", patch: { max: num(next.xMax) } }
    case "yMin":
      return { kind: "axis.set", axis: "y", patch: { min: num(next.yMin) } }
    case "yMax":
      return { kind: "axis.set", axis: "y", patch: { max: num(next.yMax) } }
    case "nticks":
      return { kind: "axis.set", axis: "x", patch: { tickCount: num(next.nticks) } }
    case "showGrid":
      return { kind: "figure.setGridlines", value: next.showGrid ?? true }
    // One mutation for the pair, because the spec holds them on one field and
    // `figure.setLegend` writes both. The position rides along on either edit so
    // the mutation always reproduces the whole of what the rail shows.
    case "showLegend":
    case "legendPos":
      return {
        kind: "figure.setLegend",
        show: next.showLegend ?? true,
        position: LEGEND_POSITIONS.has(next.legendPos ?? "")
          ? (next.legendPos as AnalysisSpec["figure"]["legendPosition"])
          : "bottom",
      }
    case "paletteName":
      return { kind: "figure.setPalette", value: next.paletteName }
    case "fontFamily":
      return { kind: "figure.setFont", family: figureFontFamily(next.fontFamily) }
    case "titleSize":
      return { kind: "figure.setFont", titleSize: next.titleSize ?? 17 }
    case "axisTitleSize":
      return { kind: "figure.setFont", axisSize: next.axisTitleSize ?? 13 }
    case "errorMode":
      return { kind: "figure.setErrorBars", value: next.errorMode }
  }
}

/**
 * A series' style, as one mutation.
 *
 * Separate from `railControlMutation` because the path it owns names the series
 * (`figure.series.<key>`), so the key is an argument rather than a case. That
 * path is the point: two series restyled by hand are two independent sticky
 * edits, and an AI patch recolouring one must not be reported as colliding with
 * the other.
 */
export function seriesStyleMutation(seriesKey: string, next: ChartState): SpecMutation {
  const { key: _key, ...patch } = figureSeriesStyle(seriesKey, next.seriesStyles?.[seriesKey] ?? {})
  return { kind: "figure.setSeriesStyle", seriesKey, patch }
}

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
    // Same reasoning as caption, in the rail's own vocabulary: these three are
    // strings there, so "" is how the rail spells absent. Mapping them to
    // undefined made a spec that simply has no subtitle look silent about it,
    // and railFromConfig skips silent keys, so a reopen inherited the previous
    // analysis's subtitle and units while reporting nothing unrestored.
    // specFromChartState reads them back with `|| null`, so "" round-trips.
    subtitle: figure.subtitle ?? "",
    xUnit: figure.x.unit ?? "",
    yUnit: figure.y.unit ?? "",
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
 * `versionHash`, via `inferDesign`/`inferRoles`) and `figure.kind` (ADR-025:
 * a chart-type change no longer moves `analysis.test` on its own, only a
 * researcher's acceptance does, and that acceptance is `spec.analysis`,
 * already covered above; watching the kind directly would add a ~2s Pyodide
 * round trip for what the signature already covers).
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

/**
 * Rows keyed by column name, as the chart workspace holds them, become a Table.
 *
 * `rowId` is the sheet's own row number, so a mark traced back to a row lands
 * where the user can find it and an "Excluded points" line cites the sample it
 * actually names. `row-${i + 2}` is only that number when the header is on row 1
 * and nothing was dropped in between: a title row, a blank spacer, a unit row or
 * a footnote all move the data without moving the index. So the true ids are
 * taken from the reader that knew them — passed in, or recalled from the array
 * `snapshotToTable` produced — and the positional form is the last resort for
 * rows assembled by hand (tests, the AI's synthetic tables), where it is right.
 *
 * This is also where the two readers converge on what "missing" means. The flat
 * row shape says `""` because it cannot hold `null`; `tableFromGrid` says
 * `null`, which is what the `Table` contract declares and what the resolver and
 * the semantic layer treat as absent. Two spellings of missing arriving at one
 * missing-value path is a defect waiting for the first `eq ""` filter, so a
 * blank becomes `null` here. `hashTable` writes `?? ""` either way, so no
 * stored version hash moves.
 */
export function tableFromChartRows(
  columns: string[],
  rows: Record<string, number | string | null>[],
  rowIds?: readonly string[]
): Table {
  const known = rowIds ?? recallRowIds(rows)
  return {
    columns,
    rows: rows.map((row, i) => ({
      rowId: known?.[i] ?? `row-${i + 2}`,
      values: Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v === "" ? null : v])),
    })),
  }
}
