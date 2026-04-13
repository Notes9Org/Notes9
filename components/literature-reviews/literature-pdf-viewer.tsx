"use client"

import "pdfjs-dist/web/pdf_viewer.css"

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react"
import { Copy, ExternalLink, Highlighter, Loader2, StickyNote, ZoomIn, ZoomOut } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { TiptapEditor } from "@/components/text-editor/tiptap-editor"
import { useToast } from "@/hooks/use-toast"
import { LiteraturePdfLinkService } from "@/lib/literature-pdf-link-service"
import { fuzzyFindExcerpt } from "@/lib/fuzzy-text-match"
import type { LiteraturePdfAnnotation } from "@/types/literature-pdf"

export type LiteraturePdfViewerHandle = {
  scrollToAnnotation: (annotation: LiteraturePdfAnnotation) => void
  /** Search the PDF text layer for `excerpt` and temporarily highlight the best match. */
  highlightExcerpt: (excerpt: string, pageHint?: number) => Promise<boolean>
  clearExcerptHighlight: () => void
}

type RagHighlightRect = {
  pageNumber: number
  rects: Array<{ top: number; left: number; width: number; height: number }>
}

interface LiteraturePdfViewerProps {
  /** URL passed to pdf.js (often same-origin `/api/.../viewer-pdf`). */
  pdfUrl: string
  /** Optional direct storage/public URL for “Open in new tab” when `pdfUrl` is an API proxy. */
  externalOpenUrl?: string
  annotations: LiteraturePdfAnnotation[]
  onCreateAnnotation: (payload: {
    type: "highlight" | "note" | "comment"
    page_number: number
    quote_text?: string | null
    comment_text?: string | null
    color?: string | null
    rects?: Array<{ top: number; left: number; width: number; height: number }> | null
    anchor?: Record<string, unknown> | null
  }) => Promise<void>
}

type PdfSelectionState = {
  pageNumber: number
  text: string
  rects: Array<{ top: number; left: number; width: number; height: number }>
  anchor: { x: number; y: number }
  toolbarX: number
  toolbarY: number
}

type ComposerState = {
  open: boolean
  pageNumber: number
  quoteText: string | null
  rects: Array<{ top: number; left: number; width: number; height: number }> | null
  anchor: Record<string, unknown> | null
  content: string
}

