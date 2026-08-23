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
  mannWhitney,
  wilcoxonSignedRank,
  kruskalWallis,
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

/* ── Tier-0 correctness regressions ───────────────────────────────────────────
 * Every golden below was produced by scipy 1.18.1 / statsmodels 0.14.6 on the
 * same inputs, or by an exact enumeration shown in the comment. Where a value
 * is only close (not equal) it is because distributions.ts approximates Φ and
 * the χ² CDF; the tolerance states how close.
 */

vdescribe("two-way ANOVA on unbalanced designs (Type II SS)", () => {
  // Cell means 11 / 14.5 / 21 / ~31.2 with n = 6 / 2 / 2 / 6 — unbalanced with a
  // large real interaction. Type I SS computed from raw marginal means gave
  // Interaction SS = −557.27, F = −474.27 here.
  //
  // statsmodels: ols("y ~ C(f1) + C(f2) + C(f1):C(f2)"), anova_lm(typ=2)
  //                        sum_sq   df           F         PR(>F)
  //   C(f1)               534.6675   1  455.036170   6.563476e-11
  //   C(f2)               140.7675   1  119.802128   1.338236e-07
  //   C(f1):C(f2)          33.6675   1   28.653191   1.728009e-04
  //   Residual             14.1000  12
  const unbalanced = [
    { a: "lo", b: "ctrl", values: [10, 11, 12, 10, 11, 12] },
    { a: "lo", b: "drug", values: [14, 15] },
    { a: "hi", b: "ctrl", values: [20, 22] },
    { a: "hi", b: "drug", values: [30, 31, 32, 30, 31, 33.2] },
  ]

  it("matches statsmodels Type II sums of squares", () => {
    const r = twoWayAnova(unbalanced)!
    const [A, B, AB, res] = r.terms
    expect(A.ss).toBeCloseTo(534.6675, 6)
    expect(B.ss).toBeCloseTo(140.7675, 6)
    expect(AB.ss).toBeCloseTo(33.6675, 6)
    expect(res.ss).toBeCloseTo(14.1, 6)
    expect([A.df, B.df, AB.df, res.df]).toEqual([1, 1, 1, 12])
    expect(A.F).toBeCloseTo(455.036170, 4)
    expect(B.F).toBeCloseTo(119.802128, 4)
    expect(AB.F).toBeCloseTo(28.653191, 4)
    expect(AB.p).toBeCloseTo(1.728009e-4, 8)
  })

  it("never reports a negative sum of squares or a negative F", () => {
    for (const t of twoWayAnova(unbalanced)!.terms) {
      expect(t.ss).toBeGreaterThanOrEqual(0)
      if (isFinite(t.F)) expect(t.F).toBeGreaterThanOrEqual(0)
    }
  })

  it("still equals the Type I decomposition when the design is balanced", () => {
    // Balanced: Type I == Type II == Type III, and the terms partition SS total.
    const cells = [
      { a: "A1", b: "B1", values: [10, 12, 11] },
      { a: "A1", b: "B2", values: [20, 22, 21] },
      { a: "A2", b: "B1", values: [30, 33, 31] },
      { a: "A2", b: "B2", values: [15, 16, 14] },
    ]
    const r = twoWayAnova(cells)!
    const all = cells.flatMap((c) => c.values)
    const grand = all.reduce((a, b) => a + b, 0) / all.length
    const ssTotal = all.reduce((s, v) => s + (v - grand) ** 2, 0)
    expect(r.terms.reduce((s, t) => s + t.ss, 0)).toBeCloseTo(ssTotal, 8)
  })
})

