/**
 * Statistical tests for the data-analysis workbench.
 *
 * Every test returns a small, uniform `TestResult` so the UI can render them
 * consistently (statistic, df, p-value, effect size, a plain-language verdict).
 * P-values use the exact distribution CDFs in ./distributions.
 */
import {
  normalCdf,
  normalTwoSidedP,
  tTwoSidedP,
  studentTCdf,
  tInv,
  tCritical,
  fUpperP,
  chiSquareUpperP,
  chiSquareCdf,
  normalInv,
  studentizedRangeUpperP,
  studentizedRangeCritical,
  hypergeometricPmf,
  normalLogCdf,
} from "./distributions"

export type TestResult = {
  name: string
  stat: { label: string; value: number }[]
  p: number
  df?: string
  effect?: { label: string; value: number }
  /** 95% CI on `effect`, when one is defined for that statistic. */
  effectCI?: [number, number]
  note?: string
}

/** Test directionality. */
export type Tail = "two" | "less" | "greater"

/** p-value from a t statistic honoring the requested tail. */
function tP(t: number, df: number, tail: Tail = "two"): number {
  if (tail === "two") return tTwoSidedP(t, df)
  const lower = studentTCdf(t, df) // P(T ≤ t)
  return tail === "greater" ? 1 - lower : lower
}

const tailNote = (tail: Tail) =>
  tail === "two" ? undefined : `One-tailed (${tail === "greater" ? "greater" : "less"}).`

/* ── Descriptive ─────────────────────────────────────────────────────────── */
export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN)

export const variance = (xs: number[]) => {
  if (xs.length < 2) return NaN
  const m = mean(xs)
  return xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)
}

export const stdev = (xs: number[]) => Math.sqrt(variance(xs))

export function median(xs: number[]): number {
  if (!xs.length) return NaN
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export function quantile(xs: number[], q: number): number {
  if (!xs.length) return NaN
  const s = [...xs].sort((a, b) => a - b)
  const pos = (s.length - 1) * q
  const base = Math.floor(pos)
  const rest = pos - base
  return s[base + 1] !== undefined ? s[base] + rest * (s[base + 1] - s[base]) : s[base]
}

export type Descriptive = {
  n: number
  mean: number
  sd: number
  sem: number
  median: number
  q1: number
  q3: number
  iqr: number
  min: number
  max: number
  cv: number
  ci95: [number, number]
  /** Sum of all values. */
  sum: number
  /** max − min. */
  range: number
  /** Geometric mean (NaN if any value ≤ 0). */
  geoMean: number
  /** Geometric SD factor (NaN if any value ≤ 0). */
  geoSD: number
  /** Fisher–Pearson standardized skewness (matches Excel SKEW). */
  skewness: number
  /** Excess kurtosis (matches Excel KURT). */
  kurtosis: number
}

/** Geometric mean of strictly-positive values (NaN otherwise). */
export function geometricMean(xs: number[]): number {
  const vals = xs.filter((v) => isFinite(v))
  if (!vals.length || vals.some((v) => v <= 0)) return NaN
  return Math.exp(vals.reduce((a, b) => a + Math.log(b), 0) / vals.length)
}

/** Geometric SD factor of strictly-positive values (NaN otherwise). */
export function geometricSD(xs: number[]): number {
  const vals = xs.filter((v) => isFinite(v))
  if (vals.length < 2 || vals.some((v) => v <= 0)) return NaN
  const logs = vals.map((v) => Math.log(v))
  return Math.exp(stdev(logs))
}

/** Fisher–Pearson standardized sample skewness (Excel SKEW). */
export function skewness(xs: number[]): number {
  const vals = xs.filter((v) => isFinite(v))
  const n = vals.length
  if (n < 3) return NaN
  const m = mean(vals)
  const s = stdev(vals)
  if (s === 0) return NaN
  const sum = vals.reduce((a, b) => a + ((b - m) / s) ** 3, 0)
  return (n / ((n - 1) * (n - 2))) * sum
}

/** Sample excess kurtosis (Excel KURT). */
export function kurtosis(xs: number[]): number {
  const vals = xs.filter((v) => isFinite(v))
  const n = vals.length
  if (n < 4) return NaN
  const m = mean(vals)
  const s = stdev(vals)
  if (s === 0) return NaN
  const sum = vals.reduce((a, b) => a + ((b - m) / s) ** 4, 0)
  return (
    (n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3)) * sum -
    (3 * (n - 1) ** 2) / ((n - 2) * (n - 3))
  )
}

export function describe(xs: number[]): Descriptive {
  const vals = xs.filter((v) => isFinite(v))
  const n = vals.length
  const m = mean(vals)
  const sd = stdev(vals)
  const sem = sd / Math.sqrt(n)
  const q1 = quantile(vals, 0.25)
  const q3 = quantile(vals, 0.75)
  // 95% CI on the mean using the t-multiplier (exact for any n ≥ 2).
  const half = (n >= 2 ? tCritical(0.05, n - 1) : 1.96) * sem
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  return {
    n,
    mean: m,
    sd,
    sem,
    median: median(vals),
    q1,
    q3,
    iqr: q3 - q1,
    min,
    max,
    cv: (sd / m) * 100,
    ci95: [m - half, m + half],
    sum: vals.reduce((a, b) => a + b, 0),
    range: max - min,
    geoMean: geometricMean(vals),
    geoSD: geometricSD(vals),
    skewness: skewness(vals),
    kurtosis: kurtosis(vals),
  }
}

/* ── Normality (Shapiro-Wilk) ────────────────────────────────────────────── */
/**
 * Shapiro-Wilk W test (Royston 1992 approximation). Valid for 3 ≤ n ≤ 5000.
 * Returns W and an approximate p-value.
 */
export function shapiroWilk(input: number[]): TestResult | null {
  const x = input.filter((v) => isFinite(v)).sort((a, b) => a - b)
  const n = x.length
  if (n < 3) return null

  const m: number[] = []
  for (let i = 1; i <= n; i++) m.push(normalInv((i - 0.375) / (n + 0.25)))
  const mSq = m.reduce((a, b) => a + b * b, 0)
  const rootMSq = Math.sqrt(mSq)

  const a = new Array(n).fill(0)
  const u = 1 / Math.sqrt(n)
  const an = m[n - 1] / rootMSq
  const an1 = n > 1 ? m[n - 2] / rootMSq : 0

  // Royston polynomial corrections for the two extreme weights
  const poly = (c: number[], x: number) => c.reduce((s, coef, i) => s + coef * x ** i, 0)
  if (n > 5) {
    const a_n = -2.706056 * u ** 5 + 4.434685 * u ** 4 - 2.07119 * u ** 3 - 0.147981 * u ** 2 + 0.221157 * u + an
    const a_n1 = -3.582633 * u ** 5 + 5.682633 * u ** 4 - 1.752461 * u ** 3 - 0.293762 * u ** 2 + 0.042981 * u + an1
    a[n - 1] = a_n
    a[0] = -a_n
    a[n - 2] = a_n1
    a[1] = -a_n1
    const phi = (mSq - 2 * m[n - 1] ** 2 - 2 * m[n - 2] ** 2) / (1 - 2 * a_n ** 2 - 2 * a_n1 ** 2)
    for (let i = 2; i < n - 2; i++) a[i] = m[i] / Math.sqrt(phi)
  } else {
    const a_n = poly([0, 0.221157, -0.147981, -2.07119, 4.434685, -2.706056], u) + an
    a[n - 1] = a_n
    a[0] = -a_n
    const phi = (mSq - 2 * m[n - 1] ** 2) / (1 - 2 * a_n ** 2)
    for (let i = 1; i < n - 1; i++) a[i] = m[i] / Math.sqrt(phi)
  }

  const xbar = mean(x)
  let num = 0
  for (let i = 0; i < n; i++) num += a[i] * x[i]
  const den = x.reduce((s, v) => s + (v - xbar) ** 2, 0)
  const W = (num * num) / den

  // Royston p-value approximation
  let p: number
  const lnn = Math.log(n)
  if (n === 3) {
    const pi6 = 6 / Math.PI
    const stqr = Math.asin(Math.sqrt(3 / 4))
    p = pi6 * (Math.asin(Math.sqrt(W)) - stqr)
    p = Math.max(0, Math.min(1, 1 - p))
  } else {
    let mu: number, sigma: number
    if (n <= 11) {
      const gamma = -2.273 + 0.459 * n
      mu = 0.5440 - 0.39978 * n + 0.025054 * n * n - 0.0006714 * n ** 3
      sigma = Math.exp(1.3822 - 0.77857 * n + 0.062767 * n * n - 0.0020322 * n ** 3)
      const w1 = -Math.log(gamma - Math.log(1 - W))
      p = 1 - normalCdf((w1 - mu) / sigma)
    } else {
      mu = -1.5861 - 0.31082 * lnn - 0.083751 * lnn * lnn + 0.0038915 * lnn ** 3
      sigma = Math.exp(-0.4803 - 0.082676 * lnn + 0.0030302 * lnn * lnn)
      const w1 = Math.log(1 - W)
      p = 1 - normalCdf((w1 - mu) / sigma)
    }
  }
  return {
    name: "Shapiro–Wilk normality",
    stat: [{ label: "W", value: W }],
    p: Math.max(0, Math.min(1, p)),
    df: `n = ${n}`,
    note: p < 0.05 ? "Data deviate from normal, consider a non-parametric test." : "No significant deviation from normality.",
  }
}

