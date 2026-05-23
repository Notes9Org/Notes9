import { describe, expect, it } from "vitest"
import {
  countTableColumns,
  normalizeTablesInExportHtml,
} from "./export-table-normalize"

describe("normalizeTablesInExportHtml", () => {
  it("strips narrow pixel widths from table and cells", () => {
    const html =
      '<table style="width: 420px"><tr><th style="width: 75px">A</th><td style="width: 50px">B</td></tr></table>'
    const out = normalizeTablesInExportHtml(html)
    expect(out).not.toMatch(/width:\s*420px/i)
    expect(out).not.toMatch(/width:\s*75px/i)
    expect(out).not.toMatch(/width:\s*50px/i)
    expect(out).toMatch(/width:\s*100%/i)
  })

  it("removes width/height attributes on cells", () => {
    const html = '<table width="300"><tr><td width="40" height="20">x</td></tr></table>'
    const out = normalizeTablesInExportHtml(html)
    expect(out).not.toMatch(/\bwidth="300"/i)
    expect(out).not.toMatch(/\bwidth="40"/i)
    expect(out).not.toMatch(/\bheight="20"/i)
  })
})

describe("countTableColumns", () => {
  it("counts colspan", () => {
    const doc = new DOMParser().parseFromString(
      '<table><tr><th colspan="2">H</th><td>C</td></tr></table>',
      "text/html"
    )
    const table = doc.querySelector("table")!
    expect(countTableColumns(table)).toBe(3)
  })
})