vdescribe("Wilcoxon signed-rank", () => {
  it("uses the exact null distribution at small n (n=5, W=0 → 0.0625, not 0.043)", () => {
    // Exact: W⁺ = 0 happens for exactly 1 of the 2⁵ = 32 sign assignments, so the
    // two-sided p is 2·(1/32) = 0.0625. scipy.stats.wilcoxon(..., method="exact")
    // returns 0.0625; the normal approximation returned 0.0431 — significant at
    // α = 0.05 where the exact test is not.
    const r = wilcoxonSignedRank([1, 2, 3, 4, 5], [0, 0, 0, 0, 0])!
    expect(r.p).toBe(0.0625)
    expect(r.note).toContain("exact")
  })

  it("matches scipy exact p for every n at W = 0", () => {
    // p = 2/2ⁿ for the all-same-sign case.
    for (let n = 1; n <= 12; n++) {
      const a = Array.from({ length: n }, (_, i) => i + 1)
      expect(wilcoxonSignedRank(a, a.map(() => 0))!.p).toBeCloseTo(Math.min(1, 2 / 2 ** n), 12)
    }
  })

  it("matches scipy exact p for a mixed-sign sample (n=8, W=4 → 0.0546875)", () => {
    const r = wilcoxonSignedRank([2, -1, 4, 5, -3, 7, 8, 9], new Array(8).fill(0))!
    expect(r.stat[0].value).toBe(4)
    expect(r.p).toBeCloseTo(0.0546875, 12)
  })

  it("falls back to a TIE-CORRECTED normal approximation when |differences| tie", () => {
    // scipy.stats.wilcoxon(d, method="approx", correction=False) = 0.0036491956
    const d = [1, 1, 2, 3, 4, 5, -1, 7, 8, 9, 10, 11]
    const r = wilcoxonSignedRank(d, new Array(12).fill(0))!
    expect(r.stat[0].value).toBe(2)
    expect(r.p).toBeCloseTo(0.0036491956, 6)
    expect(r.note).toContain("tie correction")
  })

  it("uses the normal approximation above the exact cutoff (n = 30)", () => {
    // scipy method="approx", correction=False → 1.7343976e-06
    const a = Array.from({ length: 30 }, (_, i) => i + 1)
    const r = wilcoxonSignedRank(a, new Array(30).fill(0))!
    expect(r.p).toBeCloseTo(1.7343976e-6, 8)
    expect(r.note).toContain("normal approximation")
  })

  it("reports the matched-pairs rank-biserial correlation", () => {
    // Kerby (2014): r = (W⁺ − W⁻)/(n(n+1)/2). All differences positive → r = 1.
    expect(wilcoxonSignedRank([1, 2, 3, 4, 5], [0, 0, 0, 0, 0])!.effect).toEqual({
      label: "rank-biserial r",
      value: 1,
    })
    // Ranks of |d| = 2,1,4,5,3,6,7,8; negatives carry ranks 1 and 3 → W⁻ = 4,
    // W⁺ = 36 − 4 = 32, r = (32 − 4)/36 = 0.7777…
    expect(wilcoxonSignedRank([2, -1, 4, 5, -3, 7, 8, 9], new Array(8).fill(0))!.effect!.value)
      .toBeCloseTo(28 / 36, 12)
  })
})

