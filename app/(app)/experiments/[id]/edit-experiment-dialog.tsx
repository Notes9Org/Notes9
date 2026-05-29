"use client"

import { useState, useEffect, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
import { usePreventSpaceMenuClose } from "@/hooks/use-prevent-space-menu-close"
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
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { RichTextEditor } from "@/components/rich-text-editor"
import { countWordsFromHtml } from "@/components/ui/textarea-with-word-count"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { useRouter } from "next/navigation"
import { Pencil, Loader2 } from "lucide-react"
import { getUniqueNameErrorMessage } from "@/lib/unique-name-error"
import { DATE_ORDER_ERROR, isEndDateBeforeStartDate } from "@/lib/date-order"

interface Experiment {
  id: string
  name: string
  description: string | null
  hypothesis: string | null
  status: string
  start_date: string | null
  completion_date: string | null
  project_id: string
  assigned_to: string | null
}

interface EditExperimentDialogProps {
  experiment: Experiment
  projects: Array<{ id: string; name: string }>
  users: Array<{ id: string; first_name: string; last_name: string }>
  asMenuItem?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function EditExperimentDialog({ 
  experiment, 
  projects, 
  users, 
  asMenuItem = false,
  open: externalOpen,
  onOpenChange
}: EditExperimentDialogProps) {
  const { toast } = useToast()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [internalOpen, setInternalOpen] = useState(false)
  const open = externalOpen !== undefined ? externalOpen : internalOpen
  const setOpen = (value: boolean) => {
    setInternalOpen(value)
    onOpenChange?.(value)
  }
  const [isSaving, setIsSaving] = useState(false)

  // Prevent space key from closing dropdown menu when typing
  const handleKeyDown = usePreventSpaceMenuClose()

  // Form state
  const [name, setName] = useState(experiment.name)
  const [description, setDescription] = useState(experiment.description || "")
  const [hypothesis, setHypothesis] = useState(experiment.hypothesis || "")
  const [status, setStatus] = useState(experiment.status)
  const [startDate, setStartDate] = useState(experiment.start_date || "")
  const [completionDate, setCompletionDate] = useState(experiment.completion_date || "")
  const hasInvalidDateOrder = isEndDateBeforeStartDate(startDate, completionDate)
  const [projectId, setProjectId] = useState(experiment.project_id)
  const [assignedTo, setAssignedTo] = useState(experiment.assigned_to || "")

  // Inline-error state: errors render under the offending input as soon as the
  // user submits once (or modifies the field after a failed submit), instead
  // of only firing a toast. The submitAttempted gate avoids yelling at the
  // user before they've tried to save.
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const trimmedName = name.trim()
  const descWordCount = countWordsFromHtml(description)
  const nameError = submitAttempted && !trimmedName ? "Experiment name is required." : null
  const descError =
    descWordCount > 1000
      ? `Description is ${descWordCount} words — keep it under 1000.`
      : null
  const dateOrderError = hasInvalidDateOrder
    ? `${DATE_ORDER_ERROR} Pick a date later than the start date.`
    : null
  const hasFieldErrors = Boolean(nameError || descError || dateOrderError)

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setName(experiment.name)
      setDescription(experiment.description || "")
      setHypothesis(experiment.hypothesis || "")
      setStatus(experiment.status)
      setStartDate(experiment.start_date || "")
      setCompletionDate(experiment.completion_date || "")
      setProjectId(experiment.project_id)
      setAssignedTo(experiment.assigned_to || "")
      setSubmitAttempted(false)
    }
  }, [open, experiment])

  const handleSave = async () => {
    setSubmitAttempted(true)
    // Inline errors are the authoritative validation UI now — short-circuit
    // silently if any field error is present rather than ALSO toasting the
    // same message, which made every failed save shout in two places.
    if (!trimmedName || descError || dateOrderError) return

    setIsSaving(true)

    try {
      const { error } = await supabase
        .from("experiments")
        .update({
          name: name.trim(),
          description: description.trim() || null,
          hypothesis: hypothesis.trim() || null,
          status,
          start_date: startDate || null,
          completion_date: completionDate || null,
          project_id: projectId,
          assigned_to: assignedTo || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", experiment.id)

      if (error) throw error

      toast({
        title: "Experiment Updated",
        description: `"${name}" has been updated successfully.`,
      })

      setOpen(false)
      router.refresh()
    } catch (error: any) {
      console.error("Update error:", error)
      toast({
        title: "Update Failed",
        description: getUniqueNameErrorMessage(error, "experiment"),
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  // When externally controlled, don't render the trigger
  const isExternallyControlled = externalOpen !== undefined

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!isExternallyControlled && (
        asMenuItem ? (
          <DialogTrigger className="flex items-center w-full px-2 py-1.5 hover:bg-accent rounded-sm cursor-pointer text-left">
            <Pencil className="h-4 w-4 mr-2" />
            <span>Edit Experiment</span>
          </DialogTrigger>
        ) : (
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </Button>
          </DialogTrigger>
        )
      )}
      <DialogContent dialogSize="md" className="max-h-[90vh] overflow-y-auto" onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle>Edit Experiment</DialogTitle>
          <DialogDescription>
            Update experiment details and settings
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => {
          e.preventDefault()
          handleSave()
        }} className="space-y-4 py-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">
              Experiment Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Protein Crystallization - Batch #47"
              disabled={isSaving}
              required
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? "name-error" : undefined}
            />
            {nameError ? (
              <p id="name-error" className="text-xs text-destructive">
                {nameError}
              </p>
            ) : null}
          </div>

          {/* Project */}
          <div className="min-w-0 space-y-2">
            <Label htmlFor="project">
              Project <span className="text-destructive">*</span>
            </Label>
            <Select value={projectId} onValueChange={setProjectId} disabled={isSaving}>
              <SelectTrigger id="project">
                <SelectValue placeholder="Select project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Status */}
          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select value={status} onValueChange={setStatus} disabled={isSaving}>
              <SelectTrigger id="status">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="planned">Planned</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="data_ready">Data Ready</SelectItem>
                <SelectItem value="analyzed">Analyzed</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Assigned To */}
          <div className="space-y-2">
            <Label htmlFor="assigned_to">Assigned To</Label>
            <Select value={assignedTo || "unassigned"} onValueChange={(value) => setAssignedTo(value === "unassigned" ? "" : value)} disabled={isSaving}>
              <SelectTrigger id="assigned_to">
                <SelectValue placeholder="Select researcher" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {users.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.first_name} {user.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start_date">Start Date</Label>
              <Input
                id="start_date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={isSaving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="completion_date">Completion Date</Label>
              <Input
                id="completion_date"
                type="date"
                min={startDate || undefined}
                value={completionDate}
                onChange={(e) => setCompletionDate(e.target.value)}
                disabled={isSaving}
              />
            </div>
          </div>

          {dateOrderError ? (
            <p className="text-xs text-destructive" id="date-order-error">
              {dateOrderError}
            </p>
          ) : null}

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <RichTextEditor
              content={description}
              onChange={setDescription}
              placeholder="Detailed description of the experiment..."
              disabled={isSaving}
            />
            <div className="flex items-center justify-between gap-3">
              {descError ? (
                <p
                  id="description-error"
                  className="text-xs text-destructive"
                >
                  {descError}
                </p>
              ) : (
                <span aria-hidden />
              )}
              <p
                className={cn(
                  "text-right text-xs tabular-nums",
                  descError ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {descWordCount} / 1000 words
              </p>
            </div>
          </div>

          {/* Hypothesis */}
          <div className="space-y-2">
            <Label htmlFor="hypothesis">Hypothesis</Label>
            <Textarea
              id="hypothesis"
              value={hypothesis}
              onChange={(e) => setHypothesis(e.target.value)}
              placeholder="What is the expected outcome?"
              rows={3}
              disabled={isSaving}
            />
        </div>

          {/* Actions */}
          <DialogFooter className="pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving || (submitAttempted && hasFieldErrors)}>
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
