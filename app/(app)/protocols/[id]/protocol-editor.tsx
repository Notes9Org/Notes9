"use client"

import { useMemo, useState, useCallback } from "react"
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
import { Download, Pencil } from "lucide-react"
import { ProtocolDesignMode } from "@/components/protocols/protocol-design-mode"
import { updateProtocolWithOptionalContext } from "@/lib/protocol-context-supabase"

const PROTOCOL_CATEGORIES = [
  "Sample Preparation",
  "Analysis",
  "Safety",
  "Equipment Operation",
  "Quality Control",
  "Data Processing",
  "General SOP",
]


export function ProtocolEditor({
  protocol,
  defaultDesignMode = false,
}: {
  protocol: any
  defaultDesignMode?: boolean
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [isSaving, setIsSaving] = useState(false)
  const [isDesignMode, setIsDesignMode] = useState(defaultDesignMode)

  const [formData, setFormData] = useState({
    name: protocol.name ?? "",
    description: protocol.description ?? "",
    version: protocol.version ?? "",
    content: protocol.content ?? "",
    category: protocol.category ?? "",
    is_active: Boolean(protocol.is_active),
    project_id: protocol.project_id ?? "",
    experiment_id: protocol.experiment_id ?? "",
  })

  // Design mode: handle context changes from the literature panel's internal filters.
  // Stable reference is critical — an unstable callback causes an infinite update loop
  // in ProtocolLiteraturePanel's onContextChange effect.
  const handleContextChange = useCallback(
    (projectId: string | null, experimentId: string | null) => {
      setFormData((prev) => ({
        ...prev,
        project_id: projectId ?? "",
        experiment_id: experimentId ?? "",
      }))
    },
    []
  )

  // Keep design mode protocol stable but reactive to live context
  const designProtocol = useMemo(
    () => ({
      id: protocol.id,
      name: formData.name,
      content: formData.content,
      version: formData.version,
      project_id: formData.project_id || null,
      experiment_id: formData.experiment_id || null,
    }),
    [
      protocol.id,
      formData.name,
      formData.content,
      formData.version,
      formData.project_id,
      formData.experiment_id,
    ]
  )

  const hasChanges = useMemo(
    () =>
      formData.name !== (protocol.name ?? "") ||
      formData.description !== (protocol.description ?? "") ||
      formData.version !== (protocol.version ?? "") ||
      formData.content !== (protocol.content ?? "") ||
      formData.category !== (protocol.category ?? "") ||
      formData.is_active !== Boolean(protocol.is_active) ||
      (formData.project_id || "") !== (protocol.project_id ?? "") ||
      (formData.experiment_id || "") !== (protocol.experiment_id ?? ""),
    [formData, protocol]
  )

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const supabase = createClient()
      const updatePayload: Record<string, any> = {
        name: formData.name,
        description: formData.description || null,
        version: formData.version,
        content: formData.content,
        category: formData.category || null,
        is_active: formData.is_active,
      }

      // Attempt to save project/experiment context.
      // If the migration hasn't been applied the columns don't exist yet —
      // the save still succeeds for the other fields.
      if (formData.project_id) updatePayload.project_id = formData.project_id
      if (formData.experiment_id) updatePayload.experiment_id = formData.experiment_id

      const { error, contextSaved } = await updateProtocolWithOptionalContext(
        supabase,
        protocol.id,
        updatePayload
      )

      if (error) throw error

      if (!contextSaved) {
        toast({
          title: "Protocol saved",
          description:
            "Other fields saved. Run migration 030 in Supabase to store project/experiment links.",
        })
      } else {
        toast({ title: "Protocol saved", description: "Changes saved successfully." })
      }
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

  // ─── Design mode — fills the parent container height ─────────────────────
  if (isDesignMode) {
    return (
      <div className="flex flex-col h-full min-h-0">
        <ProtocolDesignMode
          protocol={designProtocol}
          onSaved={() => router.refresh()}
          onExitDesignMode={() => setIsDesignMode(false)}
          onContextChange={handleContextChange}
        />
      </div>
    )
  }

  // ─── Standard edit mode ───────────────────────────────────────────────────
  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-foreground">Protocol Content</CardTitle>
            <CardDescription>
              Edit this protocol directly here, similar to working in lab notes.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 shrink-0"
            onClick={() => setIsDesignMode(true)}
          >
            <Pencil className="h-3.5 w-3.5" />
            Design Mode
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1.6fr)_minmax(220px,0.8fr)_minmax(220px,0.8fr)]">
          <div className="space-y-2">
            <Label htmlFor="protocol-name">Protocol Name</Label>
            <Input
              id="protocol-name"
              value={formData.name}
              onChange={(e) => setFormData((c) => ({ ...c, name: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="protocol-version">Version</Label>
            <Input
              id="protocol-version"
              value={formData.version}
              onChange={(e) => setFormData((c) => ({ ...c, version: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="protocol-category">Category</Label>
            <Select
              value={formData.category || "none"}
              onValueChange={(value) =>
                setFormData((c) => ({
                  ...c,
                  category: value === "none" ? "" : value,
                }))
              }
            >
              <SelectTrigger id="protocol-category">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No category</SelectItem>
                {PROTOCOL_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
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
            onChange={(value) => setFormData((c) => ({ ...c, description: value }))}
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
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    aria-label="Export protocol"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                }
              />
              <span>{hasChanges ? "Unsaved changes" : "Saved"}</span>
            </div>
          </div>
          <TiptapEditor
            content={formData.content}
            onChange={(content) => setFormData((c) => ({ ...c, content }))}
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
            onCheckedChange={(checked) => setFormData((c) => ({ ...c, is_active: checked }))}
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
