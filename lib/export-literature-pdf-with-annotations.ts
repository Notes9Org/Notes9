import { PDFDocument, StandardFonts, grayscale, rgb } from "pdf-lib"
import type { PDFPage } from "pdf-lib"
import type { PDFFont } from "pdf-lib"

import type { AnnotationType, LiteraturePdfAnnotation } from "@/types/literature-pdf"

type Rgb = ReturnType<typeof rgb>

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

/** Word-wrap using real glyph widths so layout height matches what we draw (avoids overlapping body text). */
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

type FootnoteItem = { label: string; body: string }

function footnoteItemToLines(
  item: FootnoteItem,
  maxW: number,
  font: PDFFont,
  fontSize: number,
  maxLinesPerItem: number
): string[] {
  const combined = `${item.label}${item.body}`.slice(0, 5500)
  const safe = sanitizeNoteTextForPdf(combined)
  if (!safe) return []
  const paragraphs = safe.split(/\n/).map((p) => p.trim()).filter(Boolean)
  const out: string[] = []
  for (const para of paragraphs) {
    const wrapped = wrapParagraphToLines(para, maxW, font, fontSize)
    for (const ln of wrapped) {
      if (out.length >= maxLinesPerItem) return out
      out.push(ln)
    }
  }
  return out
}

function drawNoteLine(
  page: PDFPage,
  font: PDFFont,
  line: string,
  x: number,
  y: number,
  fontSize: number
) {
  const safe = line.replace(/[^\x20-\x7e]/g, " ").trim()
  if (!safe) return
  try {
    page.drawText(safe, {
      x,
      y,
      size: fontSize,
      font,
      color: rgb(0.12, 0.12, 0.12),
    })
  } catch {
    const ascii = safe.replace(/[^\x20-\x7e]/g, "")
    if (ascii) {
      page.drawText(ascii, { x, y, size: fontSize, font, color: rgb(0.12, 0.12, 0.12) })
    }
  }
}

/**
 * Lay out exported note copy from the **bottom** of the page upward, then draw a rule above the block.
 * Original PDF body should use y > ruleY; notes stay in the lower band only.
 */
function drawPageFootnotes(
  page: PDFPage,
  font: PDFFont,
  pageWidth: number,
  pageHeight: number,
  items: FootnoteItem[]
) {
  if (items.length === 0) return

  const marginX = 40
  const maxW = pageWidth - marginX * 2
  const lineHeight = 9
  const fontSize = 7
  const titleSize = 8
  const blockGap = 5
  const gapBeforeTitle = 8
  const gapRuleAboveTitle = 8
  /** Baseline of the bottom-most note line (pt above page bottom). */
  const footerFloorY = 36
  /** Rule must stay at or below this y so the upper ~40% of the page is reserved for body text. */
  const maxRuleY = pageHeight * 0.6
  const maxLinesPerItem = 36

  let working = [...items]
  let blocks: string[][] = []

  const rebuildBlocks = () => {
    blocks = working
      .map((item) => footnoteItemToLines(item, maxW, font, fontSize, maxLinesPerItem))
      .filter((lines) => lines.length > 0)
  }

  rebuildBlocks()

  const ruleYForBlocks = (b: string[][]): number => {
    let lineCount = 0
    for (const bl of b) lineCount += bl.length
    const blockGaps = Math.max(0, b.length - 1) * blockGap
    const notesStackHeight = lineCount * lineHeight + blockGaps
    const titleBand = gapBeforeTitle + titleSize
    return footerFloorY + notesStackHeight + titleBand + gapRuleAboveTitle
  }

  let ruleY = ruleYForBlocks(blocks)

  while (ruleY > maxRuleY && working.length > 1) {
    working.pop()
    rebuildBlocks()
    ruleY = ruleYForBlocks(blocks)
  }

  while (ruleY > maxRuleY && working.length === 1 && blocks[0]?.length > 1) {
    blocks[0] = blocks[0].slice(0, blocks[0].length - 2)
    ruleY = ruleYForBlocks(blocks)
  }

  if (blocks.length === 0) return

  if (ruleY > maxRuleY) {
    page.drawText("… (notes omitted — not enough space below body text)", {
      x: marginX,
      y: footerFloorY,
      size: fontSize,
      font,
      color: grayscale(0.4),
      maxWidth: maxW,
    })
    return
  }

  let y = footerFloorY
  for (let bi = blocks.length - 1; bi >= 0; bi--) {
    const lines = blocks[bi]
    for (let li = lines.length - 1; li >= 0; li--) {
      drawNoteLine(page, font, lines[li], marginX, y, fontSize)
      y += lineHeight
    }
    if (bi > 0) y += blockGap
  }

  y += gapBeforeTitle
  const titleBaseline = y
  page.drawText("Exported notes (Notes9)", {
    x: marginX,
    y: titleBaseline,
    size: titleSize,
    font,
    color: grayscale(0.35),
  })

  const ruleBaseline = titleBaseline + titleSize + gapRuleAboveTitle
  page.drawLine({
    start: { x: marginX, y: ruleBaseline },
    end: { x: pageWidth - marginX, y: ruleBaseline },
    thickness: 0.6,
    color: grayscale(0.55),
    opacity: 0.9,
  })

}

/**
 * Returns a new PDF byte array with semi-transparent highlight/note overlays burned in.
 * Note and comment bodies are placed only in a bottom footer band so they do not cover PDF text.
 */
export async function buildLiteraturePdfWithAnnotationsEmbedded(
  pdfBytes: ArrayBuffer,
  annotations: LiteraturePdfAnnotation[]
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const pages = pdfDoc.getPages()

  const byPage = new Map<number, LiteraturePdfAnnotation[]>()
  for (const ann of annotations) {
    const n = ann.page_number
    if (n < 1) continue
    const list = byPage.get(n) ?? []
    list.push(ann)
    byPage.set(n, list)
  }

  for (const [pageNum, list] of byPage) {
    const idx = pageNum - 1
    if (idx < 0 || idx >= pages.length) continue
    const page = pages[idx]
    const { width, height } = page.getSize()

    const ordered = [...list].sort((a, b) => {
      const score = (t: LiteraturePdfAnnotation) => (t.rects?.length ? 0 : 1)
      return score(a) - score(b)
    })

    const footnotes: FootnoteItem[] = []
    let noteIndex = 0

    for (const ann of ordered) {
      const style = styleForType(ann.type)

      if (ann.rects?.length) {
        for (const r of ann.rects) {
          const box = cssNormRectToPdf(r, width, height)
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
      const commentPlain = stripAnnotationHtml(ann.comment_text || "")

      if (!hasRects) {
        const anchor = parseAnchor(ann.anchor)
        if (anchor) {
          const cx = anchor.x * width
          const cy = (1 - anchor.y) * height
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

      if (ann.type === "note" || ann.type === "comment") {
        if (commentPlain.length > 0) {
          noteIndex += 1
          const typeLabel = ann.type === "note" ? "Note" : "Comment"
          const loc = hasRects ? " (selection)" : " (page marker)"
          footnotes.push({
            label: `[${noteIndex}] ${typeLabel}${loc}: `,
            body: commentPlain,
          })
        }
      }
    }

    drawPageFootnotes(page, font, width, height, footnotes)
  }

  return pdfDoc.save()
}
