/**
 * Curve fitting for standard curves, dose-response and ELISA titre analysis.
 *
 * Models:
 *   - linear:    y = m·x + b
 *   - semilog:   y = m·log10(x) + b       (x on a log axis)
 *   - 4PL:       y = d + (a − d) / (1 + (x/c)^b)
 *   - 5PL:       y = d + (a − d) / (1 + (x/c)^b)^g
 *
 * The 4PL/5PL nonlinear fits use Levenberg–Marquardt with numeric Jacobians.
 * Each fit exposes `predict` (x→y) and, where invertible, `interpolate` (y→x)
 * so unknown samples can be back-calculated from signal. `ec50`/`titre` helpers
 * support ELISA endpoint-titre and half-maximal readouts.
 */

export type FitModel = "linear" | "semilog" | "4pl" | "5pl"

export type CurveFit = {
  model: FitModel
  params: number[]
  paramNames: string[]
  r2: number
  rmse: number
  predict: (x: number) => number
  /** Back-calculate x from a y signal (NaN if outside the invertible range). */
  interpolate: (y: number) => number
  /** Half-maximal effective concentration (the `c` parameter for logistic fits). */
  ec50?: number
}

const r2Of = (y: number[], yhat: number[]) => {
  const m = y.reduce((a, b) => a + b, 0) / y.length
  let ssRes = 0
  let ssTot = 0
  for (let i = 0; i < y.length; i++) {
    ssRes += (y[i] - yhat[i]) ** 2
    ssTot += (y[i] - m) ** 2
  }
  return ssTot === 0 ? 0 : 1 - ssRes / ssTot
}

const rmseOf = (y: number[], yhat: number[]) => {
  let s = 0
  for (let i = 0; i < y.length; i++) s += (y[i] - yhat[i]) ** 2
  return Math.sqrt(s / y.length)
}

function cleanPairs(x: number[], y: number[]): [number[], number[]] {
  const xs: number[] = []
  const ys: number[] = []
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    if (isFinite(x[i]) && isFinite(y[i])) {
      xs.push(x[i])
      ys.push(y[i])
    }
  }
  return [xs, ys]
}

/* ── Linear / semi-log ───────────────────────────────────────────────────── */
function fitLinearLike(x: number[], y: number[], semilog: boolean): CurveFit | null {
  const [xs0, ys] = cleanPairs(x, y)
  const xs = semilog ? xs0.map((v) => Math.log10(v)) : xs0
  const n = xs.length
  if (n < 2) return null
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let sxy = 0
  let sxx = 0
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my)
    sxx += (xs[i] - mx) ** 2
  }
  const m = sxy / sxx
  const b = my - m * mx
  const predict = (xv: number) => m * (semilog ? Math.log10(xv) : xv) + b
  const yhat = xs0.map(predict)
  return {
    model: semilog ? "semilog" : "linear",
    params: [m, b],
    paramNames: semilog ? ["slope", "intercept (log₁₀x)"] : ["slope", "intercept"],
    r2: r2Of(ys, yhat),
    rmse: rmseOf(ys, yhat),
    predict,
    interpolate: (yv: number) => {
      const xlog = (yv - b) / m
      return semilog ? 10 ** xlog : xlog
    },
  }
}

/* ── Logistic (4PL / 5PL) via Levenberg–Marquardt ────────────────────────── */
type Model = (x: number, p: number[]) => number

function fitLM(
  x: number[],
  y: number[],
  model: Model,
  p0: number[],
  iterations = 200,
): number[] | null {
  const n = x.length
  const m = p0.length
  let p = [...p0]
  let lambda = 1e-3
  const eps = 1e-6

  const residuals = (params: number[]) => x.map((xi, i) => y[i] - model(xi, params))
  const sse = (params: number[]) => residuals(params).reduce((s, r) => s + r * r, 0)

  let prevErr = sse(p)
  for (let iter = 0; iter < iterations; iter++) {
    // Numeric Jacobian J[n][m]
    const J: number[][] = []
    const r = residuals(p)
    for (let i = 0; i < n; i++) {
      const row: number[] = []
      for (let j = 0; j < m; j++) {
        const dp = [...p]
        const h = Math.abs(p[j]) * eps + eps
        dp[j] += h
        row.push((model(x[i], dp) - model(x[i], p)) / h)
      }
      J.push(row)
    }
    // JtJ (m×m) and Jtr (m)
    const JtJ: number[][] = Array.from({ length: m }, () => new Array(m).fill(0))
    const Jtr: number[] = new Array(m).fill(0)
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < m; j++) {
        Jtr[j] += J[i][j] * r[i]
        for (let k = 0; k < m; k++) JtJ[j][k] += J[i][j] * J[i][k]
      }
    }
    // Solve (JtJ + λ·diag) δ = Jtr
    const A = JtJ.map((row, i) => row.map((v, k) => (i === k ? v * (1 + lambda) : v)))
    const delta = solve(A, Jtr)
    if (!delta) {
      lambda *= 10
      if (lambda > 1e12) break
      continue
    }
    const pNew = p.map((v, i) => v + delta[i])
    const errNew = sse(pNew)
    if (isFinite(errNew) && errNew < prevErr) {
      p = pNew
      lambda = Math.max(lambda / 3, 1e-12)
      if (Math.abs(prevErr - errNew) < 1e-12 * prevErr) break
      prevErr = errNew
    } else {
      lambda *= 3
      if (lambda > 1e12) break
    }
  }
  return p
}

