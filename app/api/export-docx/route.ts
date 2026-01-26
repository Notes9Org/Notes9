import { NextRequest, NextResponse } from 'next/server'
import {
  Document,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  HeadingLevel,
  convertInchesToTwip,
  Packer,
  ShadingType,
} from 'docx'

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&#(\d+);/gi, (_, num) => String.fromCharCode(parseInt(num)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
}

function stripHtml(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]*>/g, ''))
}

function parseInlineContent(html: string): TextRun[] {
  const runs: TextRun[] = []
  
  // Pre-process mentions to placeholders
  let processed = html
    .replace(/<span[^>]*class="[^"]*mention-protocol[^"]*"[^>]*data-id="([^"]*)"[^>]*>([^<]*)<\/span>/gi, '[[PROTO:$1:$2]]')
    .replace(/<span[^>]*class="[^"]*mention-labnote[^"]*"[^>]*data-id="([^"]*)"[^>]*>([^<]*)<\/span>/gi, '[[LNOTE:$1:$2]]')
    .replace(/<span[^>]*data-type="mention"[^>]*data-id="([^"]*)"[^>]*data-label="([^"]*)"[^>]*>[^<]*<\/span>/gi, '[[MENT:$1:$2]]')
    .replace(/<span[^>]*class="[^"]*mention[^"]*"[^>]*>([^<]*)<\/span>/gi, '[[MENT::$1]]')

  const tags = /(<\/?(?:strong|b|em|i|u|s|code|sub|sup)[^>]*>)/gi
  const parts = processed.split(tags)
  
  let bold = false, italic = false, underline = false, strike = false, code = false, sub = false, sup = false

  for (const part of parts) {
    if (!part) continue
    const lp = part.toLowerCase()
    
    if (lp === '<strong>' || lp === '<b>' || lp.startsWith('<strong ') || lp.startsWith('<b ')) { bold = true; continue }
    if (lp === '</strong>' || lp === '</b>') { bold = false; continue }
    if (lp === '<em>' || lp === '<i>' || lp.startsWith('<em ') || lp.startsWith('<i ')) { italic = true; continue }
    if (lp === '</em>' || lp === '</i>') { italic = false; continue }
    if (lp === '<u>' || lp.startsWith('<u ')) { underline = true; continue }
    if (lp === '</u>') { underline = false; continue }
    if (lp === '<s>' || lp.startsWith('<s ')) { strike = true; continue }
    if (lp === '</s>') { strike = false; continue }
    if (lp === '<code>' || lp.startsWith('<code ')) { code = true; continue }
    if (lp === '</code>') { code = false; continue }
    if (lp === '<sub>' || lp.startsWith('<sub ')) { sub = true; continue }
    if (lp === '</sub>') { sub = false; continue }
    if (lp === '<sup>' || lp.startsWith('<sup ')) { sup = true; continue }
    if (lp === '</sup>') { sup = false; continue }
    if (part.startsWith('<')) continue
    
    const mentionRx = /\[\[(PROTO|LNOTE|MENT):([^:]*):([^\]]*)\]\]/g
    let last = 0, m
    
    while ((m = mentionRx.exec(part)) !== null) {
      const before = part.slice(last, m.index)
      if (before) {
        const txt = decodeHtmlEntities(before)
        if (txt) runs.push(new TextRun({ text: txt, bold, italics: italic, underline: underline ? {} : undefined, strike, font: code ? 'Courier New' : undefined, size: 22, subScript: sub, superScript: sup }))
      }
      const [, type, , label] = m
      const prefix = type === 'PROTO' ? '📋 ' : type === 'LNOTE' ? '📝 ' : '🔗 '
      runs.push(new TextRun({ text: prefix + label, bold: true, color: '0066CC', underline: {}, size: 22 }))
      last = m.index + m[0].length
    }
    
    const after = part.slice(last)
    if (after) {
      const txt = decodeHtmlEntities(after)
      if (txt) runs.push(new TextRun({ text: txt, bold, italics: italic, underline: underline ? {} : undefined, strike, font: code ? 'Courier New' : undefined, size: 22, subScript: sub, superScript: sup }))
    }
  }
  
  if (runs.length === 0) {
    const plain = stripHtml(html)
    if (plain) runs.push(new TextRun({ text: plain, size: 22 }))
  }
  
  return runs
}

