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
  /** Filtered repo papers from the literature panel — same list as @-mention picker. */
  const [literaturePanelPapers, setLiteraturePanelPapers] = useState<
    LiteraturePaperItem[]
  >([])
  const [showLiteraturePanel, setShowLiteraturePanel] = useState(true)
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
        literatureCandidates={literaturePanelPapers}
        onAddPapers={addPapersToAiContext}
        onRemovePaper={removeAiPaper}
        onApplyToEditor={handleAiApply}
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
      literaturePanelPapers,
      addPapersToAiContext,
      removeAiPaper,
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
        <div className="flex min-h-0 min-w-0 flex-1 flex-row items-stretch overflow-hidden">

          {/* ── Literature aside (mirrors lab notes "notes list" aside) ── */}
          <aside
            className={cn(
              "flex min-h-0 shrink-0 flex-col self-stretch overflow-hidden bg-muted/30 transition-all duration-200",
              showLiteraturePanel
                ? "w-64 min-w-[16rem]"
                : "w-0 min-w-0"
            )}
            aria-hidden={!showLiteraturePanel}
            id="protocol-literature"
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
                showFilters={!protocol.project_id && !protocol.experiment_id}
                onContextChange={onContextChange}
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

          {/* ── Main editor area ──────────────────────────────────────── */}
          <div className="relative z-0 flex min-h-0 min-w-0 flex-1 flex-col gap-4 py-4">

            {/* ── Document chrome (mirrors lab notes CardHeader) ── */}
            <CardHeader className="shrink-0 px-4 pb-0 sm:px-6">
              <div className="flex items-center justify-between gap-3">
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
                    aria-controls="protocol-literature"
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
                <div className="flex shrink-0 items-center gap-1">
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

              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/50 pt-3">
                <span className="text-xs font-medium text-muted-foreground shrink-0">
                  Document template
                </span>
                {draftDocumentTemplateId ? (
                  <Badge
                    variant="secondary"
                    className="text-xs font-normal gap-1 max-w-[min(100%,240px)] truncate"
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
                  className="h-7 gap-1.5 text-xs"
                  onClick={() => {
                    setPickerChoice(null)
                    setTemplateDialogOpen(true)
                  }}
                >
                  <LayoutTemplate className="h-3.5 w-3.5" />
                  Change template
                </Button>
                <Link
                  href="/protocols?tab=templates"
                  className="text-xs text-primary hover:underline ml-auto"
                >
                  Manage uploads
                </Link>
              </div>
            </CardHeader>

            {/* ── Editor (mirrors lab notes CardContent) ── */}
            <CardContent className="flex min-h-0 min-w-0 flex-1 flex-col space-y-3 px-4 sm:px-6">
              <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
                <TiptapEditor
                  content={draftContent}
                  onChange={setDraftContent}
                  placeholder="Draft your protocol… In Protocol AI (header): drag papers from Literature or type @ to attach from the filtered list."
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
          </div>
        </div>
      </Card>

      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
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
