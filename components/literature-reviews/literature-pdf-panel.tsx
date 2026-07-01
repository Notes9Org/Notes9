"use client"

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { Download, Loader2, PanelRightOpen } from "lucide-react"
import { openCatalystPanel } from '@/lib/catalyst-launch'

import { LiteraturePdfAnnotationSidebar } from "@/components/literature-reviews/literature-pdf-annotation-sidebar"
import { motion, useReducedMotion } from "@/components/literature-reviews/motion"
import {
  LiteraturePdfViewer,
  type LiteraturePdfViewerHandle,
} from "@/components/literature-reviews/literature-pdf-viewer"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import type { LiteraturePdfAnnotation } from "@/types/literature-pdf"

interface LiteraturePdfPanelProps {
  literatureId: string
  pdfUrl: string
  pdfFileName?: string | null
  /** Direct Supabase/public URL for “Open” when `pdfUrl` is the authenticated viewer proxy. */
  openInNewTabFallbackUrl?: string | null
  /** If set, the viewer will search for this text and temporarily highlight the match. */
  highlightExcerpt?: string | null
  highlightPageNumber?: number | null
  /** Extra controls (e.g. Replace PDF) merged into the reader's single header row. */
  headerActions?: ReactNode
}

export function LiteraturePdfPanel({
  literatureId,
  pdfUrl,
  pdfFileName,
  openInNewTabFallbackUrl,
  highlightExcerpt,
  highlightPageNumber,
  headerActions,
}: LiteraturePdfPanelProps) {
  const { toast } = useToast()
  const reduceMotion = useReducedMotion()
  const [annotations, setAnnotations] = useState<LiteraturePdfAnnotation[]>([])
  const [loadingAnnotations, setLoadingAnnotations] = useState(true)
  const [annotationsOpen, setAnnotationsOpen] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)
  const viewerRef = useRef<LiteraturePdfViewerHandle>(null)

  const handleNavigateToAnnotation = useCallback((annotation: LiteraturePdfAnnotation) => {
    setAnnotationsOpen(true)
    window.setTimeout(() => {
      document.querySelector("[data-literature-pdf-viewport]")?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      })
      viewerRef.current?.scrollToAnnotation(annotation)
    }, 100)
  }, [])

  const loadAnnotations = async () => {
    setLoadingAnnotations(true)
    try {
      const response = await fetch(`/api/literature/${literatureId}/annotations`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      // Guard against a malformed body: only accept an array of annotations.
      setAnnotations(Array.isArray(data.annotations) ? data.annotations : [])
    } catch (error: unknown) {
      const description = error instanceof Error ? error.message : String(error)
      console.error("Failed to load literature annotations", error)
      toast({
        title: "Failed to load annotations",
        description,
        variant: "destructive",
      })
    } finally {
      setLoadingAnnotations(false)
    }
  }

  useEffect(() => {
    loadAnnotations()
  }, [literatureId])

  // Trigger excerpt highlight when the prop is set (e.g. from a reference click).
  // Retries until the PDF viewer is loaded and the excerpt is found.
  const highlightExcerptFiredRef = useRef<string | null>(null)
  useEffect(() => {
    if (!highlightExcerpt || loadingAnnotations) return
    if (highlightExcerptFiredRef.current === highlightExcerpt) return

    let cancelled = false
    let attempt = 0
    const maxAttempts = 12
    const delays = [500, 800, 1200, 1500, 2000, 2500, 3000, 3500, 4000, 5000, 6000, 8000]

    const tryHighlight = async () => {
      if (cancelled || attempt >= maxAttempts) return
      const handle = viewerRef.current
      if (!handle) {
        attempt++
        setTimeout(tryHighlight, delays[Math.min(attempt, delays.length - 1)])
        return
      }
      const found = await handle.highlightExcerpt(
        highlightExcerpt,
        highlightPageNumber ?? undefined,
      )
      if (!found && attempt < maxAttempts - 1) {
        attempt++
        setTimeout(tryHighlight, delays[Math.min(attempt, delays.length - 1)])
      } else {
        if (!found) {
          // Exhausted all retries (or last attempt) without locating the
          // excerpt. Log so a missing highlight is diagnosable rather than
          // failing silently. We still mark as fired to avoid re-looping.
          console.warn(
            "Literature PDF excerpt highlight not found after retries",
            { literatureId, highlightPageNumber, attempts: attempt + 1 },
          )
        }
        highlightExcerptFiredRef.current = highlightExcerpt
      }
    }

    setTimeout(tryHighlight, delays[0])
    return () => { cancelled = true }
  }, [highlightExcerpt, highlightPageNumber, loadingAnnotations])

  const createAnnotation = async (payload: {
    type: "highlight" | "note" | "comment"
    page_number: number
    quote_text?: string | null
    comment_text?: string | null
    color?: string | null
    rects?: Array<{ top: number; left: number; width: number; height: number }> | null
    anchor?: Record<string, unknown> | null
  }) => {
    const response = await fetch(`/api/literature/${literatureId}/annotations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error)
    setAnnotations((current) => [data.annotation, ...current])
  }

  const deleteAnnotation = async (annotationId: string) => {
    const response = await fetch(`/api/literature/${literatureId}/annotations/${annotationId}`, {
      method: "DELETE",
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error)
    setAnnotations((current) => current.filter((annotation) => annotation.id !== annotationId))
  }

  const handleExportAnnotatedPdf = useCallback(async () => {
    setExportingPdf(true)
    try {
      const response = await fetch(pdfUrl)
      if (!response.ok) throw new Error(`Could not download PDF (${response.status})`)
      const buf = await response.arrayBuffer()
      const { buildLiteraturePdfWithAnnotationsEmbedded } = await import("@/lib/export-literature-pdf-with-annotations")
      const out = await buildLiteraturePdfWithAnnotationsEmbedded(buf, annotations)
      const blob = new Blob([out.buffer as ArrayBuffer], { type: "application/pdf" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      const base = (pdfFileName || "document").replace(/\.pdf$/i, "").replace(/[/\\?%*:|"<>]/g, "-")
      a.download = `${base}-annotated.pdf`
      a.rel = "noopener"
      a.click()
      URL.revokeObjectURL(url)
      toast({ title: "Annotated PDF downloaded" })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Export failed"
      toast({
        title: "Could not export PDF",
        description: message,
        variant: "destructive",
      })
    } finally {
      setExportingPdf(false)
    }
  }, [annotations, pdfFileName, pdfUrl, toast])

  const openPaperInCatalyst = useCallback((selectedText?: string) => {
    const trimmedSelection = selectedText?.trim()
    openCatalystPanel({
      scope: 'literature',
      query: trimmedSelection
        ? `"${trimmedSelection}"\n\nAsk Catalyst about this selection in the attached paper.`
        : 'Ask Catalyst about this paper.',
      attachments: pdfUrl
        ? [{
            url: pdfUrl,
            name: pdfFileName ?? 'paper.pdf',
            contentType: 'application/pdf',
          }]
        : undefined,
      autoSend: false,
    })
  }, [pdfFileName, pdfUrl])

  return (
    <Collapsible open={annotationsOpen} onOpenChange={setAnnotationsOpen}>
      <div
        className={cn(
          "grid min-w-0 gap-6 overflow-visible",
          annotationsOpen &&
            "lg:grid-cols-[minmax(0,1fr)_minmax(17.5rem,22rem)] lg:items-start"
        )}
      >
        <div className="relative min-h-0 min-w-0">
          <LiteraturePdfViewer
            ref={viewerRef}
            pdfUrl={pdfUrl}
            externalOpenUrl={openInNewTabFallbackUrl ?? undefined}
            annotations={annotations}
            onCreateAnnotation={createAnnotation}
            onAskCatalyst={openPaperInCatalyst}
            toolbarExtras={
              <>
                {headerActions}
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 transition-[transform,color,background-color,border-color] duration-150 ease-out active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100 sm:h-9 sm:w-9"
                  disabled={exportingPdf}
                  onClick={handleExportAnnotatedPdf}
                  aria-label="Export annotated PDF"
                  title="Download the PDF with colored highlights on the page plus a column listing highlights and notes"
                >
                  {exportingPdf ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 shrink-0" />
                  )}
                </Button>
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 transition-[transform,color,background-color,border-color] duration-150 ease-out active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100 sm:h-9 sm:w-9"
                    aria-expanded={annotationsOpen}
                    aria-label="Highlights & notes"
                    title="Show highlights & notes"
                  >
                    <PanelRightOpen className="h-4 w-4 shrink-0" />
                  </Button>
                </CollapsibleTrigger>
              </>
            }
          />
        </div>

        <CollapsibleContent
          id="literature-pdf-annotations"
          className={cn(
            "min-w-0",
            // overflow-hidden on this node breaks position:sticky; list scroll is inside LiteraturePdfAnnotationSidebar.
            "data-[state=closed]:overflow-hidden data-[state=open]:overflow-visible",
            "lg:data-[state=open]:sticky lg:data-[state=open]:top-4 lg:data-[state=open]:z-10 lg:data-[state=open]:self-start"
          )}
        >
          {/* GPU-only entrance (opacity + x); Radix Collapsible still owns
              mount/unmount + height, so no layout-prop is animated and the
              parent's lg:sticky is unaffected. */}
          <motion.div
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: reduceMotion ? 0.12 : 0.28, ease: [0.16, 1, 0.3, 1] }}
          >
            <LiteraturePdfAnnotationSidebar
              annotations={annotations}
              loading={loadingAnnotations}
              onDeleteAnnotation={deleteAnnotation}
              onClose={() => setAnnotationsOpen(false)}
              onNavigateToAnnotation={handleNavigateToAnnotation}
            />
          </motion.div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}
