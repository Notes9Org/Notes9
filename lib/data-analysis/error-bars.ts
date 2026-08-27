/**
 * Error bars, computed once for every surface that draws them.
 *
 * There were two implementations. The Chart tab aggregated on the page and
 * returned a single scalar, so its bars were drawn SYMMETRICALLY about the
 * centre; the figure renderer returned an asymmetric pair. For `sd`, `sem` and
 * the confidence intervals that difference is invisible, because those spans
 * genuinely are symmetric. For the three robust kinds it is not:
 *
 *   `iqr`   — Q1 and Q3 are not equidistant from the median, so a symmetric
 *             bar of width Q3−Q1 reached the wrong values at both ends;
 *   `range` — the scalar was `max − mean`, mirrored, so the lower whisker was
 *             not the minimum;
 *   `mad`   — symmetric by construction, but centred differently.
 *
 * The label ("median, IQR") is rendered into the figure and survives export, so
 * the geometry has to agree with it exactly. One module now owns that, and both
 * surfaces show the same bar for the same setting.
 *
 * WHY THIS IS NOT IN THE ENGINE: it is elementary arithmetic — means, standard
 * deviations, quantiles — that scipy adds nothing to, and requiring a Pyodide
 * boot before a chart can draw error bars is a cost with no accuracy to show
 * for it. `descriptive` is still preferred when the engine HAS reported a row,
 * so a figure beside a results table cannot drift from it. What the engine owns
 * is every statistic that is a claim: tests, fits, survival, and the intervals
 * it reports.
 */
import { studentTCdf } from "@/lib/data-analysis/distributions"
import type { AnalysisSpec } from "@/lib/data-analysis/spec/analysis-spec"

export type ErrorBarKind = AnalysisSpec["figure"]["errorBars"]

/** The engine's own summary for a group, when one has been computed. */
export interface ErrorBarDescriptive {
  n?: number
  mean?: number
  median?: number
  sd?: number
  sem?: number
  q1?: number
  q3?: number
  min?: number
  max?: number
  ci95Low?: number | null
  ci95High?: number | null
}

/** Where the mark sits and how far each whisker reaches from it. */
export interface ErrorBarSpan {
  /** Mean for most kinds; the MEDIAN for `iqr` and `mad`. */
  centre: number
  /** Distance below `centre`, positive. */
  minus: number
  /** Distance above `centre`, positive. */
  plus: number
}

/**
 * Chart types that draw error bars.
 *
 * Box and violin already render the spread of the data as their whole geometry,
 * so a bar on top would either duplicate it or contradict it. Histograms, pies
 * and the 3-D kinds have no per-group centre for a bar to hang from. The
 * restriction was previously enforced silently — the setting was accepted and
 * then ignored — which is why it is exported: the control states it.
 */
const ERROR_BAR_CHART_TYPES = new Set(["line", "scatter", "bar", "barStacked", "barH", "area"])

export function errorBarsSupported(chartType: string): boolean {
  return ERROR_BAR_CHART_TYPES.has(chartType)
}

/** Why a chart type does not draw them, for the control to show. */
export function errorBarsUnsupportedReason(chartType: string): string | null {
  if (errorBarsSupported(chartType)) return null
  switch (chartType) {
    case "box":
    case "violin":
      return "Not drawn on this chart — it already shows the spread of the data."
    case "histogram":
    case "ecdf":
    case "qq":
      return "Not drawn on a distribution chart — there is no per-group centre to hang a bar from."
    case "pie":
      return "Not drawn on a pie chart."
    default:
      return "Not drawn on this chart type."
  }
}

export function errorBarSpan(
  values: number[],
  kind: ErrorBarKind,
  d?: ErrorBarDescriptive
): ErrorBarSpan {
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
    if (studentTCdf(mid, df) < target) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}