function parseTable(tableHtml: string): Table | null {
  const rows: TableRow[] = []
  const rowRx = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  let rowMatch
  
  while ((rowMatch = rowRx.exec(tableHtml)) !== null) {
    const rowContent = rowMatch[1]
    const cells: TableCell[] = []
    const cellRx = /<(th|td)[^>]*>([\s\S]*?)<\/\1>/gi
    let cellMatch
    
    while ((cellMatch = cellRx.exec(rowContent)) !== null) {
      const isHeader = cellMatch[1].toLowerCase() === 'th'
      const cellContent = cellMatch[2]
      const cellText = stripHtml(cellContent)
      
      cells.push(new TableCell({
        children: [new Paragraph({ children: cellText ? [new TextRun({ text: cellText, size: 22, bold: isHeader })] : [], spacing: { before: 40, after: 40 } })],
        borders: {
          top: { style: BorderStyle.SINGLE, size: 8, color: '000000' },
          bottom: { style: BorderStyle.SINGLE, size: 8, color: '000000' },
          left: { style: BorderStyle.SINGLE, size: 8, color: '000000' },
          right: { style: BorderStyle.SINGLE, size: 8, color: '000000' },
        },
        margins: { top: convertInchesToTwip(0.05), bottom: convertInchesToTwip(0.05), left: convertInchesToTwip(0.08), right: convertInchesToTwip(0.08) },
        shading: isHeader ? { type: ShadingType.SOLID, color: 'D9D9D9', fill: 'D9D9D9' } : undefined,
      }))
    }
    
    if (cells.length > 0) {
      rows.push(new TableRow({ children: cells }))
    }
  }
  
  if (rows.length === 0) return null
  
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

function parseHtmlToDocElements(html: string): (Paragraph | Table)[] {
  const elements: (Paragraph | Table)[] = []
  
  // Split by block elements while preserving them
  const blockPattern = /(<table[\s\S]*?<\/table>|<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>|<p[^>]*>[\s\S]*?<\/p>|<li[^>]*>[\s\S]*?<\/li>|<blockquote[^>]*>[\s\S]*?<\/blockquote>|<pre[^>]*>[\s\S]*?<\/pre>|<hr[^>]*\/?>|<br[^>]*\/?>)/gi
  
  const parts = html.split(blockPattern)
  
  for (const part of parts) {
    if (!part || !part.trim()) continue
    
    const trimmed = part.trim()
    const lower = trimmed.toLowerCase()
    
    // Handle tables
    if (lower.startsWith('<table')) {
      const table = parseTable(trimmed)
      if (table) elements.push(table)
      continue
    }
    
    // Handle headings
    const headingMatch = trimmed.match(/^<h([1-6])[^>]*>([\s\S]*?)<\/h\1>$/i)
    if (headingMatch) {
      const level = parseInt(headingMatch[1])
      const content = headingMatch[2]
      const headingLevels: { [key: number]: typeof HeadingLevel[keyof typeof HeadingLevel] } = {
        1: HeadingLevel.HEADING_1,
        2: HeadingLevel.HEADING_2,
        3: HeadingLevel.HEADING_3,
        4: HeadingLevel.HEADING_4,
        5: HeadingLevel.HEADING_5,
        6: HeadingLevel.HEADING_6,
      }
      elements.push(new Paragraph({
        children: parseInlineContent(content),
        heading: headingLevels[level] || HeadingLevel.HEADING_1,
        spacing: { before: 240, after: 120 },
      }))
      continue
    }
    
    // Handle paragraphs
    const pMatch = trimmed.match(/^<p[^>]*>([\s\S]*?)<\/p>$/i)
    if (pMatch) {
      const content = pMatch[1]
      const runs = parseInlineContent(content)
      if (runs.length > 0) {
        elements.push(new Paragraph({ children: runs, spacing: { before: 120, after: 120 } }))
      }
      continue
    }
    
    // Handle list items
    const liMatch = trimmed.match(/^<li[^>]*>([\s\S]*?)<\/li>$/i)
    if (liMatch) {
      const content = liMatch[1]
      const runs = parseInlineContent(content)
      runs.unshift(new TextRun({ text: '• ', size: 22 }))
      elements.push(new Paragraph({ children: runs, spacing: { before: 60, after: 60 }, indent: { left: convertInchesToTwip(0.25) } }))
      continue
    }
    
    // Handle blockquotes
    const bqMatch = trimmed.match(/^<blockquote[^>]*>([\s\S]*?)<\/blockquote>$/i)
    if (bqMatch) {
      const content = bqMatch[1]
      const runs = parseInlineContent(stripHtml(content))
      elements.push(new Paragraph({
        children: runs,
        spacing: { before: 120, after: 120 },
        indent: { left: convertInchesToTwip(0.5) },
        border: { left: { style: BorderStyle.SINGLE, size: 24, color: '999999', space: 10 } },
      }))
      continue
    }
    
    // Handle pre/code blocks
    const preMatch = trimmed.match(/^<pre[^>]*>([\s\S]*?)<\/pre>$/i)
    if (preMatch) {
      const content = stripHtml(preMatch[1])
      const lines = content.split('\n')
      for (const line of lines) {
        elements.push(new Paragraph({
          children: [new TextRun({ text: line || ' ', font: 'Courier New', size: 20 })],
          spacing: { before: 0, after: 0 },
        }))
      }
      continue
    }
    
    // Handle line breaks
    if (lower === '<br>' || lower === '<br/>' || lower === '<br />') {
      elements.push(new Paragraph({ children: [], spacing: { before: 0, after: 0 } }))
      continue
    }
    
    // Handle horizontal rules
    if (lower.startsWith('<hr')) {
      elements.push(new Paragraph({
        children: [new TextRun({ text: '─'.repeat(50), color: '999999' })],
        spacing: { before: 240, after: 240 },
      }))
      continue
    }
    
    // If it looks like plain text (not a tag), create a paragraph
    if (!trimmed.startsWith('<')) {
      const runs = parseInlineContent(trimmed)
      if (runs.length > 0) {
        elements.push(new Paragraph({ children: runs, spacing: { before: 120, after: 120 } }))
      }
    }
  }
  
  // If no elements, try parsing as plain text
  if (elements.length === 0 && html.trim()) {
    const plainText = stripHtml(html)
    if (plainText) {
      elements.push(new Paragraph({ children: [new TextRun({ text: plainText, size: 22 })], spacing: { before: 120, after: 120 } }))
    }
  }
  
  return elements
}

export async function POST(request: NextRequest) {
  try {
    const { html, title } = await request.json()
    
    if (!html) {
      return NextResponse.json({ error: 'No HTML content provided' }, { status: 400 })
    }
    
    const docElements = parseHtmlToDocElements(html)
    
    // Add title if provided
    const children: (Paragraph | Table)[] = []
    if (title) {
      children.push(new Paragraph({
        children: [new TextRun({ text: title, bold: true, size: 32 })],
        heading: HeadingLevel.TITLE,
        spacing: { after: 400 },
      }))
    }
    children.push(...docElements)
    
    const doc = new Document({
      sections: [{
        properties: {
          page: {
            margin: { top: convertInchesToTwip(1), right: convertInchesToTwip(1), bottom: convertInchesToTwip(1), left: convertInchesToTwip(1) },
          },
        },
        children,
      }],
    })
    
    const buffer = await Packer.toBuffer(doc)
    const uint8Array = new Uint8Array(buffer)
    
    return new NextResponse(uint8Array, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${title || 'document'}.docx"`,
      },
    })
  } catch (error) {
    console.error('DOCX export error:', error)
    return NextResponse.json({ error: 'Failed to generate DOCX' }, { status: 500 })
  }
}

