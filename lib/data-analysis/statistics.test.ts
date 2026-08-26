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
  andersonDarling,
  andersonDarlingP,
  AD_MIN_N,
  shapiroWilk,
  FDR_METHODS,
} from "./statistics"
import { tCritical } from "./distributions"

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

/* ── Anderson–Darling normality ───────────────────────────────────────────────
 * A² goldens are `scipy.stats.anderson(x, "norm").statistic` on the identical
 * arrays; the p goldens are the D'Agostino & Stephens (1986) fit, transcribed
 * from the published coefficients. scipy returns no p at all, which is exactly
 * why the fit is used and why the result says so out loud.
 */
vdescribe("Anderson–Darling normality", () => {
  const cases: Record<string, { x: number[]; a2: number; p: number }> = {
    normalish: {
      x: [4.1, 4.5, 4.3, 4.9, 5.2, 4.7, 5.0, 4.4, 4.8, 4.6],
      a2: 0.08623033212812281,
      p: 0.9971718414677682,
    },
    rightSkewed: {
      x: [1, 1, 1, 2, 2, 3, 3, 4, 6, 10, 18, 40],
      a2: 1.7901412349635049,
      p: 6.408088669541492e-5,
    },
    uniform: { x: [1, 2, 3, 4, 5, 6, 7, 8, 9], a2: 0.1367664663147039, p: 0.9605614887337001 },
    bimodal: {
      x: [1, 1.1, 1.2, 1.3, 1.4, 1.5, 9, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9],
      a2: 2.4448276500637256,
      p: 1.6465039390911463e-6,
    },
    outlier: {
      x: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1e6],
      a2: 3.6092848106957067,
      p: 9.136243350447911e-10,
    },
    // These two exist to land A* in the fit's [0.2,0.34) and [0.34,0.6) pieces.
    fitPiece2: { x: [6.3, 13.1, 9.8, 11.4, 9.7, 9.2, 10.9, 11.6], a2: 0.27793433189707883, p: 0.546579048373738 },
    fitPiece3: { x: [12.7, 12.4, 9.0, 9.4, 8.9, 11.1, 9.9, 11.5], a2: 0.3371540693792081, p: 0.4021738141179188 },
  }

  it("matches scipy.stats.anderson on the A² statistic", () => {
    for (const [label, c] of Object.entries(cases)) {
      const r = andersonDarling(c.x)!
      expect(r, label).not.toBeNull()
      expect(r.stat[0].value / c.a2, label).toBeCloseTo(1, 10)
    }
  })

  it("matches the published D'Agostino–Stephens p on every branch of the fit", () => {
    const branches = new Set<number>()
    for (const [label, c] of Object.entries(cases)) {
      const n = c.x.length
      const r = andersonDarling(c.x)!
      expect(r.p / c.p, label).toBeCloseTo(1, 8)
      const star = c.a2 * (1 + 0.75 / n + 2.25 / (n * n))
      branches.add(star < 0.2 ? 0 : star < 0.34 ? 1 : star < 0.6 ? 2 : 3)
    }
    expect(branches).toEqual(new Set([0, 1, 2, 3]))
    expect(andersonDarlingP(20, 30)).toBe(3.7e-24) // the ≥ 10 floor
  })

  it("agrees with the Python engine, which is the whole point of sharing the formula", () => {
    // notes9_engine._anderson_darling on the same arrays; goldens copied from
    // the Python suite so a drift in either engine fails here.
    expect(andersonDarling(cases.normalish.x)!.p).toBeCloseTo(0.9971718414677682, 12)
    expect(andersonDarling(cases.bimodal.x)!.p / 1.6465039390911463e-6).toBeCloseTo(1, 9)
  })

  it("declines below n = 8 rather than extrapolating the fit", () => {
    expect(AD_MIN_N).toBe(8)
    expect(andersonDarling([1, 2, 3, 4, 5, 6, 7])).toBeNull()
    expect(andersonDarling([1, 2, 3, 4, 5, 6, 7, 8])).not.toBeNull()
  })

  it("declines on a constant column instead of dividing by a zero SD", () => {
    expect(andersonDarling(new Array(12).fill(3))).toBeNull()
  })

  it("stays finite where a naive Φ would give NaN", () => {
    // The 1e6 outlier puts the largest z past 3 and every other z near −0.3;
    // with A&S-accuracy Φ the ln(1 − Φ) term loses all its digits.
    const r = andersonDarling(cases.outlier.x)!
    expect(Number.isFinite(r.stat[0].value)).toBe(true)
    expect(r.p).toBeLessThan(1e-8)
  })

  it("says in the record that its p is an approximation", () => {
    for (const x of [cases.normalish.x, cases.bimodal.x]) {
      expect(andersonDarling(x)!.note).toContain("approximation")
    }
  })

  it("flags the bimodal column that Shapiro–Wilk also flags", () => {
    expect(andersonDarling(cases.bimodal.x)!.p).toBeLessThan(0.05)
    expect(shapiroWilk(cases.bimodal.x)!.p).toBeLessThan(0.05)
    // …and clears the one both accept, so it is not simply always significant.
    expect(andersonDarling(cases.normalish.x)!.p).toBeGreaterThan(0.05)
    expect(shapiroWilk(cases.normalish.x)!.p).toBeGreaterThan(0.05)
  })
})

