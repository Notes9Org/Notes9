"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuGroup,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"
import { 
  MoreHorizontal, 
  Pencil, 
  Copy, 
  Trash2, 
  CheckCircle2, 
  Pause, 
  Play, 
  Ban, 
  Loader2, 
  ChevronDown,
  FileText
} from "lucide-react"
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
  const { toast } = useToast()
  const router = useRouter()
  const supabase = createClient()

  const [isUpdating, setIsUpdating] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [targetStatus, setTargetStatus] = useState<string | null>(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false)

  const handleStatusUpdate = async (newStatus: string) => {
    setIsUpdating(true)

    try {
      const { error } = await supabase
        .from("experiments")
        .update({
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", experiment.id)

      if (error) throw error

      const statusMessages: Record<string, string> = {
        in_progress: "Experiment resumed successfully",
        planned: "Experiment paused (moved to planning)",
        completed: "Experiment marked as complete",
        cancelled: "Experiment cancelled",
        data_ready: "Experiment marked as data ready",
        analyzed: "Experiment marked as analyzed",
      }

      toast({
        title: "Status Updated",
        description: statusMessages[newStatus] || "Experiment status updated",
      })

      router.refresh()
      setDialogOpen(false)
      setDropdownOpen(false)
      window.location.reload()
    } catch (error: any) {
      console.error("Update error:", error)
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update status",
        variant: "destructive",
      })
    } finally {
      setIsUpdating(false)
      setDialogOpen(false)
    }
  }

  const openConfirmDialog = (status: string) => {
    setTargetStatus(status)
    setDialogOpen(true)
  }

  // Get available status actions based on current status
  const getStatusActions = () => {
    const actions: { status: string; label: string; icon: React.ReactNode; variant?: "default" | "destructive" }[] = []
    
    if (experiment.status === "in_progress") {
      actions.push(
        { status: "completed", label: "Mark as Complete", icon: <CheckCircle2 className="h-4 w-4 mr-2" />, variant: "default" },
        { status: "planned", label: "Pause Experiment", icon: <Pause className="h-4 w-4 mr-2" /> },
        { status: "data_ready", label: "Mark Data Ready", icon: <FileText className="h-4 w-4 mr-2" /> },
      )
    } else if (experiment.status === "planned") {
      actions.push(
        { status: "in_progress", label: "Start Experiment", icon: <Play className="h-4 w-4 mr-2" />, variant: "default" },
      )
    } else if (experiment.status === "data_ready") {
      actions.push(
        { status: "analyzed", label: "Mark as Analyzed", icon: <CheckCircle2 className="h-4 w-4 mr-2" />, variant: "default" },
        { status: "in_progress", label: "Resume Experiment", icon: <Play className="h-4 w-4 mr-2" /> },
      )
    } else if (experiment.status === "analyzed") {
      actions.push(
        { status: "completed", label: "Mark as Complete", icon: <CheckCircle2 className="h-4 w-4 mr-2" />, variant: "default" },
        { status: "in_progress", label: "Resume Experiment", icon: <Play className="h-4 w-4 mr-2" /> },
      )
    }
    
    // Always allow cancel (except if already cancelled or completed)
    if (experiment.status !== "cancelled" && experiment.status !== "completed") {
      actions.push({ status: "cancelled", label: "Cancel Experiment", icon: <Ban className="h-4 w-4 mr-2" />, variant: "destructive" })
    }
    
    return actions
  }

  const statusActions = getStatusActions()
  const primaryAction = statusActions.find(a => a.variant !== "destructive")

  const statusConfig: Record<string, { label: string; description: string }> = {
    completed: {
      label: "Mark as Complete",
      description: "This will mark the experiment as completed. You can still edit and view the experiment later.",
    },
    planned: {
      label: "Pause Experiment",
      description: "This will pause the experiment and move it back to planning status.",
    },
    in_progress: {
      label: "Resume Experiment",
      description: "This will resume the experiment and mark it as in progress.",
    },
    cancelled: {
      label: "Cancel Experiment",
      description: "This will cancel the experiment. This action can be reversed by editing the experiment.",
    },
    data_ready: {
      label: "Mark Data Ready",
      description: "This will mark the experiment as having data ready for analysis.",
    },
    analyzed: {
      label: "Mark as Analyzed",
      description: "This will mark the experiment as analyzed and ready for reporting.",
    },
  }

  return (
    <>
      <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
        <DropdownMenuTrigger asChild>
          <Button 
            variant={primaryAction ? "default" : "outline"} 
            size="sm"
            disabled={isUpdating}
          >
            {isUpdating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              primaryAction?.icon || <MoreHorizontal className="h-4 w-4 mr-2" />
            )}
            {primaryAction?.label || "Actions"}
            <ChevronDown className="h-3 w-3 ml-2" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {/* Status Actions Group */}
          {statusActions.length > 0 && (
            <>
              <DropdownMenuLabel>Status</DropdownMenuLabel>
              {statusActions.map((action) => (
                <DropdownMenuItem
                  key={action.status}
                  onClick={() => openConfirmDialog(action.status)}
                  className={action.variant === "destructive" ? "text-destructive focus:text-destructive" : ""}
                >
                  {action.icon}
                  {action.label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
            </>
          )}

          {/* Management Actions Group */}
          <DropdownMenuLabel>Management</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => { setEditDialogOpen(true); setDropdownOpen(false); }}>
            <Pencil className="h-4 w-4 mr-2" />
            Edit Experiment
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => { setDuplicateDialogOpen(true); setDropdownOpen(false); }}>
            <Copy className="h-4 w-4 mr-2" />
            Duplicate
          </DropdownMenuItem>
          
          <DropdownMenuSeparator />
          
          <DropdownMenuItem 
            onClick={() => { setDeleteDialogOpen(true); setDropdownOpen(false); }}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Status Confirmation Dialog */}
      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {targetStatus && statusConfig[targetStatus]?.label}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {targetStatus && statusConfig[targetStatus]?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isUpdating}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => targetStatus && handleStatusUpdate(targetStatus)}
              disabled={isUpdating}
            >
              {isUpdating ? "Updating..." : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
