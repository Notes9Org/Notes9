import { escapeHtml } from "@/lib/sanitize-html"

/**
 * Rich conversion of an uploaded PDF into editor HTML.
 *
 * PDFs carry no semantic structure, so we reconstruct it heuristically from the
 * text layer + draw operators:
 *  - paragraphs   — text items grouped into lines by baseline, lines stitched
 *                   into paragraphs by vertical gap
 *  - headings     — lines whose font size is meaningfully larger than the body
 *                   text become h1/h2/h3 (by relative size)
 *  - bold/italic  — per-run, detected from the glyph's font name
 *  - lists        — lines beginning with a bullet or "1."/"a)" become <ul>/<ol>
 *  - images       — embedded raster images are extracted and inlined as data
 *                   URIs, positioned by their draw transform
 *
 * Everything is best-effort and defensive: if image extraction or font lookup
 * fails, the text still imports cleanly.
 */

type InlineRun = { text: string; bold: boolean; italic: boolean }

type TextBlock = {
  type: "text"
  y: number
  size: number
  runs: InlineRun[]
}

type ImageBlock = {
  type: "image"
  y: number
  src: string
}

type Block = TextBlock | ImageBlock

const BULLET_RE = /^\s*[•·▪◦‣⁃■□●○*–—-]\s+/
const ORDERED_RE = /^\s*(?:\d{1,3}|[a-zA-Z])[.)]\s+/

const fontIsBold = (name: string) => /bold|black|heavy|semibold|demi|extrab|ultrab/i.test(name)
const fontIsItalic = (name: string) => /italic|oblique/i.test(name)

