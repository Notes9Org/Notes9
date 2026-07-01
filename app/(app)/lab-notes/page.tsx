"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useMediaQuery } from "@/hooks/use-media-query"
import { useRouter, useSearchParams } from "next/navigation"
import { resolveInitialProjectIdParam } from "@/lib/url-project-param"
import { createClient } from "@/lib/supabase/client"
import LabNotesList from "@/app/(app)/lab-notes-list/[id]/lab-notes-list"
import { NewLabNoteDialog } from "@/app/(app)/lab-notes/new-lab-note-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Loader2, Plus, Grid3x3, List, NotebookPen } from "lucide-react"
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty"
import { useBreadcrumb } from "@/components/layout/breadcrumb-context"
import { CatalystSectionHero } from "@/components/catalyst/catalyst-section-hero"
import {
  FILTER_ALL,
  ResourceFilterRow,
  ResourceListFilter,
} from "@/components/ui/resource-list-filters"
import { ViewModeToggle } from "@/components/ui/view-mode-toggle"

type LabNote = {
  id: string
  title: string
  created_at: string
  note_type?: string | null
  experiment_id?: string | null
  /** Resolved project for filtering (direct project_id or experiment’s project). */
  resolved_project_id?: string | null
  project_name?: string | null
  experiment_name?: string | null
}

