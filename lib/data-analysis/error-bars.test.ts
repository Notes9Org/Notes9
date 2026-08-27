/**
 * One error bar per setting, whatever draws it.
 *
 * The Chart tab and the figure renderer each had their own implementation. The
 * symmetric/asymmetric split is what these pin: for SD, SEM and the confidence
 * intervals the two agree by construction, and for the three robust kinds they
 * did not, in ways that put the whisker on a value the data never took.
 */
import { describe, expect, it } from "vitest"
import {
  errorBarSpan,
  errorBarsSupported,
  errorBarsUnsupportedReason,
} from "@/lib/data-analysis/error-bars"

const VALUES = [2, 4, 4, 4, 5, 5, 7, 9]
const mean = VALUES.reduce((a, b) => a + b, 0) / VALUES.length // 5
const near = (a: number, b: number, tol = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(tol)

describe("symmetric kinds centre on the mean", () => {
  it.each(["sd", "sem", "ci90", "ci95", "ci99"] as const)("%s", (kind) => {
    const s = errorBarSpan(VALUES, kind)
    near(s.centre, mean)
    near(s.minus, s.plus)
    expect(s.plus).toBeGreaterThan(0)
  })

  it("SEM is smaller than SD, and the intervals widen with the level", () => {
    const sd = errorBarSpan(VALUES, "sd").plus
    const sem = errorBarSpan(VALUES, "sem").plus
    expect(sem).toBeLessThan(sd)
    const ci90 = errorBarSpan(VALUES, "ci90").plus
    const ci95 = errorBarSpan(VALUES, "ci95").plus
    const ci99 = errorBarSpan(VALUES, "ci99").plus
    expect(ci90).toBeLessThan(ci95)
    expect(ci95).toBeLessThan(ci99)
  })

  it("uses the t distribution, not 1.96 — at bench n the difference is large", () => {
    const small = [10, 12, 14]
    const sem = errorBarSpan(small, "sem").plus
    const ci95 = errorBarSpan(small, "ci95").plus
    // t(2, .975) = 4.303. A 1.96 multiplier would be less than half of this.
    expect(ci95 / sem).toBeGreaterThan(4.0)
    expect(ci95 / sem).toBeLessThan(4.6)
  })
})

describe("robust kinds are asymmetric, and centre on the median", () => {
  it("IQR reaches Q1 and Q3, not the same distance both ways", () => {
    // Chosen so the median genuinely is NOT the midpoint of Q1..Q3 — the case
    // a single scalar cannot represent. n = 7, median = 4, Q1 = 2.5, Q3 = 10.5.
    const skewed = [1, 2, 3, 4, 10, 11, 12]
    const s = errorBarSpan(skewed, "iqr")
    near(s.centre, 4)
    near(s.centre - s.minus, 2.5)
    near(s.centre + s.plus, 10.5)
    near(s.minus, 1.5)
    near(s.plus, 6.5)
    // The old symmetric bar would have reached 4 ± 8 on this data: down to −4,
    // a value nothing in the sample takes, and short of Q3 at the top.
    expect(s.minus).not.toBeCloseTo(s.plus, 6)
  })

  it("range reaches the actual minimum and maximum", () => {
    // The old scalar was `max - mean`, mirrored, so the lower whisker landed
    // below the minimum whenever the data was skewed.
    const skewed = [1, 2, 3, 4, 10, 11, 20]
    const s = errorBarSpan(skewed, "range")
    near(s.centre - s.minus, 1)
    near(s.centre + s.plus, 20)
  })

  it("MAD centres on the median and is scaled to compare with an SD", () => {
    const s = errorBarSpan(VALUES, "mad")
    near(s.centre, 4.5)
    // Deviations from the median 4.5: 2.5,0.5,0.5,0.5,0.5,0.5,2.5,4.5 → median 0.5
    near(s.plus, 0.5 * 1.4826)
    near(s.minus, s.plus)
  })
})

describe("degenerate input", () => {
  it("draws nothing rather than NaN for a single value", () => {
    const s = errorBarSpan([7], "sd")
    near(s.centre, 7)
    near(s.plus, 0)
    near(s.minus, 0)
  })

  it("is flat for kind none", () => {
    const s = errorBarSpan(VALUES, "none")
    near(s.plus, 0)
    near(s.minus, 0)
  })

  it("does not throw on an empty group", () => {
    expect(() => errorBarSpan([], "sem")).not.toThrow()
  })
})

describe("the engine's own row wins when it exists", () => {
  it("prefers the reported 95% interval over recomputing it", () => {
    // So a figure beside a results table cannot disagree with it.
    const s = errorBarSpan(VALUES, "ci95", { mean: 5, ci95Low: 3, ci95High: 8, n: 8, sd: 2 })
    near(s.centre, 5)
    near(s.minus, 2)
    near(s.plus, 3)
  })

  it("prefers the reported SD", () => {
    const s = errorBarSpan(VALUES, "sd", { mean: 5, sd: 99, n: 8 })
    near(s.plus, 99)
  })

  it("falls back to the values when no row is supplied, so a figure can draw without the engine", () => {
    const s = errorBarSpan(VALUES, "sd")
    expect(s.plus).toBeGreaterThan(0)
    expect(Number.isFinite(s.plus)).toBe(true)
  })
})

describe("which charts draw them", () => {
  it.each(["line", "scatter", "bar", "barStacked", "barH", "area"])("%s does", (t) => {
    expect(errorBarsSupported(t)).toBe(true)
    expect(errorBarsUnsupportedReason(t)).toBeNull()
  })

  it.each(["box", "violin", "histogram", "pie", "scatter3d"])("%s does not", (t) => {
    expect(errorBarsSupported(t)).toBe(false)
  })

  it("says WHY a box plot does not, rather than ignoring the setting", () => {
    expect(errorBarsUnsupportedReason("box")).toMatch(/already shows the spread/i)
    expect(errorBarsUnsupportedReason("violin")).toMatch(/already shows the spread/i)
  })

  it("gives a reason for every unsupported type", () => {
    for (const t of ["box", "violin", "histogram", "ecdf", "qq", "pie", "scatter3d", "mesh3d"]) {
      expect(errorBarsUnsupportedReason(t), t).toBeTruthy()
    }
  })
})
