import type { MutableRefObject } from "react"

type PdfDoc = {
  getDestination?: (id: string) => Promise<unknown>
  getPage: (n: number) => Promise<PdfPage>
  getPageIndex: (ref: unknown) => Promise<number>
  cachedPageNumber?: (ref: unknown) => number | undefined
}

type PdfPage = {
  getViewport: (opts: { scale: number }) => {
    convertToViewportPoint: (x: number, y: number) => [number, number]
  }
}

function destMode(raw: unknown): string | null {
  if (raw == null) return null
  if (typeof raw === "string") return raw
  if (typeof raw === "object" && raw !== null && "name" in raw) {
    return String((raw as { name: string }).name)
  }
  return null
}

function isRefLike(v: unknown): v is { num: number; gen: number } {
  return (
    v != null &&
    typeof v === "object" &&
    typeof (v as { num?: unknown }).num === "number" &&
    typeof (v as { gen?: unknown }).gen === "number"
  )
}

/**
 * Minimal link service for pdf.js AnnotationLayer: external URLs open in a new tab;
 * internal /Dest navigates within our multi-page scroll viewer, including XYZ/FitH/FitR
 * vertical offsets so inline citations land on the correct line in the references block.
 */
export class LiteraturePdfLinkService {
  externalLinkEnabled = true
  pdfDocument: unknown = null
  eventBus: undefined = undefined
  /** Must match `fitScale * zoom` in LiteraturePdfViewer so dest Y maps to layout pixels. */
  private displayScale = 1

  constructor(
    private readonly navigateToPageRef: MutableRefObject<(pageNumber: number, yWithinPage?: number) => void>
  ) {}

  setDocument(doc: unknown) {
    this.pdfDocument = doc
  }

  setDisplayScale(scale: number) {
    if (Number.isFinite(scale) && scale > 0) {
      this.displayScale = scale
    }
  }

  addLinkAttributes(link: HTMLAnchorElement, url: string, newWindow = false) {
    if (!url || typeof url !== "string") return
    link.href = url
    link.title = url
    link.target = newWindow ? "_blank" : "_blank"
    link.rel = "noopener noreferrer"
  }

  getDestinationHash(_dest: unknown): string {
    return "#"
  }

  getAnchorUrl(anchor: string): string {
    return anchor || "#"
  }

  private async resolveExplicitDest(doc: PdfDoc, dest: unknown): Promise<unknown[] | null> {
    if (typeof dest === "string") {
      const d = await doc.getDestination?.(dest)
      return Array.isArray(d) ? d : null
    }
    if (dest != null && typeof (dest as Promise<unknown>).then === "function") {
      const d = await dest
      return Array.isArray(d) ? d : null
    }
    if (Array.isArray(dest)) return dest
    return null
  }

  private async resolvePageNumber(doc: PdfDoc, destRef: unknown): Promise<number | null> {
    if (Number.isInteger(destRef)) {
      return (destRef as number) + 1
    }
    if (isRefLike(destRef)) {
      let pageNumber = doc.cachedPageNumber?.(destRef)
      if (!pageNumber) {
        pageNumber = (await doc.getPageIndex(destRef)) + 1
      }
      return pageNumber
    }
    return null
  }

  /**
   * PDF user-space Y (and optional X) → distance from top of the page box in viewer CSS px.
   */
  private async yWithinPageFromExplicitDest(
    doc: PdfDoc,
    pageNumber: number,
    explicitDest: unknown[]
  ): Promise<number | undefined> {
    const mode = destMode(explicitDest[1])
    if (!mode) return undefined

    const page = await doc.getPage(pageNumber)
    const viewport = page.getViewport({ scale: this.displayScale })

    const yFromPdfPoint = (x: number, y: number): number => {
      const [, vy] = viewport.convertToViewportPoint(x, y)
      return vy
    }

    switch (mode) {
      case "XYZ": {
        const left = explicitDest[2]
        const top = explicitDest[3]
        if (typeof top !== "number") return undefined
        const x = typeof left === "number" ? left : 0
        return yFromPdfPoint(x, top)
      }
      case "FitH":
      case "FitBH": {
        const top = explicitDest[2]
        if (typeof top !== "number") return undefined
        return yFromPdfPoint(0, top)
      }
      case "FitR": {
        const top = explicitDest[5]
        if (typeof top !== "number") return undefined
        return yFromPdfPoint(0, top)
      }
      case "FitV":
      case "FitBV":
        return undefined
      default:
        return undefined
    }
  }

  async goToDestination(dest: unknown) {
    const doc = this.pdfDocument as PdfDoc | null
    if (!doc?.getPage) return
    try {
      const explicitDest = await this.resolveExplicitDest(doc, dest)
      if (!explicitDest || explicitDest.length < 2) return

      const pageNumber = await this.resolvePageNumber(doc, explicitDest[0])
      if (!pageNumber || pageNumber < 1) return

      const yWithinPage = await this.yWithinPageFromExplicitDest(doc, pageNumber, explicitDest)
      this.navigateToPageRef.current(pageNumber, yWithinPage)
    } catch {
      /* invalid dest */
    }
  }

  goToPage(val: unknown) {
    const n = typeof val === "number" ? val : Number.parseInt(String(val), 10)
    if (Number.isFinite(n) && n >= 1) {
      this.navigateToPageRef.current(n)
    }
  }

  executeNamedAction(_action: string) {}

  executeSetOCGState(_action: unknown) {}
}
