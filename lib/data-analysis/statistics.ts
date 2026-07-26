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
  fUpperP,
  chiSquareUpperP,
  normalInv,
} from "./distributions"

export type TestResult = {
  name: string
  stat: { label: string; value: number }[]
  p: number
  df?: string
  effect?: { label: string; value: number }
  note?: string
}

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
}

export function describe(xs: number[]): Descriptive {
  const vals = xs.filter((v) => isFinite(v))
  const n = vals.length
  const m = mean(vals)
  const sd = stdev(vals)
  const sem = sd / Math.sqrt(n)
  const q1 = quantile(vals, 0.25)
  const q3 = quantile(vals, 0.75)
  // 95% CI using normal approx (fine for n≥~30; a t-multiplier is used in tests)
  const half = 1.96 * sem
  return {
    n,
    mean: m,
    sd,
    sem,
    median: median(vals),
    q1,
    q3,
    iqr: q3 - q1,
    min: Math.min(...vals),
    max: Math.max(...vals),
    cv: (sd / m) * 100,
    ci95: [m - half, m + half],
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
export function oneSampleT(xs: number[], mu0: number): TestResult | null {
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
    p: tTwoSidedP(t, df),
    df: `${df}`,
    effect: { label: "Cohen's d", value: d },
  }
}

export function unpairedT(a: number[], b: number[], welch = true): TestResult | null {
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
    p: tTwoSidedP(t, df),
    df: df.toFixed(1),
    effect: { label: "Cohen's d", value: d },
  }
}

export function pairedT(a: number[], b: number[]): TestResult | null {
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
    p: tTwoSidedP(t, df),
    df: `${df}`,
    effect: { label: "Cohen's dz", value: md / sd },
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

export type TukeyPair = { a: string; b: string; diff: number; q: number; significant: boolean }

/**
 * Tukey HSD post-hoc. Uses a normal-approximation critical q (α=0.05); good
 * enough to flag which pairs drive an ANOVA. Marks pairs whose |q| exceeds the
 * approximate studentized-range critical value.
 */
export function tukeyHSD(groups: { name: string; values: number[] }[]): TukeyPair[] {
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
  // Approximate critical studentized range q(0.05, k, dfw)
  const qcrit = studentizedRangeCrit(k, dfw)
  const out: TukeyPair[] = []
  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      const mi = mean(g[i].values)
      const mj = mean(g[j].values)
      const se = Math.sqrt((msw / 2) * (1 / g[i].values.length + 1 / g[j].values.length))
      const q = Math.abs(mi - mj) / se
      out.push({ a: g[i].name, b: g[j].name, diff: mi - mj, q, significant: q > qcrit })
    }
  }
  return out
}

/** Rough studentized-range critical value at α=0.05 (interpolated table-ish). */
function studentizedRangeCrit(k: number, df: number): number {
  // Coarse lookup for common k, large-df; scaled up a touch for small df.
  const base: Record<number, number> = { 2: 2.77, 3: 3.31, 4: 3.63, 5: 3.86, 6: 4.03, 7: 4.17, 8: 4.29, 9: 4.39, 10: 4.47 }
  const q = base[Math.min(10, Math.max(2, k))] ?? 4.47
  const dfAdj = df < 10 ? 1 + (10 - df) * 0.03 : 1
  return q * dfAdj
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

/** Significance stars for a p-value. */
export function sigStars(p: number): string {
  if (!isFinite(p)) return ""
  if (p < 0.001) return "***"
  if (p < 0.01) return "**"
  if (p < 0.05) return "*"
  return "ns"
}
