import { PDFDocument, StandardFonts, grayscale, rgb } from "pdf-lib"
import type { PDFPage } from "pdf-lib"
import type { PDFFont } from "pdf-lib"

import type { AnnotationType, LiteraturePdfAnnotation } from "@/types/literature-pdf"

type Rgb = ReturnType<typeof rgb>
type PdfColor = Rgb | ReturnType<typeof grayscale>

const NOTES_COLUMN_WIDTH_PT = 228
const COLUMN_GUTTER_PT = 14
const COLUMN_PAD_PT = 10
const SEPARATOR_X_OFFSET_PT = 7

export function stripAnnotationHtml(html: string): string {
  if (!html) return ""
  return html
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function sanitizeNoteTextForPdf(text: string): string {
  const t = text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2026]/g, "...")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
  let out = ""
  for (const ch of t) {
    const code = ch.codePointAt(0) ?? 0
    if (code === 10 || code === 13) {
      out += "\n"
    } else if (code >= 0x20 && code <= 0x7e) {
      out += ch
    } else if (code <= 0xff && code >= 0xa0) {
      out += ch
    } else {
      out += " "
    }
  }
  return out.replace(/[ \t]+\n/g, "\n").replace(/\n{4,}/g, "\n\n\n").replace(/ +/g, " ").trim()
}

function styleForType(type: AnnotationType): { fill: Rgb; border: Rgb; opacity: number } {
  switch (type) {
    case "note":
      return {
        fill: rgb(0.78, 0.95, 0.55),
        border: rgb(0.35, 0.55, 0.12),
        opacity: 0.42,
      }
    case "comment":
      return {
        fill: rgb(0.72, 0.88, 0.98),
        border: rgb(0.15, 0.45, 0.85),
        opacity: 0.38,
      }
    default:
      return {
        fill: rgb(1, 0.93, 0.55),
        border: rgb(0.92, 0.65, 0.08),
        opacity: 0.48,
      }
  }
}

