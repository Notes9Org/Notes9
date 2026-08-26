import { describe, it, expect } from "vitest"
import { fitCurve, confidenceBand, compareModels, curvePoints, routOutliers } from "./curve-fitting"
import { tTwoSidedP } from "./distributions"

const linspace = (a: number, b: number, n: number) => Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1))

describe("linear fit with parameter SE", () => {
  it("recovers slope/intercept exactly with ~0 SE on noise-free data", () => {
    const x = [1, 2, 3, 4, 5, 6]
    const y = x.map((v) => 3 * v + 2)
    const fit = fitCurve("linear", x, y)!
    expect(fit.params[0]).toBeCloseTo(3, 6) // slope
    expect(fit.params[1]).toBeCloseTo(2, 6) // intercept
    expect(fit.paramSE[0]).toBeLessThan(1e-6)
    expect(fit.r2).toBeCloseTo(1, 6)
    // interpolation (back-calc x from y)
    expect(fit.interpolate(11)).toBeCloseTo(3, 6)
  })
})

describe("nonlinear model recovery", () => {
  it("Michaelis–Menten recovers Vmax and Km", () => {
    const x = [0.5, 1, 2, 5, 10, 20, 50, 100]
    const y = x.map((v) => (100 * v) / (5 + v))
    const fit = fitCurve("michaelisMenten", x, y)!
    expect(fit.params[0]).toBeCloseTo(100, 1) // Vmax
    expect(fit.params[1]).toBeCloseTo(5, 1) // Km
    expect(fit.ec50).toBeCloseTo(5, 1)
    expect(fit.r2).toBeGreaterThan(0.999)
  })

  it("exponential decay recovers rate constant", () => {
    const x = [0, 1, 2, 3, 4, 5, 6, 8, 10]
    const y = x.map((v) => (100 - 10) * Math.exp(-0.5 * v) + 10)
    const fit = fitCurve("expDecay", x, y)!
    expect(fit.params[0]).toBeCloseTo(100, 0) // Y0
    expect(fit.params[1]).toBeCloseTo(10, 0) // plateau
    expect(fit.params[2]).toBeCloseTo(0.5, 1) // k
    expect(fit.r2).toBeGreaterThan(0.999)
  })

  it("Gaussian recovers center and width", () => {
    const x = linspace(4, 16, 25)
    const y = x.map((v) => 50 * Math.exp(-((v - 10) ** 2) / (2 * 2 * 2)) + 5)
    const fit = fitCurve("gaussian", x, y)!
    expect(fit.params[1]).toBeCloseTo(10, 1) // mu
    expect(Math.abs(fit.params[2])).toBeCloseTo(2, 1) // sigma
    expect(fit.r2).toBeGreaterThan(0.999)
  })

  it("4PL recovers EC50 and reports parameter CIs", () => {
    const x = [0.1, 0.3, 1, 3, 10, 30, 100, 300]
    const a = 0.1
    const b = 1.2
    const c = 5
    const d = 2.5
    const y = x.map((v) => d + (a - d) / (1 + (v / c) ** b))
    const fit = fitCurve("4pl", x, y)!
    expect(fit.ec50).toBeCloseTo(5, 0)
    expect(fit.r2).toBeGreaterThan(0.999)
    // every parameter has a finite CI that brackets the estimate
    fit.params.forEach((p, i) => {
      expect(fit.paramCI[i][0]).toBeLessThanOrEqual(p + 1e-6)
      expect(fit.paramCI[i][1]).toBeGreaterThanOrEqual(p - 1e-6)
    })
  })

  it("polynomial (quadratic) fits exactly", () => {
    const x = linspace(-3, 3, 12)
    const y = x.map((v) => 2 - 1.5 * v + 0.5 * v * v)
    const fit = fitCurve("poly2", x, y)!
    expect(fit.params[0]).toBeCloseTo(2, 4)
    expect(fit.params[1]).toBeCloseTo(-1.5, 4)
    expect(fit.params[2]).toBeCloseTo(0.5, 4)
  })
})