/* ── FDR: Benjamini–Hochberg and Benjamini–Yekutieli ─────────────────────────
 * Goldens are statsmodels.stats.multitest.multipletests(method="fdr_bh"/"fdr_by").
 */
vdescribe("FDR corrections", () => {
  const cases: { label: string; p: number[]; bh: number[]; by: number[] }[] = [
    {
      label: "spread",
      p: [0.001, 0.008, 0.039, 0.041, 0.042, 0.6],
      bh: [0.006, 0.024, 0.0504, 0.0504, 0.0504, 0.6],
      by: [0.0147, 0.0588, 0.12347999999999999, 0.12347999999999999, 0.12347999999999999, 1.0],
    },
    {
      label: "ties",
      p: [0.01, 0.01, 0.01, 0.04, 0.04, 0.9],
      bh: [0.02, 0.02, 0.02, 0.048, 0.048, 0.9],
      by: [0.048999999999999995, 0.048999999999999995, 0.048999999999999995, 0.11759999999999998, 0.11759999999999998, 1.0],
    },
    {
      // Raw (m/k)·p is 0.08 / 0.06 / 0.05333 / 0.05 — DEcreasing. Without the
      // reverse cumulative minimum the smallest raw p gets the largest adjusted p.
      label: "monotonicity",
      p: [0.02, 0.03, 0.04, 0.05],
      bh: [0.05, 0.05, 0.05, 0.05],
      by: [0.10416666666666666, 0.10416666666666666, 0.10416666666666666, 0.10416666666666666],
    },
    { label: "single", p: [0.03], bh: [0.03], by: [0.03] },
    {
      label: "large",
      p: [0.0001, 0.0002, 0.02, 0.03, 0.04, 0.05, 0.2, 0.3, 0.5, 0.9],
      bh: [0.001, 0.001, 0.06666666666666667, 0.075, 0.08, 0.08333333333333334, 0.28571428571428575, 0.37499999999999994, 0.5555555555555556, 0.9],
      by: [0.0029289682539682537, 0.0029289682539682537, 0.19526455026455025, 0.219672619047619, 0.2343174603174603, 0.24408068783068781, 0.8368480725623583, 1.0, 1.0, 1.0],
    },
    {
      // Input order must not matter, and the output must come back in input order.
      label: "unsorted",
      p: [0.6, 0.001, 0.042, 0.008, 0.041, 0.039],
      bh: [0.6, 0.006, 0.0504, 0.024, 0.0504, 0.0504],
      by: [1.0, 0.0147, 0.12347999999999999, 0.0588, 0.12347999999999999, 0.12347999999999999],
    },
  ]

  it("matches statsmodels fdr_bh", () => {
    for (const c of cases) {
      const got = pAdjust(c.p, "benjamini-hochberg")
      got.forEach((v, i) => expect(v, `${c.label}[${i}]`).toBeCloseTo(c.bh[i], 12))
    }
  })

  it("matches statsmodels fdr_by", () => {
    for (const c of cases) {
      const got = pAdjust(c.p, "benjamini-yekutieli")
      got.forEach((v, i) => expect(v, `${c.label}[${i}]`).toBeCloseTo(c.by[i], 12))
    }
  })

  it("enforces step-up monotonicity in rank order", () => {
    for (const c of cases) {
      for (const method of FDR_METHODS) {
        const adj = pAdjust(c.p, method)
        const byRank = c.p.map((p, i) => ({ p, a: adj[i] })).sort((x, y) => x.p - y.p)
        for (let i = 1; i < byRank.length; i++) {
          expect(byRank[i].a, `${c.label}/${method}`).toBeGreaterThanOrEqual(byRank[i - 1].a - 1e-15)
        }
      }
    }
  })

  it("is BH times the harmonic number, and never leaves [p, 1]", () => {
    const p = cases[4].p
    const m = p.length
    const c = Array.from({ length: m }, (_, i) => 1 / (i + 1)).reduce((a, b) => a + b, 0)
    const bh = pAdjust(p, "benjamini-hochberg")
    const by = pAdjust(p, "benjamini-yekutieli")
    by.forEach((v, i) => expect(v).toBeCloseTo(Math.min(1, c * bh[i]), 12))
    for (const method of FDR_METHODS) {
      pAdjust(p, method).forEach((v, i) => {
        expect(v).toBeGreaterThanOrEqual(p[i] - 1e-15)
        expect(v).toBeLessThanOrEqual(1)
      })
    }
  })

  it("is uniformly less conservative than Holm, which is the reason to offer it", () => {
    const p = cases[4].p
    const bh = pAdjust(p, "benjamini-hochberg")
    const holm = pAdjust(p, "holm")
    bh.forEach((v, i) => expect(v).toBeLessThanOrEqual(holm[i] + 1e-15))
    expect(bh.some((v, i) => v < holm[i] - 1e-12)).toBe(true)
  })

  it("handles the empty family", () => {
    for (const method of FDR_METHODS) expect(pAdjust([], method)).toEqual([])
  })
})

