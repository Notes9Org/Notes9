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
 * Inverse standard normal CDF (Acklam's algorithm) — used for Shapiro-Wilk
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
