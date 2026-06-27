/**
 * Shared print / PDF HTML for lab notes and TipTap editor exports.
 * Preserves TipTap inline typography (font family, size, color) with Calibri
 * as the platform default when no explicit style is set on a text run.
 */

import { normalizeCodeInExportHtml } from "@/lib/export-code-blocks"
import {
  buildExportGoogleFontsLink,
  EXPORT_DEFAULT_FONT_STACK,
  prepareTypographyForExport,
} from "@/lib/export-formatting"
import { normalizeTablesInExportHtml } from "@/lib/export-table-normalize"
import { stripLayoutMarker } from "@/lib/page-layout"

export type PrintMarginsMm = {
  top: number
  bottom: number
  left: number
  right: number
}

const DEFAULT_MARGINS_MM: PrintMarginsMm = {
  top: 12.7,
  bottom: 12.7,
  left: 12.7,
  right: 12.7,
}

export function sanitizeExportHtml(html: string): string {
  return html
    .replace(/lab\([^)]+\)/gi, "#000000")
    .replace(/lch\([^)]+\)/gi, "#000000")
    .replace(/oklab\([^)]+\)/gi, "#000000")
    .replace(/oklch\([^)]+\)/gi, "#000000")
    .replace(/color-mix\([^)]+\)/gi, "#808080")
    .replace(/var\([^)]+\)/gi, "#000000")
}

/** Color-safe HTML plus table/code/typography suitable for Word/PDF/HTML/Markdown export. */
export function prepareHtmlForExport(html: string): string {
  return normalizeCodeInExportHtml(
    prepareTypographyForExport(
      normalizeTablesInExportHtml(sanitizeExportHtml(stripLayoutMarker(html)))
    )
  )
}

export function processCommentsForExport(html: string): {
  content: string
  comments: {
    id: string | null
    author: string | null
    content: string | null
    createdAt: string | null
    num: number
  }[]
} {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, "text/html")
  const comments: {
    id: string | null
    author: string | null
    content: string | null
    createdAt: string | null
    num: number
  }[] = []
  const commentMarks = doc.querySelectorAll("span[data-comment]")

  commentMarks.forEach((mark) => {
    const id = mark.getAttribute("data-id")
    const author = mark.getAttribute("data-author")
    const content = mark.getAttribute("data-content")
    const createdAt = mark.getAttribute("data-created-at")

    if (content) {
      const commentNum = comments.length + 1
      comments.push({ id, author, content, createdAt, num: commentNum })

      const sup = doc.createElement("sup")
      sup.textContent = `[${commentNum}]`
      sup.style.color = "#7c3aed"
      sup.style.fontWeight = "bold"
      sup.style.marginLeft = "2px"
      mark.appendChild(sup)
      ;(mark as HTMLElement).style.backgroundColor = "#f3e8ff"
      ;(mark as HTMLElement).style.borderRadius = "2px"
    }
  })

  return {
    content: doc.body.innerHTML,
    comments,
  }
}

/**
 * Shared content typography for all export targets (the print iframe and the
 * Paged.js renderer). Page-box layout (margins, header/footer placement) is added
 * separately by each caller; this is purely how the document body looks.
 */
