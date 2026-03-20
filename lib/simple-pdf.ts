const encoder = new TextEncoder()

export function textToPdf(text: string, title?: string): Uint8Array {
  const sanitized = normalizeText(text)
  const lines = wrapLines(sanitized, 96)
  const pageLineLimit = 56
  const pages: string[][] = []

  for (let i = 0; i < lines.length; i += pageLineLimit) {
    pages.push(lines.slice(i, i + pageLineLimit))
  }
  if (pages.length === 0) {
    pages.push([" "])
  }

  const objects: string[] = []
  objects.push("") // 0-index placeholder
  objects.push("<< /Type /Catalog /Pages 2 0 R >>")

  const pageObjectIds: number[] = []
  const contentObjectIds: number[] = []
  const fontObjectId = 3 + pages.length * 2

  for (let i = 0; i < pages.length; i += 1) {
    const pageObjectId = 3 + i * 2
    const contentObjectId = pageObjectId + 1
    pageObjectIds.push(pageObjectId)
    contentObjectIds.push(contentObjectId)
  }

  const kids = pageObjectIds.map((id) => `${id} 0 R`).join(" ")
  objects.push(`<< /Type /Pages /Count ${pages.length} /Kids [${kids}] >>`)

  for (let i = 0; i < pages.length; i += 1) {
    const pageObjectId = pageObjectIds[i]
    const contentObjectId = contentObjectIds[i]
    objects[pageObjectId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`

    const stream = buildPageStream(pages[i], i === 0 ? title : undefined)
    objects[contentObjectId] =
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  }

  objects[fontObjectId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"

  const linesOut: string[] = ["%PDF-1.4"]
  const offsets: number[] = [0]
  let byteLength = linesOut[0].length + 1

  for (let i = 1; i < objects.length; i += 1) {
    offsets[i] = byteLength
    const block = `${i} 0 obj\n${objects[i]}\nendobj`
    linesOut.push(block)
    byteLength += block.length + 1
  }

  const xrefOffset = byteLength
  const xrefLines: string[] = []
  xrefLines.push(`xref\n0 ${objects.length}`)
  xrefLines.push("0000000000 65535 f ")
  for (let i = 1; i < objects.length; i += 1) {
    xrefLines.push(`${offsets[i].toString().padStart(10, "0")} 00000 n `)
  }

  const trailer = [
    `trailer\n<< /Size ${objects.length} /Root 1 0 R >>`,
    `startxref\n${xrefOffset}`,
    "%%EOF",
  ].join("\n")

  const pdfText = `${linesOut.join("\n")}\n${xrefLines.join("\n")}\n${trailer}\n`
  return encoder.encode(pdfText)
}

function buildPageStream(lines: string[], title?: string) {
  const output: string[] = ["BT", "/F1 10 Tf", "50 750 Td"]
  if (title) {
    output.push(`(${escapePdfText(title)}) Tj`)
    output.push("T*")
  }

  for (const line of lines) {
    output.push(`(${escapePdfText(line)}) Tj`)
    output.push("T*")
  }
  output.push("ET")
  return output.join("\n")
}

function wrapLines(text: string, maxChars: number) {
  const rawLines = text.split("\n")
  const wrapped: string[] = []

  for (const rawLine of rawLines) {
    if (rawLine.length <= maxChars) {
      wrapped.push(rawLine)
      continue
    }

    let current = rawLine
    while (current.length > maxChars) {
      wrapped.push(current.slice(0, maxChars))
      current = current.slice(maxChars)
    }
    wrapped.push(current)
  }

  return wrapped
}

function normalizeText(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function escapePdfText(text: string) {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
}
