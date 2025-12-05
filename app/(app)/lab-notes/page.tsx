"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import LabNotesList from "@/app/(app)/lab-notes-list/[id]/lab-notes-list"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Loader2 } from "lucide-react"

type LabNote = {
  id: string
  title: string
  created_at: string
  note_type?: string | null
  experiment_id?: string | null
}

export default function LabNotesPage() {
  const router = useRouter()
  const supabase = createClient()

  const [notes, setNotes] = useState<LabNote[]>([])
  const [selectedNote, setSelectedNote] = useState<LabNote | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchNotes = async () => {
      try {
        setIsLoading(true)
        const { data, error } = await supabase
          .from("lab_notes")
          .select("id, title, created_at, note_type, experiment_id")
          .order("created_at", { ascending: false })

        if (error) throw error
        setNotes(data || [])
        setSelectedNote(data?.[0] || null)
      } catch (err: any) {
        setError(err.message || "Failed to load lab notes.")
      } finally {
        setIsLoading(false)
      }
    }

    fetchNotes()
  }, [supabase])

  const handleNewNote = () => {
    // Redirect to experiments so the user can add a note within an experiment context.
    router.push("/experiments")
  }

  const handleSelectNote = (note: LabNote) => {
    setSelectedNote(note)
    if (note.experiment_id) {
      router.push(`/experiments/${note.experiment_id}?noteId=${note.id}`)
    }
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-foreground">Lab Notes</h1>
        <p className="text-muted-foreground">
          Access and manage lab notes across your experiments.
        </p>
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
          borderless
        />
      )}
    </div>
  )
}

