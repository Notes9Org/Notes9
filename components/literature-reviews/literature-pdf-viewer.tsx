"use client"

import { useEffect, useRef, useState } from "react"
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Highlighter,
  Loader2,
  MessageSquarePlus,
  StickyNote,
  ZoomIn,
  ZoomOut,
} from "lucide-react"

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

export function LiteraturePdfViewer({ pdfUrl, annotations, onCreateAnnotation }: LiteraturePdfViewerProps) {
  const { toast } = useToast()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const textLayerRef = useRef<HTMLDivElement | null>(null)
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const pageRef = useRef<HTMLDivElement | null>(null)
  const [pdfDocument, setPdfDocument] = useState<any>(null)
  const [pageCount, setPageCount] = useState(0)
  const [pageNumber, setPageNumber] = useState(1)
  const [scale, setScale] = useState(1.3)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })
  const [selectionState, setSelectionState] = useState<{
    text: string
    rects: Array<{ top: number; left: number; width: number; height: number }>
    anchor: { x: number; y: number }
    toolbarX: number
    toolbarY: number
  } | null>(null)
  const [lastPointer, setLastPointer] = useState<{ x: number; y: number } | null>(null)
  const [composerState, setComposerState] = useState<{
    open: boolean
    type: "comment" | "note"
    quoteText: string | null
    rects: Array<{ top: number; left: number; width: number; height: number }> | null
    anchor: Record<string, unknown> | null
    content: string
  }>({
    open: false,
    type: "comment",
    quoteText: null,
    rects: null,
    anchor: null,
    content: "",
  })

  useEffect(() => {
    let isActive = true
    setIsLoading(true)
    setError(null)

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
        setPageCount(document.numPages ?? 0)
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
    let isActive = true
    let textLayer: any = null

    async function render() {
      if (!pdfDocument || !canvasRef.current || !textLayerRef.current) return
      setSelectionState(null)
      const page = await pdfDocument.getPage(pageNumber)
      const viewport = page.getViewport({ scale })
      const canvas = canvasRef.current
      const textLayerContainer = textLayerRef.current
      const pageContainer = pageRef.current
      const context = canvas.getContext("2d")

      if (!context || !pageContainer) return
      canvas.width = viewport.width
      canvas.height = viewport.height
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

      await page.render({ canvasContext: context, viewport }).promise
      const pdfjsLib: any = await import("pdfjs-dist/legacy/build/pdf.mjs")
      textLayer = new pdfjsLib.TextLayer({
        textContentSource: page.streamTextContent({
          includeMarkedContent: true,
          disableNormalization: true,
        }),
        container: textLayerContainer,
        viewport,
      })
      await textLayer.render()
      if (!isActive) return
    }

    render().catch((renderError) => {
      console.error(renderError)
      setError("Failed to render this PDF page.")
    })

    return () => {
      isActive = false
      textLayer?.cancel?.()
    }
  }, [pageNumber, pdfDocument, scale])

  const clearSelection = () => {
    setSelectionState(null)
    window.getSelection()?.removeAllRanges()
  }

  const handlePointerUp = () => {
    window.setTimeout(() => {
      const selection = window.getSelection()
      const textLayerContainer = textLayerRef.current
      const pageContainer = pageRef.current
      if (!selection || !textLayerContainer || !pageContainer || selection.rangeCount === 0) {
        setSelectionState(null)
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
        setSelectionState(null)
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
        setSelectionState(null)
        return
      }

      const focusRect = range.getBoundingClientRect()
      setSelectionState({
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
  }

  const openComposer = (type: "comment" | "note") => {
    if (type === "comment" && !selectionState) return
    setComposerState({
      open: true,
      type,
      quoteText: type === "comment" ? selectionState?.text ?? null : null,
      rects: type === "comment" ? selectionState?.rects ?? null : null,
      anchor:
        type === "comment"
          ? selectionState?.anchor ?? null
          : {
              x: lastPointer?.x ?? 0.5,
              y: lastPointer?.y ?? 0.08,
            },
      content: "",
    })
  }

  const createSelectionAnnotation = async (type: "highlight" | "comment" | "note") => {
    if (!selectionState) return
    try {
      if (type === "comment" || type === "note") {
        openComposer(type)
        return
      }

      await onCreateAnnotation({
        type,
        page_number: pageNumber,
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
  }

  const copySelection = async () => {
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
  }

  const createPageNote = async () => {
    openComposer("note")
  }

  const saveComposer = async () => {
    if (!composerState.content.trim()) return

    try {
      await onCreateAnnotation({
        type: composerState.type,
        page_number: pageNumber,
        quote_text: composerState.quoteText,
        comment_text: composerState.content,
        color: composerState.type === "comment" ? "#bfdbfe" : "#d9f99d",
        rects: composerState.rects,
        anchor: composerState.anchor,
      })
      setComposerState((current) => ({ ...current, open: false, content: "" }))
      clearSelection()
      toast({ title: `${composerState.type === "comment" ? "Comment" : "Note"} saved` })
    } catch (creationError: any) {
      toast({
        title: `Failed to save ${composerState.type}`,
        description: creationError.message,
        variant: "destructive",
      })
    }
  }

  const pageAnnotations = annotations.filter((annotation) => annotation.page_number === pageNumber)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-background/80 p-3">
        <Button variant="outline" size="sm" onClick={() => setPageNumber((current) => Math.max(1, current - 1))} disabled={pageNumber <= 1}>
          <ChevronLeft className="mr-2 h-4 w-4" />
          Prev
        </Button>
        <div className="text-sm text-muted-foreground">
          Page {pageNumber} of {pageCount || "—"}
        </div>
        <Button variant="outline" size="sm" onClick={() => setPageNumber((current) => Math.min(pageCount, current + 1))} disabled={!pageCount || pageNumber >= pageCount}>
          Next
          <ChevronRight className="ml-2 h-4 w-4" />
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setScale((current) => Math.max(0.75, current - 0.1))}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <div className="w-16 text-center text-sm text-muted-foreground">{Math.round(scale * 100)}%</div>
          <Button variant="outline" size="icon" onClick={() => setScale((current) => Math.min(3, current + 0.1))}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={createPageNote} title="Add note">
            <StickyNote className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={pdfUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              Open
            </a>
          </Button>
        </div>
      </div>

      <div className="relative overflow-auto rounded-lg border bg-muted/30 p-4">
        {isLoading && (
          <div className="flex min-h-[24rem] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {error && !isLoading && (
          <div className="flex min-h-[24rem] items-center justify-center text-sm text-destructive">
            {error}
          </div>
        )}
        <div
          ref={surfaceRef}
          className={`${isLoading || error ? "hidden" : "block"} relative mx-auto w-fit`}
          onMouseUp={handlePointerUp}
          onMouseDown={(event) => {
            const rect = event.currentTarget.getBoundingClientRect()
            setLastPointer({
              x: (event.clientX - rect.left) / rect.width,
              y: (event.clientY - rect.top) / rect.height,
            })
          }}
        >
          <div
            ref={pageRef}
            className="relative overflow-hidden rounded border bg-white shadow-sm"
            style={{
              width: viewportSize.width || undefined,
              height: viewportSize.height || undefined,
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
          </div>
          {selectionState && (
            <div
              className="absolute z-20 flex items-center gap-1 rounded-full border bg-background/95 p-1 shadow-lg"
              style={{
                left: selectionState.toolbarX,
                top: Math.max(8, selectionState.toolbarY),
                transform: "translateX(-50%)",
              }}
            >
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={copySelection} title="Copy">
                <Copy className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => createSelectionAnnotation("highlight")} title="Highlight">
                <Highlighter className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => createSelectionAnnotation("comment")} title="Comment">
                <MessageSquarePlus className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => createSelectionAnnotation("note")} title="Note">
                <StickyNote className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>
      <Dialog
        open={composerState.open}
        onOpenChange={(open) => setComposerState((current) => ({ ...current, open, content: open ? current.content : "" }))}
      >
        <DialogContent className="flex max-h-[92vh] w-[min(99vw,1440px)] max-w-[min(99vw,1440px)] flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>{composerState.type === "comment" ? "Add comment" : "Add note"}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 space-y-4 overflow-y-auto pr-1">
            {composerState.quoteText && (
              <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
                {composerState.quoteText}
              </div>
            )}
            <TiptapEditor
              content={composerState.content}
              onChange={(content) => setComposerState((current) => ({ ...current, content }))}
              placeholder={composerState.type === "comment" ? "Write your comment..." : "Write your note..."}
              minHeight="220px"
              showAITools={false}
              hideToolbar={false}
              title={composerState.type}
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
