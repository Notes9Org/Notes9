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
import Link from "next/link"
import { BookOpen, Download, LayoutTemplate, PanelLeftClose, X } from "lucide-react"
import {
  ProtocolLiteraturePanel,
  type LiteraturePaperItem,
} from "./protocol-literature-panel"
import { ProtocolChangeApprovalBar } from "./protocol-change-approval"
import { ProtocolAiSidechat } from "./protocol-ai-sidechat"
import { extractProtocolTemplateShell } from "@/lib/extract-protocol-template-shell"
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
import { useHeaderAi } from "@/components/layout/header-ai-context"
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
  const { setRegistration } = useHeaderAi()

  const [draftContent, setDraftContent] = useState(protocol.content)
  const [savedContent, setSavedContent] = useState(protocol.content)
  const [currentVersion, setCurrentVersion] = useState(protocol.version)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const titleInputRef = useRef<HTMLInputElement>(null)

  const [aiContextPapers, setAiContextPapers] = useState<LiteraturePaperItem[]>([])
  const [aiContextProtocols, setAiContextProtocols] = useState<ProtocolContextItem[]>([])
  const [protocolContextCandidates, setProtocolContextCandidates] = useState<
    ProtocolContextItem[]
  >([])
  const [literatureViewerMeta, setLiteratureViewerMeta] = useState<
    Record<string, { title: string; abstract: string | null; pdfUrl: string | null }>
  >({})
  const [activeMainTabKey, setActiveMainTabKey] = useState<string>("editor")
  /** Filtered repo papers from the literature panel — same list as @-mention picker. */
  const [literaturePanelPapers, setLiteraturePanelPapers] = useState<
    LiteraturePaperItem[]
  >([])
  /** Closed until client knows viewport — avoids a flash of the desktop sidebar on phones. */
  const [showLiteraturePanel, setShowLiteraturePanel] = useState(false)
  const isNarrow = useMediaQuery("(max-width: 767px)")
  const [showAiPanel, setShowAiPanel] = useState(false)
  const [scientificCalculatorOpen, setScientificCalculatorOpen] = useState(false)
  const protocolEditorRef = useRef<Editor | null>(null)

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
    if (typeof window === "undefined") return
    setShowLiteraturePanel(window.innerWidth >= 768)
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

  const mergeAiPapers = useCallback((items: LiteraturePaperItem[]) => {
    setAiContextPapers((prev) => {
      const m = new Map(prev.map((p) => [p.id, p]))
      for (const p of items) m.set(p.id, p)
      return Array.from(m.values())
    })
  }, [])

  const removeAiPaper = useCallback((id: string) => {
    setAiContextPapers((prev) => prev.filter((p) => p.id !== id))
  }, [])

  const addAiProtocols = useCallback((items: ProtocolContextItem[]) => {
    setAiContextProtocols((prev) => {
      const m = new Map(prev.map((p) => [p.id, p]))
      for (const p of items) m.set(p.id, p)
      return Array.from(m.values())
    })
  }, [])

  const removeAiProtocol = useCallback((id: string) => {
    setAiContextProtocols((prev) => prev.filter((p) => p.id !== id))
  }, [])

  useEffect(() => {
    let cancelled = false
    if (!organizationId) {
      setProtocolContextCandidates([])
      return
    }

    const run = async () => {
      const supabase = createClient()
      let query = supabase
        .from("protocols")
        .select("id, name, content, version")
        .eq("organization_id", organizationId)
        .neq("id", protocol.id)
        .order("updated_at", { ascending: false })
        .limit(80)

      if (protocol.project_id) query = query.eq("project_id", protocol.project_id)
      if (protocol.experiment_id) query = query.eq("experiment_id", protocol.experiment_id)

      const { data, error } = await query
      if (cancelled) return
      if (error) {
        setProtocolContextCandidates([])
        return
      }
      setProtocolContextCandidates((data as ProtocolContextItem[]) ?? [])
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [organizationId, protocol.id, protocol.project_id, protocol.experiment_id])

  useEffect(() => {
    const ids = aiContextPapers.map((p) => p.id).filter(Boolean)
    if (ids.length === 0) return
    let cancelled = false
    const run = async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from("literature_reviews")
        .select("id, title, abstract, pdf_file_url")
        .in("id", ids)
      if (cancelled) return
      const rows = (data ??
        []) as Array<{
        id: string
        title: string
        abstract: string | null
        pdf_file_url: string | null
      }>
      setLiteratureViewerMeta((prev) => {
        const next = { ...prev }
        for (const row of rows) {
          next[row.id] = {
            title: row.title,
            abstract: row.abstract ?? null,
            // Always prefer same-origin authenticated stream route for in-app viewing.
            pdfUrl: `/api/literature/${row.id}/viewer-pdf`,
          }
        }
        return next
      })
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [aiContextPapers])

  const contextViewerTabs = useMemo<ContextViewerTab[]>(() => {
    const literatureTabs = aiContextPapers.map((p) => {
      const meta = literatureViewerMeta[p.id]
      return {
        key: `literature:${p.id}`,
        kind: "literature" as const,
        id: p.id,
        title: meta?.title || p.title,
        pdfUrl: meta?.pdfUrl ?? null,
        abstract: meta?.abstract ?? null,
      }
    })
    const protocolTabs = aiContextProtocols.map((p) => ({
      key: `protocol:${p.id}`,
      kind: "protocol" as const,
      id: p.id,
      title: p.name || "Untitled protocol",
      content: p.content ?? "",
    }))
    return [...literatureTabs, ...protocolTabs]
  }, [aiContextPapers, aiContextProtocols, literatureViewerMeta])

  useEffect(() => {
    if (activeMainTabKey === "editor") return
    if (!contextViewerTabs.some((t) => t.key === activeMainTabKey)) {
      setActiveMainTabKey("editor")
    }
  }, [contextViewerTabs, activeMainTabKey])

  const activeContextTab =
    contextViewerTabs.find((tab) => tab.key === activeMainTabKey) ?? null

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

  const handleAiApply = useCallback((html: string) => {
    setDraftContent((prev) => prev + "\n" + html)
  }, [])

  const addPapersToAiContext = useCallback(
    (papers: LiteraturePaperItem[]) => {
      mergeAiPapers(papers)
      setShowAiPanel(true)
    },
    [mergeAiPapers]
  )

  const aiPanel = useMemo(
    () => (
      <ProtocolAiSidechat
        protocolId={protocol.id}
        templateShellHtml={templateShellForAi}
        protocolTitle={protocol.name}
        currentEditorContent={draftContent}
        currentVersion={currentVersion}
        aiContextPapers={aiContextPapers}
        aiContextProtocols={aiContextProtocols}
        literatureCandidates={literaturePanelPapers}
        onAddPapers={addPapersToAiContext}
        onAddProtocols={addAiProtocols}
        onRemovePaper={removeAiPaper}
        onRemoveProtocol={removeAiProtocol}
        onApplyToEditor={handleAiApply}
        onHighlightInEditor={(excerpt) => {
          const editor = protocolEditorRef.current
          if (!editor) return
          editor.commands.setRagHighlight(excerpt)
          requestAnimationFrame(() => {
            const el = editor.view.dom.querySelector('.rag-chunk-highlight')
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' })
              setTimeout(() => {
                document.querySelectorAll('.rag-chunk-highlight').forEach((e) => e.classList.add('fading'))
                setTimeout(() => { try { editor.commands.clearRagHighlight() } catch {} }, 1_200)
              }, 12_000)
            }
          })
        }}
        onClose={() => setShowAiPanel(false)}
        className="h-full"
      />
    ),
    [
      protocol.id,
      templateShellForAi,
      protocol.name,
      draftContent,
      currentVersion,
      aiContextPapers,
      aiContextProtocols,
      literaturePanelPapers,
      addPapersToAiContext,
      protocolContextCandidates,
      addAiProtocols,
      removeAiPaper,
      removeAiProtocol,
      handleAiApply,
    ]
  )

  useEffect(() => {
    setRegistration({
      active: true,
      isOpen: showAiPanel,
      onToggle: () => setShowAiPanel((v) => !v),
      panel: aiPanel,
      ariaLabel: showAiPanel ? "Close protocol AI" : "Open protocol AI",
      title: showAiPanel ? "Close protocol AI" : "Open protocol AI",
    })
  }, [setRegistration, showAiPanel, aiPanel])

  useEffect(() => {
    return () => setRegistration(null)
  }, [setRegistration])

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {/* ── Card shell (matches lab notes Card) ──────────────────────────── */}
      <Card className="flex min-h-0 min-w-0 flex-1 w-full flex-col gap-0 rounded-none border-0 border-t border-border/40 py-0 shadow-none">
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-row items-stretch overflow-hidden">
          {/* Mobile: literature as full-height sheet over the editor */}
          {isNarrow && showLiteraturePanel && (
            <>
              <button
                type="button"
                className="fixed inset-0 z-40 bg-black/40"
                aria-label="Close literature panel"
                onClick={() => setShowLiteraturePanel(false)}
              />
              <aside
                className="fixed inset-y-0 left-0 z-50 flex w-[min(22rem,calc(100vw-0.75rem))] min-w-0 flex-col overflow-hidden border-r border-border bg-background shadow-xl"
                id="protocol-literature-mobile"
              >
                <ProtocolLiteraturePanel
                  projectId={protocol.project_id}
                  experimentId={protocol.experiment_id}
                  variant="aiContext"
                  onAddToAiContext={(papers) => {
                    mergeAiPapers(papers)
                    setShowAiPanel(true)
                  }}
                  onPapersChange={setLiteraturePanelPapers}
                  showFilters={Boolean(onContextChange)}
                  onContextChange={onContextChange}
                  protocolCandidates={protocolContextCandidates}
                  onAddProtocols={addAiProtocols}
                />
              </aside>
            </>
          )}

          {/* Desktop: inline literature column */}
          {!isNarrow && (
            <>
              <aside
                className={cn(
                  "flex min-h-0 shrink-0 flex-col self-stretch overflow-hidden border-r border-border bg-background transition-all duration-200",
                  showLiteraturePanel ? "w-64 min-w-[16rem]" : "w-0 min-w-0 border-r-0"
                )}
                aria-hidden={!showLiteraturePanel}
                id="protocol-literature-desktop"
              >
                {showLiteraturePanel && (
                  <ProtocolLiteraturePanel
                    projectId={protocol.project_id}
                    experimentId={protocol.experiment_id}
                    variant="aiContext"
                    onAddToAiContext={(papers) => {
                      mergeAiPapers(papers)
                      setShowAiPanel(true)
                    }}
                    onPapersChange={setLiteraturePanelPapers}
                    showFilters={Boolean(onContextChange)}
                    onContextChange={onContextChange}
                    protocolCandidates={protocolContextCandidates}
                    onAddProtocols={addAiProtocols}
                  />
                )}
              </aside>

              {showLiteraturePanel && (
                <Separator
                  orientation="vertical"
                  decorative
                  className="min-h-0 shrink-0 self-stretch bg-border/70"
                />
              )}
            </>
          )}

          {/* ── Main editor area ──────────────────────────────────────── */}
          <div className="relative z-0 flex min-h-0 min-w-0 flex-1 flex-col gap-3 py-3 sm:gap-4 sm:py-4">
            {contextViewerTabs.length > 0 && (
              <div className="shrink-0 px-3 sm:px-6">
                <div className="rounded-xl border border-border/60 bg-background/80 shadow-sm backdrop-blur">
                  <div className="flex gap-1.5 overflow-x-auto px-2 py-2">
                    <button
                      type="button"
                      className={cn(
                        "shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-medium transition-all",
                        activeMainTabKey === "editor"
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                      )}
                      onClick={() => setActiveMainTabKey("editor")}
                    >
                      Editor
                    </button>
                    {contextViewerTabs.length > 0 && (
                      <span className="shrink-0 px-1 py-1.5 text-xs text-muted-foreground/70">
                        |
                      </span>
                    )}
                    {contextViewerTabs.map((tab) => (
                      <div
                        key={tab.key}
                        className={cn(
                          "flex shrink-0 items-center rounded-lg transition-all",
                          tab.key === activeMainTabKey
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                        )}
                      >
                        <button
                          type="button"
                          className="max-w-[220px] truncate px-3 py-1.5 text-[11px] font-medium"
                          onClick={() => setActiveMainTabKey(tab.key)}
                          title={tab.title}
                        >
                          {tab.title}
                        </button>
                        <button
                          type="button"
                          className={cn(
                            "mr-1 rounded p-0.5 transition-colors",
                            tab.key === activeMainTabKey
                              ? "hover:bg-primary-foreground/20"
                              : "hover:bg-muted"
                          )}
                          aria-label={`Close ${tab.title}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            if (tab.kind === "literature") {
                              removeAiPaper(tab.id)
                            } else {
                              removeAiProtocol(tab.id)
                            }
                          }}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeMainTabKey === "editor" ? (
              <>
                {/* ── Document chrome (mirrors lab notes CardHeader) ── */}
                <CardHeader className="shrink-0 px-3 pb-0 sm:px-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  {/* Literature toggle — mirrors the notes-list toggle in lab notes */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowLiteraturePanel((v) => !v)}
                    aria-pressed={showLiteraturePanel}
                    aria-expanded={showLiteraturePanel}
                    aria-controls={
                      isNarrow ? "protocol-literature-mobile" : "protocol-literature-desktop"
                    }
                    title={showLiteraturePanel ? "Hide literature" : "Show literature"}
                  >
                    {showLiteraturePanel ? (
                      <PanelLeftClose className="h-4 w-4" aria-hidden />
                    ) : (
                      <BookOpen className="h-4 w-4" aria-hidden />
                    )}
                  </Button>

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

                {/* Right action buttons */}
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-1 sm:justify-start">
                  <Badge variant="outline" className="shrink-0 text-[10px] font-normal">
                    v{currentVersion}
                  </Badge>
                  <NoteExportMenu
                    title={protocol.name}
                    htmlContent={draftContent}
                    trigger={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
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
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={onExitDesignMode}
                      aria-label="Exit design mode"
                      title="Exit design mode"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              <div className="mt-3 flex flex-col gap-2 border-t border-border/50 pt-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
                <span className="text-xs font-medium text-muted-foreground shrink-0">
                  Document template
                </span>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  {draftDocumentTemplateId ? (
                    <Badge
                      variant="secondary"
                      className="text-xs font-normal gap-1 max-w-full truncate sm:max-w-[min(100%,240px)]"
                      title={draftTemplateLabel ?? undefined}
                    >
                      {draftTemplateLabel ?? "Document template"}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      None (blank or library letterhead shell)
                    </span>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 min-h-9 w-full gap-1.5 text-xs sm:h-7 sm:min-h-0 sm:w-auto touch-manipulation"
                    onClick={() => {
                      setPickerChoice(null)
                      setTemplateDialogOpen(true)
                    }}
                  >
                    <LayoutTemplate className="h-3.5 w-3.5" />
                    Change template
                  </Button>
                </div>
                <Link
                  href="/protocols?tab=templates"
                  className="text-xs text-primary hover:underline sm:ml-auto"
                >
                  Manage uploads
                </Link>
              </div>
                </CardHeader>

                {/* ── Editor (mirrors lab notes CardContent) ── */}
                <CardContent className="flex min-h-0 min-w-0 flex-1 flex-col space-y-3 px-3 sm:px-6">
                  <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
                    <TiptapEditor
                      content={draftContent}
                      onChange={setDraftContent}
                      placeholder="Draft your protocol… In Protocol (header): drag papers from Literature or type @ to attach from the filtered list."
                      title={protocol.name}
                      minHeight="100%"
                      fillParentHeight
                      showAITools
                      showAiWritingDropdown={false}
                      enableMath
                      className="min-h-0 flex-1"
                      onOpenScientificCalculator={() => setScientificCalculatorOpen(true)}
                      onEditorReady={(ed) => {
                        protocolEditorRef.current = ed
                      }}
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
            ) : (
              <div className="min-h-0 flex-1 px-3 sm:px-6">
                <div className="h-full min-h-0 rounded-lg border border-border/50 bg-background p-3">
                  {activeContextTab?.kind === "literature" && activeContextTab.pdfUrl ? (
                    <iframe
                      src={activeContextTab.pdfUrl}
                      title={activeContextTab.title}
                      className="h-full min-h-0 w-full rounded-md border"
                    />
                  ) : activeContextTab?.kind === "protocol" ? (
                    <div className="h-full min-h-0 overflow-y-auto rounded-md border bg-muted/20 p-3 text-xs text-foreground">
                      {activeContextTab.content ? (
                        <div dangerouslySetInnerHTML={{ __html: activeContextTab.content }} />
                      ) : (
                        <p className="text-muted-foreground">No protocol content available.</p>
                      )}
                    </div>
                  ) : (
                    <div className="h-full min-h-0 overflow-y-auto rounded-md border bg-muted/20 p-3 text-xs text-foreground">
                      <p>{activeContextTab?.abstract || "No PDF available for this literature item."}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>

      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="max-h-[min(90dvh,85vh)] w-[calc(100vw-1rem)] max-w-3xl overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Change template</DialogTitle>
            <DialogDescription>
              Replaces the draft body with the selected letterhead and section skeleton. Confirm with{" "}
              <span className="font-medium text-foreground">Accept changes</span> below to save.
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
    </div>
  )
}
