"use client"

import {
  useState,
  useEffect,
  useLayoutEffect,
  Suspense,
  useRef,
  useCallback,
  useMemo,
} from "react"
import type { ImperativePanelHandle } from "react-resizable-panels"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { resolveInitialProjectIdParam } from "@/lib/url-project-param"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TextareaWithWordCount } from "@/components/ui/textarea-with-word-count"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
  ArrowLeft,
  ArrowRight,
  Download,
  FileText,
  FolderOpen,
  FlaskConical,
  Pencil,
  X,
  ChevronDown,
  ChevronUp,
  BookOpen,
  PanelLeft,
  PanelRight,
  Sparkles,
} from "lucide-react"
import Link from "next/link"
import { TiptapEditor } from "@/components/text-editor/tiptap-editor"
import { NoteExportMenu } from "@/components/note-export-menu"
import {
  ProtocolTemplatePicker,
  type ProtocolTemplateChoice,
} from "@/components/protocols/protocol-template-picker"
import { buildProtocolDraftHtmlFromExtracted } from "@/lib/build-protocol-draft-from-template"
import {
  ProtocolLiteraturePanel,
  type LiteraturePaperItem,
} from "@/components/protocols/protocol-literature-panel"
import { ProtocolDraftBiomniPanel } from "@/components/protocols/protocol-draft-biomni-panel"
import { extractProtocolTemplateShell } from "@/lib/extract-protocol-template-shell"
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable"
import { insertProtocolWithOptionalContext } from "@/lib/protocol-context-supabase"
import { useToast } from "@/hooks/use-toast"

const PROTOCOL_CATEGORIES = [
  "Sample Preparation",
  "Analysis",
  "Safety",
  "Equipment Operation",
  "Quality Control",
  "Data Processing",
  "General SOP",
]

function templateLabel(choice: ProtocolTemplateChoice | null): string {
  if (!choice || choice.kind === "blank") return "Blank"
  if (choice.kind === "protocol") return choice.template.name
  return choice.name
}

interface Project {
  id: string
  name: string
}

interface Experiment {
  id: string
  name: string
  project_id: string
}

// ─── Step 1: Template Picker step ────────────────────────────────────────────