/** Gaussian elimination with partial pivoting; returns null if singular. */
function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]])
  for (let col = 0; col < n; col++) {
    let piv = col
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r
    if (Math.abs(M[piv][col]) < 1e-14) return null
    ;[M[col], M[piv]] = [M[piv], M[col]]
    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const f = M[r][col] / M[col][col]
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c]
    }
  }
  return M.map((row, i) => row[n] / row[i])
}

const model4PL: Model = (x, [a, b, c, d]) => d + (a - d) / (1 + (x / c) ** b)
const model5PL: Model = (x, [a, b, c, d, g]) => d + (a - d) / (1 + (x / c) ** b) ** g

function fitLogistic(x: number[], y: number[], five: boolean): CurveFit | null {
  const [xs, ys] = cleanPairs(x, y)
  if (xs.length < (five ? 5 : 4)) return null
  const yMin = Math.min(...ys)
  const yMax = Math.max(...ys)
  const posX = xs.filter((v) => v > 0)
  const cGuess = posX.length ? median(posX) : 1
  // a = response at low x, d = response at high x
  const lowX = xs.reduce((mi, v, i) => (v < xs[mi] ? i : mi), 0)
  const highX = xs.reduce((ma, v, i) => (v > xs[ma] ? i : ma), 0)
  const aGuess = ys[lowX]
  const dGuess = ys[highX]
  const p0 = five ? [aGuess, 1, cGuess, dGuess, 1] : [aGuess, 1, cGuess, dGuess]
  const model = five ? model5PL : model4PL
  const p = fitLM(xs, ys, model, p0)
  if (!p) return null
  const predict = (xv: number) => model(xv, p)
  const yhat = xs.map(predict)
  const [a, b, c, d] = p
  const g = five ? p[4] : 1
  const interpolate = (yv: number) => {
    // invert logistic: solve for x
    const ratio = (a - d) / (yv - d)
    if (!isFinite(ratio) || ratio <= 0) return NaN
    const inner = ratio ** (1 / g) - 1
    if (inner <= 0) return NaN
    return c * inner ** (1 / b)
  }
  return {
    model: five ? "5pl" : "4pl",
    params: p,
    paramNames: five ? ["a (min)", "b (Hill)", "c (EC₅₀)", "d (max)", "g (asym)"] : ["a (min)", "b (Hill)", "c (EC₅₀)", "d (max)"],
    r2: r2Of(ys, yhat),
    rmse: rmseOf(ys, yhat),
    predict,
    interpolate,
    ec50: c,
  }
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** Fit any supported model. */
export function fitCurve(model: FitModel, x: number[], y: number[]): CurveFit | null {
  switch (model) {
    case "linear":
      return fitLinearLike(x, y, false)
    case "semilog":
      return fitLinearLike(x, y, true)
    case "4pl":
      return fitLogistic(x, y, false)
    case "5pl":
      return fitLogistic(x, y, true)
  }
}

/** Dense (x,y) points along a fit for a smooth overlay curve. */
export function curvePoints(fit: CurveFit, xMin: number, xMax: number, n = 120): { x: number[]; y: number[] } {
  const xs: number[] = []
  const ys: number[] = []
  const logScale = (fit.model === "semilog" || fit.model === "4pl" || fit.model === "5pl") && xMin > 0
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const xv = logScale ? 10 ** (Math.log10(xMin) + t * (Math.log10(xMax) - Math.log10(xMin))) : xMin + t * (xMax - xMin)
    xs.push(xv)
    ys.push(fit.predict(xv))
  }
  return { x: xs, y: ys }
}

/**
 * ELISA endpoint titre: the reciprocal dilution at which signal crosses a
 * cutoff (mean blank + k·SD, or an absolute threshold). Given dilution factors
 * and signals, interpolate the dilution at the cutoff on a log axis.
 */
export function endpointTitre(dilutions: number[], signals: number[], cutoff: number): number {
  const [xs, ys] = cleanPairs(dilutions, signals)
  if (xs.length < 2) return NaN
  // Sort by dilution ascending
  const order = xs.map((_, i) => i).sort((i, j) => xs[i] - xs[j])
  const sx = order.map((i) => xs[i])
  const sy = order.map((i) => ys[i])
  for (let i = 0; i < sx.length - 1; i++) {
    const y1 = sy[i]
    const y2 = sy[i + 1]
    if ((y1 - cutoff) * (y2 - cutoff) <= 0 && y1 !== y2) {
      const lx1 = Math.log10(sx[i])
      const lx2 = Math.log10(sx[i + 1])
      const frac = (cutoff - y1) / (y2 - y1)
      return 10 ** (lx1 + frac * (lx2 - lx1))
    }
  }
  return NaN
}