export async function pdfFileToEditorHtml(file: File): Promise<string> {
  const pdfjsLib: any = await import("pdfjs-dist/legacy/build/pdf.mjs")
  if (typeof window === "undefined" && !(globalThis as any).pdfjsWorker?.WorkerMessageHandler) {
    const workerModule: any = await import("pdfjs-dist/build/pdf.worker.min.mjs")
    ;(globalThis as any).pdfjsWorker = { WorkerMessageHandler: workerModule.WorkerMessageHandler }
  }
  const OPS = pdfjsLib.OPS

  const buffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
    isEvalSupported: false,
  }).promise

  const pageHtml: string[] = []
  // Collect line sizes across the doc to estimate the body font size once.
  const allSizes: number[] = []
  const perPageBlocks: Block[][] = []

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    // getOperatorList loads fonts (needed for bold/italic) and gives us images.
    let opList: any = null
    try {
      opList = await page.getOperatorList()
    } catch {
      opList = null
    }
    const textContent = await page.getTextContent()

    // Resolve a bold/italic flag per fontName once.
    const fontFlags = new Map<string, { bold: boolean; italic: boolean }>()
    const flagsFor = (fontName: string): { bold: boolean; italic: boolean } => {
      if (fontFlags.has(fontName)) return fontFlags.get(fontName)!
      let name = ""
      try {
        if (page.commonObjs?.has?.(fontName)) {
          const font = page.commonObjs.get(fontName)
          name = `${font?.name ?? ""} ${font?.loadedName ?? ""}`
        }
      } catch {
        /* ignore */
      }
      const family = textContent.styles?.[fontName]?.fontFamily ?? ""
      const probe = `${name} ${family}`
      const flags = { bold: fontIsBold(probe), italic: fontIsItalic(probe) }
      fontFlags.set(fontName, flags)
      return flags
    }

    // --- Lines -------------------------------------------------------------
    type Line = { y: number; size: number; runs: InlineRun[] }
    const lines: Line[] = []
    let current: { y: number; size: number; runs: InlineRun[] } | null = null
    for (const it of textContent.items as any[]) {
      if (typeof it?.str !== "string") continue
      const y = it.transform[5] as number
      const size = Math.abs(it.transform[3]) || it.height || 12
      const { bold, italic } = flagsFor(it.fontName)
      if (!current || Math.abs(y - current.y) > Math.max(2, size * 0.5)) {
        if (current) lines.push(current)
        current = { y, size, runs: [] }
      }
      const last = current.runs[current.runs.length - 1]
      if (last && last.bold === bold && last.italic === italic) {
        last.text += it.str
      } else {
        current.runs.push({ text: it.str, bold, italic })
      }
      current.size = Math.max(current.size, size)
      if (it.hasEOL) {
        lines.push(current)
        current = null
      }
    }
    if (current) lines.push(current)

    const textBlocks: TextBlock[] = lines
      .map((l) => ({ type: "text" as const, y: l.y, size: Math.round(l.size), runs: l.runs }))
      .filter((b) => b.runs.some((r) => r.text.trim().length > 0))
    for (const b of textBlocks) allSizes.push(b.size)

    // --- Images ------------------------------------------------------------
    const imageBlocks: ImageBlock[] = []
    if (opList && OPS) {
      try {
        let ctm = [1, 0, 0, 1, 0, 0]
        const stack: number[][] = []
        const mul = (m: number[], n: number[]) => [
          m[0] * n[0] + m[2] * n[1],
          m[1] * n[0] + m[3] * n[1],
          m[0] * n[2] + m[2] * n[3],
          m[1] * n[2] + m[3] * n[3],
          m[0] * n[4] + m[2] * n[5] + m[4],
          m[1] * n[4] + m[3] * n[5] + m[5],
        ]
        const pending: { name: string; topY: number }[] = []
        for (let i = 0; i < opList.fnArray.length; i += 1) {
          const fn = opList.fnArray[i]
          const args = opList.argsArray[i]
          if (fn === OPS.save) stack.push(ctm.slice())
          else if (fn === OPS.restore) ctm = stack.pop() ?? ctm
          else if (fn === OPS.transform) ctm = mul(ctm, args)
          else if (
            fn === OPS.paintImageXObject ||
            fn === OPS.paintJpegXObject ||
            fn === OPS.paintImageXObjectRepeat
          ) {
            const name = args?.[0]
            if (typeof name === "string") pending.push({ name, topY: ctm[5] + Math.abs(ctm[3]) })
          }
        }
        for (const p of pending) {
          const obj = await getPageObject(page, p.name)
          const src = obj ? imageToDataUri(obj) : null
          if (src) imageBlocks.push({ type: "image", y: p.topY, src })
        }
      } catch {
        /* images are optional — never fail the import over them */
      }
    }

    perPageBlocks.push([...textBlocks, ...imageBlocks])
  }

  // Body font size = most common rounded line size (fallback to median).
  const bodySize = estimateBodySize(allSizes)

  for (const blocks of perPageBlocks) {
    // Top-to-bottom: larger PDF y is higher on the page.
    blocks.sort((a, b) => b.y - a.y)
    pageHtml.push(blocksToHtml(blocks, bodySize))
  }

  const html = pageHtml.join("").trim()
  return html || "<p></p>"
}

function estimateBodySize(sizes: number[]): number {
  if (sizes.length === 0) return 12
  const counts = new Map<number, number>()
  for (const s of sizes) counts.set(s, (counts.get(s) ?? 0) + 1)
  let best = sizes[0]
  let bestCount = 0
  for (const [size, count] of counts) {
    if (count > bestCount) {
      best = size
      bestCount = count
    }
  }
  return best
}

function runsToHtml(runs: InlineRun[]): string {
  return runs
    .map((r) => {
      const text = escapeHtml(r.text)
      if (!text) return ""
      let out = text
      if (r.bold) out = `<strong>${out}</strong>`
      if (r.italic) out = `<em>${out}</em>`
      return out
    })
    .join("")
}

function lineText(b: TextBlock): string {
  return b.runs.map((r) => r.text).join("")
}

