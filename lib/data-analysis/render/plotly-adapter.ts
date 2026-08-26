import { bracketId, effectiveScale, type AnalysisSpec } from "@/lib/data-analysis/spec/analysis-spec"
import type { DescriptiveRow, EngineResult } from "@/lib/data-analysis/engine/contract"
import { PALETTE_DEFINITIONS, paletteColours, toColorscale } from "./palettes"
import { rocCurve } from "@/lib/data-analysis/chart-transforms"

/**
 * L5, the renderer binding: AnalysisSpec + EngineResult → Plotly traces and layout.
 *
 * A pure function, deliberately. The renderer holds no state of its own, so
 * "reload produces an identical figure" (§6.5) is true by construction rather
 * than by careful bookkeeping: the same spec and the same result always produce
 * the same figure.
 *
 * Two Tier 0 requirements that live here rather than in the chart component:
 *
 *   - Every mark carries `customdata` with its source row id, so the chart can
 *     hit-test back to the spreadsheet. Without this, "open the data behind this
 *     point" is impossible, and it is impossible to add later without rewriting
 *     every trace builder, which is why it goes in from the start.
 *   - Excluded points are DRAWN, greyed, rather than removed (§8.1). A figure
 *     that silently omits its exclusions is the failure mode the governance
 *     exists to prevent.
 */

/* ── Palettes (§6.4: colour-blind-safe by default) ─────────────────────────*/

/**
 * Kept as a name→colours map for the callers that index it directly. The
 * catalogue itself lives in ./palettes so the spec-driven renderer and the
 * existing chart workspace cannot drift apart on what a palette name means.
 */
export const PALETTES: Record<string, string[]> = Object.fromEntries(
  PALETTE_DEFINITIONS.map((p) => [p.id, p.colours])
)

/** Greyed, but present. */
const EXCLUDED_COLOUR = "#b9b2a8"

/**
 * The platform's own faces, spelled out literally.
 *
 * These mirror the families declared in app/layout.tsx. They are written as real
 * family names rather than `var(--font-…)` because Plotly writes font-family on
 * SVG text nodes, where a CSS custom property will not always resolve, and a
 * figure that silently falls back to Helvetica stops looking like the product
 * the moment it is exported.
 */
/**
 * Figure typefaces.
 *
 * `sans` is the platform's own UI stack, so a figure on screen is set in the
 * same face as everything around it. `serif` stays available because journals
 * ask for it, and Georgia is named first there since it is present on every
 * platform and a figure must not silently fall back to sans when exported on a
 * machine that lacks a webfont.
 */
const FONT_STACK: Record<AnalysisSpec["figure"]["fontFamily"], string> = {
  sans: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  serif: "Georgia, ui-serif, 'Times New Roman', serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
}

/**
 * What the bars mean, stated verbatim on the figure (§2).
 *
 * Every entry names both the centre and the spread, because "± SD" beside an
 * unstated centre is ambiguous, and a bar chart whose error bars are unlabelled
 * cannot be interpreted at all.
 */
export const ERROR_BAR_LABEL: Record<AnalysisSpec["figure"]["errorBars"], string> = {
  sd: "mean ± SD",
  sem: "mean ± SEM",
  ci90: "mean ± 90% CI",
  ci95: "mean ± 95% CI",
  ci99: "mean ± 99% CI",
  range: "mean, range",
  iqr: "median, IQR",
  mad: "median ± MAD",
  none: "",
}

/** Options for the error-bar picker, with the one-line explanation each needs. */
export const ERROR_BAR_OPTIONS: {
  id: AnalysisSpec["figure"]["errorBars"]
  label: string
  note: string
}[] = [
  { id: "sd", label: "SD", note: "Spread of the data itself." },
  { id: "sem", label: "SEM", note: "Precision of the mean; shrinks as n grows." },
  { id: "ci90", label: "90% CI", note: "Interval for the mean at a 10% error rate." },
  { id: "ci95", label: "95% CI", note: "The interval most journals expect." },
  { id: "ci99", label: "99% CI", note: "Wider interval for a stricter claim." },
  { id: "range", label: "Range", note: "Minimum to maximum; every point is inside." },
  { id: "iqr", label: "IQR", note: "Middle 50%, around the median." },
  { id: "mad", label: "MAD", note: "Median absolute deviation; robust to outliers." },
  { id: "none", label: "None", note: "No bars drawn." },
]

export interface PlotlyFigure {
  data: Record<string, unknown>[]
  layout: Record<string, unknown>
  /**
   * Identity for each significance bracket in `layout.shapes`, index-aligned
   * with the leading run of shapes (the brackets are pushed first). Present so
   * a dragged bracket can be named without the chart component reverse-
   * engineering it from coordinates. `baseY` is the auto-placed position an
   * offset is measured from; `y` is where it is actually drawn.
   */
  brackets?: { id: string; baseY: number; y: number }[]
}

/* ── Helpers ───────────────────────────────────────────────────────────────*/

function axisTitle(axis: AnalysisSpec["figure"]["x"]): string {
  if (!axis.label) return ""
  return axis.unit ? `${axis.label} (${axis.unit})` : axis.label
}

/**
 * Chart kinds whose x values are the group names themselves.
 *
 * Plotly infers this from the data only when the axis type is left unset; once
 * an explicit "linear" is supplied it keeps it, silently plots nothing for the
 * string categories, and leaves an empty frame with a numeric axis behind.
 *
 * Box and violin belong here because they position their own points natively.
 * Bar charts do not: their scatter overlay has to be jittered by hand, and a
 * category axis turns every distinct numeric offset into a new category rather
 * than reading it as a position, so those use a numbered axis with the group
 * names supplied as tick labels instead (see `categoryTicks`).
 *
 * A stacked bar has no scatter overlay to jitter, so it belongs here with box
 * and violin: it was passing group NAMES as x while the layout declared the
 * axis "linear", which draws an empty numeric frame.
 */
const CATEGORICAL_X = new Set<AnalysisSpec["figure"]["kind"]>(["box", "violin", "stacked-bar"])

/**
 * Chart kinds that actually draw error bars, and so may claim them in the
 * subtitle. Box and violin show their spread natively and are labelled by their
 * own geometry; everything absent here draws no whisker at all.
 *
 * `stacked-bar` is absent deliberately: a composition stack draws no whisker
 * (see `stackedComposition`), so claiming one in the subtitle would be the
 * label contradicting the geometry again.
 */
const ERROR_BAR_KINDS = new Set<AnalysisSpec["figure"]["kind"]>([
  "bar-scatter-error",
  "grouped-bar",
  "horizontal-bar",
  "line-timecourse",
])

/**
 * Chart kinds where a second y axis means something.
 *
 * The case is narrow and physical: two series in DIFFERENT UNITS over a shared
 * x. That needs one trace per response column, and a y carrying that column's
 * own measured value — which is line/time-course, area and Q-Q, and nothing
 * else in the catalogue.
 *
 * Every other kind is a refusal on purpose, not an oversight:
 *   - bar, grouped-bar, box and violin split ONE response column across groups
 *     or levels, so a group on its own scale would measure one quantity against
 *     two different rulers;
 *   - a stacked-bar segment is part of a total, and a part on a second scale is
 *     not part of that total any more;
 *   - horizontal-bar and forest carry their value on x, and y is categorical;
 *   - ECDF, ROC and Kaplan-Meier put a probability on y, which has one scale by
 *     definition;
 *   - histogram's y is a count, volcano's is −log10 p, bland-altman's is a
 *     difference, xy-scatter-fit/dose-response and bubble draw a single y
 *     series — in each there is no second series to move;
 *   - heatmap, correlation-matrix, pie and the 3-D kinds have no cartesian y.
 *
 * A series marked `right` on any of those is named in the subtitle rather than
 * quietly drawn on the left, which is indistinguishable from never having asked.
 */
const SECONDARY_AXIS_KINDS = new Set<AnalysisSpec["figure"]["kind"]>([
  "line-timecourse",
  "area",
  "qq",
])

/** The y axis a series' trace targets; "y2" only where the kind can honour it. */
function axisTarget(figure: AnalysisSpec["figure"], axis: "left" | "right"): "y" | "y2" {
  return axis === "right" && SECONDARY_AXIS_KINDS.has(figure.kind) ? "y2" : "y"
}

/**
 * The secondary axis a `right` series gets when the spec carries no `figure.y2`.
 *
 * Targeting an axis that was never created is the one outcome forbidden here:
 * Plotly drops the trace off the figure entirely. Creating a bare axis makes
 * the request visible — a right-hand scale appears, which is what asking for
 * one means — and the labels stay empty because nobody has written them.
 */
const IMPLIED_Y2: AnalysisSpec["figure"]["x"] = {
  label: null,
  unit: null,
  scale: "linear",
  min: null,
  max: null,
  tickCount: null,
  breaks: [],
}

/* ── Axis breaks ───────────────────────────────────────────────────────────*/

/**
 * Chart kinds whose y is a continuous cartesian scale, so a break can cut it.
 *
 * Everything else is a refusal on purpose: forest and horizontal-bar carry the
 * value on x; ECDF, ROC and Kaplan-Meier put a bounded probability on y; qq
 * already owns the second axis; heatmap, correlation-matrix, pie and the 3-D
 * kinds have no cartesian y to cut. Each of those is named in the subtitle
 * rather than accepted and ignored.
 */
const BREAKABLE_Y_KINDS = new Set<AnalysisSpec["figure"]["kind"]>([
  "bar-scatter-error",
  "grouped-bar",
  "stacked-bar",
  "box",
  "violin",
  "xy-scatter-fit",
  "bubble",
  "line-timecourse",
  "area",
  "dose-response",
  "histogram",
  "bland-altman",
])

/** Where the plot area is cut, in paper units, and how wide the cut is. */
const BREAK_SEAM = 0.52
const BREAK_GAP = 0.06

type AxisBreak = { lo: number; hi: number }

/**
 * The y-axis break to draw, or the sentence that says it was asked for and is
 * not on the figure.
 *
 * `AxisSpec.breaks` was declared, accepted by `axis.set`, validated and saved,
 * and never rendered — so a researcher who asked for a broken axis was told the
 * change had been applied and got the same figure back. Every path out of this
 * function is either a break that gets drawn or a note that says it did not,
 * because a silent no-op is worse than a refusal.
 *
 * Plotly has no native broken axis for a numeric scale: `rangebreaks` is
 * coerced only when the axis type is "date" (verified against the bundled
 * plotly.js 3.7 — the rangebreaks defaults are inside an `axType === "date"`
 * branch), so setting it on a linear axis is itself a silent no-op. The two
 * remaining choices are a transformed coordinate space or a subplot pair; this
 * renderer takes the subplot pair, and `applyAxisBreak` says why.
 */
function planAxisBreak(
  figure: AnalysisSpec["figure"],
  data: Record<string, unknown>[]
): { plan: AxisBreak | null; note: string } {
  // A plan AND a note, not one or the other: a figure asking for a break on
  // both axes gets the y one drawn and still has to be told about the x one.
  // Returning a union let the drawn break swallow the undrawn request, which
  // is the same silent no-op with an extra step.
  const unread: string[] = []
  if (figure.x.breaks.length > 0) unread.push("x axis breaks are not drawn")
  if ((figure.y2?.breaks.length ?? 0) > 0) unread.push("y2 axis breaks are not drawn")

  const refuse = (why: string) => ({
    plan: null,
    note: `axis break requested but not applied: ${[why, ...unread].join("; ")}`,
  })
  const silence = () => ({
    plan: null,
    note: unread.length > 0 ? `axis break requested but not applied: ${unread.join("; ")}` : "",
  })

  if (figure.y.breaks.length === 0) return silence()
  if (figure.y.breaks.length > 1) return refuse("only one break at a time is drawn")
  const [lo, hi] = figure.y.breaks[0]
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) {
    return refuse("the interval is empty")
  }
  if (!BREAKABLE_Y_KINDS.has(figure.kind)) {
    return refuse(`${figure.kind} has no continuous y axis to cut`)
  }
  if (effectiveScale(figure.y.scale, figure.kind, "y") === "log10") {
    // A log axis already compresses the range a break is there to compress, and
    // the two together are read wrong far more often than either alone.
    return refuse("the y axis is logarithmic")
  }
  if (figure.y2 || data.some((t) => t.yaxis === "y2")) {
    // The upper segment IS y2 here. A figure that already has a right-hand
    // scale would need a third axis and a second overlay to keep both.
    return refuse("the figure already uses a second y axis")
  }
  return { plan: { lo, hi }, note: silence().note }
}

/**
 * Draws the break as a subplot pair: two y axes stacked on one logical x, the
 * lower one autoranged up to `lo` and the upper one down from `hi`, with the
 * same traces on both and a pair of slashes across the seam.
 *
 * THE TRADE-OFF, against the other usual approach (squeeze the break out of the
 * data and re-label the ticks): a transformed coordinate space is one function
 * and no layout work, but it makes every number Plotly derives from the data
 * wrong in a way nothing on the figure shows — box and violin quartiles and
 * kernel densities, histogram bin edges, and error-bar lengths, which are not
 * linear under a piecewise squeeze — and it corrupts the significance-bracket
 * drag, because `bracketMoveFromRelayout` reads `shapes[i].y0` straight back
 * out of the relayout patch and would record a transformed offset into the
 * saved spec as though it were data units. Silently wrong numbers in a figure
 * that reports p-values is exactly the failure this file exists to avoid.
 *
 * The subplot pair costs a duplicate of every trace and a busier layout, and
 * it can only draw ONE cut — but the data stays raw, so every statistic Plotly
 * computes is the statistic it would have computed unbroken, and the brackets
 * keep dragging in real units. Marks above the cut are re-anchored to the upper
 * axis rather than left to clip out of the figure.
 *
 * ponytail: the seam is a fixed 50/50 split of the plot area, not one weighted
 * by each segment's data span; weight it here if a lopsided break reads badly.
 */
