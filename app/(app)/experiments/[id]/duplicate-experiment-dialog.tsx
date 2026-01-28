"use client"

import { useState } from "react"
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
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"
import { Copy, Loader2 } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"

interface Experiment {
  id: string
  name: string
  description: string | null
  hypothesis: string | null
  project_id: string
  assigned_to: string | null
}

interface DuplicateExperimentDialogProps {
  experiment: Experiment
  asMenuItem?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function DuplicateExperimentDialog({ 
  experiment, 
  asMenuItem = false,
  open: externalOpen,
  onOpenChange
}: DuplicateExperimentDialogProps) {
  const { toast } = useToast()
  const router = useRouter()
  const supabase = createClient()

  const [internalOpen, setInternalOpen] = useState(false)
  const open = externalOpen !== undefined ? externalOpen : internalOpen
  const setOpen = (value: boolean) => {
    setInternalOpen(value)
    onOpenChange?.(value)
  }
  const [isDuplicating, setIsDuplicating] = useState(false)
  const [newName, setNewName] = useState(`${experiment.name} (Copy)`)
  const [includeProtocols, setIncludeProtocols] = useState(true)

  const handleDuplicate = async () => {
    if (!newName.trim()) {
      toast({
        title: "Validation Error",
        description: "Experiment name is required.",
        variant: "destructive",
      })
      return
    }

    setIsDuplicating(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Not authenticated")

      // Create duplicate experiment
      const { data: newExperiment, error: experimentError } = await supabase
        .from("experiments")
        .insert({
          name: newName.trim(),
          description: experiment.description,
          hypothesis: experiment.hypothesis,
          status: "planned", // Reset to planned
          project_id: experiment.project_id,
          assigned_to: experiment.assigned_to,
          start_date: null, // Reset dates
          completion_date: null,
          created_by: user.id,
        })
        .select()
        .single()

      if (experimentError) throw experimentError

      // Copy protocol associations if requested
      if (includeProtocols) {
        const { data: protocols } = await supabase
          .from("experiment_protocols")
          .select("protocol_id")
          .eq("experiment_id", experiment.id)

        if (protocols && protocols.length > 0) {
          const newProtocols = protocols.map(p => ({
            experiment_id: newExperiment.id,
            protocol_id: p.protocol_id,
          }))

          await supabase.from("experiment_protocols").insert(newProtocols)
        }
      }

      toast({
        title: "Experiment Duplicated",
        description: `"${newName}" has been created successfully.`,
      })

      setOpen(false)
      // Navigate to the new experiment
      router.push(`/experiments/${newExperiment.id}`)
      router.refresh()
    } catch (error: any) {
      console.error("Duplicate error:", error)
      toast({
        title: "Duplication Failed",
        description: error.message || "Failed to duplicate experiment",
        variant: "destructive",
      })
    } finally {
      setIsDuplicating(false)
    }
  }

  // When externally controlled, don't render the trigger
  const isExternallyControlled = externalOpen !== undefined

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!isExternallyControlled && (
        asMenuItem ? (
          <DialogTrigger className="flex items-center w-full px-2 py-1.5 hover:bg-accent rounded-sm cursor-pointer text-left">
            <Copy className="h-4 w-4 mr-2" />
            <span>Duplicate</span>
          </DialogTrigger>
        ) : (
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Copy className="h-4 w-4 mr-2" />
              Duplicate
            </Button>
          </DialogTrigger>
        )
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Duplicate Experiment</DialogTitle>
          <DialogDescription>
            Create a copy of "{experiment.name}" with a new name
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="newName">
              New Experiment Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="newName"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Enter new experiment name"
              disabled={isDuplicating}
              required
            />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="includeProtocols"
              checked={includeProtocols}
              onCheckedChange={(checked) => setIncludeProtocols(checked as boolean)}
              disabled={isDuplicating}
            />
            <label
              htmlFor="includeProtocols"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Copy protocol associations
            </label>
          </div>

          <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
            <p className="font-medium mb-1">What will be copied:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Description & hypothesis</li>
              <li>Project assignment</li>
              <li>Researcher assignment</li>
              {includeProtocols && <li>Protocol associations</li>}
            </ul>
            <p className="font-medium mt-2 mb-1">What won't be copied:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Lab notes</li>
              <li>Data files</li>
              <li>Samples</li>
              <li>Quality control records</li>
              <li>Start/completion dates (will be reset)</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isDuplicating}>
            Cancel
          </Button>
          <Button onClick={handleDuplicate} disabled={isDuplicating}>
            {isDuplicating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Duplicating...
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 mr-2" />
                Create Copy
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
