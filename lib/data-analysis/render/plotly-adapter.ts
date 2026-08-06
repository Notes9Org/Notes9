import type { AnalysisSpec } from "@/lib/data-analysis/spec/analysis-spec"
import type { EngineResult } from "@/lib/data-analysis/engine/contract"
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
 */
const CATEGORICAL_X = new Set<AnalysisSpec["figure"]["kind"]>(["box", "violin"])

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
  categorical = false
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    title: { text: axisTitle(axis), font: { size: figure.axisFontSize } },
    type: axis.scale === "log10" ? "log" : categorical ? "category" : "linear",
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
      axis.scale === "log10"
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

function errorValue(
  values: number[],
  kind: AnalysisSpec["figure"]["errorBars"]
): number | null {
  const n = values.length
  if (n === 0 || kind === "none") return null
  const mean = values.reduce((a, b) => a + b, 0) / n
  const sorted = [...values].sort((a, b) => a - b)
  const quantile = (p: number) => {
    const idx = (sorted.length - 1) * p
    const lo = Math.floor(idx)
    const hi = Math.ceil(idx)
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
  }

  if (kind === "range") return Math.max(...values) - mean
  if (kind === "iqr") return quantile(0.75) - quantile(0.25)
  if (kind === "mad") {
    // Median absolute deviation, scaled to be comparable with an SD on normal
    // data. Reported unscaled would make a robust bar look artificially small
    // beside the SD bars it is meant to replace.
    const median = quantile(0.5)
    const deviations = values.map((v) => Math.abs(v - median)).sort((a, b) => a - b)
    const mid = (deviations.length - 1) / 2
    const mad =
      deviations.length % 2
        ? deviations[mid]
        : (deviations[Math.floor(mid)] + deviations[Math.ceil(mid)]) / 2
    return mad * 1.4826
  }

  if (n < 2) return 0
  const sd = Math.sqrt(values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (n - 1))
  if (kind === "sd") return sd
  const sem = sd / Math.sqrt(n)
  if (kind === "sem") return sem

  // Confidence intervals use the t distribution, not 1.96. At bench n the
  // normal approximation is materially too narrow, with n = 3 the true
  // multiplier is 4.30, so a "95% CI" drawn at 1.96 would be less than half
  // the interval it claims to be.
  const level = kind === "ci90" ? 0.9 : kind === "ci99" ? 0.99 : 0.95
  return sem * tCritical(n - 1, level)
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

  const means: number[] = []
  const errors: number[] = []
  for (const k of keys) {
    const vals = groups.get(k)!.y
    means.push(vals.reduce((a, b) => a + b, 0) / Math.max(vals.length, 1))
    errors.push(errorValue(vals, figure.errorBars) ?? 0)
  }

  const barStyle = styleFor(figure, keys[0] ?? "Series", 0)
  const traces: Record<string, unknown>[] = [
    {
      type: "bar",
      // Integer positions, matching the numbered axis the layout builds for
      // this chart kind. The group names return as that axis's tick labels.
      x: keys.map((_, i) => i),
      y: means,
      name: ERROR_BAR_LABEL[figure.errorBars] || "mean",
      marker: {
        color: keys.map((k, i) => styleFor(figure, k, i).colour),
        opacity: barStyle.opacity,
      },
      error_y:
        figure.errorBars === "none"
          ? undefined
          : { type: "data", array: errors, visible: true, thickness: 1.4, width: 5 },
      // %{x} would print the numeric position, so the group name rides along as
      // customdata. Not `text`: Plotly paints a bar's `text` onto the bar, which
      // duplicated every group name across the middle of the chart.
      customdata: keys,
      hovertemplate: "%{customdata}: %{y:.3f}<extra></extra>",
      showlegend: false,
    },
  ]

  // Individual points over the bars, carrying their row ids. Jitter is applied
  // in category space so replicates stop superimposing.
  for (const [i, key] of keys.entries()) {
    const g = groups.get(key)!
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
        opacity: 0.75,
        size: style.pointSize,
        symbol: g.excluded.map((e) => (e ? "circle-open" : style.pointShape)),
      },
      hovertemplate: "%{y:.3f}<br>row %{customdata}<extra></extra>",
      showlegend: false,
    })
  }
  return traces
}

