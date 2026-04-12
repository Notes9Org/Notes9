"use client"

import { useMemo, useState, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
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
import { Download } from "lucide-react"
import { ProtocolDesignMode } from "@/components/protocols/protocol-design-mode"

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
          <CardContent className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-6 pb-4 pt-4">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-background">
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/70 px-3 py-2">
                <Label className="text-foreground">Protocol body</Label>
                <div className="flex items-center gap-2">
                  <NoteExportMenu
                    title={protocol.name || "protocol"}
                    htmlContent={protocol.content || ""}
                    trigger={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
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
                />
              </div>
            </div>

            <div className="flex shrink-0 flex-col gap-3 rounded-lg border border-border bg-muted/20 p-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="protocol-active-view" className="text-sm font-medium text-foreground">
                  Active protocol
                </Label>
                <p className="text-xs text-muted-foreground">
                  Active protocols can be linked to experiments. You can change this here or in
                  Design Mode.
                </p>
              </div>
              <Switch
                id="protocol-active-view"
                checked={isActiveView}
                disabled={isSavingActive}
                onCheckedChange={handleActiveToggleView}
                aria-label={isActiveView ? "Deactivate protocol" : "Activate protocol"}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={designModePromptOpen} onOpenChange={setDesignModePromptOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Edit in Design Mode</AlertDialogTitle>
            <AlertDialogDescription>
              The protocol document can&apos;t be edited on this page. Switch to Design Mode to
              change the body. Version and category are edited there too (metadata is also on the
              Details tab). You can toggle Active / inactive below without Design Mode.
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
    </>
  )
}