function applyAxisBreak(
  layout: Record<string, unknown>,
  data: Record<string, unknown>[],
  shapes: Record<string, unknown>[],
  annotations: Record<string, unknown>[],
  brk: AxisBreak
): void {
  const lowerTop = BREAK_SEAM - BREAK_GAP / 2
  const upperBottom = BREAK_SEAM + BREAK_GAP / 2
  const ya = layout.yaxis as Record<string, unknown>
  const xa = layout.xaxis as Record<string, unknown>

  // `autorangeoptions` rather than an explicit range: the segments stay
  // autoranged, so neither one has to be told the data extent this file does
  // not have in one place.
  layout.yaxis = {
    ...ya,
    anchor: "x",
    domain: [0, lowerTop],
    autorange: true,
    autorangeoptions: { maxallowed: brk.lo },
  }
  layout.yaxis2 = {
    ...ya,
    // One axis title, on the lower segment. Two would print the label twice.
    title: { text: "" },
    anchor: "x2",
    domain: [upperBottom, 1],
    autorange: true,
    autorangeoptions: { minallowed: brk.hi },
  }
  layout.xaxis = { ...xa, anchor: "y", domain: [0, 1] }
  layout.xaxis2 = {
    ...xa,
    anchor: "y2",
    domain: [0, 1],
    // The upper segment is the same x: `matches` keeps the two halves of a bar
    // literally aligned instead of aligned by eye, and the tick labels and the
    // title stay on the bottom copy only.
    matches: "x",
    showticklabels: false,
    title: { text: "" },
  }

  // The upper segment draws the SAME traces, clipped to the other side of the
  // cut. Nothing is recomputed, so nothing can disagree between the halves; the
  // duplicate keeps its customdata, so a click above the break resolves to the
  // same row as a click below it.
  for (const trace of [...data]) {
    data.push({ ...trace, xaxis: "x2", yaxis: "y2", showlegend: false })
  }

  // Significance brackets and any annotation placed above the cut belong to the
  // upper segment. Left on the lower axis they would sit past its range and
  // vanish — a break that silently ate the p-value stars.
  const above = (v: unknown) => typeof v === "number" && v >= brk.hi
  for (const shape of shapes) {
    if (shape.yref !== undefined && shape.yref !== "y") continue
    if (!above(shape.y0) || !above(shape.y1)) continue
    shape.yref = "y2"
    if (shape.xref === "x") shape.xref = "x2"
  }
  for (const ann of annotations) {
    if (ann.yref !== undefined && ann.yref !== "y") continue
    if (!above(ann.y)) continue
    if (ann.ayref === "y" && !above(ann.ay)) continue
    ann.yref = "y2"
    if (ann.xref === "x") ann.xref = "x2"
    if (ann.ayref === "y") ann.ayref = "y2"
    if (ann.axref === "x") ann.axref = "x2"
  }

  // The mark that says "this axis is cut". Without it a broken axis is just a
  // figure with a suspiciously convenient scale.
  for (const y of [lowerTop, upperBottom]) {
    shapes.push({
      type: "line",
      xref: "paper",
      yref: "paper",
      x0: -0.014,
      x1: 0.014,
      y0: y - 0.014,
      y1: y + 0.014,
      line: { color: "#9aa0a6", width: 1 },
    })
  }
}

/** Chart kinds drawn at integer x positions with group names as tick labels. */
const NUMBERED_X = new Set<AnalysisSpec["figure"]["kind"]>([
  "bar-scatter-error",
  "grouped-bar",
])

/** Tick labels that put the group names back on a numbered axis. */
function categoryTicks(keys: string[]): Record<string, unknown> {
  return {
    type: "linear",
    tickmode: "array",
    tickvals: keys.map((_, i) => i),
    ticktext: keys,
    range: [-0.6, keys.length - 0.4],
    // Gridlines belong on the value axis. A vertical rule through the middle of
    // each bar is not a reading aid, and journals do not print one.
    showgrid: false,
  }
}

function buildAxis(
  axis: AnalysisSpec["figure"]["x"],
  figure: AnalysisSpec["figure"],
  extra: Record<string, unknown> = {},
  categorical = false,
  which: "x" | "y" | "y2" = "x"
): Record<string, unknown> {
  // `parseSpec` normally resolves "auto" before a spec ever gets here; resolving
  // again costs one comparison and keeps a hand-built spec (tests, a caller that
  // skipped the parser) on the same axis the parsed one would have drawn.
  const scale = effectiveScale(axis.scale, figure.kind, which)
  const out: Record<string, unknown> = {
    title: { text: axisTitle(axis), font: { size: figure.axisFontSize } },
    type: scale === "log10" ? "log" : categorical ? "category" : "linear",
    showgrid: figure.showGridlines,
    zeroline: false,
    automargin: true,
    ...extra,
  }
  if (categorical) {
    // Categories are drawn in the order the traces supply them, which is the
    // order the groups appear in the data. Plotly's default re-sorts them
    // alphabetically, which would put "10 uM" before "Vehicle" and scramble a
    // dose series.
    out.categoryorder = "trace"
    out.showgrid = false
  }
  if (axis.min !== null && axis.max !== null) {
    // Plotly expects log-axis ranges in log units; passing raw values silently
    // produces a wildly wrong scale.
    out.range =
      scale === "log10"
        ? [Math.log10(Math.max(axis.min, Number.EPSILON)), Math.log10(Math.max(axis.max, Number.EPSILON))]
        : [axis.min, axis.max]
  }
  if (axis.tickCount !== null) out.nticks = axis.tickCount
  return out
}

function styleFor(figure: AnalysisSpec["figure"], key: string, index: number) {
  const palette = paletteColours(figure.palette)
  const style = figure.series.find((s) => s.key === key)
  return {
    colour: style?.colour ?? palette[index % palette.length],
    pointShape: style?.pointShape ?? "circle",
    pointSize: style?.pointSize ?? 6,
    opacity: style?.opacity ?? 1,
    jitter: style?.jitter ?? 0,
    lineStyle: style?.lineStyle ?? "solid",
    lineWidth: style?.lineWidth ?? 2,
    axis: style?.axis ?? "left",
  }
}

/**
 * The opacity a series asked for, or the idiom's own value when it did not ask.
 *
 * `SeriesStyle.opacity` defaults to 1 in the schema, so "nobody set an opacity"
 * and "somebody set 1" arrive here as the same number. The renderer already
 * reads `jitter` that way -- the schema's neutral default means "use whatever
 * this chart kind does" -- and reading opacity the same way is what lets these
 * kinds honour the field without redrawing every figure already saved at their
 * hardcoded value.
 *
 * ponytail: the ceiling is that a series cannot ask these kinds for a literal
 * 1.0; making `opacity` nullable in the spec would lift it, and this function is
 * the only place that would change.
 */
function seriesOpacity(style: { opacity: number }, whenUnset: number): number {
  return style.opacity === 1 ? whenUnset : style.opacity
}

/**
 * `customdata` for a trace whose body is ONE aggregating mark over `rowIds`.
 *
 * Plotly hands a click on a box or violin BODY the trace's customdata at the
 * body's index within the trace, and a click on one of that trace's own points
 * the customdata at the point's index (plotly.js `makeEventData`, which reads
 * `pointData.index`; the box hover sets it to the body index for a body and to
 * the datum index for a point). One array has to serve both, so slot 0 does
 * double duty: it holds the whole row set -- which is what a body click reads,
 * these traces carrying exactly one body each -- and `rowIdAtPoint` unwraps it
 * to the first id, which is point 0's own row, so that point still resolves to
 * itself. Every later slot is just that point's id.
 *
 * The per-point hover label moves to `text`, which box and violin traces index
 * by point (plotly.js merges `text[i]` into each point's calc data as `tx`).
 */
function bodyCustomdata(rowIds: string[]): (string | string[])[] {
  return rowIds.map((id, k) => (k === 0 ? rowIds : id))
}

/**
 * A stable horizontal offset for one point, in category-width units.
 *
 * Derived from the row id rather than drawn at random: a figure has to redraw
 * identically from the same spec and data every time, and randomly scattered
 * replicates would move on each render and again on export, which would make
 * the exported figure not quite the one that was reviewed.
 */
function hashRowId(rowId: string): number {
  let hash = 0
  for (let i = 0; i < rowId.length; i++) {
    hash = (Math.imul(hash, 31) + rowId.charCodeAt(i)) | 0
  }
  // Murmur3's finalizer. A plain polynomial hash is not enough here: well ids
  // in a plate run "A1".."A8", so the raw hashes differ by only a few units and
  // every replicate would land in the same sliver of the category. This mixes
  // those low bits through the whole word.
  hash ^= hash >>> 16
  hash = Math.imul(hash, 0x85ebca6b)
  hash ^= hash >>> 13
  hash = Math.imul(hash, 0xc2b2ae35)
  hash ^= hash >>> 16
  return hash >>> 0
}

/**
 * Horizontal offsets for one group's replicates, in category-width units.
 *
 * Evenly spaced across the band and symmetric about the centre, so the cloud
 * sits over its bar instead of drifting to one side, which is what a run of
 * hashes that happen to share a sign produces. The hash decides only the ORDER
 * points take within the band, which keeps the arrangement uncorrelated with
 * the data (no false diagonal) while staying identical on every redraw and on
 * export, as Law 4 requires.
 */
function spreadOffsets(rowIds: string[], amount: number): number[] {
  const n = rowIds.length
  if (n === 0) return []
  if (n === 1) return [0]
  const order = rowIds
    .map((id, index) => ({ index, key: hashRowId(id) }))
    .sort((a, b) => a.key - b.key || a.index - b.index)
  const out = new Array<number>(n)
  order.forEach((entry, rank) => {
    out[entry.index] = ((rank / (n - 1)) * 2 - 1) * amount
  })
  return out
}

/** Stars from an adjusted p-value, using the convention journals expect. */
export function significanceStars(p: number): string {
  if (p < 0.0001) return "****"
  if (p < 0.001) return "***"
  if (p < 0.01) return "**"
  if (p < 0.05) return "*"
  return "ns"
}

/**
 * What the figure has to admit out loud.
 *
 * A control that cannot apply to the chosen kind, or that applied differently
 * from how it was asked for, has to say so on the figure. A silent no-op is
 * worse than a refusal: the reader believes the setting took, and there is
 * nothing on the page that contradicts them.
 */
function idiomNotes(spec: AnalysisSpec, result: EngineResult): string[] {
  const figure = spec.figure
  const notes: string[] = []

  if (figure.kind === "violin") {
    if (figure.violinSplit && !splitLevels(spec, result)) {
      const levelCol = secondFactor(spec)
      notes.push(
        levelCol
          ? `split violin needs exactly 2 levels of ${levelCol}; drawn unsplit`
          : "split violin needs a second factor; drawn unsplit"
      )
    }
    if (!figure.violinTruncate) notes.push("density extends past the observed range")
  } else if (figure.violinSplit || !figure.violinTruncate || !figure.violinInnerBox) {
    notes.push("violin settings not applied: this is not a violin")
  }

  if (figure.kind === "volcano") {
    const { hits, shown } = volcanoLabelled(spec, volcanoPoints(spec, result))
    if (hits > shown.length) {
      notes.push(`labelled top ${shown.length} of ${hits} significant features`)
    }
  }

  if (figure.kind === "histogram") {
    if (figure.histogramNorm !== "count") notes.push(figure.histogramNorm)
  } else if (figure.histogramBins !== null || figure.histogramNorm !== "count") {
    notes.push("bin settings not applied: this is not a histogram")
  }

  // The engine already drops a zero-dose control from a log fit and reports it.
  // A log axis drops it from the PICTURE too, silently, so the figure repeats
  // the same statement rather than leaving a reader to wonder where the control
  // went. Counted off `plotData`, so it tracks whatever the engine actually saw.
  if (effectiveScale(figure.x.scale, figure.kind, "x") === "log10") {
    const xCol = spec.analysis.responseColumns[0]
    const nonPositive = xCol
      ? analysisRows(result).filter((r) => {
          const v = Number(r.values[xCol])
          return Number.isFinite(v) && v <= 0
        }).length
      : 0
    if (nonPositive > 0) {
      notes.push(
        `${nonPositive} point${nonPositive === 1 ? "" : "s"} at x \u2264 0 cannot be placed on a log axis`
      )
    }
  }

  return notes
}

/* ── Traces ────────────────────────────────────────────────────────────────*/

/**
 * Group the engine's plot rows by the spec's group column, keeping row ids so
 * every mark can be traced back to its source row.
 */
function groupRows(spec: AnalysisSpec, result: EngineResult) {
  const groupCol = spec.analysis.groupColumn
  const responseCol = spec.analysis.responseColumns[0]
  const groups = new Map<string, { y: number[]; rowIds: string[]; excluded: boolean[] }>()

  for (const row of result.plotData) {
    const key = groupCol ? String(row.values[groupCol] ?? "-") : (responseCol ?? "Series")
    const raw = responseCol ? row.values[responseCol] : null
    const value = typeof raw === "number" ? raw : Number(raw)
    if (!Number.isFinite(value)) continue
    const entry = groups.get(key) ?? { y: [], rowIds: [], excluded: [] }
    entry.y.push(value)
    entry.rowIds.push(row.rowId)
    entry.excluded.push(row.excluded)
    groups.set(key, entry)
  }
  return groups
}

/**
 * The second factor a grouped or stacked bar splits on, or null.
 *
 * Naming the same column for both factors is not a two-factor design, it is a
 * one-factor design described twice: splitting on it would put one occupied
 * cell and L−1 empty ones in every group. Reported as "no second factor" so the
 * chart falls back to its single-factor form instead of drawing that.
 */