describe("model comparison & bands", () => {
  it("AICc prefers the true model over an over/under-fit", () => {
    const x = [0.5, 1, 2, 5, 10, 20, 50, 100]
    const y = x.map((v) => (100 * v) / (5 + v))
    const mm = fitCurve("michaelisMenten", x, y)!
    const lin = fitCurve("linear", x, y)!
    const ranking = compareModels([
      { model: "michaelisMenten", aicc: mm.aicc },
      { model: "linear", aicc: lin.aicc },
    ])
    expect(ranking[0].model).toBe("michaelisMenten") // note: compareModels preserves input order; check weights instead
    const mmWeight = ranking.find((r) => r.model === "michaelisMenten")!.weight
    const linWeight = ranking.find((r) => r.model === "linear")!.weight
    expect(mmWeight).toBeGreaterThan(linWeight)
  })

  it("confidence band brackets the fitted curve", () => {
    const x = [0.5, 1, 2, 5, 10, 20, 50]
    const y = x.map((v) => (100 * v) / (5 + v) + (v % 2 === 0 ? 1 : -1)) // slight scatter
    const fit = fitCurve("michaelisMenten", x, y)!
    const band = confidenceBand(fit, 0.5, 50, 20)
    const pts = curvePoints(fit, 0.5, 50, 20)
    for (let i = 0; i < band.x.length; i++) {
      expect(band.lower[i]).toBeLessThanOrEqual(pts.y[i] + 1e-6)
      expect(band.upper[i]).toBeGreaterThanOrEqual(pts.y[i] - 1e-6)
    }
  })
})

/* ── EC₅₀ interval geometry ───────────────────────────────────────────────── */
describe("EC₅₀ confidence interval", () => {
  // Real-shaped dose-response truncated before the upper plateau: a very good
  // fit (r² ≈ 0.9995) whose EC₅₀ is nonetheless poorly pinned down. Fitting
  // EC₅₀ linearly and reporting v ± t·SE gave 4PL EC₅₀ = 6.90 with the
  // interval [−8.58, 22.39] — a negative concentration.
  const x = [0.3, 1, 3, 10, 30]
  const y = [4, 9, 22, 40, 55]
  const models = ["3pl", "4pl", "5pl"] as const
  const weights = ["none", "1/Y", "1/Y^2"] as const

  it("is strictly positive for every sigmoid model and every weighting", () => {
    for (const m of models) {
      for (const w of weights) {
        const f = fitCurve(m, x, y, w)!
        expect(f.ec50CI, `${m} ${w}`).toBeDefined()
        expect(f.ec50CI![0], `${m} ${w} lower`).toBeGreaterThan(0)
        expect(f.ec50CI![0], `${m} ${w} brackets`).toBeLessThanOrEqual(f.ec50! * (1 + 1e-9))
        expect(f.ec50CI![1], `${m} ${w} brackets`).toBeGreaterThanOrEqual(f.ec50! * (1 - 1e-9))
      }
    }
  })

  it("is the log₁₀EC₅₀ interval back-transformed (geometric, not arithmetic)", () => {
    const f = fitCurve("4pl", x, y)!
    const i = f.paramNames.indexOf("log₁₀EC₅₀")
    expect(i).toBe(2)
    expect(10 ** f.params[i]).toBeCloseTo(f.ec50!, 10)
    expect(f.ec50CI![0]).toBeCloseTo(10 ** f.paramCI[i][0], 10)
    expect(f.ec50CI![1]).toBeCloseTo(10 ** f.paramCI[i][1], 10)
    // Geometric symmetry: √(lo·hi) = point estimate. The old linear interval
    // was arithmetically symmetric instead, which is what let it cross zero.
    expect(Math.sqrt(f.ec50CI![0] * f.ec50CI![1])).toBeCloseTo(f.ec50!, 8)
  })

  it("still recovers the true EC₅₀ on a well-determined curve", () => {
    // 4PL with a = 0, d = 100, Hill = 1, EC₅₀ = 10 sampled exactly.
    const xs = [0.01, 0.1, 1, 10, 100, 1000, 10000]
    const ys = xs.map((v) => 100 / (1 + 10 / v))
    const f = fitCurve("4pl", xs, ys)!
    expect(f.ec50).toBeCloseTo(10, 4)
    expect(f.ec50CI![0]).toBeGreaterThan(0)
    expect(f.ec50CI![0]).toBeLessThan(10)
    expect(f.ec50CI![1]).toBeGreaterThan(10)
  })

  it("is not reported for models whose midpoint is not a concentration", () => {
    // Boltzmann's V50 lives on a linear (voltage) axis, so a log interval would
    // be wrong there — it keeps the symmetric parameter CI and no ec50CI.
    const xs = [-80, -60, -40, -20, 0, 20, 40]
    const ys = xs.map((v) => 1 / (1 + Math.exp((-20 - v) / 8)))
    const f = fitCurve("boltzmann", xs, ys)!
    expect(f.ec50).toBeCloseTo(-20, 3)
    expect(f.ec50CI).toBeUndefined()
  })
})

