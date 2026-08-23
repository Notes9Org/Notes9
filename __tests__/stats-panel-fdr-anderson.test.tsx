import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { useStatsPanel, fcrNote, type Table } from "@/components/data-analysis/stats-panel"
import { multipleComparisons } from "@/lib/data-analysis/statistics"
import { parseSpec } from "@/lib/data-analysis/spec/analysis-spec"

afterEach(cleanup)

/**
 * Two capabilities the engines already had and nothing could reach: the FDR
 * corrections, and Anderson-Darling. Both are the "it exists and nothing
 * surfaces it" defect, so the tests here are about REACHABILITY and about the
 * two places surfacing them could quietly lie — an FCR interval presented at
 * the wrong level, and a declined test presented as a blank.
 */

function Harness({ table, cols }: { table: Table; cols: string[] }) {
  const { canvas, settings } = useStatsPanel(table, cols)
  return (
    <>
      {settings}
      {canvas}
    </>
  )
}

function numericTable(columns: string[], perColumn: number[][]): Table {
  const n = Math.max(...perColumn.map((v) => v.length))
  return {
    columns,
    rows: Array.from({ length: n }, (_, i) =>
      Object.fromEntries(columns.map((c, j) => [c, perColumn[j][i] ?? NaN]))
    ),
  }
}

describe("post-hoc corrections are reachable", () => {
  it("accepts the FDR methods in a saved spec, additively", () => {
    for (const postHoc of ["benjamini-hochberg", "benjamini-yekutieli", "tukey", "none"]) {
      const parsed = parseSpec({
        schemaVersion: 1,
        dataset: {
          fileId: null,
          fileName: "f.csv",
          sheet: null,
          versionHash: "fnv1a64:aa",
          rowCount: 1,
          columnCount: 1,
        },
        design: { source: "inferred" },
        analysis: {
          test: "anova-one-way",
          responseColumns: ["v"],
          groupColumn: "g",
          postHoc,
          alpha: 0.05,
          tails: "two",
        },
        figure: { kind: "bar-scatter-error", x: {}, y: {} },
        export: {},
      })
      expect(parsed.ok, postHoc).toBe(true)
      if (parsed.ok) expect(parsed.spec.analysis.postHoc).toBe(postHoc)
    }
  })

  it("offers both FDR corrections in the picker", () => {
    render(
      <Harness
        table={numericTable(["a", "b", "c"], [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12]])}
        cols={["a", "b", "c"]}
      />
    )
    // The picker only appears once an ANOVA-family test is chosen.
    const testSelect = screen.getAllByRole("combobox")[0]
    fireEvent.change(testSelect, { target: { value: "anova" } })
    const options = screen.getAllByRole("option").map((o) => o.textContent)
    expect(options).toContain("Benjamini–Hochberg (FDR)")
    expect(options).toContain("Benjamini–Yekutieli (FDR, dependent)")
  })
})

describe("FCR intervals are described at the level they were built at", () => {
  const groups = [
    { name: "A", values: [1, 2, 1.5, 1.2, 1.8] },
    { name: "B", values: [1.1, 1.9, 1.4, 1.3, 1.7] },
    { name: "C", values: [9, 10, 9.5, 9.2, 9.8] },
  ]

  it("says nothing for a family-wise correction, whose intervals are all 1 - alpha", () => {
    expect(fcrNote(multipleComparisons(groups, { method: "holm-sidak" }))).toBeNull()
  })

  it("states the actual FCR level, which is not 95%", () => {
    const rows = multipleComparisons(groups, { method: "benjamini-hochberg" })
    const selected = rows.filter((r) => r.significant).length
    expect(selected).toBeGreaterThan(0)
    expect(selected).toBeLessThan(rows.length)

    const note = fcrNote(rows)
    expect(note).toMatch(/FCR-adjusted at /)
    expect(note).not.toMatch(/FCR-adjusted at 95\.00%/)
    expect(note).toContain(`${selected} of ${rows.length} comparisons were selected`)
  })

  it("leaves unselected rows with no interval rather than an uncorrected one", () => {
    const rows = multipleComparisons(groups, { method: "benjamini-hochberg" })
    for (const row of rows) {
      if (row.significant) expect(Number.isFinite(row.ciLow)).toBe(true)
      else expect(Number.isFinite(row.ciLow)).toBe(false)
    }
  })

  it("says so plainly when nothing was selected", () => {
    const flat = [
      { name: "A", values: [1, 2, 3, 4, 5] },
      { name: "B", values: [1.1, 2.1, 3.1, 4.1, 5.1] },
      { name: "C", values: [0.9, 1.9, 2.9, 3.9, 4.9] },
    ]
    const rows = multipleComparisons(flat, { method: "benjamini-hochberg" })
    expect(rows.some((r) => r.significant)).toBe(false)
    expect(fcrNote(rows)).toMatch(/No comparison was selected/)
  })
})

describe("Anderson-Darling is reachable and honest about what it did not do", () => {
  it("is offered alongside the other two normality tests", () => {
    render(<Harness table={numericTable(["a"], [[1, 2, 3]])} cols={["a"]} />)
    expect(screen.getByRole("button", { name: "Anderson–Darling" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Shapiro–Wilk" })).toBeInTheDocument()
  })

  it("renders a refusal, not a blank, when the column is too short", () => {
    render(<Harness table={numericTable(["a"], [[1, 2, 3, 4, 5]])} cols={["a"]} />)
    fireEvent.click(screen.getByRole("button", { name: "Anderson–Darling" }))
    expect(screen.getByText(/declined: needs n ≥ 8 and some spread/)).toBeInTheDocument()
  })

  it("surfaces the approximation note rather than presenting p as exact", () => {
    render(
      <Harness
        table={numericTable(["a"], [[2.1, 3.4, 1.9, 5.5, 4.2, 3.3, 2.8, 4.9, 3.1, 2.5]])}
        cols={["a"]}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: "Anderson–Darling" }))
    expect(screen.getByText("Normality (Anderson–Darling)")).toBeInTheDocument()
    expect(screen.getByText(/approximat/i)).toBeInTheDocument()
  })
})
