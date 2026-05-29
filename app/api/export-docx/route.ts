import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth/current-user'
import { buildExportGoogleFontsLink } from '@/lib/export-formatting'
import { prepareHtmlForExport } from '@/lib/print-export'

export const runtime = 'nodejs'

const MAX_HTML_BYTES = 5 * 1024 * 1024 // 5 MB upper bound on input HTML

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
    const supabase = await createClient()
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { html, title } = body

    if (!html || typeof html !== 'string') {
      return NextResponse.json(
        { error: 'No HTML provided' },
        { status: 400 }
      )
    }
    if (html.length > MAX_HTML_BYTES) {
      return NextResponse.json(
        { error: 'HTML payload too large' },
        { status: 413 }
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

    const cleanedHtml = prepareHtmlForExport(html)
    const googleFonts = buildExportGoogleFontsLink(cleanedHtml)

    const escapeHtml = (s: string): string =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
    const rawTitle = typeof title === 'string' ? title : ''
    const safeTitleHtml = escapeHtml(rawTitle).slice(0, 500)
    const filenameSafeTitle = rawTitle.replace(/["\r\n\\]/g, '_').slice(0, 200) || 'document'

    const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${safeTitleHtml || 'Document'}</title>
  ${googleFonts}
  <style>
    body {
      font-family: Calibri, 'Segoe UI', sans-serif;
      font-size: 11pt;
      line-height: 1.5;
    }
    h1 { font-size: 18pt; font-weight: bold; margin: 20pt 0 12pt; }
    h2 { font-size: 16pt; font-weight: bold; margin: 16pt 0 10pt; }
    h3 { font-size: 14pt; font-weight: bold; margin: 14pt 0 8pt; }
    p { margin: 8pt 0; }
    table {
      border-collapse: collapse;
      width: 100% !important;
      table-layout: auto !important;
      margin: 12pt 0;
    }
    th, td {
      border: 1px solid #333;
      padding: 6px;
      text-align: left;
      vertical-align: top;
      width: auto !important;
      min-width: 0 !important;
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
      font-family: Consolas, 'Courier New', monospace;
      background-color: #f3f4f6 !important;
      color: #111827 !important;
      padding: 10px;
      margin: 10pt 0;
      white-space: pre-wrap;
    }
    pre code, code, kbd {
      font-family: Consolas, 'Courier New', monospace;
      background-color: #f3f4f6 !important;
      color: #111827 !important;
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
  ${safeTitleHtml ? `<h1>${safeTitleHtml}</h1>` : ''}
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
        'Content-Disposition': `attachment; filename="${filenameSafeTitle}.docx"`,
      },
    })
  } catch (error: any) {
    console.error('HTML → DOCX error:', error)
    console.error('Stack:', error?.stack)
    return NextResponse.json(
      { error: 'Failed to generate DOCX' },
      { status: 500 }
    )
  }
}
