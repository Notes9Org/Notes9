"use client"

import { useEffect, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Separator } from "@/components/ui/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ExternalLink,
  GripVertical,
  Loader2,
  PanelLeftClose,
  SearchX,
  Sparkles,
  BookOpen,
  FolderOpen,
  FlaskConical,
  X,
} from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { ClipboardInfoIcon } from "@/components/ui/clipboard-info-icon"

/** Drag payload MIME — same string used in Protocol AI drop targets. */
export const LITERATURE_PAPER_DRAG_MIME = "application/literature-paper" as const

export interface LiteraturePaperItem {
  id: string
  title: string
  authors: string | null
  journal: string | null
  publication_year: number | null
}

interface ProjectItem { id: string; name: string }
interface ExperimentItem { id: string; name: string; project_id: string }
interface ProtocolContextItem { id: string; name: string; content: string; version: string | null }

interface ProtocolLiteraturePanelProps {
  projectId: string | null
  experimentId: string | null
  /** Insert citation chips into the TipTap editor (classic design mode). */
  onInsertPapers?: (papers: LiteraturePaperItem[]) => void
  onDragStart?: (paper: LiteraturePaperItem, e: React.DragEvent) => void
  /**
   * `citations` — drag / Insert add @-citations into the protocol draft.
   * `aiContext` — selections go to the Biomni AI panel only (no draft insertion).
   */
  variant?: "citations" | "aiContext"
  /** Add selected papers to the AI assistant context (variant `aiContext`). */
  onAddToAiContext?: (papers: LiteraturePaperItem[]) => void
  /** Hide the whole literature column (toolbar control). */
  onRequestClose?: () => void
  /** Current filtered paper list (for Protocol AI @-mentions). */
  onPapersChange?: (papers: LiteraturePaperItem[]) => void
  /**
   * When true, renders project + experiment selector dropdowns at the top.
   * Use when the parent doesn't own the project/experiment selection.
   */
  showFilters?: boolean
  /** Emitted when the internal filters change (only when showFilters=true). */
  onContextChange?: (projectId: string | null, experimentId: string | null) => void
  /** Existing protocols that can be attached as AI context. */
  protocolCandidates?: ProtocolContextItem[]
  /** Add selected protocol(s) to AI context. */
  onAddProtocols?: (protocols: ProtocolContextItem[]) => void
}

