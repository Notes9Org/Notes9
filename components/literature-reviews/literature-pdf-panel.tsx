"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ChevronDown, Download, FileText, Loader2, PanelRightOpen } from "lucide-react"

import { LiteraturePdfAnnotationSidebar } from "@/components/literature-reviews/literature-pdf-annotation-sidebar"
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
}

export function LiteraturePdfPanel({ literatureId, pdfUrl, pdfFileName }: LiteraturePdfPanelProps) {
  const { toast } = useToast()
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
      setAnnotations(data.annotations ?? [])
    } catch (error: any) {
      toast({
        title: "Failed to load annotations",
        description: error.message,
        variant: "destructive",
      })
    } finally {
      setLoadingAnnotations(false)
    }
  }

  useEffect(() => {
    loadAnnotations()
  }, [literatureId])

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
      const blob = new Blob([out], { type: "application/pdf" })
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

  return (
    <Collapsible open={annotationsOpen} onOpenChange={setAnnotationsOpen}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileText className="h-4 w-4 shrink-0" />
          Reader
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={exportingPdf}
            onClick={handleExportAnnotatedPdf}
            title="Download a copy of the PDF with highlights and notes drawn on the pages"
          >
            {exportingPdf ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
            ) : (
              <Download className="h-4 w-4 shrink-0" />
            )}
            Export with annotations
          </Button>
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              aria-expanded={annotationsOpen}
            >
              <PanelRightOpen className="h-4 w-4 shrink-0" />
              Highlights &amp; notes
              <ChevronDown
                className={cn("h-4 w-4 shrink-0 transition-transform duration-200", annotationsOpen && "rotate-180")}
              />
            </Button>
          </CollapsibleTrigger>
        </div>
      </div>

      <div
        className={cn(
          "mt-4 grid min-w-0 gap-6 overflow-visible",
          annotationsOpen &&
            "lg:grid-cols-[minmax(0,1fr)_minmax(17.5rem,22rem)] lg:items-start"
        )}
      >
        <div className="min-h-0 min-w-0">
          <LiteraturePdfViewer
            ref={viewerRef}
            pdfUrl={pdfUrl}
            annotations={annotations}
            onCreateAnnotation={createAnnotation}
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
          <LiteraturePdfAnnotationSidebar
            annotations={annotations}
            loading={loadingAnnotations}
            onDeleteAnnotation={deleteAnnotation}
            onClose={() => setAnnotationsOpen(false)}
            onNavigateToAnnotation={handleNavigateToAnnotation}
          />
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}