const EXPORT_CONTENT_CSS = `
    [style*="font-family"], [style*="font-size"], [style*="color"] {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    h1 { font-size: 20pt; font-weight: 700; margin: 0 0 14pt; border-bottom: 1.5pt solid #333; padding-bottom: 8pt; }
    h2 { font-size: 15pt; font-weight: 600; margin: 16pt 0 8pt; border-bottom: 1pt solid #ccc; padding-bottom: 4pt; }
    h3 { font-size: 12pt; font-weight: 600; margin: 12pt 0 6pt; }
    p { margin: 0 0 9pt; }
    strong, b { font-weight: 700; }
    em, i { font-style: italic; }
    u { text-decoration: underline; }
    s, strike { text-decoration: line-through; }
    sub { vertical-align: sub; font-size: 0.8em; }
    sup { vertical-align: super; font-size: 0.8em; }
    a { color: #2563eb; text-decoration: underline; }
    ul, ol { margin: 6pt 0; padding-left: 1.4em; }
    li { margin: 3pt 0; }
    li > ul, li > ol { margin: 2pt 0; }
    ul { list-style-type: disc; }
    ol { list-style-type: decimal; }
    ul ul { list-style-type: circle; }
    ul ul ul { list-style-type: square; }
    ul[data-type="taskList"] { list-style: none; padding-left: 0; }
    ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 8px; }
    ul[data-type="taskList"] input[type="checkbox"] { margin-top: 4px; }
    blockquote {
      border-left: 4px solid #d1d5db;
      padding-left: 14px;
      margin: 10pt 0;
      color: #4b5563;
    }
    code {
      font-family: ui-monospace, monospace;
      font-size: 0.9em;
      background: #f3f4f6;
      padding: 2px 5px;
      border-radius: 3px;
    }
    pre {
      font-family: ui-monospace, Consolas, "Courier New", monospace;
      font-size: 9pt;
      background: #f3f4f6 !important;
      color: #111827 !important;
      padding: 12px;
      border-radius: 6px;
      margin: 10pt 0;
      white-space: pre-wrap;
      word-break: break-word;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    pre code, code, kbd {
      font-family: ui-monospace, Consolas, "Courier New", monospace;
      background: #f3f4f6 !important;
      color: #111827 !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    pre code { padding: 0; }
    p code, li code, td code, th code {
      padding: 2px 5px;
      border-radius: 3px;
    }
    table { border-collapse: collapse; width: 100% !important; table-layout: auto !important; margin: 10pt 0; font-size: 10pt; border: 1px solid #000; }
    th, td { border: 1px solid #000; padding: 8px 10px; text-align: left; vertical-align: top; width: auto !important; min-width: 0 !important; max-width: none !important; }
    th { background: #f3f4f6; font-weight: 700; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    tr:nth-child(even) { background: #fafafa; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    img { max-width: 100%; height: auto; margin: 6pt 0; }
    hr { border: none; border-top: 2px solid #e5e7eb; margin: 14pt 0; }
    [data-type="resizable-image"] img { display: inline-block; }
    .n9-columns { column-gap: 2rem; }
    .n9-columns > * { break-inside: avoid; }
    .n9-doc-header, .n9-doc-footer { color: #4b5563; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .n9-doc-header { border-bottom: 1px solid #d1d5db; padding: 6pt 4pt 8pt; margin-bottom: 12pt; }
    .n9-doc-footer { border-top: 1px solid #d1d5db; padding: 8pt 4pt 6pt; margin-top: 12pt; }
    .n9-page-break { height: 0; border: 0; page-break-after: always; break-after: page; }
    .table-col-handle, .table-row-handle, .table-diag-handle { display: none !important; }
    .simple-shape-node { margin: 8pt 0; }
    .comments-section { margin-top: 32pt; border-top: 1pt solid #eee; padding-top: 16pt; }
    .comments-title { font-size: 13pt; font-weight: 700; margin-bottom: 12pt; color: #333; }
    .comment-item { margin-bottom: 10pt; font-size: 10pt; line-height: 1.4; }
    .comment-header { font-weight: 700; margin-bottom: 2pt; display: flex; gap: 8pt; flex-wrap: wrap; }
    .comment-author { color: #7c3aed; }
    .comment-date { color: #666; font-weight: 400; font-size: 9pt; }
    .comment-content { color: #444; }
`

/** Escape a string for safe use inside a CSS `content: "..."` value. */
function cssStringEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}

/**
 * Build the content + stylesheet for the Paged.js renderer. Paged.js lays the
 * document into real page boxes and renders the header/footer + page numbers into
 * the @page margin boxes (which browsers ignore on their own) — giving true
 * "Page X of Y" running footers with NO browser date/URL chrome. The header/footer
 * are NOT in the body flow; they live entirely in the @page margin boxes.
 */
