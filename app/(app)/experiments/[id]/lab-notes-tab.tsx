"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AffineBlock } from "@/components/text-editor/affine-block"
import { useToast } from "@/hooks/use-toast"
import { Save, Plus, FileText } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"

interface LabNote {
  id: string
  title: string
  content: string
  note_type: string | null
  created_at: string
  updated_at: string
}

export function LabNotesTab({ experimentId }: { experimentId: string }) {
  const router = useRouter()
  const { toast } = useToast()
  
  const [notes, setNotes] = useState<LabNote[]>([])
  const [selectedNote, setSelectedNote] = useState<LabNote | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  
  const [formData, setFormData] = useState({
    title: "",
    content: "",
    note_type: "general",
  })

  // Fetch existing lab notes
  useEffect(() => {
    fetchNotes()
  }, [experimentId])

  const fetchNotes = async () => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("lab_notes")
        .select("*")
        .eq("experiment_id", experimentId)
        .order("created_at", { ascending: false })

      if (error) throw error
      setNotes(data || [])
      
      // Auto-select first note if available
      if (data && data.length > 0 && !selectedNote && !isCreating) {
        setSelectedNote(data[0])
        setFormData({
          title: data[0].title,
          content: data[0].content,
          note_type: data[0].note_type || "general",
        })
      }
    } catch (error: any) {
      console.error("Error fetching notes:", error)
    }
  }

  const handleSave = async () => {
    if (!formData.title.trim()) {
      toast({
        title: "Title required",
        description: "Please enter a title for your lab note.",
        variant: "destructive",
      })
      return
    }

    setIsSaving(true)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) throw new Error("Not authenticated")

      if (selectedNote && !isCreating) {
        // Update existing note
        const { error } = await supabase
          .from("lab_notes")
          .update({
            title: formData.title,
            content: formData.content,
            note_type: formData.note_type,
          })
          .eq("id", selectedNote.id)

        if (error) throw error

        toast({
          title: "Note updated",
          description: "Your lab note has been updated successfully.",
        })
      } else {
        // Create new note
        const { error } = await supabase
          .from("lab_notes")
          .insert({
            experiment_id: experimentId,
            title: formData.title,
            content: formData.content,
            note_type: formData.note_type,
            created_by: user.id,
          })

        if (error) throw error

        toast({
          title: "Note created",
          description: "Your lab note has been created successfully.",
        })

        setIsCreating(false)
      }

      // Refresh notes list
      await fetchNotes()
      router.refresh()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleNewNote = () => {
    setIsCreating(true)
    setSelectedNote(null)
    setFormData({
      title: "",
      content: "",
      note_type: "general",
    })
  }

  const handleSelectNote = (note: LabNote) => {
    setIsCreating(false)
    setSelectedNote(note)
    setFormData({
      title: note.title,
      content: note.content,
      note_type: note.note_type || "general",
    })
  }

  return (
    <div className="grid gap-6 md:grid-cols-[300px_1fr]">
      {/* Notes List */}
      <Card className="h-fit">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Lab Notes</CardTitle>
            <Button size="sm" onClick={handleNewNote}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {notes.length > 0 ? (
            <div className="space-y-2">
              {notes.map((note) => (
                <button
                  key={note.id}
                  onClick={() => handleSelectNote(note)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    selectedNote?.id === note.id && !isCreating
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm text-foreground truncate">
                        {note.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(note.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    {note.note_type && (
                      <Badge variant="outline" className="shrink-0 text-xs">
                        {note.note_type}
                      </Badge>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No notes yet</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Note Editor */}
      <Card>
        <CardHeader>
          <CardTitle className="text-foreground">
            {isCreating ? "New Lab Note" : "Edit Lab Note"}
          </CardTitle>
          <CardDescription>
            Document your observations, analysis, and findings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Title & Type */}
          <div className="grid grid-cols-1 md:grid-cols-[1fr_200px] gap-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
                placeholder="e.g., Day 3 Observations"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="note_type">Note Type</Label>
              <Select
                value={formData.note_type}
                onValueChange={(value) =>
                  setFormData({ ...formData, note_type: value })
                }
              >
                <SelectTrigger id="note_type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="observation">Observation</SelectItem>
                  <SelectItem value="analysis">Analysis</SelectItem>
                  <SelectItem value="conclusion">Conclusion</SelectItem>
                  <SelectItem value="general">General</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Rich Text Editor */}
          <div className="space-y-2">
            <Label>Content</Label>
            <AffineBlock
              initialContent={formData.content}
              onChange={(content) =>
                setFormData({ ...formData, content })
              }
              placeholder="Write your lab notes here..."
              className="min-h-[400px]"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4">
            {(selectedNote || isCreating) && (
              <Button onClick={handleSave} disabled={isSaving}>
                <Save className="h-4 w-4 mr-2" />
                {isSaving ? "Saving..." : "Save Note"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

