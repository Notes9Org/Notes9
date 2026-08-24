/**
 * Curve fitting for standard curves, dose-response, binding, kinetics and
 * ELISA titre analysis.
 *
 * Linear-in-parameter models (straight line, semi-log, polynomials) are solved
 * in closed form; nonlinear models (dose-response, exponential, Michaelis–
 * Menten, binding, Gaussian, Boltzmann) use Levenberg–Marquardt with a numeric
 * Jacobian. Every fit reports parameter standard errors and 95% confidence
 * intervals (from the covariance matrix s²·(JᵀWJ)⁻¹), R²/adjusted R², Sy.x,
 * and AICc for model comparison, matching what GraphPad Prism reports. Fits
 * expose `predict` (x→y), `interpolate` (y→x where invertible) and `predictSE`
 * (for confidence/prediction bands).
 */
import { tInv, tTwoSidedP } from "./distributions"

export type FitModel =
  | "linear"
  | "semilog"
  | "poly2"
  | "poly3"
  | "expDecay"
  | "expGrowth"
  | "expDecay2"
  | "michaelisMenten"
  | "oneSiteBinding"
  | "twoSiteBinding"
  | "gaussian"
  | "boltzmann"
  | "3pl"
  | "4pl"
  | "5pl"

/** Residual weighting scheme for the least-squares objective. */
export type WeightMode = "none" | "1/Y" | "1/Y^2"

