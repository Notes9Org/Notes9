"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
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
import {
  STEP_CATEGORIES,
  STEP_TYPES,
  type StepCategory,
  type StepStatus,
  type ExperimentStep,
} from "@/lib/experiment-steps-mock"

interface AddStepDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (step: {
    title: string
    category: StepCategory
    step_type: string
    description: string
    duration_minutes: number | null
    status: StepStatus
    notes: string
  }) => void
  editingStep?: ExperimentStep | null
}

export function AddStepDialog({ open, onOpenChange, onSave, editingStep }: AddStepDialogProps) {
  const [title, setTitle] = useState(editingStep?.title || "")
  const [category, setCategory] = useState<StepCategory>(editingStep?.category || "Sample Handling")
  const [stepType, setStepType] = useState(editingStep?.step_type || "")
  const [description, setDescription] = useState(editingStep?.description || "")
  const [duration, setDuration] = useState(editingStep?.duration_minutes?.toString() || "")
  const [status, setStatus] = useState<StepStatus>(editingStep?.status || "pending")
  const [notes, setNotes] = useState(editingStep?.notes || "")

  // Reset form when dialog opens with new/different step
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setTitle(editingStep?.title || "")
      setCategory(editingStep?.category || "Sample Handling")
      setStepType(editingStep?.step_type || "")
      setDescription(editingStep?.description || "")
      setDuration(editingStep?.duration_minutes?.toString() || "")
      setStatus(editingStep?.status || "pending")
      setNotes(editingStep?.notes || "")
    }
    onOpenChange(isOpen)
  }

  const handleSave = () => {
    if (!title.trim()) return
    onSave({
      title: title.trim(),
      category,
      step_type: stepType || STEP_TYPES[category][0],
      description: description.trim(),
      duration_minutes: duration ? parseInt(duration) || null : null,
      status,
      notes: notes.trim(),
    })
    onOpenChange(false)
  }

  const availableTypes = STEP_TYPES[category] || []

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editingStep ? "Edit Step" : "Add Step"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input
              placeholder="e.g. Prepare serum samples"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => {
                setCategory(v as StepCategory)
                setStepType("")
              }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STEP_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={stepType} onValueChange={setStepType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {availableTypes.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              placeholder="Describe what happens in this step..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Duration (minutes)</Label>
              <Input
                type="number"
                placeholder="e.g. 30"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as StepStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="skipped">Skipped</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Textarea
              placeholder="Any additional notes or observations..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!title.trim()}>
            {editingStep ? "Save Changes" : "Add Step"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