function LiteraturePdfPageBlock({
  pageNumber,
  pdfDocument,
  fitScale,
  zoom,
  pageAnnotations,
  ragHighlightRects,
  selectionState,
  onSelectionChangeRef,
  onPagePointerDown,
  onCopySelection,
  onHighlightSelection,
  onNoteSelection,
  focusedAnnotationId,
  linkService,
}: {
  pageNumber: number
  pdfDocument: any
  fitScale: number
  zoom: number
  pageAnnotations: LiteraturePdfAnnotation[]
  ragHighlightRects: Array<{ top: number; left: number; width: number; height: number }>
  selectionState: PdfSelectionState | null
  onSelectionChangeRef: MutableRefObject<(pageNum: number, next: PdfSelectionState | null) => void>
  onPagePointerDown: (pageNum: number, relative: { x: number; y: number }) => void
  onCopySelection: () => void
  onHighlightSelection: () => void
  onNoteSelection: () => void
  focusedAnnotationId: string | null
  linkService: LiteraturePdfLinkService
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const textLayerRef = useRef<HTMLDivElement | null>(null)
  const annotationLayerRef = useRef<HTMLDivElement | null>(null)
  const pageRef = useRef<HTMLDivElement | null>(null)
  const renderTaskRef = useRef<any>(null)
  const textLayerTaskRef = useRef<any>(null)
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    let isActive = true
    let textLayer: any = null

    async function render() {
      if (!pdfDocument || !canvasRef.current || !textLayerRef.current || !annotationLayerRef.current) return
      const page = await pdfDocument.getPage(pageNumber)
      const scale = fitScale * zoom
      const viewport = page.getViewport({ scale })
      const canvas = canvasRef.current
      const textLayerContainer = textLayerRef.current
      const pageContainer = pageRef.current
      const context = canvas.getContext("2d")
      const outputScale = Math.max(1, Math.min(3, window.devicePixelRatio || 1.5))

      if (!context || !pageContainer) return
      canvas.width = Math.floor(viewport.width * outputScale)
      canvas.height = Math.floor(viewport.height * outputScale)
      canvas.style.width = `${viewport.width}px`
      canvas.style.height = `${viewport.height}px`
      pageContainer.style.width = `${viewport.width}px`
      pageContainer.style.height = `${viewport.height}px`
      pageContainer.style.setProperty("--scale-factor", `${viewport.scale}`)
      textLayerContainer.replaceChildren()
      textLayerContainer.style.width = `${viewport.width}px`
      textLayerContainer.style.height = `${viewport.height}px`
      textLayerContainer.style.setProperty("--scale-factor", `${viewport.scale}`)
      setViewportSize({ width: viewport.width, height: viewport.height })

      renderTaskRef.current?.cancel?.()
      textLayerTaskRef.current?.cancel?.()
      context.setTransform(1, 0, 0, 1, 0, 0)
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.setTransform(outputScale, 0, 0, outputScale, 0, 0)
      const renderTask = page.render({ canvasContext: context, viewport })
      renderTaskRef.current = renderTask
      await renderTask.promise
      const pdfjsLib: any = await import("pdfjs-dist/legacy/build/pdf.mjs")
      textLayer = new pdfjsLib.TextLayer({
        textContentSource: page.streamTextContent({
          includeMarkedContent: true,
          disableNormalization: true,
        }),
        container: textLayerContainer,
        viewport,
      })
      textLayerTaskRef.current = textLayer
      await textLayer.render()
      if (!isActive) return

      const annDiv = annotationLayerRef.current
      annDiv.replaceChildren()
      annDiv.style.width = `${viewport.width}px`
      annDiv.style.height = `${viewport.height}px`
      annDiv.style.setProperty("--scale-factor", `${viewport.scale}`)
      const rawAnnotations = await page.getAnnotations({ intent: "display" })
      const linkAnnotationType = pdfjsLib.AnnotationType?.LINK ?? 2
      const annotationList = rawAnnotations.filter(
        (a: { annotationType?: number }) => a.annotationType === linkAnnotationType
      )
      const annLayer = new pdfjsLib.AnnotationLayer({
        div: annDiv,
        page,
        viewport,
      })
      await annLayer.render({
        annotations: annotationList,
        linkService,
      })
    }

    render().catch((renderError) => {
      const message = String(renderError?.message || renderError || "")
      const name = String(renderError?.name || "")
      if (
        name === "AbortException" ||
        message.includes("cancelled") ||
        message.includes("multiple render() operations")
      ) {
        return
      }
      console.error(renderError)
    })

    return () => {
      isActive = false
      renderTaskRef.current?.cancel?.()
      renderTaskRef.current = null
      textLayerTaskRef.current?.cancel?.()
      textLayerTaskRef.current = null
      textLayer?.cancel?.()
      annotationLayerRef.current?.replaceChildren()
    }
  }, [fitScale, linkService, pageNumber, pdfDocument, zoom])

  const handlePointerUp = useCallback(() => {
    window.setTimeout(() => {
      const selection = window.getSelection()
      const textLayerContainer = textLayerRef.current
      const pageContainer = pageRef.current
      if (!selection || !textLayerContainer || !pageContainer || selection.rangeCount === 0) {
        onSelectionChangeRef.current(pageNumber, null)
        return
      }

      const text = selection.toString().trim()
      const range = selection.getRangeAt(0)
      const anchorNode = selection.anchorNode
      const focusNode = selection.focusNode
      if (
        !text ||
        !anchorNode ||
        !focusNode ||
        !textLayerContainer.contains(anchorNode) ||
        !textLayerContainer.contains(focusNode)
      ) {
        onSelectionChangeRef.current(pageNumber, null)
        return
      }

      const layerRect = textLayerContainer.getBoundingClientRect()
      const pageRect = pageContainer.getBoundingClientRect()
      const rects = Array.from(range.getClientRects())
        .filter((rect) => rect.width > 0 && rect.height > 0)
        .map((rect) => ({
          left: (rect.left - layerRect.left) / layerRect.width,
          top: (rect.top - layerRect.top) / layerRect.height,
          width: rect.width / layerRect.width,
          height: rect.height / layerRect.height,
        }))

      if (rects.length === 0) {
        onSelectionChangeRef.current(pageNumber, null)
        return
      }

      const focusRect = range.getBoundingClientRect()
      onSelectionChangeRef.current(pageNumber, {
        pageNumber,
        text,
        rects,
        anchor: {
          x: Math.min(0.98, Math.max(0.02, (focusRect.left - layerRect.left + focusRect.width / 2) / layerRect.width)),
          y: Math.min(0.98, Math.max(0.02, (focusRect.top - layerRect.top) / layerRect.height)),
        },
        toolbarX: focusRect.left - pageRect.left + focusRect.width / 2,
        toolbarY: focusRect.top - pageRect.top - 44,
      })
    }, 0)
  }, [onSelectionChangeRef, pageNumber])

  return (
    <div className="mb-6 last:mb-0">
      <div
        ref={pageRef}
        data-pdf-page={pageNumber}
        className="relative overflow-hidden rounded border bg-white shadow-sm"
        style={{
          width: viewportSize.width || undefined,
          height: viewportSize.height || undefined,
        }}
        onMouseUp={handlePointerUp}
        onMouseDown={(event) => {
          const el = pageRef.current
          if (!el) return
          const rect = el.getBoundingClientRect()
          onPagePointerDown(pageNumber, {
            x: (event.clientX - rect.left) / rect.width,
            y: (event.clientY - rect.top) / rect.height,
          })
        }}
      >
        <canvas ref={canvasRef} className="absolute inset-0 block bg-white" />
        <div ref={textLayerRef} className="n9-pdf-text-layer textLayer absolute inset-0 overflow-hidden" />
        <div
          ref={annotationLayerRef}
          className="annotationLayer absolute inset-0 z-[2] overflow-hidden"
          aria-hidden={false}
        />
        {pageAnnotations.map((annotation) =>
          annotation.rects?.map((rect, index) => (
            <div
              key={`${annotation.id}-${index}`}
              data-pdf-annotation-target={annotation.id}
              className={`pointer-events-none absolute z-[1] rounded-sm transition-shadow duration-300 ${
                annotation.type === "comment"
                  ? "bg-sky-300/22 shadow-[inset_0_0_0_1px_rgba(14,165,233,0.45)]"
                  : annotation.type === "note"
                    ? "bg-lime-300/20 shadow-[inset_0_0_0_1px_rgba(132,204,22,0.45)]"
                    : "bg-amber-300/28 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.5)]"
              } ${focusedAnnotationId === annotation.id ? "z-[4] ring-2 ring-primary ring-offset-2 ring-offset-white dark:ring-offset-zinc-950" : ""}`}
              style={{
                left: `${rect.left * 100}%`,
                top: `${rect.top * 100}%`,
                width: `${rect.width * 100}%`,
                height: `${rect.height * 100}%`,
              }}
            />
          ))
        )}
        {pageAnnotations
          .filter((annotation) => !annotation.rects?.length && annotation.anchor)
          .map((annotation) => {
            const anchor = annotation.anchor as { x?: number; y?: number }
            return (
              <div
                key={annotation.id}
                data-pdf-annotation-target={annotation.id}
                className={`pointer-events-none absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-lime-500/70 bg-lime-200/90 text-lime-900 shadow transition-shadow duration-300 ${
                  focusedAnnotationId === annotation.id ? "z-[4] ring-2 ring-primary ring-offset-2 ring-offset-white dark:ring-offset-zinc-950" : ""
                }`}
                style={{
                  left: `${(anchor.x ?? 0.5) * 100}%`,
                  top: `${(anchor.y ?? 0.1) * 100}%`,
                }}
              >
                <StickyNote className="h-3.5 w-3.5" />
              </div>
            )
          })}
        {ragHighlightRects.map((rect, index) => (
          <div
            key={`rag-hl-${index}`}
            className="pdf-rag-highlight pointer-events-none"
            style={{
              left: `${rect.left * 100}%`,
              top: `${rect.top * 100}%`,
              width: `${rect.width * 100}%`,
              height: `${rect.height * 100}%`,
            }}
          />
        ))}
        {selectionState?.pageNumber === pageNumber && (
          <div
            className="absolute z-20 flex items-center gap-1 rounded-full border bg-background/95 p-1 shadow-lg"
            style={{
              left: selectionState.toolbarX,
              top: Math.max(8, selectionState.toolbarY),
              transform: "translateX(-50%)",
              maxWidth: "calc(100vw - 2rem)",
            }}
          >
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onCopySelection} title="Copy">
              <Copy className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onHighlightSelection} title="Highlight">
              <Highlighter className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onNoteSelection} title="Note">
              <StickyNote className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

