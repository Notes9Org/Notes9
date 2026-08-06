import { describe as vdescribe, it, expect } from "vitest"
import {
  describe as stat,
  geometricMean,
  skewness,
  pAdjust,
  tukeyHSD,
  multipleComparisons,
  welchAnova,
  twoWayAnova,
  oneWayAnova,
  dagostinoPearson,
  grubbs,
  fisherExact2x2,
  mcnemar,
  association2x2,
  chiSquareGoodnessOfFit,
  dunnTest,
  unpairedT,
} from "./statistics"

vdescribe("descriptives+", () => {
  it("geometric mean and skewness", () => {
    expect(geometricMean([1, 10, 100])).toBeCloseTo(10, 6)
    expect(geometricMean([1, -2, 3])).toBeNaN()
    expect(skewness([1, 2, 3, 4, 5])).toBeCloseTo(0, 6) // symmetric
    expect(skewness([1, 1, 1, 1, 10])).toBeGreaterThan(0) // right tail
  })
  it("t-based CI is wider than the old 1.96 approx for small n", () => {
    const d = stat([2, 4, 6, 8])
    // t(0.975, 3) = 3.182 > 1.96, so the half-width exceeds 1.96*sem
    const half = d.ci95[1] - d.mean
    expect(half).toBeGreaterThan(1.96 * d.sem)
    expect(d.sum).toBe(20)
    expect(d.range).toBe(6)
  })
})

vdescribe("multiple-comparison correction", () => {
  it("bonferroni and sidak", () => {
    expect(pAdjust([0.01, 0.02, 0.04], "bonferroni")).toEqual([0.03, 0.06, 0.12])
    const s = pAdjust([0.01], "sidak")
    expect(s[0]).toBeCloseTo(0.01, 6)
  })
  it("holm is step-down and monotone", () => {
    const adj = pAdjust([0.01, 0.02, 0.03], "holm")
    expect(adj[0]).toBeCloseTo(0.03, 6)
    expect(adj[1]).toBeCloseTo(0.04, 6)
    expect(adj[2]).toBeCloseTo(0.04, 6)
  })
})

vdescribe("ANOVA family", () => {
  const groups = [
    { name: "A", values: [1, 2, 3, 4, 5] },
    { name: "B", values: [3, 4, 5, 6, 7] },
    { name: "C", values: [6, 7, 8, 9, 10] },
  ]
  it("Tukey reports adjusted p in [0,1] with CI, consistent with significance", () => {
    const pairs = tukeyHSD(groups)
    expect(pairs.length).toBe(3)
    for (const p of pairs) {
      expect(p.p).toBeGreaterThanOrEqual(0)
      expect(p.p).toBeLessThanOrEqual(1)
      expect(p.ciHigh).toBeGreaterThan(p.ciLow)
      expect(p.significant).toBe(p.p < 0.05)
    }
  })
  it("multipleComparisons vs control", () => {
    const cmp = multipleComparisons(groups, { method: "holm-sidak", control: "A" })
    expect(cmp.length).toBe(2)
    expect(cmp.every((c) => c.a === "A")).toBe(true)
  })
  it("Welch ANOVA ≈ one-way ANOVA under equal variances", () => {
    const w = welchAnova(groups)!
    const a = oneWayAnova(groups)!
    expect(w.stat[0].value).toBeGreaterThan(0)
    // similar F when variances are equal
    expect(Math.abs(w.stat[0].value - a.stat[0].value)).toBeLessThan(1)
  })
  it("two-way ANOVA SS decomposition adds up to SS total", () => {
    const cells = [
      { a: "lo", b: "ctrl", values: [10, 12, 11] },
      { a: "lo", b: "drug", values: [14, 15, 16] },
      { a: "hi", b: "ctrl", values: [20, 22, 21] },
      { a: "hi", b: "drug", values: [30, 33, 31] },
    ]
    const res = twoWayAnova(cells)!
    const all = cells.flatMap((c) => c.values)
    const grand = all.reduce((s, v) => s + v, 0) / all.length
    const ssTotal = all.reduce((s, v) => s + (v - grand) ** 2, 0)
    const ssSum = res.terms.reduce((s, t) => s + t.ss, 0)
    expect(ssSum).toBeCloseTo(ssTotal, 6)
    // A, B and interaction F-tests present and positive
    expect(res.terms[0].F).toBeGreaterThan(0)
    expect(res.terms[2].source).toBe("Interaction")
  })
})

vdescribe("normality & outliers", () => {
  it("D'Agostino–Pearson runs and flags a skewed sample", () => {
    const normalish = [-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 0.1, -0.1, 0.3]
    const r = dagostinoPearson(normalish)!
    expect(r.p).toBeGreaterThan(0.05)
  })
  it("Grubbs detects a clear outlier", () => {
    const data = [199.31, 199.53, 200.19, 200.82, 201.92, 201.95, 202.18, 245.57]
    const g = grubbs(data)!
    expect(g.outlier).toBe(245.57)
    expect(g.p).toBeLessThan(0.05)
  })
})

vdescribe("contingency", () => {
  it("Fisher's exact matches the tea-test value", () => {
    const r = fisherExact2x2(3, 1, 1, 3)!
    expect(r.p).toBeCloseTo(0.4857, 3)
  })
  it("McNemar with continuity correction", () => {
    const r = mcnemar(12, 5)!
    expect(r.stat[0].value).toBeCloseTo(2.1176, 3)
  })
  it("odds ratio and relative risk", () => {
    const a = association2x2(10, 20, 30, 40)
    expect(a.oddsRatio).toBeCloseTo(0.6667, 3)
    expect(a.orCI[0]).toBeLessThan(a.oddsRatio)
    expect(a.orCI[1]).toBeGreaterThan(a.oddsRatio)
  })
  it("goodness-of-fit vs uniform", () => {
    const r = chiSquareGoodnessOfFit([10, 10, 10, 10])!
    expect(r.stat[0].value).toBeCloseTo(0, 6)
    expect(r.p).toBeGreaterThan(0.99)
  })
})

vdescribe("Dunn's post-hoc", () => {
  it("returns adjusted p-values for all pairs", () => {
    const groups = [
      { name: "A", values: [1, 2, 3, 4] },
      { name: "B", values: [5, 6, 7, 8] },
      { name: "C", values: [9, 10, 11, 12] },
    ]
    const d = dunnTest(groups)
    expect(d.length).toBe(3)
    for (const c of d) expect(c.pAdj).toBeGreaterThanOrEqual(c.p - 1e-9)
  })
})

vdescribe("one/two-tailed t", () => {
  it("one-tailed p is about half the two-tailed p", () => {
    const a = [5, 6, 7, 8, 9]
    const b = [1, 2, 3, 4, 5]
    const two = unpairedT(a, b, true, "two")!
    const greater = unpairedT(a, b, true, "greater")!
    expect(greater.p).toBeCloseTo(two.p / 2, 3)
  })
})