export type CurveFit = {
  model: FitModel
  params: number[]
  paramNames: string[]
  /** Standard error of each parameter. */
  paramSE: number[]
  /** 95% confidence interval of each parameter. */
  paramCI: [number, number][]
  r2: number
  adjR2: number
  rmse: number
  /** Sy.x = sqrt(SSE/(n−p)), the standard deviation of the residuals. */
  syx: number
  /** Corrected Akaike Information Criterion (model comparison; lower is better). */
  aicc: number
  /** Residual degrees of freedom (n − p). */
  dof: number
  n: number
  predict: (x: number) => number
  /** Back-calculate x from a y signal (NaN if outside the invertible range). */
  interpolate: (y: number) => number
  /** SE of the mean prediction at x, the basis of the confidence band. */
  predictSE: (x: number) => number
  /** Half-maximal effective concentration / dissociation constant, where defined. */
  ec50?: number
  /**
   * 95% CI on `ec50`. For the sigmoid models it is the log₁₀EC₅₀ interval
   * back-transformed, so it is asymmetric in concentration and strictly
   * positive — never the `v ± t·SE` interval, which can go negative.
   */
  ec50CI?: [number, number]
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

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** Per-observation weights for the chosen scheme (guards against y≈0). */
function weightsFor(y: number[], mode: WeightMode): number[] {
  if (mode === "none") return y.map(() => 1)
  const eps = 1e-9
  return y.map((v) => {
    const a = Math.abs(v) + eps
    return mode === "1/Y" ? 1 / a : 1 / (a * a)
  })
}

/* ── Linear algebra ──────────────────────────────────────────────────────── */

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

/** Invert a symmetric positive-ish matrix by solving against identity columns. */
function invert(A: number[][]): number[][] | null {
  const n = A.length
  const inv: number[][] = Array.from({ length: n }, () => new Array(n).fill(0))
  for (let c = 0; c < n; c++) {
    const e = new Array(n).fill(0)
    e[c] = 1
    const col = solve(A, e)
    if (!col) return null
    for (let r = 0; r < n; r++) inv[r][c] = col[r]
  }
  return inv
}

/* ── Fit result assembly (shared by linear & nonlinear paths) ─────────────── */

type Model = (x: number, p: number[]) => number

function buildFit(
  model: FitModel,
  paramNames: string[],
  fn: Model,
  params: number[],
  cov: number[][] | null,
  x: number[],
  y: number[],
  w: number[],
  extras: { interpolate?: (y: number) => number; ec50?: number; logEc50Index?: number } = {},
): CurveFit {
  const n = x.length
  const p = params.length
  const yhat = x.map((xi) => fn(xi, params))
  let sse = 0
  let wsse = 0
  for (let i = 0; i < n; i++) {
    const r = y[i] - yhat[i]
    sse += r * r
    wsse += w[i] * r * r
  }
  const dof = Math.max(1, n - p)
  const syx = Math.sqrt(sse / dof)
  const r2 = r2Of(y, yhat)
  const adjR2 = 1 - (1 - r2) * ((n - 1) / Math.max(1, n - p))
  const rmse = Math.sqrt(sse / n)
  // AICc from the residual sum of squares (K = params + 1 for the variance).
  // Floor SSE so a (near-)perfect fit yields a finite, very-negative AICc
  // instead of −∞ (which would poison model-comparison weights).
  const K = p + 1
  const aic = n * Math.log(Math.max(sse / n, 1e-300)) + 2 * K
  const aicc = aic + (n - K - 1 > 0 ? (2 * K * (K + 1)) / (n - K - 1) : 0)
  // Parameter covariance ≈ (weighted residual variance) · (JᵀWJ)⁻¹.
  const s2 = wsse / dof
  const paramSE = params.map((_, j) => (cov ? Math.sqrt(Math.max(0, s2 * cov[j][j])) : NaN))
  const tMult = tInv(0.975, dof)
  const paramCI = params.map((v, j): [number, number] => [v - tMult * paramSE[j], v + tMult * paramSE[j]])
  // EC₅₀ interval = the log₁₀EC₅₀ interval back-transformed. Asymmetric in
  // concentration and strictly positive, unlike v ± t·SE on a linear EC₅₀.
  const li = extras.logEc50Index
  const ec50CI: [number, number] | undefined =
    li !== undefined && isFinite(paramCI[li][0]) && isFinite(paramCI[li][1])
      ? [10 ** paramCI[li][0], 10 ** paramCI[li][1]]
      : undefined
  const predictSE = (xv: number) => {
    if (!cov) return NaN
    const g = params.map((_, j) => {
      const dp = [...params]
      const h = Math.abs(params[j]) * 1e-6 + 1e-6
      dp[j] += h
      return (fn(xv, dp) - fn(xv, params)) / h
    })
    let v = 0
    for (let i = 0; i < p; i++) for (let k = 0; k < p; k++) v += g[i] * s2 * cov[i][k] * g[k]
    return Math.sqrt(Math.max(0, v))
  }
  return {
    model,
    params,
    paramNames,
    paramSE,
    paramCI,
    r2,
    adjR2,
    rmse,
    syx,
    aicc,
    dof,
    n,
    predict: (xv: number) => fn(xv, params),
    interpolate: extras.interpolate ?? (() => NaN),
    predictSE,
    ec50: extras.ec50,
    ec50CI,
  }
}

/* ── Linear-in-parameter models (closed form + covariance) ───────────────── */

/** Weighted linear least squares over basis functions; returns coefficients + (XᵀWX)⁻¹. */
function fitLinearBasis(
  x: number[],
  y: number[],
  basis: ((x: number) => number)[],
  w: number[],
): { coef: number[]; cov: number[][] } | null {
  const n = x.length
  const p = basis.length
  const XtWX: number[][] = Array.from({ length: p }, () => new Array(p).fill(0))
  const XtWy = new Array(p).fill(0)
  for (let i = 0; i < n; i++) {
    const row = basis.map((b) => b(x[i]))
    for (let j = 0; j < p; j++) {
      XtWy[j] += w[i] * row[j] * y[i]
      for (let k = 0; k < p; k++) XtWX[j][k] += w[i] * row[j] * row[k]
    }
  }
  const coef = solve(XtWX, XtWy)
  const cov = invert(XtWX)
  if (!coef || !cov) return null
  return { coef, cov }
}

/* ── Nonlinear fit via Levenberg–Marquardt (+ covariance) ────────────────── */

function fitLM(
  x: number[],
  y: number[],
  w: number[],
  model: Model,
  p0: number[],
  iterations = 300,
): { params: number[]; cov: number[][] | null } | null {
  const n = x.length
  const m = p0.length
  let p = [...p0]
  let lambda = 1e-3
  const eps = 1e-6

  const wsse = (params: number[]) => {
    let s = 0
    for (let i = 0; i < n; i++) {
      const r = y[i] - model(x[i], params)
      s += w[i] * r * r
    }
    return s
  }

  let prevErr = wsse(p)
  let JtWJ: number[][] = Array.from({ length: m }, () => new Array(m).fill(0))
  for (let iter = 0; iter < iterations; iter++) {
    const J: number[][] = []
    const r: number[] = []
    for (let i = 0; i < n; i++) {
      r.push(y[i] - model(x[i], p))
      const row: number[] = []
      for (let j = 0; j < m; j++) {
        const dp = [...p]
        const h = Math.abs(p[j]) * eps + eps
        dp[j] += h
        row.push((model(x[i], dp) - model(x[i], p)) / h)
      }
      J.push(row)
    }
    JtWJ = Array.from({ length: m }, () => new Array(m).fill(0))
    const JtWr = new Array(m).fill(0)
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < m; j++) {
        JtWr[j] += w[i] * J[i][j] * r[i]
        for (let k = 0; k < m; k++) JtWJ[j][k] += w[i] * J[i][j] * J[i][k]
      }
    }
    const A = JtWJ.map((row, i) => row.map((v, k) => (i === k ? v * (1 + lambda) : v)))
    const delta = solve(A, JtWr)
    if (!delta) {
      lambda *= 10
      if (lambda > 1e12) break
      continue
    }
    const pNew = p.map((v, i) => v + delta[i])
    const errNew = wsse(pNew)
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
  return { params: p, cov: invert(JtWJ) }
}