/* ── t-tests ─────────────────────────────────────────────────────────────── */
/**
 * Minimum n for the Anderson–Darling p-value approximation. R's `nortest::ad.test`
 * refuses below 8; extrapolating the fit past the range it was built on is worse
 * than declining.
 */
export const AD_MIN_N = 8

/**
 * p for the Anderson–Darling A², D'Agostino & Stephens (1986) table 4.9.
 *
 * The fit is to the modified statistic A* = A²(1 + 0.75/n + 2.25/n²) — the same
 * modification `scipy.stats.anderson` applies to its critical-value table. It is
 * an APPROXIMATION and every caller says so. Kept identical, branch for branch,
 * to `_ad_pvalue` in notes9_engine.py so the two engines cannot disagree.
 */
export function andersonDarlingP(a2: number, n: number): number {
  const a = a2 * (1 + 0.75 / n + 2.25 / (n * n))
  let p: number
  if (a < 0.2) p = 1 - Math.exp(-13.436 + 101.14 * a - 223.73 * a * a)
  else if (a < 0.34) p = 1 - Math.exp(-8.318 + 42.796 * a - 59.938 * a * a)
  else if (a < 0.6) p = Math.exp(0.9177 - 4.279 * a - 1.38 * a * a)
  else if (a < 10) p = Math.exp(1.2937 - 5.709 * a + 0.0186 * a * a)
  else p = 3.7e-24 // the fit's floor; below it the tail is not resolvable
  return Math.max(0, Math.min(1, p))
}

/**
 * Anderson–Darling test for normality — the third test the requirement names,
 * beside Shapiro–Wilk and D'Agostino–Pearson.
 *
 * Weights the squared gap between the empirical and fitted normal CDFs by
 * 1/(F(1−F)), which makes it the sensitive one in the tails — where the outlier
 * that invalidates a t-test lives. Shapiro–Wilk is stronger against a shifted or
 * skewed centre; run both, they fail on different departures.
 *
 * The statistic matches `scipy.stats.anderson(x, "norm").statistic` to 1e-13.
 * The p-value does not come from scipy, which returns none — see
 * `andersonDarlingP`, and the `note` on the returned result.
 */
export function andersonDarling(input: number[]): TestResult | null {
  const x = input.filter((v) => isFinite(v)).sort((a, b) => a - b)
  const n = x.length
  if (n < AD_MIN_N) return null
  const s = stdev(x)
  if (!(s > 0)) return null
  const m = mean(x)

  // A² = −n − (1/n) Σ (2i−1)[ln Φ(z_i) + ln(1 − Φ(z_{n+1−i}))], standardised by
  // the SAMPLE mean and SD — the case where both parameters are estimated,
  // which is the only case a real column is ever in.
  let sum = 0
  for (let i = 0; i < n; i++) {
    const zi = (x[i] - m) / s
    const zj = (x[n - 1 - i] - m) / s
    sum += (2 * (i + 1) - 1) * (normalLogCdf(zi) + normalLogCdf(-zj))
  }
  const A2 = -n - sum / n
  const p = andersonDarlingP(A2, n)
  return {
    name: "Anderson–Darling normality",
    stat: [{ label: "A²", value: A2 }],
    p,
    df: `n = ${n}`,
    note:
      (p < 0.05
        ? "Data deviate from normal in the tails, consider a non-parametric test. "
        : "No significant deviation from normality. ") +
      "p is the D'Agostino & Stephens (1986) analytic approximation to the A² null distribution, not an exact tail probability.",
  }
}

export function oneSampleT(xs: number[], mu0: number, tail: Tail = "two"): TestResult | null {
  const x = xs.filter(isFinite)
  const n = x.length
  if (n < 2) return null
  const m = mean(x)
  const sd = stdev(x)
  const se = sd / Math.sqrt(n)
  const t = (m - mu0) / se
  const df = n - 1
  const d = (m - mu0) / sd
  return {
    name: `One-sample t-test (μ₀ = ${mu0})`,
    stat: [{ label: "t", value: t }, { label: "mean", value: m }],
    p: tP(t, df, tail),
    df: `${df}`,
    effect: { label: "Cohen's d", value: d },
    note: tailNote(tail),
  }
}

export function unpairedT(a: number[], b: number[], welch = true, tail: Tail = "two"): TestResult | null {
  const x = a.filter(isFinite)
  const y = b.filter(isFinite)
  if (x.length < 2 || y.length < 2) return null
  const mx = mean(x)
  const my = mean(y)
  const vx = variance(x)
  const vy = variance(y)
  const nx = x.length
  const ny = y.length
  let t: number, df: number
  if (welch) {
    const se = Math.sqrt(vx / nx + vy / ny)
    t = (mx - my) / se
    df = (vx / nx + vy / ny) ** 2 / ((vx / nx) ** 2 / (nx - 1) + (vy / ny) ** 2 / (ny - 1))
  } else {
    const sp2 = ((nx - 1) * vx + (ny - 1) * vy) / (nx + ny - 2)
    const se = Math.sqrt(sp2 * (1 / nx + 1 / ny))
    t = (mx - my) / se
    df = nx + ny - 2
  }
  const sp = Math.sqrt(((nx - 1) * vx + (ny - 1) * vy) / (nx + ny - 2))
  const d = (mx - my) / sp
  return {
    name: welch ? "Welch's unpaired t-test" : "Student's unpaired t-test",
    stat: [{ label: "t", value: t }, { label: "mean diff", value: mx - my }],
    p: tP(t, df, tail),
    df: df.toFixed(1),
    effect: { label: "Cohen's d", value: d },
    note: tailNote(tail),
  }
}

