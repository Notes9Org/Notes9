"use client"

import { useState, useEffect } from "react"
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
import { TextareaWithWordCount } from "@/components/ui/textarea-with-word-count"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"
import { Pencil, Loader2 } from "lucide-react"
import { getUniqueNameErrorMessage } from "@/lib/unique-name-error"
import { DATE_ORDER_ERROR, isEndDateBeforeStartDate } from "@/lib/date-order"

interface Project {
  id: string
  name: string
  description: string | null
  status: string
  priority: string | null
  start_date: string | null
  end_date: string | null
}

interface EditProjectDialogProps {
  project: Project
  asMenuItem?: boolean
  /** When provided with onOpenChange, dialog is controlled and no trigger is rendered */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function EditProjectDialog({ project, asMenuItem = false, open: controlledOpen, onOpenChange: controlledOnOpenChange }: EditProjectDialogProps) {
  const { toast } = useToast()
  const router = useRouter()
  const supabase = createClient()

  const [internalOpen, setInternalOpen] = useState(false)
  const isControlled = controlledOpen !== undefined && controlledOnOpenChange !== undefined
  const open = isControlled ? controlledOpen : internalOpen
  const setOpen = isControlled ? controlledOnOpenChange : setInternalOpen
  const [isSaving, setIsSaving] = useState(false)

  // Prevent space key from closing dropdown menu when typing
  const handleKeyDown = usePreventSpaceMenuClose()

  // Form state
  const [name, setName] = useState(project.name)
  const [description, setDescription] = useState(project.description || "")
  const [priority, setPriority] = useState(project.priority || "medium")
  const [startDate, setStartDate] = useState(project.start_date || "")
  const [endDate, setEndDate] = useState(project.end_date || "")
  const hasInvalidDateOrder = isEndDateBeforeStartDate(startDate, endDate)

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setName(project.name)
      setDescription(project.description || "")
      setPriority(project.priority || "medium")
      setStartDate(project.start_date || "")
      setEndDate(project.end_date || "")
    }
  }, [open, project])

  const handleSave = async () => {
    if (!name.trim()) {
      toast({
        title: "Validation Error",
        description: "Project name is required.",
        variant: "destructive",
      })
      return
    }
    if (hasInvalidDateOrder) {
      toast({
        title: "Validation Error",
        description: `${DATE_ORDER_ERROR} Please select a later date than the start date.`,
        variant: "destructive",
      })
      return
    }

    setIsSaving(true)

    try {
      const { error } = await supabase
        .from("projects")
        .update({
          name: name.trim(),
          description: description.trim() || null,
          priority,
          start_date: startDate || null,
          end_date: endDate || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", project.id)

      if (error) throw error

      toast({
        title: "Project Updated",
        description: `"${name}" has been updated successfully.`,
      })

      setOpen(false)
      router.refresh()
    } catch (error: any) {
      console.error("Update error:", error)
      toast({
        title: "Update Failed",
        description: getUniqueNameErrorMessage(error, "project"),
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!isControlled && (asMenuItem ? (
        <DialogTrigger className="flex items-center w-full px-2 py-1.5 hover:bg-accent rounded-sm cursor-pointer text-left">
          <Pencil className="h-4 w-4 mr-2" />
          <span>Edit Project</span>
        </DialogTrigger>
      ) : !isControlled ? (
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Pencil className="h-4 w-4 mr-2" />
            Edit
          </Button>
        </DialogTrigger>
      ) : null)}
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto" onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle>Edit Project</DialogTitle>
          <DialogDescription>
            Update project details and settings
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => {
          e.preventDefault()
          handleSave()
        }} className="space-y-4 py-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">
              Project Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Cancer Drug Discovery Initiative"
              disabled={isSaving}
              required
            />
          </div>

          {/* Priority */}
          <div className="space-y-2">
            <Label htmlFor="priority">Priority</Label>
            <Select value={priority} onValueChange={setPriority} disabled={isSaving}>
              <SelectTrigger id="priority">
                <SelectValue placeholder="Select priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
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
              <Label htmlFor="end_date">Target End Date</Label>
              <Input
                id="end_date"
                type="date"
                min={startDate || undefined}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={isSaving}
              />
            </div>
          </div>

          {hasInvalidDateOrder && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {DATE_ORDER_ERROR} Please select a later date than the start date.
            </div>
          )}

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <TextareaWithWordCount
              id="description"
              value={description}
              onChange={setDescription}
              placeholder="Detailed description of the project goals and objectives..."
              rows={4}
              disabled={isSaving}
              maxWords={1000}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isSaving}
            >
            Cancel
          </Button>
            <Button type="submit" disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
