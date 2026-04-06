"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { TiptapEditor } from "@/components/text-editor/tiptap-editor"
import { TextareaWithWordCount } from "@/components/ui/textarea-with-word-count"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import { NoteExportMenu } from "@/components/note-export-menu"
import { Download } from "lucide-react"

const PROTOCOL_CATEGORIES = [
  "Sample Preparation",
  "Analysis",
  "Safety",
  "Equipment Operation",
  "Quality Control",
  "Data Processing",
  "General SOP",
]

export function ProtocolEditor({ protocol }: { protocol: any }) {
  const router = useRouter()
  const { toast } = useToast()
  const [isSaving, setIsSaving] = useState(false)
  const [formData, setFormData] = useState({
    name: protocol.name ?? "",
    description: protocol.description ?? "",
    version: protocol.version ?? "",
    content: protocol.content ?? "",
    category: protocol.category ?? "",
    is_active: Boolean(protocol.is_active),
  })

  const hasChanges = useMemo(
    () =>
      formData.name !== (protocol.name ?? "") ||
      formData.description !== (protocol.description ?? "") ||
      formData.version !== (protocol.version ?? "") ||
      formData.content !== (protocol.content ?? "") ||
      formData.category !== (protocol.category ?? "") ||
      formData.is_active !== Boolean(protocol.is_active),
    [formData, protocol]
  )

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const supabase = createClient()
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
        title: "Protocol saved",
        description: "Your protocol changes have been updated.",
      })
      router.refresh()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save protocol.",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader className="space-y-2">
        <CardTitle className="text-foreground">Protocol Content</CardTitle>
        <CardDescription>
          Edit this protocol directly here, similar to working in lab notes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1.6fr)_minmax(220px,0.8fr)_minmax(220px,0.8fr)]">
          <div className="space-y-2">
            <Label htmlFor="protocol-name">Protocol Name</Label>
            <Input
              id="protocol-name"
              value={formData.name}
              onChange={(e) => setFormData((current) => ({ ...current, name: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="protocol-version">Version</Label>
            <Input
              id="protocol-version"
              value={formData.version}
              onChange={(e) => setFormData((current) => ({ ...current, version: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="protocol-category">Category</Label>
            <Select
              value={formData.category || "none"}
              onValueChange={(value) =>
                setFormData((current) => ({
                  ...current,
                  category: value === "none" ? "" : value,
                }))
              }
            >
              <SelectTrigger id="protocol-category">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No category</SelectItem>
                {PROTOCOL_CATEGORIES.map((category) => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="protocol-description">Brief Description</Label>
          <TextareaWithWordCount
            id="protocol-description"
            rows={2}
            value={formData.description}
            onChange={(value) =>
              setFormData((current) => ({ ...current, description: value }))
            }
            maxWords={1000}
          />
        </div>

        <div className="rounded-lg border p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <Label htmlFor="protocol-content">Protocol Body</Label>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <NoteExportMenu
                title={formData.name || "protocol"}
                htmlContent={formData.content || ""}
                trigger={
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Export protocol">
                    <Download className="h-4 w-4" />
                  </Button>
                }
              />
              <span>{hasChanges ? "Unsaved changes" : "Saved"}</span>
            </div>
          </div>
          <TiptapEditor
            content={formData.content}
            onChange={(content) =>
              setFormData((current) => ({ ...current, content }))
            }
            placeholder="Write protocol steps, materials, and guidance..."
            title={formData.name || "protocol"}
            minHeight="420px"
            showAITools
          />
        </div>

        <div className="flex flex-col gap-4 rounded-lg border p-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <Label htmlFor="protocol-active" className="cursor-pointer">
              Active Protocol
            </Label>
            <p className="text-sm text-muted-foreground">
              Active protocols can be linked to experiments.
            </p>
          </div>
          <Switch
            id="protocol-active"
            checked={formData.is_active}
            onCheckedChange={(checked) =>
              setFormData((current) => ({ ...current, is_active: checked }))
            }
          />
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isSaving || !hasChanges}>
            {isSaving ? "Saving..." : "Save Protocol"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
