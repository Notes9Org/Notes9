"use client"

import { Loader2, MessageSquareText, StickyNote, Trash2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import type { LiteraturePdfAnnotation } from "@/types/literature-pdf"

interface LiteraturePdfAnnotationSidebarProps {
  annotations: LiteraturePdfAnnotation[]
  loading: boolean
  onDeleteAnnotation: (annotationId: string) => Promise<void>
  className?: string
  onClose?: () => void
}

export function LiteraturePdfAnnotationSidebar({
  annotations,
  loading,
  onDeleteAnnotation,
  className,
  onClose,
}: LiteraturePdfAnnotationSidebarProps) {
  const { toast } = useToast()

  const deleteAnnotation = async (annotationId: string) => {
    try {
      await onDeleteAnnotation(annotationId)
      toast({ title: "Annotation deleted" })
    } catch (error: any) {
      toast({
        title: "Failed to delete annotation",
        description: error.message,
        variant: "destructive",
      })
    }
  }

  return (
    <div className={cn("space-y-4 rounded-lg border bg-background/88 p-4 backdrop-blur-sm", className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-foreground">Highlights and Notes</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Select text in the reader to highlight or comment. Use the note icon in the toolbar for page notes.
          </p>
        </div>
        {onClose ? (
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onClose} aria-label="Close annotations panel">
            <X className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      <div className="rounded-md border">
        <ScrollArea className="h-[24rem]">
          <div className="space-y-3 p-3">
            {loading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}
            {!loading && annotations.length === 0 && (
              <p className="text-sm text-muted-foreground">No annotations yet.</p>
            )}
            {annotations.map((annotation) => (
              <div key={annotation.id} className="rounded-md border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium capitalize">
                      <span className="inline-flex items-center gap-1">
                        {annotation.type === "note" ? (
                          <StickyNote className="h-3.5 w-3.5" />
                        ) : annotation.type === "comment" ? (
                          <MessageSquareText className="h-3.5 w-3.5" />
                        ) : null}
                        {annotation.type}
                      </span>{" "}
                      • Page {annotation.page_number}
                    </div>
                    {annotation.quote_text && (
                      <p className="mt-1 text-sm text-muted-foreground">{annotation.quote_text}</p>
                    )}
                    {annotation.comment_text && (
                      <div
                        className="prose prose-sm mt-2 max-w-none text-foreground dark:prose-invert"
                        dangerouslySetInnerHTML={{ __html: annotation.comment_text }}
                      />
                    )}
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => deleteAnnotation(annotation.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
