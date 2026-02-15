"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import LabNotesList from "@/app/(app)/lab-notes-list/[id]/lab-notes-list"
import { NewLabNoteDialog } from "@/app/(app)/lab-notes/new-lab-note-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Loader2, Plus, Grid3x3, List } from "lucide-react"
import { SetPageBreadcrumb } from "@/components/layout/breadcrumb-context"

type LabNote = {
  id: string
  title: string
  created_at: string
  note_type?: string | null
  experiment_id?: string | null
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
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid")

  const fetchNotes = useCallback(async () => {
    try {
      setIsLoading(true)
      const { data, error } = await supabase
        .from("lab_notes")
        .select(`
          id,
          title,
          created_at,
          note_type,
          experiment_id,
          experiment:experiments (
            name,
            project:projects ( name )
          )
        `)
        .order("created_at", { ascending: false })

      if (error) throw error
      const normalized =
        data?.map((note: any) => ({
          id: note.id,
          title: note.title,
          created_at: note.created_at,
          note_type: note.note_type,
          experiment_id: note.experiment_id,
          project_name: note.experiment?.project?.name ?? null,
          experiment_name: note.experiment?.name ?? null,
        })) || []

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

  const handleNewNote = () => {
    setNewNoteDialogOpen(true)
  }

  const handleNewNoteCreated = () => {
    fetchNotes()
  }

  const handleSelectNote = (note: LabNote) => {
    setSelectedNote(note)
    if (note.experiment_id) {
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
          <div className="inline-flex rounded-lg border p-1">
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setViewMode("grid")}
              className="gap-2"
            >
              <Grid3x3 className="h-4 w-4" />
              Grid
            </Button>
            <Button
              variant={viewMode === "table" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setViewMode("table")}
              className="gap-2"
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
          notes={notes}
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

