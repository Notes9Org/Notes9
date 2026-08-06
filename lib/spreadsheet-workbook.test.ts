import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { isSpreadsheetFile, inferTabularFormatFromFileName } from "./spreadsheet-workbook"

const named = (name: string) => new File([""], name, { type: "" })

/**
 * `isSpreadsheetFile` is not a data-analysis helper: it gates the experiment
 * file upload dialog for the whole ELN, deciding whether an uploaded file is
 * parsed into a workbook and stored with `tabular_format` "csv". Widening it
 * reaches every upload in the product.
 */
describe("isSpreadsheetFile", () => {
  it("does not claim plain text files", () => {
    expect(isSpreadsheetFile(named("protocol-notes.txt"))).toBe(false)
    expect(isSpreadsheetFile(named("instrument-export.tsv"))).toBe(false)
  })

  it("still claims real spreadsheets", () => {
    for (const n of ["plate.xlsx", "plate.xls", "plate.csv", "PLATE.CSV"]) {
      expect(isSpreadsheetFile(named(n))).toBe(true)
    }
  })

  it("matches the copy inlined in the lab-note editor", () => {
    // tiptap-editor.tsx repeats this predicate verbatim to keep the ~1 MB xlsx
    // module out of its drag/paste path. The two are only safe while they say
    // the same thing: when they disagree, the editor and the upload dialog
    // disagree about what a spreadsheet is.
    const extensions = (source: string) => {
      const from = source.indexOf("function isSpreadsheetFile")
      const body = source.slice(from, source.indexOf("\n}", from))
      return [...body.matchAll(/endsWith\("(\.[a-z]+)"\)/g)].map((m) => m[1]).sort()
    }
    const here = extensions(readFileSync("lib/spreadsheet-workbook.ts", "utf8"))
    const editor = extensions(readFileSync("components/text-editor/tiptap-editor.tsx", "utf8"))
    expect(here).toEqual([".csv", ".xls", ".xlsx"])
    expect(editor).toEqual(here)
  })
})

/**
 * A non-null return here is a licence to overwrite the stored file. The
 * workbook POST route persists it into `experiment_data.tabular_format` with no
 * file-type guard of its own, and two things downstream read that column as
 * permission: `isTabularExperimentFile` short-circuits on it (so the row opens
 * in the EDITABLE spreadsheet dialog), and the PATCH route's `sync_storage`
 * branch re-serialises the snapshot and uploads it over the original bytes.
 * So widening this predicate is not cosmetic: for a `.txt` row it means one
 * save in that dialog replaces the user's text file with a CSV rendering.
 */
describe("inferTabularFormatFromFileName", () => {
  it("does not claim plain text files", () => {
    // These parse fine for read-only analysis without a format: the analysis
    // workspace gets its grid from `readSpreadsheetWorkbook`, which handles the
    // separator itself and never consults this function.
    expect(inferTabularFormatFromFileName("protocol-notes.txt")).toBeNull()
    expect(inferTabularFormatFromFileName("instrument-export.tsv")).toBeNull()
  })

  it("still claims real spreadsheets", () => {
    expect(inferTabularFormatFromFileName("plate.csv")).toBe("csv")
    expect(inferTabularFormatFromFileName("PLATE.CSV")).toBe("csv")
    expect(inferTabularFormatFromFileName("plate.xlsx")).toBe("xlsx")
    expect(inferTabularFormatFromFileName("plate.xls")).toBe("xls")
  })
})
