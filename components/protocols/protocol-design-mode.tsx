"use client"

import {
  useState,
  useRef,
  useCallback,
  useMemo,
  useEffect,
} from "react"
import type { Editor } from "@tiptap/react"
import { createClient } from "@/lib/supabase/client"
import { useToast } from "@/hooks/use-toast"
import { TiptapEditor } from "@/components/text-editor/tiptap-editor"
import { NoteExportMenu } from "@/components/note-export-menu"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { SaveStatusIndicator } from "@/components/ui/save-status"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { ChevronLeft, Download, LayoutTemplate, List, X } from "lucide-react"
import { ProtocolChangeApprovalBar } from "./protocol-change-approval"
import { ProtocolSiblingsList } from "./protocol-siblings-list"
// ProtocolAiSidechat + ProtocolLiteraturePanel are no longer mounted in edit mode.
import { extractProtocolTemplateShell } from "@/lib/extract-protocol-template-shell"
import { sanitizeHtml } from "@/lib/sanitize-html"
import { buildProtocolDraftHtmlFromExtracted } from "@/lib/build-protocol-draft-from-template"
import { updateProtocolWithOptionalContext } from "@/lib/protocol-context-supabase"
import {
  ProtocolTemplatePicker,
  type ProtocolTemplateChoice,
} from "@/components/protocols/protocol-template-picker"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
// useHeaderAi removed — Protocol AI sidechat is no longer mounted in edit mode.
import { ScientificCalculatorSheet } from "@/components/lab-notes/scientific-calculator"
import { useMediaQuery } from "@/hooks/use-media-query"
import { cn } from "@/lib/utils"

interface ProtocolDesignModeProps {
  protocol: {
    id: string
    name: string
    content: string
    version: string
    project_id: string | null
    experiment_id: string | null
    document_template_id?: string | null
    document_template?: { id: string; name: string } | null
  }
  onSaved: () => void
  onExitDesignMode?: () => void
  onContextChange?: (projectId: string | null, experimentId: string | null) => void
  onProtocolNameChange?: (name: string) => void
}

interface ProtocolContextItem {
  id: string
  name: string
  content: string
  version: string | null
}

interface ContextViewerTab {
  key: string
  kind: "literature" | "protocol"
  id: string
  title: string
  pdfUrl?: string | null
  abstract?: string | null
  content?: string | null
}