export function pairedT(a: number[], b: number[], tail: Tail = "two"): TestResult | null {
  const pairs: [number, number][] = []
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (isFinite(a[i]) && isFinite(b[i])) pairs.push([a[i], b[i]])
  }
  if (pairs.length < 2) return null
  const diffs = pairs.map(([p, q]) => p - q)
  const n = diffs.length
  const md = mean(diffs)
  const sd = stdev(diffs)
  const se = sd / Math.sqrt(n)
  const t = md / se
  const df = n - 1
  return {
    name: "Paired t-test",
    stat: [{ label: "t", value: t }, { label: "mean diff", value: md }],
    p: tP(t, df, tail),
    df: `${df}`,
    effect: { label: "Cohen's dz", value: md / sd },
    note: tailNote(tail),
  }
}

/* ── One-way ANOVA + Tukey HSD ───────────────────────────────────────────── */
export function oneWayAnova(groups: { name: string; values: number[] }[]): TestResult | null {
  const g = groups.map((x) => ({ name: x.name, values: x.values.filter(isFinite) })).filter((x) => x.values.length > 0)
  const k = g.length
  if (k < 2) return null
  const all = g.flatMap((x) => x.values)
  const N = all.length
  const grand = mean(all)
  let ssb = 0
  let ssw = 0
  for (const grp of g) {
    const m = mean(grp.values)
    ssb += grp.values.length * (m - grand) ** 2
    for (const v of grp.values) ssw += (v - m) ** 2
  }
  const dfb = k - 1
  const dfw = N - k
  const msb = ssb / dfb
  const msw = ssw / dfw
  const F = msb / msw
  const etaSq = ssb / (ssb + ssw)
  return {
    name: "One-way ANOVA",
    stat: [{ label: "F", value: F }],
    p: fUpperP(F, dfb, dfw),
    df: `${dfb}, ${dfw}`,
    effect: { label: "η²", value: etaSq },
  }
}

export type TukeyPair = {
  a: string
  b: string
  diff: number
  q: number
  /** Tukey-adjusted (family-wise) p-value from the exact studentized range. */
  p: number
  /** 95% confidence interval on the difference of means. */
  ciLow: number
  ciHigh: number
  significant: boolean
}

/**
 * Tukey HSD post-hoc using the EXACT studentized-range distribution (matching
 * GraphPad Prism). Reports the Tukey-adjusted family-wise p-value and the 95%
 * CI on each pairwise difference of means. Tukey–Kramer SE handles unequal n.
 */
export function tukeyHSD(
  groups: { name: string; values: number[] }[],
  alpha = 0.05,
): TukeyPair[] {
  const g = groups.map((x) => ({ name: x.name, values: x.values.filter(isFinite) })).filter((x) => x.values.length > 0)
  const k = g.length
  if (k < 2) return []
  const N = g.reduce((s, x) => s + x.values.length, 0)
  let ssw = 0
  for (const grp of g) {
    const m = mean(grp.values)
    for (const v of grp.values) ssw += (v - m) ** 2
  }
  const dfw = N - k
  const msw = ssw / dfw
  const qcrit = studentizedRangeCritical(alpha, k, dfw)
  const out: TukeyPair[] = []
  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      const mi = mean(g[i].values)
      const mj = mean(g[j].values)
      const se = Math.sqrt((msw / 2) * (1 / g[i].values.length + 1 / g[j].values.length))
      const q = Math.abs(mi - mj) / se
      const margin = qcrit * se
      out.push({
        a: g[i].name,
        b: g[j].name,
        diff: mi - mj,
        q,
        p: studentizedRangeUpperP(q, k, dfw),
        ciLow: mi - mj - margin,
        ciHigh: mi - mj + margin,
        significant: q > qcrit,
      })
    }
  }
  return out
}

/* ── Non-parametric ──────────────────────────────────────────────────────── */
function rank(values: number[]): number[] {
  const indexed = values.map((v, i) => ({ v, i }))
  indexed.sort((a, b) => a.v - b.v)
  const ranks = new Array(values.length).fill(0)
  let i = 0
  while (i < indexed.length) {
    let j = i
    while (j < indexed.length - 1 && indexed[j + 1].v === indexed[i].v) j++
    const avg = (i + j) / 2 + 1
    for (let t = i; t <= j; t++) ranks[indexed[t].i] = avg
    i = j + 1
  }
  return ranks
}

/** Σ(t³ − t) over each group of tied values — the tie term shared by the rank tests. */
function tieCorrection(values: number[]): number {
  const counts = new Map<number, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  let s = 0
  for (const [, t] of counts) s += t ** 3 - t
  return s
}

/**
 * Exact two-sided p for the Wilcoxon signed-rank statistic w = min(W⁺, W⁻).
 * Enumerates the 2ⁿ equally likely sign assignments via a subset-sum DP over
 * the ranks 1…n, then p = min(1, 2·P(W⁺ ≤ w)) (scipy `method="exact"`).
 * Only valid with no tied |differences| and no zero differences.
 */
function wilcoxonExactP(w: number, n: number): number {
  const maxW = (n * (n + 1)) / 2
  const counts = new Float64Array(maxW + 1)
  counts[0] = 1
  for (let r = 1; r <= n; r++) for (let t = maxW; t >= r; t--) counts[t] += counts[t - r]
  let tail = 0
  for (let t = 0; t <= w; t++) tail += counts[t]
  return Math.min(1, (2 * tail) / 2 ** n)
}

/**
 * Exact two-sided p for Mann–Whitney U. f(i,j,u) — the number of rank
 * arrangements of i vs j observations giving U = u — is the count of integer
 * partitions of u inside an i×j box: f(i,j,u) = f(i−1,j,u) + f(i,j−1,u−i).
 * p = min(1, 2·P(U ≤ u)) (scipy `method="exact"`). Not valid with ties.
 */
function mannWhitneyExactP(u: number, n1: number, n2: number): number {
  const maxU = n1 * n2
  // rows[j] holds f(i, j, ·); rolled forward over i.
  let rows: Float64Array[] = Array.from({ length: n2 + 1 }, () => new Float64Array(maxU + 1))
  for (let j = 0; j <= n2; j++) rows[j][0] = 1 // f(0, j, u) = [u = 0]
  for (let i = 1; i <= n1; i++) {
    const next: Float64Array[] = [new Float64Array(maxU + 1)]
    next[0][0] = 1 // f(i, 0, u) = [u = 0]
    for (let j = 1; j <= n2; j++) {
      const cur = new Float64Array(maxU + 1)
      for (let t = 0; t <= maxU; t++) cur[t] = rows[j][t] + (t >= i ? next[j - 1][t - i] : 0)
      next.push(cur)
    }
    rows = next
  }
  const dist = rows[n2]
  let total = 0
  for (let t = 0; t <= maxU; t++) total += dist[t]
  let tail = 0
  for (let t = 0; t <= u; t++) tail += dist[t]
  return Math.min(1, (2 * tail) / total)
}

/**
 * Cliff (1993) asymmetric 95% CI for the rank-biserial correlation (which for
 * two independent samples is exactly Cliff's δ). Built on the logit-like
 * transform so the interval can never leave (−1, 1) — the same geometry
 * argument as a log-scale EC₅₀ interval. Matches R `effsize::cliff.delta`.
 */