export function ProtocolLiteraturePanel({
  projectId: projectIdProp,
  experimentId: experimentIdProp,
  onInsertPapers,
  onDragStart,
  variant = "citations",
  onAddToAiContext,
  onRequestClose,
  onPapersChange,
  showFilters = false,
  onContextChange,
  protocolCandidates = [],
  onAddProtocols,
}: ProtocolLiteraturePanelProps) {
  const [papers, setPapers] = useState<LiteraturePaperItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Internal filter state (only used when showFilters=true).
  // Initialize from props so the first paint matches protocol context (avoids a race with the
  // experiments-loading effect, which previously cleared experiment id while project was still "").
  const [filterProjects, setFilterProjects] = useState<ProjectItem[]>([])
  const [filterExperiments, setFilterExperiments] = useState<ExperimentItem[]>([])
  const [internalProjectId, setInternalProjectId] = useState(() => projectIdProp ?? "")
  const [internalExperimentId, setInternalExperimentId] = useState(() => experimentIdProp ?? "")
  const [internalProtocolFilterId, setInternalProtocolFilterId] = useState<string>("")
  const [isLoadingFilterExperiments, setIsLoadingFilterExperiments] = useState(false)

  // Keep internal selector state aligned when parent context is provided.
  useEffect(() => {
    if (!showFilters) return
    setInternalProjectId(projectIdProp ?? "")
    setInternalExperimentId(experimentIdProp ?? "")
  }, [showFilters, projectIdProp, experimentIdProp])

  // Resolved IDs: prefer external props, fall back to internal filter
  const projectId = showFilters ? (internalProjectId || null) : projectIdProp
  const experimentId = showFilters ? (internalExperimentId || null) : experimentIdProp

  // Load org projects for filters
  useEffect(() => {
    if (!showFilters) return
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", user.id)
        .single()
        .then(({ data: profile }) => {
          if (!profile?.organization_id) return
          supabase
            .from("projects")
            .select("id, name")
            .eq("organization_id", profile.organization_id)
            .order("name")
            .then(({ data }) => setFilterProjects((data as ProjectItem[]) ?? []))
        })
    })
  }, [showFilters])

  // Load experiments when internal project changes.
  // Do not call setInternalExperimentId here when project is empty — that fought the prop-sync
  // effect on mount and could loop parent setState → Radix Select updates.
  useEffect(() => {
    if (!showFilters || !internalProjectId) {
      setFilterExperiments([])
      return
    }
    setIsLoadingFilterExperiments(true)
    const supabase = createClient()
    supabase
      .from("experiments")
      .select("id, name, project_id")
      .eq("project_id", internalProjectId)
      .order("name")
      .then(({ data }) => {
        setFilterExperiments((data as ExperimentItem[]) ?? [])
        setIsLoadingFilterExperiments(false)
      })
  }, [showFilters, internalProjectId])

  // Keep a ref to onContextChange so the bubble effect below never has it in
  // its dependency array — an unstable callback would otherwise cause an
  // infinite setState → re-render → new function ref → effect loop.
  const onContextChangeRef = useRef(onContextChange)
  useEffect(() => { onContextChangeRef.current = onContextChange })

  const onPapersChangeRef = useRef(onPapersChange)
  useEffect(() => { onPapersChangeRef.current = onPapersChange })

  const lastEmittedContext = useRef<{ p: string | null; e: string | null } | null>(null)

  // Bubble context changes up; skip duplicate emissions to avoid setState loops in the parent.
  useEffect(() => {
    if (!showFilters) return
    const p = internalProjectId || null
    const e = internalExperimentId || null
    const prev = lastEmittedContext.current
    if (prev?.p === p && prev?.e === e) return
    lastEmittedContext.current = { p, e }
    onContextChangeRef.current?.(p, e)
  }, [showFilters, internalProjectId, internalExperimentId])

  const aiMode = variant === "aiContext"

  useEffect(() => {
    if (!projectId && !experimentId) {
      setPapers([])
      return
    }
    setIsLoading(true)
    setSelected(new Set())

    const supabase = createClient()
    let query = supabase
      .from("literature_reviews")
      .select("id, title, authors, journal, publication_year")
      .eq("catalog_placement", "repository")
      .order("title")

    if (projectId) query = (query as any).eq("project_id", projectId)
    if (experimentId) query = (query as any).eq("experiment_id", experimentId)

    query.then(({ data }: { data: LiteraturePaperItem[] | null }) => {
      setPapers(data ?? [])
      setIsLoading(false)
    })
  }, [projectId, experimentId])

  useEffect(() => {
    onPapersChangeRef.current?.(papers)
  }, [papers])

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selected.size === papers.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(papers.map((p) => p.id)))
    }
  }

  const handlePrimaryAction = () => {
    const picked = papers.filter((p) => selected.has(p.id))
    if (picked.length === 0) return
    if (aiMode) {
      onAddToAiContext?.(picked)
    } else {
      onInsertPapers?.(picked)
    }
    setSelected(new Set())
  }

  const filterSection = showFilters && (
    <div className="space-y-1.5 border-b border-border/30 bg-transparent px-3 py-2 shrink-0 overflow-hidden">
      <div className="flex min-w-0 items-center gap-1.5">
        <FolderOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <Select
          value={internalProjectId || "_none_"}
          onValueChange={(v) => {
            setInternalProjectId(v === "_none_" ? "" : v)
            setInternalExperimentId("")
          }}
        >
          <SelectTrigger className="h-6 w-full min-w-0 flex-1 text-xs">
            <SelectValue placeholder="Select project…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_none_">— No project —</SelectItem>
            {internalProjectId &&
              !filterProjects.some((x) => x.id === internalProjectId) && (
                <SelectItem value={internalProjectId}>Linked project</SelectItem>
              )}
            {filterProjects.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex min-w-0 items-center gap-1.5">
        <FlaskConical className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <Select
          value={internalExperimentId || "_none_"}
          onValueChange={(v) => setInternalExperimentId(v === "_none_" ? "" : v)}
          disabled={!internalProjectId || isLoadingFilterExperiments}
        >
          <SelectTrigger className="h-6 w-full min-w-0 flex-1 text-xs">
            <SelectValue placeholder={
              !internalProjectId ? "Select project first" :
              isLoadingFilterExperiments ? "Loading…" : "Select experiment…"
            } />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_none_">— No experiment —</SelectItem>
            {internalExperimentId &&
              !filterExperiments.some((x) => x.id === internalExperimentId) && (
                <SelectItem value={internalExperimentId}>Linked experiment</SelectItem>
              )}
            {filterExperiments.map((e) => (
              <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {aiMode && (
        <div className="flex min-w-0 items-center gap-1.5">
          <ClipboardInfoIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <Select
            value={internalProtocolFilterId || "_none_"}
            onValueChange={(v) => {
              if (v === "_none_") {
                setInternalProtocolFilterId("")
                return
              }
              setInternalProtocolFilterId(v)
              const picked = protocolCandidates.find((p) => p.id === v)
              if (picked) onAddProtocols?.([picked])
            }}
          >
            <SelectTrigger className="h-6 w-full min-w-0 flex-1 text-xs">
              <SelectValue
                placeholder={
                  protocolCandidates.length === 0
                    ? "No protocols available"
                    : "Add existing Protocols"
                }
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none_">Add existing Protocols</SelectItem>
              {protocolCandidates.length === 0 ? (
                <SelectItem value="_empty_" disabled>No protocols available</SelectItem>
              ) : (
                protocolCandidates.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name || "Untitled protocol"}</SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  )

  if (!projectId && !experimentId) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {onRequestClose && (
          <div className="flex h-12 shrink-0 items-center justify-end border-b border-border/40 px-2 sm:hidden">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-10 w-10 touch-manipulation"
              onClick={onRequestClose}
              aria-label="Close literature panel"
            >
              <X className="h-5 w-5" aria-hidden />
            </Button>
          </div>
        )}
        {filterSection}
        <div className="flex flex-col items-center justify-center gap-3 p-6 text-center flex-1">
          <div className="rounded-full bg-muted/60 p-3">
            <BookOpen className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">No context linked</p>
            <p className="text-xs text-muted-foreground mt-1">
              {showFilters
                ? "Select a project above to see related literature."
                : "Link this protocol to a project and experiment to see related literature."}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {filterSection}
      <div className="shrink-0 overflow-hidden border-b border-border/30 bg-background">
        {/* h-11 aligns with TipTap panel toolbar (protocol design mode) */}
        <div className="flex h-11 min-h-11 items-center justify-between gap-1.5 px-3 min-w-0 sm:px-4">
          <span className="flex items-center gap-2 min-w-0">
            <BookOpen className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="sr-only">Literature</span>
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            {!isLoading && papers.length > 0 && (
              <Badge variant="secondary" className="text-[10px] shrink-0 tabular-nums">
                {papers.length}
              </Badge>
            )}
            {!isLoading && papers.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[10px] text-muted-foreground shrink-0"
                onClick={toggleAll}
              >
                {selected.size === papers.length ? "None" : "All"}
              </Button>
            )}
            {onRequestClose && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-9 shrink-0 touch-manipulation sm:size-6"
                onClick={onRequestClose}
                aria-label="Close literature panel"
                title="Close literature panel"
              >
                {/* Mobile: clear dismiss; desktop keeps narrow “hide rail” affordance */}
                <>
                  <X className="size-5 sm:hidden" aria-hidden />
                  <PanelLeftClose className="hidden size-3.5 sm:block" aria-hidden />
                </>
              </Button>
            )}
          </div>
        </div>

        {selected.size > 0 && (
          <div className="px-2 pb-1.5 pt-0">
            <Separator className="my-1" />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant={aiMode ? "secondary" : "default"}
                    size="sm"
                    className="h-6 w-full justify-start gap-1.5 text-xs"
                    onClick={handlePrimaryAction}
                  >
                    {aiMode ? (
                      <>
                        <Sparkles className="size-3.5" />
                        Add {selected.size} to AI
                      </>
                    ) : (
                      <>Insert {selected.size} citation{selected.size > 1 ? "s" : ""}</>
                    )}
                  </Button>
                </TooltipTrigger>
                {aiMode && (
                  <TooltipContent side="right" className="max-w-[220px] text-xs">
                    Sends selected papers as context to the Biomni panel — not added to the draft.
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : papers.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-10 px-4 text-center">
            <SearchX className="h-8 w-8 text-muted-foreground/50" />
            <div>
              <p className="text-sm text-muted-foreground">No literature found</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Add papers to the repository for this project and experiment.
              </p>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/literature-reviews">
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                Add literature
              </Link>
            </Button>
          </div>
        ) : (
          <ul className="flex w-full min-w-0 flex-col gap-0 p-0.5">
            {papers.map((paper) => (
              <li
                key={paper.id}
                className="group/paper relative"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(
                    LITERATURE_PAPER_DRAG_MIME,
                    JSON.stringify({
                      type: "literature",
                      id: paper.id,
                      title: paper.title,
                      authors: paper.authors,
                      journal: paper.journal,
                      publication_year: paper.publication_year,
                    })
                  )
                  e.dataTransfer.effectAllowed = "copy"
                  onDragStart?.(paper, e)
                }}
              >
                <div
                  className={cn(
                    "flex items-start gap-1.5 rounded-md px-1.5 py-0.5 transition-colors hover:bg-muted/60",
                    selected.has(paper.id) &&
                      (aiMode
                        ? "bg-secondary/40 ring-1 ring-border/80 dark:bg-secondary/25"
                        : "bg-primary/5")
                  )}
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleSelect(paper.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      toggleSelect(paper.id)
                    }
                  }}
                >
                  <GripVertical
                    className="h-3.5 w-3.5 shrink-0 cursor-grab text-muted-foreground/30 group-hover/paper:text-muted-foreground/60 active:cursor-grabbing mt-0.5"
                    aria-hidden
                  />
                  <Checkbox
                    checked={selected.has(paper.id)}
                    onCheckedChange={() => toggleSelect(paper.id)}
                    className="mt-0.5 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium leading-snug line-clamp-2 text-foreground">
                      {paper.title}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