export default function LabNotesPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const { setSegments } = useBreadcrumb()

  const [notes, setNotes] = useState<LabNote[]>([])
  const [selectedNote, setSelectedNote] = useState<LabNote | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newNoteDialogOpen, setNewNoteDialogOpen] = useState(false)
  const [projectFilter, setProjectFilter] = useState(FILTER_ALL)
  const [experimentFilter, setExperimentFilter] = useState(FILTER_ALL)
  const [projectOptions, setProjectOptions] = useState<{ value: string; label: string }[]>([])
  const [experimentOptions, setExperimentOptions] = useState<
    { value: string; label: string; project_id: string }[]
  >([])
  const isMobile = useMediaQuery("(max-width: 768px)")
  const [viewMode, setViewMode] = useState<"grid" | "table">("table")

  useEffect(() => {
    if (isMobile) setViewMode("grid")
  }, [isMobile])

  const fetchNotes = useCallback(async () => {
    try {
      setIsLoading(true)
      const [notesRes, projectsRes, experimentsRes] = await Promise.all([
        supabase
          .from("lab_notes")
          .select(`
            id,
            title,
            created_at,
            note_type,
            experiment_id,
            project_id,
            experiment:experiments (
              id,
              name,
              project_id,
              project:projects ( id, name )
            ),
            project:projects ( id, name )
          `)
          .order("created_at", { ascending: false }),
        supabase.from("projects").select("id, name").order("name"),
        supabase.from("experiments").select("id, name, project_id").order("name"),
      ])

      if (notesRes.error) throw notesRes.error
      if (projectsRes.data) {
        setProjectOptions(
          projectsRes.data.map((p: { id: string; name: string }) => ({ value: p.id, label: p.name }))
        )
      }
      if (experimentsRes.data) {
        setExperimentOptions(
          experimentsRes.data.map((e: { id: string; name: string; project_id: string }) => ({
            value: e.id,
            label: e.name,
            project_id: e.project_id,
          }))
        )
      }

      const normalized =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase
        // generated types model the nested project/experiment joins as arrays,
        // which conflicts with the object-shaped runtime payload; `any` keeps the
        // defensive optional-chained access below honest without fighting the
        // generated row type.
        notesRes.data?.map((note: any) => {
          const resolved_project_id =
            note.project_id ??
            note.experiment?.project_id ??
            note.experiment?.project?.id ??
            null
          const project_name =
            note.project?.name ?? note.experiment?.project?.name ?? null
          return {
            id: note.id,
            title: note.title,
            created_at: note.created_at,
            note_type: note.note_type,
            experiment_id: note.experiment_id,
            resolved_project_id,
            project_name,
            experiment_name: note.experiment?.name ?? null,
          }
        }) || []

      setNotes(normalized)
      const noteIdParam = searchParams.get("noteId")
      const preferred = noteIdParam
        ? normalized.find((n: { id: string }) => n.id === noteIdParam)
        : undefined
      setSelectedNote(preferred ?? normalized[0] ?? null)
    } catch (err: any) {
      setError(err.message || "Failed to load lab notes.")
    } finally {
      setIsLoading(false)
    }
  }, [supabase, searchParams])

  useEffect(() => {
    fetchNotes()
  }, [fetchNotes])

  // Keep the project filter in sync with the URL `?project=` param. Previously
  // this used a one-shot ref guard that prevented re-sync on back-navigation,
  // so users who went `/projects/A → /lab-notes?project=A → /lab-notes/X → ←`
  // landed on the global list. Now we re-apply whenever the URL changes; we
  // only fall back to "all" if the URL has no project param (explicit reset).
  useEffect(() => {
    const raw = searchParams.get("project")
    const resolved = resolveInitialProjectIdParam(
      raw ?? undefined,
      projectOptions.map((o) => o.value)
    )
    setProjectFilter(resolved ?? FILTER_ALL)
  }, [searchParams, projectOptions])

  useEffect(() => {
    if (projectFilter === FILTER_ALL) return
    setExperimentFilter((current) => {
      if (current === FILTER_ALL) return current
      const exp = experimentOptions.find((e) => e.value === current)
      if (!exp || exp.project_id !== projectFilter) return FILTER_ALL
      return current
    })
  }, [projectFilter, experimentOptions])

  const experimentFilterOptions = useMemo(() => {
    if (projectFilter === FILTER_ALL) {
      return experimentOptions.map(({ value, label }) => ({ value, label }))
    }
    return experimentOptions
      .filter((e) => e.project_id === projectFilter)
      .map(({ value, label }) => ({ value, label }))
  }, [experimentOptions, projectFilter])

  const filteredNotes = useMemo(() => {
    return notes.filter((n) => {
      if (projectFilter !== FILTER_ALL && n.resolved_project_id !== projectFilter) {
        return false
      }
      if (experimentFilter !== FILTER_ALL && n.experiment_id !== experimentFilter) {
        return false
      }
      return true
    })
  }, [notes, projectFilter, experimentFilter])

  useEffect(() => {
    setSelectedNote((prev) => {
      if (filteredNotes.length === 0) return null
      if (prev && filteredNotes.some((n) => n.id === prev.id)) return prev
      return filteredNotes[0]
    })
  }, [filteredNotes])

  const scopedProjectLabel = useMemo(() => {
    if (projectFilter === FILTER_ALL) return null
    return projectOptions.find((o) => o.value === projectFilter)?.label ?? null
  }, [projectFilter, projectOptions])

  useEffect(() => {
    if (!scopedProjectLabel || projectFilter === FILTER_ALL) {
      setSegments([])
      return
    }
    setSegments([
      { label: scopedProjectLabel, href: `/projects/${projectFilter}` },
      { label: "Lab notes" },
    ])
    return () => setSegments([])
  }, [scopedProjectLabel, projectFilter, setSegments])

  const handleNewNote = () => {
    setNewNoteDialogOpen(true)
  }

  const handleNewNoteCreated = () => {
    fetchNotes()
  }

  const handleSelectNote = (note: LabNote) => {
    setSelectedNote(note)
    if (note.experiment_id) {
      const projectQs =
        note.resolved_project_id != null && note.resolved_project_id !== ""
          ? `&project=${note.resolved_project_id}`
          : ""
      const expHref = `/experiments/${note.experiment_id}?noteId=${note.id}${projectQs}`
      window.dispatchEvent(
        new CustomEvent("notes9:navigation-start", {
          detail: {
            label: note.experiment_name || "Experiment",
            href: expHref,
            kind: "experiments",
          },
        })
      )
      router.push(expHref)
    }
  }

  return (
    <div className="space-y-6">
      <CatalystSectionHero size="sm" scope="lab-notes" shrinkOnScroll />
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-muted-foreground">
          Access and manage lab notes across your experiments.
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <ViewModeToggle value={viewMode} onChange={setViewMode} tableDisabled={isMobile} />
          <Button
            size="sm"
            onClick={handleNewNote}
            data-tour="create-lab-note"
            className="gap-2"
            aria-label="New lab note — choose project and experiment"
            title="New lab note — choose project and experiment"
          >
            <Plus className="size-4" />
            New lab note
          </Button>
        </div>
      </div>

      <ResourceFilterRow>
        <ResourceListFilter
          label="Project"
          value={projectFilter}
          onValueChange={setProjectFilter}
          options={projectOptions}
          allLabel="All projects"
        />
        <ResourceListFilter
          label="Experiment"
          value={experimentFilter}
          onValueChange={setExperimentFilter}
          options={experimentFilterOptions}
          allLabel="All experiments"
        />
      </ResourceFilterRow>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading lab notes...</span>
        </div>
      ) : notes.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <NotebookPen aria-hidden />
            </EmptyMedia>
            <EmptyTitle>No lab notes yet</EmptyTitle>
            <EmptyDescription>
              Lab notes capture what happened in an experiment — observations, deviations from the
              protocol, snapshots of results. Each note lives under an experiment in a project.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={handleNewNote}>
              <NotebookPen className="h-4 w-4 mr-2" />
              New lab note
            </Button>
          </EmptyContent>
        </Empty>
      ) : filteredNotes.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center text-sm text-muted-foreground">
          <p>No lab notes match the selected filters.</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setProjectFilter(FILTER_ALL)
              setExperimentFilter(FILTER_ALL)
            }}
          >
            Clear filters
          </Button>
        </div>
      ) : (
        <LabNotesList
          notes={filteredNotes}
          selectedNote={selectedNote}
          isCreating={false}
          handleNewNote={handleNewNote}
          handleSelectNote={handleSelectNote}
          viewMode={viewMode}
          setViewMode={setViewMode}
          hideToolbar
        />
      )}

      <NewLabNoteDialog
        open={newNoteDialogOpen}
        onOpenChange={setNewNoteDialogOpen}
        onCreated={handleNewNoteCreated}
        defaultProjectId={projectFilter !== FILTER_ALL ? projectFilter : null}
      />
    </div>
  )
}