function cliffDeltaCI(x: number[], y: number[], d: number): [number, number] | undefined {
  const n1 = x.length
  const n2 = y.length
  if (n1 < 2 || n2 < 2) return undefined
  const rowMean = new Array(n1).fill(0)
  const colMean = new Array(n2).fill(0)
  let sqDev = 0
  for (let i = 0; i < n1; i++) {
    for (let j = 0; j < n2; j++) {
      const sgn = Math.sign(x[i] - y[j])
      rowMean[i] += sgn
      colMean[j] += sgn
      sqDev += (sgn - d) ** 2
    }
  }
  // Divide once at the end so complete separation gives exactly ±1 and a
  // variance of exactly 0 (→ no interval) rather than float dust.
  for (let i = 0; i < n1; i++) rowMean[i] /= n2
  for (let j = 0; j < n2; j++) colMean[j] /= n1
  const sRow = rowMean.reduce((s, v) => s + (v - d) ** 2, 0)
  const sCol = colMean.reduce((s, v) => s + (v - d) ** 2, 0)
  const varD = (n2 * n2 * sRow + n1 * n1 * sCol - sqDev) / (n1 * n2 * (n1 - 1) * (n2 - 1))
  if (!(varD > 0)) return undefined
  const z = 1.959963984540054 // Φ⁻¹(0.975)
  const denom = 1 - d * d + z * z * varD
  const centre = (d - d ** 3) / denom
  const half = (z * Math.sqrt(varD) * Math.sqrt((1 - d * d) ** 2 + z * z * varD)) / denom
  return [centre - half, centre + half]
}

export function mannWhitney(a: number[], b: number[]): TestResult | null {
  const x = a.filter(isFinite)
  const y = b.filter(isFinite)
  const n1 = x.length
  const n2 = y.length
  if (n1 < 1 || n2 < 1) return null
  const all = [...x, ...y]
  const N = n1 + n2
  const ranks = rank(all)
  const r1 = ranks.slice(0, n1).reduce((s, r) => s + r, 0)
  const u1 = r1 - (n1 * (n1 + 1)) / 2
  const u2 = n1 * n2 - u1
  const U = Math.min(u1, u2)
  const mu = (n1 * n2) / 2
  // Tie-corrected null variance (scipy convention). Without the tie term the
  // variance is overstated and the test is conservative — but ties are exactly
  // what this test is usually chosen for.
  const tieSum = tieCorrection(all)
  const sigma = Math.sqrt(((n1 * n2) / 12) * (N + 1 - tieSum / (N * (N - 1))))
  const z = (U - mu) / sigma
  // The exact distribution assumes no ties; the box DP is cheap up to 20×20.
  const exact = tieSum === 0 && n1 * n2 <= 400
  // Rank-biserial correlation = Cliff's δ: +1 when every a exceeds every b.
  const rrb = (2 * u1) / (n1 * n2) - 1
  return {
    name: "Mann–Whitney U",
    stat: [{ label: "U", value: U }, { label: "z", value: z }],
    p: exact ? mannWhitneyExactP(U, n1, n2) : normalTwoSidedP(z),
    df: `n₁=${n1}, n₂=${n2}`,
    effect: { label: "rank-biserial r", value: rrb },
    effectCI: cliffDeltaCI(x, y, rrb),
    note: exact
      ? "Rank-based; exact null distribution (no ties, n₁·n₂ ≤ 400)."
      : "Rank-based; normal approximation with tie correction.",
  }
}

export function wilcoxonSignedRank(a: number[], b: number[]): TestResult | null {
  const diffs: number[] = []
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (isFinite(a[i]) && isFinite(b[i])) {
      const d = a[i] - b[i]
      if (d !== 0) diffs.push(d)
    }
  }
  const n = diffs.length
  if (n < 1) return null
  const ranks = rank(diffs.map(Math.abs))
  let wPlus = 0
  let wMinus = 0
  diffs.forEach((d, i) => (d > 0 ? (wPlus += ranks[i]) : (wMinus += ranks[i])))
  const W = Math.min(wPlus, wMinus)
  const mu = (n * (n + 1)) / 4
  // Tie correction on the null variance (scipy convention) for the fallback.
  const tieSum = tieCorrection(diffs.map(Math.abs))
  const sigma = Math.sqrt((n * (n + 1) * (2 * n + 1) - tieSum / 2) / 24)
  const z = (W - mu) / sigma
  // The normal approximation is badly anti-conservative at bench sample sizes
  // (n = 5, W = 0 gives p ≈ 0.043 where the exact value is 0.0625), so use the
  // exact distribution whenever it is valid and affordable.
  const exact = n <= 25 && tieSum === 0
  // Kerby (2014) matched-pairs rank-biserial correlation. No standard CI is
  // defined for it, so `effectCI` is left unset.
  const rrb = (wPlus - wMinus) / ((n * (n + 1)) / 2)
  return {
    name: "Wilcoxon signed-rank",
    stat: [{ label: "W", value: W }, { label: "z", value: z }],
    p: exact ? wilcoxonExactP(W, n) : normalTwoSidedP(z),
    df: `n = ${n}`,
    effect: { label: "rank-biserial r", value: rrb },
    note: exact
      ? "Paired, rank-based; exact null distribution (n ≤ 25, no tied |differences|)."
      : "Paired, rank-based; normal approximation with tie correction.",
  }
}

export function kruskalWallis(groups: { name: string; values: number[] }[]): TestResult | null {
  const g = groups.map((x) => x.values.filter(isFinite)).filter((v) => v.length > 0)
  const k = g.length
  if (k < 2) return null
  const all = g.flat()
  const N = all.length
  const ranks = rank(all)
  let idx = 0
  let H = 0
  for (const grp of g) {
    const rSum = grp.reduce((s) => s + ranks[idx++], 0)
    H += (rSum * rSum) / grp.length
  }
  H = (12 / (N * (N + 1))) * H - 3 * (N + 1)
  // Tie correction H / (1 − ΣT/(N³ − N)); without it H is deflated and the
  // p-value inflated whenever values repeat.
  const tieSum = tieCorrection(all)
  const C = 1 - tieSum / (N ** 3 - N)
  if (C > 0) H /= C
  return {
    name: "Kruskal–Wallis H",
    stat: [{ label: "H", value: H }],
    p: chiSquareUpperP(H, k - 1),
    df: `${k - 1}`,
    note: tieSum > 0
      ? "Non-parametric one-way test across groups; H corrected for ties."
      : "Non-parametric one-way test across groups.",
  }
}

/* ── Correlation ─────────────────────────────────────────────────────────── */
export function pearson(a: number[], b: number[]): TestResult | null {
  const pairs: [number, number][] = []
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (isFinite(a[i]) && isFinite(b[i])) pairs.push([a[i], b[i]])
  }
  const n = pairs.length
  if (n < 3) return null
  const xs = pairs.map((p) => p[0])
  const ys = pairs.map((p) => p[1])
  const mx = mean(xs)
  const my = mean(ys)
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (const [x, y] of pairs) {
    sxy += (x - mx) * (y - my)
    sxx += (x - mx) ** 2
    syy += (y - my) ** 2
  }
  const r = sxy / Math.sqrt(sxx * syy)
  const t = (r * Math.sqrt(n - 2)) / Math.sqrt(1 - r * r)
  return {
    name: "Pearson correlation",
    stat: [{ label: "r", value: r }, { label: "r²", value: r * r }],
    p: tTwoSidedP(t, n - 2),
    df: `${n - 2}`,
  }
}

export function spearman(a: number[], b: number[]): TestResult | null {
  const pairs: [number, number][] = []
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (isFinite(a[i]) && isFinite(b[i])) pairs.push([a[i], b[i]])
  }
  const n = pairs.length
  if (n < 3) return null
  const rx = rank(pairs.map((p) => p[0]))
  const ry = rank(pairs.map((p) => p[1]))
  const res = pearson(rx, ry)
  if (!res) return null
  return {
    ...res,
    name: "Spearman correlation",
    stat: [{ label: "ρ", value: res.stat[0].value }],
  }
}

