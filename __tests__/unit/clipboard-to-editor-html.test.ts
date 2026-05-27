import { describe, expect, it } from "vitest"
import {
  isEditorNativeClipboardHtml,
  resolveClipboardPaste,
  stripClipboardHtmlWrapper,
} from "@/lib/clipboard-to-editor-html"

describe("stripClipboardHtmlWrapper", () => {
  it("extracts StartFragment body content", () => {
    const wrapped =
      '<!DOCTYPE html><html><body><!--StartFragment--><p>Hello</p><!--EndFragment--></body></html>'
    expect(stripClipboardHtmlWrapper(wrapped)).toContain("<p>Hello</p>")
  })
})

describe("isEditorNativeClipboardHtml", () => {
  it("detects task list markup from the editor", () => {
    expect(
      isEditorNativeClipboardHtml('<ul data-type="taskList"><li data-type="taskItem">x</li></ul>'),
    ).toBe(true)
  })

  it("returns false for ChatGPT-style HTML", () => {
    expect(isEditorNativeClipboardHtml('<div data-start="1"><p>Hi</p></div>')).toBe(false)
  })
})

describe("resolveClipboardPaste", () => {
  const markdownPlain = `# Title

- item one
- item two

\`\`\`js
const x = 1
\`\`\`
`

  const syntheticHtml = "<html><body><div><p>flattened</p></div></body></html>"

  it("prefers markdown plain text when html is also present", async () => {
    const out = await resolveClipboardPaste({
      html: syntheticHtml,
      plain: markdownPlain,
    })
    expect(out).not.toBeNull()
    expect(out).toMatch(/<h1[^>]*>.*Title/i)
    expect(out).toContain("<ul")
    expect(out).toMatch(/<pre><code/i)
  })

  it("handles ChatGPT-style fragment html with markdown plain", async () => {
    const chatHtml =
      '<!--StartFragment--><div data-start="0"><h1>Title</h1><ul><li>item</li></ul></div><!--EndFragment-->'
    const out = await resolveClipboardPaste({
      html: chatHtml,
      plain: "# Title\n\n- item one",
    })
    expect(out).toContain("<h1")
    expect(out).toContain("<ul")
  })

  it("converts html-only bold and list snippets", async () => {
    const out = await resolveClipboardPaste({
      html: "<p><strong>Bold</strong></p><ul><li>Alpha</li><li>Beta</li></ul>",
      plain: "",
    })
    expect(out).not.toBeNull()
    expect(out).toMatch(/<strong>Bold<\/strong>/i)
    expect(out).toContain("<ul")
    expect(out).toContain("<li>")
  })

  it("returns null for empty clipboard", async () => {
    expect(await resolveClipboardPaste({ html: "", plain: "   " })).toBeNull()
  })

  it("returns null for editor-native html so TipTap default paste runs", async () => {
    expect(
      await resolveClipboardPaste({
        html: '<p data-latex="x^2">math</p>',
        plain: "fallback",
      }),
    ).toBeNull()
  })

  it("converts plain paragraphs without markdown markers", async () => {
    const out = await resolveClipboardPaste({
      html: "",
      plain: "Line one\n\nLine two",
    })
    expect(out).not.toBeNull()
    expect(out).toMatch(/Line one/i)
    expect(out).toMatch(/Line two/i)
  })
})