/* ── ROUT (T0.10) ──────────────────────────────────────────────────────────
   Motulsky & Brown 2006, BMC Bioinformatics 7:123.

   GOLDENS. Every number below came from an independent scipy/statsmodels
   implementation (numpy 2.5.2 / scipy 1.18.1 / statsmodels 0.14.6) rather than
   from this code:

     · the robust step from scipy.optimize.least_squares(loss="cauchy",
       f_scale=RSDR), which minimises 0.5·s²·Σ ln(1+(r/s)²) — the same minimiser
       as the paper's Eq. 8 for fixed s — wrapped in the same RSDR-rescaling
       outer loop;
     · the p-values from scipy.stats.t.sf;
     · the outlier SET cross-checked a second way, against
       statsmodels.stats.multitest.multipletests(method="fdr_bh") run over all N
       p-values. That crosscheck agreed with the paper's reversed-index rule in
       all nine (case × Q) combinations, which is the real evidence that Eq. 17
       is Benjamini–Hochberg and not an approximation of it.

   The fixture is a 4PL evaluated at 12 doses with fixed, hand-written noise, so
   it is deterministic and has no RNG in it. */

const ROUT_X = [1e-3, 3e-3, 1e-2, 3e-2, 1e-1, 3e-1, 1.0, 3.0, 10.0, 30.0, 100.0, 300.0]
const ROUT_Y_CLEAN = [
  5.514905094905419, 5.043711429973784, 7.032157912973813, 9.69225149502675,
  24.35220084674531, 50.55911245188526, 81.63779915325573, 93.82689098028516,
  98.87784208702572, 99.01881913583146, 100.14509490509542, 99.60458665066241,
]
/** Same data, point 5 lifted 4.5 — a MARGINAL outlier, deliberately Q-sensitive. */
const ROUT_Y_MARGINAL = ROUT_Y_CLEAN.map((v, i) => (i === 5 ? v + 4.5 : v))
/** Same data, point 5 lifted 28 — a gross outlier. */
const ROUT_Y_GROSS = ROUT_Y_CLEAN.map((v, i) => (i === 5 ? v + 28 : v))

