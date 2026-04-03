/**
 * Shared print / PDF HTML for lab notes and TipTap editor exports.
 * Uses platform-aligned typography (Work Sans body, Space Grotesk headings).
 */

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

function mmToCss(mm: PrintMarginsMm): string {
  const f = (n: number) => `${n}mm`
  return `${f(mm.top)} ${f(mm.right)} ${f(mm.bottom)} ${f(mm.left)}`
}

export function buildPrintDocumentHtml(options: {
  title: string
  bodyHtml: string
  marginsMm?: Partial<PrintMarginsMm>
  /** When true, prepend an h1 from title (lab notes style). */
  includeTitleHeading?: boolean
  commentsBlockHtml?: string
}): string {
  const margins: PrintMarginsMm = {
    ...DEFAULT_MARGINS_MM,
    ...options.marginsMm,
  }
  const marginCss = mmToCss(margins)
  const safeTitle = escapeHtml((options.title || "Document").trim() || "Document")
  const inner = options.includeTitleHeading
    ? `<h1 class="print-document-title">${safeTitle}</h1>${options.bodyHtml}`
    : options.bodyHtml

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${safeTitle}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&family=Work+Sans:ital,wght@0,400;0,600;0,700;1,400&display=swap" rel="stylesheet" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @page { margin: ${marginCss}; }
    body {
      font-family: "Work Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 11pt;
      line-height: 1.55;
      padding: ${marginCss};
      background: #fff;
      color: #1a1a1a;
      max-width: 100%;
    }
    h1, h2, h3, h4, h5, h6 {
      font-family: "Space Grotesk", "Work Sans", sans-serif;
    }
    h1 { font-size: 20pt; font-weight: 700; margin: 0 0 14pt; border-bottom: 1.5pt solid #333; padding-bottom: 8pt; }
    h1.print-document-title {
      page-break-after: avoid;
      break-after: avoid-page;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    h2 { font-size: 15pt; font-weight: 600; margin: 16pt 0 8pt; border-bottom: 1pt solid #ccc; padding-bottom: 4pt; }
    h3 { font-size: 12pt; font-weight: 600; margin: 12pt 0 6pt; }
    p { margin: 6pt 0; }
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
      font-family: ui-monospace, monospace;
      font-size: 9pt;
      background: #1f2937;
      color: #e5e7eb;
      padding: 12px;
      border-radius: 6px;
      margin: 10pt 0;
      white-space: pre-wrap;
      word-break: break-word;
    }
    pre code { background: none; color: inherit; padding: 0; }
    table { border-collapse: collapse; width: 100%; margin: 10pt 0; font-size: 10pt; border: 1px solid #000; }
    th, td { border: 1px solid #000; padding: 8px 10px; text-align: left; vertical-align: top; }
    th { background: #f3f4f6; font-weight: 700; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    tr:nth-child(even) { background: #fafafa; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    img { max-width: 100%; height: auto; margin: 6pt 0; }
    hr { border: none; border-top: 2px solid #e5e7eb; margin: 14pt 0; }
    .table-col-handle, .table-row-handle, .table-diag-handle { display: none !important; }
    .simple-shape-node { margin: 8pt 0; }
    .comments-section { margin-top: 32pt; border-top: 1pt solid #eee; padding-top: 16pt; }
    .comments-title { font-size: 13pt; font-weight: 700; margin-bottom: 12pt; color: #333; }
    .comment-item { margin-bottom: 10pt; font-size: 10pt; line-height: 1.4; }
    .comment-header { font-weight: 700; margin-bottom: 2pt; display: flex; gap: 8pt; flex-wrap: wrap; }
    .comment-author { color: #7c3aed; }
    .comment-date { color: #666; font-weight: 400; font-size: 9pt; }
    .comment-content { color: #444; }
    @media print {
      body { padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  ${inner}
  ${options.commentsBlockHtml ?? ""}
</body>
</html>`
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
