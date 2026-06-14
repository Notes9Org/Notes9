"use client"

import { useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import type { Editor } from "@tiptap/react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TextareaWithWordCount } from "@/components/ui/textarea-with-word-count"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Pencil, Plus } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { TiptapEditor } from "@/components/text-editor/tiptap-editor"
import { NoteExportMenu, NotePrintButton } from "@/components/note-export-menu"
import { NoteImportButton } from "@/components/note-import-button"
import { Download } from "lucide-react"

const PROTOCOL_CATEGORIES = [
  "Sample Preparation",
  "Analysis",
  "Safety",
  "Equipment Operation",
  "Quality Control",
  "Data Processing",
  "General SOP"
]

interface EditProtocolDialogProps {
  protocol: {
    id: string
    name: string
    description?: string | null
    version: string
    content: string
    category?: string | null
    is_active: boolean
  }
}

export function EditProtocolDialog({ protocol }: EditProtocolDialogProps) {
  const router = useRouter()
  const { toast } = useToast()
  const supabase = useMemo(() => createClient(), [])
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const editorRef = useRef<Editor | null>(null)
  
  const [formData, setFormData] = useState({
    name: protocol.name,
    description: protocol.description || "",
    version: protocol.version,
    content: protocol.content,
    category: protocol.category || "",
    is_active: protocol.is_active,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const { error } = await supabase
        .from("protocols")
        .update({
          name: formData.name,
          description: formData.description || null,
          version: formData.version,
          content: formData.content,
          category: formData.category || null,
          is_active: formData.is_active,
        })
        .eq("id", protocol.id)

      if (error) throw error

      toast({
        title: "Protocol updated",
        description: "Protocol has been updated successfully.",
      })

      setOpen(false)
      router.refresh()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Edit protocol">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent dialogSize="lg" className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Protocol</DialogTitle>
          <DialogDescription>
            Update protocol information and content
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Protocol Name</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              required
            />
          </div>

          {/* Version & Category */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="version">Version</Label>
              <Input
                id="version"
                value={formData.version}
                onChange={(e) =>
                  setFormData({ ...formData, version: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select
                value={formData.category}
                onValueChange={(value) =>
                  setFormData({ ...formData, category: value })
                }
              >
                <SelectTrigger id="category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {PROTOCOL_CATEGORIES.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Brief Description</Label>
            <TextareaWithWordCount
              id="description"
              rows={2}
              value={formData.description}
              onChange={(v) =>
                setFormData({ ...formData, description: v })
              }
              maxWords={1000}
            />
          </div>

          {/* Content */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="content">Protocol Content</Label>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  asChild
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="New protocol"
                  title="New protocol"
                >
                  <Link href="/protocols/new">
                    <Plus className="h-4 w-4" />
                  </Link>
                </Button>
                <NotePrintButton
                  title={formData.name || "protocol"}
                  htmlContent={formData.content || ""}
                  size="icon-sm"
                  className="text-muted-foreground hover:text-foreground"
                />
                <NoteImportButton
                  className="text-muted-foreground hover:text-foreground"
                  onImportHtml={(html) => {
                    const editor = editorRef.current
                    if (editor) editor.chain().focus().insertContent(html).run()
                    else setFormData((prev) => ({ ...prev, content: (prev.content || "") + html }))
                  }}
                />
                <NoteExportMenu
                  title={formData.name || "protocol"}
                  htmlContent={formData.content || ""}
                  trigger={
                    <Button type="button" variant="ghost" size="icon-sm" className="shrink-0 text-muted-foreground hover:text-foreground" aria-label="Export">
                      <Download className="h-4 w-4" />
                    </Button>
                  }
                />
              </div>
            </div>
            <TiptapEditor
              content={formData.content}
              onChange={(content) =>
                setFormData({ ...formData, content })
              }
              placeholder="Update protocol content..."
              title={formData.name || "protocol"}
              minHeight="300px"
              showAITools={true}
              showAiWritingDropdown={false}
              onEditorReady={(ed) => { editorRef.current = ed }}
            />
          </div>

          {/* Active Status */}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="is_active" className="cursor-pointer">
                Active Protocol
              </Label>
              <p className="text-sm text-muted-foreground">
                Available for use in experiments
              </p>
            </div>
            <Switch
              id="is_active"
              checked={formData.is_active}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, is_active: checked })
              }
            />
          </div>

          {/* Actions */}
          <DialogFooter className="pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