/* ── Model catalog ───────────────────────────────────────────────────────── */

type ModelDef = {
  fn: Model
  paramNames: string[]
  guess: (x: number[], y: number[]) => number[]
  interpolate?: (p: number[]) => (y: number) => number
  ec50?: (p: number[]) => number
  /** Index of the log₁₀EC₅₀ parameter, if the model is parameterised that way. */
  logEc50Index?: number
  /** Overlay curve is drawn on a log-spaced x grid (dose-response style). */
  logX?: boolean
}

const argmax = (a: number[]) => a.reduce((mi, v, i) => (v > a[mi] ? i : mi), 0)
const argmin = (a: number[]) => a.reduce((mi, v, i) => (v < a[mi] ? i : mi), 0)

const NONLINEAR: Partial<Record<FitModel, ModelDef>> = {
  expDecay: {
    // Y = (Y0 − plateau)·e^(−k·x) + plateau
    fn: (x, [y0, plateau, k]) => (y0 - plateau) * Math.exp(-k * x) + plateau,
    paramNames: ["Y0", "plateau", "k (rate)"],
    guess: (x, y) => [y[argmin(x)], Math.min(...y), 1 / (median(x) || 1)],
    interpolate: ([y0, plateau, k]) => (yv) => {
      const ratio = (yv - plateau) / (y0 - plateau)
      return ratio > 0 ? -Math.log(ratio) / k : NaN
    },
  },
  expGrowth: {
    // Y = Y0·e^(k·x)
    fn: (x, [y0, k]) => y0 * Math.exp(k * x),
    paramNames: ["Y0", "k (rate)"],
    guess: (x, y) => [Math.max(1e-6, Math.min(...y.map(Math.abs))), 1 / (median(x) || 1)],
    interpolate: ([y0, k]) => (yv) => (yv / y0 > 0 ? Math.log(yv / y0) / k : NaN),
  },
  expDecay2: {
    // Y = plateau + A·e^(−kFast·x) + B·e^(−kSlow·x)
    fn: (x, [a, kf, b, ks, plateau]) => plateau + a * Math.exp(-kf * x) + b * Math.exp(-ks * x),
    paramNames: ["A (fast)", "kFast", "B (slow)", "kSlow", "plateau"],
    guess: (x, y) => {
      const span = Math.max(...y) - Math.min(...y)
      const k = 1 / (median(x) || 1)
      return [span * 0.6, k * 3, span * 0.4, k * 0.3, Math.min(...y)]
    },
  },
  michaelisMenten: {
    // Y = Vmax·x / (Km + x)
    fn: (x, [vmax, km]) => (vmax * x) / (km + x),
    paramNames: ["Vmax", "Km"],
    guess: (x, y) => [Math.max(...y) * 1.1, median(x.filter((v) => v > 0)) || 1],
    interpolate: ([vmax, km]) => (yv) => (vmax - yv > 0 ? (km * yv) / (vmax - yv) : NaN),
    ec50: ([, km]) => km,
  },
  oneSiteBinding: {
    // Y = Bmax·x / (Kd + x)  (specific binding)
    fn: (x, [bmax, kd]) => (bmax * x) / (kd + x),
    paramNames: ["Bmax", "Kd"],
    guess: (x, y) => [Math.max(...y) * 1.1, median(x.filter((v) => v > 0)) || 1],
    interpolate: ([bmax, kd]) => (yv) => (bmax - yv > 0 ? (kd * yv) / (bmax - yv) : NaN),
    ec50: ([, kd]) => kd,
  },
  twoSiteBinding: {
    // Y = Bmax1·x/(Kd1+x) + Bmax2·x/(Kd2+x)
    fn: (x, [b1, kd1, b2, kd2]) => (b1 * x) / (kd1 + x) + (b2 * x) / (kd2 + x),
    paramNames: ["Bmax1", "Kd1", "Bmax2", "Kd2"],
    guess: (x, y) => {
      const mx = Math.max(...y)
      const c = median(x.filter((v) => v > 0)) || 1
      return [mx * 0.6, c * 0.3, mx * 0.5, c * 3]
    },
  },
  gaussian: {
    // Y = amp·e^(−(x−μ)²/(2σ²)) + offset
    fn: (x, [amp, mu, sigma, offset]) => amp * Math.exp(-((x - mu) ** 2) / (2 * sigma * sigma)) + offset,
    paramNames: ["amplitude", "μ (center)", "σ (width)", "offset"],
    guess: (x, y) => {
      const offset = Math.min(...y)
      const iMax = argmax(y)
      const range = Math.max(...x) - Math.min(...x)
      return [Math.max(...y) - offset, x[iMax], range / 4 || 1, offset]
    },
  },
  boltzmann: {
    // Y = bottom + (top − bottom)/(1 + e^((V50 − x)/slope))
    fn: (x, [bottom, top, v50, slope]) => bottom + (top - bottom) / (1 + Math.exp((v50 - x) / slope)),
    paramNames: ["bottom", "top", "V50", "slope"],
    guess: (x, y) => {
      const range = Math.max(...x) - Math.min(...x)
      return [Math.min(...y), Math.max(...y), median(x), range / 8 || 1]
    },
    interpolate: ([bottom, top, v50, slope]) => (yv) => {
      const frac = (top - bottom) / (yv - bottom) - 1
      return frac > 0 ? v50 - slope * Math.log(frac) : NaN
    },
    ec50: ([, , v50]) => v50,
  },
  // The sigmoid models are parameterised by log₁₀EC₅₀, not EC₅₀. EC₅₀ is a
  // scale parameter: its sampling distribution is roughly symmetric in log
  // concentration, not in concentration. Fitting it linearly and reporting
  // v ± t·SE yields an interval that can include zero or negative
  // concentrations. Fitting logEC₅₀ and back-transforming (10^lo, 10^hi) —
  // what the Python engine and GraphPad Prism both do — cannot.
  "3pl": {
    // 4PL with Hill slope fixed to 1: Y = d + (a − d)/(1 + x/10^logC)
    fn: (x, [a, logC, d]) => d + (a - d) / (1 + x / 10 ** logC),
    paramNames: ["a (min)", "log₁₀EC₅₀", "d (max)"],
    guess: (x, y) => [y[argmin(x)], Math.log10(median(x.filter((v) => v > 0)) || 1), y[argmax(x)]],
    interpolate: ([a, logC, d]) => (yv) => {
      const inner = (a - d) / (yv - d) - 1
      return inner > 0 ? 10 ** logC * inner : NaN
    },
    ec50: ([, logC]) => 10 ** logC,
    logEc50Index: 1,
    logX: true,
  },
  "4pl": {
    fn: (x, [a, b, logC, d]) => d + (a - d) / (1 + (x / 10 ** logC) ** b),
    paramNames: ["a (min)", "b (Hill)", "log₁₀EC₅₀", "d (max)"],
    guess: (x, y) => [y[argmin(x)], 1, Math.log10(median(x.filter((v) => v > 0)) || 1), y[argmax(x)]],
    interpolate: ([a, b, logC, d]) => (yv) => {
      const ratio = (a - d) / (yv - d)
      if (!isFinite(ratio) || ratio <= 0) return NaN
      const inner = ratio - 1
      return inner > 0 ? 10 ** logC * inner ** (1 / b) : NaN
    },
    ec50: ([, , logC]) => 10 ** logC,
    logEc50Index: 2,
    logX: true,
  },
  "5pl": {
    fn: (x, [a, b, logC, d, g]) => d + (a - d) / (1 + (x / 10 ** logC) ** b) ** g,
    paramNames: ["a (min)", "b (Hill)", "log₁₀EC₅₀", "d (max)", "g (asym)"],
    guess: (x, y) => [y[argmin(x)], 1, Math.log10(median(x.filter((v) => v > 0)) || 1), y[argmax(x)], 1],
    interpolate: ([a, b, logC, d, g]) => (yv) => {
      const ratio = (a - d) / (yv - d)
      if (!isFinite(ratio) || ratio <= 0) return NaN
      const inner = ratio ** (1 / g) - 1
      return inner > 0 ? 10 ** logC * inner ** (1 / b) : NaN
    },
    ec50: ([, , logC]) => 10 ** logC,
    logEc50Index: 2,
    logX: true,
  },
}

