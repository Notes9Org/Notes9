"use client"

import {
  Document, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, HeadingLevel, Packer, ShadingType,
  VerticalAlign, AlignmentType, convertInchesToTwip, PageBreak, Header, Footer,
  CommentRangeStart, CommentRangeEnd, CommentReference, ICommentOptions
} from 'docx'
import { saveAs } from 'file-saver'
import {
  extractCodePlainText,
  EXPORT_CODE_FONT,
  EXPORT_CODE_SHADING_FILL,
  EXPORT_CODE_TEXT_COLOR,
} from '@/lib/export-code-blocks'
import {
  countTableColumns,
  DOCX_TABLE_CONTENT_WIDTH_INCHES,
} from '@/lib/export-table-normalize'
import {
  DEFAULT_EXPORT_INLINE_STYLE,
  EXPORT_DEFAULT_FONT_FAMILY,
  type ExportInlineStyle,
  mergeExportInlineStyles,
  parseBlockParagraphSpacing,
  stylesFromElement,
} from '@/lib/export-formatting'
import { prepareHtmlForExport } from '@/lib/print-export'

// A paragraph-level run can be a plain TextRun or one of the comment-range
// markers, all of which are valid `Paragraph` children in docx v9.
type ParagraphRun = TextRun | CommentRangeStart | CommentRangeEnd

