"use client"

import { EditProjectDialog } from "./edit-project-dialog"
import { DeleteProjectDialog } from "./delete-project-dialog"
import { DuplicateProjectDialog } from "./duplicate-project-dialog"
import { ProjectStatusUpdateButtons } from "./project-status-update-buttons"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { MoreHorizontal, Pencil, Copy, Trash2 } from "lucide-react"

interface Project {
  id: string
  name: string
  description: string | null
  status: string
  priority: string | null
  start_date: string | null
  end_date: string | null
}

interface ProjectActionsProps {
  project: Project
  experimentCount?: number
}

export function ProjectActions({ project, experimentCount = 0 }: ProjectActionsProps) {
  return (
    <div className="flex items-center gap-2">
      {/* Status Update Buttons - Primary Actions */}
      <div className="hidden sm:flex gap-2">
        <ProjectStatusUpdateButtons projectId={project.id} currentStatus={project.status} />
      </div>

      {/* More Actions Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <MoreHorizontal className="h-4 w-4" />
            <span className="ml-2 hidden md:inline">More</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <div className="sm:hidden">
            <ProjectStatusUpdateButtons projectId={project.id} currentStatus={project.status} compact />
            <DropdownMenuSeparator />
          </div>
          
          <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
            <EditProjectDialog project={project} asMenuItem />
          </DropdownMenuItem>
          
          <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
            <DuplicateProjectDialog project={project} asMenuItem />
          </DropdownMenuItem>
          
          <DropdownMenuSeparator />
          
          <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
            <DeleteProjectDialog 
              projectId={project.id} 
              projectName={project.name} 
              experimentCount={experimentCount}
              asMenuItem
            />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