describe("ROUT outlier identification", () => {
  it("reproduces the paper's own Table 1 arithmetic", () => {
    // 13 points, 3 parameters, 10 df, RSDR 78.24, residual −395.21 at X=3.
    // Paper reports t = 5.05, P = 0.0005, threshold α = 0.0008 at Q = 1%.
    const t = 395.21 / 78.24
    expect(t).toBeCloseTo(5.05, 2)
    expect(tTwoSidedP(t, 10)).toBeCloseTo(0.0005, 4)
    expect((0.01 * (13 - 12)) / 13).toBeCloseTo(0.0008, 4) // Eq. 17 at i = N
    expect((0.05 * (13 - 11)) / 13).toBeCloseTo(0.0077, 4) // Eq. 17 at i = N−1, Q = 5%
  })

  it("finds no outliers in clean 4PL data at the default Q = 1%", () => {
    const r = routOutliers(ROUT_X, ROUT_Y_CLEAN)!
    expect(r).not.toBeNull()
    expect(r.method).toBe("ROUT")
    expect(r.Q).toBe(0.01)
    expect(r.n).toBe(12)
    expect(r.k).toBe(4)
    expect(r.df).toBe(8)
    expect(r.robustFitConverged).toBe(true)
    expect(r.outlierIndices).toEqual([])
    // scipy golden
    expect(r.rsdr).toBeCloseTo(0.539812157555, 6)
    expect(r.robustParams[0]).toBeCloseTo(5.288890810453, 6)
    expect(r.robustParams[1]).toBeCloseTo(1.234351220915, 6)
    expect(r.robustParams[2]).toBeCloseTo(-0.497691664078, 6)
    expect(r.robustParams[3]).toBeCloseTo(99.781719546659, 6)
    // int(0.70·12) = 8, so the loop tests ranks 8..12 — five points.
    expect(r.tested.map((p) => p.rank)).toEqual([8, 9, 10, 11, 12])
    expect(r.tested.every((p) => !p.outlier)).toBe(true)
  })

  it("finds no outliers in clean data at Q = 5% or Q = 0.1% either", () => {
    for (const Q of [0.05, 0.001]) {
      const r = routOutliers(ROUT_X, ROUT_Y_CLEAN, { Q })!
      expect(r.Q).toBe(Q)
      expect(r.outlierIndices).toEqual([])
      // Q does not enter the fit, only the thresholds, so RSDR is Q-invariant.
      expect(r.rsdr).toBeCloseTo(0.539812157555, 6)
    }
  })

  it("flags a gross outlier and barely moves the fit while doing it", () => {
    const r = routOutliers(ROUT_X, ROUT_Y_GROSS)!
    expect(r.outlierIndices).toEqual([5])
    expect(r.rsdr).toBeCloseTo(0.570626100449, 6)
    expect(r.robustParams[0]).toBeCloseTo(5.170248994550, 6)
    expect(r.robustParams[1]).toBeCloseTo(1.220267676504, 6)
    expect(r.robustParams[2]).toBeCloseTo(-0.511380033940, 6)
    expect(r.robustParams[3]).toBeCloseTo(99.738135930772, 6)

    // The point of robust regression: a 28-unit outlier shifts logEC50 by under
    // 0.01 log units, where ordinary least squares is dragged an order of
    // magnitude further.
    const clean = routOutliers(ROUT_X, ROUT_Y_CLEAN)!
    const robustShift = Math.abs(r.robustParams[2] - clean.robustParams[2])
    const lsClean = fitCurve("4pl", ROUT_X, ROUT_Y_CLEAN)!
    const lsGross = fitCurve("4pl", ROUT_X, ROUT_Y_GROSS)!
    const lsShift = Math.abs(lsGross.params[2] - lsClean.params[2])
    expect(robustShift).toBeLessThan(0.02)
    expect(lsShift).toBeGreaterThan(robustShift * 5)
  })

  it("is Q-sensitive: a marginal outlier survives Q = 0.1% and is caught at 1% and 5%", () => {
    // The non-default paths, which is where the earlier defects in this engine lived.
    expect(routOutliers(ROUT_X, ROUT_Y_MARGINAL, { Q: 0.05 })!.outlierIndices).toEqual([5])
    expect(routOutliers(ROUT_X, ROUT_Y_MARGINAL, { Q: 0.01 })!.outlierIndices).toEqual([5])
    expect(routOutliers(ROUT_X, ROUT_Y_MARGINAL, { Q: 0.001 })!.outlierIndices).toEqual([])
  })

  it("matches scipy on the per-point arithmetic behind the marginal call", () => {
    const r = routOutliers(ROUT_X, ROUT_Y_MARGINAL, { Q: 0.01 })!
    expect(r.rsdr).toBeCloseTo(0.584115400360, 6)
    expect(r.robustParams[0]).toBeCloseTo(5.131569621976, 6)
    expect(r.robustParams[1]).toBeCloseTo(1.219942624500, 6)
    expect(r.robustParams[2]).toBeCloseTo(-0.513715929681, 6)
    expect(r.robustParams[3]).toBeCloseTo(99.720170832487, 6)

    const last = r.tested[r.tested.length - 1]
    expect(last.rank).toBe(12)
    expect(last.index).toBe(5)
    expect(last.residual).toBeCloseTo(3.241851936037, 6)
    expect(last.t).toBeCloseTo(5.550019626324, 6)
    expect(last.p).toBeCloseTo(5.409612764761e-4, 9)
    expect(last.alpha).toBeCloseTo(8.333333333333e-4, 12) // Q·(N−(i−1))/N = 0.01/12
    expect(last.outlier).toBe(true)

    // Eq. 17 across the whole tested tail, and it must be strictly decreasing.
    expect(r.tested.map((p) => p.alpha)).toEqual(
      [8, 9, 10, 11, 12].map((i) => (0.01 * (12 - (i - 1))) / 12),
    )
    // Every point closer to the curve than the cut is left alone.
    expect(r.tested.filter((p) => p.outlier).map((p) => p.rank)).toEqual([12])
  })

  it("cascades: once a rank is flagged, every point further from the curve goes with it", () => {
    // Two gross outliers. The paper's rule declares the first passing rank AND
    // everything beyond it, so both come back even though only one rank triggered.
    const y = ROUT_Y_CLEAN.map((v, i) => (i === 5 ? v + 28 : i === 2 ? v - 9 : v))
    const r = routOutliers(ROUT_X, y)!
    expect(r.outlierIndices).toEqual([2, 5])
    const flagged = r.tested.filter((p) => p.outlier).map((p) => p.rank)
    expect(flagged).toEqual([11, 12])
    // Rank 11 is where the FDR threshold is first crossed; rank 12 comes along
    // by the cascade rule, not by a test of its own. scipy goldens:
    const r11 = r.tested.find((p) => p.rank === 11)!
    expect(r11.index).toBe(2)
    expect(r11.t).toBeCloseTo(13.76963386625, 5)
    expect(r11.p).toBeCloseTo(7.467968526903e-7, 12)
    expect(r11.alpha).toBeCloseTo(1.666666666667e-3, 12)
  })

  it("refuses to be used as a general univariate outlier test", () => {
    // ROUT is defined against a fitted model. Linear-in-parameters models are not
    // in the nonlinear catalog, and there is no such thing as ROUT on a bare
    // column — that question is Grubbs's, and answering it here under the ROUT
    // name would put a test that never ran onto a permanent exclusion record.
    expect(routOutliers(ROUT_X, ROUT_Y_CLEAN, { model: "linear" })).toBeNull()
    expect(routOutliers(ROUT_X, ROUT_Y_CLEAN, { model: "poly2" })).toBeNull()
  })

  it("refuses a Q outside (0,1) and a fit with no residual degrees of freedom", () => {
    expect(routOutliers(ROUT_X, ROUT_Y_CLEAN, { Q: 0 })).toBeNull()
    expect(routOutliers(ROUT_X, ROUT_Y_CLEAN, { Q: 1 })).toBeNull()
    expect(routOutliers(ROUT_X, ROUT_Y_CLEAN, { Q: Number.NaN })).toBeNull()
    // 4 points, 4 parameters: nothing left to estimate scatter from.
    expect(routOutliers(ROUT_X.slice(0, 4), ROUT_Y_CLEAN.slice(0, 4))).toBeNull()
  })

  it("names the points it dropped rather than silently testing fewer", () => {
    // 4PL is fitted on log₁₀(x); a zero dose cannot be placed on that axis.
    const x = [0, ...ROUT_X]
    const y = [4.9, ...ROUT_Y_CLEAN]
    const r = routOutliers(x, y)!
    expect(r.n).toBe(12)
    expect(r.warnings.some((w) => w.includes("zero or negative"))).toBe(true)
    // Indices still refer to the arrays that were passed IN, not to the survivors.
    const gross = routOutliers(x, y.map((v, i) => (i === 6 ? v + 28 : v)))!
    expect(gross.outlierIndices).toEqual([6])
  })

  it("supports 3PL and 5PL, whose K differs and therefore whose df differs", () => {
    const three = routOutliers(ROUT_X, ROUT_Y_CLEAN, { model: "3pl" })!
    expect(three.k).toBe(3)
    expect(three.df).toBe(9)
    const five = routOutliers(ROUT_X, ROUT_Y_CLEAN, { model: "5pl" })!
    expect(five.k).toBe(5)
    expect(five.df).toBe(7)
    // RSDR carries the √(N/(N−K)) correction, so a different K is a different RSDR.
    expect(three.rsdr).not.toBeCloseTo(five.rsdr, 6)
  })
})