// Convert a CSS color (rgb()/rgba() or #hex) to a 6-digit hex string without
// the leading '#', as docx shading/color options expect. Returns undefined
// for values that can't be parsed so callers fall back to no color.
function rgbToHex(color: string): string | undefined {
  const trimmed = color.trim()
  if (!trimmed) return undefined
  const hexMatch = trimmed.match(/^#?([0-9a-fA-F]{6})$/)
  if (hexMatch) return hexMatch[1].toUpperCase()
  const shortHex = trimmed.match(/^#?([0-9a-fA-F]{3})$/)
  if (shortHex) {
    return shortHex[1]
      .split('')
      .map((c) => c + c)
      .join('')
      .toUpperCase()
  }
  const rgbMatch = trimmed.match(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i)
  if (rgbMatch) {
    const toHex = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')
    return (
      toHex(Number(rgbMatch[1])) +
      toHex(Number(rgbMatch[2])) +
      toHex(Number(rgbMatch[3]))
    ).toUpperCase()
  }
  return undefined
}

// Parse HTML content and convert to DOCX elements
export async function exportHtmlToDocx(html: string, title: string) {
  const preparedHtml = prepareHtmlForExport(html)
  const comments: ICommentOptions[] = []

  // Extract the document header/footer so Word repeats them on every page via
  // real section headers/footers (rather than once in the body flow).
  let bodyHtml = preparedHtml
  let headerChildren: any[] = []
  let footerChildren: any[] = []
  if (typeof DOMParser !== "undefined") {
    const parsed = new DOMParser().parseFromString(preparedHtml, "text/html")
    const h = parsed.querySelector('[data-type="docHeader"]')
    const f = parsed.querySelector('[data-type="docFooter"]')
    if (h) {
      headerChildren = parseHtmlToDocElements(h.innerHTML, []).flat()
      h.remove()
    }
    if (f) {
      footerChildren = parseHtmlToDocElements(f.innerHTML, []).flat()
      f.remove()
    }
    bodyHtml = parsed.body.innerHTML
  }

  const children: any[] = parseHtmlToDocElements(bodyHtml, comments)

  const doc = new Document({
    comments: {
      children: comments
    },
    styles: {
      default: {
        document: {
          run: {
            font: EXPORT_DEFAULT_FONT_FAMILY,
            size: DEFAULT_EXPORT_INLINE_STYLE.size ?? 24,
          },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          margin: {
            top: convertInchesToTwip(1),
            right: convertInchesToTwip(1),
            bottom: convertInchesToTwip(1),
            left: convertInchesToTwip(1),
          },
        },
      },
      ...(headerChildren.length ? { headers: { default: new Header({ children: headerChildren }) } } : {}),
      ...(footerChildren.length ? { footers: { default: new Footer({ children: footerChildren }) } } : {}),
      children,
    }],
  })

  const blob = await Packer.toBlob(doc)
  saveAs(blob, `${title || 'document'}.docx`)
}

function parseHtmlToDocElements(html: string, comments: ICommentOptions[]): any[] {
  const elements: any[] = []

  // Create a temporary DOM element to parse HTML
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const body = doc.body

  // Process each child node
  for (const node of body.childNodes) {
    const element = parseNode(node, comments)
    if (element) {
      if (Array.isArray(element)) {
        elements.push(...element)
      } else {
        elements.push(element)
      }
    }
  }

  return elements
}

function parseNode(node: Node, comments: ICommentOptions[]): any | null {
  // Text node
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent?.trim()
    if (text) {
      return new Paragraph({
        children: [textRunFromStyle(text, DEFAULT_EXPORT_INLINE_STYLE)],
        spacing: { before: 120, after: 120 },
      })
    }
    return null
  }

  // Element node
  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as Element
    const tagName = el.tagName.toLowerCase()

    switch (tagName) {
      case 'p':
        return parseParagraph(el, comments)
      case 'h1':
        return parseHeading(el, HeadingLevel.HEADING_1, comments)
      case 'h2':
        return parseHeading(el, HeadingLevel.HEADING_2, comments)
      case 'h3':
        return parseHeading(el, HeadingLevel.HEADING_3, comments)
      case 'h4':
        return parseHeading(el, HeadingLevel.HEADING_4, comments)
      case 'h5':
        return parseHeading(el, HeadingLevel.HEADING_5, comments)
      case 'h6':
        return parseHeading(el, HeadingLevel.HEADING_6, comments)
      case 'ul':
      case 'ol':
        return parseList(el, comments)
      case 'blockquote':
        return parseBlockquote(el, comments)
      case 'pre':
        return parseCodeBlock(el)
      case 'code': {
        if (el.parentElement?.tagName.toLowerCase() === 'pre') {
          return null
        }
        const text = extractCodePlainText(el).trim()
        if (!text) return null
        if (text.includes('\n')) {
          return parseCodeBlock(el)
        }
        return new Paragraph({
          children: [buildCodeTextRun(text)],
          spacing: { before: 60, after: 60 },
        })
      }
      case 'table':
        return parseTable(el, comments)
      case 'hr':
        return new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC' } },
          spacing: { before: 240, after: 240 },
        })
      case 'div': {
        const dataType = el.getAttribute('data-type')
        if (dataType === 'simple-shape') {
          return new Paragraph({
            children: [new TextRun({ text: '[Shape]', size: 22, italics: true, color: '888888' })],
            spacing: { before: 120, after: 120 },
          })
        }
        // Hard page break → real Word page break.
        if (dataType === 'page-break') {
          return new Paragraph({ children: [new PageBreak()] })
        }
        // Document header / footer bands → bordered, muted paragraph.
        if (dataType === 'docHeader' || dataType === 'docFooter') {
          const runs = parseInlineContent(el, comments)
          const isHeader = dataType === 'docHeader'
          return new Paragraph({
            children: runs.length > 0 ? runs : [textRunFromStyle('', DEFAULT_EXPORT_INLINE_STYLE)],
            border: isHeader
              ? { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'D1D5DB' } }
              : { top: { style: BorderStyle.SINGLE, size: 4, color: 'D1D5DB' } },
            spacing: isHeader ? { after: 240 } : { before: 240 },
          })
        }
        // Parse children recursively
        const divChildren: any[] = []
        for (const child of el.childNodes) {
          const parsed = parseNode(child, comments)
          if (parsed) {
            if (Array.isArray(parsed)) {
              divChildren.push(...parsed)
            } else {
              divChildren.push(parsed)
            }
          }
        }
        return divChildren.length > 0 ? divChildren : null
      }
      default:
        // For unknown elements, try to parse inline content
        const runs = parseInlineContent(el, comments)
        if (runs.length > 0) {
          return new Paragraph({
            children: runs,
            spacing: { before: 120, after: 120 },
          })
        }
        return null
    }
  }

  return null
}