/* ── Linear regression ───────────────────────────────────────────────────── */
export type Regression = {
  slope: number
  intercept: number
  r2: number
  n: number
  slopeSE: number
  predict: (x: number) => number
}

export function linearRegression(a: number[], b: number[]): Regression | null {
  const pairs: [number, number][] = []
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (isFinite(a[i]) && isFinite(b[i])) pairs.push([a[i], b[i]])
  }
  const n = pairs.length
  if (n < 2) return null
  const xs = pairs.map((p) => p[0])
  const ys = pairs.map((p) => p[1])
  const mx = mean(xs)
  const my = mean(ys)
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (const [x, y] of pairs) {
    sxy += (x - mx) * (y - my)
    sxx += (x - mx) ** 2
    syy += (y - my) ** 2
  }
  const slope = sxy / sxx
  const intercept = my - slope * mx
  const r2 = (sxy * sxy) / (sxx * syy)
  const sse = syy - slope * sxy
  const slopeSE = Math.sqrt(sse / (n - 2) / sxx)
  return { slope, intercept, r2, n, slopeSE, predict: (x: number) => slope * x + intercept }
}

/* ── Chi-square goodness / independence ──────────────────────────────────── */
export function chiSquareTest(observed: number[][]): TestResult | null {
  const rows = observed.length
  const cols = observed[0]?.length ?? 0
  if (rows < 2 || cols < 2) return null
  const rowSums = observed.map((r) => r.reduce((a, b) => a + b, 0))
  const colSums = observed[0].map((_, j) => observed.reduce((s, r) => s + r[j], 0))
  const total = rowSums.reduce((a, b) => a + b, 0)
  let chi = 0
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const e = (rowSums[i] * colSums[j]) / total
      if (e > 0) chi += (observed[i][j] - e) ** 2 / e
    }
  }
  const df = (rows - 1) * (cols - 1)
  return {
    name: "Chi-square test of independence",
    stat: [{ label: "χ²", value: chi }],
    p: chiSquareUpperP(chi, df),
    df: `${df}`,
  }
}

/* ── Multiple-comparison correction ──────────────────────────────────────── */
export type CorrectionMethod =
  | "none"
  | "bonferroni"
  | "sidak"
  | "holm"
  | "holm-sidak"
  | "benjamini-hochberg"
  | "benjamini-yekutieli"

/**
 * The two corrections that control the false discovery rate rather than the
 * family-wise error rate — the right default once the comparison count is in the
 * hundreds (omics, marker panels), where FWER control leaves no power.
 */
export const FDR_METHODS = ["benjamini-hochberg", "benjamini-yekutieli"] as const
export const isFdr = (m: CorrectionMethod) => (FDR_METHODS as readonly string[]).includes(m)

/** Adjust a set of raw p-values for multiple comparisons (order preserved). */
export function pAdjust(pvals: number[], method: CorrectionMethod): number[] {
  const m = pvals.length
  if (m === 0) return []
  const clamp = (x: number) => Math.max(0, Math.min(1, x))
  switch (method) {
    case "none":
      return pvals.map(clamp)
    case "bonferroni":
      return pvals.map((p) => clamp(p * m))
    case "sidak":
      return pvals.map((p) => clamp(1 - (1 - p) ** m))
    case "holm":
    case "holm-sidak": {
      const order = pvals.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p)
      const adj = new Array(m).fill(0)
      let prev = 0
      order.forEach((o, rank) => {
        const factor = m - rank
        const a = method === "holm" ? o.p * factor : 1 - (1 - o.p) ** factor
        prev = Math.max(prev, clamp(a)) // step-down monotonicity
        adj[o.i] = prev
      })
      return adj
    }
    case "benjamini-hochberg":
    case "benjamini-yekutieli": {
      // Benjamini–Hochberg (1995): adjusted p₍ᵢ₎ = min over k ≥ i of (m/k)·p₍ₖ₎,
      // i.e. the reverse cumulative minimum walking DOWN from the largest p —
      // the mirror image of Holm's step-down running maximum above.
      // Benjamini–Yekutieli (2001) multiplies by the harmonic number
      // c(m) = Σ 1/i, the price of dropping BH's positive-dependence assumption.
      const c =
        method === "benjamini-yekutieli"
          ? Array.from({ length: m }, (_, i) => 1 / (i + 1)).reduce((a, b) => a + b, 0)
          : 1
      const order = pvals.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p)
      const adj = new Array(m).fill(0)
      let prev = 1
      for (let rank = m - 1; rank >= 0; rank--) {
        prev = Math.min(prev, clamp((c * m * order[rank].p) / (rank + 1))) // step-up monotonicity
        adj[order[rank].i] = prev
      }
      return adj
    }
  }
}

/* ── Pairwise / vs-control multiple comparisons (post-ANOVA) ──────────────── */
export type Comparison = {
  a: string
  b: string
  diff: number
  t: number
  p: number
  pAdj: number
  ciLow: number
  ciHigh: number
  significant: boolean
  /**
   * Effect size for THIS row — §6.3 wants one beside every comparison, and a
   * difference in assay units is not one. Hedges' g on the pooled within-group
   * SD for the parametric rows, rank-biserial (Cliff's δ) for the rank-based
   * ones. No interval: a simultaneous interval for a standardised effect is not
   * defined by any correction offered here, and the multiplicity-adjusted
   * interval on the raw difference beside it already carries the uncertainty.
   */
  effect: { label: string; value: number }
}

/**
 * Per-comparison two-sided level whose interval agrees with the adjusted p.
 *
 * Bonferroni and Šidák are SINGLE-STEP: every hypothesis is judged against one
 * threshold, so the simultaneous interval is just the per-comparison interval
 * at that threshold and the agreement is exact. Bonferroni rejects when
 * min(1, m·p) < α, i.e. p < α/m, which is precisely when the 1 − α/m interval
 * excludes zero; Šidák rejects when 1 − (1−p)^m < α, i.e. p < 1 − (1−α)^(1/m).
 *
 * Returns null for the STEP-DOWN procedures (Holm, Holm–Šidák). Each ordered
 * p is compared against a threshold that depends on how many hypotheses survive
 * ahead of it, so there is no single level a fixed-width interval could be built
 * at, and no generally accepted simultaneous interval exists. Reporting the
 * conservative single-step interval instead is the tempting answer and the wrong
 * one: Holm's adjusted p is never larger than Bonferroni's, so a comparison can
 * be Holm-significant while the Bonferroni interval still contains zero — the
 * same contradiction this file removes, pointing the other way, and wearing the
 * costume of a real number. Callers report NaN, the "no interval defined"
 * sentinel already used for unselected FDR rows.
 *
 * FDR methods return null too; they are handled by the FCR path, which is the
 * interval that does exist for them.
 */
export function singleStepAlpha(method: CorrectionMethod, alpha: number, m: number): number | null {
  switch (method) {
    case "none":
      return alpha
    case "bonferroni":
      return alpha / m
    case "sidak":
      return 1 - (1 - alpha) ** (1 / m)
    default:
      return null
  }
}

/**
 * Hedges' g for one post-hoc row, standardised on the ANOVA's pooled within-group
 * SD so the whole family sits on one scale. The correction uses df_within, the df
 * that SD was estimated with.
 */
function pooledHedgesG(diff: number, msw: number, dfw: number): number {
  if (!(msw > 0) || dfw < 2) return NaN
  const j = Math.exp(lnGamma(dfw / 2) - Math.log(Math.sqrt(dfw / 2)) - lnGamma((dfw - 1) / 2))
  return (diff / Math.sqrt(msw)) * j
}