vdescribe("Mann–Whitney U", () => {
  it("applies the tie correction to the null variance", () => {
    // a=[1,1,2,2,3,3] b=[2,2,3,3,4,4]: tie group sizes 2,4,4,2 over N=12, so
    // ΣT = 6+60+60+6 = 132 and σ² = (36/12)·(13 − 132/132) = 36, σ = 6.
    // Uncorrected σ² = 6·6·13/12 = 39 → σ = 6.245, an understated z.
    // scipy asymptotic (use_continuity=False) = 0.09558070454562939
    const r = mannWhitney([1, 1, 2, 2, 3, 3], [2, 2, 3, 3, 4, 4])!
    expect(r.stat[0].value).toBe(8)
    expect(r.stat[1].value).toBeCloseTo((8 - 18) / 6, 12)
    expect(r.p).toBeCloseTo(0.09558070454562939, 6)
    expect(r.note).toContain("tie correction")
  })

  it("uses the exact null distribution when there are no ties", () => {
    // scipy method="exact": 4v4 with U=1 → 0.05714285714285714 (= 4/70); the
    // normal approximation gave 0.0433, a false positive at α = 0.05.
    const r = mannWhitney([1, 2, 3, 5], [4, 6, 7, 8])!
    expect(r.stat[0].value).toBe(1)
    expect(r.p).toBeCloseTo(0.05714285714285714, 12)
    expect(r.note).toContain("exact")
    // 6v6 with U=0 → 2/C(12,6) = 2/924
    expect(mannWhitney([1, 2, 3, 4, 5, 6], [7, 8, 9, 10, 11, 12])!.p).toBeCloseTo(2 / 924, 12)
    // 5v5 with U=7 → 0.30952380952380953
    expect(mannWhitney([10, 12, 14, 16, 18], [11, 13, 20, 22, 24])!.p).toBeCloseTo(0.30952380952380953, 12)
  })

  it("falls back to the approximation above the exact cutoff (25 vs 25)", () => {
    // scipy asymptotic (use_continuity=False) = 1.3328142940540715e-09.
    // Relative tolerance: distributions.ts approximates the normal tail, and
    // 1e-9 is deep enough that it costs ~0.4% relative accuracy.
    const r = mannWhitney(
      Array.from({ length: 25 }, (_, i) => i + 1),
      Array.from({ length: 25 }, (_, i) => i + 26),
    )!
    expect(r.p / 1.3328142940540715e-9).toBeCloseTo(1, 2)
    expect(r.note).toContain("normal approximation")
  })

  it("reports rank-biserial r (= Cliff's δ) with a Cliff (1993) CI", () => {
    // δ = (#(a>b) − #(a<b))/(n₁n₂). Reference values from the Cliff (1993)
    // consistent-variance interval, transcribed independently in Python:
    //   [1,1,2,2,3,3] vs [2,2,3,3,4,4] → δ = −0.5555…, CI (−0.8601636, 0.0411871)
    //   [1,2,3,5]     vs [4,6,7,8]     → δ = −0.875,   CI (−0.9787562, −0.4144480)
    const t = mannWhitney([1, 1, 2, 2, 3, 3], [2, 2, 3, 3, 4, 4])!
    expect(t.effect).toEqual({ label: "rank-biserial r", value: -0.5555555555555556 })
    expect(t.effectCI![0]).toBeCloseTo(-0.860163624149396, 10)
    expect(t.effectCI![1]).toBeCloseTo(0.04118708699380258, 10)

    const s = mannWhitney([1, 2, 3, 5], [4, 6, 7, 8])!
    expect(s.effect!.value).toBeCloseTo(-0.875, 12)
    expect(s.effectCI![0]).toBeCloseTo(-0.9787562454781598, 10)
    expect(s.effectCI![1]).toBeCloseTo(-0.4144479777091052, 10)

    // Complete separation: δ = −1 exactly and the consistent variance is 0, so
    // no interval is defined — better than emitting the vacuous (−1, 1).
    const sep = mannWhitney([1, 2, 3, 4, 5, 6], [7, 8, 9, 10, 11, 12])!
    expect(sep.effect!.value).toBe(-1)
    expect(sep.effectCI).toBeUndefined()
  })
})

vdescribe("Kruskal–Wallis", () => {
  it("applies the 1 − ΣT/(N³−N) tie correction", () => {
    // Tie group sizes 1,2,4,4,4,4,2,2,1 over N=24 → ΣT = 258, N³−N = 13800,
    // C = 0.9813043. Uncorrected H = 15.0913 (p = 5.3e-4); corrected
    // H = 15.378766061143113 (p = 4.5766e-4) — scipy.stats.kruskal agrees to
    // 13 significant figures on H.
    const r = kruskalWallis([
      { name: "A", values: [1, 2, 2, 3, 3, 4, 4, 5] },
      { name: "B", values: [3, 3, 4, 4, 5, 5, 6, 6] },
      { name: "C", values: [5, 6, 6, 7, 7, 8, 8, 9] },
    ])!
    expect(r.stat[0].value).toBeCloseTo(15.378766061143113, 10)
    expect(r.p).toBeCloseTo(0.00045766044715295825, 10)
    expect(r.note).toContain("corrected for ties")
  })

  it("is unchanged when there are no ties", () => {
    // scipy.stats.kruskal → H = 9.846153846153847, p = 0.007276706499332492
    const r = kruskalWallis([
      { name: "A", values: [1, 2, 3, 4] },
      { name: "B", values: [5, 6, 7, 8] },
      { name: "C", values: [9, 10, 11, 12] },
    ])!
    expect(r.stat[0].value).toBeCloseTo(9.846153846153847, 10)
    expect(r.p).toBeCloseTo(0.007276706499332492, 10)
    expect(r.note).not.toContain("corrected")
  })
})
