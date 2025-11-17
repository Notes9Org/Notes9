"use client"

import { EditExperimentDialog } from "./edit-experiment-dialog"
import { DeleteExperimentDialog } from "./delete-experiment-dialog"
import { DuplicateExperimentDialog } from "./duplicate-experiment-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { MoreHorizontal } from "lucide-react"

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
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <MoreHorizontal className="h-4 w-4" />
          <span className="ml-2 hidden md:inline">Actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
          <EditExperimentDialog experiment={experiment} projects={projects} users={users} asMenuItem />
        </DropdownMenuItem>
        
        <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
          <DuplicateExperimentDialog experiment={experiment} asMenuItem />
        </DropdownMenuItem>
        
        <DropdownMenuSeparator />
        
        <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
          <DeleteExperimentDialog experimentId={experiment.id} experimentName={experiment.name} asMenuItem />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
