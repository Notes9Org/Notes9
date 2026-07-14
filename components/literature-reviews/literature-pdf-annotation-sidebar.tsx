"use client"

import { memo, useCallback } from "react"
import { HighlighterCircle as Highlighter, ChatText as MessageSquareText, Note as StickyNote, Trash as Trash2, X } from "@phosphor-icons/react/ssr"

import { MotionItem, MotionList } from "@/components/literature-reviews/motion"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useToast } from "@/hooks/use-toast"
import { useSkeletonGate } from "@/hooks/use-skeleton-gate"
import { cn } from "@/lib/utils"
import { sanitizeHtml } from "@/lib/sanitize-html"
import type { LiteraturePdfAnnotation } from "@/types/literature-pdf"

/**
 * One annotation row, memoized so deleting/adding an annotation only re-renders
 * the changed row — not every sibling. Also avoids re-running `sanitizeHtml`
 * for untouched rows on each sidebar render. Behavior/markup identical.
 */
const AnnotationRow = memo(function AnnotationRow({
  annotation,
  onNavigate,
  onDelete,
}: {
  annotation: LiteraturePdfAnnotation
  onNavigate?: (annotation: LiteraturePdfAnnotation) => void
  onDelete: (annotationId: string) => void
}) {
  return (
    <div className="flex items-stretch gap-2 rounded-md border bg-muted/20 p-2 sm:p-3">
      <div
        role="button"
        tabIndex={onNavigate ? 0 : undefined}
        className="min-w-0 flex-1 cursor-pointer rounded-md px-1 py-0.5 text-left outline-none ring-offset-background transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring data-[nav=false]:cursor-default data-[nav=false]:hover:bg-transparent"
        data-nav={onNavigate ? "true" : "false"}
        onClick={() => onNavigate?.(annotation)}
        onKeyDown={(e) => {
          if (!onNavigate) return
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            onNavigate(annotation)
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
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(annotation.comment_text) }}
            />
          )}
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 self-start transition-transform duration-150 ease-out active:scale-90 motion-reduce:transition-none motion-reduce:active:scale-100"
        onClick={(e) => {
          e.stopPropagation()
          onDelete(annotation.id)
        }}
        aria-label="Delete annotation"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  )
})

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
  const showSkeleton = useSkeletonGate(loading ?? false)

  // Stable so the memoized AnnotationRow isn't invalidated on every render.
  const deleteAnnotation = useCallback(
    async (annotationId: string) => {
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
    },
    [onDeleteAnnotation, toast]
  )

  return (
    <div
      className={cn(
        // Glass-rail shell — same surface as the Catalyst chat-history rail
        // (see components/patterns/side-rail.tsx SideRailPanel).
        "flex min-h-0 flex-col gap-4 rounded-2xl border border-[color:var(--glass-border)] bg-sidebar/80 p-4 backdrop-blur-md",
        "shadow-[0_10px_34px_-18px_rgba(20,14,8,0.4)] dark:bg-sidebar/60 dark:shadow-[0_12px_38px_-16px_rgba(0,0,0,0.6)]",
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

      <div className="rounded-xl border border-[color:var(--glass-border)]">
        <ScrollArea className="h-[min(20rem,52dvh)] lg:h-[min(32rem,calc(100dvh-9rem))]">
          <MotionList className="space-y-3 p-3">
            {showSkeleton && (
              <div className="flex flex-col gap-2" aria-hidden aria-label="Loading annotations">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-md p-2">
                    <div className="n9-skeleton-shimmer size-8 shrink-0 rounded" />
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <div className="n9-skeleton-shimmer h-3.5 w-1/2 rounded" />
                      <div className="n9-skeleton-shimmer h-3 w-full rounded" />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!loading && annotations.length === 0 && (
              <p className="text-sm text-muted-foreground">No annotations yet.</p>
            )}
            {annotations.map((annotation) => (
              <MotionItem key={annotation.id}>
                <AnnotationRow
                  annotation={annotation}
                  onNavigate={onNavigateToAnnotation}
                  onDelete={deleteAnnotation}
                />
              </MotionItem>
            ))}
          </MotionList>
        </ScrollArea>
      </div>
    </div>
  )
}