function TemplateStep({
  organizationId,
  onContinue,
}: {
  organizationId: string | null
  onContinue: (choice: ProtocolTemplateChoice) => void
}) {
  const [selected, setSelected] = useState<ProtocolTemplateChoice | "unset">("unset")

  const ready = selected !== "unset"

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">
            1
          </span>
          Choose a starting template
        </CardTitle>
        <CardDescription>
          Pick an uploaded document template, a protocol from your library (letterhead only), or start blank. Manage
          uploads under Protocols → Templates.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ProtocolTemplatePicker
          organizationId={organizationId}
          onSelect={(c) => setSelected(c)}
          selected={selected === "unset" ? null : selected}
        />

        <div className="flex justify-end">
          <Button
            onClick={() => ready && onContinue(selected)}
            disabled={!ready}
            className="gap-2"
          >
            Continue
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Main form (Step 2) ───────────────────────────────────────────────────────

function NewProtocolForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()

  const [step, setStep] = useState<"template" | "form">("template")
  const [selectedChoice, setSelectedChoice] = useState<ProtocolTemplateChoice | null>(null)
  const [documentTemplateId, setDocumentTemplateId] = useState<string | null>(null)
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [returnProjectId, setReturnProjectId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isDesignMode, setIsDesignMode] = useState(false)
  const [templateStepCollapsed, setTemplateStepCollapsed] = useState(false)

  const [projects, setProjects] = useState<Project[]>([])
  const [experiments, setExperiments] = useState<Experiment[]>([])
  const [isLoadingExperiments, setIsLoadingExperiments] = useState(false)

  const editorInsertRef = useRef<((html: string) => void) | null>(null)
  const [aiContextPapers, setAiContextPapers] = useState<LiteraturePaperItem[]>([])
  const [showLiteraturePanel, setShowLiteraturePanel] = useState(true)
  const [showAiPanel, setShowAiPanel] = useState(true)
  const literaturePanelRef = useRef<ImperativePanelHandle>(null)
  const aiPanelRef = useRef<ImperativePanelHandle>(null)

  useLayoutEffect(() => {
    const p = literaturePanelRef.current
    if (!p) return
    if (showLiteraturePanel) p.expand(16)
    else p.collapse()
  }, [showLiteraturePanel])

  useLayoutEffect(() => {
    const p = aiPanelRef.current
    if (!p) return
    if (showAiPanel) p.expand(22)
    else p.collapse()
  }, [showAiPanel])

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

  const applyAiHtmlToEditor = useCallback((html: string) => {
    editorInsertRef.current?.(html)
  }, [])

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    version: "1.0",
    content: "",
    category: "",
    is_active: true,
    project_id: "",
    experiment_id: "",
  })

  const templateShellForAi = useMemo(
    () => extractProtocolTemplateShell(formData.content),
    [formData.content]
  )

  // Fetch org + projects on mount
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

      setOrganizationId(profile.organization_id)

      const { data: projectRows } = await supabase
        .from("projects")
        .select("id, name")
        .eq("organization_id", profile.organization_id)
        .order("name")

      if (cancelled) return
      const projectList = (projectRows ?? []) as Project[]
      setProjects(projectList)

      const allowed = projectList.map((p) => p.id)
      const id = resolveInitialProjectIdParam(
        searchParams.get("project") ?? undefined,
        allowed
      )
      setReturnProjectId(id)
      if (id) setFormData((prev) => ({ ...prev, project_id: id }))
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [searchParams])

  // Fetch experiments when project changes
  useEffect(() => {
    if (!formData.project_id) {
      setExperiments([])
      setFormData((prev) => ({ ...prev, experiment_id: "" }))
      return
    }
    setIsLoadingExperiments(true)
    const supabase = createClient()
    supabase
      .from("experiments")
      .select("id, name, project_id")
      .eq("project_id", formData.project_id)
      .order("name")
      .then(({ data }) => {
        setExperiments((data as Experiment[]) ?? [])
        setIsLoadingExperiments(false)
      })
  }, [formData.project_id])

  const protocolsListHref = returnProjectId
    ? `/protocols?project=${returnProjectId}`
    : "/protocols"

  const isFormValid =
    formData.name.trim() &&
    formData.content.trim() &&
    formData.project_id &&
    formData.experiment_id

  const applyTemplate = useCallback((choice: ProtocolTemplateChoice) => {
    setSelectedChoice(choice)
    if (choice.kind === "blank") {
      setDocumentTemplateId(null)
      setFormData((prev) => ({
        ...prev,
        content: "",
        category: "",
        version: "1.0",
        description: "",
      }))
    } else if (choice.kind === "protocol") {
      setDocumentTemplateId(null)
      const t = choice.template
      const shell = extractProtocolTemplateShell(t.content)
      setFormData((prev) => ({
        ...prev,
        content: shell,
        category: t.category ?? prev.category,
        version: "1.0",
        description: t.description ?? prev.description,
      }))
    } else {
      setDocumentTemplateId(choice.id)
      const html = buildProtocolDraftHtmlFromExtracted({
        templateId: choice.id,
        extracted: choice.extracted,
      })
      setFormData((prev) => ({
        ...prev,
        content: html,
        version: "1.0",
      }))
    }
    setStep("form")
    setTemplateStepCollapsed(true)
  }, [])

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!isFormValid) return
    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error("Not authenticated")

      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", user.id)
        .single()

      const { error: insertError, contextSaved } = await insertProtocolWithOptionalContext(
        supabase,
        {
          organization_id: profile?.organization_id,
          name: formData.name,
          description: formData.description || null,
          version: formData.version,
          content: formData.content,
          category: formData.category || null,
          is_active: formData.is_active,
          created_by: user.id,
          project_id: formData.project_id,
          experiment_id: formData.experiment_id,
          document_template_id: documentTemplateId,
        }
      )

      if (insertError) throw insertError

      if (!contextSaved) {
        toast({
          title: "Protocol created",
          description:
            "Saved without project/experiment links — run database migration 030 (project_id / experiment_id on protocols) in Supabase, then edit the protocol to add context.",
        })
      }

      router.push(protocolsListHref)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  // ─── Step 1: Template picker (before form) ─────────────────────────────────
  if (step === "template") {
    return (
      <div className="space-y-4 md:space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild className="shrink-0">
            <Link href={protocolsListHref}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Create New Protocol</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Step 1 of 2 — choose a template
            </p>
          </div>
        </div>
        <TemplateStep organizationId={organizationId} onContinue={applyTemplate} />
      </div>
    )
  }

  // ─── Step 2: Form + optional design mode ───────────────────────────────────
  const contextHeaderContent = (
    <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="min-w-0 space-y-2">
        <Label htmlFor="project_id">
          Project <span className="text-destructive">*</span>
        </Label>
        <Select
          value={formData.project_id}
          onValueChange={(value) =>
            setFormData((prev) => ({ ...prev, project_id: value, experiment_id: "" }))
          }
        >
          <SelectTrigger id="project_id">
            <SelectValue placeholder="Select a project" />
          </SelectTrigger>
          <SelectContent>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="min-w-0 space-y-2">
        <Label htmlFor="experiment_id">
          Experiment <span className="text-destructive">*</span>
        </Label>
        <Select
          value={formData.experiment_id}
          onValueChange={(value) =>
            setFormData((prev) => ({ ...prev, experiment_id: value }))
          }
          disabled={!formData.project_id || isLoadingExperiments}
        >
          <SelectTrigger id="experiment_id">
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
            {experiments.length === 0 && !isLoadingExperiments ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                No experiments in this project
              </div>
            ) : (
              experiments.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  <span className="flex min-w-0 max-w-full items-center gap-1.5">
                    <FlaskConical className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 truncate">{e.name}</span>
                  </span>
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>
    </div>
  )

  // ─── Design Mode layout ────────────────────────────────────────────────────
  if (isDesignMode) {
    const selectedProject = projects.find((p) => p.id === formData.project_id)
    const selectedExperiment = experiments.find((e) => e.id === formData.experiment_id)

    return (
      <div className="flex flex-col h-[calc(100vh-120px)] min-h-[600px] gap-3">
        {/* Page header */}
        <div className="flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="ghost" size="icon" asChild className="shrink-0">
              <Link href={protocolsListHref}>
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div className="min-w-0">
              <h1 className="text-lg font-bold tracking-tight truncate">
                {formData.name || "New Protocol"}
              </h1>
              <p className="text-xs text-muted-foreground">Design Mode — Step 2 of 2</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs text-muted-foreground"
              onClick={() => setIsDesignMode(false)}
            >
              <X className="h-3.5 w-3.5" />
              Exit design mode
            </Button>
            <Button
              size="sm"
              className="h-7 gap-2"
              onClick={() => handleSubmit()}
              disabled={isLoading || !isFormValid}
            >
              {isLoading ? "Creating…" : "Create Protocol"}
            </Button>
          </div>
        </div>

        {/* Template indicator + context chips */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {selectedChoice && selectedChoice.kind !== "blank" && (
            <span className="inline-flex items-center gap-1.5 text-xs bg-primary/10 text-primary rounded-md px-2 py-1">
              <FileText className="h-3 w-3" />
              Template: {templateLabel(selectedChoice)}
            </span>
          )}
          {selectedProject && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/60 rounded-md px-2 py-1">
              <FolderOpen className="h-3 w-3" />
              {selectedProject.name}
            </span>
          )}
          {selectedExperiment && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/60 rounded-md px-2 py-1">
              <FlaskConical className="h-3 w-3" />
              {selectedExperiment.name}
            </span>
          )}
          {!formData.project_id || !formData.experiment_id ? (
            <span className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 rounded-md px-2 py-1">
              Select project + experiment above to see linked literature
            </span>
          ) : null}
        </div>

        {/* Inline context row if not set */}
        {(!formData.project_id || !formData.experiment_id) && (
          <Card className="shrink-0">
            <CardContent className="py-3 px-4">
              {contextHeaderContent}
            </CardContent>
          </Card>
        )}

        {/* Name + meta row */}
        <Card className="shrink-0">
          <CardContent className="py-3 px-4">
            <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(100px,0.6fr)_minmax(160px,0.9fr)]">
              <div className="space-y-1.5">
                <Label htmlFor="dm-name" className="text-xs">
                  Protocol Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="dm-name"
                  placeholder="e.g., Standard Crystallization Protocol"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dm-version" className="text-xs">Version</Label>
                <Input
                  id="dm-version"
                  value={formData.version}
                  onChange={(e) => setFormData((prev) => ({ ...prev, version: e.target.value }))}
                  className="h-8 text-sm font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dm-category" className="text-xs">Category</Label>
                <Select
                  value={formData.category}
                  onValueChange={(v) => setFormData((prev) => ({ ...prev, category: v }))}
                >
                  <SelectTrigger id="dm-category" className="h-8 text-sm">
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {PROTOCOL_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c} className="text-sm">
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Error banner */}
        {error && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive shrink-0">
            {error}
          </div>
        )}

        {/* Literature + draft + Biomni AI */}
        <div className="flex-1 overflow-hidden rounded-lg border bg-background min-h-0 flex flex-col">
          <div className="flex items-center gap-1.5 px-2 py-1.5 border-b shrink-0 bg-muted/20 flex-wrap">
            <Button
              type="button"
              variant={showLiteraturePanel ? "secondary" : "outline"}
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={() => setShowLiteraturePanel((v) => !v)}
            >
              {showLiteraturePanel ? (
                <BookOpen className="h-3.5 w-3.5" />
              ) : (
                <PanelLeft className="h-3.5 w-3.5" />
              )}
              Literature
            </Button>
            <Button
              type="button"
              variant={showAiPanel ? "secondary" : "outline"}
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={() => setShowAiPanel((v) => !v)}
            >
              {showAiPanel ? (
                <Sparkles className="h-3.5 w-3.5" />
              ) : (
                <PanelRight className="h-3.5 w-3.5" />
              )}
              AI draft
            </Button>
          </div>
          <ResizablePanelGroup
            id="new-protocol-design-resize"
            direction="horizontal"
            className="flex-1 min-h-0"
          >
            <ResizablePanel
              ref={literaturePanelRef}
              id="new-protocol-literature"
              order={1}
              defaultSize={24}
              minSize={16}
              maxSize={40}
              collapsible
              collapsedSize={0}
            >
              <ProtocolLiteraturePanel
                projectId={formData.project_id || null}
                experimentId={formData.experiment_id || null}
                variant="aiContext"
                onAddToAiContext={mergeAiPapers}
                onRequestClose={() => setShowLiteraturePanel(false)}
              />
            </ResizablePanel>
            <ResizableHandle withHandle />

            <ResizablePanel id="new-protocol-draft" order={2} defaultSize={48} minSize={35}>
              <div className="flex flex-col h-full overflow-hidden min-w-0">
                <div className="px-4 py-2 border-b flex items-center justify-between gap-2 shrink-0">
                  <span className="text-sm font-semibold text-foreground">Protocol draft</span>
                  <div className="flex items-center gap-1.5">
                    {selectedChoice && selectedChoice.kind !== "blank" && (
                      <Badge variant="secondary" className="text-xs">
                        From: {templateLabel(selectedChoice)}
                      </Badge>
                    )}
                    <NoteExportMenu
                      title={formData.name || "new-protocol"}
                      htmlContent={formData.content}
                      trigger={
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7">
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                      }
                    />
                  </div>
                </div>
                <div className="flex-1 overflow-auto min-h-0">
                  <div className="p-3 min-h-full">
                    <TiptapEditor
                      content={formData.content}
                      onChange={(content) => setFormData((prev) => ({ ...prev, content }))}
                      placeholder="Draft your protocol… Link literature on the left for Biomni; apply AI output from the right."
                      title={formData.name || "new-protocol"}
                      minHeight="460px"
                      showAITools
                      showAiWritingDropdown={false}
                      onEditorReady={(editor) => {
                        if (editor) {
                          editorInsertRef.current = (html: string) => {
                            editor.chain().focus().insertContent(html + " ").run()
                          }
                        }
                      }}
                    />
                  </div>
                </div>
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle />
            <ResizablePanel
              ref={aiPanelRef}
              id="new-protocol-ai-draft"
              order={3}
              defaultSize={28}
              minSize={22}
              maxSize={42}
              collapsible
              collapsedSize={0}
            >
              <ProtocolDraftBiomniPanel
                templateShellHtml={templateShellForAi}
                protocolTitle={formData.name || "New protocol"}
                aiContextPapers={aiContextPapers}
                onRemovePaper={removeAiPaper}
                onApplyToEditor={applyAiHtmlToEditor}
                onRequestClose={() => setShowAiPanel(false)}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </div>
    )
  }

  // ─── Standard form layout ──────────────────────────────────────────────────
  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild className="shrink-0">
          <Link href={protocolsListHref}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Create New Protocol</h1>
          <p className="text-muted-foreground mt-1 text-sm">Step 2 of 2 — fill in details</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 shrink-0"
          onClick={() => setIsDesignMode(true)}
        >
          <Pencil className="h-3.5 w-3.5" />
          Design Mode
        </Button>
      </div>

      {/* Template indicator (collapsible) */}
      <Card className="overflow-hidden">
        {/* Left toggle is a div[role=button] — never a <button> — so "Change" (Button) is never nested in a native button */}
        <div className="flex w-full items-center justify-between gap-2 px-4 py-3 transition-colors hover:bg-muted/30">
          <div
            role="button"
            tabIndex={0}
            aria-expanded={!templateStepCollapsed}
            onClick={() => setTemplateStepCollapsed((v) => !v)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                setTemplateStepCollapsed((v) => !v)
              }
            }}
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
              1
            </span>
            <span className="text-sm font-medium">Template</span>
            {selectedChoice && selectedChoice.kind !== "blank" ? (
              <Badge variant="secondary" className="gap-1 text-xs">
                <FileText className="h-3 w-3" />
                {templateLabel(selectedChoice)}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs">Blank</Badge>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-muted-foreground"
              onClick={() => {
                setStep("template")
                setTemplateStepCollapsed(false)
              }}
            >
              Change
            </Button>
            <button
              type="button"
              aria-expanded={!templateStepCollapsed}
              aria-label={templateStepCollapsed ? "Expand template section" : "Collapse template section"}
              className="rounded p-1.5 text-muted-foreground hover:bg-muted/60"
              onClick={() => setTemplateStepCollapsed((v) => !v)}
            >
              {templateStepCollapsed ? (
                <ChevronDown className="h-4 w-4" aria-hidden />
              ) : (
                <ChevronUp className="h-4 w-4" aria-hidden />
              )}
            </button>
          </div>
        </div>
        {!templateStepCollapsed && (
          <div className="border-t px-4 pb-4 pt-3">
            <ProtocolTemplatePicker
              organizationId={organizationId}
              onSelect={(c) => {
                applyTemplate(c)
                setTemplateStepCollapsed(true)
              }}
              selected={selectedChoice}
            />
          </div>
        )}
      </Card>

      {/* Main form card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">
                2
              </span>
              <CardTitle className="text-base">Protocol Details</CardTitle>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">

            {/* Project + Experiment (required) */}
            <div className="space-y-3 rounded-lg border border-dashed p-4">
              <div className="mb-1">
                <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                  <FolderOpen className="h-4 w-4 text-muted-foreground" />
                  Context <span className="text-destructive">*</span>
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Both project and experiment are required to link literature to this protocol.
                </p>
              </div>
              {contextHeaderContent}
            </div>

            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">
                Protocol Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                placeholder="e.g., Standard Crystallization Protocol"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            {/* Version & Category */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="version">Version</Label>
                <Input
                  id="version"
                  placeholder="1.0"
                  value={formData.version}
                  onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select
                  value={formData.category}
                  onValueChange={(value) => setFormData({ ...formData, category: value })}
                >
                  <SelectTrigger id="category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {PROTOCOL_CATEGORIES.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Brief Description</Label>
              <TextareaWithWordCount
                id="description"
                placeholder="Brief overview of the protocol…"
                rows={2}
                value={formData.description}
                onChange={(v) => setFormData({ ...formData, description: v })}
                maxWords={1000}
              />
            </div>

            {/* Content */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="content">
                  Protocol Content <span className="text-destructive">*</span>
                </Label>
                <NoteExportMenu
                  title={formData.name || "protocol"}
                  htmlContent={formData.content || ""}
                  trigger={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      aria-label="Export"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  }
                />
              </div>
              <TiptapEditor
                content={formData.content}
                onChange={(content) => setFormData({ ...formData, content })}
                placeholder="Write the detailed protocol steps here…"
                title={formData.name || "protocol"}
                minHeight="400px"
                showAITools={true}
                showAiWritingDropdown={false}
              />
            </div>

            {/* Active Status */}
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="is_active" className="cursor-pointer">
                  Active Protocol
                </Label>
                <p className="text-sm text-muted-foreground">
                  Make this protocol available for use in experiments
                </p>
              </div>
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, is_active: checked })
                }
              />
            </div>

            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push(protocolsListHref)}
                data-navigate
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isLoading || !isFormValid}
                className="w-full sm:w-auto"
              >
                {isLoading ? "Creating…" : "Create Protocol"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

export default function NewProtocolPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6 py-8">
          <div className="h-10 w-64 bg-muted animate-pulse rounded" />
          <div className="h-96 w-full bg-muted animate-pulse rounded" />
        </div>
      }
    >
      <NewProtocolForm />
    </Suspense>
  )
}
