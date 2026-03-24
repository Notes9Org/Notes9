"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useMediaQuery } from "@/hooks/use-media-query"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import LabNotesList from "@/app/(app)/lab-notes-list/[id]/lab-notes-list"
import { NewLabNoteDialog } from "@/app/(app)/lab-notes/new-lab-note-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Loader2, Plus, Grid3x3, List } from "lucide-react"
import { SetPageBreadcrumb } from "@/components/layout/breadcrumb-context"
import {
  FILTER_ALL,
  ResourceFilterRow,
  ResourceListFilter,
} from "@/components/ui/resource-list-filters"

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
  const supabase = createClient()

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
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid")

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
          projectsRes.data.map((p) => ({ value: p.id, label: p.name }))
        )
      }
      if (experimentsRes.data) {
        setExperimentOptions(
          experimentsRes.data.map((e) => ({
            value: e.id,
            label: e.name,
            project_id: e.project_id,
          }))
        )
      }

      const normalized =
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
      setSelectedNote(normalized[0] || null)
    } catch (err: any) {
      setError(err.message || "Failed to load lab notes.")
    } finally {
      setIsLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    fetchNotes()
  }, [fetchNotes])

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

  const handleNewNote = () => {
    setNewNoteDialogOpen(true)
  }

  const handleNewNoteCreated = () => {
    fetchNotes()
  }

  const handleSelectNote = (note: LabNote) => {
    setSelectedNote(note)
    if (note.experiment_id) {
      window.dispatchEvent(new CustomEvent("notes9:navigation-start", { detail: { label: note.experiment_name || "Experiment", href: `/experiments/${note.experiment_id}`, kind: "experiments" } }))
      router.push(`/experiments/${note.experiment_id}?noteId=${note.id}`)
    }
  }

  return (
    <div className="space-y-6">
      <SetPageBreadcrumb segments={[]} />
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-muted-foreground">
          Access and manage lab notes across your experiments.
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <div className="inline-flex gap-1 rounded-lg border p-1">
            <Button
              variant={viewMode === "grid" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("grid")}
              className="gap-2"
            >
              <Grid3x3 className="h-4 w-4" />
              Grid
            </Button>
            <Button
              variant={isMobile ? "ghost" : viewMode === "table" ? "default" : "ghost"}
              size="sm"
              onClick={() => !isMobile && setViewMode("table")}
              className="gap-2"
              disabled={isMobile}
              aria-disabled={isMobile}
            >
              <List className="h-4 w-4" />
              Table
            </Button>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={handleNewNote}
            className="size-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="New lab note"
          >
            <Plus className="size-4" />
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
      />
    </div>
  )
}
