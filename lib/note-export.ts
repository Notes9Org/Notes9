"use client"

import { toast } from "sonner"
import {
  buildExportGoogleFontsLink,
  EXPORT_DEFAULT_FONT_STACK,
} from "@/lib/export-formatting"
import {
  buildCommentsSectionHtml,
  buildPrintDocumentHtml,
  processCommentsForExport,
  prepareHtmlForExport,
  splitHeaderFooter,
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

    turndownService.addRule("preserveStyledSpan", {
      filter: (node: HTMLElement) => {
        if (node.nodeName !== "SPAN") return false
        const style = node.getAttribute("style") || ""
        return /font-family|font-size|color|background/i.test(style)
      },
      replacement: (content: string, node: HTMLElement) => {
        const style = node.getAttribute("style") || ""
        return `<span style="${style.replace(/"/g, "&quot;")}">${content}</span>`
      },
    })

    turndownService.use(gfm)

    const markdown = turndownService.turndown(prepareHtmlForExport(html))
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

export async function exportNoteAsHtml(html: string, title: string) {
  const safeTitle = title || "note"
  const { extractLayoutMarker, injectHeaderFooterForExport } = await import("@/lib/page-layout")
  const { layout } = extractLayoutMarker(html)
  let prepared = prepareHtmlForExport(html)
  if (layout) prepared = injectHeaderFooterForExport(prepared, layout)
  const { header, footer, body } = splitHeaderFooter(prepared)
  // thead/tfoot repeat the header/footer on every page when the file is printed.
  const bodyHtml =
    header || footer
      ? `<table class="print-paged"><thead><tr><td>${
          header ? `<div class="doc-running-header">${header}</div>` : ""
        }</td></tr></thead><tbody><tr><td>${body}</td></tr></tbody>${
          footer ? `<tfoot><tr><td><div class="doc-running-footer">${footer}</div></td></tr></tfoot>` : ""
        }</table>`
      : body
  const googleFonts = buildExportGoogleFontsLink(prepared)
  const fullHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${safeTitle}</title>
  ${googleFonts}
  <style>
    body { font-family: ${EXPORT_DEFAULT_FONT_STACK}; max-width: 800px; margin: 40px auto; padding: 20px; line-height: 1.6; color: #1a1a1a; }
    [style*="font-family"], [style*="font-size"], [style*="color"] { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    code, kbd { font-family: Consolas, "Courier New", monospace; background: #f3f4f6; color: #111827; padding: 2px 6px; border-radius: 3px; }
    pre { font-family: Consolas, "Courier New", monospace; background: #f3f4f6; color: #111827; padding: 15px; border-radius: 5px; overflow-x: auto; white-space: pre-wrap; }
    pre code { background: transparent; color: inherit; padding: 0; }
    blockquote { border-left: 4px solid #ddd; margin: 0; padding-left: 20px; color: #666; }
    table { border-collapse: collapse; width: 100% !important; table-layout: auto !important; margin: 20px 0; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; width: auto !important; min-width: 0 !important; }
    th { background: #f4f4f4; }
    [data-type="resizable-image"] img { display: inline-block; max-width: 100%; height: auto; }
    .n9-columns { column-gap: 2rem; }
    .n9-columns > * { break-inside: avoid; }
    .n9-doc-header { border-bottom: 1px solid #d1d5db; padding: 6px 4px 8px; margin-bottom: 14px; color: #4b5563; font-size: 0.9em; }
    .n9-doc-footer { border-top: 1px solid #d1d5db; padding: 8px 4px 6px; margin-top: 14px; color: #4b5563; font-size: 0.9em; }
    .n9-page-break { height: 0; border: 0; page-break-after: always; break-after: page; }
    table.print-paged { width: 100%; border-collapse: collapse; border: 0; }
    table.print-paged > thead { display: table-header-group; }
    table.print-paged > tfoot { display: table-footer-group; }
    table.print-paged td { border: 0; padding: 0; vertical-align: top; }
    .doc-running-header { border-bottom: 1px solid #d1d5db; padding-bottom: 6px; margin-bottom: 12px; color: #4b5563; font-size: 0.92em; }
    .doc-running-footer { border-top: 1px solid #d1d5db; padding-top: 6px; margin-top: 12px; color: #4b5563; font-size: 0.92em; }
  </style>
</head>
<body>
  <h1>${safeTitle}</h1>
  ${bodyHtml}
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

    // Recover the page layout (margins, orientation, header/footer) embedded in
    // the saved content so the workspace export menu reflects it too.
    const { extractLayoutMarker, marginsPxToMm } = await import("@/lib/page-layout")
    const { layout } = extractLayoutMarker(html)

    let bodyHtml = html
    let commentsHtml = ""
    if (options?.includeComments) {
      const { content, comments } = processCommentsForExport(html)
      bodyHtml = prepareHtmlForExport(content)
      commentsHtml = buildCommentsSectionHtml(comments)
    } else {
      bodyHtml = prepareHtmlForExport(html)
    }

    const docTitle = (title || "").trim() || "Document"

    try {
      const { buildPagedExportAssets } = await import("@/lib/print-export")
      const { Previewer } = await import("pagedjs")

      const { contentHtml, css } = buildPagedExportAssets({
        bodyHtml,
        commentsBlockHtml: commentsHtml,
        marginsMm: layout ? marginsPxToMm(layout.margins) : options?.marginsMm,
        orientation: layout?.orientation,
        header: layout?.header,
        footer: layout?.footer,
        pageNumbers: layout?.pageNumbers,
        pageNumberAlign: layout?.pageNumberAlign,
      })

      const container = document.createElement("div")
      container.id = "n9-paged-print"
      container.style.cssText = "position:absolute; left:-10000px; top:0; width:0; overflow:hidden;"
      document.body.appendChild(container)
      const cssUrl = URL.createObjectURL(new Blob([css], { type: "text/css" }))
      
      const previewer = new Previewer()
      await previewer.preview(contentHtml, [cssUrl], container)

      const printStyle = document.createElement("style")
      printStyle.textContent = `
        @media screen { #n9-paged-print { display: none !important; } }
        @media print {
          body > *:not(#n9-paged-print) { display: none !important; }
          #n9-paged-print { position: static !important; left: auto !important; width: auto !important; overflow: visible !important; }
          html, body { background: #fff !important; }
        }
      `
      document.head.appendChild(printStyle)

      await new Promise((r) => setTimeout(r, 150))
      
      const cleanup = () => {
        if (container.parentNode) container.parentNode.removeChild(container)
        if (printStyle.parentNode) printStyle.parentNode.removeChild(printStyle)
        URL.revokeObjectURL(cssUrl)
      }
      
      window.addEventListener("afterprint", cleanup, { once: true })
      window.print()
      setTimeout(cleanup, 60000)
      
      toasts.success("Print dialog opened", { description: "Save as PDF from your browser." })
    } catch (err) {
      console.warn("Paged.js failed in background export, falling back to basic print", err)
      // Fallback
      const { injectHeaderFooterForExport } = await import("@/lib/page-layout")
      let fallbackBody = bodyHtml
      if (layout) fallbackBody = injectHeaderFooterForExport(fallbackBody, layout)
      const fullHtml = buildPrintDocumentHtml({
        title: docTitle,
        bodyHtml: fallbackBody,
        includeTitleHeading: true,
        commentsBlockHtml: commentsHtml,
        marginsMm: layout ? marginsPxToMm(layout.margins) : options?.marginsMm,
        orientation: layout?.orientation,
      })
      writePrintIframeDocument(iframeDoc, fullHtml, docTitle)
      await new Promise((r) => setTimeout(r, 150))
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
      toasts.success("Print dialog opened", { description: "Save as PDF from your browser." })
      setTimeout(() => {
        if (iframe && document.body.contains(iframe)) document.body.removeChild(iframe)
      }, 2000)
    }
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
    const { extractLayoutMarker, injectHeaderFooterForExport, stripLayoutMarker } = await import("@/lib/page-layout")
    const { exportHtmlToDocx } = await import("@/lib/docx-export")
    const { layout } = extractLayoutMarker(html)
    let body = stripLayoutMarker(html)
    if (layout) body = injectHeaderFooterForExport(body, layout)
    await exportHtmlToDocx(body, title || "Document", layout)
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
  const doc = new DOMParser().parseFromString(prepareHtmlForExport(html || ""), "text/html")
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
