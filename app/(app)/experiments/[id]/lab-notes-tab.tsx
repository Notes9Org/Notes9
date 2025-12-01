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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu"
import { AffineBlock } from "@/components/text-editor/affine-block"
import { TiptapEditor } from "@/components/text-editor/tiptap-editor"
import { useToast } from "@/hooks/use-toast"
import { Save, Plus, FileText, Download, FileCode } from "lucide-react"
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

  // Download functions
  const downloadAsMarkdown = () => {
    const text = formData.content.replace(/<[^>]*>/g, '') // Strip HTML tags
    const blob = new Blob([text], { type: "text/markdown" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${formData.title || "lab-note"}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const downloadAsHTML = () => {
    const fullHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${formData.title}</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      max-width: 800px;
      margin: 40px auto;
      padding: 20px;
      line-height: 1.6;
    }
    h1, h2, h3 { margin-top: 1.5em; }
    code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; }
    pre { background: #f4f4f4; padding: 15px; border-radius: 5px; overflow-x: auto; }
    blockquote { border-left: 4px solid #ddd; margin: 0; padding-left: 20px; color: #666; }
    table { border-collapse: collapse; width: 100%; margin: 20px 0; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background: #f4f4f4; }
  </style>
</head>
<body>
  <h1>${formData.title}</h1>
  ${formData.content}
</body>
</html>`
    const blob = new Blob([fullHTML], { type: "text/html" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${formData.title || "lab-note"}.html`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const downloadAsText = () => {
    const text = formData.content.replace(/<[^>]*>/g, '') // Strip HTML tags
    const blob = new Blob([text], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${formData.title || "lab-note"}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const downloadAsPDF = async () => {
    try {
      const jsPDF = (await import('jspdf')).default
      const html2canvas = (await import('html2canvas')).default
      
      const tempDiv = document.createElement('div')
      tempDiv.innerHTML = `<h1>${formData.title}</h1>${formData.content}`
      tempDiv.style.cssText = `
        position: absolute;
        left: -9999px;
        width: 800px;
        padding: 40px;
        font-family: system-ui, -apple-system, sans-serif;
        line-height: 1.6;
        color: #000;
        background: #fff;
      `
      document.body.appendChild(tempDiv)

      const canvas = await html2canvas(tempDiv, {
        scale: 2,
        useCORS: true,
        logging: false,
      })

      document.body.removeChild(tempDiv)

      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      })

      const imgWidth = 210
      const imgHeight = (canvas.height * imgWidth) / canvas.width

      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight)
      pdf.save(`${formData.title || "lab-note"}.pdf`)
    } catch (error) {
      console.error('PDF export error:', error)
      toast({
        title: "Export failed",
        description: "Failed to export as PDF. Please try another format.",
        variant: "destructive",
      })
    }
  }

  const downloadAsDOCX = async () => {
    try {
      const htmlDocx = await import('html-docx-js/dist/html-docx')
      
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>${formData.title}</title>
        </head>
        <body>
          <h1>${formData.title}</h1>
          ${formData.content}
        </body>
        </html>
      `
      
      const converted = htmlDocx.asBlob(html)
      const url = URL.createObjectURL(converted)
      const a = document.createElement('a')
      a.href = url
      a.download = `${formData.title || "lab-note"}.docx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('DOCX export error:', error)
      toast({
        title: "Export failed",
        description: "Failed to export as DOCX. Please try another format.",
        variant: "destructive",
      })
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
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-foreground">
                {isCreating ? "New Lab Note" : "Edit Lab Note"}
              </CardTitle>
              <CardDescription>
                Document your observations, analysis, and findings
              </CardDescription>
            </div>
            {!isCreating && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Download className="h-4 w-4 mr-2" />
                    Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Download as...</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={downloadAsMarkdown}>
                    <FileCode className="h-4 w-4 mr-2" />
                    Markdown (.md)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={downloadAsHTML}>
                    <FileText className="h-4 w-4 mr-2" />
                    HTML (.html)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={downloadAsText}>
                    <FileText className="h-4 w-4 mr-2" />
                    Plain Text (.txt)
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={downloadAsPDF}>
                    <FileText className="h-4 w-4 mr-2" />
                    PDF (.pdf)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={downloadAsDOCX}>
                    <FileText className="h-4 w-4 mr-2" />
                    Word (.docx)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
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
            <TiptapEditor
              content={formData.content}
              onChange={(content) =>
                setFormData({ ...formData, content })
              }
              placeholder="Write your lab notes here..."
              title={formData.title || "lab-note"}
              minHeight="400px"
              showAITools={true}
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

