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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
import { Download, FlaskConical, FolderOpen, History, Save } from "lucide-react"
import { ProtocolDesignMode } from "@/components/protocols/protocol-design-mode"
import {
  DOCUMENT_HIGHLIGHT_EVENT,
  HIGHLIGHT_PARAM,
  decodeHighlightParam,
  normalizeAgentSourceType,
  type HighlightTarget,
} from "@/lib/document-highlight"
import type { Editor } from "@tiptap/react"

type ProjectOption = { id: string; name: string }
type ExperimentOption = { id: string; name: string; project_id: string }

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
  const [isSavingContext, setIsSavingContext] = useState(false)
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [experiments, setExperiments] = useState<ExperimentOption[]>([])
  const [isLoadingExperiments, setIsLoadingExperiments] = useState(false)
  const [savedContext, setSavedContext] = useState({
    project_id: protocol.project_id ?? "",
    experiment_id: protocol.experiment_id ?? "",
  })
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

  useEffect(() => {
    setSavedContext({
      project_id: protocol.project_id ?? "",
      experiment_id: protocol.experiment_id ?? "",
    })
    setFormData((prev) => ({
      ...prev,
      project_id: protocol.project_id ?? "",
      experiment_id: protocol.experiment_id ?? "",
    }))
  }, [protocol.id, protocol.project_id, protocol.experiment_id])

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user || cancelled) return

      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", user.id)
        .single()

      if (!profile?.organization_id || cancelled) return

      const { data: projectRows } = await supabase
        .from("projects")
        .select("id, name")
        .eq("organization_id", profile.organization_id)
        .order("name")

      if (cancelled) return
      setProjects((projectRows as ProjectOption[] | null) ?? [])
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!formData.project_id) {
      setExperiments([])
      setIsLoadingExperiments(false)
      setFormData((prev) =>
        prev.experiment_id ? { ...prev, experiment_id: "" } : prev
      )
      return
    }

    let cancelled = false
    setIsLoadingExperiments(true)

    const run = async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from("experiments")
        .select("id, name, project_id")
        .eq("project_id", formData.project_id)
        .order("name")

      if (cancelled) return
      const next = (data as ExperimentOption[] | null) ?? []
      setExperiments(next)
      setIsLoadingExperiments(false)
      if (formData.experiment_id && !next.some((e) => e.id === formData.experiment_id)) {
        setFormData((prev) => ({ ...prev, experiment_id: "" }))
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [formData.project_id, formData.experiment_id])

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

  const hasContextChanges =
    formData.project_id !== savedContext.project_id ||
    formData.experiment_id !== savedContext.experiment_id

  const handleContextSave = useCallback(async () => {
    setIsSavingContext(true)
    try {
      const supabase = createClient()
      const { error, contextSaved } = await updateProtocolWithOptionalContext(supabase, protocol.id, {
        project_id: formData.project_id || null,
        experiment_id: formData.experiment_id || null,
      })
      if (error) throw error

      setSavedContext({
        project_id: formData.project_id,
        experiment_id: formData.experiment_id,
      })
      if (!contextSaved) {
        toast({
          title: "Context not saved",
          description:
            "This database does not yet support protocol project or experiment links. Run migration 030 and try again.",
          variant: "destructive",
        })
        return
      }

      toast({
        title: "Protocol links updated",
        description: formData.experiment_id
          ? "This protocol is now linked to the selected project and experiment."
          : formData.project_id
            ? "This protocol is now linked to the selected project."
            : "Project and experiment links were cleared.",
      })
      router.refresh()
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Update failed"
      toast({
        title: "Could not update protocol links",
        description: message,
        variant: "destructive",
      })
    } finally {
      setIsSavingContext(false)
    }
  }, [formData.project_id, formData.experiment_id, protocol.id, router, toast])

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
              <div className="flex shrink-0 flex-col gap-3 border-b border-border/70 bg-muted/20 px-3 py-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="protocol-project-link" className="text-xs text-muted-foreground">
                        Linked project
                      </Label>
                      <Select
                        value={formData.project_id || "__none__"}
                        onValueChange={(value) =>
                          setFormData((prev) => ({
                            ...prev,
                            project_id: value === "__none__" ? "" : value,
                            experiment_id:
                              value === "__none__" || prev.project_id !== value ? "" : prev.experiment_id,
                          }))
                        }
                      >
                        <SelectTrigger id="protocol-project-link" className="h-9">
                          <SelectValue placeholder="Select a project" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">No project</SelectItem>
                          {projects.map((project) => (
                            <SelectItem key={project.id} value={project.id}>
                              <span className="flex items-center gap-1.5">
                                <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
                                {project.name}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="protocol-experiment-link" className="text-xs text-muted-foreground">
                        Linked experiment
                      </Label>
                      <Select
                        value={formData.experiment_id || "__none__"}
                        onValueChange={(value) =>
                          setFormData((prev) => ({
                            ...prev,
                            experiment_id: value === "__none__" ? "" : value,
                          }))
                        }
                        disabled={!formData.project_id || isLoadingExperiments}
                      >
                        <SelectTrigger id="protocol-experiment-link" className="h-9">
                          <SelectValue
                            placeholder={
                              !formData.project_id
                                ? "Select a project first"
                                : isLoadingExperiments
                                  ? "Loading…"
                                  : "Select an experiment"
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">No experiment</SelectItem>
                          {experiments.map((experiment) => (
                            <SelectItem key={experiment.id} value={experiment.id}>
                              <span className="flex items-center gap-1.5">
                                <FlaskConical className="h-3.5 w-3.5 text-muted-foreground" />
                                {experiment.name}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center justify-end">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => void handleContextSave()}
                      disabled={isSavingContext || !hasContextChanges}
                    >
                      <Save className="h-3.5 w-3.5" />
                      {isSavingContext ? "Saving…" : "Save links"}
                    </Button>
                  </div>
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
