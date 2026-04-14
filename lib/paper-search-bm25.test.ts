import { describe, expect, it } from "vitest"
import { bm25Scores, normalizeScoresMinMax } from "./paper-search-bm25"

describe("bm25Scores", () => {
  it("ranks a document that matches the query higher than an irrelevant one", () => {
    const docs = [
      "unrelated astronomy nebula distance",
      "chronic kidney disease drug metabolism clearance pharmacokinetics",
    ]
    const q = "kidney disease drug metabolism"
    const scores = bm25Scores(docs, q)
    expect(scores).toHaveLength(2)
    expect(scores[1]).toBeGreaterThan(scores[0])
  })

  it("returns zeros for empty documents", () => {
    expect(bm25Scores([], "test")).toEqual([])
  })
})

describe("normalizeScoresMinMax", () => {
  it("maps min to 0 and max to 1", () => {
    const n = normalizeScoresMinMax([1, 5, 3])
    expect(n[0]).toBe(0)
    expect(n[1]).toBe(1)
    expect(n[2]).toBeCloseTo(0.5, 5)
  })

  it("returns all zeros when scores are identical", () => {
    const n = normalizeScoresMinMax([2, 2, 2])
    expect(n.every((x) => x === 0)).toBe(true)
  })
})
