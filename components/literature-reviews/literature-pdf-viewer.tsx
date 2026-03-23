"use client"

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react"
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
import type { LiteraturePdfAnnotation } from "@/types/literature-pdf"

interface LiteraturePdfViewerProps {
  pdfUrl: string
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
  selectionState,
  onSelectionChangeRef,
  onPagePointerDown,
  onCopySelection,
  onHighlightSelection,
  onNoteSelection,
}: {
  pageNumber: number
  pdfDocument: any
  fitScale: number
  zoom: number
  pageAnnotations: LiteraturePdfAnnotation[]
  selectionState: PdfSelectionState | null
  onSelectionChangeRef: MutableRefObject<(pageNum: number, next: PdfSelectionState | null) => void>
  onPagePointerDown: (pageNum: number, relative: { x: number; y: number }) => void
  onCopySelection: () => void
  onHighlightSelection: () => void
  onNoteSelection: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const textLayerRef = useRef<HTMLDivElement | null>(null)
  const pageRef = useRef<HTMLDivElement | null>(null)
  const renderTaskRef = useRef<any>(null)
  const textLayerTaskRef = useRef<any>(null)
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    let isActive = true
    let textLayer: any = null

    async function render() {
      if (!pdfDocument || !canvasRef.current || !textLayerRef.current) return
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
    }
  }, [fitScale, pageNumber, pdfDocument, zoom])

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
        {pageAnnotations.map((annotation) =>
          annotation.rects?.map((rect, index) => (
            <div
              key={`${annotation.id}-${index}`}
              className={`pointer-events-none absolute z-[1] rounded-sm ${
                annotation.type === "comment"
                  ? "bg-sky-300/22 shadow-[inset_0_0_0_1px_rgba(14,165,233,0.45)]"
                  : annotation.type === "note"
                    ? "bg-lime-300/20 shadow-[inset_0_0_0_1px_rgba(132,204,22,0.45)]"
                    : "bg-amber-300/28 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.5)]"
              }`}
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
                className="pointer-events-none absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-lime-500/70 bg-lime-200/90 text-lime-900 shadow"
                style={{
                  left: `${(anchor.x ?? 0.5) * 100}%`,
                  top: `${(anchor.y ?? 0.1) * 100}%`,
                }}
              >
                <StickyNote className="h-3.5 w-3.5" />
              </div>
            )
          })}
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

export function LiteraturePdfViewer({ pdfUrl, annotations, onCreateAnnotation }: LiteraturePdfViewerProps) {
  const { toast } = useToast()
  const viewportFrameRef = useRef<HTMLDivElement | null>(null)
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null)
  const [pdfDocument, setPdfDocument] = useState<any>(null)
  const [pageCount, setPageCount] = useState(0)
  const [renderedEndPage, setRenderedEndPage] = useState(1)
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

  const onSelectionChangeRef = useRef((pageNum: number, next: PdfSelectionState | null) => {
    setSelectionState((current) => {
      if (next === null) {
        if (current?.pageNumber === pageNum) return null
        return current
      }
      return next
    })
  })

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

        const task = pdfjsLib.getDocument(pdfUrl)
        const document = await task.promise
        if (!isActive) return
        setPdfDocument(document)
        const n = document.numPages ?? 0
        setPageCount(n)
        setRenderedEndPage(n > 0 ? Math.min(3, n) : 1)
      } catch (loadError) {
        console.error(loadError)
        if (isActive) setError("Failed to render this PDF.")
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
            <a href={pdfUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              Open
            </a>
          </Button>
        </div>
      </div>

      <div
        ref={viewportFrameRef}
        className="relative max-h-[min(80vh,56rem)] overflow-auto rounded-lg border bg-muted/30 p-2 sm:p-4"
      >
        {isLoading && (
          <div className="flex min-h-[24rem] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {error && !isLoading && (
          <div className="flex min-h-[24rem] items-center justify-center text-sm text-destructive">{error}</div>
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
              selectionState={selectionState}
              onSelectionChangeRef={onSelectionChangeRef}
              onPagePointerDown={onPagePointerDown}
              onCopySelection={copySelection}
              onHighlightSelection={() => createSelectionAnnotation("highlight")}
              onNoteSelection={() => createSelectionAnnotation("note")}
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
}
