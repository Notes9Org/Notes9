import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import type { Table } from "@/lib/data-analysis/engine/resolver"
import { detectHeader, hashTable, pipelineFromTable, specFromTable, tableFromGrid } from "./bootstrap"

const meta = { fileName: "plate.xlsx", sheet: "Sheet1", versionHash: "sha256:a" }

const unpaired: Table = {
  columns: ["Well", "Treatment", "Viability (%)"],
  rows: ["Vehicle", "10 uM", "50 uM"].flatMap((t, gi) =>
    Array.from({ length: 6 }, (_, i) => ({
      rowId: `r${gi}-${i}`,
      values: { Well: `${"ABC"[gi]}${i}`, Treatment: t, "Viability (%)": 90 - gi * 20 + i },
    }))
  ),
}

const paired: Table = {
  columns: ["Mouse", "Timepoint", "Volume"],
  rows: ["Before", "After"].flatMap((t, ti) =>
    Array.from({ length: 6 }, (_, i) => ({
      rowId: `r${ti}-${i}`,
      values: { Mouse: `M${i}`, Timepoint: t, Volume: t === "Before" ? 100 + i : 60 + i },
    }))
  ),
}

describe("building a spec from a sheet", () => {
  it("picks the test the design supports, not a fixed default", () => {
    expect(specFromTable(unpaired, meta).analysis.test).toBe("anova-one-way")
    expect(specFromTable(paired, meta).analysis.test).toBe("t-paired")
  })

  it("pairs the correction with the test", () => {
    expect(specFromTable(unpaired, meta).analysis.postHoc).toBe("tukey")
    expect(specFromTable(paired, meta).analysis.postHoc).toBe("none")
  })

  it("wires the response and grouping columns through", () => {
    const spec = specFromTable(unpaired, meta)
    expect(spec.analysis.groupColumn).toBe("Treatment")
    expect(spec.analysis.responseColumns).toEqual(["Viability (%)"])
  })

  it("carries the unit onto the y axis", () => {
    expect(specFromTable(unpaired, meta).figure.y.unit).toBe("%")
  })

  it("only ever chooses a test the capability matrix allows", () => {
    // A menu that offers something the resolver then refuses is worse than one
    // that never offered it.
    for (const table of [unpaired, paired]) {
      const spec = specFromTable(table, meta)
      expect(spec.analysis.test).not.toBe("t-unpaired")
    }
    expect(specFromTable(paired, meta).analysis.test).not.toBe("anova-one-way")
  })

  it("falls back to no test rather than inventing one", () => {
    const shapeless: Table = {
      columns: ["Note"],
      rows: [{ rowId: "r1", values: { Note: "hello" } }],
    }
    expect(specFromTable(shapeless, meta).analysis.test).toBe("none")
  })

  it("respects an explicit test override", () => {
    expect(specFromTable(unpaired, meta, { test: "kruskal-wallis" }).analysis.test).toBe("kruskal-wallis")
  })

  it("never re-guesses a role the record supplied", () => {
    const spec = specFromTable(unpaired, meta, {
      knownRoles: [{ column: "Well", role: "subject", unit: null, source: "project-record", confidence: null }],
    })
    expect(spec.roles.find((r) => r.column === "Well")?.role).toBe("subject")
  })

  it("chooses a chart that suits the question", () => {
    expect(specFromTable(unpaired, meta).figure.kind).toBe("bar-scatter-error")
    expect(specFromTable(unpaired, meta, { test: "kruskal-wallis" }).figure.kind).toBe("box")
    expect(specFromTable(unpaired, meta, { test: "linear-regression" }).figure.kind).toBe("xy-scatter-fit")
    expect(specFromTable(unpaired, meta, { test: "kaplan-meier" }).figure.kind).toBe("kaplan-meier")
  })

  it("opens a pipeline stale, so nothing is shown before the engine runs", () => {
    const pipeline = pipelineFromTable("p1", "Plate", unpaired, meta)
    expect(pipeline.result).toBeNull()
    expect(pipeline.stale).toBe(true)
  })
})

describe("reading a grid", () => {
  it("takes the first row as the header", () => {
    const table = tableFromGrid([
      ["Treatment", "Value"],
      ["Ctrl", 1],
      ["Drug", 2],
    ])
    expect(table.columns).toEqual(["Treatment", "Value"])
    expect(table.rows).toHaveLength(2)
    expect(table.rows[0].values).toEqual({ Treatment: "Ctrl", Value: 1 })
  })

  it("drops blank rows instead of plotting them as empty points", () => {
    const table = tableFromGrid([
      ["A", "B"],
      [1, 2],
      [null, null],
      ["", ""],
      [3, 4],
    ])
    expect(table.rows).toHaveLength(2)
  })

  it("keeps a partially filled row", () => {
    const table = tableFromGrid([
      ["A", "B"],
      [1, null],
    ])
    expect(table.rows).toHaveLength(1)
    expect(table.rows[0].values.B).toBeNull()
  })

  it("names an unlabelled column rather than leaving it blank", () => {
    expect(tableFromGrid([["A", ""], [1, 2]]).columns).toEqual(["A", "Column 2"])
  })

  it("uses the sheet's own row numbers as identities", () => {
    // A point traced back to "row 2" must land where the user can find it.
    expect(tableFromGrid([["A"], [1], [2]]).rows.map((r) => r.rowId)).toEqual(["row-2", "row-3"])
  })

  it("survives an empty grid", () => {
    expect(tableFromGrid([])).toEqual({ columns: [], rows: [] })
  })
})

