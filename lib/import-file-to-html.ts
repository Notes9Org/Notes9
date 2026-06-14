import { sanitizeHtml, escapeHtml } from "@/lib/sanitize-html"
import { embedImagesInHtml } from "@/lib/embed-import-images"
import { linkImportedCitations } from "@/lib/import-citations"
import { markdownToHtml } from "@/lib/markdown-to-editor-html"
import { pdfFileToEditorHtml } from "@/lib/pdf-to-editor-html"

/**
 * Single source of truth for "turn an uploaded document into editor HTML",
 * shared by every rich-text surface (lab notes, protocols, reports, papers) so
 * imports behave identically everywhere. Handles PDF, Word (.docx), Markdown,
 * plain text, and HTML; preserves formatting and copies images inline.
 *
 * Spreadsheets are intentionally not handled here — they're inserted as a
 * dedicated editor node by the surfaces that support them.
 */

export type ImportKind = "pdf" | "docx" | "markdown" | "text" | "html" | "unknown"

/** File extensions accepted by the shared importer (for an <input accept="">). */
export const IMPORT_ACCEPT = ".pdf,.docx,.md,.markdown,.txt,.html,.htm"

export function importKindForFile(file: File): ImportKind {
  const n = file.name.toLowerCase()
  if (n.endsWith(".pdf")) return "pdf"
  if (n.endsWith(".docx")) return "docx"
  if (n.endsWith(".md") || n.endsWith(".markdown")) return "markdown"
  if (n.endsWith(".html") || n.endsWith(".htm")) return "html"
  if (n.endsWith(".txt")) return "text"
  return "unknown"
}

const DOCX_STYLE_MAP = [
  "u => u",
  "strike => s",
  "p[style-name='Title'] => h1:fresh",
  "p[style-name='Subtitle'] => h2:fresh",
  "p[style-name='Quote'] => blockquote:fresh",
  "p[style-name='Intense Quote'] => blockquote:fresh",
]

function textToParagraphsHtml(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((block) => {
      const inner = block
        .split("\n")
        .map((line) => escapeHtml(line))
        .join("<br>")
      return `<p>${inner || "<br>"}</p>`
    })
    .join("")
}

/**
 * Convert a supported file to sanitized editor HTML, or `null` for unsupported
 * types. The result is ready to drop straight into a TipTap editor.
 */
export async function importFileToEditorHtml(file: File): Promise<string | null> {
  let raw: string | null = null
  switch (importKindForFile(file)) {
    case "pdf":
      raw = await pdfFileToEditorHtml(file)
      break
    case "docx": {
      const mammoth = await import("mammoth")
      const arrayBuffer = await file.arrayBuffer()
      const { value } = await mammoth.convertToHtml({ arrayBuffer }, { styleMap: DOCX_STYLE_MAP })
      raw = await embedImagesInHtml(value)
      break
    }
    case "markdown": {
      const text = await file.text()
      raw = await embedImagesInHtml(await markdownToHtml(text))
      break
    }
    case "html": {
      raw = await embedImagesInHtml(await file.text())
      break
    }
    case "text":
      raw = textToParagraphsHtml(await file.text())
      break
    default:
      return null
  }
  if (raw == null) return null
  // Wire up any references section + inline [N] citations so they render as
  // proper, style-aware, source-linked citations.
  return sanitizeHtml(linkImportedCitations(raw))
}
