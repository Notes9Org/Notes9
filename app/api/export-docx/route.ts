import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { html, title } = await request.json()

    if (!html) {
      return NextResponse.json(
        { error: 'HTML content is required' },
        { status: 400 }
      )
    }

    console.log('Converting HTML to DOCX, title:', title)
    console.log('HTML length:', html.length)

    // Dynamic import to ensure it works in Node.js environment
    const HTMLtoDOCX = (await import('html-to-docx')).default

    // Convert HTML to DOCX
    const docxResult = await HTMLtoDOCX(html, null, {
      table: { row: { cantSplit: true } },
      footer: true,
      pageNumber: true,
      font: 'Arial',
      fontSize: 11,
    })

    console.log('DOCX result type:', typeof docxResult)
    console.log('DOCX result constructor:', docxResult?.constructor?.name)

    // Handle both Blob (browser) and Buffer (Node.js) responses
    let buffer: Buffer

    if (Buffer.isBuffer(docxResult)) {
      console.log('Result is Buffer, size:', docxResult.length)
      buffer = docxResult
    } else if (docxResult && typeof (docxResult as any).arrayBuffer === 'function') {
      console.log('Result is Blob-like, size:', (docxResult as any).size)
      const arrayBuffer = await (docxResult as any).arrayBuffer()
      buffer = Buffer.from(arrayBuffer)
    } else if (docxResult instanceof ArrayBuffer) {
      console.log('Result is ArrayBuffer, size:', docxResult.byteLength)
      buffer = Buffer.from(docxResult)
    } else if (ArrayBuffer.isView(docxResult)) {
      console.log('Result is ArrayBufferView')
      buffer = Buffer.from(docxResult.buffer)
    } else {
      throw new Error(`Unexpected result type: ${typeof docxResult}, constructor: ${docxResult?.constructor?.name}`)
    }

    console.log('Final buffer size:', buffer.length)

    // Check if buffer has content
    if (!buffer || buffer.length === 0) {
      throw new Error('Generated DOCX is empty')
    }

    // Return the DOCX file as Uint8Array (compatible with NextResponse)
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${title || 'lab-note'}.docx"`,
        'Content-Length': buffer.length.toString(),
      },
    })
  } catch (error: any) {
    console.error('DOCX export error:', error)
    console.error('Error stack:', error.stack)
    return NextResponse.json(
      { error: error.message || 'Failed to generate DOCX' },
      { status: 500 }
    )
  }
}