export function buildPagedExportAssets(options: {
  bodyHtml: string
  marginsMm?: Partial<PrintMarginsMm>
  orientation?: "portrait" | "landscape"
  header?: { text: string; align: "left" | "center" | "right" }
  footer?: { text: string; align: "left" | "center" | "right" }
  pageNumbers?: "header" | "footer" | "none"
  commentsBlockHtml?: string
}): { contentHtml: string; css: string } {
  const margins: PrintMarginsMm = { ...DEFAULT_MARGINS_MM, ...options.marginsMm }
  const pageSize = options.orientation === "landscape" ? "landscape" : "portrait"
  const header = options.header ?? { text: "", align: "left" }
  const footer = options.footer ?? { text: "", align: "center" }

  // Compose a margin-box `content` value: optional text, optional "N / M" counter.
  const boxContent = (text: string, withNumber: boolean): string => {
    const t = text.trim()
    const parts: string[] = []
    if (t) parts.push(`"${cssStringEscape(t)}"`)
    if (withNumber) {
      if (t) parts.push(`"  •  "`)
      parts.push(`counter(page) " / " counter(pages)`)
    }
    return parts.join(" ")
  }
  const edgeBox = (align: "left" | "center" | "right", edge: "top" | "bottom", content: string): string => {
    if (!content) return ""
    const where = align === "center" ? "center" : align === "right" ? "right" : "left"
    return `@${edge}-${where} { content: ${content}; font-family: ${EXPORT_DEFAULT_FONT_STACK}; font-size: 9pt; color: #6b7280; }`
  }

  const headerBox = edgeBox(header.align, "top", boxContent(header.text, options.pageNumbers === "header"))
  const footerBox = edgeBox(footer.align, "bottom", boxContent(footer.text, options.pageNumbers === "footer"))

  const css = `
    @page {
      size: ${pageSize};
      margin: ${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm;
      ${headerBox}
      ${footerBox}
    }
    html, body { margin: 0; padding: 0; background: #fff; }
    body {
      font-family: ${EXPORT_DEFAULT_FONT_STACK};
      font-size: 12pt;
      line-height: 1.6;
      color: #1a1a1a;
    }
    ${EXPORT_CONTENT_CSS}
  `
  const contentHtml = `${options.bodyHtml}${options.commentsBlockHtml ?? ""}`
  return { contentHtml, css }
}

