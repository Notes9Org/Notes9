import { describe, expect, it } from "vitest"
import {
  extractCodePlainText,
  isLightHexColor,
  normalizeCodeInExportHtml,
} from "./export-code-blocks"

describe("normalizeCodeInExportHtml", () => {
  it("strips light text color from code spans", () => {
    const html =
      '<pre><code><span style="color: #e5e7eb">const x = 1</span></code></pre>'
    const out = normalizeCodeInExportHtml(html)
    expect(out).not.toMatch(/color:\s*#e5e7eb/i)
    expect(out).toContain("const x = 1")
  })
})

describe("extractCodePlainText", () => {
  it("preserves line breaks from br tags", () => {
    const doc = new DOMParser().parseFromString(
      "<pre><code>line1<br>line2</code></pre>",
      "text/html"
    )
    const pre = doc.querySelector("pre")!
    expect(extractCodePlainText(pre)).toBe("line1\nline2")
  })
})

describe("isLightHexColor", () => {
  it("detects light grays", () => {
    expect(isLightHexColor("#e5e7eb")).toBe(true)
    expect(isLightHexColor("#111827")).toBe(false)
  })
})
