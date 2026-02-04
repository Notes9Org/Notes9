"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
import { CheckCircle2, Pause, Play, Archive, Loader2, FileEdit, ChevronDown } from "lucide-react"

interface ProjectStatusUpdateButtonsProps {
  projectId: string
  currentStatus: string
  compact?: boolean
}

export function ProjectStatusUpdateButtons({ projectId, currentStatus, compact = false }: ProjectStatusUpdateButtonsProps) {
  const { toast } = useToast()
  const router = useRouter()
  const supabase = createClient()

  const [isUpdating, setIsUpdating] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [targetStatus, setTargetStatus] = useState<string | null>(null)

  const handleStatusUpdate = async (newStatus: string) => {
    setIsUpdating(true)

    try {
      const { error } = await supabase
        .from("projects")
        .update({
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", projectId)

      if (error) throw error

      const statusMessages: Record<string, string> = {
        active: "Project activated successfully",
        planning: "Project moved to planning",
        completed: "Project marked as complete",
        archived: "Project archived",
        on_hold: "Project paused",
      }

      toast({
        title: "Status Updated",
        description: statusMessages[newStatus] || "Project status updated",
      })

      setDialogOpen(false)
      router.refresh()
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
    if (status === currentStatus) return // Don't open dialog if selecting current status
    setTargetStatus(status)
    setDialogOpen(true)
  }

  const statusConfig: Record<
    string,
    { label: string; description: string; icon: React.ReactNode; displayName: string }
  > = {
    planning: {
      label: "Move to Planning",
      displayName: "Planning",
      description: "This will move the project back to planning status.",
      icon: <FileEdit className="h-4 w-4 mr-2" />,
    },
    active: {
      label: "Activate Project",
      displayName: "Active",
      description: "This will mark the project as active and visible in active projects list.",
      icon: <Play className="h-4 w-4 mr-2" />,
    },
    on_hold: {
      label: "Put On Hold",
      displayName: "On Hold",
      description: "This will pause the project temporarily.",
      icon: <Pause className="h-4 w-4 mr-2" />,
    },
    completed: {
      label: "Mark as Complete",
      displayName: "Completed",
      description: "This will mark the project as completed. You can still edit it later.",
      icon: <CheckCircle2 className="h-4 w-4 mr-2" />,
    },
    archived: {
      label: "Archive Project",
      displayName: "Archived",
      description: "This will archive the project. It will be hidden from main lists but not deleted.",
      icon: <Archive className="h-4 w-4 mr-2" />,
    },
  }

  const allStatuses = ["planning", "active", "on_hold", "completed", "archived"]

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={isUpdating}>
            {isUpdating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              statusConfig[currentStatus]?.icon
            )}
            <span className="capitalize">
              {isUpdating ? "Updating..." : statusConfig[currentStatus]?.displayName || currentStatus}
            </span>
            <ChevronDown className="h-4 w-4 ml-2" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel>Change Status</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {allStatuses.map((status) => (
            <DropdownMenuItem
              key={status}
              onClick={() => openConfirmDialog(status)}
              disabled={status === currentStatus}
              className={status === currentStatus ? "opacity-50" : ""}
            >
              {statusConfig[status]?.icon}
              <span className="capitalize">{statusConfig[status]?.displayName}</span>
              {status === currentStatus && (
                <span className="ml-auto text-xs text-muted-foreground">Current</span>
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Confirmation Dialog */}
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
    </>
  )
}