/** Parse #RGB / #RRGGBB into pdf-lib rgb; returns null if invalid. */
function hexToRgb(color: string | null | undefined): Rgb | null {
  if (!color || typeof color !== "string") return null
  const s = color.trim()
  const m6 = s.match(/^#?([0-9a-f]{6})$/i)
  const m3 = s.match(/^#?([0-9a-f]{3})$/i)
  let r = 0
  let g = 0
  let b = 0
  if (m6) {
    const n = parseInt(m6[1], 16)
    r = ((n >> 16) & 255) / 255
    g = ((n >> 8) & 255) / 255
    b = (n & 255) / 255
  } else if (m3) {
    const h = m3[1]
    r = parseInt(h[0] + h[0], 16) / 255
    g = parseInt(h[1] + h[1], 16) / 255
    b = parseInt(h[2] + h[2], 16) / 255
  } else {
    return null
  }
  return rgb(r, g, b)
}

function darkenRgb(fill: Rgb, factor: number): Rgb {
  return rgb(
    Math.min(1, fill.red * factor),
    Math.min(1, fill.green * factor),
    Math.min(1, fill.blue * factor),
  )
}

function drawStyleForAnnotation(ann: LiteraturePdfAnnotation): { fill: Rgb; border: Rgb; opacity: number } {
  const fromHex = hexToRgb(ann.color)
  if (fromHex) {
    return {
      fill: fromHex,
      border: darkenRgb(fromHex, 0.58),
      opacity: ann.type === "highlight" ? 0.48 : ann.type === "comment" ? 0.38 : 0.42,
    }
  }
  return styleForType(ann.type)
}

/** Viewer stores rects with top/left origin (0–1). PDF uses bottom-left origin in points. */
function cssNormRectToPdf(
  r: { top: number; left: number; width: number; height: number },
  pageWidth: number,
  pageHeight: number
) {
  const left = Number(r.left) * pageWidth
  const w = Number(r.width) * pageWidth
  const h = Number(r.height) * pageHeight
  const y = (1 - Number(r.top) - Number(r.height)) * pageHeight
  return { x: left, y, width: w, height: h }
}

function parseAnchor(raw: unknown): { x: number; y: number } | null {
  if (raw == null) return null
  let o: unknown = raw
  if (typeof raw === "string") {
    try {
      o = JSON.parse(raw) as unknown
    } catch {
      return null
    }
  }
  if (typeof o !== "object" || o === null) return null
  const rec = o as Record<string, unknown>
  const xRaw = rec.x
  const yRaw = rec.y
  const x = typeof xRaw === "number" ? xRaw : Number(xRaw)
  const y = typeof yRaw === "number" ? yRaw : Number(yRaw)
  const xOk = Number.isFinite(x)
  const yOk = Number.isFinite(y)
  if (!xOk && !yOk) return null
  return {
    x: xOk ? x : 0.5,
    y: yOk ? y : 0.12,
  }
}

/** Semi-transparent highlights on the embedded page (same colors as in the reader). */
function drawAnnotationHighlightsOnPdfRegion(
  page: PDFPage,
  pageWidth: number,
  pageHeight: number,
  list: LiteraturePdfAnnotation[]
) {
  const ordered = [...list].sort((a, b) => {
    const score = (t: LiteraturePdfAnnotation) => (t.rects?.length ? 0 : 1)
    return score(a) - score(b)
  })

  for (const ann of ordered) {
    const style = drawStyleForAnnotation(ann)

    if (ann.rects?.length) {
      for (const r of ann.rects) {
        const box = cssNormRectToPdf(r, pageWidth, pageHeight)
        if (box.width <= 0 || box.height <= 0) continue
        page.drawRectangle({
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
          borderColor: style.border,
          borderWidth: 0.75,
          borderOpacity: 0.9,
          color: style.fill,
          opacity: style.opacity,
        })
      }
    }

    const hasRects = Boolean(ann.rects?.length)
    if (!hasRects) {
      const anchor = parseAnchor(ann.anchor)
      if (anchor) {
        const cx = anchor.x * pageWidth
        const cy = (1 - anchor.y) * pageHeight
        page.drawEllipse({
          x: cx,
          y: cy,
          xScale: 5,
          yScale: 5,
          borderColor: style.border,
          borderWidth: 0.6,
          borderOpacity: 1,
          color: style.fill,
          opacity: 0.9,
        })
      }
    }
  }
}

function typeLabel(type: AnnotationType): string {
  switch (type) {
    case "highlight":
      return "Highlight"
    case "note":
      return "Note"
    case "comment":
      return "Comment"
    default:
      return String(type)
  }
}

/** Word-wrap using glyph widths so layout height is predictable. */
function wrapParagraphToLines(text: string, maxWidth: number, font: PDFFont, fontSize: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  const lines: string[] = []
  let current = ""
  const widthOf = (s: string) => {
    try {
      return font.widthOfTextAtSize(s, fontSize)
    } catch {
      return maxWidth + 1
    }
  }
  for (const w of words) {
    const test = current ? `${current} ${w}` : w
    if (widthOf(test) <= maxWidth || !current) {
      current = test
      continue
    }
    if (current) lines.push(current)
    if (widthOf(w) <= maxWidth) {
      current = w
      continue
    }
    let piece = ""
    for (const ch of w) {
      const next = piece + ch
      if (widthOf(next) <= maxWidth) piece = next
      else {
        if (piece) lines.push(piece)
        piece = ch
      }
    }
    current = piece
  }
  if (current) lines.push(current)
  return lines
}

function drawPdfLine(
  page: PDFPage,
  font: PDFFont,
  line: string,
  x: number,
  yBaseline: number,
  fontSize: number,
  color: PdfColor = rgb(0.12, 0.12, 0.12)
) {
  const safe = line.replace(/[^\x20-\x7e]/g, " ").trim()
  if (!safe) return
  try {
    page.drawText(safe, { x, y: yBaseline, size: fontSize, font, color })
  } catch {
    const ascii = safe.replace(/[^\x20-\x7e]/g, "")
    if (ascii) {
      page.drawText(ascii, { x, y: yBaseline, size: fontSize, font, color })
    }
  }
}

function lineAdvance(fontSize: number) {
  return Math.max(9, fontSize * 1.22)
}

/**
 * Right column: same information as the in-app “Highlights & notes” sidebar, not drawn over the PDF body.
 */
function drawAnnotationsSidebarColumn(
  page: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
  columnLeft: number,
  pageHeight: number,
  columnWidth: number,
  pageNumber: number,
  list: LiteraturePdfAnnotation[]
) {
  const pad = COLUMN_PAD_PT
  const maxW = columnWidth - pad * 2
  const floorY = pad
  let y = pageHeight - pad

  const title = "Highlights & notes"
  drawPdfLine(page, fontBold, title, columnLeft + pad, y, 9, grayscale(0.2))
  y -= lineAdvance(9) + 4

  if (list.length === 0) {
    drawPdfLine(page, font, "No annotations on this page.", columnLeft + pad, y, 7.5, grayscale(0.45))
    return
  }

  const truncatedMsg = "… (more notes omitted — column height limit)"
  let truncated = false

  for (const ann of list) {
    const header = `${typeLabel(ann.type)} · Page ${pageNumber}`
    const headerLines = wrapParagraphToLines(header, maxW, fontBold, 8)
    const quotePlain = ann.quote_text ? sanitizeNoteTextForPdf(stripAnnotationHtml(ann.quote_text)) : ""
    const commentPlain = ann.comment_text ? sanitizeNoteTextForPdf(stripAnnotationHtml(ann.comment_text)) : ""

    const quoteLines = quotePlain
      ? wrapParagraphToLines(`“${quotePlain}”`, maxW, font, 7.25)
      : []
    const commentLines = commentPlain ? wrapParagraphToLines(commentPlain, maxW, font, 7.25) : []

    let blockHeight = headerLines.length * lineAdvance(8)
    if (quoteLines.length) blockHeight += 2 + quoteLines.length * lineAdvance(7.25)
    if (commentLines.length) blockHeight += 2 + commentLines.length * lineAdvance(7.25)
    blockHeight += 10

    if (y - blockHeight < floorY) {
      truncated = true
      break
    }

    for (const ln of headerLines) {
      drawPdfLine(page, fontBold, ln, columnLeft + pad, y, 8, grayscale(0.15))
      y -= lineAdvance(8)
    }

    if (quoteLines.length) {
      y -= 2
      for (const ln of quoteLines) {
        drawPdfLine(page, font, ln, columnLeft + pad, y, 7.25, grayscale(0.38))
        y -= lineAdvance(7.25)
      }
    }

    if (commentLines.length) {
      y -= 2
      for (const ln of commentLines) {
        drawPdfLine(page, font, ln, columnLeft + pad, y, 7.25, grayscale(0.12))
        y -= lineAdvance(7.25)
      }
    }

    y -= 10
  }

  if (truncated && y > floorY + lineAdvance(7)) {
    drawPdfLine(page, font, truncatedMsg, columnLeft + pad, y, 7, grayscale(0.42))
  }
}

/**
 * Export PDF with (1) colored highlight/note overlays on the original page — same logic as the reader,
 * using each annotation’s `color` when set — and (2) a right column listing highlights/notes like the sidebar.
 */
export async function buildLiteraturePdfWithAnnotationsEmbedded(
  pdfBytes: ArrayBuffer,
  annotations: LiteraturePdfAnnotation[]
): Promise<Uint8Array> {
  if (annotations.length === 0) {
    return new Uint8Array(pdfBytes)
  }

  const srcDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })
  const outDoc = await PDFDocument.create()
  const font = await outDoc.embedFont(StandardFonts.Helvetica)
  const fontBold = await outDoc.embedFont(StandardFonts.HelveticaBold)

  const pageCount = srcDoc.getPageCount()
  const byPage = new Map<number, LiteraturePdfAnnotation[]>()
  for (const ann of annotations) {
    const n = ann.page_number
    if (n < 1) continue
    const list = byPage.get(n) ?? []
    list.push(ann)
    byPage.set(n, list)
  }

  for (let i = 0; i < pageCount; i++) {
    const pageNumber = i + 1
    const srcPage = srcDoc.getPage(i)
    const { width: srcW, height: srcH } = srcPage.getSize()
    const embedded = await outDoc.embedPage(srcPage)

    const colW = NOTES_COLUMN_WIDTH_PT
    const gutter = COLUMN_GUTTER_PT
    const totalW = srcW + gutter + colW
    const page = outDoc.addPage([totalW, srcH])

    page.drawPage(embedded, {
      x: 0,
      y: 0,
      width: srcW,
      height: srcH,
    })

    const pageAnnotations = byPage.get(pageNumber) ?? []
    drawAnnotationHighlightsOnPdfRegion(page, srcW, srcH, pageAnnotations)

    const sepX = srcW + SEPARATOR_X_OFFSET_PT
    page.drawLine({
      start: { x: sepX, y: 0 },
      end: { x: sepX, y: srcH },
      thickness: 0.55,
      color: grayscale(0.72),
      opacity: 0.95,
    })

    drawAnnotationsSidebarColumn(page, font, fontBold, srcW + gutter, srcH, colW, pageNumber, pageAnnotations)
  }

  return outDoc.save()
}
