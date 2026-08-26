/**
 * Statistical distribution functions used across the data-analysis feature.
 *
 * These implement the regularized incomplete beta and incomplete gamma
 * functions (continued-fraction / series expansions, per Numerical Recipes)
 * so we can compute exact-ish p-values for the t, F and chi-square
 * distributions without any external dependency. Accuracy is well within what
 * a bench scientist needs for significance calls.
 */

/** Natural log of the gamma function (Lanczos approximation). */
export function logGamma(x: number): number {
  const g = 7
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ]
  if (x < 0.5) {
    // Reflection formula
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x)
  }
  x -= 1
  let a = c[0]
  const t = x + g + 0.5
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i)
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a)
}

/** Error function (Abramowitz & Stegun 7.1.26). */
export function erf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x))
  const y =
    1 -
    (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t) *
      Math.exp(-x * x)
  return x >= 0 ? y : -y
}

/** Standard normal CDF. */
export function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2))
}

/** Two-sided p-value from a z score. */
export function normalTwoSidedP(z: number): number {
  return 2 * (1 - normalCdf(Math.abs(z)))
}

/**
 * Regularized incomplete beta function I_x(a, b).
 * Continued-fraction expansion (Lentz's algorithm).
 */
export function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const lbeta = logGamma(a + b) - logGamma(a) - logGamma(b)
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b + lbeta) / a

  // Lentz's continued fraction
  const tiny = 1e-30
  let f = 1
  let c = 1
  let d = 0
  for (let i = 0; i <= 200; i++) {
    const m = Math.floor(i / 2)
    let numerator: number
    if (i === 0) {
      numerator = 1
    } else if (i % 2 === 0) {
      numerator = (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m))
    } else {
      numerator = -((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1))
    }
    d = 1 + numerator * d
    if (Math.abs(d) < tiny) d = tiny
    d = 1 / d
    c = 1 + numerator / c
    if (Math.abs(c) < tiny) c = tiny
    const cd = c * d
    f *= cd
    if (Math.abs(1 - cd) < 1e-10) break
  }
  const result = front * (f - 1)
  // Use symmetry for better convergence when x is large
  if (x > (a + 1) / (a + b + 2)) {
    return 1 - incompleteBetaComplement(x, a, b)
  }
  return result
}

function incompleteBetaComplement(x: number, a: number, b: number): number {
  // I_x(a,b) = 1 - I_{1-x}(b,a); compute the mirrored side directly.
  const y = 1 - x
  const lbeta = logGamma(a + b) - logGamma(a) - logGamma(b)
  const front = Math.exp(Math.log(y) * b + Math.log(1 - y) * a + lbeta) / b
  const tiny = 1e-30
  let f = 1
  let c = 1
  let d = 0
  for (let i = 0; i <= 200; i++) {
    const m = Math.floor(i / 2)
    let numerator: number
    if (i === 0) {
      numerator = 1
    } else if (i % 2 === 0) {
      numerator = (m * (a - m) * y) / ((b + 2 * m - 1) * (b + 2 * m))
    } else {
      numerator = -((b + m) * (a + b + m) * y) / ((b + 2 * m) * (b + 2 * m + 1))
    }
    d = 1 + numerator * d
    if (Math.abs(d) < tiny) d = tiny
    d = 1 / d
    c = 1 + numerator / c
    if (Math.abs(c) < tiny) c = tiny
    const cd = c * d
    f *= cd
    if (Math.abs(1 - cd) < 1e-10) break
  }
  return front * (f - 1)
}

/** Student's t CDF (lower tail) for `df` degrees of freedom. */
export function studentTCdf(t: number, df: number): number {
  const x = df / (df + t * t)
  const ib = incompleteBeta(x, df / 2, 0.5)
  return t > 0 ? 1 - 0.5 * ib : 0.5 * ib
}

/** Two-sided p-value from a t statistic. */
export function tTwoSidedP(t: number, df: number): number {
  if (!isFinite(t) || df <= 0) return NaN
  const x = df / (df + t * t)
  return incompleteBeta(x, df / 2, 0.5)
}

/** F-distribution CDF (lower tail). */
export function fCdf(f: number, d1: number, d2: number): number {
  if (f <= 0) return 0
  const x = (d1 * f) / (d1 * f + d2)
  return incompleteBeta(x, d1 / 2, d2 / 2)
}