export function buildPrintDocumentHtml(options: {
  title: string
  bodyHtml: string
  marginsMm?: Partial<PrintMarginsMm>
  /** Page orientation for the printed/PDF page box. */
  orientation?: "portrait" | "landscape"
  /** Deprecated/ignored: kept for callers. Auto page numbers need an @page margin
   *  box, which is incompatible with the clean (margin:0) model used here. */
  pageNumbers?: "header" | "footer" | "none"
  /** Deprecated/ignored: the title is no longer rendered at the top of the doc. */
  includeTitleHeading?: boolean
  commentsBlockHtml?: string
}): string {
  const margins: PrintMarginsMm = {
    ...DEFAULT_MARGINS_MM,
    ...options.marginsMm,
  }
  const pageSize = options.orientation === "landscape" ? "landscape" : "portrait"
  const safeTitle = escapeHtml((options.title || "Document").trim() || "Document")
  // Pull document header/footer out of the flow so they can repeat on every page.
  const { header, footer, body } = splitHeaderFooter(options.bodyHtml)
  // No title heading / running title is rendered — the document content stands on
  // its own (the title duplicated against the browser/page chrome).
  const headerHtml = header ? `<div class="print-running-header">${header}</div>` : ""
  const footerHtml = footer ? `<div class="print-running-footer">${footer}</div>` : ""
  // Margins are produced by a thead/tfoot table that repeats a top/bottom spacer on
  // every page (left/right come from body padding). Combined with `@page{margin:0}`
  // this gives clean per-page margins WITHOUT the browser's print header/footer
  // (date, document title, URL) — those only render when @page has a margin.
  const inner = `<table class="print-paged"><thead><tr><td><div class="print-mtop">${headerHtml}</div></td></tr></thead><tbody><tr><td>${body}${
    options.commentsBlockHtml ?? ""
  }</td></tr></tbody><tfoot><tr><td><div class="print-mbottom">${footerHtml}</div></td></tr></tfoot></table>`

  const googleFonts = buildExportGoogleFontsLink(options.bodyHtml)

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${safeTitle}</title>
  ${googleFonts}
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    /* margin:0 hides the browser's print header/footer (date, title, URL). The page
       margins are recreated by the .print-mtop/.print-mbottom spacers + body padding. */
    @page { size: ${pageSize}; margin: 0; }
    body {
      font-family: ${EXPORT_DEFAULT_FONT_STACK};
      font-size: 12pt;
      /* Match the on-screen Page view rhythm (line-height 1.6, 0.75rem para gap). */
      line-height: 1.6;
      padding: 0 ${margins.right}mm 0 ${margins.left}mm;
      background: #fff;
      color: #1a1a1a;
      max-width: 100%;
    }
    /* Per-page vertical margins: thead/tfoot repeat on every printed page. */
    .print-mtop { height: ${margins.top}mm; }
    .print-mbottom { height: ${margins.bottom}mm; }
    ${EXPORT_CONTENT_CSS}
    /* Running header/footer: thead/tfoot repeat on every printed page */
    table.print-paged { width: 100%; border-collapse: collapse; border: 0; margin: 0; }
    table.print-paged > thead { display: table-header-group; }
    table.print-paged > tfoot { display: table-footer-group; }
    table.print-paged > thead td, table.print-paged > tbody td, table.print-paged > tfoot td { border: 0; padding: 0; vertical-align: top; }
    .print-mtop, .print-mbottom { display: flex; align-items: center; width: 100%; }
    .print-running-header, .print-running-footer { width: 100%; color: #4b5563; font-size: 0.92em; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @media print {
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  ${inner}
</body>
</html>`
}

/** Remove the document header/footer from the body and return their inner HTML. */
export function splitHeaderFooter(html: string): { header: string; footer: string; body: string } {
  if (typeof DOMParser === "undefined") return { header: "", footer: "", body: html }
  const doc = new DOMParser().parseFromString(html, "text/html")
  const h = doc.querySelector('[data-type="docHeader"]')
  const f = doc.querySelector('[data-type="docFooter"]')
  const header = h ? h.innerHTML : ""
  const footer = f ? f.innerHTML : ""
  h?.remove()
  f?.remove()
  return { header, footer, body: doc.body.innerHTML }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export function buildCommentsSectionHtml(
  comments: { num: number; author: string | null; content: string | null; createdAt: string | null }[]
): string {
  if (comments.length === 0) return ""
  return `
    <div class="comments-section">
      <h2 class="comments-title">Comments</h2>
      ${comments
        .map(
          (c) => `
        <div class="comment-item">
          <div class="comment-header">
            <span class="comment-number">[${c.num}]</span>
            <span class="comment-author">${escapeHtml(c.author || "Unknown")}</span>
            <span class="comment-date">${c.createdAt ? escapeHtml(new Date(Number(c.createdAt)).toLocaleString()) : ""}</span>
          </div>
          <div class="comment-content">${escapeHtml(c.content || "")}</div>
        </div>`
        )
        .join("")}
    </div>`
}

/** Open browser print dialog with isolated iframe (caller appends/removes iframe). */
export function writePrintIframeDocument(
  iframeDoc: Document,
  html: string,
  documentTitle: string
): void {
  iframeDoc.open()
  iframeDoc.write(html)
  iframeDoc.close()
  iframeDoc.title = documentTitle
}
