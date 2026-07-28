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