export function ProtocolDesignMode({
  protocol,
  onSaved,
  onExitDesignMode,
  onContextChange,
  onProtocolNameChange,
}: ProtocolDesignModeProps) {
  const { toast } = useToast()

  const [draftContent, setDraftContent] = useState(protocol.content)
  const [savedContent, setSavedContent] = useState(protocol.content)
  const [currentVersion, setCurrentVersion] = useState(protocol.version)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const titleInputRef = useRef<HTMLInputElement>(null)

  // AI-context paper/protocol lists removed alongside the AI sidechat.
  const [activeMainTabKey] = useState<string>("editor")
  // Match lab-notes breakpoint (768px) and default the siblings panel open so
  // researchers see other protocols in scope as soon as they enter design mode.
  const isMobile = useMediaQuery("(max-width: 768px)")
  const [siblingsPanelOpen, setSiblingsPanelOpen] = useState(true)
  const [scientificCalculatorOpen, setScientificCalculatorOpen] = useState(false)
  const protocolEditorRef = useRef<Editor | null>(null)
  /** Literature column + editor column — Tiptap region fullscreen covers this whole strip. */
  const protocolDesignWorkspaceRef = useRef<HTMLDivElement>(null)
  /** Tiptap app-region fullscreen: collapse heavy chrome; keep literature + essentials. */
  const [tiptapRegionFullscreen, setTiptapRegionFullscreen] = useState(false)

  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [draftDocumentTemplateId, setDraftDocumentTemplateId] = useState<string | null>(
    protocol.document_template_id ?? null
  )
  const [savedDocumentTemplateId, setSavedDocumentTemplateId] = useState<string | null>(
    protocol.document_template_id ?? null
  )
  const [draftTemplateLabel, setDraftTemplateLabel] = useState<string | null>(
    protocol.document_template?.name ?? null
  )
  const [savedTemplateLabel, setSavedTemplateLabel] = useState<string | null>(
    protocol.document_template?.name ?? null
  )
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
  const [pickerChoice, setPickerChoice] = useState<ProtocolTemplateChoice | null>(null)
  const [confirmApplyOpen, setConfirmApplyOpen] = useState(false)

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
      if (!cancelled) setOrganizationId(profile?.organization_id ?? null)
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setDraftContent(protocol.content)
    setSavedContent(protocol.content)
    setCurrentVersion(protocol.version)
    const dt = protocol.document_template_id ?? null
    setDraftDocumentTemplateId(dt)
    setSavedDocumentTemplateId(dt)
    const label = protocol.document_template?.name ?? null
    setDraftTemplateLabel(label)
    setSavedTemplateLabel(label)
  }, [protocol.id, protocol.content, protocol.version, protocol.document_template_id, protocol.document_template])

  const templateMetaDirty =
    (draftDocumentTemplateId ?? null) !== (savedDocumentTemplateId ?? null)

  const hasPendingChanges = draftContent !== savedContent || templateMetaDirty

  // Focus title input when entering edit mode
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus()
      titleInputRef.current.select()
    }
  }, [isEditingTitle])

  const templateShellForAi = useMemo(
    () => extractProtocolTemplateShell(draftContent),
    [draftContent]
  )

  // AI-context lists, candidate protocols, literature-viewer metadata, and the
  // multi-tab viewer have all been retired with the Protocol AI panel removal.
  // Edit mode is now a single editor tab — no side panels.
  const contextViewerTabs: ContextViewerTab[] = []
  const activeContextTab: ContextViewerTab | null = null

  const handleAccept = useCallback(
    async (newContent: string, newVersion: string) => {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error("Not authenticated")

      const { error: upErr } = await updateProtocolWithOptionalContext(supabase, protocol.id, {
        content: newContent,
        version: newVersion,
        name: protocol.name,
        document_template_id: draftDocumentTemplateId,
      })
      if (upErr) throw upErr

      await supabase.from("audit_log").insert({
        table_name: "protocols",
        record_id: protocol.id,
        action: "update",
        old_values: {
          content: savedContent,
          version: currentVersion,
          document_template_id: savedDocumentTemplateId,
        },
        new_values: {
          content: newContent,
          version: newVersion,
          document_template_id: draftDocumentTemplateId,
        },
        user_id: user.id,
      })

      onSaved()
      setSavedContent(newContent)
      setSavedDocumentTemplateId(draftDocumentTemplateId)
      setSavedTemplateLabel(draftTemplateLabel)
      setCurrentVersion(newVersion)

      toast({
        title: "Changes accepted",
        description: `Protocol saved as v${newVersion}.`,
      })
    },
    [
      protocol.id,
      protocol.name,
      savedContent,
      currentVersion,
      savedDocumentTemplateId,
      draftDocumentTemplateId,
      draftTemplateLabel,
      toast,
      onSaved,
    ]
  )

  const handleReject = useCallback(() => {
    setDraftContent(savedContent)
    setDraftDocumentTemplateId(savedDocumentTemplateId)
  }, [savedContent, savedDocumentTemplateId])

  const applyChoiceToDraft = useCallback((choice: ProtocolTemplateChoice) => {
    if (choice.kind === "blank") {
      setDraftContent("")
      setDraftDocumentTemplateId(null)
      setDraftTemplateLabel(null)
    } else if (choice.kind === "protocol") {
      setDraftContent(extractProtocolTemplateShell(choice.template.content))
      setDraftDocumentTemplateId(null)
      setDraftTemplateLabel(null)
    } else {
      setDraftContent(
        buildProtocolDraftHtmlFromExtracted({
          templateId: choice.id,
          extracted: choice.extracted,
        })
      )
      setDraftDocumentTemplateId(choice.id)
      setDraftTemplateLabel(choice.name)
    }
  }, [])

  // Protocol AI sidechat and its supporting helpers (handleAiApply,
  // addPapersToAiContext, mergeAiPapers, etc.) have been removed from edit
  // mode per product direction. The header-AI registration is gone too so the
  // global layout no longer mounts a right-side AI panel for protocols.

  /** Fullscreen editor: literature + title share one row with Tiptap toolbar (same pattern as lab notes). */
  const protocolMergedFullscreenToolbar =
    tiptapRegionFullscreen && activeMainTabKey === "editor"

  const protocolFullscreenToolbarLeading = protocolMergedFullscreenToolbar ? (
    <div className="flex min-w-0 max-w-[min(11rem,56vw)] shrink-0 items-center gap-1.5 sm:max-w-[min(18rem,38%)] sm:gap-2">
      <div className="min-w-0 flex-1">
        {isEditingTitle ? (
          <input
            ref={titleInputRef}
            type="text"
            value={protocol.name}
            onChange={(e) => onProtocolNameChange?.(e.target.value)}
            onBlur={() => setIsEditingTitle(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                titleInputRef.current?.blur()
              }
              if (e.key === "Escape") {
                setIsEditingTitle(false)
                titleInputRef.current?.blur()
              }
            }}
            className="w-full border-b border-transparent bg-transparent pb-0.5 text-base font-semibold leading-none text-foreground outline-none focus:border-primary"
            aria-label="Edit protocol title"
          />
        ) : (
          <div
            className={cn(
              "truncate",
              onProtocolNameChange &&
                "cursor-pointer rounded px-1 -mx-1 hover:bg-muted/60 hover:text-foreground",
            )}
            onClick={() => {
              if (onProtocolNameChange) setIsEditingTitle(true)
            }}
            role={onProtocolNameChange ? "button" : undefined}
            tabIndex={onProtocolNameChange ? 0 : undefined}
            onKeyDown={(e) => {
              if (onProtocolNameChange && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault()
                setIsEditingTitle(true)
              }
            }}
            aria-label={onProtocolNameChange ? "Click to edit title" : undefined}
          >
            <h2 className="truncate text-base font-semibold leading-none text-foreground">
              {protocol.name || "Untitled protocol"}
            </h2>
          </div>
        )}
      </div>
    </div>
  ) : undefined

  const protocolFullscreenToolbarTrailing = protocolMergedFullscreenToolbar ? (
    <>
      <SaveStatusIndicator
        status={hasPendingChanges ? "unsaved" : "saved"}
        variant="icon"
      />
      <Badge variant="outline" className="shrink-0 text-2xs font-normal">
        v{currentVersion}
      </Badge>
      <NoteExportMenu
        title={protocol.name}
        htmlContent={draftContent}
        trigger={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="shrink-0 text-muted-foreground hover:text-foreground"
            aria-label="Export protocol"
          >
            <Download className="h-4 w-4" />
          </Button>
        }
      />
      {onExitDesignMode ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="shrink-0 text-muted-foreground hover:text-foreground"
          onClick={onExitDesignMode}
          aria-label="Exit design mode"
          title="Exit design mode"
        >
          <X className="h-4 w-4" />
        </Button>
      ) : null}
    </>
  ) : undefined

  // Toggle for both the desktop sidebar collapse and the mobile Sheet trigger.
  // Mirrors lab-notes pattern so the same icon button serves both modes.
  const siblingsToggleButton = (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={() => setSiblingsPanelOpen((v) => !v)}
      aria-label={siblingsPanelOpen ? "Hide protocols" : "Show protocols"}
      title={siblingsPanelOpen ? "Hide protocols list" : "Show protocols list"}
      className="text-muted-foreground hover:text-foreground"
    >
      {siblingsPanelOpen ? (
        <ChevronLeft className="h-4 w-4" />
      ) : (
        <List className="h-4 w-4" />
      )}
    </Button>
  )

  return (
    <>
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        {/* Card shell — same shape as the lab-notes single-card wrapper */}
        <Card className="flex h-full min-h-0 flex-col gap-0 py-0">
          <div
            ref={protocolDesignWorkspaceRef}
            className="flex h-full min-h-0 min-w-0 flex-1 flex-row items-stretch overflow-hidden"
          >
            {/* Siblings list — desktop column. Collapses to width 0 when hidden. */}
            <aside
              className={cn(
                "flex min-h-0 shrink-0 flex-col self-stretch overflow-hidden border-r border-border bg-muted/30 relative",
                !isMobile && siblingsPanelOpen
                  ? cn(
                      "w-52 min-w-[13rem] bg-card",
                      tiptapRegionFullscreen ? "z-[120]" : "z-10",
                    )
                  : "w-0 min-w-0 border-r-0 overflow-hidden",
              )}
              aria-hidden={!siblingsPanelOpen || isMobile}
            >
              {!isMobile && siblingsPanelOpen && (
                <ProtocolSiblingsList
                  currentProtocolId={protocol.id}
                  organizationId={organizationId}
                  projectId={protocol.project_id ?? null}
                  experimentId={protocol.experiment_id ?? null}
                />
              )}
            </aside>

            {/* Mobile: protocols list in a left Sheet overlay (matches lab-notes) */}
            {isMobile && (
              <Sheet open={siblingsPanelOpen} onOpenChange={setSiblingsPanelOpen}>
                <SheetContent side="left" className="w-72 p-0">
                  <SheetHeader className="border-b px-4 py-3">
                    <SheetTitle>Protocols</SheetTitle>
                  </SheetHeader>
                  <div className="flex h-[calc(100%-3rem)] min-h-0 flex-col">
                    <ProtocolSiblingsList
                      currentProtocolId={protocol.id}
                      organizationId={organizationId}
                      projectId={protocol.project_id ?? null}
                      experimentId={protocol.experiment_id ?? null}
                    />
                  </div>
                </SheetContent>
              </Sheet>
            )}

          {/* ── Main editor area ──────────────────────────────────────── */}
          <div
            className={cn(
              "relative z-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
              tiptapRegionFullscreen ? "gap-0 py-0 sm:py-0" : "gap-4 py-4",
            )}
          >
            {/* Context viewer tabs removed — edit mode is editor-only. */}

            {activeMainTabKey === "editor" ? (
              <>
                {/* ── Document chrome — compact CardHeader when fullscreen without merged toolbar; merged mode uses Tiptap slots ── */}
                {!protocolMergedFullscreenToolbar &&
                  (tiptapRegionFullscreen ? (
                  <CardHeader className="shrink-0 gap-1 border-b border-border/70 px-3 py-1.5 sm:px-4 [.border-b]:pb-1.5 items-center">
                    <div className="flex min-w-0 items-center gap-2">
                      {siblingsToggleButton}
                      <div className="min-w-0 flex-1">
                        {isEditingTitle ? (
                          <input
                            ref={titleInputRef}
                            type="text"
                            value={protocol.name}
                            onChange={(e) => onProtocolNameChange?.(e.target.value)}
                            onBlur={() => setIsEditingTitle(false)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault()
                                titleInputRef.current?.blur()
                              }
                              if (e.key === "Escape") {
                                setIsEditingTitle(false)
                                titleInputRef.current?.blur()
                              }
                            }}
                            className="w-full bg-transparent text-base font-semibold leading-none text-foreground outline-none border-b border-transparent pb-0.5 focus:border-primary"
                            aria-label="Edit protocol title"
                          />
                        ) : (
                          <div
                            className={cn(
                              "truncate",
                              onProtocolNameChange &&
                                "cursor-pointer rounded px-1 -mx-1 hover:bg-muted/60 hover:text-foreground",
                            )}
                            onClick={() => {
                              if (onProtocolNameChange) setIsEditingTitle(true)
                            }}
                            role={onProtocolNameChange ? "button" : undefined}
                            tabIndex={onProtocolNameChange ? 0 : undefined}
                            onKeyDown={(e) => {
                              if (
                                onProtocolNameChange &&
                                (e.key === "Enter" || e.key === " ")
                              ) {
                                e.preventDefault()
                                setIsEditingTitle(true)
                              }
                            }}
                            aria-label={
                              onProtocolNameChange ? "Click to edit title" : undefined
                            }
                          >
                            <h2 className="text-base font-semibold leading-none text-foreground truncate">
                              {protocol.name || "Untitled protocol"}
                            </h2>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                ) : (
                  <CardHeader className="shrink-0 px-4 pb-0 sm:px-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  {/* Sidebar toggle — first control in the header, like lab notes */}
                  {siblingsToggleButton}
                  {/* Editable title — same pattern as lab notes inline-edit */}
                  <div className="flex min-w-0 flex-1 items-center gap-1">
                    <div className="min-w-0 flex-1">
                      {isEditingTitle ? (
                        <input
                          ref={titleInputRef}
                          type="text"
                          value={protocol.name}
                          onChange={(e) => onProtocolNameChange?.(e.target.value)}
                          onBlur={() => setIsEditingTitle(false)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault()
                              titleInputRef.current?.blur()
                            }
                            if (e.key === "Escape") {
                              setIsEditingTitle(false)
                              titleInputRef.current?.blur()
                            }
                          }}
                          className="w-full bg-transparent text-lg font-semibold leading-none text-foreground outline-none border-b border-transparent pb-0.5 focus:border-primary"
                          aria-label="Edit protocol title"
                        />
                      ) : (
                        <div
                          className={cn(
                            "truncate",
                            onProtocolNameChange &&
                              "cursor-pointer rounded px-1 -mx-1 hover:bg-muted/60 hover:text-foreground"
                          )}
                          onClick={() => {
                            if (onProtocolNameChange) setIsEditingTitle(true)
                          }}
                          role={onProtocolNameChange ? "button" : undefined}
                          tabIndex={onProtocolNameChange ? 0 : undefined}
                          onKeyDown={(e) => {
                            if (
                              onProtocolNameChange &&
                              (e.key === "Enter" || e.key === " ")
                            ) {
                              e.preventDefault()
                              setIsEditingTitle(true)
                            }
                          }}
                          aria-label={
                            onProtocolNameChange
                              ? "Click to edit title"
                              : undefined
                          }
                        >
                          <h2 className="text-lg font-semibold leading-none text-foreground truncate">
                            {protocol.name || "Untitled protocol"}
                          </h2>
                        </div>
                      )}
                    </div>

                    {/* Save status placeholder to keep rhythm with lab notes */}
                    <SaveStatusIndicator
                      status={hasPendingChanges ? "unsaved" : "saved"}
                      variant="icon"
                    />
                  </div>
                </div>

                {/* Right action buttons — matches lab-notes compact icon row */}
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-1 sm:justify-start">
                  <Badge variant="outline" className="shrink-0 text-2xs font-normal">
                    v{currentVersion}
                  </Badge>
                  {/* Template picker collapsed into a small icon button — replaces
                      the loud horizontal "Document template" strip so the header
                      visually matches lab notes. Hover/title reveals the current
                      template name. */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className={cn(
                      "text-muted-foreground hover:text-foreground",
                      draftDocumentTemplateId && "text-foreground",
                    )}
                    onClick={() => {
                      setPickerChoice(null)
                      setTemplateDialogOpen(true)
                    }}
                    aria-label={
                      draftDocumentTemplateId
                        ? `Change template (current: ${draftTemplateLabel ?? "selected"})`
                        : "Choose template"
                    }
                    title={
                      draftDocumentTemplateId
                        ? `Template: ${draftTemplateLabel ?? "selected"}`
                        : "No template — click to pick one"
                    }
                  >
                    <LayoutTemplate className="h-4 w-4" />
                  </Button>
                  <NoteExportMenu
                    title={protocol.name}
                    htmlContent={draftContent}
                    trigger={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:text-foreground"
                        aria-label="Export protocol"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    }
                  />
                  {onExitDesignMode && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={onExitDesignMode}
                      aria-label="Exit design mode"
                      title="Exit design mode"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
                </CardHeader>
                ))}

                {/* ── Editor (mirrors lab notes CardContent) ── */}
                <CardContent className="flex min-h-0 min-w-0 flex-1 flex-col space-y-3 overflow-hidden px-4 sm:px-6">
                  <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
                    <TiptapEditor
                      content={draftContent}
                      onChange={setDraftContent}
                      placeholder="Draft your protocol… In Protocol (header): drag papers from Literature or type @ to attach from the filtered list."
                      title={protocol.name}
                      minHeight="100%"
                      fillParentHeight
                      fullscreenWorkspaceRef={protocolDesignWorkspaceRef}
                      leadingToolbarSlot={protocolFullscreenToolbarLeading}
                      trailingToolbarSlot={protocolFullscreenToolbarTrailing}
                      showAITools
                      showAiWritingDropdown={false}
                      enableMath
                      className="min-h-0 flex-1"
                      onOpenScientificCalculator={() => setScientificCalculatorOpen(true)}
                      onEditorReady={(ed) => {
                        protocolEditorRef.current = ed
                      }}
                      onEditorFullscreenChange={setTiptapRegionFullscreen}
                    />
                    <ScientificCalculatorSheet
                      open={scientificCalculatorOpen}
                      onOpenChange={setScientificCalculatorOpen}
                      getEditor={() => protocolEditorRef.current}
                    />
                  </div>

                  {/* Approval bar sits at the bottom inside the content column */}
                  <ProtocolChangeApprovalBar
                    savedContent={savedContent}
                    draftContent={draftContent}
                    protocolId={protocol.id}
                    currentVersion={currentVersion}
                    documentTitle={protocol.name || null}
                    onAccept={handleAccept}
                    onReject={handleReject}
                    extraDirty={templateMetaDirty}
                  />
                </CardContent>
              </>
            ) : null}
          </div>
          </div>
        </Card>
      </div>
    </div>

      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="max-h-[min(90dvh,85vh)] w-[calc(100vw-1rem)] max-w-3xl overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Change template</DialogTitle>
            <DialogDescription>
              Replaces the draft body with the selected letterhead and section skeleton. Your existing
              content will be replaced — nothing is saved until you confirm Accept changes in the
              approval bar below.
            </DialogDescription>
          </DialogHeader>
          <ProtocolTemplatePicker
            organizationId={organizationId}
            selected={pickerChoice}
            onSelect={setPickerChoice}
            compact
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setTemplateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!pickerChoice}
              onClick={() => setConfirmApplyOpen(true)}
            >
              Use this template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmApplyOpen} onOpenChange={setConfirmApplyOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace draft with this template?</AlertDialogTitle>
            <AlertDialogDescription>
              Your current editor draft will be replaced. Nothing is saved to the server until you accept changes in the
              bar below.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Back</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                if (pickerChoice) applyChoiceToDraft(pickerChoice)
                setConfirmApplyOpen(false)
                setTemplateDialogOpen(false)
              }}
            >
              Replace draft
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
