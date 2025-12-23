"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
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
import { useAutoSave } from "@/hooks/use-auto-save"
import { SaveStatusIndicator } from "@/components/ui/save-status"
import { Save, Plus, FileText, Download, FileCode, Globe, Loader2 } from "lucide-react"
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
  const searchParams = useSearchParams()
  const { toast } = useToast()

  const [notes, setNotes] = useState<LabNote[]>([])
  const [selectedNote, setSelectedNote] = useState<LabNote | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const [publicUrl, setPublicUrl] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    title: "",
    content: "",
    note_type: "general",
  })

  // Auto-save functionality
  const handleAutoSave = async (content: string) => {
    // Don't auto-save if title is empty
    if (!formData.title.trim()) return

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) throw new Error("Not authenticated")

      // If creating a new note, insert it first
      if (isCreating || !selectedNote) {
        const { data, error } = await supabase
          .from("lab_notes")
          .insert({
            experiment_id: experimentId,
            title: formData.title,
            content,
            note_type: formData.note_type,
            created_by: user.id,
          })
          .select()
          .single()

        if (error) throw error

        // Switch to editing mode
        setIsCreating(false)
        setSelectedNote(data)

        // Refresh notes list
        await fetchNotes()
      } else {
        // Update existing note
        const { error } = await supabase
          .from("lab_notes")
          .update({
            content,
            title: formData.title,
            note_type: formData.note_type,
            updated_at: new Date().toISOString(),
          })
          .eq("id", selectedNote.id)

        if (error) throw error

        // Update local state
        setNotes(notes.map(note =>
          note.id === selectedNote.id
            ? { ...note, content, title: formData.title, note_type: formData.note_type, updated_at: new Date().toISOString() }
            : note
        ))

        // If published, update the public file too
        if (publicUrl) {
          const { error: storageError } = await supabase.storage
            .from('lab_notes_public')
            .upload(`${selectedNote.id}.json`, JSON.stringify({
              title: formData.title,
              content,
              updatedAt: new Date().toISOString()
            }), {
              upsert: true
            })

          if (storageError) console.error("Failed to update public note:", storageError)
        }
      }
    } catch (error: any) {
      console.error("Auto-save error:", error)
      throw error // Re-throw to trigger error status in auto-save hook
    }
  }

  const { status: autoSaveStatus, lastSaved, debouncedSave } = useAutoSave({
    onSave: handleAutoSave,
    delay: 2000, // Save 2 seconds after user stops typing
    enabled: true, // Always enabled, even during creation
  })

  // Fetch existing lab notes
  const noteIdFromQuery = searchParams.get("noteId")

  useEffect(() => {
    fetchNotes(noteIdFromQuery)
  }, [experimentId, noteIdFromQuery])

  // Check if note is published when selected
  useEffect(() => {
    const checkPublicStatus = async () => {
      setPublicUrl(null)
      if (!selectedNote) return

      const supabase = createClient()
      const { data } = await supabase.storage
        .from('lab_notes_public')
        .list('', {
          search: `${selectedNote.id}.json`
        })

      if (data && data.length > 0) {
        setPublicUrl(`${window.location.origin}/share/note/${selectedNote.id}`)
      }
    }

    checkPublicStatus()
  }, [selectedNote])

  const handlePublish = async () => {
    if (!selectedNote) return

    try {
      setIsPublishing(true)
      const supabase = createClient()

      const { error } = await supabase.storage
        .from('lab_notes_public')
        .upload(`${selectedNote.id}.json`, JSON.stringify({
          title: formData.title,
          content: formData.content,
          updatedAt: new Date().toISOString()
        }), {
          upsert: true
        })

      if (error) throw error

      setPublicUrl(`${window.location.origin}/share/note/${selectedNote.id}`)
      toast({
        title: "Note Published",
        description: "Your note is now publicly available.",
      })
    } catch (error: any) {
      console.error("Publish error:", error)
      toast({
        title: "Publish Failed",
        description: error.message || "Failed to publish note.",
        variant: "destructive"
      })
    } finally {
      setIsPublishing(false)
    }
  }

  const handleUnpublish = async () => {
    if (!selectedNote) return

    try {
      setIsPublishing(true)
      const supabase = createClient()

      const { error } = await supabase.storage
        .from('lab_notes_public')
        .remove([`${selectedNote.id}.json`])

      if (error) throw error

      setPublicUrl(null)
      toast({
        title: "Note Unpublished",
        description: "Your note is no longer public.",
      })
    } catch (error: any) {
      toast({
        title: "Unpublish Failed",
        description: error.message,
        variant: "destructive"
      })
    } finally {
      setIsPublishing(false)
    }
  }


  const fetchNotes = async (preferredNoteId?: string | null) => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("lab_notes")
        .select("*")
        .eq("experiment_id", experimentId)
        .order("created_at", { ascending: false })

      if (error) throw error
      setNotes(data || [])

      // Auto-select preferred note (from query) or first available when not creating
      if (data && data.length > 0 && !isCreating) {
        const next =
          (preferredNoteId && data.find((n) => n.id === preferredNoteId)) ||
          data.find((n) => n.id === selectedNote?.id) ||
          data[0]

        if (next) {
          setSelectedNote(next)
          setFormData({
            title: next.title,
            content: next.content,
            note_type: next.note_type || "general",
          })
        }
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
      // Show loading toast
      toast({
        title: "Generating PDF",
        description: "Please wait...",
      })

      // Dynamic import - using html2pdf for much smaller file sizes
      const html2pdf = (await import('html2pdf.js')).default
      // Sanitize content and strip problematic colors/styles
      const parser = new DOMParser()
      const parsed = parser.parseFromString(formData.content || "", "text/html")
      parsed.querySelectorAll('[style]').forEach((n) => n.removeAttribute('style'))
      parsed.querySelectorAll('*').forEach((el) => {
        if (el instanceof HTMLElement) {
          el.style.color = '#000000'
          el.style.backgroundColor = 'transparent'
          el.style.borderColor = '#000000'
        }
      })
      const cleanBody = parsed.body.innerHTML

      // Create clean HTML content
      const element = document.createElement('div')
      element.innerHTML = `
        <style>
          * { color: #000 !important; background: transparent !important; border-color: #000 !important; }
          a { color: #0000ee !important; }
        </style>
        <div style="padding: 20px; font-family: Arial, sans-serif; color: #000000; background: #ffffff;">
          <h1 style="font-size: 24px; margin-bottom: 20px; font-weight: bold; color: #000000;">${formData.title}</h1>
          <div style="line-height: 1.6; font-size: 12px; color: #000000;">${cleanBody}</div>
        </div>
      `

      // Configure html2pdf options for optimal size/quality balance
      const options = {
        margin: [10, 10, 10, 10] as [number, number, number, number],
        filename: `${formData.title || "lab-note"}.pdf`,
        image: { type: 'jpeg' as const, quality: 0.95 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          letterRendering: true,
          logging: false
        },
        jsPDF: {
          unit: 'mm',
          format: 'a4',
          orientation: 'portrait' as const,
          compress: true // Enable PDF compression
        },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
      }

      // Generate and download PDF
      await html2pdf().set(options).from(element).save()

      toast({
        title: "PDF exported",
        description: "Your note has been exported as PDF.",
      })
    } catch (error: any) {
      console.error('PDF export error:', error)
      toast({
        title: "Export failed",
        description: error.message || "Failed to export as PDF. Please try HTML or DOCX format instead.",
        variant: "destructive",
      })
    }
  }

  const downloadAsDOCX = async () => {
    try {
      toast({
        title: "Generating DOCX",
        description: "Please wait...",
      })

      // Clean and format HTML content
      const cleanContent = formData.content || '<p>No content</p>'

      const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset='utf-8'>
  <title>${formData.title || 'Lab Note'}</title>
</head>
<body>
  <h1>${formData.title || 'Lab Note'}</h1>
  ${cleanContent}
</body>
</html>`

      // Call server-side API to convert HTML to DOCX
      const response = await fetch('/api/export-docx', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          html,
          title: formData.title || 'lab-note',
        }),
      })

      console.log('Response status:', response.status)
      console.log('Response headers:', response.headers.get('content-type'))

      if (!response.ok) {
        const error = await response.json()
        console.error('Server error:', error)
        throw new Error(error.error || 'Failed to generate DOCX')
      }

      // Get the blob from response
      const blob = await response.blob()
      console.log('Received blob size:', blob.size)

      // Check if blob has content
      if (!blob || blob.size === 0) {
        throw new Error('Generated document is empty - received 0 bytes from server')
      }

      // Download
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${formData.title || "lab-note"}.docx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      toast({
        title: "DOCX exported",
        description: "Your note has been exported as DOCX.",
      })
    } catch (error: any) {
      console.error('DOCX export error:', error)
      toast({
        title: "Export failed",
        description: error.message || "Failed to export as DOCX. Please try HTML or PDF format instead.",
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
    <div className="w-full">
      {/* Note Editor */}
      <Card className="w-full">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-foreground">
                {isCreating ? "New Lab Note" : (formData.title || "Untitled Lab Note")}
              </CardTitle>
              <CardDescription>
                Document your observations, analysis, and findings
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              {/* Save Status Button - Google Drive Style */}
              <SaveStatusIndicator
                status={autoSaveStatus}
                lastSaved={lastSaved}
              />
              {!isCreating && selectedNote && (
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
              {!isCreating && selectedNote && (
                <div className="flex items-center gap-2">
                  {publicUrl ? (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-green-600 border-green-200 hover:bg-green-50 hover:text-green-700"
                        onClick={() => {
                          navigator.clipboard.writeText(publicUrl)
                          toast({ title: "Copied!", description: "Public link copied to clipboard." })
                        }}
                      >
                        <Globe className="h-4 w-4 mr-2" />
                        Published
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        disabled={isPublishing}
                        onClick={handleUnpublish}
                        title="Unpublish"
                      >
                        {isPublishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <div className="h-4 w-4 text-xs font-bold">×</div>}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handlePublish}
                      disabled={isPublishing}
                    >
                      {isPublishing ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Publishing...
                        </>
                      ) : (
                        <>
                          <Globe className="h-4 w-4 mr-2" />
                          Publish
                        </>
                      )}
                    </Button>
                  )}
                </div>
              )}
            </div>

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
              onChange={(content) => {
                setFormData({ ...formData, content })
                // Trigger auto-save (works for both creation and editing)
                debouncedSave(content)
              }}
              placeholder="Write your lab notes here..."
              title={formData.title || "lab-note"}
              minHeight="400px"
              showAITools={true}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4">
            <Button
              onClick={handleSave}
              disabled={isSaving || !formData.title.trim()}
            >
              <Save className="h-4 w-4 mr-2" />
              {isSaving ? "Saving..." : "Save Note"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

