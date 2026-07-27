import { describe, it, expect } from "vitest"
import { rocCurve, kaplanMeier, blandAltman } from "./chart-transforms"

describe("ROC curve", () => {
  it("AUC = 1 for perfectly separable scores", () => {
    const truth = [0, 0, 0, 1, 1, 1]
    const score = [0.1, 0.2, 0.3, 0.7, 0.8, 0.9]
    const roc = rocCurve(truth, score)
    expect(roc.auc).toBeCloseTo(1, 6)
    expect(roc.fpr[0]).toBe(0)
    expect(roc.tpr[0]).toBe(0)
    expect(roc.fpr[roc.fpr.length - 1]).toBe(1)
    expect(roc.tpr[roc.tpr.length - 1]).toBe(1)
  })
  it("AUC = 0.5 for non-informative scores (interleaved)", () => {
    const truth = [0, 1, 0, 1, 0, 1]
    const score = [1, 1, 2, 2, 3, 3] // ties, no discrimination
    const roc = rocCurve(truth, score)
    expect(roc.auc).toBeCloseTo(0.5, 6)
  })
  it("matches a known small example (AUC = 0.75)", () => {
    // 2 positives, 2 negatives; one positive scores below a negative.
    const truth = [1, 1, 0, 0]
    const score = [0.9, 0.4, 0.6, 0.3]
    const roc = rocCurve(truth, score)
    expect(roc.auc).toBeCloseTo(0.75, 6)
  })
})

describe("Kaplan–Meier", () => {
  it("all events, no ties → drops by the product-limit sequence", () => {
    const km = kaplanMeier([1, 2, 3], [1, 1, 1])
    const expected = [1, 2 / 3, 1 / 3, 0]
    km.survival.forEach((s, i) => expect(s).toBeCloseTo(expected[i], 10))
    expect(km.time).toEqual([0, 1, 2, 3])
  })
  it("censoring keeps survival from dropping at the censored time", () => {
    const km = kaplanMeier([1, 2, 3], [1, 0, 1]) // t=2 censored
    // event at 1: S = 1 - 1/3 = 2/3; event at 3: at-risk=1, S = 2/3*(1-1) = 0
    expect(km.survival[1]).toBeCloseTo(2 / 3, 6)
    expect(km.survival[km.survival.length - 1]).toBeCloseTo(0, 6)
    expect(km.time).toEqual([0, 1, 3])
  })
  it("tied events drop in one step", () => {
    const km = kaplanMeier([2, 2, 4], [1, 1, 1])
    // two events at t=2 out of 3 at risk: S = 1 - 2/3 = 1/3
    expect(km.survival[1]).toBeCloseTo(1 / 3, 6)
  })
})

describe("Bland–Altman", () => {
  it("bias and limits of agreement", () => {
    const a = [10, 12, 14, 16]
    const b = [9, 13, 13, 18]
    const ba = blandAltman(a, b)
    // diffs = [1, -1, 1, -2], bias = -0.25
    expect(ba.bias).toBeCloseTo(-0.25, 6)
    expect(ba.mean[0]).toBeCloseTo(9.5, 6)
    expect(ba.loaHigh).toBeCloseTo(ba.bias + 1.96 * ba.sd, 6)
    expect(ba.loaLow).toBeCloseTo(ba.bias - 1.96 * ba.sd, 6)
  })
})