/** Lanczos ln Γ(z), z > 0 — only needed for Hedges' small-sample correction. */
function lnGamma(z: number): number {
  const g = [
    676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ]
  let x = 0.99999999999980993
  for (let i = 0; i < g.length; i++) x += g[i] / (z + i)
  const t = z + g.length - 0.5
  return 0.5 * Math.log(2 * Math.PI) + (z - 0.5) * Math.log(t) - t + Math.log(x)
}

/** Rank-biserial correlation (Cliff's δ) for one pair, from the pair's own values. */
function pairRankBiserial(x: number[], y: number[]): number {
  const n1 = x.length
  const n2 = y.length
  if (n1 < 1 || n2 < 1) return NaN
  // U₁ via mid-ranks, so ties contribute a half each — the same convention the
  // rank tests above use.
  let u1 = 0
  for (const a of x) for (const b of y) u1 += a > b ? 1 : a === b ? 0.5 : 0
  return (2 * u1) / (n1 * n2) - 1
}

/**
 * Multiple comparisons after one-way ANOVA using the pooled error variance and
 * a chosen family-wise correction. Provide `control` to compare every group to
 * it (Dunnett-style, corrected by the chosen method) instead of all pairs.
 */
export function multipleComparisons(
  groups: { name: string; values: number[] }[],
  opts: { method?: CorrectionMethod; control?: string; alpha?: number } = {},
): Comparison[] {
  const method = opts.method ?? "holm-sidak"
  const alpha = opts.alpha ?? 0.05
  const g = groups.map((x) => ({ name: x.name, values: x.values.filter(isFinite) })).filter((x) => x.values.length > 1)
  const k = g.length
  if (k < 2) return []
  const N = g.reduce((s, x) => s + x.values.length, 0)
  let ssw = 0
  for (const grp of g) {
    const m = mean(grp.values)
    for (const v of grp.values) ssw += (v - m) ** 2
  }
  const dfw = N - k
  const msw = ssw / dfw
  const pairs: { a: number; b: number }[] = []
  if (opts.control) {
    const ci = g.findIndex((x) => x.name === opts.control)
    if (ci < 0) return []
    for (let j = 0; j < k; j++) if (j !== ci) pairs.push({ a: ci, b: j })
  } else {
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) pairs.push({ a: i, b: j })
  }
  // The margin is a function of the CORRECTION, not of α alone. Building every
  // interval at 1 − α/2 was the defect: it put a plain per-comparison interval
  // that excludes zero beside an adjusted p saying the comparison is not
  // significant — pAdj = 0.23967 next to [0.052, 1.948].
  const raw = pairs.map(({ a, b }) => {
    const mi = mean(g[a].values)
    const mj = mean(g[b].values)
    const se = Math.sqrt(msw * (1 / g[a].values.length + 1 / g[b].values.length))
    const t = (mi - mj) / se
    return { a, b, diff: mi - mj, se, t, p: tTwoSidedP(t, dfw) }
  })
  const adj = pAdjust(raw.map((r) => r.p), method)
  const sig = adj.map((p) => p < alpha)

  // An FDR-adjusted p beside a plain 1−α interval contradicts itself: the p says
  // "not a discovery" while the interval, built at the uncorrected level,
  // excludes zero. Benjamini & Yekutieli (2005) give the matching interval —
  // select the R rows the FDR procedure rejects, then build intervals at level
  // 1 − R·α/m for exactly those R parameters. The false coverage-statement rate
  // over the selected set is then at most α, and the pairing is exact rather
  // than thematic: a selected row has raw p ≤ rank·α/m ≤ R·α/m, so its interval
  // excludes zero precisely when the row was selected.
  //
  // Unselected rows get NaN, the same "no interval defined" sentinel dunnTest
  // already uses: FCR theory constructs intervals only over the selected set,
  // and re-issuing the uncorrected one there is the defect this avoids.
  const R = sig.filter(Boolean).length
  const fdr = isFdr(method)
  const fcrCrit = fdr && R > 0 ? tCritical((alpha * R) / raw.length, dfw) : NaN
  // Single-step (Bonferroni/Šidák/none) get their interval at the level their
  // own adjusted p is judged at; step-down (Holm/Holm–Šidák) get NaN, because
  // no simultaneous interval for them exists. See `singleStepAlpha`.
  const perAlpha = singleStepAlpha(method, alpha, raw.length)
  const singleStepCrit = perAlpha === null ? NaN : tCritical(perAlpha, dfw)

  return raw.map((r, i) => {
    const crit = fdr ? (sig[i] ? fcrCrit : NaN) : singleStepCrit
    return {
      a: g[r.a].name,
      b: g[r.b].name,
      diff: r.diff,
      t: r.t,
      p: r.p,
      pAdj: adj[i],
      ciLow: r.diff - crit * r.se,
      ciHigh: r.diff + crit * r.se,
      significant: sig[i],
      effect: { label: "Hedges' g", value: pooledHedgesG(r.diff, msw, dfw) },
    }
  })
}

/* ── Welch's ANOVA (does not assume equal variances) ─────────────────────── */
export function welchAnova(groups: { name: string; values: number[] }[]): TestResult | null {
  const g = groups.map((x) => x.values.filter(isFinite)).filter((v) => v.length > 1)
  const k = g.length
  if (k < 2) return null
  const stats = g.map((v) => ({ n: v.length, m: mean(v), w: v.length / variance(v) }))
  const sumW = stats.reduce((s, x) => s + x.w, 0)
  const mBar = stats.reduce((s, x) => s + x.w * x.m, 0) / sumW
  let numer = 0
  for (const s of stats) numer += s.w * (s.m - mBar) ** 2
  numer /= k - 1
  let denomSum = 0
  for (const s of stats) denomSum += (1 - s.w / sumW) ** 2 / (s.n - 1)
  const denom = 1 + ((2 * (k - 2)) / (k * k - 1)) * denomSum
  const F = numer / denom
  const df1 = k - 1
  const df2 = (k * k - 1) / (3 * denomSum)
  return {
    name: "Welch's ANOVA",
    stat: [{ label: "F", value: F }],
    p: fUpperP(F, df1, df2),
    df: `${df1}, ${df2.toFixed(1)}`,
    note: "Does not assume equal variances.",
  }
}

/* ── Two-way ANOVA (balanced, fixed effects, with interaction) ───────────── */
export type TwoWayCell = { a: string; b: string; values: number[] }
export type AnovaTerm = { source: string; ss: number; df: number; ms: number; F: number; p: number }
export type TwoWayResult = { terms: AnovaTerm[]; note?: string }

/** Gaussian elimination with partial pivoting; null if the system is singular. */
function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]])
  for (let col = 0; col < n; col++) {
    let piv = col
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r
    if (Math.abs(M[piv][col]) < 1e-12) return null
    ;[M[col], M[piv]] = [M[piv], M[col]]
    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const f = M[r][col] / M[col][col]
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c]
    }
  }
  return M.map((row, i) => row[n] / row[i])
}

/**
 * Two-way ANOVA with interaction. Each cell is one (factor-A level × factor-B
 * level) combination with its replicate values.
 *
 * Uses **Type II** sums of squares: each main effect is adjusted for the other
 * (SS(A|B), SS(B|A)) and the interaction for both. Type I SS computed from raw
 * marginal means is only valid when the design is balanced — on unbalanced
 * data the main effects double-count the shared variance and the residual
 * SS_AB = SS_cells − SS_A − SS_B goes NEGATIVE, producing a negative F. Type II
 * cannot: every term is a difference of nested residual sums of squares.
 * Matches `statsmodels.stats.anova_lm(..., typ=2)`; identical to Type I when
 * the design is balanced.
 */
