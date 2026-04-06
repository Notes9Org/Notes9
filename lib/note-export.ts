"use client"

import { toast } from "sonner"
import {
  buildCommentsSectionHtml,
  buildPrintDocumentHtml,
  processCommentsForExport,
  sanitizeExportHtml,
  writePrintIframeDocument,
} from "@/lib/print-export"

export type NoteExportToastHandlers = {
  success: typeof toast.success
  error: typeof toast.error
}

const defaultToasts: NoteExportToastHandlers = {
  success: toast.success,
  error: toast.error,
}

export async function exportNoteAsMarkdown(html: string, title: string, toasts = defaultToasts) {
  try {
    // @ts-expect-error — turndown ships without bundled types
    const TurndownService = (await import("turndown")).default
    // @ts-expect-error — plugin ships without types
    const { gfm } = await import("turndown-plugin-gfm")

    const turndownService = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
      bulletListMarker: "-",
    })
    turndownService.use(gfm)

    const markdown = turndownService.turndown(html)
    const blob = new Blob([markdown], { type: "text/markdown" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${title || "note"}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toasts.success("Markdown exported", { description: "File downloaded." })
  } catch (e: unknown) {
    console.error(e)
    toasts.error("Export failed", { description: "Could not export Markdown." })
  }
}

export function exportNoteAsHtml(html: string, title: string) {
  const safeTitle = title || "note"
  const fullHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${safeTitle}</title>
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&family=Work+Sans:ital,wght@0,400;0,600;0,700;1,400&display=swap" rel="stylesheet" />
  <style>
    body { font-family: "Work Sans", system-ui, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; line-height: 1.6; color: #1a1a1a; }
    h1, h2, h3 { font-family: "Space Grotesk", "Work Sans", sans-serif; margin-top: 1.2em; }
    code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; }
    pre { background: #f4f4f4; padding: 15px; border-radius: 5px; overflow-x: auto; }
    blockquote { border-left: 4px solid #ddd; margin: 0; padding-left: 20px; color: #666; }
    table { border-collapse: collapse; width: 100%; margin: 20px 0; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background: #f4f4f4; }
  </style>
</head>
<body>
  <h1>${safeTitle}</h1>
  ${html}
</body>
</html>`
  const blob = new Blob([fullHTML], { type: "text/html" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${safeTitle}.html`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export async function exportNoteAsPdfFromHtml(
  html: string,
  title: string,
  options?: {
    includeComments?: boolean
    marginsMm?: { top: number; bottom: number; left: number; right: number }
    toasts?: NoteExportToastHandlers
  }
) {
  const toasts = options?.toasts ?? defaultToasts
  let iframe: HTMLIFrameElement | null = null
  try {
    toasts.success("Generating PDF", { description: "Opening print dialog…" })

    iframe = document.createElement("iframe")
    iframe.setAttribute("aria-hidden", "true")
    /* 0×0 iframes break print layout in some browsers (first block / title missing). Lay out at letter size, off-screen. */
    iframe.style.cssText = [
      "position:fixed",
      "top:0",
      "left:0",
      "width:8.5in",
      "min-height:11in",
      "border:0",
      "margin:0",
      "opacity:0",
      "pointer-events:none",
      "z-index:-1",
    ].join(";")
    document.body.appendChild(iframe)

    await new Promise((r) => setTimeout(r, 80))

    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document
    if (!iframeDoc) throw new Error("Could not access iframe document")

    let bodyHtml = html
    let commentsHtml = ""
    if (options?.includeComments) {
      const { content, comments } = processCommentsForExport(html)
      bodyHtml = sanitizeExportHtml(content)
      commentsHtml = buildCommentsSectionHtml(comments)
    } else {
      bodyHtml = sanitizeExportHtml(html)
    }

    const docTitle = (title || "").trim() || "Document"
    const fullHtml = buildPrintDocumentHtml({
      title: docTitle,
      bodyHtml,
      includeTitleHeading: true,
      commentsBlockHtml: commentsHtml,
      marginsMm: options?.marginsMm,
    })

    writePrintIframeDocument(iframeDoc, fullHtml, docTitle)

    await new Promise((r) => setTimeout(r, 150))
    iframe.contentWindow?.focus()
    iframe.contentWindow?.print()

    toasts.success("Print dialog opened", { description: "Save as PDF from your browser." })
    setTimeout(() => {
      if (iframe && document.body.contains(iframe)) document.body.removeChild(iframe)
    }, 2000)
  } catch (e: unknown) {
    console.error(e)
    if (iframe && document.body.contains(iframe)) document.body.removeChild(iframe)
    toasts.error("Export failed", {
      description: e instanceof Error ? e.message : "Failed to export PDF.",
    })
  }
}

export async function exportNoteAsDocx(html: string, title: string, toasts = defaultToasts) {
  try {
    toasts.success("Generating DOCX", { description: "Please wait…" })
    const { exportHtmlToDocx } = await import("@/lib/docx-export")
    await exportHtmlToDocx(html, title || "Document")
    toasts.success("DOCX exported", { description: "File downloaded." })
  } catch (e: unknown) {
    console.error(e)
    toasts.error("Export failed", {
      description: e instanceof Error ? e.message : "Failed to export DOCX.",
    })
  }
}

function safeDownloadBasename(title: string, fallback: string): string {
  const base = (title?.trim() || fallback).replace(/[/\\?%*:|"<>]/g, "-").slice(0, 120)
  return base || fallback
}

/** Download plain text derived from HTML (TipTap `getText()` equivalent for stored HTML). */
export function exportNoteAsPlainText(html: string, title: string) {
  if (typeof document === "undefined") return
  const doc = new DOMParser().parseFromString(html || "", "text/html")
  const text = doc.body.innerText.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
  const name = safeDownloadBasename(title, "note")
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${name}.txt`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** Download TipTap JSON document (requires live editor `getJSON()`). */
export function exportNoteAsTiptapJson(docJson: object, title: string) {
  if (typeof document === "undefined") return
  const name = safeDownloadBasename(title, "note")
  const json = JSON.stringify(docJson, null, 2)
  const blob = new Blob([json], { type: "application/json;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${name}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
