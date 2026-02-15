"use client"

import {
  Document, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, HeadingLevel, Packer, ShadingType,
  VerticalAlign, AlignmentType, convertInchesToTwip,
  CommentRangeStart, CommentRangeEnd, CommentReference, ICommentOptions
} from 'docx'
import { saveAs } from 'file-saver'

// Parse HTML content and convert to DOCX elements
export async function exportHtmlToDocx(html: string, title: string) {
  const children: any[] = []
  const comments: ICommentOptions[] = []

  const elements = parseHtmlToDocElements(html, comments)
  children.push(...elements)

  const doc = new Document({
    comments: {
      children: comments
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
        children: [new TextRun({ text, size: 22 })],
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
      case 'table':
        return parseTable(el, comments)
      case 'hr':
        return new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC' } },
          spacing: { before: 240, after: 240 },
        })
      case 'div':
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
  const runs = parseInlineContent(el, comments)

  // Check for alignment
  const style = (el as HTMLElement).style
  let alignment: any = undefined
  if (style.textAlign === 'center') alignment = AlignmentType.CENTER
  if (style.textAlign === 'right') alignment = AlignmentType.RIGHT
  if (style.textAlign === 'justify') alignment = AlignmentType.JUSTIFIED

  return new Paragraph({
    children: runs.length > 0 ? runs : [new TextRun({ text: '', size: 22 })],
    spacing: { before: 120, after: 120 },
    alignment,
  })
}

function parseHeading(el: Element, level: any, comments: ICommentOptions[]): Paragraph {
  const runs = parseInlineContent(el, comments)

  // Force bold and size for heading runs that don't have specific adjustments
  runs.forEach(run => {
    // We can't easily modify the TextRun object after creation if it's strictly typed without type assertion 
    // or we just rely on the Paragraph heading property to style it, 
    // but word sometimes needs explicit run properties for direct formatting.
    // However, the `heading: level` in Paragraph usually takes care of it.
    // Let's just return the runs. Word styles should handle it.
    // But to match previous behavior (explicit bold/size):
    // We'd need to reconstruct TextRuns.
    // The previous code was: new TextRun({ text, bold: true, size: getHeadingSize(level) })
  })

  // To maintain visual consistency with the previous implementation, 
  // we might want applied styles. But `parseInlineContent` applies its own styles.
  // Overriding them might be tricky. 
  // Generally, Headings in Word are styled by the Style, so we shouldn't manually set size/bold on every run 
  // UNLESS we want to override the default Heading style.
  // The previous implementation manually set it. 
  // Let's trust `heading: level` to do the heavy lifting, but if we really needed that size manual override:

  // Actually, let's just pass `heading: level`.

  return new Paragraph({
    children: runs.length > 0 ? runs : [new TextRun({ text: '', size: getHeadingSize(level) })],
    heading: level,
    spacing: { before: 240, after: 120 },
  })
}

function getHeadingSize(level: any): number {
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

function parseList(el: Element, comments: ICommentOptions[]): any[] {
  const items: any[] = []
  const isOrdered = el.tagName.toLowerCase() === 'ol'
  let index = 1

  for (const li of el.querySelectorAll(':scope > li')) {
    const runs = parseInlineContent(li, comments)
    const prefix = isOrdered ? `${index}. ` : '• '

    runs.unshift(new TextRun({ text: prefix, size: 22 }))

    items.push(new Paragraph({
      children: runs,
      spacing: { before: 60, after: 60 },
      indent: { left: convertInchesToTwip(0.25) },
    }))

    index++
  }

  return items
}

function parseBlockquote(el: Element, comments: ICommentOptions[]): Paragraph {
  const runs = parseInlineContent(el, comments)
  return new Paragraph({
    children: runs.length > 0 ? runs : [new TextRun({ text: '', size: 22 })],
    spacing: { before: 120, after: 120 },
    indent: { left: convertInchesToTwip(0.5) },
    border: { left: { style: BorderStyle.SINGLE, size: 24, color: '999999', space: 10 } },
  })
}

function parseCodeBlock(el: Element): any[] {
  const text = el.textContent || ''
  const lines = text.split('\n')

  return lines.map(line => new Paragraph({
    children: [new TextRun({ text: line || ' ', font: 'Courier New', size: 20 })],
    spacing: { before: 0, after: 0 },
    shading: { type: ShadingType.SOLID, fill: 'F5F5F5' },
  }))
}

function parseTable(el: Element, comments: ICommentOptions[]): Table {
  const rows: TableRow[] = []

  for (const tr of el.querySelectorAll('tr')) {
    const cells: TableCell[] = []

    for (const cell of tr.querySelectorAll('th, td')) {
      const isHeader = cell.tagName.toLowerCase() === 'th'
      const cellRuns = parseInlineContent(cell, comments)

      // Get background color from style
      const style = (cell as HTMLElement).style
      const bgColor = style.backgroundColor
      const hexColor = bgColor ? rgbToHex(bgColor) : undefined

      const cellOpts: any = {
        children: [new Paragraph({
          children: cellRuns.length > 0 ? cellRuns : [new TextRun({ text: '', size: 22 })],
          spacing: { before: 40, after: 40 },
        })],
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

function parseInlineContent(el: Element, comments: ICommentOptions[]): any[] {
  const runs: any[] = []

  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent
      if (text) {
        runs.push(new TextRun({ text, size: 22 }))
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const childEl = node as Element
      const tagName = childEl.tagName.toLowerCase()
      const text = childEl.textContent || ''

      // Get styles
      const style = (childEl as HTMLElement).style
      const color = style.color ? rgbToHex(style.color) : undefined
      const bgColor = style.backgroundColor ? rgbToHex(style.backgroundColor) : undefined

      const runOpts: any = {
        text,
        size: 22,
        bold: tagName === 'strong' || tagName === 'b',
        italics: tagName === 'em' || tagName === 'i',
        strike: tagName === 's' || tagName === 'strike' || tagName === 'del',
      }

      // Underline
      if (tagName === 'u') {
        runOpts.underline = { type: 'single' }
      }

      // Check for comment
      if (childEl.hasAttribute('data-comment')) {
        const id = childEl.getAttribute('data-id')
        const author = childEl.getAttribute('data-author')
        const content = childEl.getAttribute('data-content')
        const createdAt = childEl.getAttribute('data-created-at')

        if (content && id) {
          // Used predictable numeric ID for internal DOCX comment referencing
          // We'll use the current length of the comments array as the reference ID
          const commentId = comments.length

          comments.push({
            id: commentId,
            author: author || "Unknown",
            initials: author ? author.charAt(0).toUpperCase() : "U",
            date: createdAt ? new Date(Number(createdAt)) : new Date(),
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: content })
                ]
              })
            ]
          })

          // Apply highlight
          runOpts.highlight = 'magenta' // Standard Word highlight color

          // Wrap text with comment range start/end
          runs.push(new CommentRangeStart(commentId))
          runs.push(new TextRun(runOpts))
          runs.push(new CommentRangeEnd(commentId))
          runs.push(new TextRun({
            children: [new CommentReference(commentId)],
            superScript: true
          }))
          continue
        }
      }

      // Code
      if (tagName === 'code') {
        runOpts.font = 'Courier New'
        runOpts.size = 20
      }

      // Sub/Sup
      if (tagName === 'sub') {
        runOpts.subScript = true
      }
      if (tagName === 'sup') {
        runOpts.superScript = true
      }

      // Color from inline style
      if (color && color !== 'transparent' && isValidHex(color)) {
        runOpts.color = color.replace('#', '')
      }

      // Background/highlight from mark or style
      if (tagName === 'mark' || (bgColor && bgColor !== 'transparent' && isValidHex(bgColor))) {
        // If it's a valid hex, we might want to map it to closest highlighting color or use shading
        // docx highlight only supports specific enum values (yellow, green, etc.)
        // shading can take hex.
        if (tagName === 'mark') {
          runOpts.highlight = 'yellow'
        } else if (isValidHex(bgColor)) {
          runOpts.shading = {
            type: ShadingType.SOLID,
            color: bgColor.replace('#', ''),
            fill: bgColor.replace('#', '')
          }
        }
      }

      runs.push(new TextRun(runOpts))
    }
  }

  return runs.length > 0 ? runs : [new TextRun({ text: '', size: 22 })]
}

// Convert RGB to Hex
function rgbToHex(rgb: string): string {
  if (!rgb) return ''

  // If already hex, return it
  if (rgb.startsWith('#')) {
    return rgb
  }

  // Parse rgb(r, g, b) format
  const match = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
  if (match) {
    const r = parseInt(match[1])
    const g = parseInt(match[2])
    const b = parseInt(match[3])
    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('')
  }

  // Handle common names or return original if can't parse (will be filtered by isValidHex)
  return rgb
}

function isValidHex(color: string): boolean {
  return /^#([0-9A-F]{3}){1,2}$/i.test(color)
}