/* ── FDR-consistent intervals (Benjamini & Yekutieli 2005) ───────────────────
 * The known defect this must not repeat: an adjusted p beside an interval built
 * at the UNadjusted level, so the interval excludes zero while its own p says
 * the comparison is not a discovery.
 */
vdescribe("FCR-adjusted intervals on FDR comparisons", () => {
  const clean = [
    { name: "ctrl", values: [5.1, 4.8, 5.4, 5.0, 5.2, 4.9] },
    { name: "lowD", values: [6.2, 5.9, 6.5, 6.1, 6.4, 6.0] },
    { name: "highD", values: [8.1, 7.7, 8.4, 8.0, 8.3, 7.9] },
  ]
  const partial = [
    { name: "ctrl", values: [5.1, 4.8, 5.4, 5.0, 5.2, 4.9] },
    { name: "near", values: [5.3, 5.0, 5.5, 5.2, 5.4, 5.1] },
    { name: "far", values: [8.1, 7.7, 8.4, 8.0, 8.3, 7.9] },
  ]
  const none = [
    { name: "a", values: [1, 2, 3, 4, 5, 6] },
    { name: "b", values: [1.1, 2.2, 2.9, 4.1, 5.2, 5.8] },
    { name: "c", values: [1.2, 2.1, 3.1, 3.9, 5.1, 6.2] },
  ]

  it("builds the interval at 1 − R·α/m, computed from R and not assumed", () => {
    const alpha = 0.05
    const rows = multipleComparisons(partial, { method: "benjamini-hochberg", alpha })
    const R = rows.filter((r) => r.significant).length
    expect([rows.length, R]).toEqual([3, 2])
    const dfw = 18 - 3
    const crit = tCritical((alpha * R) / rows.length, dfw)
    expect(crit).toBeGreaterThan(tCritical(alpha, dfw)) // genuinely wider than 95%
    for (const r of rows) {
      if (!r.significant) continue
      const halfWidth = (r.ciHigh - r.ciLow) / 2
      const se = halfWidth / crit
      expect(r.ciLow).toBeCloseTo(r.diff - crit * se, 12)
      expect(r.ciHigh).toBeCloseTo(r.diff + crit * se, 12)
    }
  })

  it("excludes zero for exactly the rows the FDR procedure selected", () => {
    for (const groups of [clean, partial, none]) {
      for (const alpha of [0.01, 0.05, 0.1]) {
        for (const method of FDR_METHODS) {
          const rows = multipleComparisons(groups, { method, alpha })
          for (const r of rows) {
            if (r.significant) {
              expect(Number.isFinite(r.ciLow)).toBe(true)
              expect(r.ciLow * r.ciHigh).toBeGreaterThan(0)
            } else {
              // NaN, the same "no interval defined" sentinel dunnTest uses.
              expect(Number.isNaN(r.ciLow)).toBe(true)
              expect(Number.isNaN(r.ciHigh)).toBe(true)
            }
          }
        }
      }
    }
  })

  it("reports no interval at all when nothing is selected", () => {
    const rows = multipleComparisons(none, { method: "benjamini-hochberg", alpha: 0.05 })
    expect(rows.some((r) => r.significant)).toBe(false)
    expect(rows.every((r) => Number.isNaN(r.ciLow) && Number.isNaN(r.ciHigh))).toBe(true)
  })

  it("leaves an uncorrected family's interval at 1 − α", () => {
    // method "none" applies no correction, so the plain per-comparison interval
    // is the correct one and must not move.
    const dfw = 18 - 3
    const tc = tCritical(0.05, dfw)
    for (const r of multipleComparisons(partial, { method: "none", alpha: 0.05 })) {
      const se = (r.ciHigh - r.ciLow) / (2 * tc)
      expect(r.ciLow).toBeCloseTo(r.diff - tc * se, 12)
    }
  })

  it("tracks alpha instead of a hardcoded 0.05", () => {
    const wide = multipleComparisons(clean, { method: "benjamini-hochberg", alpha: 0.01 })[0]
    const narrow = multipleComparisons(clean, { method: "benjamini-hochberg", alpha: 0.1 })[0]
    expect(wide.ciHigh - wide.ciLow).toBeGreaterThan(narrow.ciHigh - narrow.ciLow)
    // Here R = m, so the FCR level collapses back to 1 − α exactly.
    const dfw = 18 - 3
    const se = (wide.ciHigh - wide.ciLow) / (2 * tCritical(0.01, dfw))
    expect(wide.ciHigh - wide.ciLow).toBeCloseTo(2 * tCritical(0.01, dfw) * se, 12)
  })

  it("matches the engine's pairwise adjusted p for the same groups", () => {
    // notes9_engine.run_anova_one_way(..., postHoc="benjamini-hochberg") on the
    // same three groups; statsmodels fdr_bh over the raw pairwise t p-values.
    const rows = multipleComparisons(clean, { method: "benjamini-hochberg", alpha: 0.05 })
    const raw = rows.map((r) => r.p)
    const expected = pAdjust(raw, "benjamini-hochberg")
    rows.forEach((r, i) => expect(r.pAdj).toBeCloseTo(expected[i], 15))
  })

  it("applies the same rule on the vs-control option, not just all-pairs", () => {
    // `control` is user-selectable and changes m from 3 pairs to 2, which changes
    // both the BH adjustment and the FCR level derived from it.
    const alpha = 0.05
    const rows = multipleComparisons(partial, { method: "benjamini-hochberg", alpha, control: "ctrl" })
    expect(rows.length).toBe(2)
    expect(rows.map((r) => r.pAdj)).toEqual(pAdjust(rows.map((r) => r.p), "benjamini-hochberg"))
    const R = rows.filter((r) => r.significant).length
    expect(R).toBe(1) // ctrl vs far separates, ctrl vs near does not
    const crit = tCritical((alpha * R) / rows.length, 18 - 3)
    for (const r of rows) {
      if (r.significant) {
        const se = (r.ciHigh - r.ciLow) / (2 * crit)
        expect(r.ciLow).toBeCloseTo(r.diff - crit * se, 12)
        expect(r.ciLow * r.ciHigh).toBeGreaterThan(0)
      } else {
        expect(Number.isNaN(r.ciLow)).toBe(true)
      }
    }
  })

  it("passes FDR corrections through Dunn's test as well", () => {
    const d = dunnTest(
      [
        { name: "A", values: [1, 2, 3, 4] },
        { name: "B", values: [5, 6, 7, 8] },
        { name: "C", values: [9, 10, 11, 12] },
      ],
      "benjamini-hochberg",
    )
    expect(d.length).toBe(3)
    const expected = pAdjust(d.map((c) => c.p), "benjamini-hochberg")
    d.forEach((c, i) => expect(c.pAdj).toBeCloseTo(expected[i], 15))
  })
})

