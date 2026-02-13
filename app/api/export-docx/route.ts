import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

// Lazy load the module
let htmlDocx: any = null

function getHtmlDocx() {
  if (!htmlDocx) {
    try {
      htmlDocx = require('html-docx-js')
      console.log('html-docx-js loaded:', Object.keys(htmlDocx))
    } catch (e) {
      console.error('Failed to load html-docx-js:', e)
      throw new Error('Failed to load html-docx-js library')
    }
  }
  return htmlDocx
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { html, title } = body

    console.log('Export DOCX request received')
    console.log('HTML provided:', !!html)
    console.log('HTML length:', html?.length)
    console.log('Title:', title)

    if (!html) {
      return NextResponse.json(
        { error: 'No HTML provided' },
        { status: 400 }
      )
    }

    // Load the library
    const converter = getHtmlDocx()

    if (!converter.asBlob) {
      console.error('Module structure:', converter)
      return NextResponse.json(
        { error: 'DOCX converter not available', details: 'asBlob function missing' },
        { status: 500 }
      )
    }

    // Clean unsupported CSS color functions
    const cleanedHtml = html
      .replace(/lab\([^)]+\)/gi, '#808080')
      .replace(/lch\([^)]+\)/gi, '#808080')
      .replace(/oklab\([^)]+\)/gi, '#808080')
      .replace(/oklch\([^)]+\)/gi, '#808080')
      .replace(/color-mix\([^)]+\)/gi, '#808080')

    // Build full HTML document
    const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title ?? 'Document'}</title>
  <style>
    body {
      font-family: Calibri, Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.5;
    }
    h1 { font-size: 18pt; font-weight: bold; margin: 20pt 0 12pt; }
    h2 { font-size: 16pt; font-weight: bold; margin: 16pt 0 10pt; }
    h3 { font-size: 14pt; font-weight: bold; margin: 14pt 0 8pt; }
    p { margin: 8pt 0; }
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 12pt 0;
    }
    th, td {
      border: 1px solid #333;
      padding: 6px;
      text-align: left;
      vertical-align: top;
    }
    th {
      background-color: #e8e8e8;
      font-weight: bold;
    }
    ul, ol { margin: 8pt 0; padding-left: 24pt; }
    li { margin: 4pt 0; }
    code {
      font-family: 'Courier New', monospace;
      background-color: #f5f5f5;
      padding: 2px 4px;
    }
    pre {
      font-family: 'Courier New', monospace;
      background-color: #f5f5f5;
      padding: 10px;
      margin: 10pt 0;
      white-space: pre-wrap;
    }
    blockquote {
      border-left: 3px solid #999;
      margin: 10pt 0;
      padding-left: 12pt;
      color: #555;
    }
  </style>
</head>
<body>
  ${title ? `<h1>${title}</h1>` : ''}
  ${cleanedHtml}
</body>
</html>`

    console.log('Converting to DOCX...')
    const docxBlob = converter.asBlob(fullHtml)
    console.log('Blob created')

    const arrayBuffer = await docxBlob.arrayBuffer()
    const uint8Array = new Uint8Array(arrayBuffer)
    console.log('DOCX generated, size:', uint8Array.byteLength)

    return new NextResponse(uint8Array, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${title || 'document'}.docx"`,
      },
    })
  } catch (error: any) {
    console.error('HTML → DOCX error:', error)
    console.error('Stack:', error?.stack)
    return NextResponse.json(
      {
        error: 'Failed to generate DOCX',
        message: error?.message || 'Unknown error',
        stack: error?.stack,
      },
      { status: 500 }
    )
  }
}
