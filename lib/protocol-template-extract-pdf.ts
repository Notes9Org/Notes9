import { dedupeHeadings } from "./protocol-template-slugs"
import type { ProtocolTemplateExtracted } from "./protocol-template-types"

function normalizeWs(s: string): string {
  return s.replace(/\s+/g, " ").trim()
}

function scoreHeadingLine(line: string): number {
  let s = 0
  if (line.length >= 8 && line.length <= 120) s += 2
  if (/^[A-Z][A-Z0-9\s\-–&:]{3,}$/.test(line)) s += 3
  if (/^\d+\.?\s+[A-Z]/.test(line)) s += 2
  if (/\b(aims?|methods?|materials?|procedure|references?|safety|approval|review|author)\b/i.test(line)) s += 4
  return s
}

export async function extractProtocolTemplateFromPdf(arrayBuffer: ArrayBuffer): Promise<ProtocolTemplateExtracted> {
  const pdfjsLib: any = await import("pdfjs-dist/legacy/build/pdf.mjs")
  if (typeof window === "undefined" && !(globalThis as any).pdfjsWorker?.WorkerMessageHandler) {
    const workerModule: any = await import("pdfjs-dist/build/pdf.worker.min.mjs")
    ;(globalThis as any).pdfjsWorker = {
      WorkerMessageHandler: workerModule.WorkerMessageHandler,
    }
  }
  const pdfBytes = new Uint8Array(arrayBuffer.slice(0))
  const loadingTask = pdfjsLib.getDocument({
    data: pdfBytes,
    useWorkerFetch: false,
    isEvalSupported: false,
  })
  const pdf = await loadingTask.promise
  const maxPages = Math.min(pdf.numPages ?? 1, 20)

  let text = ""
  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    const pageText = content.items.map((item: any) => ("str" in item ? item.str : "")).join("\n")
    text += `\n${pageText}`
  }

  const rawLines = normalizeWs(text)
    .split(/\n+/)
    .map((l) => normalizeWs(l))
    .filter((l) => l.length > 2)

  const ordered: string[] = []
  const seen = new Set<string>()
  for (const line of rawLines) {
    const score = scoreHeadingLine(line)
    const kw =
      /\b(aims?|objectives?|methods?|materials?|procedure|references?|safety|introduction|equipment|approval|review|author|sign)\b/i.test(
        line
      )
    if (score >= 3 || kw) {
      const k = line.toLowerCase()
      if (seen.has(k)) continue
      seen.add(k)
      ordered.push(line)
      if (ordered.length >= 24) break
    }
  }

  if (ordered.length < 4) {
    for (const line of rawLines) {
      if (seen.has(line.toLowerCase())) continue
      if (line.length >= 8 && line.length < 100 && /^[A-Z0-9][A-Za-z0-9\s\-–&:]{2,}/.test(line)) {
        seen.add(line.toLowerCase())
        ordered.push(line)
      }
      if (ordered.length >= 12) break
    }
  }

  const sectionHeadings = dedupeHeadings(ordered.map((title) => ({ title })))

  return {
    sectionHeadings,
    logos: [],
    warnings: [
      "PDF: section titles are inferred from text (layout may vary). Logos are not extracted from PDF; use a DOCX template for embedded logos or add images in the editor.",
    ],
  }
}