function secondFactor(spec: AnalysisSpec): string | null {
  const col = spec.analysis.secondFactorColumn
  return col && col !== spec.analysis.groupColumn ? col : null
}

/**
 * Rows bucketed per (group × second-factor level) cell.
 *
 * Deliberately the same shape `groupRows` returns, with the level folded into
 * the key. That is what lets `errorSpan`, `includedValues` and the exclusion
 * handling produce per-cell summaries without any of them learning that a
 * second factor exists. `groupKeys` comes out in the same first-seen order
 * `groupRows` uses, so a cell's index is the tick the layout labels.
 */
function cellRows(spec: AnalysisSpec, result: EngineResult, levelCol: string) {
  const groupCol = spec.analysis.groupColumn
  const responseCol = spec.analysis.responseColumns[0]
  const groupKeys: string[] = []
  const levelKeys: string[] = []
  const cells = new Map<string, { y: number[]; rowIds: string[]; excluded: boolean[] }>()

  for (const row of result.plotData) {
    const group = groupCol ? String(row.values[groupCol] ?? "-") : (responseCol ?? "Series")
    const level = String(row.values[levelCol] ?? "-")
    const raw = responseCol ? row.values[responseCol] : null
    const value = typeof raw === "number" ? raw : Number(raw)
    if (!Number.isFinite(value)) continue
    if (!groupKeys.includes(group)) groupKeys.push(group)
    if (!levelKeys.includes(level)) levelKeys.push(level)
    const key = `${group}\x00${level}`
    const cell = cells.get(key) ?? { y: [], rowIds: [], excluded: [] }
    cell.y.push(value)
    cell.rowIds.push(row.rowId)
    cell.excluded.push(row.excluded)
    cells.set(key, cell)
  }
  return { groupKeys, levelKeys, cells }
}

/**
 * The rows a mark may be DRAWN for.
 *
 * `showExcludedPoints` is a display filter and nothing else. Hiding an excluded
 * replicate must never move a number on the figure (§8.1), so anything that
 * aggregates — a bar's mean, a box's quartiles, a heatmap cell, a pie slice, an
 * ECDF — reads `analysisRows` instead, which drops exclusions unconditionally.
 * The flag used to be honoured by seven of the twenty chart kinds and, in the
 * heatmap, decided whether an excluded value entered the cell mean.
 */
function drawableRows(spec: AnalysisSpec, result: EngineResult) {
  return result.plotData.filter((r) => !r.excluded || spec.figure.showExcludedPoints)
}

/** The rows a computed statistic may see. Exclusions never count, ever. */
function analysisRows(result: EngineResult) {
  return result.plotData.filter((r) => !r.excluded)
}

/**
 * "95% CI" derived from the analysis alpha rather than assumed.
 *
 * A hardcoded "95% CI" beside an interval computed at alpha = 0.01 is the same
 * class of defect as a mislabelled error bar: the figure states a number the
 * geometry does not support.
 */
function ciLabel(alpha: number): string {
  return `${Number((100 * (1 - alpha)).toFixed(1))}% CI`
}

/** The values in a group that a computed statistic is allowed to see (§8.1). */
function includedValues(g: { y: number[]; excluded: boolean[] }): number[] {
  return g.y.filter((_, i) => !g.excluded[i])
}

/**
 * The engine's own summary for one group, when it computed one.
 *
 * Matched on either field because the engine names a per-group summary in
 * `column` (its payload is keyed by group) and a per-column summary there too
 * with `group` null. The renderer asks about one response column at a time, so
 * either match identifies the same summary.
 */
function descriptiveFor(result: EngineResult, key: string): DescriptiveRow | undefined {
  return result.descriptives.find((d) => d.group === key || d.column === key)
}

/**
 * Where a group's bar sits and how far its whiskers reach, as the ASYMMETRIC
 * pair Plotly's `error_y` wants.
 *
 * A single scalar is drawn symmetrically about the trace's own y, which for a
 * bar is the mean, so three of the eight modes drew a figure that contradicted
 * the label printed beside it: `iqr` was centred on the mean and spanned
 * 2×(Q3−Q1) under a label reading "median, IQR"; `mad` was centred on the mean
 * under "median ± MAD"; `range` mirrored the maximum, so the lower whisker was
 * not the minimum. The label is rendered into the figure and survives export,
 * so the centre and the span have to agree with it exactly: iqr and mad centre
 * on the median, everything else on the mean.
 *
 * `d` is the engine's descriptive row for the group. It is preferred over
 * recomputation so the bar and the results table cannot drift apart — exclude
 * an outlier and both move together. `DescriptiveRow` carries no MAD and only
 * a 95% interval, so `mad`, `ci90` and `ci99` are still derived here, from the
 * INCLUDED values only.
 */
function errorSpan(
  values: number[],
  kind: AnalysisSpec["figure"]["errorBars"],
  d?: DescriptiveRow
): { centre: number; minus: number; plus: number } {
  const n = values.length
  const sorted = [...values].sort((a, b) => a - b)
  const quantile = (p: number) => {
    if (sorted.length === 0) return Number.NaN
    const idx = (sorted.length - 1) * p
    const lo = Math.floor(idx)
    const hi = Math.ceil(idx)
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
  }
  const mean = d?.mean ?? (n > 0 ? values.reduce((a, b) => a + b, 0) / n : 0)
  const flat = { centre: mean, minus: 0, plus: 0 }
  if (kind === "none" || (n === 0 && !d)) return flat

  if (kind === "iqr") {
    const median = d?.median ?? quantile(0.5)
    const q1 = d?.q1 ?? quantile(0.25)
    const q3 = d?.q3 ?? quantile(0.75)
    return Number.isFinite(median) && Number.isFinite(q1) && Number.isFinite(q3)
      ? { centre: median, minus: median - q1, plus: q3 - median }
      : flat
  }
  if (kind === "mad") {
    // Median absolute deviation, scaled to be comparable with an SD on normal
    // data. Reported unscaled would make a robust bar look artificially small
    // beside the SD bars it is meant to replace.
    const median = d?.median ?? quantile(0.5)
    if (n === 0 || !Number.isFinite(median)) return flat
    const deviations = values.map((v) => Math.abs(v - median)).sort((a, b) => a - b)
    const mid = (deviations.length - 1) / 2
    const mad =
      deviations.length % 2
        ? deviations[mid]
        : (deviations[Math.floor(mid)] + deviations[Math.ceil(mid)]) / 2
    return { centre: median, minus: mad * 1.4826, plus: mad * 1.4826 }
  }
  if (kind === "range") {
    const lo = d?.min ?? sorted[0]
    const hi = d?.max ?? sorted[sorted.length - 1]
    return Number.isFinite(lo) && Number.isFinite(hi)
      ? { centre: mean, minus: mean - lo, plus: hi - mean }
      : flat
  }
  // The engine's interval, when it is the one being asked for. Recomputing a
  // 95% CI the engine already reported is how the figure and the table come to
  // disagree about the same number.
  if (kind === "ci95" && d?.ci95Low != null && d?.ci95High != null) {
    return { centre: mean, minus: mean - d.ci95Low, plus: d.ci95High - mean }
  }

  const count = d?.n ?? n
  if (count < 2) return flat
  const sd =
    d?.sd ?? Math.sqrt(values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (n - 1))
  if (kind === "sd") return { centre: mean, minus: sd, plus: sd }
  const sem = d?.sem ?? sd / Math.sqrt(count)
  if (kind === "sem") return { centre: mean, minus: sem, plus: sem }

  // Confidence intervals use the t distribution, not 1.96. At bench n the
  // normal approximation is materially too narrow, with n = 3 the true
  // multiplier is 4.30, so a "95% CI" drawn at 1.96 would be less than half
  // the interval it claims to be.
  const level = kind === "ci90" ? 0.9 : kind === "ci99" ? 0.99 : 0.95
  const half = sem * tCritical(count - 1, level)
  return { centre: mean, minus: half, plus: half }
}

/** Plotly's asymmetric `error_y`/`error_x` object, or nothing when flat. */
function errorBarProps(
  spans: { minus: number; plus: number }[],
  kind: AnalysisSpec["figure"]["errorBars"]
): Record<string, unknown> | undefined {
  if (kind === "none") return undefined
  return {
    type: "data",
    // Symmetric: false is what makes the drawn geometry match the label. With
    // it omitted Plotly ignores `arrayminus` and mirrors `array`.
    symmetric: false,
    array: spans.map((s) => s.plus),
    arrayminus: spans.map((s) => s.minus),
    visible: true,
    thickness: 1.4,
    width: 5,
  }
}

/**
 * Two-sided t critical value.
 *
 * Newton refinement on the incomplete-beta CDF: exact to well under a drawing
 * pixel, and self-contained so a figure can be drawn without a round trip to
 * the engine. The engine still owns the intervals it REPORTS; this is only for
 * the marks when a descriptive row is not to hand.
 */
function tCritical(df: number, level: number): number {
  if (df <= 0) return Number.NaN
  const target = 1 - (1 - level) / 2
  let lo = 0
  let hi = 100
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    if (studentCdf(mid, df) < target) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

function studentCdf(t: number, df: number): number {
  const x = df / (df + t * t)
  const p = 0.5 * incompleteBeta(df / 2, 0.5, x)
  return t > 0 ? 1 - p : p
}

/** Regularised incomplete beta, by the standard continued fraction. */
function incompleteBeta(a: number, b: number, x: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const lbeta = logGamma(a + b) - logGamma(a) - logGamma(b)
  const front = Math.exp(lbeta + a * Math.log(x) + b * Math.log(1 - x)) / a
  // Lentz's algorithm; converges in a few dozen terms for our range.
  let f = 1
  let c = 1
  let d = 0
  for (let i = 0; i <= 300; i++) {
    const m = Math.floor(i / 2)
    let numerator: number
    if (i === 0) numerator = 1
    else if (i % 2 === 0) numerator = (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m))
    else numerator = -((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1))
    d = 1 + numerator * d
    if (Math.abs(d) < 1e-30) d = 1e-30
    d = 1 / d
    c = 1 + numerator / c
    if (Math.abs(c) < 1e-30) c = 1e-30
    const delta = c * d
    f *= delta
    if (Math.abs(1 - delta) < 1e-12) break
  }
  const result = front * (f - 1)
  return x < (a + 1) / (a + b + 2) ? result : 1 - incompleteBeta(b, a, 1 - x)
}

function logGamma(z: number): number {
  const g = [
    676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ]
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z)
  const zz = z - 1
  let x = 0.99999999999980993
  for (let i = 0; i < g.length; i++) x += g[i] / (zz + i + 1)
  const t = zz + g.length - 0.5
  return 0.5 * Math.log(2 * Math.PI) + (zz + 0.5) * Math.log(t) - t + Math.log(x)
}

function barWithPoints(spec: AnalysisSpec, result: EngineResult): Record<string, unknown>[] {
  const figure = spec.figure
  const groups = groupRows(spec, result)
  const keys = [...groups.keys()]

  // The bar reads the engine's own descriptives where they exist, and falls
  // back to the group's INCLUDED values otherwise. Averaging `g.y` wholesale
  // was how excluding an outlier moved the results table without moving the
  // bar the table sits beside.
  const spans = keys.map((k) =>
    errorSpan(includedValues(groups.get(k)!), figure.errorBars, descriptiveFor(result, k))
  )

  const barStyle = styleFor(figure, keys[0] ?? "Series", 0)
  const traces: Record<string, unknown>[] = [
    {
      type: "bar",
      // Integer positions, matching the numbered axis the layout builds for
      // this chart kind. The group names return as that axis's tick labels.
      x: keys.map((_, i) => i),
      // The centre the label names: the median under "median, IQR" or
      // "median ± MAD", the mean everywhere else.
      y: spans.map((s) => s.centre),
      name: ERROR_BAR_LABEL[figure.errorBars] || "mean",
      marker: {
        color: keys.map((k, i) => styleFor(figure, k, i).colour),
        opacity: barStyle.opacity,
      },
      error_y: errorBarProps(spans, figure.errorBars),
      // A bar is one mark standing for the rows it averaged, so it carries all
      // of their ids -- the convention the binned histogram set, and what lets a
      // click on the bar body open the six rows behind it (T0.34). The group
      // name it used to carry there moved to `text`, with `textposition: "none"`
      // so Plotly does not paint every name across the middle of the chart.
      // Excluded replicates are left out: the bar did not average them, they are
      // drawn as their own greyed marks, and each still carries its own id.
      customdata: keys.map((k) => {
        const g = groups.get(k)!
        return g.rowIds.filter((_, j) => !g.excluded[j])
      }),
      text: keys,
      textposition: "none",
      hovertemplate: "%{text}: %{y:.3f}<extra></extra>",
      showlegend: false,
    },
  ]

  // Individual points over the bars, carrying their row ids. Jitter is applied
  // in category space so replicates stop superimposing.
  for (const [i, key] of keys.entries()) {
    const all = groups.get(key)!
    // Purely visual: the bar above was already computed without the exclusions,
    // so hiding their marks cannot move it.
    const show = all.y.map((_, k) => !all.excluded[k] || figure.showExcludedPoints)
    const g = {
      y: all.y.filter((_, k) => show[k]),
      rowIds: all.rowIds.filter((_, k) => show[k]),
      excluded: all.excluded.filter((_, k) => show[k]),
    }
    const style = styleFor(figure, key, i)
    const jitter = style.jitter || 0.12
    traces.push({
      type: "scatter",
      mode: "markers",
      // Numeric positions, not the category name. Plotly's `jitter` property
      // applies to box and violin traces only, so a scatter overlay that passes
      // the bare category stacks every replicate on one vertical line. On a
      // category axis a number addresses the category by index, which lets the
      // offset be spread by hand -- deterministically, from the row id, so the
      // same data always draws the same figure (Law 4).
      x: spreadOffsets(g.rowIds, jitter).map((offset) => i + offset),
      y: g.y,
      // The link back to the spreadsheet. Every downstream feature that needs a
      // datum's identity reads this.
      customdata: g.rowIds,
      name: key,
      marker: {
        color: g.excluded.map(() => style.colour),
        // Excluded points stay on the figure, greyed and hollow (§8.1).
        line: {
          width: g.excluded.map((e) => (e ? 1.5 : 0)),
          color: g.excluded.map((e) => (e ? EXCLUDED_COLOUR : style.colour)),
        },
        opacity: seriesOpacity(style, 0.75),
        size: style.pointSize,
        symbol: g.excluded.map((e) => (e ? "circle-open" : style.pointShape)),
      },
      hovertemplate: "%{y:.3f}<br>row %{customdata}<extra></extra>",
      showlegend: false,
    })
  }
  return traces
}