/** Which models draw their overlay curve on a log-spaced x grid. */
export function isLogXModel(model: FitModel): boolean {
  return model === "semilog" || !!NONLINEAR[model]?.logX
}

/* ── Public API ──────────────────────────────────────────────────────────── */

/** Fit any supported model. `weight` applies relative weighting to the least-squares objective. */
export function fitCurve(model: FitModel, x: number[], y: number[], weight: WeightMode = "none"): CurveFit | null {
  const [xs, ys] = cleanPairs(x, y)
  if (xs.length < 2) return null
  const w = weightsFor(ys, weight)

  // Linear-in-parameter models: closed-form weighted least squares.
  if (model === "linear" || model === "semilog" || model === "poly2" || model === "poly3") {
    const basis: ((x: number) => number)[] =
      model === "linear"
        ? [() => 1, (x) => x]
        : model === "semilog"
          ? [() => 1, (x) => Math.log10(x)]
          : model === "poly2"
            ? [() => 1, (x) => x, (x) => x * x]
            : [() => 1, (x) => x, (x) => x * x, (x) => x * x * x]
    const fit = fitLinearBasis(xs, ys, basis, w)
    if (!fit) return null
    const coef = fit.coef
    const fn: Model = (xv, p) => basis.reduce((s, b, j) => s + p[j] * b(xv), 0)
    const paramNames =
      model === "linear"
        ? ["slope", "intercept"]
        : model === "semilog"
          ? ["slope", "intercept (log₁₀x)"]
          : model === "poly2"
            ? ["c₀", "c₁", "c₂"]
            : ["c₀", "c₁", "c₂", "c₃"]
    // Reorder linear/semilog params to [slope, intercept] for display.
    const displayParams = model === "linear" || model === "semilog" ? [coef[1], coef[0]] : coef
    const displayFn: Model =
      model === "linear"
        ? (xv, p) => p[0] * xv + p[1]
        : model === "semilog"
          ? (xv, p) => p[0] * Math.log10(xv) + p[1]
          : fn
    const displayCov =
      model === "linear" || model === "semilog"
        ? [
            [fit.cov[1][1], fit.cov[1][0]],
            [fit.cov[0][1], fit.cov[0][0]],
          ]
        : fit.cov
    const interpolate =
      model === "linear"
        ? (yv: number) => (displayParams[0] !== 0 ? (yv - displayParams[1]) / displayParams[0] : NaN)
        : model === "semilog"
          ? (yv: number) => 10 ** ((yv - displayParams[1]) / displayParams[0])
          : () => NaN
    return buildFit(model, paramNames, displayFn, displayParams, displayCov, xs, ys, w, { interpolate })
  }

  // Nonlinear models via Levenberg–Marquardt.
  const def = NONLINEAR[model]
  if (!def) return null
  const need = def.paramNames.length
  if (xs.length < need) return null
  const p0 = def.guess(xs, ys)
  const res = fitLM(xs, ys, w, def.fn, p0)
  if (!res) return null
  return buildFit(model, def.paramNames, def.fn, res.params, res.cov, xs, ys, w, {
    interpolate: def.interpolate?.(res.params),
    ec50: def.ec50?.(res.params),
    logEc50Index: def.logEc50Index,
  })
}