/** Top edge of `element` within `scrollContainer`'s scrollable content (matches scrollTop coordinates). */
function elementTopInScrollContent(element: HTMLElement, scrollContainer: HTMLElement): number {
  return (
    element.getBoundingClientRect().top -
    scrollContainer.getBoundingClientRect().top +
    scrollContainer.scrollTop
  )
}

function normalizeRect(r: { top: number; left: number; width: number; height: number }) {
  return {
    top: Number(r.top),
    left: Number(r.left),
    width: Number(r.width),
    height: Number(r.height),
  }
}

/** Vertical center (px from top of page box) of the union of normalized 0–1 rects. */
function highlightCenterYWithinPage(
  rects: Array<{ top: number; left: number; width: number; height: number }>,
  pageHeightPx: number
): number {
  const n = rects.map(normalizeRect)
  const minTop = Math.min(...n.map((r) => r.top))
  const maxBottom = Math.max(...n.map((r) => r.top + r.height))
  const midFrac = (minTop + maxBottom) / 2
  return midFrac * pageHeightPx
}

export const LiteraturePdfViewer = forwardRef<LiteraturePdfViewerHandle, LiteraturePdfViewerProps>(
  function LiteraturePdfViewer({ pdfUrl, externalOpenUrl, annotations, onCreateAnnotation }, ref) {
  const { toast } = useToast()
  const viewportFrameRef = useRef<HTMLDivElement | null>(null)
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null)
  const focusClearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [pdfDocument, setPdfDocument] = useState<any>(null)
  const [pageCount, setPageCount] = useState(0)
  const [renderedEndPage, setRenderedEndPage] = useState(1)
  const [navigateRequest, setNavigateRequest] = useState<LiteraturePdfAnnotation | null>(null)
  const [focusedAnnotationId, setFocusedAnnotationId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [fitScale, setFitScale] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectionState, setSelectionState] = useState<PdfSelectionState | null>(null)
  const [lastPointer, setLastPointer] = useState<{ pageNumber: number; x: number; y: number } | null>(null)
  const [composerState, setComposerState] = useState<ComposerState>({
    open: false,
    pageNumber: 1,
    quoteText: null,
    rects: null,
    anchor: null,
    content: "",
  })
  const [ragHighlightRects, setRagHighlightRects] = useState<RagHighlightRect[]>([])
  const ragHighlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const onSelectionChangeRef = useRef((pageNum: number, next: PdfSelectionState | null) => {
    setSelectionState((current) => {
      if (next === null) {
        if (current?.pageNumber === pageNum) return null
        return current
      }
      return next
    })
  })

  const navigateToPdfPageRef = useRef<(pageNumber: number, yWithinPage?: number) => void>(() => {})

  const scrollPdfToPage = useCallback((pageNumber: number, yWithinPage?: number) => {
    setRenderedEndPage((p) => Math.max(p, pageNumber))

    const runScroll = (attempts = 0) => {
      const frame = viewportFrameRef.current
      if (!frame) return
      const el = frame.querySelector(`[data-pdf-page="${pageNumber}"]`) as HTMLElement | null
      if (!el || el.offsetHeight < 2) {
        if (attempts < 60) requestAnimationFrame(() => runScroll(attempts + 1))
        return
      }
      if (yWithinPage != null && Number.isFinite(yWithinPage)) {
        const pageTop = elementTopInScrollContent(el, frame)
        const centerOffset = frame.clientHeight / 2
        // Nudge scroll slightly further down so the match sits a bit below dead-center (easier to read).
        const scrollNudgeDown = Math.round(frame.clientHeight * 0.15)
        const desiredTop = pageTop + yWithinPage - centerOffset + scrollNudgeDown
        const maxScroll = Math.max(0, frame.scrollHeight - frame.clientHeight)
        frame.scrollTo({ top: Math.max(0, Math.min(desiredTop, maxScroll)), behavior: "smooth" })
      } else {
        el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" })
      }
    }

    requestAnimationFrame(() => requestAnimationFrame(() => runScroll(0)))
  }, [])

  useEffect(() => {
    navigateToPdfPageRef.current = scrollPdfToPage
  }, [scrollPdfToPage])

  const linkService = useMemo(() => new LiteraturePdfLinkService(navigateToPdfPageRef), [])

  useEffect(() => {
    linkService.setDocument(pdfDocument ?? null)
  }, [linkService, pdfDocument])

  useEffect(() => {
    linkService.setDisplayScale(fitScale * zoom)
  }, [linkService, fitScale, zoom])

  useImperativeHandle(ref, () => ({
    scrollToAnnotation(annotation: LiteraturePdfAnnotation) {
      if (focusClearTimeoutRef.current) {
        clearTimeout(focusClearTimeoutRef.current)
        focusClearTimeoutRef.current = null
      }
      setFocusedAnnotationId(null)
      setRenderedEndPage((p) => Math.max(p, annotation.page_number))
      setNavigateRequest(annotation)
    },

    async highlightExcerpt(excerpt: string, pageHint?: number): Promise<boolean> {
      if (!pdfDocument || !excerpt.trim()) return false

      // Clear any existing RAG highlight
      if (ragHighlightTimerRef.current) clearTimeout(ragHighlightTimerRef.current)
      setRagHighlightRects([])

      const totalPages: number = pdfDocument.numPages ?? pageCount

      // Build ordered page list: hint page first, then neighbours, then rest
      const order: number[] = []
      if (pageHint && pageHint >= 1 && pageHint <= totalPages) {
        order.push(pageHint)
        for (let d = 1; d <= 3; d++) {
          if (pageHint - d >= 1) order.push(pageHint - d)
          if (pageHint + d <= totalPages) order.push(pageHint + d)
        }
      }
      for (let p = 1; p <= totalPages; p++) {
        if (!order.includes(p)) order.push(p)
      }

      for (const pgNum of order) {
        try {
          const page = await pdfDocument.getPage(pgNum)
          const textContent = await page.getTextContent({ includeMarkedContent: false })
          const items: Array<{ str: string; transform: number[]; width: number; height: number }> = textContent.items

          // Build concatenated text with space separators between items so that
          // words split across items don't run together for the fuzzy matcher.
          // itemMap[charIdx] holds the items[] index for that character (-1 for separators).
          let fullText = ""
          const itemMap: number[] = []
          for (let ii = 0; ii < items.length; ii++) {
            const item = items[ii]
            if (!item.str) continue
            if (fullText.length > 0) {
              fullText += " "
              itemMap.push(-1) // separator
            }
            for (let ci = 0; ci < item.str.length; ci++) {
              itemMap.push(ii)
            }
            fullText += item.str
          }

          if (!fullText.trim()) continue
          const match = fuzzyFindExcerpt(fullText, excerpt, { threshold: 0.3 })
          if (!match || match.score < 0.3) continue

          // Collect which items are covered by the matched range
          const matchedItemIndices = new Set<number>()
          for (let ci = match.start; ci < match.end && ci < itemMap.length; ci++) {
            const idx = itemMap[ci]
            if (idx >= 0) matchedItemIndices.add(idx)
          }
          if (matchedItemIndices.size === 0) continue

          const baseViewport = page.getViewport({ scale: 1 })
          const pw = baseViewport.width
          const ph = baseViewport.height

          // Build one rect per matched item.
          // PDF coordinates: origin bottom-left, y increases upward.
          // CSS coordinates: origin top-left, y increases downward.
          // text TOP (CSS) = 1 - (ty + fontSize) / ph
          // highlight HEIGHT = fontSize * 1.3 / ph  (covers ascenders + slight leading)
          const rects: Array<{ top: number; left: number; width: number; height: number }> = []
          for (const ii of [...matchedItemIndices].sort((a, b) => a - b)) {
            const item = items[ii]
            if (!item.str || !item.transform) continue
            const tx = item.transform[4]
            const ty = item.transform[5]
            const fontSize = Math.abs(item.transform[3]) || Math.abs(item.transform[0]) || 12
            const iw = item.width > 0 ? item.width : item.str.length * fontSize * 0.55
            rects.push({
              left: tx / pw,
              top: 1 - (ty + fontSize) / ph,
              width: iw / pw,
              height: (fontSize * 1.3) / ph,
            })
          }

          if (rects.length === 0) continue

          // Ensure the page is rendered
          setRenderedEndPage((p) => Math.max(p, pgNum))
          setRagHighlightRects([{ pageNumber: pgNum, rects }])

          // Scroll to the highlight, centered vertically.
          // yWithinPage must be in rendered pixel units (base × scale).
          const renderedY = rects[0].top * ph * fitScale * zoom
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              scrollPdfToPage(pgNum, renderedY)
            })
          })

          // Fade then remove after 12 seconds
          ragHighlightTimerRef.current = setTimeout(() => {
            document.querySelectorAll('.pdf-rag-highlight').forEach((el) => el.classList.add('fading'))
            setTimeout(() => {
              setRagHighlightRects([])
              ragHighlightTimerRef.current = null
            }, 1_200)
          }, 12_000)

          return true
        } catch {
          continue
        }
      }
      return false
    },

    clearExcerptHighlight() {
      if (ragHighlightTimerRef.current) clearTimeout(ragHighlightTimerRef.current)
      setRagHighlightRects([])
      ragHighlightTimerRef.current = null
    },
  }))

  useEffect(() => {
    let isActive = true
    setIsLoading(true)
    setError(null)
    setRenderedEndPage(1)

    async function load() {
      try {
        const pdfjsLib: any = await import("pdfjs-dist/legacy/build/pdf.mjs")
        if (!pdfjsLib.GlobalWorkerOptions.workerPort) {
          pdfjsLib.GlobalWorkerOptions.workerPort = new Worker(
            new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url),
            { type: "module" }
          )
        }

        const task = pdfjsLib.getDocument({
          url: pdfUrl,
          withCredentials: true,
        })
        const document = await task.promise
        if (!isActive) return
        setPdfDocument(document)
        const n = document.numPages ?? 0
        setPageCount(n)
        setRenderedEndPage(n > 0 ? Math.min(3, n) : 1)
      } catch (loadError) {
        console.error(loadError)
        if (isActive) {
          const detail =
            loadError instanceof Error ? loadError.message : typeof loadError === "string" ? loadError : "Unknown error"
          setError(`Could not load PDF. ${detail}`)
        }
      } finally {
        if (isActive) setIsLoading(false)
      }
    }

    load()
    return () => {
      isActive = false
    }
  }, [pdfUrl])

  useEffect(() => {
    if (!pdfDocument || !viewportFrameRef.current) return

    let cancelled = false
    let resizeObserver: ResizeObserver | null = null

    const updateFitScale = async () => {
      if (!pdfDocument || !viewportFrameRef.current) return
      const page = await pdfDocument.getPage(1)
      if (cancelled || !viewportFrameRef.current) return

      const baseViewport = page.getViewport({ scale: 1 })
      const frameWidth = Math.max(320, viewportFrameRef.current.clientWidth - 32)
      const nextFitScale = frameWidth / baseViewport.width

      setFitScale(Math.max(0.6, Math.min(2.2, nextFitScale)))
    }

    updateFitScale().catch(console.error)

    resizeObserver = new ResizeObserver(() => {
      updateFitScale().catch(console.error)
    })
    resizeObserver.observe(viewportFrameRef.current)

    return () => {
      cancelled = true
      resizeObserver?.disconnect()
    }
  }, [pdfDocument])

  useEffect(() => {
    const root = viewportFrameRef.current
    const target = loadMoreSentinelRef.current
    if (!root || !target || pageCount <= 0 || renderedEndPage >= pageCount) return

    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setRenderedEndPage((p) => Math.min(pageCount, p + 2))
        }
      },
      { root, rootMargin: "320px", threshold: 0 }
    )
    io.observe(target)
    return () => io.disconnect()
  }, [pageCount, renderedEndPage])

  useEffect(() => {
    if (!navigateRequest || !viewportFrameRef.current) return
    const ann = navigateRequest
    if (renderedEndPage < ann.page_number) return

    let cancelled = false
    let attempts = 0

    const run = () => {
      if (cancelled) return
      attempts += 1
      const frame = viewportFrameRef.current
      if (!frame) return
      const pageEl = frame.querySelector(`[data-pdf-page="${ann.page_number}"]`) as HTMLElement | null
      if (!pageEl || pageEl.offsetHeight < 2) {
        if (attempts < 55) requestAnimationFrame(run)
        return
      }

      const markers = pageEl.querySelectorAll(`[data-pdf-annotation-target="${CSS.escape(ann.id)}"]`)
      if (markers.length > 0) {
        const mid = markers[Math.floor((markers.length - 1) / 2)] as HTMLElement
        mid.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" })
      } else {
        const rects = ann.rects
        const anchor = ann.anchor as { y?: number } | undefined
        const pageHeight = pageEl.getBoundingClientRect().height
        let yWithinPagePx: number
        if (rects && rects.length > 0) {
          yWithinPagePx = highlightCenterYWithinPage(rects, pageHeight)
        } else if (typeof anchor?.y === "number") {
          yWithinPagePx = anchor.y * pageHeight
        } else {
          yWithinPagePx = 0.22 * pageHeight
        }

        const pageTop = elementTopInScrollContent(pageEl, frame)
        const margin = Math.min(120, frame.clientHeight * 0.28)
        const desiredTop = pageTop + yWithinPagePx - margin
        const maxScroll = Math.max(0, frame.scrollHeight - frame.clientHeight)
        frame.scrollTo({ top: Math.max(0, Math.min(desiredTop, maxScroll)), behavior: "smooth" })
      }

      setFocusedAnnotationId(ann.id)
      setNavigateRequest(null)
      focusClearTimeoutRef.current = setTimeout(() => {
        setFocusedAnnotationId(null)
        focusClearTimeoutRef.current = null
      }, 2600)
    }

    requestAnimationFrame(() => requestAnimationFrame(run))
    return () => {
      cancelled = true
    }
  }, [navigateRequest, renderedEndPage])

  const clearSelection = useCallback(() => {
    setSelectionState(null)
    window.getSelection()?.removeAllRanges()
  }, [])

  useEffect(() => {
    clearSelection()
  }, [fitScale, zoom, clearSelection])

  const openNoteComposerFromSelection = useCallback(() => {
    if (!selectionState) return
    setComposerState({
      open: true,
      pageNumber: selectionState.pageNumber,
      quoteText: selectionState.text,
      rects: selectionState.rects,
      anchor: selectionState.anchor,
      content: "",
    })
  }, [selectionState])

  const openNoteComposerFromPage = useCallback(() => {
    const pageNumber = lastPointer?.pageNumber ?? 1
    setComposerState({
      open: true,
      pageNumber,
      quoteText: null,
      rects: null,
      anchor: {
        x: lastPointer?.x ?? 0.5,
        y: lastPointer?.y ?? 0.08,
      },
      content: "",
    })
  }, [lastPointer])

  const createSelectionAnnotation = useCallback(
    async (type: "highlight" | "note") => {
      if (!selectionState) return
      try {
        if (type === "note") {
          openNoteComposerFromSelection()
          return
        }

        await onCreateAnnotation({
          type,
          page_number: selectionState.pageNumber,
          quote_text: selectionState.text,
          comment_text: null,
          color: "#fde68a",
          rects: selectionState.rects,
          anchor: selectionState.anchor,
        })
        clearSelection()
        toast({ title: `${type[0].toUpperCase()}${type.slice(1)} saved` })
      } catch (creationError: any) {
        toast({
          title: `Failed to save ${type}`,
          description: creationError.message,
          variant: "destructive",
        })
      }
    },
    [clearSelection, onCreateAnnotation, openNoteComposerFromSelection, selectionState, toast]
  )

  const copySelection = useCallback(async () => {
    if (!selectionState) return
    try {
      await navigator.clipboard.writeText(selectionState.text)
      toast({ title: "Copied selection" })
    } catch {
      toast({
        title: "Copy failed",
        description: "Use your system copy shortcut for this selection.",
        variant: "destructive",
      })
    }
  }, [selectionState, toast])

  const saveComposer = async () => {
    if (!composerState.content.trim()) return

    try {
      await onCreateAnnotation({
        type: "note",
        page_number: composerState.pageNumber,
        quote_text: composerState.quoteText,
        comment_text: composerState.content,
        color: "#d9f99d",
        rects: composerState.rects,
        anchor: composerState.anchor,
      })
      setComposerState((current) => ({ ...current, open: false, content: "" }))
      clearSelection()
      toast({ title: "Note saved" })
    } catch (creationError: any) {
      toast({
        title: "Failed to save note",
        description: creationError.message,
        variant: "destructive",
      })
    }
  }

  const onPagePointerDown = useCallback((pageNumber: number, relative: { x: number; y: number }) => {
    setLastPointer({ pageNumber, ...relative })
  }, [])

  const pageNumbers = Array.from({ length: Math.min(renderedEndPage, pageCount) }, (_, i) => i + 1)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-background/80 p-2 sm:p-3">
        <div className="text-xs text-muted-foreground sm:text-sm">
          {pageCount > 0 ? (
            <>
              Pages 1–{Math.min(renderedEndPage, pageCount)} of {pageCount}
              {renderedEndPage < pageCount ? " · scroll for more" : ""}
            </>
          ) : (
            "—"
          )}
        </div>
        <div className="flex w-full items-center justify-end gap-2 sm:ml-auto sm:w-auto">
          <Button variant="outline" size="icon" className="h-8 w-8 sm:h-9 sm:w-9" onClick={() => setZoom((current) => Math.max(0.75, current - 0.1))}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <div className="w-14 text-center text-xs text-muted-foreground sm:w-16 sm:text-sm">{Math.round(fitScale * zoom * 100)}%</div>
          <Button variant="outline" size="icon" className="h-8 w-8 sm:h-9 sm:w-9" onClick={() => setZoom((current) => Math.min(3, current + 0.1))}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8 sm:h-9 sm:w-9" onClick={openNoteComposerFromPage} title="Add note">
            <StickyNote className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs sm:h-9 sm:px-3 sm:text-sm" asChild>
            <a href={externalOpenUrl ?? pdfUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              Open
            </a>
          </Button>
        </div>
      </div>

      <div
        ref={viewportFrameRef}
        data-literature-pdf-viewport
        className="relative max-h-[min(80vh,56rem)] overflow-auto rounded-lg border bg-muted/30 p-2 sm:p-4"
      >
        {isLoading && (
          <div className="flex min-h-[24rem] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {error && !isLoading && (
          <div className="flex min-h-[24rem] flex-col items-center justify-center gap-2 px-4 text-center text-sm text-destructive">
            <p>{error}</p>
            <p className="max-w-md text-xs font-normal text-muted-foreground">
              The reader loads PDFs through your login session. If a direct storage link fails in the browser, use Open or
              re-upload the file from the literature tab.
            </p>
          </div>
        )}
        <div className={`${isLoading || error ? "hidden" : "block"} relative mx-auto w-fit max-w-full`}>
          {pageNumbers.map((num) => (
            <LiteraturePdfPageBlock
              key={num}
              pageNumber={num}
              pdfDocument={pdfDocument}
              fitScale={fitScale}
              zoom={zoom}
              pageAnnotations={annotations.filter((a) => a.page_number === num)}
              ragHighlightRects={ragHighlightRects.find((r) => r.pageNumber === num)?.rects ?? []}
              selectionState={selectionState}
              onSelectionChangeRef={onSelectionChangeRef}
              onPagePointerDown={onPagePointerDown}
              onCopySelection={copySelection}
              onHighlightSelection={() => createSelectionAnnotation("highlight")}
              onNoteSelection={() => createSelectionAnnotation("note")}
              focusedAnnotationId={focusedAnnotationId}
              linkService={linkService}
            />
          ))}
          {pageCount > 0 && renderedEndPage < pageCount && (
            <div ref={loadMoreSentinelRef} className="h-8 w-full shrink-0" aria-hidden />
          )}
        </div>
      </div>

      <Dialog open={composerState.open} onOpenChange={(open) => setComposerState((current) => ({ ...current, open, content: open ? current.content : "" }))}>
        <DialogContent className="flex max-h-[92vh] w-[min(99vw,1440px)] max-w-[min(99vw,1440px)] flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Add note</DialogTitle>
          </DialogHeader>
          <div className="flex-1 space-y-4 overflow-y-auto pr-1">
            {composerState.quoteText && (
              <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">{composerState.quoteText}</div>
            )}
            <TiptapEditor
              content={composerState.content}
              onChange={(content) => setComposerState((current) => ({ ...current, content }))}
              placeholder="Write your note..."
              minHeight="220px"
              showAITools={false}
              hideToolbar={false}
              title="note"
            />
          </div>
          <DialogFooter className="shrink-0 border-t pt-4 sm:justify-end">
            <Button variant="outline" onClick={() => setComposerState((current) => ({ ...current, open: false, content: "" }))}>
              Cancel
            </Button>
            <Button onClick={saveComposer}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
})

LiteraturePdfViewer.displayName = "LiteraturePdfViewer"