/**
 * Grouped bars: one trace per SECOND-FACTOR level, side by side inside each
 * level of the primary factor.
 *
 * `barmode: "group"` cannot group a single trace, which is why this kind fell
 * through to `barWithPoints` and silently collapsed the second factor of every
 * two-way ANOVA — the analysis whose DEFAULT figure this is
 * (workspace/bootstrap.ts). A two-way design drawn as a one-way bar chart is
 * not a styling defect, it is the figure asserting a comparison that was not
 * the one run.
 *
 * The sub-bar geometry is stated with `offset` and `width` instead of left to
 * Plotly's own grouping, because the replicate overlay has to land over its own
 * sub-bar: reproducing Plotly's internal offsets by eye is how points end up
 * beside the bar they belong to.
 */
function groupedBar(spec: AnalysisSpec, result: EngineResult): Record<string, unknown>[] {
  const levelCol = secondFactor(spec)
  // One factor is not a grouping. With no second factor this IS a bar chart,
  // and drawing it as one keeps the replicate overlay and the engine's own
  // descriptives that `barWithPoints` already gets right.
  if (!levelCol) return barWithPoints(spec, result)

  const figure = spec.figure
  const { groupKeys, levelKeys, cells } = cellRows(spec, result, levelCol)
  // The band one primary level occupies on the numbered axis, split evenly.
  const band = 0.8
  const width = band / levelKeys.length
  /** Centre of level `l`'s sub-bar, relative to its group's tick. */
  const centreOf = (l: number) => -band / 2 + (l + 0.5) * width

  const traces: Record<string, unknown>[] = []

  for (const [l, level] of levelKeys.entries()) {
    const style = styleFor(figure, level, l)
    // Per-cell summaries, from the cell's INCLUDED values only — the same rule
    // `barWithPoints` follows, one level deeper.
    const spans = groupKeys.map((g) => {
      const cell = cells.get(`${g}\x00${level}`)
      return cell
        ? errorSpan(includedValues(cell), figure.errorBars)
        : { centre: Number.NaN, minus: 0, plus: 0 }
    })
    traces.push({
      type: "bar",
      x: groupKeys.map((_, i) => i),
      // A cell with no rows draws no bar rather than a bar at zero, which would
      // read as "measured, and it was nothing".
      y: spans.map((s) => (Number.isFinite(s.centre) ? s.centre : null)),
      offset: centreOf(l) - width / 2,
      width,
      name: level,
      marker: { color: style.colour, opacity: style.opacity },
      error_y: errorBarProps(spans, figure.errorBars),
      // Each sub-bar stands for the rows of one cell, so it carries all of their
      // ids and a click on it opens that cell (T0.34). The group name it used to
      // carry there moved to `text` — %{x} is the numeric tick — with
      // `textposition: "none"` so Plotly does not paint it onto the bar.
      customdata: groupKeys.map((g) => {
        const cell = cells.get(`${g}\x00${level}`)
        return cell ? cell.rowIds.filter((_, k) => !cell.excluded[k]) : []
      }),
      text: groupKeys,
      textposition: "none",
      hovertemplate: `%{text} · ${level}: %{y:.3f}<extra></extra>`,
    })
  }

  // Replicates over their own sub-bar, carrying their row ids.
  for (const [l, level] of levelKeys.entries()) {
    const style = styleFor(figure, level, l)
    const jitter = style.jitter || 0.12
    const xs: number[] = []
    const ys: number[] = []
    const ids: string[] = []
    const excluded: boolean[] = []
    for (const [i, g] of groupKeys.entries()) {
      const cell = cells.get(`${g}\x00${level}`)
      if (!cell) continue
      // Display filter only: the bars above were computed without exclusions,
      // so hiding these marks cannot move one.
      const show = cell.y.map((_, k) => !cell.excluded[k] || figure.showExcludedPoints)
      const shownIds = cell.rowIds.filter((_, k) => show[k])
      // Spread across the SUB-bar, never the whole band, or a group's clouds
      // overlap each other and stop identifying which bar they belong to.
      const offsets = spreadOffsets(shownIds, Math.min(jitter, width * 0.4))
      shownIds.forEach((id, k) => {
        ids.push(id)
        xs.push(i + centreOf(l) + offsets[k])
      })
      ys.push(...cell.y.filter((_, k) => show[k]))
      excluded.push(...cell.excluded.filter((_, k) => show[k]))
    }
    if (ids.length === 0) continue
    traces.push({
      type: "scatter",
      mode: "markers",
      x: xs,
      y: ys,
      customdata: ids,
      name: `${level} points`,
      marker: {
        color: excluded.map(() => style.colour),
        // Excluded points stay on the figure, greyed and hollow (§8.1).
        line: {
          width: excluded.map((e) => (e ? 1.5 : 0)),
          color: excluded.map((e) => (e ? EXCLUDED_COLOUR : style.colour)),
        },
        opacity: seriesOpacity(style, 0.75),
        size: style.pointSize,
        symbol: excluded.map((e) => (e ? "circle-open" : style.pointShape)),
      },
      hovertemplate: "%{y:.3f}<br>row %{customdata}<extra></extra>",
      showlegend: false,
    })
  }
  return traces
}

/**
 * Stacked bars as COMPOSITION, not as stacked means.
 *
 * This is the deliberate idiom choice. Stacking means produces a bar whose top
 * is not a quantity anything measured — no sample has the sum of three group
 * means — and from which the reader can recover neither the parts nor a total.
 * The idiom the source document names beside the pie is "pie/stacked
 * composition": parts of a whole. So each segment is the SUM its component
 * contributes to its group, and the full bar height is the group's total, which
 * is a real measured quantity and the same one the pie would slice.
 *
 * Two consequences follow, both intended:
 *   - No error bars. A whisker on a segment floating mid-stack would describe
 *     the spread of a part about a baseline that is itself a sum of OTHER
 *     parts, which is not an interval anyone can read. `stacked-bar` is out of
 *     ERROR_BAR_KINDS so the subtitle stops claiming bars this kind never drew.
 *   - A component absent from a group contributes zero, not a gap: in a
 *     composition "none of this" is a real answer, unlike a missing mean.
 *
 * Components are the second factor's levels when one is mapped; otherwise the
 * response columns, which is the other genuine composition this data carries
 * (several measured fractions of one sample).
 */
function stackedComposition(spec: AnalysisSpec, result: EngineResult): Record<string, unknown>[] {
  const figure = spec.figure
  const levelCol = secondFactor(spec)
  const groupCol = spec.analysis.groupColumn
  const responseCol = spec.analysis.responseColumns[0]

  const groupKeys: string[] = []
  const components: string[] = []
  const totals = new Map<string, number>()
  const members = new Map<string, string[]>()

  const add = (group: string, component: string, value: number, rowId: string) => {
    if (!Number.isFinite(value)) return
    if (!groupKeys.includes(group)) groupKeys.push(group)
    if (!components.includes(component)) components.push(component)
    const key = `${group}\x00${component}`
    totals.set(key, (totals.get(key) ?? 0) + value)
    members.set(key, [...(members.get(key) ?? []), rowId])
  }

  // A segment is a total, so exclusions stay out of it whatever the display
  // flag says — a stack has no individual mark the flag could grey instead.
  for (const row of analysisRows(result)) {
    const group = groupCol ? String(row.values[groupCol] ?? "-") : "All"
    if (levelCol) {
      add(group, String(row.values[levelCol] ?? "-"), Number(row.values[responseCol ?? ""]), row.rowId)
    } else {
      for (const col of spec.analysis.responseColumns) add(group, col, Number(row.values[col]), row.rowId)
    }
  }

  return components.map((component, i) => {
    const style = styleFor(figure, component, i)
    return {
      type: "bar",
      x: groupKeys,
      y: groupKeys.map((g) => totals.get(`${g}\x00${component}`) ?? 0),
      // A segment stands for several rows, so it carries all of their ids —
      // the same convention a summarised time-course vertex uses.
      customdata: groupKeys.map((g) => members.get(`${g}\x00${component}`) ?? []),
      name: component,
      marker: { color: style.colour, opacity: style.opacity },
      hovertemplate: `%{x} · ${component}: %{y:.3f}<extra></extra>`,
    }
  })
}

/**
 * The violin-shaped half of `boxOrViolin`'s trace, or nothing for a box.
 *
 * `spanmode` is the whole point. Plotly's default, "soft", runs the kernel a
 * bandwidth past the extreme observations, so a violin of a concentration, a
 * count or an elapsed time draws visible density BELOW ZERO — a claim about
 * values the assay cannot produce, made by the renderer rather than the data.
 * "hard" clips the estimate to the observed range, which is what makes the
 * silhouette a statement about the sample instead of about the kernel.
 */
function violinShape(figure: AnalysisSpec["figure"], kind: "box" | "violin") {
  if (kind !== "violin") return {}
  return {
    meanline: { visible: true },
    points: "all",
    spanmode: figure.violinTruncate ? "hard" : "soft",
    ...(figure.violinInnerBox ? { box: { visible: true } } : {}),
  }
}

/**
 * The two levels a split violin mirrors, or null when it cannot be drawn.
 *
 * A split violin is two conditions reflected about one tick, so it needs a
 * second factor with EXACTLY two levels. One level has nothing to mirror and
 * three cannot fit on two sides; both are reported on the figure by
 * `idiomNotes` rather than quietly falling back to a plain violin.
 */
function splitLevels(spec: AnalysisSpec, result: EngineResult) {
  if (spec.figure.kind !== "violin" || !spec.figure.violinSplit) return null
  const levelCol = secondFactor(spec)
  if (!levelCol) return null
  const cells = cellRows(spec, result, levelCol)
  return cells.levelKeys.length === 2 ? { levelCol, ...cells } : null
}

/**
 * Two half-violins per group tick, one level to each side.
 *
 * `scalegroup` is shared across every trace so the two sides are scaled by the
 * same rule: half-violins normalised independently would make a group of three
 * replicates as wide as a group of thirty, which is the comparison the reader
 * is making.
 */
function splitViolin(
  spec: AnalysisSpec,
  split: NonNullable<ReturnType<typeof splitLevels>>
) {
  const figure = spec.figure
  const traces: Record<string, unknown>[] = []

  split.levelKeys.forEach((level, li) => {
    const style = styleFor(figure, level, li)
    const droppedY: number[] = []
    const droppedX: string[] = []
    const droppedIds: string[] = []
    // The legend names the LEVEL, not the group, so only the first violin drawn
    // for a level carries an entry and the rest join it by `legendgroup`.
    let legendDone = false

    // One trace per (level, group), where this used to be one trace per level
    // holding every group's violin. Both draw the same picture — `scalegroup`
    // normalises the widths across traces, which is what it is for — but the
    // one-body-per-trace shape is what makes a body click resolvable: Plotly
    // indexes the customdata of a body click by the body's position IN ITS
    // TRACE, so a trace holding G violins handed violin 3 the id of point 3,
    // a row from whichever group happened to sit there. That is a wrong row
    // reported confidently, which is worse than the null it replaced.
    for (const group of split.groupKeys) {
      const cell = split.cells.get(`${group}\x00${level}`)
      if (!cell) continue
      const y: number[] = []
      const ids: string[] = []
      cell.y.forEach((v, k) => {
        // Same rule as the unsplit violin: the density summarises the included
        // replicates, the excluded ones are drawn beside it and never inside.
        if (cell.excluded[k]) {
          droppedY.push(v)
          droppedX.push(group)
          droppedIds.push(cell.rowIds[k])
        } else {
          y.push(v)
          ids.push(cell.rowIds[k])
        }
      })

      traces.push({
        type: "violin",
        x: y.map(() => group),
        y,
        customdata: bodyCustomdata(ids),
        text: ids,
        name: level,
        legendgroup: level,
        showlegend: !legendDone,
        scalegroup: "split",
        side: li === 0 ? "negative" : "positive",
        marker: { color: style.colour, size: style.pointSize },
        line: { color: style.colour, width: style.lineWidth },
        opacity: style.opacity,
        jitter: style.jitter || 0.4,
        pointpos: 0,
        ...violinShape(figure, "violin"),
        hovertemplate: `%{x} · ${level}: %{y:.3f}<br>row %{text}<extra></extra>`,
      })
      legendDone = true
    }

    if (droppedY.length > 0 && figure.showExcludedPoints) {
      traces.push({
        type: "scatter",
        mode: "markers",
        x: droppedX,
        y: droppedY,
        customdata: droppedIds,
        name: `${level} excluded`,
        marker: {
          color: EXCLUDED_COLOUR,
          size: style.pointSize,
          symbol: "circle-open",
          line: { width: 1.5, color: EXCLUDED_COLOUR },
        },
        showlegend: false,
        hovertemplate: "excluded: %{y:.3f}<br>row %{customdata}<extra></extra>",
      })
    }
  })
  return traces
}