/** Upper-tail p-value for an F statistic (used by ANOVA). */
export function fUpperP(f: number, d1: number, d2: number): number {
  if (!isFinite(f) || f <= 0) return 1
  return 1 - fCdf(f, d1, d2)
}

/** Lower regularized incomplete gamma P(a, x) via series / continued fraction. */
export function lowerIncompleteGamma(a: number, x: number): number {
  if (x <= 0) return 0
  if (x < a + 1) {
    // Series expansion
    let sum = 1 / a
    let term = sum
    for (let n = 1; n < 300; n++) {
      term *= x / (a + n)
      sum += term
      if (Math.abs(term) < Math.abs(sum) * 1e-12) break
    }
    return sum * Math.exp(-x + a * Math.log(x) - logGamma(a))
  }
  // Continued fraction for the complement, then subtract
  const tiny = 1e-30
  let b = x + 1 - a
  let c = 1 / tiny
  let d = 1 / b
  let h = d
  for (let i = 1; i < 300; i++) {
    const an = -i * (i - a)
    b += 2
    d = an * d + b
    if (Math.abs(d) < tiny) d = tiny
    c = b + an / c
    if (Math.abs(c) < tiny) c = tiny
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < 1e-12) break
  }
  const q = Math.exp(-x + a * Math.log(x) - logGamma(a)) * h
  return 1 - q
}

/**
 * Upper regularized incomplete gamma Q(a, x) = 1 - P(a, x), computed directly
 * rather than by subtraction so that a deep tail does not cancel to zero.
 */
export function upperIncompleteGamma(a: number, x: number): number {
  if (x <= 0) return 1
  if (x < a + 1) return 1 - lowerIncompleteGamma(a, x)
  return Math.exp(logUpperIncompleteGammaCF(a, x))
}

/**
 * ln Q(a, x) by continued fraction, valid only for x ≥ a + 1. Kept in log form
 * because Q itself underflows to 0 below ~1e-323 while its logarithm stays
 * perfectly ordinary — which is the difference between reporting a 40σ tail and
 * reporting −Infinity.
 */
function logUpperIncompleteGammaCF(a: number, x: number): number {
  const tiny = 1e-30
  let b = x + 1 - a
  let c = 1 / tiny
  let d = 1 / b
  let h = d
  for (let i = 1; i < 300; i++) {
    const an = -i * (i - a)
    b += 2
    d = an * d + b
    if (Math.abs(d) < tiny) d = tiny
    c = b + an / c
    if (Math.abs(c) < tiny) c = tiny
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < 1e-12) break
  }
  return -x + a * Math.log(x) - logGamma(a) + Math.log(h)
}

/**
 * ln Φ(z), accurate in both tails.
 *
 * `normalCdf` above is Abramowitz & Stegun 7.1.26, whose ~1.5e-7 ABSOLUTE error
 * is fine for a p-value and useless here: the Anderson-Darling statistic sums
 * ln Φ(z) over the order statistics, and beyond z ≈ −5 the true probability is
 * smaller than that error, so the log is of a negative number. Routing through
 * the incomplete gamma keeps relative accuracy all the way down, because
 * Φ(−|z|) = ½·Q(½, z²/2).
 */
export function normalLogCdf(z: number): number {
  if (!isFinite(z)) return z > 0 ? 0 : -Infinity
  const x = (z * z) / 2
  // z ≥ 0: Φ = 1 − ½Q, and log1p keeps the precision near Φ = 1.
  if (z >= 0) return Math.log1p(-0.5 * upperIncompleteGamma(0.5, x))
  // z < 0: Φ = ½Q. Past |z| ≈ 1.732 the continued fraction applies and its LOG
  // is taken directly, so Φ(−40) ≈ 1e-350 reports as −804.6 rather than −∞.
  return x >= 1.5 ? Math.LN2 * -1 + logUpperIncompleteGammaCF(0.5, x) : Math.log(0.5 * (1 - lowerIncompleteGamma(0.5, x)))
}

/** Chi-square CDF (lower tail). */
export function chiSquareCdf(x: number, df: number): number {
  return lowerIncompleteGamma(df / 2, x / 2)
}

/** Upper-tail p-value for a chi-square statistic. */
export function chiSquareUpperP(x: number, df: number): number {
  if (!isFinite(x) || x <= 0) return 1
  return 1 - chiSquareCdf(x, df)
}