export function twoWayAnova(cells: TwoWayCell[]): TwoWayResult | null {
  const clean = cells
    .map((c) => ({ a: c.a, b: c.b, values: c.values.filter(isFinite) }))
    .filter((c) => c.values.length > 0)
  if (!clean.length) return null
  const aLevels = [...new Set(clean.map((c) => c.a))]
  const bLevels = [...new Set(clean.map((c) => c.b))]
  const A = aLevels.length
  const B = bLevels.length
  if (A < 2 || B < 2) return null
  const N = clean.reduce((s, c) => s + c.values.length, 0)
  type Cell = { a: string; b: string; values: number[] }
  const cellMap = new Map<string, Cell>()
  const aVals = new Map<string, number[]>()
  const bVals = new Map<string, number[]>()
  for (const c of clean) {
    // \u0000 is a collision-proof composite key delimiter: it cannot occur in a
    // factor label. Written as an escape so the file stays greppable text.
    const key = `${c.a}\u0000${c.b}`
    const cur = cellMap.get(key)
    if (cur) cur.values.push(...c.values)
    else cellMap.set(key, { a: c.a, b: c.b, values: [...c.values] })
    aVals.set(c.a, (aVals.get(c.a) ?? []).concat(c.values))
    bVals.set(c.b, (bVals.get(c.b) ?? []).concat(c.values))
  }
  const cellList = [...cellMap.values()]

  /** Residual SS of a model whose fitted value for every point in a cell is `fitted`. */
  const sseOf = (fitted: (c: Cell) => number) => {
    let s = 0
    for (const c of cellList) {
      const f = fitted(c)
      for (const x of c.values) s += (x - f) ** 2
    }
    return s
  }
  const sseAOnly = sseOf((c) => mean(aVals.get(c.a)!))
  const sseBOnly = sseOf((c) => mean(bVals.get(c.b)!))
  const ssWithin = sseOf((c) => mean(c.values)) // saturated cell-means model

  // Additive model (A + B, no interaction) by least squares on the reference-
  // coded design [intercept, A₂…A_A, B₂…B_B]; aggregated over cells, since
  // every point in a cell shares a design row.
  const aIndex = new Map(aLevels.map((lv, i) => [lv, i]))
  const bIndex = new Map(bLevels.map((lv, i) => [lv, i]))
  const np = A + B - 1
  const designRow = (c: Cell) => {
    const row = new Array(np).fill(0)
    row[0] = 1
    const ai = aIndex.get(c.a)!
    const bi = bIndex.get(c.b)!
    if (ai > 0) row[ai] = 1
    if (bi > 0) row[A - 1 + bi] = 1
    return row
  }
  const XtX: number[][] = Array.from({ length: np }, () => new Array(np).fill(0))
  const Xty = new Array(np).fill(0)
  for (const c of cellList) {
    const row = designRow(c)
    const n = c.values.length
    const m = mean(c.values)
    for (let i = 0; i < np; i++) {
      Xty[i] += n * row[i] * m
      for (let j = 0; j < np; j++) XtX[i][j] += n * row[i] * row[j]
    }
  }
  const beta = solveLinear(XtX, Xty)
  if (!beta) return null // disconnected design: no estimable additive model
  const sseAdd = sseOf((c) => designRow(c).reduce((s, v, i) => s + v * beta[i], 0))

  const ssA = sseBOnly - sseAdd // SS(A | B)
  const ssB = sseAOnly - sseAdd // SS(B | A)
  const ssAB = sseAdd - ssWithin // SS(AB | A, B)
  const dfA = A - 1
  const dfB = B - 1
  const dfAB = cellList.length - dfA - dfB - 1
  const dfW = N - cellList.length
  const msW = ssWithin / dfW
  const term = (source: string, ss: number, df: number): AnovaTerm => {
    const ms = ss / df
    const F = ms / msW
    return { source, ss, df, ms, F, p: fUpperP(F, df, dfW) }
  }
  return {
    terms: [
      term("Factor A", ssA, dfA),
      term("Factor B", ssB, dfB),
      term("Interaction", ssAB, dfAB),
      { source: "Residual", ss: ssWithin, df: dfW, ms: msW, F: NaN, p: NaN },
    ],
    note: "Fixed-effects model, Type II sums of squares (valid for unbalanced designs).",
  }
}

/* ── D'Agostino–Pearson omnibus normality (K²) ───────────────────────────── */
export function dagostinoPearson(input: number[]): TestResult | null {
  const x = input.filter(isFinite)
  const n = x.length
  if (n < 8) return null
  const m = mean(x)
  const m2 = x.reduce((s, v) => s + (v - m) ** 2, 0) / n
  const m3 = x.reduce((s, v) => s + (v - m) ** 3, 0) / n
  const m4 = x.reduce((s, v) => s + (v - m) ** 4, 0) / n
  if (m2 === 0) return null
  const b1 = m3 / m2 ** 1.5
  const b2 = m4 / (m2 * m2)
  // Skewness → Z (D'Agostino 1970)
  const Y = b1 * Math.sqrt(((n + 1) * (n + 3)) / (6 * (n - 2)))
  const beta2 = (3 * (n * n + 27 * n - 70) * (n + 1) * (n + 3)) / ((n - 2) * (n + 5) * (n + 7) * (n + 9))
  const W2 = -1 + Math.sqrt(2 * (beta2 - 1))
  const delta = 1 / Math.sqrt(Math.log(Math.sqrt(W2)))
  const alphaS = Math.sqrt(2 / (W2 - 1))
  const Zg1 = delta * Math.log(Y / alphaS + Math.sqrt((Y / alphaS) ** 2 + 1))
  // Kurtosis → Z (Anscombe–Glynn)
  const eb2 = (3 * (n - 1)) / (n + 1)
  const varb2 = (24 * n * (n - 2) * (n - 3)) / ((n + 1) ** 2 * (n + 3) * (n + 5))
  const xk = (b2 - eb2) / Math.sqrt(varb2)
  const sqrtBeta1 =
    ((6 * (n * n - 5 * n + 2)) / ((n + 7) * (n + 9))) *
    Math.sqrt((6 * (n + 3) * (n + 5)) / (n * (n - 2) * (n - 3)))
  const Aa = 6 + (8 / sqrtBeta1) * (2 / sqrtBeta1 + Math.sqrt(1 + 4 / (sqrtBeta1 * sqrtBeta1)))
  const term1 = 1 - 2 / (9 * Aa)
  const term2 = (1 - 2 / Aa) / (1 + xk * Math.sqrt(2 / (Aa - 4)))
  const Zb2 = (term1 - Math.cbrt(term2)) / Math.sqrt(2 / (9 * Aa))
  const K2 = Zg1 * Zg1 + Zb2 * Zb2
  return {
    name: "D'Agostino–Pearson normality",
    stat: [{ label: "K²", value: K2 }],
    p: chiSquareUpperP(K2, 2),
    df: "2",
    note: "Omnibus test combining skewness and kurtosis (n ≥ 8).",
  }
}

/* ── Grubbs' outlier test (two-sided, single outlier) ──────────────────────
   The UNIVARIATE outlier test: is one value extreme within a single sample?
   It needs no model and answers nothing about a fitted curve.

   Its counterpart is `routOutliers` in ./curve-fitting, which is ROUT
   (Motulsky & Brown 2006). ROUT asks the other question — which points lie
   further from a FITTED MODEL than the scatter of the others explains — and
   its parameter is a false discovery rate Q, not a significance level α.
   The two are not interchangeable, and the exclusion record keys its params
   to whichever method actually ran (§8.1). */