function parseParagraph(el: Element, comments: ICommentOptions[]): Paragraph {
  const runs = parseInlineContent(el, comments, DEFAULT_EXPORT_INLINE_STYLE)
  const block = el as HTMLElement

  let alignment: typeof AlignmentType[keyof typeof AlignmentType] | undefined
  if (block.style.textAlign === 'center') alignment = AlignmentType.CENTER
  if (block.style.textAlign === 'right') alignment = AlignmentType.RIGHT
  if (block.style.textAlign === 'justify') alignment = AlignmentType.JUSTIFIED

  return new Paragraph({
    children: runs.length > 0 ? runs : [textRunFromStyle('', DEFAULT_EXPORT_INLINE_STYLE)],
    spacing: parseBlockParagraphSpacing(block),
    alignment,
  })
}

function headingBaseStyle(level: typeof HeadingLevel[keyof typeof HeadingLevel]): ExportInlineStyle {
  const size = getHeadingSize(level)
  return mergeExportInlineStyles(DEFAULT_EXPORT_INLINE_STYLE, { size, bold: true })
}

function parseHeading(el: Element, level: typeof HeadingLevel[keyof typeof HeadingLevel], comments: ICommentOptions[]): Paragraph {
  const base = headingBaseStyle(level)
  const runs = parseInlineContent(el, comments, base)
  const block = el as HTMLElement

  let alignment: typeof AlignmentType[keyof typeof AlignmentType] | undefined
  if (block.style.textAlign === 'center') alignment = AlignmentType.CENTER
  if (block.style.textAlign === 'right') alignment = AlignmentType.RIGHT
  if (block.style.textAlign === 'justify') alignment = AlignmentType.JUSTIFIED

  const spacing = parseBlockParagraphSpacing(block)
  return new Paragraph({
    children: runs.length > 0 ? runs : [textRunFromStyle('', base)],
    spacing: { ...spacing, before: Math.max(spacing.before, 200), after: spacing.after },
    alignment,
  })
}

function getHeadingSize(level: typeof HeadingLevel[keyof typeof HeadingLevel]): number {
  switch (level) {
    case HeadingLevel.HEADING_1: return 32
    case HeadingLevel.HEADING_2: return 28
    case HeadingLevel.HEADING_3: return 26
    case HeadingLevel.HEADING_4: return 24
    case HeadingLevel.HEADING_5: return 22
    case HeadingLevel.HEADING_6: return 22
    default: return 22
  }
}

function parseList(el: Element, comments: ICommentOptions[], depth = 0): any[] {
  const items: any[] = []
  const isOrdered = el.tagName.toLowerCase() === 'ol'
  let index = 1

  for (const li of el.querySelectorAll(':scope > li')) {
    const nestedLists = Array.from(li.children).filter((c) => {
      const t = c.tagName.toLowerCase()
      return t === 'ul' || t === 'ol'
    }) as Element[]

    const liClone = li.cloneNode(true) as HTMLElement
    Array.from(liClone.children).forEach((child) => {
      const t = child.tagName.toLowerCase()
      if (t === 'ul' || t === 'ol') liClone.removeChild(child)
    })

    const runs = parseInlineContent(liClone, comments, DEFAULT_EXPORT_INLINE_STYLE)
    const prefix = isOrdered ? `${index}. ` : '• '
    runs.unshift(textRunFromStyle(prefix, DEFAULT_EXPORT_INLINE_STYLE))

    items.push(new Paragraph({
      children: runs.length > 0 ? runs : [textRunFromStyle(prefix.trimEnd(), DEFAULT_EXPORT_INLINE_STYLE)],
      spacing: { before: 60, after: 60 },
      indent: { left: convertInchesToTwip(0.25 * (depth + 1)) },
    }))

    index++
    for (const n of nestedLists) {
      items.push(...parseList(n, comments, depth + 1))
    }
  }

  return items
}

function parseBlockquote(el: Element, comments: ICommentOptions[]): Paragraph {
  const runs = parseInlineContent(el, comments, DEFAULT_EXPORT_INLINE_STYLE)
  return new Paragraph({
    children: runs.length > 0 ? runs : [textRunFromStyle('', DEFAULT_EXPORT_INLINE_STYLE)],
    spacing: { before: 120, after: 120 },
    indent: { left: convertInchesToTwip(0.5) },
    border: { left: { style: BorderStyle.SINGLE, size: 24, color: '999999', space: 10 } },
  })
}