function boxOrViolin(spec: AnalysisSpec, result: EngineResult, kind: "box" | "violin") {
  const figure = spec.figure
  const split = splitLevels(spec, result)
  if (split) return splitViolin(spec, split)

  const groups = groupRows(spec, result)
  const traces: Record<string, unknown>[] = []

  for (const [i, [key, g]] of [...groups.entries()].entries()) {
    const style = styleFor(figure, key, i)
    // The box summarises the INCLUDED replicates only. It read `g.y` whole, so
    // an excluded replicate sat inside the quartiles it was excluded from and
    // was drawn in the series colour, indistinguishable from a kept one.
    const keep = g.y.filter((_, k) => !g.excluded[k])
    const keptIds = g.rowIds.filter((_, k) => !g.excluded[k])
    traces.push({
      type: kind,
      y: keep,
      x: keep.map(() => key),
      // The body stands for every row it summarised; the points inside it stand
      // for one each. `bodyCustomdata` is how one array serves both (T0.34).
      customdata: bodyCustomdata(keptIds),
      text: keptIds,
      name: key,
      marker: { color: style.colour, size: style.pointSize },
      line: { color: style.colour, width: style.lineWidth },
      opacity: style.opacity,
      boxpoints: "all",
      jitter: style.jitter || 0.4,
      pointpos: 0,
      ...violinShape(figure, kind),
      hovertemplate: "%{y:.3f}<br>row %{text}<extra></extra>",
    })

    // Drawn, greyed, outside the distribution (§8.1). A separate trace because
    // a box's own points are the ones it summarises, by construction.
    const dropped = g.y.filter((_, k) => g.excluded[k])
    if (dropped.length > 0 && figure.showExcludedPoints) {
      traces.push({
        type: "scatter",
        mode: "markers",
        x: dropped.map(() => key),
        y: dropped,
        customdata: g.rowIds.filter((_, k) => g.excluded[k]),
        name: `${key} excluded`,
        marker: {
          color: EXCLUDED_COLOUR,
          size: style.pointSize,
          symbol: "circle-open",
          line: { width: 1.5, color: EXCLUDED_COLOUR },
        },
        showlegend: false,
        hovertemplate: "excluded: %{y:.3f}<br>row %{customdata}<extra></extra>",
      })
    }
  }
  return traces
}

function doseResponse(spec: AnalysisSpec, result: EngineResult) {
  const figure = spec.figure
  const traces: Record<string, unknown>[] = []
  const fit = result.curveFit
  const style = styleFor(figure, "standards", 0)

  const xCol = spec.analysis.responseColumns[0]
  const yCol = spec.analysis.responseColumns[1]
  if (xCol && yCol) {
    const xs: number[] = []
    const ys: number[] = []
    const ids: string[] = []
    const excluded: boolean[] = []
    for (const row of drawableRows(spec, result)) {
      const x = Number(row.values[xCol])
      const y = Number(row.values[yCol])
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue
      xs.push(x)
      ys.push(y)
      ids.push(row.rowId)
      excluded.push(row.excluded)
    }
    traces.push({
      type: "scatter",
      mode: "markers",
      x: xs,
      y: ys,
      customdata: ids,
      name: "Standards",
      marker: {
        color: excluded.map((e) => (e ? EXCLUDED_COLOUR : style.colour)),
        size: 9,
        symbol: excluded.map((e) => (e ? "circle-open" : style.pointShape)),
      },
      hovertemplate: "%{x}: %{y:.3f}<br>row %{customdata}<extra></extra>",
    })
  }

  if (fit) {
    // The band is drawn first so the fitted line sits on top of it. Gated on
    // showConfidenceBands, which the schema says governs the fit's band as well
    // as Kaplan-Meier's: unticking it used to leave this one on screen.
    if (fit.confidenceBand && figure.showConfidenceBands) {
      traces.push({
        type: "scatter",
        mode: "lines",
        x: [...fit.confidenceBand.x, ...[...fit.confidenceBand.x].reverse()],
        y: [...fit.confidenceBand.upper, ...[...fit.confidenceBand.lower].reverse()],
        fill: "toself",
        fillcolor: "rgba(213,94,0,0.13)",
        line: { width: 0 },
        name: ciLabel(spec.analysis.alpha),
        hoverinfo: "skip",
      })
    }
    traces.push({
      type: "scatter",
      mode: "lines",
      x: fit.curve.x,
      y: fit.curve.y,
      name: `${fit.model} fit`,
      line: { color: "#D55E00", width: 2.5 },
      hoverinfo: "skip",
    })
  }
  return traces
}

/**
 * Line / time-course, one vertex per TIMEPOINT with error bars.
 *
 * It plotted one vertex per raw row and drew no error bars at all, so
 * triplicates at six timepoints came out as an eighteen-vertex zigzag rather
 * than the six summarised points the requirement ("line/time-course with error
 * bars") asks for. Replicates at a shared x are now summarised the same way a
 * bar is, by `errorSpan`, so the whiskers here mean exactly what the whiskers
 * on a bar chart mean and the subtitle labels both correctly.
 */
function lineTimecourse(spec: AnalysisSpec, result: EngineResult) {
  const figure = spec.figure
  const xCol = spec.analysis.groupColumn ?? spec.analysis.responseColumns[0]
  const series = spec.analysis.responseColumns

  return series.map((col, i) => {
    const style = styleFor(figure, col, i)
    // Exclusions never enter the summary; the flag only decides whether their
    // marks appear, and a summarised vertex has no individual mark to grey.
    const at = new Map<string, { x: number | string; ys: number[]; ids: string[] }>()
    for (const row of analysisRows(result)) {
      const y = Number(row.values[col])
      if (!Number.isFinite(y)) continue
      const x = (row.values[xCol ?? ""] as number | string) ?? ""
      const bucket = at.get(String(x)) ?? { x, ys: [], ids: [] }
      bucket.ys.push(y)
      bucket.ids.push(row.rowId)
      at.set(String(x), bucket)
    }
    // Numeric timepoints sort numerically; anything else keeps the order the
    // data supplied, because "Day 10" must not sort before "Day 2".
    const points = [...at.values()]
    if (points.every((p) => typeof p.x === "number")) {
      points.sort((a, b) => (a.x as number) - (b.x as number))
    }
    const spans = points.map((p) => errorSpan(p.ys, figure.errorBars))
    return {
      type: "scatter",
      mode: style.lineStyle === "none" ? "markers" : "lines+markers",
      x: points.map((p) => p.x),
      y: spans.map((s) => s.centre),
      error_y: errorBarProps(spans, figure.errorBars),
      customdata: points.map((p) => p.ids),
      name: col,
      line: { color: style.colour, width: style.lineWidth, dash: style.lineStyle },
      marker: { color: style.colour, size: style.pointSize, symbol: style.pointShape },
      opacity: style.opacity,
      yaxis: axisTarget(figure, style.axis),
      hovertemplate: "%{x}: %{y:.3f}<br>rows %{customdata}<extra></extra>",
    }
  })
}

/**
 * Bin count by Freedman-Diaconis, the rule that survives lab data.
 *
 * Sturges assumes something close to normal and under-bins the long right tails
 * that assay readouts actually have. FD is driven by the IQR instead, so a few
 * extreme wells widen the bins only as much as the bulk of the data says they
 * should. It degenerates when the IQR is zero (heavily tied readings, a plate
 * of saturated wells), and Sturges is the fallback for exactly that case.
 */
function freedmanDiaconisBins(sorted: number[], min: number, max: number): number {
  const n = sorted.length
  const quantile = (q: number) => {
    const pos = (n - 1) * q
    const lo = Math.floor(pos)
    const hi = Math.ceil(pos)
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
  }
  const iqr = quantile(0.75) - quantile(0.25)
  const width = iqr > 0 ? (2 * iqr) / Math.cbrt(n) : 0
  const bins = width > 0 ? Math.ceil((max - min) / width) : Math.ceil(Math.log2(n) + 1)
  // Capped: an FD width that rounds to near zero on a spiky sample would
  // otherwise ask for tens of thousands of bars.
  return Math.min(Math.max(bins, 1), 200)
}

/**
 * One set of bin edges shared by every response column on the figure.
 *
 * Per-series edges would put two overlaid distributions on two different grids,
 * so a taller bar could mean "more rows" or just "a wider bin". A common grid
 * is what makes the overlay a comparison.
 */
function binEdges(values: number[], requested: number | null): number[] {
  if (values.length === 0) return []
  const min = Math.min(...values)
  const max = Math.max(...values)
  // Every reading identical: one bin centred on it, rather than a zero-width
  // grid that divides by zero on a density.
  if (!(max > min)) return [min - 0.5, min + 0.5]
  const sorted = [...values].sort((a, b) => a - b)
  const count = requested ?? freedmanDiaconisBins(sorted, min, max)
  const width = (max - min) / count
  return Array.from({ length: count + 1 }, (_, i) => min + i * width)
}

/**
 * Histograms, binned here rather than by Plotly.
 *
 * `type: "histogram"` bins in the browser and hands the bar back with no route
 * to the rows underneath it, which breaks the module's Tier 0 rule that every
 * mark carries its source row id: a reader could not click a bar back to the
 * spreadsheet. Binning here and emitting `type: "bar"` costs a few lines and
 * gives each bar the ids of every row inside it — the same "a mark that stands
 * for several rows carries all of them" convention `stackedComposition` and the
 * summarised time-course vertices already use.
 *
 * It also makes the normalisation explicit: `histnorm` is a Plotly-side
 * transform we would otherwise have to trust, and a density needs the bin width
 * the reader is being shown, not the one Plotly picked.
 */
function histogram(spec: AnalysisSpec, result: EngineResult) {
  const figure = spec.figure
  // A bin height is a number, so exclusions never enter it (§8.1).
  const rows = analysisRows(result)
  const columns = spec.analysis.responseColumns
  const series = columns.map((col) => {
    const points: { value: number; rowId: string }[] = []
    for (const row of rows) {
      const value = Number(row.values[col])
      if (Number.isFinite(value)) points.push({ value, rowId: row.rowId })
    }
    return { col, points }
  })

  const edges = binEdges(
    series.flatMap((s) => s.points.map((p) => p.value)),
    figure.histogramBins
  )
  if (edges.length < 2) return []
  const lastBin = edges.length - 2

  return series.map(({ col, points }, i) => {
    const style = styleFor(figure, col, i)
    const ids: string[][] = Array.from({ length: edges.length - 1 }, () => [])
    for (const p of points) {
      const raw = Math.floor((p.value - edges[0]) / (edges[1] - edges[0]))
      // The top edge is closed, so the maximum lands in the last bin instead of
      // in a phantom one past the end.
      const bin = Math.min(Math.max(raw, 0), lastBin)
      ids[bin].push(p.rowId)
    }

    const total = points.length
    const height = (count: number, width: number) => {
      switch (figure.histogramNorm) {
        case "probability":
          return total > 0 ? count / total : 0
        case "density":
          return count / width
        case "probability density":
          return total > 0 ? count / (total * width) : 0
        default:
          return count
      }
    }

    return {
      type: "bar",
      x: ids.map((_, b) => (edges[b] + edges[b + 1]) / 2),
      y: ids.map((bin, b) => height(bin.length, edges[b + 1] - edges[b])),
      width: ids.map((_, b) => edges[b + 1] - edges[b]),
      // A bar stands for every row in its bin, so it carries every one of their
      // ids. Tier 0: no mark without a route back to the source row.
      customdata: ids,
      text: ids.map((bin) => `${bin.length} row${bin.length === 1 ? "" : "s"}`),
      name: col,
      marker: {
        color: style.colour,
        // Overlaid series have to be see-through or the last one drawn hides
        // the others; a single series keeps whatever opacity was asked for.
        opacity: columns.length > 1 ? Math.min(style.opacity, 0.6) : style.opacity,
        line: { width: 0 },
      },
      hovertemplate: `${col} %{x:.3g}: %{y:.4g}<br>%{text}<extra></extra>`,
    }
  })
}

/**
 * Kaplan-Meier survival curves.
 *
 * Drawn as true step functions (`shape: "hv"`) because survival is constant
 * between events and drops at one: a straight line between two event times
 * would claim a gradual decline the estimator does not assert. Censoring ticks
 * sit on the curve at each censoring time, which is how a reader sees how much
 * of the tail rests on how few subjects.
 */
function kaplanMeier(spec: AnalysisSpec, result: EngineResult) {
  const figure = spec.figure
  const groups = result.survival?.groups ?? []
  const traces: Record<string, unknown>[] = []

  for (const [i, curve] of groups.entries()) {
    const style = styleFor(figure, curve.label, i)
    if (figure.showConfidenceBands && curve.lower.length === curve.time.length) {
      // Band first so the curve draws on top of it.
      traces.push({
        type: "scatter",
        mode: "lines",
        x: [...curve.time, ...[...curve.time].reverse()],
        y: [...curve.upper, ...[...curve.lower].reverse()],
        fill: "toself",
        fillcolor: withAlpha(style.colour, 0.12),
        line: { width: 0, shape: "hv" },
        hoverinfo: "skip",
        showlegend: false,
        name: `${curve.label} ${ciLabel(spec.analysis.alpha)}`,
      })
    }
    traces.push({
      type: "scatter",
      mode: "lines",
      x: curve.time,
      y: curve.survival,
      name: `${curve.label} (n = ${curve.n})`,
      line: { color: style.colour, width: style.lineWidth, shape: "hv", dash: style.lineStyle },
      hovertemplate: `${curve.label}<br>t = %{x}<br>S(t) = %{y:.3f}<extra></extra>`,
    })

    if (curve.censoredTimes.length > 0) {
      // A censoring tick sits at the survival value in force at that time.
      const at = (t: number) => {
        let s = 1
        for (let k = 0; k < curve.time.length; k++) {
          if (curve.time[k] <= t) s = curve.survival[k]
          else break
        }
        return s
      }
      traces.push({
        type: "scatter",
        mode: "markers",
        x: curve.censoredTimes,
        y: curve.censoredTimes.map(at),
        marker: { symbol: "line-ns-open", size: 9, color: style.colour, line: { width: 1.5 } },
        name: `${curve.label} censored`,
        hovertemplate: `censored at %{x}<extra></extra>`,
        showlegend: false,
      })
    }
  }
  return traces
}