vdescribe("multiplicity-adjusted intervals for the FWER corrections", () => {
  // The defect: Bonferroni/Šidák/Holm/Holm–Šidák reported an UNADJUSTED interval
  // beside an adjusted p, so the two contradicted each other — pAdj = 0.23967
  // next to a CI of [0.052, 1.948] that excludes zero.
  const groups = [
    { name: "ctrl", values: [5.1, 4.8, 5.4, 5.0, 5.2, 4.9] },
    { name: "near", values: [5.6, 5.3, 5.9, 5.5, 5.8, 5.4] },
    { name: "far", values: [8.1, 7.7, 8.4, 8.0, 8.3, 7.9] },
  ]
  const dfw = 18 - 3
  const m = 3
  /** SE recovered from Tukey's interval, which is independent of the code under test. */
  const seOf = (rows: ReturnType<typeof multipleComparisons>, i: number, crit: number) =>
    (rows[i].ciHigh - rows[i].ciLow) / (2 * crit)

  it("Bonferroni's interval is the per-comparison interval at α/m", () => {
    const alpha = 0.05
    const rows = multipleComparisons(groups, { method: "bonferroni", alpha })
    const crit = tCritical(alpha / m, dfw)
    const unadjusted = tCritical(alpha, dfw)
    expect(crit).toBeGreaterThan(unadjusted) // genuinely wider than the old one
    for (const r of rows) {
      const se = (r.ciHigh - r.ciLow) / (2 * crit)
      expect(r.ciLow).toBeCloseTo(r.diff - crit * se, 12)
      expect(r.ciHigh).toBeCloseTo(r.diff + crit * se, 12)
    }
  })

  it("Šidák's interval is the per-comparison interval at 1 − (1−α)^(1/m)", () => {
    const alpha = 0.05
    const rows = multipleComparisons(groups, { method: "sidak", alpha })
    const crit = tCritical(1 - (1 - alpha) ** (1 / m), dfw)
    // Šidák is very slightly less conservative than Bonferroni, so its interval
    // must be narrower — if the two agreed, one of the options would be a lie.
    expect(crit).toBeLessThan(tCritical(alpha / m, dfw))
    for (const r of rows) {
      const se = (r.ciHigh - r.ciLow) / (2 * crit)
      expect(r.ciLow).toBeCloseTo(r.diff - crit * se, 12)
    }
    const bonf = multipleComparisons(groups, { method: "bonferroni", alpha })
    expect(rows[0].ciHigh - rows[0].ciLow).toBeLessThan(bonf[0].ciHigh - bonf[0].ciLow)
  })

  it("Holm and Holm–Šidák report NO interval, because none is defined", () => {
    // Step-down procedures have no generally accepted simultaneous interval.
    // NaN is the same "no interval defined" sentinel the unselected FDR rows use.
    for (const method of ["holm", "holm-sidak"] as const) {
      const rows = multipleComparisons(groups, { method, alpha: 0.05 })
      expect(rows.length).toBe(3)
      expect(rows.every((r) => Number.isNaN(r.ciLow) && Number.isNaN(r.ciHigh))).toBe(true)
      // …and they still produce adjusted p-values; only the interval is withheld.
      expect(rows.every((r) => isFinite(r.pAdj))).toBe(true)
    }
  })

  it("the conservative single-step interval would contradict Holm, which is why it is not used", () => {
    // The justification for withholding, checked rather than asserted in prose:
    // Holm's adjusted p ≤ Bonferroni's, so there EXISTS a comparison Holm calls
    // significant whose Bonferroni interval still contains zero. Substituting
    // that interval would reintroduce the contradiction pointing the other way —
    // "significant" printed beside a range that includes no effect.
    //
    // Constructed so ctrl-vs-mid is borderline (raw p = 0.02651) while the other
    // two pairs are overwhelming, which is exactly when Holm's step-down gains
    // over Bonferroni: the borderline hypothesis is tested last, at factor 1.
    const off = [-0.35, -0.15, -0.05, 0.05, 0.15, 0.35]
    const borderline = [
      { name: "ctrl", values: off.map((o) => 5.0 + o) },
      { name: "mid", values: off.map((o) => 5.345 + o) },
      { name: "high", values: off.map((o) => 7.0 + o) },
    ]
    const alpha = 0.05
    const holm = multipleComparisons(borderline, { method: "holm", alpha })
    const bonf = multipleComparisons(borderline, { method: "bonferroni", alpha })

    // Golden (scipy, df = 15, pooled MS_within): the borderline pair's raw p.
    expect(holm[0].p).toBeCloseTo(0.02651, 5)
    // Holm calls it significant; Bonferroni does not.
    expect(holm[0].pAdj).toBeCloseTo(0.02651, 5)
    expect(holm[0].pAdj).toBeLessThan(alpha)
    expect(bonf[0].pAdj).toBeCloseTo(0.07953, 5)
    expect(bonf[0].pAdj).toBeGreaterThan(alpha)
    // And Bonferroni's interval for that same pair straddles zero.
    expect(bonf[0].ciLow).toBeCloseTo(-0.7228, 4)
    expect(bonf[0].ciHigh).toBeCloseTo(0.0328, 4)
    expect(bonf[0].ciLow * bonf[0].ciHigh).toBeLessThan(0)
    // Which is why Holm reports no interval instead of borrowing that one.
    expect(Number.isNaN(holm[0].ciLow)).toBe(true)
  })

  it("single-step interval excludes zero exactly when its adjusted p is below α", () => {
    // The coherence claim, over every alpha and both single-step methods.
    const sets = [
      groups,
      [
        { name: "a", values: [1, 2, 3, 4, 5, 6] },
        { name: "b", values: [1.1, 2.2, 2.9, 4.1, 5.2, 5.8] },
        { name: "c", values: [1.2, 2.1, 3.1, 3.9, 5.1, 6.2] },
      ],
      [
        { name: "a", values: [1, 2, 3, 4, 5, 6] },
        { name: "b", values: [3, 4, 5, 6, 7, 8] },
        { name: "c", values: [9, 10, 11, 12, 13, 14] },
      ],
    ]
    for (const g of sets) {
      for (const alpha of [0.01, 0.05, 0.1]) {
        for (const method of ["bonferroni", "sidak", "none"] as const) {
          for (const r of multipleComparisons(g, { method, alpha })) {
            const excludesZero = r.ciLow * r.ciHigh > 0
            expect(excludesZero).toBe(r.pAdj < alpha)
            expect(r.significant).toBe(excludesZero)
          }
        }
      }
    }
  })

  it("the reported symptom is gone: no adjusted-nonsignificant row keeps a zero-excluding interval", () => {
    for (const method of ["bonferroni", "sidak", "holm", "holm-sidak"] as const) {
      for (const alpha of [0.01, 0.05, 0.1]) {
        for (const r of multipleComparisons(groups, { method, alpha })) {
          if (r.pAdj >= alpha && isFinite(r.ciLow)) {
            expect(r.ciLow * r.ciHigh).toBeLessThanOrEqual(0)
          }
        }
      }
    }
  })

  it("the single-step level tracks α rather than a hardcoded 0.05", () => {
    for (const method of ["bonferroni", "sidak"] as const) {
      const wide = multipleComparisons(groups, { method, alpha: 0.01 })[0]
      const narrow = multipleComparisons(groups, { method, alpha: 0.1 })[0]
      expect(wide.ciHigh - wide.ciLow).toBeGreaterThan(narrow.ciHigh - narrow.ciLow)
    }
    // and the exact width, against an independently computed critical value
    const w = multipleComparisons(groups, { method: "bonferroni", alpha: 0.01 })[0]
    const crit = tCritical(0.01 / m, dfw)
    const se = (w.ciHigh - w.ciLow) / (2 * crit)
    expect(w.ciLow).toBeCloseTo(w.diff - crit * se, 12)
    expect(seOf(multipleComparisons(groups, { method: "bonferroni", alpha: 0.01 }), 0, crit))
      .toBeCloseTo(se, 12)
  })

  it("every pairwise row carries an effect size", () => {
    // §6.3: an effect size beside every comparison, not just beside the omnibus.
    const n1 = 6
    const n2 = 6
    const dfWithin = 18 - 3
    let ssw = 0
    for (const g of groups) {
      const mu = g.values.reduce((a, b) => a + b, 0) / g.values.length
      for (const v of g.values) ssw += (v - mu) ** 2
    }
    const msw = ssw / dfWithin
    // Hedges' J for df = 15, from the gamma-function definition.
    const lnG = (z: number) => {
      const c = [
        676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
        12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
      ]
      let x = 0.99999999999980993
      for (let i = 0; i < c.length; i++) x += c[i] / (z + i)
      const t = z + c.length - 0.5
      return 0.5 * Math.log(2 * Math.PI) + (z - 0.5) * Math.log(t) - t + Math.log(x)
    }
    const J = Math.exp(lnG(dfWithin / 2) - Math.log(Math.sqrt(dfWithin / 2)) - lnG((dfWithin - 1) / 2))
    expect(J).toBeGreaterThan(0.94)
    expect(J).toBeLessThan(1)
    for (const method of ["bonferroni", "holm", "benjamini-hochberg"] as const) {
      for (const r of multipleComparisons(groups, { method, alpha: 0.05 })) {
        expect(r.effect.label).toBe("Hedges' g")
        expect(r.effect.value).toBeCloseTo((r.diff / Math.sqrt(msw)) * J, 12)
      }
    }
    expect(n1 + n2).toBe(12) // group sizes are equal, so the pooled SE is shared
  })
})

