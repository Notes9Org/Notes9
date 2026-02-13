"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Pencil, Copy, Trash2 } from "lucide-react"
import { EditExperimentDialog } from "./edit-experiment-dialog"
import { DeleteExperimentDialog } from "./delete-experiment-dialog"
import { DuplicateExperimentDialog } from "./duplicate-experiment-dialog"

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

interface ExperimentActionsProps {
  experiment: Experiment
  projects: Array<{ id: string; name: string }>
  users: Array<{ id: string; first_name: string; last_name: string }>
}

export function ExperimentActions({ experiment, projects, users }: ExperimentActionsProps) {
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false)

  return (
    <>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={() => setEditDialogOpen(true)}
          aria-label="Edit experiment"
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={() => setDuplicateDialogOpen(true)}
          aria-label="Duplicate experiment"
        >
          <Copy className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive hover:text-destructive"
          onClick={() => setDeleteDialogOpen(true)}
          aria-label="Delete experiment"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Edit Dialog */}
      <EditExperimentDialog 
        experiment={experiment} 
        projects={projects} 
        users={users} 
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
      />

      {/* Duplicate Dialog */}
      <DuplicateExperimentDialog 
        experiment={experiment} 
        open={duplicateDialogOpen}
        onOpenChange={setDuplicateDialogOpen}
      />

      {/* Delete Dialog */}
      <DeleteExperimentDialog 
        experimentId={experiment.id} 
        experimentName={experiment.name}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
      />
    </>
  )
}