/**
 * Inverse standard normal CDF (Acklam's algorithm), used for Shapiro-Wilk
 * coefficients and normal quantiles.
 */
export function normalInv(p: number): number {
  if (p <= 0) return -Infinity
  if (p >= 1) return Infinity
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
  ]
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ]
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ]
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416,
  ]
  const plow = 0.02425
  const phigh = 1 - plow
  let q: number, r: number
  if (p < plow) {
    q = Math.sqrt(-2 * Math.log(p))
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    )
  }
  if (p <= phigh) {
    q = p - 0.5
    r = q * q
    return (
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    )
  }
  q = Math.sqrt(-2 * Math.log(1 - p))
  return (
    -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  )
}

/* ── Probability density functions ───────────────────────────────────────── */

/** Normal PDF (standard by default). */
export function normalPdf(x: number, mu = 0, sigma = 1): number {
  const z = (x - mu) / sigma
  return Math.exp(-0.5 * z * z) / (sigma * Math.sqrt(2 * Math.PI))
}

/** Student's t PDF for `df` degrees of freedom. */
export function tPdf(t: number, df: number): number {
  const lg = logGamma((df + 1) / 2) - logGamma(df / 2)
  return (Math.exp(lg) / Math.sqrt(df * Math.PI)) * (1 + (t * t) / df) ** (-(df + 1) / 2)
}

/** Chi-square PDF. */
export function chiSquarePdf(x: number, df: number): number {
  if (x <= 0) return 0
  const k = df / 2
  return Math.exp((k - 1) * Math.log(x) - x / 2 - k * Math.log(2) - logGamma(k))
}

/** F-distribution PDF. */
export function fPdf(x: number, d1: number, d2: number): number {
  if (x <= 0) return 0
  const lg = logGamma((d1 + d2) / 2) - logGamma(d1 / 2) - logGamma(d2 / 2)
  const logpdf =
    lg +
    (d1 / 2) * Math.log(d1 / d2) +
    (d1 / 2 - 1) * Math.log(x) -
    ((d1 + d2) / 2) * Math.log(1 + (d1 / d2) * x)
  return Math.exp(logpdf)
}

/* ── Inverse CDFs (quantile functions) via bracketed bisection ───────────── */

/** Find x such that `cdf(x) = p` for a monotone-increasing `cdf` on [lo, hi]. */
function quantileBisect(cdf: (x: number) => number, p: number, lo: number, hi: number): number {
  let a = lo
  let b = hi
  for (let i = 0; i < 200; i++) {
    const mid = (a + b) / 2
    if (cdf(mid) < p) a = mid
    else b = mid
    if (b - a < 1e-12 * (Math.abs(a) + Math.abs(b) + 1)) break
  }
  return (a + b) / 2
}

/** Inverse Student's t CDF (lower-tail quantile). */
export function tInv(p: number, df: number): number {
  if (p <= 0) return -Infinity
  if (p >= 1) return Infinity
  if (Math.abs(p - 0.5) < 1e-15) return 0
  return quantileBisect((t) => studentTCdf(t, df), p, -1e6, 1e6)
}

/** Two-sided t critical value: the t with `1 − alpha/2` in the lower tail. */
export function tCritical(alpha: number, df: number): number {
  return tInv(1 - alpha / 2, df)
}

/** Inverse chi-square CDF (lower-tail quantile). */
export function chiSquareInv(p: number, df: number): number {
  if (p <= 0) return 0
  if (p >= 1) return Infinity
  let hi = df + 10 * Math.sqrt(2 * df) + 10
  let guard = 0
  while (chiSquareCdf(hi, df) < p && guard++ < 200) hi *= 2
  return quantileBisect((x) => chiSquareCdf(x, df), p, 0, hi)
}

/** Inverse F CDF (lower-tail quantile). */
export function fInv(p: number, d1: number, d2: number): number {
  if (p <= 0) return 0
  if (p >= 1) return Infinity
  let hi = 10
  let guard = 0
  while (fCdf(hi, d1, d2) < p && guard++ < 200) hi *= 2
  return quantileBisect((x) => fCdf(x, d1, d2), p, 0, hi)
}

/* ── Studentized range (Tukey HSD) ───────────────────────────────────────── */