/** Dense (x,y) points along a fit for a smooth overlay curve. */
export function curvePoints(fit: CurveFit, xMin: number, xMax: number, n = 120): { x: number[]; y: number[] } {
  const xs: number[] = []
  const ys: number[] = []
  const logScale = isLogXModel(fit.model) && xMin > 0
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const xv = logScale ? 10 ** (Math.log10(xMin) + t * (Math.log10(xMax) - Math.log10(xMin))) : xMin + t * (xMax - xMin)
    xs.push(xv)
    ys.push(fit.predict(xv))
  }
  return { x: xs, y: ys }
}

/**
 * Confidence (or prediction) band around a fit. `confidence` reflects
 * uncertainty in the fitted mean; `prediction` also includes residual scatter.
 */
export function confidenceBand(
  fit: CurveFit,
  xMin: number,
  xMax: number,
  n = 120,
  kind: "confidence" | "prediction" = "confidence",
): { x: number[]; lower: number[]; upper: number[] } {
  const { x } = curvePoints(fit, xMin, xMax, n)
  const t = tInv(0.975, fit.dof)
  const lower: number[] = []
  const upper: number[] = []
  for (const xv of x) {
    const yhat = fit.predict(xv)
    const se = fit.predictSE(xv)
    const half = kind === "prediction" ? t * Math.sqrt(se * se + fit.syx * fit.syx) : t * se
    lower.push(yhat - half)
    upper.push(yhat + half)
  }
  return { x, lower, upper }
}