/** Add an alpha channel to a hex colour, for confidence bands. */
function withAlpha(hex: string, alpha: number): string {
  const clean = hex.replace("#", "")
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

/**
 * Heatmap of the response across two categorical columns.
 *
 * Cells hold the mean of the rows that fall in them, and the cell count is
 * carried in the hover so a mean resting on one replicate is not read with the
 * same confidence as one resting on eight.
 */
function heatmap(spec: AnalysisSpec, result: EngineResult) {
  const rowCol = spec.analysis.groupColumn
  const colCol = spec.analysis.secondFactorColumn
  const valueCol = spec.analysis.responseColumns[0]
  if (!rowCol || !colCol || !valueCol) return []

  const rowLevels: string[] = []
  const colLevels: string[] = []
  const cells = new Map<string, number[]>()

  // A cell mean is a number. It read the display flag, so ticking "show
  // excluded points" silently changed what the cells averaged.
  for (const row of analysisRows(result)) {
    const r = String(row.values[rowCol] ?? "-")
    const c = String(row.values[colCol] ?? "-")
    const v = Number(row.values[valueCol])
    if (!Number.isFinite(v)) continue
    if (!rowLevels.includes(r)) rowLevels.push(r)
    if (!colLevels.includes(c)) colLevels.push(c)
    const key = `${r}\x00${c}`
    const bucket = cells.get(key) ?? []
    bucket.push(v)
    cells.set(key, bucket)
  }

  const z = rowLevels.map((r) =>
    colLevels.map((c) => {
      const bucket = cells.get(`${r}\x00${c}`)
      if (!bucket || bucket.length === 0) return null
      return bucket.reduce((a, b) => a + b, 0) / bucket.length
    })
  )
  const counts = rowLevels.map((r) =>
    colLevels.map((c) => cells.get(`${r}\x00${c}`)?.length ?? 0)
  )

  return [
    {
      type: "heatmap",
      x: colLevels,
      y: rowLevels,
      z,
      customdata: counts,
      colorscale: toColorscale(sequentialFor(spec.figure.palette)),
      hovertemplate: "%{y} / %{x}<br>mean %{z:.3f} (n = %{customdata})<extra></extra>",
      colorbar: { title: { text: axisTitle(spec.figure.y) }, thickness: 12, outlinewidth: 0 },
      hoverongaps: false,
    },
  ]
}

/**
 * A sequential ramp to draw a heatmap with.
 *
 * A qualitative palette has no order, so using one for magnitude would encode
 * "bigger" as an arbitrary hue change. If the chosen palette is not already a
 * ramp, the closest safe one is substituted.
 */
function sequentialFor(paletteId: string): string {
  const chosen = PALETTE_DEFINITIONS.find((p) => p.id === paletteId)
  if (chosen && chosen.kind !== "qualitative") return chosen.id
  return "viridis"
}

/**
 * Volcano plot: effect size against significance.
 *
 * Both axes come from columns the user has mapped, because a volcano needs one
 * test per feature and Tier 0's engine runs one test per analysis. The
 * thresholds are drawn from the spec's alpha and the fold-change cut so the
 * lines on the figure are the ones the selection actually used.
 */
function volcanoPoints(spec: AnalysisSpec, result: EngineResult) {
  const xCol = spec.analysis.responseColumns[0]
  const pCol = spec.analysis.responseColumns[1]
  if (!xCol || !pCol) return []

  const labelCol = spec.analysis.groupColumn
  const alpha = spec.analysis.alpha
  const fcCut = spec.figure.volcanoFoldChange

  const rows = drawableRows(spec, result)
  // Underflowed p-values arrive as exactly 0 routinely in genomics, and they
  // are the STRONGEST hits. Dropping them deleted the top of the volcano with
  // no warning, so they are clamped to the smallest positive p actually
  // present — or the float floor when every p underflowed — which keeps them
  // on the figure, at the top, without inventing a magnitude for them.
  const positives = rows
    .map((row) => Number(row.values[pCol]))
    .filter((p) => Number.isFinite(p) && p > 0)
  const pFloor = positives.length > 0 ? Math.min(...positives) : Number.MIN_VALUE

  const points = rows
    .map((row) => {
      const x = Number(row.values[xCol])
      const raw = Number(row.values[pCol])
      if (!Number.isFinite(x) || !Number.isFinite(raw) || raw < 0) return null
      const p = raw > 0 ? raw : pFloor
      return {
        x,
        y: -Math.log10(p),
        rowId: row.rowId,
        label: labelCol ? String(row.values[labelCol] ?? row.rowId) : row.rowId,
        hit: p < alpha && Math.abs(x) >= fcCut,
        excluded: row.excluded,
      }
    })
    .filter((p): p is NonNullable<typeof p> => p !== null)
  return points
}

type VolcanoPoint = ReturnType<typeof volcanoPoints>[number]

/**
 * The significant features that get an on-plot label, most significant first.
 *
 * Ranked by −log10 p and broken by |effect|, which is the order a reader scans
 * a volcano in. Excluded rows are never labelled: a name on the plot reads as a
 * finding, and a row dropped from the analysis has not earned one.
 */
function volcanoLabelled(spec: AnalysisSpec, points: VolcanoPoint[]) {
  const hits = points.filter((p) => p.hit && !p.excluded)
  const ranked = [...hits].sort((a, b) => b.y - a.y || Math.abs(b.x) - Math.abs(a.x))
  return { hits: hits.length, shown: ranked.slice(0, spec.figure.volcanoLabelCount) }
}

function volcano(spec: AnalysisSpec, result: EngineResult) {
  const points = volcanoPoints(spec, result)
  if (points.length === 0) return []
  const style = styleFor(spec.figure, "volcano", 0)
  const { shown } = volcanoLabelled(spec, points)
  const palette = paletteColours(spec.figure.palette)
  return [
    {
      type: "scatter",
      mode: "markers",
      x: points.map((p) => p.x),
      y: points.map((p) => p.y),
      customdata: points.map((p) => p.rowId),
      text: points.map((p) => p.label),
      name: "features",
      marker: {
        color: points.map((p) =>
          p.excluded ? EXCLUDED_COLOUR : p.hit ? palette[1] ?? style.colour : "#9aa0a6"
        ),
        size: style.pointSize,
        opacity: 0.8,
      },
      hovertemplate: "%{text}<br>effect %{x:.3f}<br>-log10 p %{y:.2f}<extra></extra>",
      showlegend: false,
    },
    // The labels ARE the output of a volcano — a reader who cannot get names
    // off it has a scatter of unnamed dots. Only the top hits get one, because
    // twenty thousand overlapping names is the same as none; how many were
    // labelled and how many qualified is stated in the subtitle, so the bound
    // is visible rather than a silent truncation.
    ...(shown.length > 0
      ? [
          {
            type: "scatter",
            mode: "text",
            x: shown.map((p) => p.x),
            y: shown.map((p) => p.y),
            customdata: shown.map((p) => p.rowId),
            text: shown.map((p) => p.label),
            textposition: "top center",
            textfont: { size: Math.max(spec.figure.axisFontSize - 3, 7) },
            name: "labels",
            hoverinfo: "skip",
            showlegend: false,
          },
        ]
      : []),
  ]
}

/**
 * Composition pie.
 *
 * Offered because reviewers ask for it, with a donut hole by default: judging
 * angle is harder than judging length, and the hole at least removes the
 * misleading centre. Slices are counts of rows per category, or the summed
 * response when one is mapped.
 */
function pieComposition(spec: AnalysisSpec, result: EngineResult) {
  const labelCol = spec.analysis.groupColumn
  const valueCol = spec.analysis.responseColumns[0]
  if (!labelCol) return []

  const totals = new Map<string, number>()
  // A slice is a total, so exclusions stay out of it whatever the display flag
  // says; a pie has no individual mark the flag could grey instead.
  for (const row of analysisRows(result)) {
    const key = String(row.values[labelCol] ?? "-")
    const add = valueCol ? Number(row.values[valueCol]) : 1
    if (!Number.isFinite(add)) continue
    totals.set(key, (totals.get(key) ?? 0) + add)
  }

  const labels = [...totals.keys()]
  return [
    {
      type: "pie",
      labels,
      values: labels.map((l) => totals.get(l)!),
      hole: 0.45,
      marker: { colors: labels.map((l, i) => styleFor(spec.figure, l, i).colour) },
      textinfo: "label+percent",
      hovertemplate: `%{label}<br>${valueCol ? "total" : "rows"} %{value}<br>%{percent}<extra></extra>`,
      sort: false,
    },
  ]
}


/* ── Additional chart kinds ────────────────────────────────────────────────*/

/** Numeric series for a column, paired with the rows they came from. */
function numericSeries(spec: AnalysisSpec, result: EngineResult, column: string) {
  const xs: number[] = []
  const ids: string[] = []
  // Feeds the ECDF, the Q-Q quantiles and the correlation matrix — all derived
  // curves, so exclusions never enter them regardless of the display flag.
  for (const row of analysisRows(result)) {
    const v = Number(row.values[column])
    if (!Number.isFinite(v)) continue
    xs.push(v)
    ids.push(row.rowId)
  }
  return { values: xs, rowIds: ids }
}

/**
 * Bars laid on their side: group means on x, group names on y.
 *
 * It used to serve the stacked kind too, with `horizontal: false` — which is
 * how `stacked-bar` came to be a single trace of means that `barmode: "stack"`
 * had nothing to stack. Stacking is a composition now (`stackedComposition`)
 * and shares nothing with this, so the flag is gone.
 */
function horizontalBar(spec: AnalysisSpec, result: EngineResult) {
  const figure = spec.figure
  const groups = groupRows(spec, result)
  const keys = [...groups.keys()]
  // Same source of truth as `barWithPoints`: the engine's descriptives first,
  // the included values otherwise. Never the raw group, exclusions and all.
  const spans = keys.map((k) =>
    errorSpan(includedValues(groups.get(k)!), figure.errorBars, descriptiveFor(result, k))
  )
  return [
    {
      type: "bar",
      x: spans.map((s) => s.centre),
      y: keys,
      orientation: "h" as const,
      marker: { color: keys.map((k, i) => styleFor(figure, k, i).colour) },
      error_x: errorBarProps(spans, figure.errorBars),
      hovertemplate: "%{y}: %{x:.3f}<extra></extra>",
      showlegend: false,
    },
  ]
}

/** Filled area under each series, for cumulative or compositional timecourses. */
function areaChart(spec: AnalysisSpec, result: EngineResult) {
  const figure = spec.figure
  const xCol = spec.analysis.groupColumn ?? spec.roles.find((r) => r.role === "time")?.column
  // Left-axis bands first. `tonexty` fills to the PREVIOUS TRACE in the data
  // array, so a secondary-axis band sitting between two left-axis ones would
  // silently become the baseline of the next. Grouping by axis keeps each
  // stack contiguous; the sort is stable, so within an axis the column order
  // the user chose survives.
  const series = spec.analysis.responseColumns
    .map((col, i) => ({ col, style: styleFor(figure, col, i) }))
    .sort((a, b) => Number(a.style.axis === "right") - Number(b.style.axis === "right"))
  const grounded = new Set<string>()
  return series.map(({ col, style }) => {
    const target = axisTarget(figure, style.axis)
    // A band on the secondary axis is not part of the primary stack, so it
    // rests on its own zero rather than on whatever the last band reached.
    const first = !grounded.has(target)
    grounded.add(target)
    // A band's outline is a shape, not a set of marks: an excluded vertex would
    // deform it, so exclusions stay out whatever the display flag says.
    const points = analysisRows(result)
      .map((r) => ({ x: xCol ? Number(r.values[xCol]) : 0, y: Number(r.values[col]), id: r.rowId }))
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
      .sort((a, b) => a.x - b.x)
    return {
      type: "scatter",
      mode: "lines",
      // "tonexty" on every trace after the first stacks the bands, which is
      // what an area chart of parts of a whole is for.
      fill: first ? "tozeroy" : "tonexty",
      fillcolor: withAlpha(style.colour, 0.35),
      yaxis: target,
      x: points.map((p) => p.x),
      y: points.map((p) => p.y),
      customdata: points.map((p) => p.id),
      name: col,
      line: { color: style.colour, width: style.lineWidth },
      hovertemplate: `${col}<br>%{x}: %{y:.3f}<extra></extra>`,
    }
  })
}

/** Bubble plot: x, y and a third variable encoded as marker area. */
function bubbleChart(spec: AnalysisSpec, result: EngineResult) {
  const figure = spec.figure
  const [xCol, yCol, sizeCol] = spec.analysis.responseColumns
  if (!xCol || !yCol) return []
  const style = styleFor(figure, yCol, 0)
  const rows = drawableRows(spec, result)
  const sizes = sizeCol ? rows.map((r) => Number(r.values[sizeCol])) : []
  const maxSize = sizes.length > 0 ? Math.max(...sizes.filter(Number.isFinite)) : 0
  return [
    {
      type: "scatter",
      mode: "markers",
      x: rows.map((r) => Number(r.values[xCol])),
      y: rows.map((r) => Number(r.values[yCol])),
      customdata: rows.map((r) => r.rowId),
      marker: {
        color: style.colour,
        opacity: seriesOpacity(style, 0.7),
        // Area, not diameter: encoding the value as radius exaggerates it by
        // the square, which is the classic bubble-chart lie.
        size: sizeCol && maxSize > 0
          ? sizes.map((v) => (Number.isFinite(v) ? 6 + 34 * Math.sqrt(Math.max(v, 0) / maxSize) : 6))
          : style.pointSize,
        sizemode: "diameter",
      },
      name: sizeCol ? `${yCol} (size: ${sizeCol})` : yCol,
      hovertemplate: "%{x:.3f}, %{y:.3f}<extra></extra>",
    },
  ]
}

/** Empirical cumulative distribution: the distribution without binning choices. */
function ecdfChart(spec: AnalysisSpec, result: EngineResult) {
  return spec.analysis.responseColumns.map((col, i) => {
    const style = styleFor(spec.figure, col, i)
    const { values } = numericSeries(spec, result, col)
    const sorted = [...values].sort((a, b) => a - b)
    return {
      type: "scatter",
      mode: "lines",
      // A step, not a slope: the ECDF is constant between observations.
      line: { color: style.colour, width: style.lineWidth, shape: "hv" },
      x: sorted,
      y: sorted.map((_, k) => (k + 1) / sorted.length),
      name: col,
      hovertemplate: `${col}<br>%{x:.3f} → %{y:.3f}<extra></extra>`,
    }
  })
}

/** Normal quantile-quantile plot, with the reference line the eye needs. */
function qqChart(spec: AnalysisSpec, result: EngineResult) {
  const traces: Record<string, unknown>[] = []
  let lo = Infinity
  let hi = -Infinity
  for (const [i, col] of spec.analysis.responseColumns.entries()) {
    const style = styleFor(spec.figure, col, i)
    const { values } = numericSeries(spec, result, col)
    const sorted = [...values].sort((a, b) => a - b)
    const n = sorted.length
    if (n === 0) continue
    const mean = sorted.reduce((a, b) => a + b, 0) / n
    const sd = Math.sqrt(sorted.reduce((a, v) => a + (v - mean) ** 2, 0) / Math.max(n - 1, 1))
    // Blom's plotting position: the convention Prism and R both use.
    const theoretical = sorted.map((_, k) => normalQuantile((k + 1 - 0.375) / (n + 0.25)))
    for (const t of theoretical) {
      lo = Math.min(lo, t * sd + mean)
      hi = Math.max(hi, t * sd + mean)
    }
    // Q-Q's y is the observed value in the column's OWN units, so two columns
    // measured differently genuinely need two scales — and the reference line
    // has to follow its column onto that scale or it stops being its reference.
    const target = axisTarget(spec.figure, style.axis)
    traces.push({
      type: "scatter",
      mode: "markers",
      x: theoretical,
      y: sorted,
      name: col,
      yaxis: target,
      marker: { color: style.colour, size: style.pointSize },
      hovertemplate: `${col}<br>expected %{x:.3f}, observed %{y:.3f}<extra></extra>`,
    })
    traces.push({
      type: "scatter",
      mode: "lines",
      x: [-3, 3],
      y: [-3 * sd + mean, 3 * sd + mean],
      yaxis: target,
      line: { color: style.colour, width: 1, dash: "dot" },
      showlegend: false,
      hoverinfo: "skip",
      name: `${col} reference`,
    })
  }
  return traces
}

/** Inverse normal CDF (Acklam's rational approximation, ~1e-9 accurate). */
function normalQuantile(p: number): number {
  if (p <= 0) return -Infinity
  if (p >= 1) return Infinity
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239]
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1]
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783]
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416]
  const pLow = 0.02425
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p))
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  }
  if (p > 1 - pLow) return -normalQuantile(1 - p)
  const q = p - 0.5
  const r = q * q
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
}