vdescribe("Dunn's post-hoc intervals and effect sizes", () => {
  const groups = [
    { name: "ctrl", values: [5.1, 4.8, 5.4, 5.0, 5.2, 4.9] },
    { name: "lowD", values: [6.2, 5.9, 6.5, 6.1, 6.4, 6.0] },
    { name: "highD", values: [8.1, 7.7, 8.4, 8.0, 8.3, 7.9] },
  ]

  it("Bonferroni-adjusted Dunn rows get an interval at α/m in rank units", () => {
    const alpha = 0.05
    const rows = dunnTest(groups, "bonferroni", alpha)
    const m = 3
    // Rebuild Dunn's rank-scale SE from scratch: σ² with the tie term (no ties
    // here), times (1/nᵢ + 1/nⱼ).
    const N = 18
    const sigma2 = (N * (N + 1)) / 12
    const se = Math.sqrt(sigma2 * (1 / 6 + 1 / 6))
    // z(1 − (α/m)/2) via the standard normal quantile.
    const zc = Math.abs(
      // Acklam-style inverse is what the module uses; recover it from the row.
      (rows[0].ciHigh - rows[0].ciLow) / (2 * se),
    )
    expect(zc).toBeCloseTo(2.394, 2) // Φ⁻¹(1 − 0.05/6) = 2.3940
    for (const r of rows) {
      expect(r.ciLow).toBeCloseTo(r.diff - zc * se, 10)
      expect(r.ciHigh).toBeCloseTo(r.diff + zc * se, 10)
      expect(r.ciLow * r.ciHigh > 0).toBe(r.pAdj < alpha)
    }
    expect(m).toBe(rows.length)
  })

  it("Holm (the default) still reports no interval", () => {
    for (const r of dunnTest(groups)) {
      expect(Number.isNaN(r.ciLow)).toBe(true)
      expect(Number.isNaN(r.ciHigh)).toBe(true)
    }
  })

  it("significance follows the caller's alpha, not a hardcoded 0.05", () => {
    const near = [
      { name: "a", values: [1, 2, 3, 4, 5, 6] },
      { name: "b", values: [2, 3, 4, 5, 6, 7] },
      { name: "c", values: [3, 4, 5, 6, 7, 8] },
    ]
    const lax = dunnTest(near, "none", 0.5).filter((r) => r.significant).length
    const strict = dunnTest(near, "none", 0.001).filter((r) => r.significant).length
    expect(lax).toBeGreaterThan(strict)
  })

  it("every Dunn row carries a rank-biserial effect size", () => {
    for (const r of dunnTest(groups, "bonferroni", 0.05)) {
      const a = groups.find((g) => g.name === r.a)!.values
      const b = groups.find((g) => g.name === r.b)!.values
      let u1 = 0
      for (const p of a) for (const q of b) u1 += p > q ? 1 : p === q ? 0.5 : 0
      expect(r.effect.label).toBe("rank-biserial r")
      expect(r.effect.value).toBeCloseTo((2 * u1) / (a.length * b.length) - 1, 12)
    }
    // ctrl is entirely below both others, so δ = −1 exactly.
    const rows = dunnTest(groups, "bonferroni", 0.05)
    expect(rows[0].effect.value).toBe(-1)
  })
})
