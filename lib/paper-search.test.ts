import { describe, expect, it } from "vitest"
import { citationBoostForSearchRank } from "./paper-search-citation-boost"

describe("citationBoostForSearchRank", () => {
  it("is zero for missing or zero citations", () => {
    expect(citationBoostForSearchRank(undefined)).toBe(0)
    expect(citationBoostForSearchRank(0)).toBe(0)
  })

  it("increases monotonically and shows diminishing marginal gains before the cap", () => {
    const b5 = citationBoostForSearchRank(5)
    const b20 = citationBoostForSearchRank(20)
    const b80 = citationBoostForSearchRank(80)
    const b200 = citationBoostForSearchRank(200)
    const b400 = citationBoostForSearchRank(400)

    expect(b20).toBeGreaterThan(b5)
    expect(b80).toBeGreaterThan(b20)
    expect(b200).toBeGreaterThan(b80)
    expect(b400).toBeGreaterThan(b200)

    expect(b20 - b5).toBeGreaterThan(b400 - b200)
  })

  it("never exceeds the relevance cap (~22)", () => {
    expect(citationBoostForSearchRank(1_000_000)).toBeLessThanOrEqual(22)
  })
})
