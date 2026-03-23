"use client"

import { useEffect, useState } from "react"
import { FileText, PanelRightOpen } from "lucide-react"

import { LiteraturePdfAnnotationSidebar } from "@/components/literature-reviews/literature-pdf-annotation-sidebar"
import { LiteraturePdfViewer } from "@/components/literature-reviews/literature-pdf-viewer"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
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
  const [sidebarOpen, setSidebarOpen] = useState(false)

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
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileText className="h-4 w-4" />
          Reader
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => setSidebarOpen((current) => !current)}
        >
          <PanelRightOpen className="h-4 w-4" />
          Highlights & Notes
        </Button>
      </div>

      <div
        className={cn(
          "relative overflow-hidden xl:grid xl:items-start xl:gap-6",
          sidebarOpen ? "xl:grid-cols-[minmax(0,1fr)_22rem]" : "xl:grid-cols-[minmax(0,1fr)_0rem]"
        )}
      >
        <div className="min-w-0">
          <LiteraturePdfViewer pdfUrl={pdfUrl} annotations={annotations} onCreateAnnotation={createAnnotation} />
        </div>

        <LiteraturePdfAnnotationSidebar
          annotations={annotations}
          loading={loadingAnnotations}
          onDeleteAnnotation={deleteAnnotation}
          onClose={() => setSidebarOpen(false)}
          className={cn(
            "fixed inset-y-0 right-0 z-30 w-[min(92vw,22rem)] rounded-none border-l border-y-0 bg-background/94 shadow-2xl transition-transform duration-300 xl:static xl:w-[22rem] xl:self-stretch xl:rounded-lg xl:border xl:shadow-lg",
            sidebarOpen ? "translate-x-0 xl:translate-x-0" : "translate-x-full xl:hidden"
          )}
        />
        {sidebarOpen ? (
          <button
            type="button"
            aria-label="Close annotations overlay"
            className="fixed inset-0 z-20 bg-black/20 xl:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        ) : null}
      </div>
    </div>
  )
}
