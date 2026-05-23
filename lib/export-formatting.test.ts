import { describe, expect, it } from "vitest"
import {
  applyDefaultTypographyToBareTextNodes,
  mergeNestedSpanStylesForExport,
  parseCssFontFamily,
  parseCssFontSizeToHalfPoints,
  parseStyleAttr,
} from "./export-formatting"

describe("export-formatting", () => {
  it("parses font-family and font-size from style", () => {
    const s = parseStyleAttr("font-family: Arial, sans-serif; font-size: 18px; color: #2563eb")
    expect(s.font).toBe("Arial")
    expect(s.size).toBe(parseCssFontSizeToHalfPoints("18px"))
    expect(s.color).toBe("2563eb")
  })

  it("merges nested span styles", () => {
    const html =
      '<p><span style="font-family: Georgia, serif"><span style="font-size: 20px">Hello</span></span></p>'
    const out = mergeNestedSpanStylesForExport(html)
    const inner = out.match(/<span[^>]*>Hello<\/span>/)?.[0] ?? ""
    expect(inner).toMatch(/font-family:\s*Georgia/i)
    expect(inner).toMatch(/font-size:\s*20px/i)
  })

  it("wraps bare text with default Calibri stack", () => {
    const html = "<p>Plain paragraph</p>"
    const out = applyDefaultTypographyToBareTextNodes(html)
    expect(out).toMatch(/font-family:\s*Calibri/i)
    expect(out).toMatch(/font-size:\s*16px/i)
  })

  it("parseCssFontFamily takes first face", () => {
    expect(parseCssFontFamily("'Times New Roman', Times, serif")).toBe("Times New Roman")
  })
})
