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
import type { PostgrestError } from "@supabase/supabase-js"
import { useAuthUser } from "@/components/auth/auth-provider"
import { useToast } from "@/hooks/use-toast"
import { useContentDiffs } from "@/hooks/use-content-diffs"
import { useDocumentVersions, type DocumentVersion } from "@/hooks/use-document-versions"
import { DocumentVersionsDialog } from "@/components/document-versions/document-versions-dialog"
import Link from "next/link"
import { TiptapEditor } from "@/components/text-editor/tiptap-editor"
import { NoteExportMenu, NotePrintButton } from "@/components/note-export-menu"
import { NoteImportButton } from "@/components/note-import-button"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { ChevronLeft, Upload, FileStack, GitCompare, List, Plus } from "lucide-react"
import { ProtocolChangeApprovalBar } from "./protocol-change-approval"
import { ProtocolSiblingsList } from "./protocol-siblings-list"
// ProtocolAiSidechat + ProtocolLiteraturePanel are no longer mounted in edit mode.
import { extractProtocolTemplateShell } from "@/lib/extract-protocol-template-shell"
import { sanitizeHtml } from "@/lib/sanitize-html"
import { buildProtocolDraftHtmlFromExtracted } from "@/lib/build-protocol-draft-from-template"
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
  samples?: { id: string; name: string; sample_code: string | null }[]
  onContextChange?: (projectId: string | null, experimentId: string | null) => void
  onProtocolNameChange?: (name: string) => void
  onProtocolNameCommit?: (name: string) => void
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
  samples,
  onContextChange,
  onProtocolNameChange,
  onProtocolNameCommit,
}: ProtocolDesignModeProps) {
  const user = useAuthUser();
  const { toast } = useToast()

  const [draftContent, setDraftContent] = useState(protocol.content)
  const [savedContent, setSavedContent] = useState(protocol.content)
  const historyBaselineRef = useRef(protocol.content)
  const { recordDiff } = useContentDiffs("protocol", protocol.id)
  // Immutable version history (document_versions) — written by the
  // trg_write_document_version trigger on every committed content change.
  const {
    versions,
    loading: versionsLoading,
    error: versionsError,
    loadVersions,
  } = useDocumentVersions("protocol", protocol.id)
  const [versionsOpen, setVersionsOpen] = useState(false)
  // Bumped on Restore to force a fresh TiptapEditor mount (the editor's
  // lastEmittedHtmlRef guard can otherwise suppress restored content).
  const [editorRemountNonce, setEditorRemountNonce] = useState(0)
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
      if (!user || cancelled) return
      try {
        const { data: profile, error } = await supabase
          .from("profiles")
          .select("organization_id")
          .eq("id", user.id)
          .single()
        if (error) {
          console.error("protocol_design_mode_org_load_failed", error)
        }
        if (!cancelled) setOrganizationId(profile?.organization_id ?? null)
      } catch (err) {
        console.error("protocol_design_mode_org_load_failed", err)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setDraftContent(protocol.content)
    setSavedContent(protocol.content)
    historyBaselineRef.current = protocol.content
    setCurrentVersion(protocol.version)
    const dt = protocol.document_template_id ?? null
    setDraftDocumentTemplateId(dt)
    setSavedDocumentTemplateId(dt)
    const label = protocol.document_template?.name ?? null
    setDraftTemplateLabel(label)
    setSavedTemplateLabel(label)
  }, [protocol.id, protocol.content, protocol.version, protocol.document_template_id, protocol.document_template])

  // Record change history as the user edits (debounced), aligned with lab note auto-save cadence.
  useEffect(() => {
    const baseline = historyBaselineRef.current
    if (draftContent === baseline) return

    const timer = window.setTimeout(() => {
      void (async () => {
        const ok = await recordDiff({
          recordType: "protocol",
          recordId: protocol.id,
          previousContent: baseline,
          newContent: draftContent,
          documentTitle: protocol.name || null,
        })
        if (ok) historyBaselineRef.current = draftContent
      })()
    }, 2000)

    return () => window.clearTimeout(timer)
  }, [draftContent, protocol.id, protocol.name, recordDiff])

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
      if (!user) throw new Error("Not authenticated")

      // commit_protocol sets app.force_version so the trigger writes an immutable
      // version even inside its 3-minute throttle window, then updates the
      // protocol — one transaction, no double-write. The trigger owns versioning.
      const { error: upErr } = await supabase.rpc("commit_protocol", {
        p_id: protocol.id,
        p_content: newContent,
        p_version: newVersion,
        p_name: protocol.name,
        p_document_template_id: draftDocumentTemplateId,
        p_user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      })
      // upErr from .rpc() is a PostgrestError object, not an Error. Throwing it
      // raw bubbles to the Next.js overlay as "[object Object]"; instead toast a
      // real message and bail without advancing the saved baseline (so the
      // approval bar stays "pending" and the user can retry). The hint covers
      // the case where migration 067 hasn't been run yet.
      if (upErr) {
        const msg = upErr.message || "Failed to save protocol."
        toast({
          title: "Couldn't save protocol",
          description: /commit_protocol|function .* does not exist/i.test(msg)
            ? `${msg} — run scripts/067_protocol_versions.sql.`
            : msg,
          variant: "destructive",
        })
        return
      }
      if (versionsOpen) void loadVersions()

      supabase.from("audit_log").insert({
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
      }).then(({ error }: { error: PostgrestError | null }) => { if (error) console.warn("[audit_log]", error.message) })

      onSaved()
      setSavedContent(newContent)
      historyBaselineRef.current = newContent
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
      versionsOpen,
      loadVersions,
    ]
  )

  const handleOpenVersions = useCallback(() => {
    setVersionsOpen(true)
    void loadVersions()
  }, [loadVersions])

  // Restore a prior version: re-commit its content as a new (bumped) version via
  // commit_protocol; the trigger records it. Mirror the result into local state.
  const handleRestoreVersion = useCallback(
    async (version: DocumentVersion) => {
      const supabase = createClient()
      const restoredContent = version.content ?? ""
      // Bump the patch number so the restore lands as a new protocol version.
      const parts = (currentVersion || "1.0").split(".")
      const last = parseInt(parts[parts.length - 1] ?? "0", 10)
      const restoredVersion = isNaN(last)
        ? `${currentVersion}.1`
        : [...parts.slice(0, -1), String(last + 1)].join(".")
      const { error } = await supabase.rpc("commit_protocol", {
        p_id: protocol.id,
        p_content: restoredContent,
        p_version: restoredVersion,
        p_name: protocol.name,
        p_document_template_id: savedDocumentTemplateId,
        p_user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      })
      if (error) {
        toast({ title: "Restore failed", description: error.message, variant: "destructive" })
        return
      }
      setDraftContent(restoredContent)
      setSavedContent(restoredContent)
      historyBaselineRef.current = restoredContent
      setCurrentVersion(restoredVersion)
      setEditorRemountNonce((n) => n + 1) // force the editor to show the restored body
      setVersionsOpen(false)
      onSaved()
      void loadVersions()
      toast({ title: "Version restored", description: `Restored v${version.version_no} as protocol v${restoredVersion}.` })
    },
    [protocol.id, protocol.name, currentVersion, savedDocumentTemplateId, onSaved, loadVersions, toast],
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
            onBlur={() => {
              setIsEditingTitle(false)
              onProtocolNameCommit?.(protocol.name)
            }}
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
      <Badge variant="outline" className="shrink-0 text-2xs font-normal">
        v{currentVersion}
      </Badge>
      <Button
        asChild
        type="button"
        variant="ghost"
        size="icon-sm"
        className="shrink-0 text-muted-foreground hover:text-foreground"
        aria-label="New protocol"
        title="New protocol"
      >
        <Link href="/protocols/new">
          <Plus className="h-4 w-4" />
        </Link>
      </Button>
      <NotePrintButton
        title={protocol.name}
        htmlContent={draftContent}
        size="icon-sm"
        className="shrink-0 text-muted-foreground hover:text-foreground"
      />
      <NoteImportButton
        className="shrink-0 text-muted-foreground hover:text-foreground"
        onImportHtml={(html) => {
          const editor = protocolEditorRef.current
          if (editor) editor.chain().focus().insertContent(html).run()
          else setDraftContent((prev) => (prev || "") + html)
        }}
      />
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
            <Upload className="h-4 w-4" />
          </Button>
        }
      />
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
            data-editor-workspace-shell=""
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
                          onBlur={() => {
                            setIsEditingTitle(false)
                            onProtocolNameCommit?.(protocol.name)
                          }}
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
                  </div>
                </div>

                {/* Right action buttons — matches lab-notes compact icon row */}
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-1 sm:justify-start">
                  <Badge variant="outline" className="shrink-0 text-2xs font-normal">
                    v{currentVersion}
                  </Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    data-tour="version-history"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={handleOpenVersions}
                    aria-label="Version history"
                    title="Version history"
                  >
                    <GitCompare className="h-4 w-4" />
                  </Button>
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
                    <FileStack className="h-4 w-4" />
                  </Button>
                  <Button
                    asChild
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="New protocol"
                    title="New protocol"
                  >
                    <Link href="/protocols/new">
                      <Plus className="h-4 w-4" />
                    </Link>
                  </Button>
                  <NotePrintButton
                    title={protocol.name}
                    htmlContent={draftContent}
                    size="icon-sm"
                    className="text-muted-foreground hover:text-foreground"
                  />
                  <NoteImportButton
                    className="text-muted-foreground hover:text-foreground"
                    onImportHtml={(html) => {
                      const editor = protocolEditorRef.current
                      if (editor) editor.chain().focus().insertContent(html).run()
                      else setDraftContent((prev) => (prev || "") + html)
                    }}
                  />
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
                        <Upload className="h-4 w-4" />
                      </Button>
                    }
                  />
                </div>
              </div>
                </CardHeader>
                ))}

                {/* ── Editor (mirrors lab notes CardContent) ── */}
                <CardContent className="flex min-h-0 min-w-0 flex-1 flex-col space-y-3 overflow-hidden px-4 sm:px-6">
                  <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
                    <TiptapEditor
                      key={`${protocol.id}:${editorRemountNonce}`}
                      content={draftContent}
                      onChange={setDraftContent}
                      placeholder="Write your protocol here... Use @ to tag protocols or samples"
                      title={protocol.name}
                      minHeight="100%"
                      fillParentHeight
                      // @ts-expect-error TiptapEditor types `samples` as EntityItem[] (requires a
                      // `type` discriminant added internally); protocol samples omit it by design.
                      samples={samples}
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
                      onSaveToHistory={(resultText) => {
                        // Record the calculator result as a dedicated content_diff
                        // entry with a [Calculator] tag in the summary.
                        void recordDiff({
                          recordType: "protocol",
                          recordId: protocol.id,
                          previousContent: draftContent,
                          newContent: draftContent + `\n<p>[Calculator] ${resultText.split("\n")[0]}</p>`,
                          documentTitle: protocol.name || null,
                        })
                      }}
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
        <DialogContent dialogSize="lg" className="max-h-[min(90dvh,85vh)] w-[calc(100vw-1rem)] overflow-y-auto p-4 sm:p-6">
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

      <DocumentVersionsDialog
        open={versionsOpen}
        onOpenChange={setVersionsOpen}
        versions={versions}
        loading={versionsLoading}
        error={versionsError}
        currentContent={draftContent}
        onRestore={handleRestoreVersion}
        recordNoun="protocol"
      />
    </>
  )
}