export function grubbs(input: number[], alpha = 0.05): (TestResult & { outlier: number | null }) | null {
  const x = input.filter(isFinite)
  const n = x.length
  if (n < 3) return null
  const m = mean(x)
  const sd = stdev(x)
  if (sd === 0) return null
  let idx = 0
  let maxDev = 0
  x.forEach((v, i) => {
    const d = Math.abs(v - m)
    if (d > maxDev) {
      maxDev = d
      idx = i
    }
  })
  const G = maxDev / sd
  const t = tInv(1 - alpha / (2 * n), n - 2)
  const Gcrit = ((n - 1) / Math.sqrt(n)) * Math.sqrt((t * t) / (n - 2 + t * t))
  const under = (n - 1) ** 2 - n * G * G
  const t2 = under > 0 ? Math.sqrt((n * (n - 2) * G * G) / under) : NaN
  const p = isFinite(t2) ? Math.min(1, n * tTwoSidedP(t2, n - 2)) : 0
  const isOut = G > Gcrit
  return {
    name: "Grubbs' outlier test",
    stat: [{ label: "G", value: G }, { label: "G crit", value: Gcrit }],
    p,
    df: `n = ${n}`,
    outlier: isOut ? x[idx] : null,
    note: isOut ? `Value ${x[idx]} is a significant outlier (α = ${alpha}).` : "No significant outlier detected.",
  }
}

/* ── Contingency tables ──────────────────────────────────────────────────── */

/** Fisher's exact test for a 2×2 table [[a,b],[c,d]] (two-sided). */
export function fisherExact2x2(a: number, b: number, c: number, d: number): TestResult | null {
  if ([a, b, c, d].some((v) => v < 0 || !Number.isInteger(v))) return null
  const r1 = a + b
  const r2 = c + d
  const c1 = a + c
  const N = a + b + c + d
  if (N === 0 || r1 === 0 || c1 === 0 || r2 === 0) return null
  const pObs = hypergeometricPmf(a, N, c1, r1)
  const lo = Math.max(0, c1 - r2)
  const hi = Math.min(r1, c1)
  let p = 0
  for (let k = lo; k <= hi; k++) {
    const pk = hypergeometricPmf(k, N, c1, r1)
    if (pk <= pObs * (1 + 1e-7)) p += pk
  }
  const or = (a * d) / (b * c)
  return {
    name: "Fisher's exact test",
    stat: [{ label: "odds ratio", value: or }],
    p: Math.min(1, p),
    df: "2×2",
    note: "Exact two-sided test for a 2×2 table.",
  }
}

/** McNemar's test for paired binary data; b and c are the discordant counts. */
export function mcnemar(b: number, c: number, continuity = true): TestResult | null {
  if (b < 0 || c < 0) return null
  const denom = b + c
  if (denom === 0) return null
  const chi = continuity ? (Math.abs(b - c) - 1) ** 2 / denom : (b - c) ** 2 / denom
  return {
    name: "McNemar's test",
    stat: [{ label: "χ²", value: chi }],
    p: chiSquareUpperP(chi, 1),
    df: "1",
    note: continuity ? "With continuity correction." : undefined,
  }
}

/** Odds ratio and relative risk with 95% CIs for a 2×2 table [[a,b],[c,d]]. */
export type Association2x2 = {
  oddsRatio: number
  orCI: [number, number]
  relativeRisk: number
  rrCI: [number, number]
}
export function association2x2(a: number, b: number, c: number, d: number): Association2x2 {
  const or = (a * d) / (b * c)
  const seLogOr = Math.sqrt(1 / a + 1 / b + 1 / c + 1 / d)
  const orCI: [number, number] = [
    Math.exp(Math.log(or) - 1.96 * seLogOr),
    Math.exp(Math.log(or) + 1.96 * seLogOr),
  ]
  const rr = a / (a + b) / (c / (c + d))
  const seLogRr = Math.sqrt(1 / a - 1 / (a + b) + 1 / c - 1 / (c + d))
  const rrCI: [number, number] = [
    Math.exp(Math.log(rr) - 1.96 * seLogRr),
    Math.exp(Math.log(rr) + 1.96 * seLogRr),
  ]
  return { oddsRatio: or, orCI, relativeRisk: rr, rrCI }
}

/** Chi-square goodness-of-fit vs expected counts (uniform if omitted). */
export function chiSquareGoodnessOfFit(observed: number[], expected?: number[]): TestResult | null {
  const k = observed.length
  if (k < 2) return null
  const total = observed.reduce((a, b) => a + b, 0)
  const exp = expected && expected.length === k ? expected : new Array(k).fill(total / k)
  let chi = 0
  for (let i = 0; i < k; i++) if (exp[i] > 0) chi += (observed[i] - exp[i]) ** 2 / exp[i]
  const df = k - 1
  return {
    name: "Chi-square goodness-of-fit",
    stat: [{ label: "χ²", value: chi }],
    p: chiSquareUpperP(chi, df),
    df: `${df}`,
  }
}

/* ── Dunn's post-hoc (after Kruskal–Wallis) ──────────────────────────────── */
export function dunnTest(
  groups: { name: string; values: number[] }[],
  method: CorrectionMethod = "holm",
  alpha = 0.05,
): Comparison[] {
  const g = groups.map((x) => ({ name: x.name, values: x.values.filter(isFinite) })).filter((x) => x.values.length > 0)
  const k = g.length
  if (k < 2) return []
  const all = g.flatMap((x) => x.values)
  const N = all.length
  const ranks = rank(all)
  let idx = 0
  const meanRanks: number[] = []
  for (const grp of g) {
    let s = 0
    for (let i = 0; i < grp.values.length; i++) s += ranks[idx++]
    meanRanks.push(s / grp.values.length)
  }
  // Tie correction for the rank-sum variance.
  const tieSum = tieCorrection(all)
  const sigmaFactor = (N * (N + 1)) / 12 - tieSum / (12 * (N - 1))
  const pairs: { a: number; b: number }[] = []
  for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) pairs.push({ a: i, b: j })
  const raw = pairs.map(({ a, b }) => {
    const se = Math.sqrt(sigmaFactor * (1 / g[a].values.length + 1 / g[b].values.length))
    const z = (meanRanks[a] - meanRanks[b]) / se
    return { a, b, diff: meanRanks[a] - meanRanks[b], se, z, p: normalTwoSidedP(z) }
  })
  const adj = pAdjust(raw.map((r) => r.p), method)
  // Rank units are not an excuse for a mismatched interval: a band on a
  // rank-mean difference that excludes zero while the adjusted p says the pair
  // is not separated contradicts itself exactly as one in assay units would.
  // Single-step methods get the interval at their own level; step-down ones get
  // NaN, which is what this function used to return unconditionally.
  const perAlpha = singleStepAlpha(method, alpha, raw.length)
  const zc = perAlpha === null ? NaN : normalInv(1 - perAlpha / 2)
  return raw.map((r, i) => ({
    a: g[r.a].name,
    b: g[r.b].name,
    diff: r.diff,
    t: r.z,
    p: r.p,
    pAdj: adj[i],
    ciLow: r.diff - zc * r.se,
    ciHigh: r.diff + zc * r.se,
    significant: adj[i] < alpha,
    effect: {
      label: "rank-biserial r",
      value: pairRankBiserial(g[r.a].values, g[r.b].values),
    },
  }))
}

/** Significance stars for a p-value. */
export function sigStars(p: number): string {
  if (!isFinite(p)) return ""
  if (p < 0.001) return "***"
  if (p < 0.01) return "**"
  if (p < 0.05) return "*"
  return "ns"
}
