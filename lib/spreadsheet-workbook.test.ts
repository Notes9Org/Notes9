import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { isSpreadsheetFile, inferTabularFormatFromFileName, sniffTextDelimiter } from "./spreadsheet-workbook"

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

describe("sniffTextDelimiter (T0.2)", () => {
  it("picks tab for a tab-separated instrument export", () => {
    const text = "well\tsignal\tblank\nA1\t0.412\t0.03\nA2\t0.518\t0.03\n"
    expect(sniffTextDelimiter(text)).toBe("\t")
  })

  it("picks comma for comma-separated text", () => {
    expect(sniffTextDelimiter("a,b,c\n1,2,3\n4,5,6\n")).toBe(",")
  })

  it("picks semicolon for the European decimal-comma layout", () => {
    // The values themselves contain commas as decimal points, so a first-line
    // guess that counted commas would split every number in half.
    const text = "dose;response\n0,5;12,3\n1,0;24,8\n2,0;48,1\n"
    expect(sniffTextDelimiter(text)).toBe(";")
  })

  it("ignores a delimiter that only appears inside a quoted field", () => {
    // This is the case the old first-line guess got wrong: the header carries a
    // comma inside a label, and the file is really tab-separated.
    const text = '"Concentration, uM"\tresponse\n0.1\t12\n1.0\t44\n'
    expect(sniffTextDelimiter(text)).toBe("\t")
  })

  it("returns null for a genuinely single-column file", () => {
    // Nothing to split on. Forcing a delimiter here would invent columns.
    expect(sniffTextDelimiter("alpha\nbeta\ngamma\n")).toBeNull()
  })

  it("returns null for empty or whitespace-only input", () => {
    expect(sniffTextDelimiter("")).toBeNull()
    expect(sniffTextDelimiter("\n\n   \n")).toBeNull()
  })

  it("rejects a character whose count varies between rows", () => {
    // Commas appear, but inconsistently — they are prose, not structure. Tab is
    // consistent, so tab wins rather than the more frequent character.
    const text = "note\tvalue\nhello, world, again\t1\nbye\t2\n"
    expect(sniffTextDelimiter(text)).toBe("\t")
  })

  it("prefers the delimiter yielding more columns when several are consistent", () => {
    // Every line has one pipe and three tabs; tabs describe the real shape.
    const text = "a\tb\tc\td|x\n1\t2\t3\t4|y\n"
    expect(sniffTextDelimiter(text)).toBe("\t")
  })

  it("handles CRLF line endings", () => {
    expect(sniffTextDelimiter("a\tb\r\n1\t2\r\n")).toBe("\t")
  })

  it("treats an escaped double quote as content, not a field boundary", () => {
    const text = '"say ""hi"", ok"\tn\nfoo\t1\n'
    expect(sniffTextDelimiter(text)).toBe("\t")
  })
})