/** Compare fits by AICc; returns Akaike weights (probabilities each model is best). */
export function compareModels(fits: { model: FitModel; aicc: number }[]): { model: FitModel; aicc: number; deltaAICc: number; weight: number }[] {
  if (!fits.length) return []
  const minAicc = Math.min(...fits.map((f) => f.aicc))
  const rel = fits.map((f) => Math.exp(-0.5 * (f.aicc - minAicc)))
  const sum = rel.reduce((a, b) => a + b, 0)
  return fits.map((f, i) => ({ model: f.model, aicc: f.aicc, deltaAICc: f.aicc - minAicc, weight: rel[i] / sum }))
}

/**
 * ELISA endpoint titre: the reciprocal dilution at which signal crosses a
 * cutoff (mean blank + k·SD, or an absolute threshold). Given dilution factors
 * and signals, interpolate the dilution at the cutoff on a log axis.
 */
export function endpointTitre(dilutions: number[], signals: number[], cutoff: number): number {
  const [xs, ys] = cleanPairs(dilutions, signals)
  if (xs.length < 2) return NaN
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

/* ── ROUT outlier identification (T0.10) ───────────────────────────────────
   Motulsky & Brown 2006, "Detecting outliers when fitting data with nonlinear
   regression", BMC Bioinformatics 7:123.

   SCOPE. ROUT is a CURVE-FIT outlier method. It asks "which points lie further
   from THIS FITTED MODEL than the scatter of the other points can explain", and
   every quantity in it — the residuals, the scale, the degrees of freedom — is
   defined against a fitted model. It is therefore NOT a drop-in for Grubbs
   (`grubbsTest` in ./statistics), which asks whether one value is extreme within
   a single univariate sample and needs no model at all. Handing ROUT a bare
   column is not a degraded ROUT, it is a different question, so this function
   refuses any model that is not in the nonlinear catalog rather than quietly
   falling back to something univariate.

   The method, in the paper's own order:

     1. Fit robustly, minimising the Lorentzian merit  Σ ln(1 + (R/RSDR)²)
        (Eq. 8/14) instead of Σ R². Because the paper's gradient and Hessian
        (Eq. 15/16) differ from least squares by exactly the factor 1/(1 + RR²),
        this is iteratively reweighted least squares with w = 1/(1 + RR²), which
        is what the loop below does with the existing `fitLM`.
     2. RSDR = P68(|residuals|) · √(N/(N−K))   (Eq. 1), P68 being the 68.27th
        percentile with proportional interpolation, K the number of fitted
        parameters. Note: NOT the MAD/0.6745 estimator; the authors rejected it
        because RSDR has to match Sy.x = √(SS/(N−K)) rather than the residual SD.
        RSDR is recomputed every iteration — that adaptivity IS the method.
     3. Test only the outermost points, i running from int(0.70·N) to N over the
        residuals ranked by |R| ascending, with
             αᵢ = Q·(N − (i−1))/N            (Eq. 17)
             tᵢ = |Rᵢ| / RSDR                (Eq. 18), two-tailed, N−K df
        At the FIRST i with Pᵢ < αᵢ, that point and every point further from the
        curve are outliers. Eq. 17 is Benjamini–Hochberg written in the reversed
        index: residual rank i is p-value rank N−i+1, so Q·(N−i+1)/N is the usual
        BH threshold and the "first i" rule is BH's "largest passing p-rank".
     4. Q is the false discovery rate, not a p-value threshold. 1% is the paper's
        recommendation and this function's default.

   WHAT THIS DOES NOT DO. It does not remove anything. It returns the indices it
   identified plus the per-point arithmetic behind each call, so the caller can
   file a §8.1 exclusion naming the method and Q. Step 5 of the paper — refit by
   ordinary least squares on the survivors — is the engine re-running the spec
   once those exclusions exist, which is what already happens for any exclusion.

   DEVIATIONS, stated rather than hidden:
     - The paper's prose says "the 30% of residuals furthest from the curve" but
       its procedure says "loop i = int(0.70·N) to N", which is N − int(0.70·N) +
       1 points, marginally more than 30% for most N. The procedure is followed
       literally, since that is the specified algorithm and it is the direction
       that tests more points rather than fewer.
     - "Proportional interpolation" for P68 is taken as linear interpolation at
       position (N−1)·0.6827 over the sorted absolute residuals. The paper does
       not pin a percentile convention; a different one shifts RSDR by well under
       a percent and is reported in `rsdr` either way.
     - Robust fitting is unweighted, as the paper specifies. `WeightMode` is not
       accepted here on purpose. */

/** Motulsky & Brown's recommended false discovery rate. */
export const ROUT_DEFAULT_Q = 0.01

export type RoutOptions = {
  /** Nonlinear model to fit. Defaults to 4PL, the dose-response workhorse. */
  model?: FitModel
  /** False discovery rate Q, in (0,1). Defaults to 1%. */
  Q?: number
  /** Starting parameters. Defaults to the model's own initial guess. */
  p0?: number[]
  /** Cap on robust-fit iterations. */
  maxIterations?: number
}

export type RoutTestedPoint = {
  /** Index into the x/y arrays that were passed IN, not into the cleaned pairs. */
  index: number
  x: number
  y: number
  /** Rank by |residual| ascending, 1-based, as in the paper's loop variable i. */
  rank: number
  residual: number
  /** |residual| / RSDR (Eq. 18). */
  t: number
  /** Two-tailed p from t on N−K df. */
  p: number
  /** Benjamini–Hochberg threshold at this rank (Eq. 17). */
  alpha: number
  outlier: boolean
}

export type RoutResult = {
  method: "ROUT"
  model: FitModel
  /** The Q that actually ran, for the §8.1 record. */
  Q: number
  /** Points that survived cleaning and were fitted. */
  n: number
  /** Fitted parameters K. */
  k: number
  df: number
  rsdr: number
  /** Parameters of the ROBUST fit, not of a least-squares fit. */
  robustParams: number[]
  paramNames: string[]
  /** Indices into the input arrays, ascending. */
  outlierIndices: number[]
  /** Every point the loop examined, closest to the curve first. */
  tested: RoutTestedPoint[]
  robustFitConverged: boolean
  warnings: string[]
}

/** Percentile with proportional (linear) interpolation over a SORTED array. */
function percentileLinear(sorted: number[], pct: number): number {
  const n = sorted.length
  if (n === 0) return NaN
  if (n === 1) return sorted[0]
  const pos = ((n - 1) * pct) / 100
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (pos - lo) * (sorted[hi] - sorted[lo])
}

/** RSDR, Eq. 1. */
function robustSdOfResiduals(residuals: number[], k: number): number {
  const n = residuals.length
  if (n <= k) return NaN
  const abs = residuals.map(Math.abs).sort((a, b) => a - b)
  return percentileLinear(abs, 68.27) * Math.sqrt(n / (n - k))
}

/**
 * ROUT. Returns null when the request is not a curve fit ROUT can answer:
 * an unknown or linear-in-parameters model, a Q outside (0,1), or fewer points
 * than parameters. Never returns a partial or substituted result.
 */
export function routOutliers(x: number[], y: number[], opts: RoutOptions = {}): RoutResult | null {
  const model = opts.model ?? "4pl"
  const Q = opts.Q ?? ROUT_DEFAULT_Q
  if (!Number.isFinite(Q) || Q <= 0 || Q >= 1) return null

  // Linear-in-parameters models are fitted by a different path and are not in
  // this catalog; refusing here is what keeps ROUT from being offered as a
  // general-purpose univariate outlier test.
  const def = NONLINEAR[model]
  if (!def) return null

  const warnings: string[] = []
  const idx: number[] = []
  const xs: number[] = []
  const ys: number[] = []
  let nonFinite = 0
  let nonPositiveX = 0
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const xv = x[i]
    const yv = y[i]
    if (!Number.isFinite(xv) || !Number.isFinite(yv)) {
      nonFinite += 1
      continue
    }
    if (def.logX && xv <= 0) {
      nonPositiveX += 1
      continue
    }
    idx.push(i)
    xs.push(xv)
    ys.push(yv)
  }
  if (nonFinite > 0) warnings.push(`${nonFinite} point${nonFinite === 1 ? "" : "s"} skipped: x or y was not a finite number.`)
  if (nonPositiveX > 0) {
    warnings.push(
      `${nonPositiveX} point${nonPositiveX === 1 ? "" : "s"} skipped: ${model.toUpperCase()} is fitted on log₁₀(x) and x was zero or negative. ` +
        `Those points were not tested for outlier status.`,
    )
  }

  const n = xs.length
  const p0 = opts.p0 ?? def.guess(xs, ys)
  const k = p0.length
  if (n <= k) return null

  const residualsAt = (p: number[]) => ys.map((yv, i) => yv - def.fn(xs[i], p))

  /* Step 1, robust fit. IRLS with Lorentzian weights, rescaling by the current
     RSDR each pass, exactly the paper's "recompute the goodness of fit of the
     prior iteration using the new value of RSDR". */
  let params = p0.slice()
  let rsdr = robustSdOfResiduals(residualsAt(params), k)
  let converged = false
  const maxIterations = opts.maxIterations ?? 100
  for (let it = 0; it < maxIterations; it++) {
    if (!Number.isFinite(rsdr) || rsdr <= 0) break
    const r = residualsAt(params)
    const w = r.map((ri) => 1 / (1 + (ri / rsdr) ** 2))
    const step = fitLM(xs, ys, w, def.fn, params)
    if (!step) break
    const next = step.params
    if (next.some((v) => !Number.isFinite(v))) break
    const nextRsdr = robustSdOfResiduals(residualsAt(next), k)
    if (!Number.isFinite(nextRsdr) || nextRsdr <= 0) break
    const dScale = Math.abs(nextRsdr - rsdr) / Math.max(1, rsdr)
    let dParam = 0
    for (let j = 0; j < k; j++) dParam = Math.max(dParam, Math.abs(next[j] - params[j]) / Math.max(1, Math.abs(params[j])))
    params = next
    rsdr = nextRsdr
    if (dScale <= 1e-12 && dParam <= 1e-12) {
      converged = true
      break
    }
  }
  if (!Number.isFinite(rsdr) || rsdr <= 0) {
    warnings.push("No outliers could be identified: the robust scale estimate (RSDR) is zero or undefined, so no residual is comparable to any other.")
    return {
      method: "ROUT", model, Q, n, k, df: n - k, rsdr: Number.isFinite(rsdr) ? rsdr : Number.NaN,
      robustParams: params, paramNames: def.paramNames, outlierIndices: [], tested: [],
      robustFitConverged: converged, warnings,
    }
  }
  if (!converged) {
    warnings.push(`The robust fit did not converge within ${maxIterations} iterations; RSDR and the residuals below are from the last iteration reached.`)
  }

  /* Steps 3–4, FDR on the outermost residuals. */
  const res = residualsAt(params)
  const order = res
    .map((_, i) => i)
    .sort((a, b) => Math.abs(res[a]) - Math.abs(res[b]) || a - b)
  const df = n - k
  const start = Math.max(1, Math.trunc(0.7 * n))
  const tested: RoutTestedPoint[] = []
  let cut = -1
  for (let i = start; i <= n; i++) {
    const j = order[i - 1]
    const alpha = (Q * (n - (i - 1))) / n
    const t = Math.abs(res[j]) / rsdr
    const p = tTwoSidedP(t, df)
    tested.push({ index: idx[j], x: xs[j], y: ys[j], rank: i, residual: res[j], t, p, alpha, outlier: false })
    if (cut < 0 && p < alpha) cut = i
  }
  const outlierIndices: number[] = []
  if (cut > 0) {
    for (const point of tested) {
      if (point.rank >= cut) {
        point.outlier = true
        outlierIndices.push(point.index)
      }
    }
    outlierIndices.sort((a, b) => a - b)
  }

  return {
    method: "ROUT", model, Q, n, k, df, rsdr,
    robustParams: params, paramNames: def.paramNames,
    outlierIndices, tested, robustFitConverged: converged, warnings,
  }
}