/**
 * CDF of the range of `k` i.i.d. standard normals: P(range ≤ w).
 * `P(range ≤ w) = k · ∫ φ(z) · [Φ(z) − Φ(z − w)]^{k−1} dz`, via Simpson's rule
 * over the effective normal support.
 */
function normalRangeCdf(w: number, k: number): number {
  if (w <= 0) return 0
  const lo = -8
  const hi = 8
  const N = 240 // even
  const h = (hi - lo) / N
  let sum = 0
  for (let i = 0; i <= N; i++) {
    const z = lo + i * h
    const inner = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI) * (normalCdf(z) - normalCdf(z - w)) ** (k - 1)
    const weight = i === 0 || i === N ? 1 : i % 2 === 1 ? 4 : 2
    sum += weight * inner
  }
  return Math.min(1, Math.max(0, (k * h * sum) / 3))
}

/**
 * CDF of the studentized range distribution: P(Q ≤ q) for `k` groups and `df`
 * error degrees of freedom. Integrates the normal range CDF against the
 * distribution of the studentizing scale s (s² ~ χ²_df/df). This is the exact
 * distribution GraphPad Prism uses for Tukey/Newman–Keuls critical values.
 */
export function studentizedRangeCdf(q: number, k: number, df: number): number {
  if (q <= 0 || k < 2) return 0
  if (!isFinite(df) || df > 3000) return normalRangeCdf(q, k)
  // s concentrated near 1; integrate a generous window with Simpson's rule.
  const sHi = 1 + 12 / Math.sqrt(2 * df) + 0.5
  const N = 160 // even
  const h = sHi / N
  let sum = 0
  for (let i = 0; i <= N; i++) {
    const s = i * h
    const fs = i === 0 ? 0 : chiSquarePdf(df * s * s, df) * 2 * df * s // pdf of s
    const val = fs * normalRangeCdf(q * s, k)
    const weight = i === 0 || i === N ? 1 : i % 2 === 1 ? 4 : 2
    sum += weight * val
  }
  return Math.min(1, Math.max(0, (h * sum) / 3))
}

/** Upper-tail p-value for a studentized range statistic q. */
export function studentizedRangeUpperP(q: number, k: number, df: number): number {
  return 1 - studentizedRangeCdf(q, k, df)
}

/** Critical studentized range value q(1−alpha, k, df), inverse of the CDF. */
export function studentizedRangeCritical(alpha: number, k: number, df: number): number {
  const p = 1 - alpha
  return quantileBisect((q) => studentizedRangeCdf(q, k, df), p, 0, 100)
}

/* ── Discrete distributions ──────────────────────────────────────────────── */

/** log(n choose k). */
export function logChoose(n: number, k: number): number {
  if (k < 0 || k > n) return -Infinity
  return logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1)
}

/** Binomial PMF: P(X = k) for n trials, success prob p. */
export function binomialPmf(k: number, n: number, p: number): number {
  if (k < 0 || k > n) return 0
  if (p <= 0) return k === 0 ? 1 : 0
  if (p >= 1) return k === n ? 1 : 0
  return Math.exp(logChoose(n, k) + k * Math.log(p) + (n - k) * Math.log(1 - p))
}

/** Binomial CDF: P(X ≤ k). */
export function binomialCdf(k: number, n: number, p: number): number {
  let s = 0
  const kk = Math.floor(k)
  for (let i = 0; i <= kk; i++) s += binomialPmf(i, n, p)
  return Math.min(1, s)
}

/** Poisson PMF: P(X = k) for rate lambda. */
export function poissonPmf(k: number, lambda: number): number {
  if (k < 0) return 0
  return Math.exp(k * Math.log(lambda) - lambda - logGamma(k + 1))
}

/** Poisson CDF: P(X ≤ k). */
export function poissonCdf(k: number, lambda: number): number {
  let s = 0
  const kk = Math.floor(k)
  for (let i = 0; i <= kk; i++) s += poissonPmf(i, lambda)
  return Math.min(1, s)
}

/**
 * Hypergeometric PMF: drawing `n` items from a population of `N` containing `K`
 * successes, probability of exactly `k` successes. Basis of Fisher's exact test.
 */
export function hypergeometricPmf(k: number, N: number, K: number, n: number): number {
  if (k < 0 || k > K || n - k < 0 || n - k > N - K) return 0
  return Math.exp(logChoose(K, k) + logChoose(N - K, n - k) - logChoose(N, n))
}
