import { describe, it, expect } from "vitest"
import { fitCurve, confidenceBand, compareModels, curvePoints } from "./curve-fitting"

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
