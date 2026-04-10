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
} from "lucide-react"
import Link from "next/link"

export interface LiteraturePaperItem {
  id: string
  title: string
  authors: string | null
  journal: string | null
  publication_year: number | null
}

interface ProjectItem { id: string; name: string }
interface ExperimentItem { id: string; name: string; project_id: string }

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
  /**
   * When true, renders project + experiment selector dropdowns at the top.
   * Use when the parent doesn't own the project/experiment selection.
   */
  showFilters?: boolean
  /** Emitted when the internal filters change (only when showFilters=true). */
  onContextChange?: (projectId: string | null, experimentId: string | null) => void
}

export function ProtocolLiteraturePanel({
  projectId: projectIdProp,
  experimentId: experimentIdProp,
  onInsertPapers,
  onDragStart,
  variant = "citations",
  onAddToAiContext,
  onRequestClose,
  showFilters = false,
  onContextChange,
}: ProtocolLiteraturePanelProps) {
  const [papers, setPapers] = useState<LiteraturePaperItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Internal filter state (only used when showFilters=true)
  const [filterProjects, setFilterProjects] = useState<ProjectItem[]>([])
  const [filterExperiments, setFilterExperiments] = useState<ExperimentItem[]>([])
  const [internalProjectId, setInternalProjectId] = useState<string>("")
  const [internalExperimentId, setInternalExperimentId] = useState<string>("")
  const [isLoadingFilterExperiments, setIsLoadingFilterExperiments] = useState(false)

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

  // Load experiments when internal project changes
  useEffect(() => {
    if (!showFilters || !internalProjectId) {
      setFilterExperiments([])
      setInternalExperimentId("")
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

  // Bubble context changes up (only depends on the *values* that changed)
  useEffect(() => {
    if (!showFilters) return
    onContextChangeRef.current?.(internalProjectId || null, internalExperimentId || null)
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

  const formatFirstAuthor = (authors: string | null) => {
    if (!authors) return null
    const first = authors.split(",")[0].trim()
    const hasMore = authors.includes(",")
    return hasMore ? `${first} et al.` : first
  }

  const filterSection = showFilters && (
    <div className="px-3 py-2.5 border-b shrink-0 space-y-2 bg-muted/20 overflow-hidden">
      <div className="flex items-center gap-1.5">
        <FolderOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <Select
          value={internalProjectId || "_none_"}
          onValueChange={(v) => {
            setInternalProjectId(v === "_none_" ? "" : v)
            setInternalExperimentId("")
          }}
        >
          <SelectTrigger className="h-7 text-xs flex-1">
            <SelectValue placeholder="Select project…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_none_">— No project —</SelectItem>
            {filterProjects.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-1.5">
        <FlaskConical className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <Select
          value={internalExperimentId || "_none_"}
          onValueChange={(v) => setInternalExperimentId(v === "_none_" ? "" : v)}
          disabled={!internalProjectId || isLoadingFilterExperiments}
        >
          <SelectTrigger className="h-7 text-xs flex-1">
            <SelectValue placeholder={
              !internalProjectId ? "Select project first" :
              isLoadingFilterExperiments ? "Loading…" : "Select experiment…"
            } />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_none_">— No experiment —</SelectItem>
            {filterExperiments.map((e) => (
              <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )

  if (!projectId && !experimentId) {
    return (
      <div className="h-full flex flex-col overflow-hidden">
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
    <div className="h-full flex flex-col overflow-hidden">
      {filterSection}
      <div className="px-3 py-2 border-b shrink-0 overflow-hidden">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs font-semibold truncate min-w-0 flex-1">Linked literature</span>
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
              className="h-6 w-6 shrink-0"
              onClick={onRequestClose}
              aria-label="Hide literature panel"
            >
              <PanelLeftClose className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        {selected.size > 0 && (
          <>
            <Separator className="my-1.5" />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    className="w-full h-7 text-xs gap-1.5"
                    onClick={handlePrimaryAction}
                  >
                    {aiMode ? (
                      <>
                        <Sparkles className="h-3.5 w-3.5" />
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
          </>
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
          <ul className="flex w-full min-w-0 flex-col gap-0.5 p-1.5">
            {papers.map((paper) => (
              <li
                key={paper.id}
                className="group/paper relative"
                draggable={!aiMode}
                onDragStart={
                  aiMode
                    ? undefined
                    : (e) => {
                        e.dataTransfer.setData(
                          "application/literature-paper",
                          JSON.stringify({
                            type: "literature",
                            id: paper.id,
                            title: paper.title,
                            authors: paper.authors,
                            journal: paper.journal,
                            publication_year: paper.publication_year,
                          })
                        )
                        onDragStart?.(paper, e)
                      }
                }
              >
                <div
                  className={`flex items-start gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/70 ${selected.has(paper.id) ? "bg-primary/5" : ""}`}
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
                  {!aiMode && (
                    <GripVertical className="h-3.5 w-3.5 text-muted-foreground/30 shrink-0 mt-0.5 cursor-grab active:cursor-grabbing group-hover/paper:text-muted-foreground/60" />
                  )}
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
                    {(paper.authors || paper.publication_year) && (
                      <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                        {formatFirstAuthor(paper.authors)}
                        {paper.publication_year ? ` · ${paper.publication_year}` : ""}
                      </p>
                    )}
                    {paper.journal && (
                      <p className="text-[10px] text-muted-foreground/70 mt-0.5 truncate italic">
                        {paper.journal}
                      </p>
                    )}
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
