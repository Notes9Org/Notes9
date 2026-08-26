/**
 * An estimate shown without its interval reads as a measurement.
 *
 * `curve-fitting` returns `ec50CI` and `statistics` returns `effectCI`; both
 * were computed and then dropped on the floor at the render. Neither of these
 * tests may compute an interval — they only check that the one the engine
 * produced reaches the screen, and that nothing appears when it did not.
 */

import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"

import { fitCurve } from "@/lib/data-analysis/curve-fitting"
import { ec50Interval } from "@/components/data-analysis/standard-curve-panel"

const ROOT = path.resolve(__dirname, "../..")
const src = (p: string) => readFileSync(path.join(ROOT, p), "utf8")

describe("EC50 is shown with its interval", () => {
  it("the panel no longer prints fit.ec50 bare", () => {
    const panel = src("components/data-analysis/standard-curve-panel.tsx")
    expect(panel).toContain("ec50Interval(fit)")
    expect(panel).toContain("fit.ec50CI")
  })

  it("a real 4PL fit produces an interval, and it brackets the estimate", () => {
    // A clean sigmoid: bottom 0, top 100, EC50 10, hill 1.
    const x = [0.1, 0.3, 1, 3, 10, 30, 100, 300]
    const y = x.map((v) => (100 * v) / (v + 10))
    const fit = fitCurve("4pl", x, y)
    expect(fit).not.toBeNull()
    expect(fit!.ec50).toBeCloseTo(10, 1)

    const ci = fit!.ec50CI
    expect(ci, "curve-fitting should return ec50CI for a 4PL fit").toBeDefined()
    // Geometric and strictly positive: a concentration cannot be negative, and
    // a symmetric Wald interval on EC50 routinely goes there.
    expect(ci![0]).toBeGreaterThan(0)
    expect(ci![0]).toBeLessThanOrEqual(fit!.ec50!)
    expect(fit!.ec50!).toBeLessThanOrEqual(ci![1])
  })

  it("formats the interval next to the estimate", () => {
    expect(ec50Interval({ ec50CI: [7.8, 12.9] })).toBe(" (95% CI 7.800–12.900)")
  })

  it("says nothing at all when the fit produced no interval", () => {
    expect(ec50Interval({})).toBe("")
    expect(ec50Interval({ ec50CI: [NaN, 12.9] })).toBe("")
    expect(ec50Interval({ ec50CI: [7.8, Infinity] })).toBe("")
  })
})

describe("effect sizes are shown with their interval", () => {
  it("the stats panel passes effectCI through to the Stat it renders", () => {
    const panel = src("components/data-analysis/stats-panel.tsx")
    expect(panel).toContain("result.effectCI")
    expect(panel).toMatch(/95% CI \$\{num\(result\.effectCI\[0\]\)\} to \$\{num\(result\.effectCI\[1\]\)\}/)
    // Only when the test produced one — never manufactured at the render.
    expect(panel).toContain("result.effectCI && result.effectCI.every(Number.isFinite)")
  })

  it("Stat renders the sub-line only when given one", () => {
    const panel = src("components/data-analysis/stats-panel.tsx")
    expect(panel).toContain("{sub && <div")
  })
})
