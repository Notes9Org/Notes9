/**
 * T0.4 — the axis suggestion reads the inference, and the detected units reach
 * the figure.
 *
 * Before this the suggestion took `table.columns[0]` for x and the first two
 * numeric columns for y while `inferRoles` sat unused a few lines away, and
 * `figure.x.unit` came only from a rail text box. Both are asserted here on the
 * inference's own output rather than on hand-written roles, so a change to what
 * `inferRoles` produces shows up as a failure here rather than as a wrong
 * figure.
 */

import { describe, expect, it } from "vitest"

import { labelForColumn, suggestAxes, unitForColumn } from "@/components/data-analysis/workspace/axis-suggestion"
import { inferRoles, profileTable } from "@/lib/data-analysis/semantic/infer"
import { tableFromChartRows } from "@/lib/data-analysis/workspace/chart-state-spec"
import { applyMutation } from "@/lib/data-analysis/spec/mutations"
import type { ColumnRole } from "@/lib/data-analysis/spec/analysis-spec"
import { baseSpec } from "./spec-fixture"

/** A growth curve with a well id first — the shape the old guess got wrong. */
const COLUMNS = ["Well", "Time (h)", "OD600"]
const ROWS = [
  { Well: "A1", "Time (h)": 0, OD600: 0.05 },
  { Well: "A1", "Time (h)": 2, OD600: 0.11 },
  { Well: "A2", "Time (h)": 4, OD600: 0.42 },
  { Well: "A2", "Time (h)": 6, OD600: 0.88 },
]

function rolesFor(columns: string[], rows: Record<string, string | number>[]): ColumnRole[] {
  const table = tableFromChartRows(columns, rows)
  return inferRoles(table, []).map((r) => ({
    column: r.column,
    role: r.role,
    unit: r.unit,
    source: "inferred" as const,
    confidence: r.confidence,
  }))
}

describe("labelForColumn", () => {
  it("strips the unit, because the spec holds label and unit apart", () => {
    // Leaving "Concentration (pg/mL)" as the label draws the unit twice.
    expect(labelForColumn("Concentration (pg/mL)")).toBe("Concentration")
    expect(labelForColumn("OD600")).toBe("OD600")
  })
  it("never returns an empty label", () => {
    expect(labelForColumn("(ng/mL)")).toBe("(ng/mL)")
  })
})

describe("suggestAxes", () => {
  const roles = rolesFor(COLUMNS, ROWS)

  it("the inference names the time column, not the leftmost one", () => {
    const s = suggestAxes({ columns: COLUMNS }, roles, ["Time (h)", "OD600"])
    expect(s).not.toBeNull()
    expect(s?.fromRoles).toBe(true)
    // The old rule offered to plot well ids against absorbance.
    expect(s?.x).toBe("Time (h)")
    expect(s?.x).not.toBe("Well")
    expect(s?.y).toContain("OD600")
  })

  it("carries the detected unit, which never used to reach the figure", () => {
    const s = suggestAxes({ columns: COLUMNS }, roles, ["Time (h)", "OD600"])
    expect(s?.xUnit).toBe("h")
    expect(s?.xLabel).toBe("Time")
  })

  it("the suggestion's units land on figure.x.unit", () => {
    const s = suggestAxes({ columns: COLUMNS }, roles, ["Time (h)", "OD600"])
    const after = applyMutation(baseSpec(), {
      kind: "axis.set",
      axis: "x",
      patch: { label: s?.xLabel ?? "", unit: s?.xUnit || null },
    })
    expect(after.figure.x).toMatchObject({ label: "Time", unit: "h" })
  })

  it("falls back to sheet order when nothing was inferred, and says so", () => {
    const columns = ["Col1", "Col2", "Col3"]
    const s = suggestAxes({ columns }, [], ["Col2", "Col3"])
    expect(s?.fromRoles).toBe(false)
    expect(s?.x).toBe("Col1")
    expect(s?.y).toEqual(["Col2", "Col3"])
    // A guess presented as an inference is worse than a guess.
    expect(s?.evidence).toMatch(/not an inference/)
  })

  it("returns nothing rather than a one-axis offer", () => {
    expect(suggestAxes({ columns: [] }, [], [])).toBeNull()
    expect(suggestAxes({ columns: ["OnlyOne"] }, [], [])).toBeNull()
  })

  it("never offers a column the sheet no longer has", () => {
    const stale: ColumnRole[] = [
      { column: "Removed", role: "time", unit: null, source: "inferred", confidence: 0.9 },
      { column: "OD600", role: "response", unit: null, source: "inferred", confidence: 0.9 },
    ]
    const s = suggestAxes({ columns: ["Time (h)", "OD600"] }, stale, ["Time (h)", "OD600"])
    expect(s?.x).not.toBe("Removed")
  })
})

describe("unitForColumn", () => {
  it("is the rail's empty-string convention, not null", () => {
    expect(unitForColumn([], "anything")).toBe("")
  })
})
