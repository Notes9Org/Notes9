"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { Loader2, Plus } from "lucide-react"
import { getUniqueNameErrorMessage } from "@/lib/unique-name-error"

type Project = { id: string; name: string }
type Experiment = { id: string; name: string; project_id: string }

type NewLabNoteDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: () => void
}

export function NewLabNoteDialog({
  open,
  onOpenChange,
  onCreated,
}: NewLabNoteDialogProps) {
  const router = useRouter()
  const { toast } = useToast()
  const supabase = createClient()

  const [projects, setProjects] = useState<Project[]>([])
  const [experiments, setExperiments] = useState<Experiment[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string>("")
  const [selectedExperimentId, setSelectedExperimentId] = useState<string>("")
  const [title, setTitle] = useState("")
  const [loadingProjects, setLoadingProjects] = useState(false)
  const [loadingExperiments, setLoadingExperiments] = useState(false)
  const [creating, setCreating] = useState(false)

  const selectedProject = projects.find((p) => p.id === selectedProjectId)
  const selectedExperiment = experiments.find((e) => e.id === selectedExperimentId)

  useEffect(() => {
    if (!open) return
    const load = async () => {
      setLoadingProjects(true)
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data: profile } = await supabase
          .from("profiles")
          .select("organization_id")
          .eq("id", user.id)
          .single()
        if (profile?.organization_id) {
          const { data, error } = await supabase
            .from("projects")
            .select("id, name")
            .eq("organization_id", profile.organization_id)
            .order("name")
          if (!error) setProjects(data || [])
        } else {
          const { data: memberRows } = await supabase
            .from("project_members")
            .select("project_id")
            .eq("user_id", user.id)
          const ids = (memberRows || []).map((r) => r.project_id).filter(Boolean)
          if (ids.length > 0) {
            const { data, error } = await supabase
              .from("projects")
              .select("id, name")
              .in("id", ids)
              .order("name")
            if (!error) setProjects(data || [])
          } else {
            const { data, error } = await supabase
              .from("projects")
              .select("id, name")
              .order("name")
            if (!error) setProjects(data || [])
          }
        }
      } finally {
        setLoadingProjects(false)
      }
    }
    load()
  }, [open, supabase])

  useEffect(() => {
    if (!selectedProjectId) {
      setExperiments([])
      setSelectedExperimentId("")
      return
    }
    setLoadingExperiments(true)
    setSelectedExperimentId("")
    supabase
      .from("experiments")
      .select("id, name, project_id")
      .eq("project_id", selectedProjectId)
      .order("name")
      .then(({ data, error }) => {
        if (!error) setExperiments(data || [])
        setLoadingExperiments(false)
      })
  }, [selectedProjectId, supabase])

  useEffect(() => {
    if (open) {
      setSelectedProjectId("")
      setSelectedExperimentId("")
      setTitle("")
    }
  }, [open])

  const getUniqueDefaultTitle = async (experimentId: string): Promise<string> => {
    const { data } = await supabase
      .from("lab_notes")
      .select("title")
      .eq("experiment_id", experimentId)
    const existing = (data || []).map((r) => (r as { title: string }).title)
    if (!existing.includes("Untitled")) return "Untitled"
    let n = 2
    while (existing.includes(`Untitled (${n})`)) n++
    return `Untitled (${n})`
  }

  const handleCreate = async () => {
    if (!selectedExperimentId?.trim()) {
      toast({
        title: "Select experiment",
        description: "Please select a project and an experiment for this lab note.",
        variant: "destructive",
      })
      return
    }
    setCreating(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Not authenticated")
      const noteTitle = title.trim() || (await getUniqueDefaultTitle(selectedExperimentId))
      const { data, error } = await supabase
        .from("lab_notes")
        .insert({
          experiment_id: selectedExperimentId,
          title: noteTitle,
          content: "",
          note_type: "general",
          created_by: user.id,
        })
        .select("id")
        .single()
      if (error) throw error
      onOpenChange(false)
      onCreated?.()
      toast({
        title: "Lab note created",
        description: `"${noteTitle}" is linked to ${selectedExperiment?.name} in ${selectedProject?.name}.`,
      })
      router.push(`/experiments/${selectedExperimentId}?tab=notes&noteId=${data.id}`)
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string }
      toast({
        title: "Error",
        description: getUniqueNameErrorMessage(e, "lab_note"),
        variant: "destructive",
      })
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            New lab note
          </DialogTitle>
          <DialogDescription>
            Choose the project and experiment this note belongs to. The note will be linked there and you can open it to edit.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Project</Label>
            <Select
              value={selectedProjectId}
              onValueChange={setSelectedProjectId}
              disabled={loadingProjects}
            >
              <SelectTrigger>
                <SelectValue placeholder={loadingProjects ? "Loading…" : "Select project"} />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Experiment</Label>
            <Select
              value={selectedExperimentId}
              onValueChange={setSelectedExperimentId}
              disabled={!selectedProjectId || loadingExperiments}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    !selectedProjectId
                      ? "Select a project first"
                      : loadingExperiments
                        ? "Loading…"
                        : "Select experiment"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {experiments.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {(selectedProject || selectedExperiment) && (
            <div className="rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Link to: </span>
              {selectedProject && <span>{selectedProject.name}</span>}
              {selectedProject && selectedExperiment && " → "}
              {selectedExperiment && <span>{selectedExperiment.name}</span>}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="new-note-title">Note title (optional)</Label>
            <Input
              id="new-note-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Day 1 observations"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!selectedExperimentId || creating}
          >
            {creating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating…
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" />
                Create & open note
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
