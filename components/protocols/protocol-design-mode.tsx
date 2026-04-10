"use client"

import {
  useState,
  useRef,
  useCallback,
  useMemo,
  useEffect,
  useLayoutEffect,
} from "react"
import type { ImperativePanelHandle } from "react-resizable-panels"
import { createClient } from "@/lib/supabase/client"
import { useToast } from "@/hooks/use-toast"
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable"
import { TiptapEditor } from "@/components/text-editor/tiptap-editor"
import { NoteExportMenu } from "@/components/note-export-menu"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Download, BookOpen, PanelLeft, X } from "lucide-react"
import {
  ProtocolLiteraturePanel,
  type LiteraturePaperItem,
} from "./protocol-literature-panel"
import { ProtocolChangeApprovalBar } from "./protocol-change-approval"
import { ProtocolAiSidechat } from "./protocol-ai-sidechat"
import { extractProtocolTemplateShell } from "@/lib/extract-protocol-template-shell"
import { useHeaderAi } from "@/components/layout/header-ai-context"

interface ProtocolDesignModeProps {
  protocol: {
    id: string
    name: string
    content: string
    version: string
    project_id: string | null
    experiment_id: string | null
  }
  onSaved: () => void
  onExitDesignMode?: () => void
  onContextChange?: (projectId: string | null, experimentId: string | null) => void
}

export function ProtocolDesignMode({
  protocol,
  onSaved,
  onExitDesignMode,
  onContextChange,
}: ProtocolDesignModeProps) {
  const { toast } = useToast()
  const { setRegistration } = useHeaderAi()
  const [draftContent, setDraftContent] = useState(protocol.content)
  const [savedContent, setSavedContent] = useState(protocol.content)
  const [currentVersion, setCurrentVersion] = useState(protocol.version)

  const [aiContextPapers, setAiContextPapers] = useState<LiteraturePaperItem[]>([])
  const [showLiteraturePanel, setShowLiteraturePanel] = useState(true)
  const [showAiPanel, setShowAiPanel] = useState(false)

  // Resizable panel refs for collapse/expand
  const literaturePanelRef = useRef<ImperativePanelHandle>(null)

  useLayoutEffect(() => {
    const p = literaturePanelRef.current
    if (!p) return
    if (showLiteraturePanel) p.expand(16)
    else p.collapse()
  }, [showLiteraturePanel])

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

      await supabase.from("audit_log").insert({
        table_name: "protocols",
        record_id: protocol.id,
        action: "update",
        old_values: { content: savedContent, version: currentVersion },
        new_values: { content: newContent, version: newVersion },
        user_id: user.id,
      })

      onSaved()

      setSavedContent(newContent)
      setCurrentVersion(newVersion)

      toast({
        title: "Changes accepted",
        description: `Protocol saved as v${newVersion}. Change logged.`,
      })
    },
    [protocol.id, savedContent, currentVersion, toast, onSaved]
  )

  const handleReject = useCallback(() => {
    setDraftContent(savedContent)
  }, [savedContent])

  const hasPendingChanges = draftContent !== savedContent

  // When applying AI content: set draft to it (triggers approval bar diff)
  const handleAiApply = useCallback(
    (html: string) => {
      setDraftContent((prev) => prev + "\n" + html)
    },
    []
  )

  const aiPanel = useMemo(
    () => (
      <ProtocolAiSidechat
        templateShellHtml={templateShellForAi}
        protocolTitle={protocol.name}
        currentEditorContent={draftContent}
        currentVersion={currentVersion}
        aiContextPapers={aiContextPapers}
        onRemovePaper={removeAiPaper}
        onApplyToEditor={handleAiApply}
        onClose={() => setShowAiPanel(false)}
        className="h-full"
      />
    ),
    [
      templateShellForAi,
      protocol.name,
      draftContent,
      currentVersion,
      aiContextPapers,
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
    <div className="flex h-full min-h-0 overflow-hidden">

      {/* ── Toolbar ──────────────────────────────────────────────────── */}
      <div className="flex flex-col h-full min-h-0 flex-1 min-w-0">
        <div className="flex items-center gap-1.5 px-3 py-1.5 border-b shrink-0 bg-muted/20 overflow-hidden min-w-0">
          {/* Left toggles */}
          <Button
            type="button"
            variant={showLiteraturePanel ? "secondary" : "ghost"}
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={() => setShowLiteraturePanel((v) => !v)}
          >
            {showLiteraturePanel ? (
              <PanelLeft className="h-3.5 w-3.5" />
            ) : (
              <BookOpen className="h-3.5 w-3.5" />
            )}
            Literature
          </Button>

          {/* Center: protocol name */}
          <div className="flex-1 flex items-center justify-center gap-2 min-w-0 overflow-hidden">
            <span className="text-sm font-medium truncate text-foreground/80 min-w-0">
              {protocol.name}
            </span>
            <Badge variant="outline" className="text-[10px] shrink-0">
              v{currentVersion}
            </Badge>
            {hasPendingChanges && (
              <Badge
                variant="secondary"
                className="text-[10px] shrink-0 bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"
              >
                Unsaved
              </Badge>
            )}
          </div>

          {/* Right: export + exit */}
          <div className="flex items-center gap-1">
            <NoteExportMenu
              title={protocol.name}
              htmlContent={draftContent}
              trigger={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label="Export protocol"
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
              }
            />
            {onExitDesignMode && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1 text-muted-foreground"
                onClick={onExitDesignMode}
              >
                <X className="h-3.5 w-3.5" />
                Exit
              </Button>
            )}
          </div>
        </div>

        {/* ── 2-column layout ──────────────────────────────────────── */}
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="flex flex-1 min-h-0 overflow-hidden">
            <ResizablePanelGroup
              id="protocol-design-resize"
              direction="horizontal"
              className="flex-1 min-h-0"
            >
              {/* Literature panel */}
              <ResizablePanel
                ref={literaturePanelRef}
                id="protocol-literature"
                order={1}
                defaultSize={24}
                minSize={16}
                maxSize={40}
                collapsible
                collapsedSize={0}
              >
                <ProtocolLiteraturePanel
                  projectId={protocol.project_id}
                  experimentId={protocol.experiment_id}
                  variant="aiContext"
                  onAddToAiContext={(papers) => {
                    mergeAiPapers(papers)
                    setShowAiPanel(true)
                  }}
                  onRequestClose={() => setShowLiteraturePanel(false)}
                  showFilters={!protocol.project_id && !protocol.experiment_id}
                  onContextChange={onContextChange}
                />
              </ResizablePanel>
              <ResizableHandle withHandle />

              {/* Protocol editor */}
              <ResizablePanel
                id="protocol-draft"
                order={2}
                defaultSize={76}
                minSize={40}
              >
                <div className="h-full overflow-auto min-w-0">
                  <div className="p-3 h-full">
                    <TiptapEditor
                      content={draftContent}
                      onChange={setDraftContent}
                      placeholder="Draft your protocol… use Literature (left) to add papers as AI context, then open Protocol AI from the top header to draft sections."
                      title={protocol.name}
                      minHeight="100%"
                      showAITools
                    />
                  </div>
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>

          {/* Approval bar spans the full width of both columns */}
          <ProtocolChangeApprovalBar
            savedContent={savedContent}
            draftContent={draftContent}
            protocolId={protocol.id!}
            currentVersion={currentVersion}
            onAccept={handleAccept}
            onReject={handleReject}
            isVisible={hasPendingChanges}
          />
        </div>
      </div>
    </div>
  )
}
