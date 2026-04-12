import { marked } from "marked"

/**
 * Markdown → HTML for clipboard `text/html` so apps like TipTap paste structured content
 * (headings, lists, bold, etc.) instead of a single plain paragraph.
 */
export function markdownToClipboardHtml(markdown: string): string {
  const src = markdown.trim()
  if (!src) return "<p></p>"
  try {
    const out = marked(src, { async: false, gfm: true, breaks: true })
    if (typeof out !== "string") {
      return "<p></p>"
    }
    return out
  } catch {
    return fallbackPlainToHtml(src)
  }
}

function fallbackPlainToHtml(s: string): string {
  const esc = (t: string) =>
    t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  return s
    .split(/\n\n+/)
    .map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("")
}

const HTML_CLIPBOARD_WRAPPER = (body: string) =>
  `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><!--StartFragment-->${body}<!--EndFragment--></body></html>`

/**
 * Writes both `text/plain` (Markdown) and `text/html` (rendered) so pasting into TipTap
 * keeps formatting. Falls back to plain text only when the Clipboard API cannot write HTML.
 */
export async function copyMarkdownForRichPaste(markdownPlain: string): Promise<void> {
  const html = markdownToClipboardHtml(markdownPlain)
  const htmlFull = HTML_CLIPBOARD_WRAPPER(html)

  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": new Blob([markdownPlain], { type: "text/plain" }),
          "text/html": new Blob([htmlFull], { type: "text/html" }),
        }),
      ])
      return
    } catch {
      /* fall through */
    }
  }

  await navigator.clipboard.writeText(markdownPlain)
}
