import { describe, it, expect } from "vitest"
import { resultsSheetToCsv, resultsSheetToMarkdown } from "./results-sheet-text"

/**
 * A miniature of the real sheet's shape: section headings as lone cells, blank
 * spacer rows between sub-tables, and sub-tables of differing widths. Anything
 * that assumes "row 0 is the header and every row is the same length" breaks on
 * this, which is the point.
 */
const SHEET = [
  ["Two-way ANOVA"],
  [],
  ["Term", "F", "p"],
  ["Treatment", 12.4, 0.0003],
  ["Time", 1.02, 0.412],
  [],
  ["Excluded rows"],
  ["Row", "Reason"],
  ["row-7", "Statistical outlier (Grubbs alpha=0.01)"],
]

describe("resultsSheetToCsv", () => {
  it("pads every row to the widest, so the CSV is rectangular", () => {
    const lines = resultsSheetToCsv(SHEET).split("\r\n")
    const widths = new Set(lines.map((l) => l.split(",").length))
    expect(widths.size).toBe(1)
    expect([...widths][0]).toBe(3)
  })

  it("uses CRLF and keeps numbers unquoted and unrounded", () => {
    const csv = resultsSheetToCsv(SHEET)
    expect(csv).toContain("\r\n")
    expect(csv).toContain("Treatment,12.4,0.0003")
  })

  it("quotes fields containing a comma, a quote or a newline (RFC 4180)", () => {
    const csv = resultsSheetToCsv([
      ["plain", "has,comma", 'has"quote', "has\nnewline"],
    ])
    expect(csv).toBe('plain,"has,comma","has""quote","has\nnewline"')
  })

  it("renders null as an empty field, not as the string null", () => {
    expect(resultsSheetToCsv([["a", null, 0]])).toBe("a,,0")
  })

  it("survives an empty sheet", () => {
    expect(resultsSheetToCsv([])).toBe("")
  })
})

describe("resultsSheetToMarkdown", () => {
  const md = resultsSheetToMarkdown(SHEET, { title: "Assay 4" })

  it("titles the document and turns lone-cell rows into headings", () => {
    expect(md).toContain("# Assay 4")
    expect(md).toContain("### Two-way ANOVA")
    expect(md).toContain("### Excluded rows")
  })

  it("starts a new GFM table after each blank row instead of one giant table", () => {
    // Two sub-tables => exactly two separator rows.
    const separators = md.split("\n").filter((l) => /^\|\s*---/.test(l))
    expect(separators).toHaveLength(2)
    expect(md).toContain("| Term | F | p |")
    expect(md).toContain("| Row | Reason |")
  })

  it("keeps the numbers byte-identical to the sheet", () => {
    expect(md).toContain("| Treatment | 12.4 | 0.0003 |")
    expect(md).toContain("| Time | 1.02 | 0.412 |")
  })

  it("escapes pipes and backslashes so a cell cannot break the table", () => {
    const out = resultsSheetToMarkdown([
      ["a", "b"],
      ["p|q", "c:\\path"],
    ])
    expect(out).toContain("| p\\|q | c:\\\\path |")
  })

  it("flattens a newline inside a cell rather than emitting a broken row", () => {
    const out = resultsSheetToMarkdown([["a", "b"], ["one\ntwo", "x"]])
    expect(out).toContain("| one two | x |")
    expect(out.split("\n").filter((l) => l.startsWith("|"))).toHaveLength(3)
  })

  it("survives an empty sheet", () => {
    expect(resultsSheetToMarkdown([])).toBe("\n")
  })
})

describe("the three formats agree", () => {
  it("CSV and Markdown carry the same values as the sheet they were built from", () => {
    const csv = resultsSheetToCsv(SHEET)
    const markdown = resultsSheetToMarkdown(SHEET)
    for (const cell of SHEET.flat()) {
      if (cell === null || cell === undefined) continue
      expect(csv).toContain(String(cell))
      // `|` is escaped in Markdown, so compare on the values that have none.
      if (!String(cell).includes("|")) expect(markdown).toContain(String(cell))
    }
  })
})