describe("reading a sheet a bench actually produced", () => {
  // Title, merged group labels, sub-headers, a row of units, and a footnote
  // under a blank line. Reading row 0 as the header turns every one of these
  // into a wrong column or a wrong data point.
  const plate = [
    ["Plate 3 viability"],
    ["", "", "Treated", "", "Control", ""],
    ["Subject", "Day", "Mean", "SD", "Mean", "SD"],
    ["", "", "%", "%", "%", "%"],
    ["S1", 1, 95, 2, 88, 3],
    ["S2", 1, 96, 1, 90, 2],
    [],
    ["n = 8"],
  ]

  it("carries the merged group label across its span and folds in the unit row", () => {
    const plan = detectHeader(plate)
    expect(plan.startRow).toBe(1)
    expect(plan.rowCount).toBe(2)
    expect(plan.unitRow).toBe(3)
    expect(plan.columns).toEqual([
      "Subject",
      "Day",
      "Treated Mean (%)",
      "Treated SD (%)",
      "Control Mean (%)",
      "Control SD (%)",
    ])
    expect(plan.units).toEqual([null, null, "%", "%", "%", "%"])
  })

  it("keeps the data rows and leaves the footnote out", () => {
    const table = tableFromGrid(plate)
    expect(table.rows).toHaveLength(2)
    // The sheet's own row numbers still identify the points.
    expect(table.rows.map((r) => r.rowId)).toEqual(["row-5", "row-6"])
    expect(table.rows[0].values["Treated Mean (%)"]).toBe(95)
  })

  it("carries the unit through to the figure's y axis", () => {
    // The unit is folded into the column name precisely so the semantic layer
    // reads it with no further wiring.
    const spec = specFromTable(tableFromGrid(plate), meta)
    expect(spec.roles.find((r) => r.column === "Treated Mean (%)")?.unit).toBe("%")
  })

  it("lets the user override a header it read wrong", () => {
    const plan = detectHeader(plate, { startRow: 2, rowCount: 1, unitRow: false })
    expect(plan.columns).toEqual(["Subject", "Day", "Mean", "SD", "Mean", "SD"])
    expect(plan.unitRow).toBeNull()
    expect(plan.dataStart).toBe(3)
  })

  it("does not mistake a second header row for units", () => {
    // "Mean" and "SD" annotate a column but are not its unit, and parseUnit
    // already knows that; a second unit parser would have to learn it again.
    const plan = detectHeader([
      ["Dose", "Signal"],
      ["Mean", "SD"],
      [1, 2],
      [3, 4],
    ])
    expect(plan.unitRow).toBeNull()
    expect(plan.columns).toEqual(["Dose", "Signal"])
  })

  it("does not eat the first data row of a sheet with no numbers in it", () => {
    // Detection declines to guess here rather than risk swallowing real data.
    const table = tableFromGrid([
      ["Group", "Outcome"],
      ["Ctrl", "Yes"],
      ["Drug", "No"],
    ])
    expect(table.columns).toEqual(["Group", "Outcome"])
    expect(table.rows).toHaveLength(2)
  })

  it("keeps a trailing single-value row that no blank line separates", () => {
    // A footnote is fenced off by a blank row; a last reading is not.
    const table = tableFromGrid([
      ["Well", "OD"],
      ["A1", 0.5],
      ["A2", null],
    ])
    expect(table.rows).toHaveLength(2)
  })
})

describe("data version hash", () => {
  it("is stable for identical data", () => {
    expect(hashTable(unpaired)).toBe(hashTable(unpaired))
  })

  it("changes when a single cell changes", () => {
    // This is what makes a stored result detectably stale on reopen (§3A.3).
    const edited: Table = {
      ...unpaired,
      rows: unpaired.rows.map((r, i) =>
        i === 0 ? { ...r, values: { ...r.values, "Viability (%)": 999 } } : r
      ),
    }
    expect(hashTable(edited)).not.toBe(hashTable(unpaired))
  })

  it("changes when a column is renamed", () => {
    expect(hashTable({ ...unpaired, columns: ["Well", "Group", "Viability (%)"] })).not.toBe(
      hashTable(unpaired)
    )
  })
})

describe("the separator byte hashTable joins column names with", () => {
  it("is written as an escape, so the source stays a text file", () => {
    // A raw NUL byte in the source makes git treat bootstrap.ts as binary and
    // emit no diff for it at all, which is how a 10 KB change to this file
    // shipped unreviewable. The escape is the same code unit, so the hash is
    // unchanged; see the pinned value below.
    const src = readFileSync("lib/data-analysis/workspace/bootstrap.ts")
    expect(src.includes(0)).toBe(false)
  })

  it("is still NUL and not a space", () => {
    // A space would let adjacent names run together, so a rename that only
    // moves the boundary would hash the same and go undetected.
    const rows: Table["rows"] = [{ rowId: "r", values: { x: 1 } }]
    expect(hashTable({ columns: ["A B", "C"], rows })).not.toBe(
      hashTable({ columns: ["A", "B C"], rows })
    )
  })

  it("hashes a fixed table to the digits stored analyses were saved with", () => {
    // This is dataset.versionHash. Any change to the DIGITS reports drift on,
    // or detaches, every analysis already in the database. The label in front
    // of them changed once, from "sha256" to the function this actually is;
    // the digits below are the ones the old label carried, unchanged.
    expect(hashTable(unpaired)).toBe("fnv1a64:9cee431b12aaa0b7")
  })
})