/** Correlation matrix across the chosen numeric columns. */
function correlationMatrix(spec: AnalysisSpec, result: EngineResult) {
  const cols = spec.analysis.responseColumns.length > 0
    ? spec.analysis.responseColumns
    : [...new Set(result.plotData.flatMap((r) => Object.keys(r.values)))].filter((c) =>
        result.plotData.some((r) => Number.isFinite(Number(r.values[c])))
      )
  if (cols.length < 2) return []
  const series = cols.map((c) => numericSeries(spec, result, c).values)
  const z = series.map((a) => series.map((b) => pearson(a, b)))
  return [
    {
      type: "heatmap",
      x: cols,
      y: cols,
      z,
      zmin: -1,
      zmax: 1,
      // A correlation is signed, so it needs a diverging ramp centred on zero.
      colorscale: toColorscale(divergingFor(spec.figure.palette)),
      hovertemplate: "%{y} vs %{x}<br>r = %{z:.3f}<extra></extra>",
      colorbar: { title: { text: "r" }, thickness: 12, outlinewidth: 0 },
    },
  ]
}

function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length)
  if (n < 2) return Number.NaN
  const ma = a.slice(0, n).reduce((x, y) => x + y, 0) / n
  const mb = b.slice(0, n).reduce((x, y) => x + y, 0) / n
  let num = 0
  let da = 0
  let db = 0
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma
    const y = b[i] - mb
    num += x * y
    da += x * x
    db += y * y
  }
  return da > 0 && db > 0 ? num / Math.sqrt(da * db) : Number.NaN
}

/** A diverging ramp, substituted when the chosen palette has no midpoint. */
function divergingFor(paletteId: string): string {
  const chosen = PALETTE_DEFINITIONS.find((p) => p.id === paletteId)
  return chosen && chosen.kind === "diverging" ? chosen.id : "rdbu"
}

/** Bland-Altman agreement: difference against mean, with the limits drawn. */
function blandAltmanChart(spec: AnalysisSpec, result: EngineResult) {
  const [aCol, bCol] = spec.analysis.responseColumns
  if (!aCol || !bCol) return []
  const style = styleFor(spec.figure, aCol, 0)
  const rows = drawableRows(spec, result)
  const pts = rows
    .map((r) => ({ a: Number(r.values[aCol]), b: Number(r.values[bCol]), id: r.rowId }))
    .filter((p) => Number.isFinite(p.a) && Number.isFinite(p.b))
  return [
    {
      type: "scatter",
      mode: "markers",
      x: pts.map((p) => (p.a + p.b) / 2),
      y: pts.map((p) => p.a - p.b),
      customdata: pts.map((p) => p.id),
      name: `${aCol} vs ${bCol}`,
      marker: { color: style.colour, size: style.pointSize, opacity: 0.8 },
      hovertemplate: "mean %{x:.3f}<br>difference %{y:.3f}<extra></extra>",
    },
  ]
}

/** ROC curve with the chance diagonal. */
function rocChart(spec: AnalysisSpec, result: EngineResult) {
  const [truthCol, scoreCol] = spec.analysis.responseColumns
  if (!truthCol || !scoreCol) return []
  // The curve and its AUC are computed, so the display flag must not reach
  // them: showing an excluded row used to move the reported AUC.
  const rows = analysisRows(result)
  const truth = rows.map((r) => Number(r.values[truthCol]))
  const score = rows.map((r) => Number(r.values[scoreCol]))
  const style = styleFor(spec.figure, scoreCol, 0)
  const roc = rocCurve(truth, score)
  return [
    {
      type: "scatter",
      mode: "lines",
      x: [0, 1],
      y: [0, 1],
      line: { color: "#9aa0a6", width: 1, dash: "dot" },
      name: "chance",
      hoverinfo: "skip",
      showlegend: false,
    },
    {
      type: "scatter",
      mode: "lines",
      x: roc.fpr,
      y: roc.tpr,
      line: { color: style.colour, width: style.lineWidth, shape: "hv" },
      fill: "tozeroy",
      fillcolor: withAlpha(style.colour, 0.12),
      name: `ROC (AUC = ${Number.isFinite(roc.auc) ? roc.auc.toFixed(3) : "-"})`,
      hovertemplate: "FPR %{x:.3f}, TPR %{y:.3f}<extra></extra>",
    },
  ]
}

/** Forest plot: an estimate and its interval per row, with the null line. */
function forestChart(spec: AnalysisSpec, result: EngineResult) {
  const [estCol, loCol, hiCol] = spec.analysis.responseColumns
  const labelCol = spec.analysis.groupColumn
  if (!estCol || !loCol || !hiCol) return []
  const style = styleFor(spec.figure, estCol, 0)
  const rows = drawableRows(spec, result)
  const items = rows
    .map((r) => ({
      label: labelCol ? String(r.values[labelCol] ?? r.rowId) : r.rowId,
      est: Number(r.values[estCol]),
      lo: Number(r.values[loCol]),
      hi: Number(r.values[hiCol]),
      id: r.rowId,
    }))
    .filter((d) => Number.isFinite(d.est) && Number.isFinite(d.lo) && Number.isFinite(d.hi))
  return [
    {
      type: "scatter",
      mode: "markers",
      x: items.map((d) => d.est),
      y: items.map((d) => d.label),
      customdata: items.map((d) => d.id),
      // Asymmetric on purpose: a confidence interval is rarely symmetric about
      // its estimate once it has been back-transformed.
      error_x: {
        type: "data",
        symmetric: false,
        array: items.map((d) => d.hi - d.est),
        arrayminus: items.map((d) => d.est - d.lo),
        thickness: 1.4,
        width: 5,
        color: style.colour,
      },
      marker: { color: style.colour, size: 9, symbol: "square" },
      name: estCol,
      hovertemplate: "%{y}<br>%{x:.3f}<extra></extra>",
    },
  ]
}

/** Three-dimensional scatter and surface, for the rare figure that needs one. */
function threeD(spec: AnalysisSpec, result: EngineResult, surface: boolean) {
  const [xCol, yCol, zCol] = spec.analysis.responseColumns
  if (!xCol || !yCol || !zCol) return []
  // The scatter is marks, so the display flag governs it. The surface is a
  // computed grid — hiding a row there removed a whole gridline and reshaped
  // the surface, which is the flag moving a number.
  const rows = surface ? analysisRows(result) : drawableRows(spec, result)
  const style = styleFor(spec.figure, zCol, 0)
  if (surface) {
    // A surface needs a grid; the rows are gathered into one keyed by x and y.
    const xs = [...new Set(rows.map((r) => Number(r.values[xCol])))].sort((a, b) => a - b)
    const ys = [...new Set(rows.map((r) => Number(r.values[yCol])))].sort((a, b) => a - b)
    const cell = new Map<string, number>()
    for (const r of rows) cell.set(`${r.values[xCol]}|${r.values[yCol]}`, Number(r.values[zCol]))
    return [
      {
        type: "surface",
        x: xs,
        y: ys,
        z: ys.map((y) => xs.map((x) => cell.get(`${x}|${y}`) ?? null)),
        colorscale: toColorscale(sequentialFor(spec.figure.palette)),
        showscale: true,
      },
    ]
  }
  return [
    {
      type: "scatter3d",
      mode: "markers",
      x: rows.map((r) => Number(r.values[xCol])),
      y: rows.map((r) => Number(r.values[yCol])),
      z: rows.map((r) => Number(r.values[zCol])),
      customdata: rows.map((r) => r.rowId),
      marker: { color: style.colour, size: Math.max(3, style.pointSize - 2), opacity: seriesOpacity(style, 0.85) },
      name: zCol,
    },
  ]
}

/* ── Significance brackets (§2, §6.4) ──────────────────────────────────────*/

/**
 * Brackets driven by the post-hoc result, drawn as shapes plus annotations.
 *
 * Only SIGNIFICANT comparisons are drawn by default, a figure carrying a
 * bracket for every pair is unreadable, and the full table is one click away in
 * the results panel. A bracket the user has dragged keeps its offset, because
 * `derived` was cleared when they moved it.
 */
