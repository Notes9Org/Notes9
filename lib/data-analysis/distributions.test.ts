import { describe, it, expect } from "vitest"
import {
  normalPdf,
  tPdf,
  chiSquarePdf,
  fPdf,
  tInv,
  tCritical,
  chiSquareInv,
  fInv,
  studentizedRangeCritical,
  studentizedRangeCdf,
  binomialPmf,
  binomialCdf,
  poissonPmf,
  poissonCdf,
  hypergeometricPmf,
  logChoose,
  chiSquareCdf,
  fCdf,
  normalLogCdf,
  upperIncompleteGamma,
  lowerIncompleteGamma,
} from "./distributions"

describe("PDFs", () => {
  it("normal PDF peak", () => {
    expect(normalPdf(0)).toBeCloseTo(0.3989423, 5)
    expect(normalPdf(1)).toBeCloseTo(0.2419707, 5)
  })
  it("t PDF approaches normal-ish peak, chi2 and F are positive on support", () => {
    expect(tPdf(0, 10)).toBeCloseTo(0.3891084, 4)
    expect(chiSquarePdf(1, 1)).toBeGreaterThan(0)
    expect(chiSquarePdf(-1, 3)).toBe(0)
    expect(fPdf(1, 5, 10)).toBeGreaterThan(0)
    expect(fPdf(0, 5, 10)).toBe(0)
  })
})

describe("inverse CDFs vs published critical values", () => {
  it("t quantiles", () => {
    expect(tInv(0.975, 10)).toBeCloseTo(2.2281, 2)
    expect(tInv(0.95, 20)).toBeCloseTo(1.7247, 2)
    expect(tInv(0.975, 1e6)).toBeCloseTo(1.96, 2)
    expect(tCritical(0.05, 10)).toBeCloseTo(2.2281, 2)
  })
  it("chi-square quantiles", () => {
    expect(chiSquareInv(0.95, 1)).toBeCloseTo(3.8415, 2)
    expect(chiSquareInv(0.95, 10)).toBeCloseTo(18.307, 1)
    expect(chiSquareInv(0.99, 5)).toBeCloseTo(15.086, 1)
  })
  it("F quantiles", () => {
    expect(fInv(0.95, 3, 10)).toBeCloseTo(3.708, 1)
    expect(fInv(0.95, 5, 20)).toBeCloseTo(2.711, 1)
  })
  it("inverses round-trip through their CDFs", () => {
    expect(chiSquareCdf(chiSquareInv(0.7, 4), 4)).toBeCloseTo(0.7, 3)
    expect(fCdf(fInv(0.8, 4, 12), 4, 12)).toBeCloseTo(0.8, 3)
  })
})

describe("studentized range (Tukey) critical values", () => {
  // Reference: standard studentized-range tables, alpha = 0.05.
  it("matches table values within numerical tolerance", () => {
    expect(studentizedRangeCritical(0.05, 2, 1e6)).toBeCloseTo(2.772, 1)
    expect(studentizedRangeCritical(0.05, 3, 10)).toBeCloseTo(3.877, 1)
    expect(studentizedRangeCritical(0.05, 4, 20)).toBeCloseTo(3.958, 1)
    expect(studentizedRangeCritical(0.05, 3, 20)).toBeCloseTo(3.578, 1)
  })
  it("CDF is monotone and bounded", () => {
    const a = studentizedRangeCdf(2, 3, 15)
    const b = studentizedRangeCdf(4, 3, 15)
    expect(a).toBeLessThan(b)
    expect(a).toBeGreaterThanOrEqual(0)
    expect(b).toBeLessThanOrEqual(1)
  })
})

describe("discrete distributions", () => {
  it("binomial", () => {
    expect(binomialPmf(2, 10, 0.5)).toBeCloseTo(0.0439453, 5)
    expect(binomialCdf(5, 10, 0.5)).toBeCloseTo(0.623047, 4)
    expect(binomialPmf(0, 5, 0)).toBe(1)
  })
  it("poisson", () => {
    expect(poissonPmf(3, 2)).toBeCloseTo(0.180447, 5)
    expect(poissonCdf(2, 2)).toBeCloseTo(0.676676, 4)
  })
  it("hypergeometric (Fisher basis)", () => {
    expect(hypergeometricPmf(1, 10, 5, 2)).toBeCloseTo(0.5556, 3)
    expect(hypergeometricPmf(2, 10, 5, 2)).toBeCloseTo(0.2222, 3)
    expect(logChoose(10, 3)).toBeCloseTo(Math.log(120), 6)
  })
})

/* ── ln Φ(z), the accurate tail behind Anderson–Darling ───────────────────────
 * Goldens are scipy.stats.norm.logcdf. The point of this function is the deep
 * tail: `normalCdf` (A&S 7.1.26) has ~1.5e-7 ABSOLUTE error, so past z ≈ −5 the
 * true probability is smaller than its own error and ln of it is NaN.
 */
describe("normalLogCdf", () => {
  const golden: [number, number][] = [
    [-40, -804.6084420137538],
    [-12, -75.41067300156881],
    [-8, -35.01343715991455],
    [-5, -15.064998393988727],
    [-3, -6.60772622151035],
    [-1, -1.8410216450092634],
    [0, -0.6931471805599453],
    [1, -0.1727537790234499],
    [3, -0.0013508099647481923],
    [8, -6.220960574271742e-16],
  ]

  it("matches scipy.stats.norm.logcdf across 48 orders of magnitude", () => {
    for (const [z, want] of golden) {
      const got = normalLogCdf(z)
      expect(Number.isFinite(got)).toBe(true)
      // Relative on the log itself; near z = 8 the value is ~1e-16 so compare
      // absolutely there instead.
      if (Math.abs(want) < 1e-6) expect(got).toBeCloseTo(want, 20)
      else expect(got / want).toBeCloseTo(1, 9)
    }
  })

  it("stays finite where the naive 1 − Φ(z) route collapses", () => {
    // normalCdf(-9) rounds to 0 at A&S accuracy → log(0) = −Infinity.
    for (let z = -30; z <= -6; z += 0.5) expect(Number.isFinite(normalLogCdf(z))).toBe(true)
  })

  it("is monotone and bracketed by ln(0) and ln(1)", () => {
    let prev = -Infinity
    for (let z = -10; z <= 10; z += 0.25) {
      const v = normalLogCdf(z)
      expect(v).toBeGreaterThanOrEqual(prev)
      expect(v).toBeLessThanOrEqual(0)
      prev = v
    }
  })
})

describe("upperIncompleteGamma", () => {
  it("complements lowerIncompleteGamma on both sides of the a+1 switch", () => {
    for (const [a, x] of [[0.5, 0.1], [0.5, 1.0], [0.5, 5.0], [3, 1], [3, 20], [10, 30]]) {
      expect(upperIncompleteGamma(a, x) + lowerIncompleteGamma(a, x)).toBeCloseTo(1, 12)
    }
  })

  it("keeps relative accuracy where the subtraction would give exactly 0", () => {
    // Q(0.5, 800) = 2Φ(−40) ≈ 1.6e-350 underflows a double, so neither
    // 1 − P nor Q itself can carry it — only the logarithm can.
    expect(1 - lowerIncompleteGamma(0.5, 800)).toBe(0)
    expect(upperIncompleteGamma(0.5, 800)).toBe(0)
    expect(normalLogCdf(-40)).toBeCloseTo(-804.6084420137538, 8)
  })
})