function blocksToHtml(blocks: Block[], bodySize: number): string {
  const out: string[] = []
  // Accumulators for merging consecutive paragraph lines / list items.
  let paraRuns: InlineRun[] | null = null
  let prevY: number | null = null
  let prevSize = bodySize
  let listItems: string[] = []
  let listType: "ul" | "ol" | null = null

  const flushPara = () => {
    if (paraRuns && paraRuns.some((r) => r.text.trim())) {
      out.push(`<p>${runsToHtml(paraRuns)}</p>`)
    }
    paraRuns = null
  }
  const flushList = () => {
    if (listType && listItems.length) {
      out.push(`<${listType}>${listItems.map((li) => `<li>${li}</li>`).join("")}</${listType}>`)
    }
    listItems = []
    listType = null
  }

  for (const block of blocks) {
    if (block.type === "image") {
      flushPara()
      flushList()
      out.push(`<p><img src="${block.src}" alt="" /></p>`)
      prevY = block.y
      continue
    }

    const raw = lineText(block).trim()
    if (!raw) continue

    // Heading?
    const ratio = block.size / bodySize
    const isHeading = ratio >= 1.15 && raw.length < 200
    // List item?
    const isBullet = BULLET_RE.test(raw)
    const isOrdered = !isBullet && ORDERED_RE.test(raw)

    if (isHeading) {
      flushPara()
      flushList()
      const level = ratio >= 1.6 ? 1 : ratio >= 1.3 ? 2 : 3
      out.push(`<h${level}>${runsToHtml(block.runs).trim()}</h${level}>`)
    } else if (isBullet || isOrdered) {
      flushPara()
      const nextType: "ul" | "ol" = isBullet ? "ul" : "ol"
      if (listType && listType !== nextType) flushList()
      listType = nextType
      const stripped = raw.replace(isBullet ? BULLET_RE : ORDERED_RE, "")
      listItems.push(escapeHtml(stripped))
    } else {
      flushList()
      // New paragraph when there's a large vertical gap from the previous line.
      const gap = prevY != null ? prevY - block.y : 0
      if (paraRuns && prevY != null && gap > prevSize * 1.8) {
        flushPara()
      }
      if (!paraRuns) paraRuns = []
      else paraRuns.push({ text: " ", bold: false, italic: false })
      paraRuns.push(...block.runs)
    }

    prevY = block.y
    prevSize = block.size
  }

  flushPara()
  flushList()
  return out.join("")
}

function getPageObject(page: any, name: string): Promise<any> {
  return new Promise((resolve) => {
    try {
      if (page.objs?.has?.(name)) {
        resolve(page.objs.get(name))
        return
      }
      page.objs.get(name, (obj: any) => resolve(obj))
    } catch {
      resolve(null)
    }
  })
}

function imageToDataUri(img: any): string | null {
  try {
    const width = img.width
    const height = img.height
    if (!width || !height || width * height > 25_000_000) return null
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d")
    if (!ctx) return null

    if (img.bitmap) {
      ctx.drawImage(img.bitmap, 0, 0)
    } else if (img.data) {
      const imageData = ctx.createImageData(width, height)
      const dst = imageData.data
      const src = img.data as Uint8Array | Uint8ClampedArray
      if (src.length === width * height * 4) {
        dst.set(src)
      } else if (src.length === width * height * 3) {
        for (let i = 0, j = 0; i < src.length; i += 3, j += 4) {
          dst[j] = src[i]
          dst[j + 1] = src[i + 1]
          dst[j + 2] = src[i + 2]
          dst[j + 3] = 255
        }
      } else if (src.length === width * height) {
        for (let i = 0, j = 0; i < src.length; i += 1, j += 4) {
          dst[j] = dst[j + 1] = dst[j + 2] = src[i]
          dst[j + 3] = 255
        }
      } else {
        return null
      }
      ctx.putImageData(imageData, 0, 0)
    } else {
      return null
    }
    return canvas.toDataURL("image/png")
  } catch {
    return null
  }
}