function boxOrViolin(spec: AnalysisSpec, result: EngineResult, kind: "box" | "violin") {
  const figure = spec.figure
  const groups = groupRows(spec, result)
  return [...groups.entries()].map(([key, g], i) => {
    const style = styleFor(figure, key, i)
    return {
      type: kind,
      y: g.y,
      x: g.y.map(() => key),
      customdata: g.rowIds,
      name: key,
      marker: { color: style.colour, size: style.pointSize },
      line: { color: style.colour, width: style.lineWidth },
      opacity: style.opacity,
      boxpoints: "all",
      jitter: style.jitter || 0.4,
      pointpos: 0,
      ...(kind === "violin" ? { meanline: { visible: true }, points: "all" } : {}),
      hovertemplate: "%{y:.3f}<br>row %{customdata}<extra></extra>",
    }
  })
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
    for (const row of result.plotData) {
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
    // The 95% band is drawn first so the fitted line sits on top of it.
    if (fit.confidenceBand) {
      traces.push({
        type: "scatter",
        mode: "lines",
        x: [...fit.confidenceBand.x, ...[...fit.confidenceBand.x].reverse()],
        y: [...fit.confidenceBand.upper, ...[...fit.confidenceBand.lower].reverse()],
        fill: "toself",
        fillcolor: "rgba(213,94,0,0.13)",
        line: { width: 0 },
        name: "95% CI",
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

function lineTimecourse(spec: AnalysisSpec, result: EngineResult) {
  const figure = spec.figure
  const xCol = spec.analysis.groupColumn ?? spec.analysis.responseColumns[0]
  const series = spec.analysis.responseColumns

  return series.map((col, i) => {
    const style = styleFor(figure, col, i)
    const xs: (number | string)[] = []
    const ys: number[] = []
    const ids: string[] = []
    for (const row of result.plotData) {
      const y = Number(row.values[col])
      if (!Number.isFinite(y)) continue
      xs.push((row.values[xCol ?? ""] as number | string) ?? "")
      ys.push(y)
      ids.push(row.rowId)
    }
    return {
      type: "scatter",
      mode: style.lineStyle === "none" ? "markers" : "lines+markers",
      x: xs,
      y: ys,
      customdata: ids,
      name: col,
      line: { color: style.colour, width: style.lineWidth, dash: style.lineStyle },
      marker: { color: style.colour, size: style.pointSize, symbol: style.pointShape },
      opacity: style.opacity,
      yaxis: style.axis === "right" ? "y2" : "y",
      hovertemplate: "%{x}: %{y:.3f}<br>row %{customdata}<extra></extra>",
    }
  })
}

function histogram(spec: AnalysisSpec, result: EngineResult) {
  const figure = spec.figure
  return spec.analysis.responseColumns.map((col, i) => {
    const style = styleFor(figure, col, i)
    const values = result.plotData
      .map((r) => Number(r.values[col]))
      .filter((v) => Number.isFinite(v))
    return {
      type: "histogram",
      x: values,
      name: col,
      marker: { color: style.colour, opacity: style.opacity },
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
        name: `${curve.label} 95% CI`,
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

  for (const row of result.plotData) {
    if (row.excluded && !spec.figure.showExcludedPoints) continue
    const r = String(row.values[rowCol] ?? "-")
    const c = String(row.values[colCol] ?? "-")
    const v = Number(row.values[valueCol])
    if (!Number.isFinite(v)) continue
    if (!rowLevels.includes(r)) rowLevels.push(r)
    if (!colLevels.includes(c)) colLevels.push(c)
    const key = `${r} ${c}`
    const bucket = cells.get(key) ?? []
    bucket.push(v)
    cells.set(key, bucket)
  }

  const z = rowLevels.map((r) =>
    colLevels.map((c) => {
      const bucket = cells.get(`${r} ${c}`)
      if (!bucket || bucket.length === 0) return null
      return bucket.reduce((a, b) => a + b, 0) / bucket.length
    })
  )
  const counts = rowLevels.map((r) =>
    colLevels.map((c) => cells.get(`${r} ${c}`)?.length ?? 0)
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
function volcano(spec: AnalysisSpec, result: EngineResult) {
  const xCol = spec.analysis.responseColumns[0]
  const pCol = spec.analysis.responseColumns[1]
  if (!xCol || !pCol) return []

  const labelCol = spec.analysis.groupColumn
  const style = styleFor(spec.figure, "volcano", 0)
  const alpha = spec.analysis.alpha
  const fcCut = spec.figure.volcanoFoldChange

  const points = result.plotData
    .map((row) => {
      const x = Number(row.values[xCol])
      const p = Number(row.values[pCol])
      if (!Number.isFinite(x) || !Number.isFinite(p) || p <= 0) return null
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
  for (const row of result.plotData) {
    if (row.excluded && !spec.figure.showExcludedPoints) continue
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
  for (const row of result.plotData) {
    if (row.excluded && !spec.figure.showExcludedPoints) continue
    const v = Number(row.values[column])
    if (!Number.isFinite(v)) continue
    xs.push(v)
    ids.push(row.rowId)
  }
  return { values: xs, rowIds: ids }
}

/** Bars stacked or laid on their side: same data, different `orientation`. */
function barVariant(spec: AnalysisSpec, result: EngineResult, horizontal: boolean) {
  const figure = spec.figure
  const groups = groupRows(spec, result)
  const keys = [...groups.keys()]
  const means = keys.map((k) => {
    const vals = groups.get(k)!.y
    return vals.reduce((a, b) => a + b, 0) / Math.max(vals.length, 1)
  })
  const errors = keys.map((k) => errorValue(groups.get(k)!.y, figure.errorBars) ?? 0)
  const colours = keys.map((k, i) => styleFor(figure, k, i).colour)
  const bars = horizontal
    ? { x: means, y: keys, orientation: "h" as const }
    : { x: keys, y: means }
  return [
    {
      type: "bar",
      ...bars,
      marker: { color: colours },
      [horizontal ? "error_x" : "error_y"]:
        figure.errorBars === "none"
          ? undefined
          : { type: "data", array: errors, visible: true, thickness: 1.4, width: 5 },
      hovertemplate: horizontal ? "%{y}: %{x:.3f}<extra></extra>" : "%{x}: %{y:.3f}<extra></extra>",
      showlegend: false,
    },
  ]
}

/** Filled area under each series, for cumulative or compositional timecourses. */
function areaChart(spec: AnalysisSpec, result: EngineResult) {
  const figure = spec.figure
  const xCol = spec.analysis.groupColumn ?? spec.roles.find((r) => r.role === "time")?.column
  return spec.analysis.responseColumns.map((col, i) => {
    const style = styleFor(figure, col, i)
    const points = result.plotData
      .filter((r) => !r.excluded || figure.showExcludedPoints)
      .map((r) => ({ x: xCol ? Number(r.values[xCol]) : 0, y: Number(r.values[col]), id: r.rowId }))
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
      .sort((a, b) => a.x - b.x)
    return {
      type: "scatter",
      mode: "lines",
      // "tonexty" on every trace after the first stacks the bands, which is
      // what an area chart of parts of a whole is for.
      fill: i === 0 ? "tozeroy" : "tonexty",
      fillcolor: withAlpha(style.colour, 0.35),
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
  const rows = result.plotData.filter((r) => !r.excluded || figure.showExcludedPoints)
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
        opacity: 0.7,
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
    traces.push({
      type: "scatter",
      mode: "markers",
      x: theoretical,
      y: sorted,
      name: col,
      marker: { color: style.colour, size: style.pointSize },
      hovertemplate: `${col}<br>expected %{x:.3f}, observed %{y:.3f}<extra></extra>`,
    })
    traces.push({
      type: "scatter",
      mode: "lines",
      x: [-3, 3],
      y: [-3 * sd + mean, 3 * sd + mean],
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
  const rows = result.plotData.filter((r) => !r.excluded || spec.figure.showExcludedPoints)
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
  const rows = result.plotData.filter((r) => !r.excluded || spec.figure.showExcludedPoints)
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
  const rows = result.plotData.filter((r) => !r.excluded || spec.figure.showExcludedPoints)
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
  const rows = result.plotData.filter((r) => !r.excluded || spec.figure.showExcludedPoints)
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
      marker: { color: style.colour, size: Math.max(3, style.pointSize - 2), opacity: 0.85 },
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
  const pairwise = result.test?.pairwise ?? []
  if (pairwise.length === 0) return { shapes, annotations }

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
  if (!Number.isFinite(maxY)) return { shapes, annotations }

  const step = maxY * 0.08
  let level = 0

  for (const pair of pairwise) {
    if (!pair.significant) continue
    const custom = spec.figure.brackets.find(
      (b) => b.fromGroup === pair.groupA && b.toGroup === pair.groupB
    )
    const y = maxY + step * (level + 1) + (custom?.offsetY ?? 0)
    level += 1

    shapes.push({
      type: "line",
      xref: "x",
      yref: "y",
      x0: at(pair.groupA),
      x1: at(pair.groupB),
      y0: y,
      y1: y,
      line: { color: "#444", width: 1 },
    })
    const a = at(pair.groupA)
    const b = at(pair.groupB)
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
      font: { size: Math.max(spec.figure.axisFontSize - 1, 8) },
      xanchor: "center",
      xshift: 0,
    })
  }
  return { shapes, annotations }
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
    case "grouped-bar":
      data = barWithPoints(spec, result)
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
      data = barVariant(spec, result, false)
      break
    case "horizontal-bar":
      data = barVariant(spec, result, true)
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

  const { shapes, annotations } = significanceLayer(spec, result)

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
        type: a.shape === "line" ? "line" : a.shape,
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
  const errorNote = ERROR_BAR_LABEL[figure.errorBars]
  const subtitleBits = [figure.subtitle, errorNote].filter(Boolean)
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
    barmode: figure.kind === "grouped-bar" ? "group" : "stack",
    // Forest and horizontal bars put the categories on y, so that axis is the
    // categorical one and x carries the estimate.
    ...(figure.kind === "forest" || figure.kind === "horizontal-bar"
      ? { yaxis: { ...buildAxis(figure.y, figure, {}, true), automargin: true } }
      : {}),
  }

  if (figure.y2) {
    layout.yaxis2 = buildAxis(figure.y2, figure, { overlaying: "y", side: "right" })
  }

  return { data, layout }
}