function buildCodeTextRun(text: string): TextRun {
  return new TextRun({
    text: text || ' ',
    font: EXPORT_CODE_FONT,
    size: 20,
    color: EXPORT_CODE_TEXT_COLOR,
    shading: {
      type: ShadingType.SOLID,
      color: EXPORT_CODE_SHADING_FILL,
      fill: EXPORT_CODE_SHADING_FILL,
    },
  })
}

function parseCodeBlock(el: Element): any[] {
  const text = extractCodePlainText(el)
  const lines = text.length > 0 ? text.split('\n') : ['']

  return lines.map((line, index) =>
    new Paragraph({
      children: [buildCodeTextRun(line)],
      spacing: {
        before: index === 0 ? 120 : 0,
        after: index === lines.length - 1 ? 120 : 0,
      },
      shading: {
        type: ShadingType.SOLID,
        color: EXPORT_CODE_SHADING_FILL,
        fill: EXPORT_CODE_SHADING_FILL,
      },
    })
  )
}

function parseTable(el: Element, comments: ICommentOptions[]): Table {
  const rows: TableRow[] = []
  const colCount = countTableColumns(el)
  const contentWidthTwip = convertInchesToTwip(DOCX_TABLE_CONTENT_WIDTH_INCHES)
  const defaultColWidthTwip =
    colCount > 0 ? Math.floor(contentWidthTwip / colCount) : contentWidthTwip
  const columnWidths =
    colCount > 0 ? Array.from({ length: colCount }, () => defaultColWidthTwip) : undefined

  for (const tr of el.querySelectorAll('tr')) {
    const cells: TableCell[] = []

    for (const cell of tr.querySelectorAll('th, td')) {
      const isHeader = cell.tagName.toLowerCase() === 'th'
      const cellRuns = parseInlineContent(cell, comments, DEFAULT_EXPORT_INLINE_STYLE)
      const colspan = Math.max(1, parseInt(cell.getAttribute('colspan') || '1', 10) || 1)
      const cellWidthTwip = defaultColWidthTwip * colspan

      // Get background color from style
      const style = (cell as HTMLElement).style
      const bgColor = style.backgroundColor
      const hexColor = bgColor ? rgbToHex(bgColor) : undefined

      const cellOpts: any = {
        children: [new Paragraph({
          children: cellRuns.length > 0 ? cellRuns : [textRunFromStyle('', DEFAULT_EXPORT_INLINE_STYLE)],
          spacing: { before: 40, after: 40 },
        })],
        width: { size: cellWidthTwip, type: WidthType.DXA },
        borders: {
          top: { style: BorderStyle.SINGLE, size: 8, color: '000000' },
          bottom: { style: BorderStyle.SINGLE, size: 8, color: '000000' },
          left: { style: BorderStyle.SINGLE, size: 8, color: '000000' },
          right: { style: BorderStyle.SINGLE, size: 8, color: '000000' },
        },
        margins: {
          top: convertInchesToTwip(0.05),
          bottom: convertInchesToTwip(0.05),
          left: convertInchesToTwip(0.08),
          right: convertInchesToTwip(0.08),
        },
        verticalAlign: VerticalAlign.CENTER,
      }

      if (colspan > 1) {
        cellOpts.columnSpan = colspan
      }

      // Apply background color
      if (hexColor && hexColor !== 'transparent') {
        cellOpts.shading = {
          type: ShadingType.SOLID,
          color: hexColor.replace('#', ''),
          fill: hexColor.replace('#', ''),
        }
      } else if (isHeader) {
        cellOpts.shading = {
          type: ShadingType.SOLID,
          color: 'E8E8E8',
          fill: 'E8E8E8',
        }
      }

      cells.push(new TableCell(cellOpts))
    }

    if (cells.length > 0) {
      rows.push(new TableRow({ children: cells }))
    }
  }

  return new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    ...(columnWidths ? { columnWidths } : {}),
    borders: {
      top: { style: BorderStyle.SINGLE, size: 8, color: '000000' },
      bottom: { style: BorderStyle.SINGLE, size: 8, color: '000000' },
      left: { style: BorderStyle.SINGLE, size: 8, color: '000000' },
      right: { style: BorderStyle.SINGLE, size: 8, color: '000000' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 8, color: '000000' },
      insideVertical: { style: BorderStyle.SINGLE, size: 8, color: '000000' },
    },
  })
}

