"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ChevronDown, FileText, PanelRightOpen } from "lucide-react"

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
}

export function LiteraturePdfPanel({ literatureId, pdfUrl }: LiteraturePdfPanelProps) {
  const { toast } = useToast()
  const [annotations, setAnnotations] = useState<LiteraturePdfAnnotation[]>([])
  const [loadingAnnotations, setLoadingAnnotations] = useState(true)
  const [annotationsOpen, setAnnotationsOpen] = useState(false)
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

  return (
    <Collapsible open={annotationsOpen} onOpenChange={setAnnotationsOpen}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileText className="h-4 w-4 shrink-0" />
          Reader
        </div>
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

      <div
        className={cn(
          "mt-4 grid min-w-0 gap-6",
          annotationsOpen && "xl:grid-cols-[minmax(0,1fr)_minmax(17.5rem,22rem)] xl:items-start"
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
            "min-w-0 overflow-hidden",
            "xl:data-[state=open]:sticky xl:data-[state=open]:top-24 xl:data-[state=open]:z-10 xl:data-[state=open]:self-start"
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
