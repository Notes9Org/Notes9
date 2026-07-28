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
} from "./distributions"

export type TestResult = {
  name: string
  stat: { label: string; value: number }[]
  p: number
  df?: string
  effect?: { label: string; value: number }
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
    note: p < 0.05 ? "Data deviate from normal — consider a non-parametric test." : "No significant deviation from normality.",
  }
}

/* ── t-tests ─────────────────────────────────────────────────────────────── */
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

export function mannWhitney(a: number[], b: number[]): TestResult | null {
  const x = a.filter(isFinite)
  const y = b.filter(isFinite)
  const n1 = x.length
  const n2 = y.length
  if (n1 < 1 || n2 < 1) return null
  const ranks = rank([...x, ...y])
  const r1 = ranks.slice(0, n1).reduce((s, r) => s + r, 0)
  const u1 = r1 - (n1 * (n1 + 1)) / 2
  const u2 = n1 * n2 - u1
  const U = Math.min(u1, u2)
  const mu = (n1 * n2) / 2
  const sigma = Math.sqrt((n1 * n2 * (n1 + n2 + 1)) / 12)
  const z = (U - mu) / sigma
  return {
    name: "Mann–Whitney U",
    stat: [{ label: "U", value: U }, { label: "z", value: z }],
    p: normalTwoSidedP(z),
    df: `n₁=${n1}, n₂=${n2}`,
    note: "Rank-based; robust to non-normal data.",
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
  const sigma = Math.sqrt((n * (n + 1) * (2 * n + 1)) / 24)
  const z = (W - mu) / sigma
  return {
    name: "Wilcoxon signed-rank",
    stat: [{ label: "W", value: W }, { label: "z", value: z }],
    p: normalTwoSidedP(z),
    df: `n = ${n}`,
    note: "Paired, rank-based.",
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
  return {
    name: "Kruskal–Wallis H",
    stat: [{ label: "H", value: H }],
    p: chiSquareUpperP(H, k - 1),
    df: `${k - 1}`,
    note: "Non-parametric one-way test across groups.",
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
export type CorrectionMethod = "none" | "bonferroni" | "sidak" | "holm" | "holm-sidak"

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
  const tc = tCritical(alpha, dfw)
  const raw = pairs.map(({ a, b }) => {
    const mi = mean(g[a].values)
    const mj = mean(g[b].values)
    const se = Math.sqrt(msw * (1 / g[a].values.length + 1 / g[b].values.length))
    const t = (mi - mj) / se
    return { a, b, diff: mi - mj, se, t, p: tTwoSidedP(t, dfw) }
  })
  const adj = pAdjust(raw.map((r) => r.p), method)
  return raw.map((r, i) => ({
    a: g[r.a].name,
    b: g[r.b].name,
    diff: r.diff,
    t: r.t,
    p: r.p,
    pAdj: adj[i],
    ciLow: r.diff - tc * r.se,
    ciHigh: r.diff + tc * r.se,
    significant: adj[i] < alpha,
  }))
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

/**
 * Two-way ANOVA with interaction. Each cell is one (factor-A level × factor-B
 * level) combination with its replicate values. Uses Type I sums of squares —
 * exact for balanced designs (equal replicates per cell).
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
  const all = clean.flatMap((c) => c.values)
  const N = all.length
  const grand = mean(all)
  const cellMap = new Map<string, number[]>()
  const aVals = new Map<string, number[]>()
  const bVals = new Map<string, number[]>()
  for (const c of clean) {
    const key = `${c.a} ${c.b}`
    cellMap.set(key, (cellMap.get(key) ?? []).concat(c.values))
    aVals.set(c.a, (aVals.get(c.a) ?? []).concat(c.values))
    bVals.set(c.b, (bVals.get(c.b) ?? []).concat(c.values))
  }
  let ssA = 0
  for (const lv of aLevels) {
    const v = aVals.get(lv)!
    ssA += v.length * (mean(v) - grand) ** 2
  }
  let ssB = 0
  for (const lv of bLevels) {
    const v = bVals.get(lv)!
    ssB += v.length * (mean(v) - grand) ** 2
  }
  let ssCells = 0
  let ssWithin = 0
  for (const [, v] of cellMap) {
    const cm = mean(v)
    ssCells += v.length * (cm - grand) ** 2
    for (const x of v) ssWithin += (x - cm) ** 2
  }
  const ssAB = ssCells - ssA - ssB
  const dfA = A - 1
  const dfB = B - 1
  const dfAB = (A - 1) * (B - 1)
  const dfW = N - A * B
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
    note: "Balanced fixed-effects model (Type I sums of squares).",
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

/* ── Grubbs' outlier test (two-sided, single outlier) ────────────────────── */
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
  const counts = new Map<number, number>()
  for (const v of all) counts.set(v, (counts.get(v) ?? 0) + 1)
  let tieSum = 0
  for (const [, t] of counts) tieSum += t ** 3 - t
  const sigmaFactor = (N * (N + 1)) / 12 - tieSum / (12 * (N - 1))
  const pairs: { a: number; b: number }[] = []
  for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) pairs.push({ a: i, b: j })
  const raw = pairs.map(({ a, b }) => {
    const se = Math.sqrt(sigmaFactor * (1 / g[a].values.length + 1 / g[b].values.length))
    const z = (meanRanks[a] - meanRanks[b]) / se
    return { a, b, diff: meanRanks[a] - meanRanks[b], z, p: normalTwoSidedP(z) }
  })
  const adj = pAdjust(raw.map((r) => r.p), method)
  return raw.map((r, i) => ({
    a: g[r.a].name,
    b: g[r.b].name,
    diff: r.diff,
    t: r.z,
    p: r.p,
    pAdj: adj[i],
    ciLow: NaN,
    ciHigh: NaN,
    significant: adj[i] < 0.05,
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
