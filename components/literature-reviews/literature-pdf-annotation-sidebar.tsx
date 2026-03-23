"use client"

import { Highlighter, Loader2, MessageSquareText, StickyNote, Trash2, X } from "lucide-react"

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
  onNavigateToAnnotation?: (annotation: LiteraturePdfAnnotation) => void
}

export function LiteraturePdfAnnotationSidebar({
  annotations,
  loading,
  onDeleteAnnotation,
  className,
  onClose,
  onNavigateToAnnotation,
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
    <div
      className={cn(
        "flex min-h-0 flex-col gap-4 rounded-lg border bg-background p-4 shadow-sm",
        className
      )}
    >
      <div className="flex shrink-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-foreground">Highlights and Notes</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Select text in the reader to highlight or add a note. Use the note icon in the toolbar for page notes. Click an
            item below to jump to it in the PDF.
          </p>
        </div>
        {onClose ? (
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onClose} aria-label="Close annotations panel">
            <X className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      <div className="rounded-md border">
        <ScrollArea className="h-[min(20rem,52dvh)] xl:h-[min(32rem,calc(100dvh-11rem))]">
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
              <div
                key={annotation.id}
                className="flex items-stretch gap-2 rounded-md border bg-muted/20 p-2 sm:p-3"
              >
                <div
                  role="button"
                  tabIndex={onNavigateToAnnotation ? 0 : undefined}
                  className="min-w-0 flex-1 cursor-pointer rounded-md px-1 py-0.5 text-left outline-none ring-offset-background transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring data-[nav=false]:cursor-default data-[nav=false]:hover:bg-transparent"
                  data-nav={onNavigateToAnnotation ? "true" : "false"}
                  onClick={() => onNavigateToAnnotation?.(annotation)}
                  onKeyDown={(e) => {
                    if (!onNavigateToAnnotation) return
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      onNavigateToAnnotation(annotation)
                    }
                  }}
                >
                  <div className="space-y-2">
                    <div className="text-sm font-medium capitalize">
                      <span className="inline-flex items-center gap-1.5">
                        {annotation.type === "note" ? (
                          <StickyNote className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        ) : annotation.type === "comment" ? (
                          <MessageSquareText className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        ) : (
                          <Highlighter className="h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden />
                        )}
                        {annotation.type}
                      </span>{" "}
                      <span className="text-muted-foreground">· Page {annotation.page_number}</span>
                    </div>
                    {annotation.quote_text && (
                      <p className="break-words text-sm text-muted-foreground">{annotation.quote_text}</p>
                    )}
                    {annotation.comment_text && (
                      <div
                        className="prose prose-sm max-w-none break-words text-foreground dark:prose-invert [&_*]:break-words"
                        dangerouslySetInnerHTML={{ __html: annotation.comment_text }}
                      />
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 self-start"
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteAnnotation(annotation.id)
                  }}
                  aria-label="Delete annotation"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
