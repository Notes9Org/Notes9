"use client"

import { useEffect, useState } from "react"
import { FileText } from "lucide-react"

import { LiteraturePdfAnnotationSidebar } from "@/components/literature-reviews/literature-pdf-annotation-sidebar"
import { LiteraturePdfViewer } from "@/components/literature-reviews/literature-pdf-viewer"
import { useToast } from "@/hooks/use-toast"
import type { LiteraturePdfAnnotation } from "@/types/literature-pdf"

interface LiteraturePdfPanelProps {
  literatureId: string
  pdfUrl: string
}

export function LiteraturePdfPanel({ literatureId, pdfUrl }: LiteraturePdfPanelProps) {
  const { toast } = useToast()
  const [annotations, setAnnotations] = useState<LiteraturePdfAnnotation[]>([])
  const [loadingAnnotations, setLoadingAnnotations] = useState(true)

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
    <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileText className="h-4 w-4" />
          Reader
        </div>
        <LiteraturePdfViewer pdfUrl={pdfUrl} annotations={annotations} onCreateAnnotation={createAnnotation} />
      </div>
      <LiteraturePdfAnnotationSidebar
        annotations={annotations}
        loading={loadingAnnotations}
        onDeleteAnnotation={deleteAnnotation}
      />
    </div>
  )
}
