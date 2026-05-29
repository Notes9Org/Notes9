import { describe, expect, it } from "vitest"
import { htmlToDiffPlainText } from "./content-diff-plain-text"

describe("htmlToDiffPlainText", () => {
  it("includes inline math LaTeX from data-latex attributes", () => {
    const before = "<p>Before calculation</p>"
    const after =
      '<p>Before calculation <span data-type="inline-math" data-latex="\\frac{1\\ \\mathrm{mol}}{1\\ \\mathrm{L}}"></span></p>'

    expect(htmlToDiffPlainText(before)).toBe("Before calculation")
    expect(htmlToDiffPlainText(after)).toContain(
      "[math: \\frac{1\\ \\mathrm{mol}}{1\\ \\mathrm{L}}]"
    )
    expect(htmlToDiffPlainText(before)).not.toBe(htmlToDiffPlainText(after))
  })

  it("includes block math LaTeX from data-latex attributes", () => {
    const html =
      '<div data-type="block-math" data-latex="E=mc^2"><span data-type="block-math" data-latex="E=mc^2"></span></div>'
    expect(htmlToDiffPlainText(html)).toContain("[math block: E=mc^2]")
  })

  it("decodes HTML entities in data-latex", () => {
    const html =
      '<p><span data-type="inline-math" data-latex="a&amp;lt;b"></span></p>'
    expect(htmlToDiffPlainText(html)).toContain("[math: a\\lt b]")
  })

  it("still strips regular HTML tags to plain text", () => {
    const html = "<p>Hello <strong>world</strong></p>"
    expect(htmlToDiffPlainText(html)).toBe("Hello world")
  })

  it("preserves paragraph breaks as newlines", () => {
    const html = "<p>First paragraph</p><p>Second paragraph</p>"
    expect(htmlToDiffPlainText(html)).toBe("First paragraph\nSecond paragraph")
  })

  it("includes image embed tokens", () => {
    const html =
      '<div data-type="resizable-image" data-align="center"><img src="x" alt="gel lane" /></div>'
    expect(htmlToDiffPlainText(html)).toContain("[image: gel lane]")
  })
})
