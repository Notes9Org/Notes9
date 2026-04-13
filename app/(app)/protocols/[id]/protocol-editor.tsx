"use client"

import { useMemo, useState, useCallback, useEffect, useRef } from "react"
import { useContentDiffs } from "@/hooks/use-content-diffs"
import { ContentDiffHistoryDialog } from "@/components/content-diff-history-dialog"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/hooks/use-toast"
import { updateProtocolWithOptionalContext } from "@/lib/protocol-context-supabase"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { TiptapEditor } from "@/components/text-editor/tiptap-editor"
import { Card, CardContent } from "@/components/ui/card"
import { NoteExportMenu } from "@/components/note-export-menu"
import { Download, History } from "lucide-react"
import { ProtocolDesignMode } from "@/components/protocols/protocol-design-mode"
import {
  DOCUMENT_HIGHLIGHT_EVENT,
  HIGHLIGHT_PARAM,
  decodeHighlightParam,
  normalizeAgentSourceType,
  type HighlightTarget,
} from "@/lib/document-highlight"
import type { Editor } from "@tiptap/react"

export function ProtocolEditor({
  protocol,
  defaultDesignMode = false,
  designModeHref,
  viewHref,
}: {
  protocol: any
  defaultDesignMode?: boolean
  designModeHref: string
  viewHref: string
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [designModePromptOpen, setDesignModePromptOpen] = useState(false)
  const [isActiveView, setIsActiveView] = useState(Boolean(protocol.is_active))
  const [isSavingActive, setIsSavingActive] = useState(false)
  const [contentHistoryOpen, setContentHistoryOpen] = useState(false)
  const searchParams = useSearchParams()
  const protocolEditorRef = useRef<Editor | null>(null)
  const [protocolEditorReady, setProtocolEditorReady] = useState(false)
  const [inlineHighlightTarget, setInlineHighlightTarget] = useState<HighlightTarget | null>(null)
  const { diffs, loading: diffsLoading, error: diffsError, loadDiffs } = useContentDiffs(
    "protocol",
    protocol.id
  )

  const [formData, setFormData] = useState({
    name: protocol.name ?? "",
    description: protocol.description ?? "",
    version: protocol.version ?? "",
    content: protocol.content ?? "",
    category: protocol.category ?? "",
    is_active: Boolean(protocol.is_active),
    project_id: protocol.project_id ?? "",
    experiment_id: protocol.experiment_id ?? "",
  })

  useEffect(() => {
    setIsActiveView(Boolean(protocol.is_active))
    setFormData((prev) => ({ ...prev, is_active: Boolean(protocol.is_active) }))
  }, [protocol.id, protocol.is_active])

  // Highlight from AI reference navigation — retries until content is loaded
  const highlightParam = searchParams.get(HIGHLIGHT_PARAM)
  const highlightFiredRef = useRef<string | null>(null)
  const urlHighlightTarget = highlightParam ? decodeHighlightParam(highlightParam) : null
  const activeHighlightTarget =
    inlineHighlightTarget &&
    normalizeAgentSourceType(inlineHighlightTarget.sourceType) === "protocol" &&
    inlineHighlightTarget.sourceId === protocol.id
      ? inlineHighlightTarget
      : urlHighlightTarget &&
          normalizeAgentSourceType(urlHighlightTarget.sourceType) === "protocol" &&
          urlHighlightTarget.sourceId === protocol.id
        ? urlHighlightTarget
        : null

  useEffect(() => {
    const onHighlight = (event: Event) => {
      const target = (event as CustomEvent<HighlightTarget>).detail
      if (normalizeAgentSourceType(target.sourceType) !== "protocol") return
      if (target.sourceId !== protocol.id) return
      event.preventDefault()
      setInlineHighlightTarget(target)
      highlightFiredRef.current = null
    }
    window.addEventListener(DOCUMENT_HIGHLIGHT_EVENT, onHighlight as EventListener)
    return () => {
      window.removeEventListener(DOCUMENT_HIGHLIGHT_EVENT, onHighlight as EventListener)
    }
  }, [protocol.id])

  useEffect(() => {
    if (!activeHighlightTarget || !protocolEditorReady || !protocolEditorRef.current) return
    const highlightKey = JSON.stringify(activeHighlightTarget)
    if (highlightFiredRef.current === highlightKey) return

    let cancelled = false
    const retryDelays = [400, 800, 1500, 2500]
    let attempt = 0

    const tryHighlight = () => {
      if (cancelled) return
      const editor = protocolEditorRef.current
      if (!editor) return
      editor.commands.setRagHighlight(activeHighlightTarget.excerpt)
      requestAnimationFrame(() => {
        if (cancelled) return
        const el = editor.view.dom.querySelector('.rag-chunk-highlight')
        if (el) {
          highlightFiredRef.current = highlightKey
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          setTimeout(() => {
            document.querySelectorAll('.rag-chunk-highlight').forEach((e) => e.classList.add('fading'))
            setTimeout(() => { try { editor.commands.clearRagHighlight() } catch {} }, 1_200)
          }, 12_000)
        } else if (attempt < retryDelays.length - 1) {
          try { editor.commands.clearRagHighlight() } catch {}
          attempt++
          setTimeout(tryHighlight, retryDelays[attempt])
        }
      })
    }

    const initialTimer = setTimeout(tryHighlight, retryDelays[0])
    return () => { cancelled = true; clearTimeout(initialTimer) }
  }, [activeHighlightTarget, protocolEditorReady])

  const handleActiveToggleView = async (checked: boolean) => {
    const previous = isActiveView
    setIsActiveView(checked)
    setIsSavingActive(true)
    try {
      const supabase = createClient()
      const { error } = await updateProtocolWithOptionalContext(supabase, protocol.id, {
        is_active: checked,
      })
      if (error) throw error
      setFormData((prev) => ({ ...prev, is_active: checked }))
      toast({
        title: checked ? "Protocol activated" : "Protocol deactivated",
        description: checked
          ? "This protocol can be linked to experiments."
          : "This protocol is marked inactive.",
      })
      router.refresh()
    } catch (e: unknown) {
      setIsActiveView(previous)
      const message = e instanceof Error ? e.message : "Update failed"
      toast({ title: "Could not update status", description: message, variant: "destructive" })
    } finally {
      setIsSavingActive(false)
    }
  }

  const handleContextChange = useCallback(
    (projectId: string | null, experimentId: string | null) => {
      setFormData((prev) => ({
        ...prev,
        project_id: projectId ?? "",
        experiment_id: experimentId ?? "",
      }))
    },
    []
  )

  const designProtocol = useMemo(
    () => ({
      id: protocol.id,
      name: formData.name,
      content: formData.content,
      version: formData.version,
      project_id: formData.project_id || null,
      experiment_id: formData.experiment_id || null,
      document_template_id: protocol.document_template_id ?? null,
      document_template: protocol.document_template ?? null,
    }),
    [
      protocol.id,
      protocol.document_template_id,
      protocol.document_template,
      formData.name,
      formData.content,
      formData.version,
      formData.project_id,
      formData.experiment_id,
    ]
  )

  // ─── Design mode (?design=1) — full editing in ProtocolDesignMode ───────
  if (defaultDesignMode) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <ProtocolDesignMode
          protocol={designProtocol}
          onSaved={() => router.refresh()}
          onExitDesignMode={() => router.push(viewHref)}
          onContextChange={handleContextChange}
          onProtocolNameChange={(name) => setFormData((c) => ({ ...c, name }))}
        />
      </div>
    )
  }

  // ─── View mode — read-only; editing only in Design Mode ───────────────────
  return (
    <>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Card className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden py-0">
          <CardContent className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-4 pb-4 pt-4 sm:px-6">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-background">
              <div className="flex shrink-0 flex-col gap-2 border-b border-border/70 px-3 py-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-2">
                <Label className="text-foreground">Protocol body</Label>
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-2 py-1">
                    <Label
                      htmlFor="protocol-active-view"
                      className="text-xs font-medium text-muted-foreground"
                    >
                      Active
                    </Label>
                    <Switch
                      id="protocol-active-view"
                      checked={isActiveView}
                      disabled={isSavingActive}
                      onCheckedChange={handleActiveToggleView}
                      aria-label={isActiveView ? "Deactivate protocol" : "Activate protocol"}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="min-h-9 gap-1.5 px-2 text-xs text-muted-foreground touch-manipulation sm:min-h-8"
                    onClick={() => {
                      setContentHistoryOpen(true)
                      loadDiffs()
                    }}
                    aria-label="Change history"
                  >
                    <History className="h-3.5 w-3.5" />
                    Change history
                  </Button>
                  <NoteExportMenu
                    title={protocol.name || "protocol"}
                    htmlContent={protocol.content || ""}
                    trigger={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 touch-manipulation sm:h-8 sm:w-8"
                        aria-label="Export protocol"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    }
                  />
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto px-2 py-0 text-xs text-muted-foreground"
                    onClick={() => setDesignModePromptOpen(true)}
                  >
                    Why can&apos;t I edit?
                  </Button>
                </div>
              </div>
              {/* Must not be a <button>: TipTap renders TOC etc. with inner <button>s (invalid nesting + hydration error). */}
              <div className="min-h-0 flex-1 overflow-hidden text-left">
                <TiptapEditor
                  content={protocol.content ?? ""}
                  onChange={() => {}}
                  placeholder=""
                  title={protocol.name || "protocol"}
                  minHeight="100%"
                  fillParentHeight
                  editable={false}
                  hideToolbar
                  showAITools={false}
                  showAiWritingDropdown={false}
                  className="min-h-0 flex-1 border-0 shadow-none"
                  onEditorReady={(ed) => { protocolEditorRef.current = ed; setProtocolEditorReady(!!ed) }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={designModePromptOpen} onOpenChange={setDesignModePromptOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Edit</AlertDialogTitle>
            <AlertDialogDescription>
              The protocol document can&apos;t be edited on this page. Switch to Design Mode to
              change the body. Version and category are edited there too (metadata is also on the
              Details tab). You can toggle Active / inactive in the header without Design Mode.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay here</AlertDialogCancel>
            <AlertDialogAction asChild>
              <Link href={designModeHref}>Open Design Mode</Link>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ContentDiffHistoryDialog
        open={contentHistoryOpen}
        onOpenChange={setContentHistoryOpen}
        diffs={diffs}
        loading={diffsLoading}
        error={diffsError}
        exportContext={{ recordType: "protocol", recordId: protocol.id }}
      />
    </>
  )
}