function significanceLayer(spec: AnalysisSpec, result: EngineResult) {
  const shapes: Record<string, unknown>[] = []
  const annotations: Record<string, unknown>[] = []
  /**
   * One entry per bracket shape, in the order the shapes are pushed, so a
   * pointer drag reported as `shapes[2].y0` can be turned back into "this
   * comparison, moved this far". `baseY` is where the auto-placement put the
   * bracket, which is what the stored offset is measured from.
   */
  const brackets: { id: string; baseY: number; y: number }[] = []
  /**
   * End ticks. `capLength` is in PIXELS, which a data-coordinate line cannot
   * express, so each cap is its own shape anchored to the bracket's y with
   * `ysizemode: "pixel"`. They are appended AFTER every bracket line rather
   * than interleaved because `bracketMoveFromRelayout` maps `shapes[i]` back to
   * `brackets[i]`: the leading run must stay exactly one shape per bracket, or
   * a drag would be read as a move of the wrong comparison.
   */
  const caps: Record<string, unknown>[] = []
  const pairwise = result.test?.pairwise ?? []
  if (pairwise.length === 0) return { shapes, annotations, brackets }

  const groups = groupRows(spec, result)
  // Bar charts sit on a numbered axis, so a bracket addressed by group name
  // would have no position on it and collapse to the origin. Resolve each end
  // to the group's index there, and keep the name on a true category axis.
  const keys = [...groups.keys()]
  const at = (group: string): number | string => {
    if (!NUMBERED_X.has(spec.figure.kind)) return group
    const index = keys.indexOf(group)
    return index >= 0 ? index : group
  }
  const maxY = Math.max(
    ...[...groups.values()].flatMap((g) => g.y),
    ...(result.test?.pairwise.map(() => 0) ?? [0])
  )
  if (!Number.isFinite(maxY)) return { shapes, annotations, brackets }

  const step = maxY * 0.08
  let level = 0

  for (const pair of pairwise) {
    if (!pair.significant) continue
    const pairId = bracketId(pair.groupA, pair.groupB)
    // Matched by the pair either way: a hand-authored bracket names its groups,
    // a dragged one carries the pair in its id. Both are the same comparison.
    const custom = spec.figure.brackets.find(
      (b) => b.id === pairId || (b.fromGroup === pair.groupA && b.toGroup === pair.groupB)
    )
    // Hiding, not deleting, is how a comparison leaves the figure: a derived
    // bracket deleted from the spec is regenerated by the next recompute, so
    // the row has to stay and say "not this one". `level` is not spent either,
    // which is what lets the brackets above a hidden one drop down into the gap
    // instead of leaving a hole.
    if (custom?.hidden) continue
    const baseY = maxY + step * (level + 1)
    const y = baseY + (custom?.offsetY ?? 0)
    brackets.push({ id: custom?.id ?? pairId, baseY, y })
    level += 1

    const colour = custom?.colour ?? "#444"
    const lineWidth = custom?.lineWidth ?? 1
    shapes.push({
      type: "line",
      xref: "x",
      yref: "y",
      x0: at(pair.groupA),
      x1: at(pair.groupB),
      y0: y,
      y1: y,
      line: { color: colour, width: lineWidth },
    })
    const a = at(pair.groupA)
    const b = at(pair.groupB)
    const capLength = custom?.capLength ?? 0
    if (capLength > 0) {
      for (const x of [a, b]) {
        caps.push({
          type: "line",
          xref: "x",
          yref: "y",
          x0: x,
          x1: x,
          // Pixel offsets measured down from the bracket line itself.
          ysizemode: "pixel",
          yanchor: y,
          y0: 0,
          y1: -capLength,
          line: { color: colour, width: lineWidth },
        })
      }
    }
    annotations.push({
      // Centred over the bracket. Anchoring the star to the left-hand group put
      // it above that bar rather than above the comparison it labels.
      x: typeof a === "number" && typeof b === "number" ? (a + b) / 2 : a,
      xref: "x",
      yref: "y",
      y: y + step * 0.15,
      // Stars or the numeric p, per the bracket's display setting.
      text:
        custom?.display === "p-value"
          ? `p = ${pair.pAdjusted.toPrecision(2)}`
          : custom?.display === "both"
            ? `${significanceStars(pair.pAdjusted)} (p = ${pair.pAdjusted.toPrecision(2)})`
            : significanceStars(pair.pAdjusted),
      showarrow: false,
      font: {
        size: custom?.fontSize ?? Math.max(spec.figure.axisFontSize - 1, 8),
        // `colour` is documented as the line AND label colour. Only set when the
        // researcher chose one, so an untouched bracket's star keeps inheriting
        // the layout font rather than being frozen at the line's default.
        ...(custom?.colour ? { color: custom.colour } : {}),
      },
      xanchor: "center",
      xshift: 0,
    })
  }
  return { shapes: [...shapes, ...caps], annotations, brackets }
}

/* ── Entry point ───────────────────────────────────────────────────────────*/

export function buildFigure(
  spec: AnalysisSpec,
  result: EngineResult | null,
  options: {
    /**
     * Let the figure fill its container instead of taking the spec's exact
     * pixel dimensions. On screen the figure lives in a resizable dock, so it
     * has to track the dock; the spec's width and height are the *export*
     * size and are honoured when writing the file.
     */
    fill?: boolean
  } = {}
): PlotlyFigure {
  const figure = spec.figure
  const empty: PlotlyFigure = { data: [], layout: {} }
  if (!result) return empty

  let data: Record<string, unknown>[]
  switch (figure.kind) {
    case "bar-scatter-error":
      data = barWithPoints(spec, result)
      break
    case "grouped-bar":
      data = groupedBar(spec, result)
      break
    case "box":
      data = boxOrViolin(spec, result, "box")
      break
    case "violin":
      data = boxOrViolin(spec, result, "violin")
      break
    case "dose-response":
    case "xy-scatter-fit":
      data = doseResponse(spec, result)
      break
    case "line-timecourse":
      data = lineTimecourse(spec, result)
      break
    case "histogram":
      data = histogram(spec, result)
      break
    case "kaplan-meier":
      data = kaplanMeier(spec, result)
      break
    case "heatmap":
      data = heatmap(spec, result)
      break
    case "volcano":
      data = volcano(spec, result)
      break
    case "pie-composition":
      data = pieComposition(spec, result)
      break
    case "stacked-bar":
      data = stackedComposition(spec, result)
      break
    case "horizontal-bar":
      data = horizontalBar(spec, result)
      break
    case "area":
      data = areaChart(spec, result)
      break
    case "bubble":
      data = bubbleChart(spec, result)
      break
    case "ecdf":
      data = ecdfChart(spec, result)
      break
    case "qq":
      data = qqChart(spec, result)
      break
    case "correlation-matrix":
      data = correlationMatrix(spec, result)
      break
    case "bland-altman":
      data = blandAltmanChart(spec, result)
      break
    case "roc":
      data = rocChart(spec, result)
      break
    case "forest":
      data = forestChart(spec, result)
      break
    case "scatter-3d":
      data = threeD(spec, result, false)
      break
    case "surface-3d":
      data = threeD(spec, result, true)
      break
  }

  const { shapes, annotations, brackets } = significanceLayer(spec, result)

  // A volcano's cut-offs are drawn, because a reader cannot otherwise tell
  // which points the colouring called hits.
  if (figure.kind === "volcano") {
    const y = -Math.log10(spec.analysis.alpha)
    shapes.push({
      type: "line",
      xref: "paper",
      x0: 0,
      x1: 1,
      yref: "y",
      y0: y,
      y1: y,
      line: { color: "#9aa0a6", width: 1, dash: "dot" },
    })
    for (const x of [-figure.volcanoFoldChange, figure.volcanoFoldChange]) {
      if (x === 0) continue
      shapes.push({
        type: "line",
        xref: "x",
        x0: x,
        x1: x,
        yref: "paper",
        y0: 0,
        y1: 1,
        line: { color: "#9aa0a6", width: 1, dash: "dot" },
      })
    }
  }

  // Free-text and arrow annotations from the spec, on top of the derived ones.
  for (const a of figure.annotations) {
    if (a.kind === "text") {
      annotations.push({
        x: a.x,
        y: a.y,
        text: a.text,
        showarrow: false,
        font: { size: a.fontSize, color: a.colour },
      })
    } else if (a.kind === "arrow") {
      annotations.push({
        x: a.x2,
        y: a.y2,
        ax: a.x1,
        ay: a.y1,
        xref: "x",
        yref: "y",
        axref: "x",
        ayref: "y",
        text: "",
        showarrow: true,
        arrowhead: 3,
        arrowcolor: a.colour,
      })
    } else {
      shapes.push({
        // Plotly's shape types are circle/rect/line/path only, so the schema's
        // "ellipse" was handed straight through and silently drew nothing. A
        // circle stretched by its bounding box IS an ellipse in Plotly.
        type: a.shape === "ellipse" ? "circle" : a.shape,
        x0: a.x1,
        y0: a.y1,
        x1: a.x2,
        y1: a.y2,
        line: { color: a.colour, width: 1.5 },
      })
    }
  }

  // The error-bar choice is stated on the figure (§2), appended to the title so
  // it survives export. It is not decoration: a bar chart whose error bars are
  // unlabelled is uninterpretable.
  // Only where bars are actually drawn. `errorBars` defaults to "sd", so an
  // unconditional append put "mean ± SD" under a pie chart, a heatmap and a
  // volcano — figures with no error bar anywhere on them.
  const errorNote = ERROR_BAR_KINDS.has(figure.kind) ? ERROR_BAR_LABEL[figure.errorBars] : ""
  // A silent no-op is worse than a refusal. A series marked `axis: "right"` on
  // a kind that cannot carry a second scale used to be accepted and drawn on
  // the left, which on the page is indistinguishable from never having asked.
  // Which kinds can, and why the rest cannot, is SECONDARY_AXIS_KINDS.
  const axisNote =
    figure.series.some((s) => s.axis === "right") && !SECONDARY_AXIS_KINDS.has(figure.kind)
      ? "secondary axis not available for this chart kind"
      : ""
  // Planned before the layout is built (it reads the traces as the kind drew
  // them) and applied after (it rewrites the axes the layout declares), so the
  // note is available to the subtitle either way.
  const { plan: breakPlan, note: breakNote } = planAxisBreak(figure, data)
  const subtitleBits = [
    figure.subtitle,
    errorNote,
    axisNote,
    breakNote,
    ...idiomNotes(spec, result),
  ].filter(Boolean)
  // Always subordinate type: with no title of its own, an untitled figure was
  // promoting "mean ± SD" to the headline at full title weight.
  const subtitleText =
    subtitleBits.length > 0
      ? `<span style="font-size:${Math.round(figure.titleFontSize * 0.62)}px;opacity:0.65">${subtitleBits.join(" · ")}</span>`
      : ""
  const titleText = figure.title
    ? subtitleText
      ? `${figure.title}<br>${subtitleText}`
      : figure.title
    : subtitleText

  const layout: Record<string, unknown> = {
    title: { text: titleText, font: { size: figure.titleFontSize } },
    font: { family: FONT_STACK[figure.fontFamily], size: 12 },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    xaxis: buildAxis(
      figure.x,
      figure,
      NUMBERED_X.has(figure.kind) ? categoryTicks([...groupRows(spec, result).keys()]) : {},
      CATEGORICAL_X.has(figure.kind)
    ),
    yaxis: buildAxis(figure.y, figure),
    showlegend: figure.showLegend && figure.legendPosition !== "none",
    legend:
      figure.legendPosition === "right"
        ? { orientation: "v", x: 1.02, y: 1 }
        : figure.legendPosition === "top"
          ? { orientation: "h", y: 1.12 }
          : { orientation: "h", y: -0.22 },
    margin: { t: subtitleBits.length > 0 ? 70 : 50, r: 24, b: 60, l: 70 },
    ...(options.fill
      ? { autosize: true }
      : { width: figure.width, height: figure.height }),
    shapes,
    annotations,
    // Overlaid histograms need "overlay" plus the per-trace opacity `histogram`
    // sets; "stack" would add the series and draw a distribution nobody has.
    barmode:
      figure.kind === "histogram"
        ? "overlay"
        : figure.kind === "grouped-bar"
          ? "group"
          : "stack",
    // Forest and horizontal bars put the categories on y, so that axis is the
    // categorical one and x carries the estimate.
    ...(figure.kind === "forest" || figure.kind === "horizontal-bar"
      ? { yaxis: { ...buildAxis(figure.y, figure, {}, true), automargin: true } }
      : {}),
  }

  // The axis is created whenever a trace actually targets it, not only when the
  // spec happens to carry a `y2`. A trace pointed at an axis Plotly was never
  // told about is dropped from the figure altogether — the one outcome worse
  // than ignoring the request.
  if (figure.y2 || data.some((t) => t.yaxis === "y2")) {
    layout.yaxis2 = buildAxis(figure.y2 ?? IMPLIED_Y2, figure, { overlaying: "y", side: "right" }, false, "y2")
  }

  // Last, because it duplicates the traces onto a y2 of its own: running before
  // the block above would have that block overwrite the upper segment's axis
  // with a right-hand overlay. `planAxisBreak` refuses whenever the figure
  // already has a second scale, so the two can never both fire.
  if (breakPlan) {
    applyAxisBreak(layout, data, shapes, annotations, breakPlan)
  }

  return { data, layout, brackets }
}

/* ── Reading pointer events back ───────────────────────────────────────────*/

/**
 * The source row a clicked or hovered mark belongs to, or null.
 *
 * Every per-row mark carries its row id in `customdata` (see the file header),
 * but the SUMMARY traces carry the group name there instead: a bar's customdata
 * is its category, because that is what the bar is. Checking the id against the
 * rows the engine actually emitted is what keeps a bar click from opening an
 * exclusion dialog for a row called "Vehicle".
 */
export function rowIdAtPoint(
  points: { customdata?: unknown }[] | undefined | null,
  result: EngineResult | null
): string | null {
  const point = points?.[0]?.customdata
  // A summarised vertex — a time-course mean over its replicates — stands for
  // several rows, so it carries all of their ids. The link opens the first;
  // returning null there would make the aggregated kinds un-hit-testable.
  const raw = Array.isArray(point) ? point[0] : point
  if (typeof raw !== "string" || raw.length === 0) return null
  return result?.plotData.some((row) => row.rowId === raw) ? raw : null
}

/**
 * A dragged significance bracket, as the mutation that records the drag.
 *
 * Plotly reports a shape drag as a relayout patch keyed by the shape's index
 * (`shapes[2].y0`), which is meaningless on its own; `brackets` from
 * `buildFigure` is what turns the index back into a comparison. The offset is
 * measured from the auto-placed position rather than from the previous offset,
 * so repeated drags do not accumulate rounding.
 */
export function bracketMoveFromRelayout(
  patch: Record<string, unknown> | null | undefined,
  brackets: { id: string; baseY: number; y: number }[] | undefined
): { id: string; offsetY: number } | null {
  if (!patch || !brackets || brackets.length === 0) return null
  for (const [key, value] of Object.entries(patch)) {
    const match = /^shapes\[(\d+)\]\.y0$/.exec(key)
    if (!match) continue
    const bracket = brackets[Number(match[1])]
    if (!bracket || typeof value !== "number" || !Number.isFinite(value)) continue
    // A purely sideways drag reports y0 unchanged. Recording that as an edit
    // would put an undo step and a provenance line behind a figure that did not
    // move, which is worse than doing nothing.
    if (value === bracket.y) return null
    return { id: bracket.id, offsetY: value - bracket.baseY }
  }
  return null
}
