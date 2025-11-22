"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { LabNotesEditor } from "@/components/text-editor/tiptap-editor"
import { useAutoSave } from "@/hooks/use-auto-save"
import { useToast } from "@/hooks/use-toast"

export function LabNotesTab({ experimentId }: { experimentId: string }) {
  const router = useRouter()
  const { toast } = useToast()
  const supabase = createClient()
  
  const [noteId, setNoteId] = useState<string | undefined>()
  const [editorData, setEditorData] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Auto-save hook
  const { save } = useAutoSave({
    noteId,
    experimentId,
    debounceMs: 2000,
    onSaveSuccess: () => {
      // Silent auto-save
    },
  })

  // Load or create lab note
  useEffect(() => {
    loadOrCreateNote()
  }, [experimentId])

  const loadOrCreateNote = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Not authenticated")

      // Try to find existing note for this experiment
      const { data: existingNotes } = await supabase
        .from("lab_notes")
        .select("*")
        .eq("experiment_id", experimentId)
        .eq("created_by", user.id)
        .order("created_at", { ascending: false })
        .limit(1)

      if (existingNotes && existingNotes.length > 0) {
        // Load existing note
        const note = existingNotes[0]
        setNoteId(note.id)
        setEditorData(note.editor_data)
      } else {
        // Create new note
        const { data: newNote, error } = await supabase
          .from("lab_notes")
          .insert({
            experiment_id: experimentId,
            title: `Lab Note - ${new Date().toLocaleDateString()}`,
            content: "",
            editor_data: null,
            editor_version: '2.0.0',
            note_type: 'general',
            created_by: user.id,
          })
          .select()
          .single()

        if (error) throw error

        setNoteId(newNote.id)
        setEditorData(null)
      }
    } catch (error: any) {
      console.error("Error loading note:", error)
      toast({
        title: "Error",
        description: "Failed to load lab notes",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleEditorChange = (json: any, html: string) => {
    setEditorData(json)
    // Auto-save if note exists
    if (noteId) {
      save(json, html)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[600px] text-muted-foreground">
        Loading lab notes...
      </div>
    )
  }

  return (
    <div className="h-[calc(100vh-300px)]">
      <LabNotesEditor
        initialContent={editorData}
        onChange={handleEditorChange}
      />
    </div>
  )
}