function textRunFromStyle(text: string, style: ExportInlineStyle): TextRun {
  const opts: Record<string, unknown> = {
    text: text || ' ',
    size: style.size ?? DEFAULT_EXPORT_INLINE_STYLE.size ?? 24,
    font: style.font ?? EXPORT_DEFAULT_FONT_FAMILY,
  }
  if (style.color) opts.color = style.color
  if (style.bold) opts.bold = true
  if (style.italics) opts.italics = true
  if (style.strike) opts.strike = true
  if (style.underline) opts.underline = { type: 'single' }
  if (style.subScript) opts.subScript = true
  if (style.superScript) opts.superScript = true
  if (style.highlight) opts.highlight = style.highlight
  if (style.shading) {
    opts.shading = {
      type: ShadingType.SOLID,
      color: style.shading.color,
      fill: style.shading.fill,
    }
  }
  return new TextRun(opts as ConstructorParameters<typeof TextRun>[0])
}

const INLINE_CONTAINER_TAGS = new Set([
  'span', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del',
  'sub', 'sup', 'mark', 'a', 'font',
])

function walkInlineNodes(
  parent: Element,
  inherited: ExportInlineStyle,
  runs: ParagraphRun[],
  comments: ICommentOptions[]
): void {
  for (const node of parent.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent
      if (text) runs.push(textRunFromStyle(text, inherited))
      continue
    }

    if (node.nodeType !== Node.ELEMENT_NODE) continue
    const childEl = node as Element
    const tag = childEl.tagName.toLowerCase()

    if (tag === 'br') {
      runs.push(textRunFromStyle('\n', inherited))
      continue
    }

    const isCodeLike = tag === 'code' || tag === 'pre' || tag === 'kbd'
    if (isCodeLike) {
      const codeStyle = mergeExportInlineStyles(inherited, {
        font: EXPORT_CODE_FONT,
        size: 20,
        color: EXPORT_CODE_TEXT_COLOR,
        shading: { fill: EXPORT_CODE_SHADING_FILL, color: EXPORT_CODE_SHADING_FILL },
      })
      runs.push(textRunFromStyle(extractCodePlainText(childEl), codeStyle))
      continue
    }

    if (childEl.hasAttribute('data-comment')) {
      const content = childEl.getAttribute('data-content')
      if (content) {
        const commentId = comments.length
        const author = childEl.getAttribute('data-author')
        const createdAt = childEl.getAttribute('data-created-at')
        comments.push({
          id: commentId,
          author: author || 'Unknown',
          initials: author ? author.charAt(0).toUpperCase() : 'U',
          date: createdAt ? new Date(Number(createdAt)) : new Date(),
          children: [
            new Paragraph({
              children: [new TextRun({ text: content })],
            }),
          ],
        })
        const marked = mergeExportInlineStyles(stylesFromElement(childEl, inherited), {
          highlight: 'magenta',
        })
        const text = childEl.textContent || ''
        runs.push(new CommentRangeStart(commentId))
        runs.push(textRunFromStyle(text, marked))
        runs.push(new CommentRangeEnd(commentId))
        runs.push(
          new TextRun({
            children: [new CommentReference(commentId)],
            superScript: true,
          })
        )
        continue
      }
    }

    const childStyle = stylesFromElement(childEl, inherited)

    if (INLINE_CONTAINER_TAGS.has(tag) || tag === 'span') {
      walkInlineNodes(childEl, childStyle, runs, comments)
      continue
    }

    const text = childEl.textContent || ''
    if (text) runs.push(textRunFromStyle(text, childStyle))
  }
}

function parseInlineContent(
  el: Element,
  comments: ICommentOptions[],
  baseStyle: ExportInlineStyle = DEFAULT_EXPORT_INLINE_STYLE
): ParagraphRun[] {
  const runs: ParagraphRun[] = []
  walkInlineNodes(el, baseStyle, runs, comments)
  return runs.length > 0 ? runs : [textRunFromStyle('', baseStyle)]
}
