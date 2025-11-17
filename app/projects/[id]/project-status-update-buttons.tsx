"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
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
import { CheckCircle2, Pause, Play, Archive, Loader2 } from "lucide-react"

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

      router.refresh()
      setDialogOpen(false)
      
      // Use hard reload to ensure fresh data
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

  const statusConfig: Record<
    string,
    { label: string; description: string; icon: React.ReactNode }
  > = {
    active: {
      label: "Activate Project",
      description: "This will mark the project as active and visible in active projects list.",
      icon: <Play className="h-4 w-4 mr-2" />,
    },
    planning: {
      label: "Move to Planning",
      description: "This will move the project back to planning status.",
      icon: <Pause className="h-4 w-4 mr-2" />,
    },
    completed: {
      label: "Mark as Complete",
      description: "This will mark the project as completed. You can still edit it later.",
      icon: <CheckCircle2 className="h-4 w-4 mr-2" />,
    },
    archived: {
      label: "Archive Project",
      description: "This will archive the project. It will be hidden from main lists but not deleted.",
      icon: <Archive className="h-4 w-4 mr-2" />,
    },
    on_hold: {
      label: "Put On Hold",
      description: "This will pause the project temporarily.",
      icon: <Pause className="h-4 w-4 mr-2" />,
    },
  }

  return (
    <>
      {/* Show buttons based on current status */}
      {compact ? (
        // Compact mode for mobile dropdown
        <div className="flex flex-col gap-1 w-full">
          {currentStatus === "planning" && (
            <div onClick={() => openConfirmDialog("active")} className="flex items-center px-2 py-1.5 cursor-pointer hover:bg-accent">
              <Play className="h-4 w-4 mr-2" />
              <span>Activate</span>
            </div>
          )}
          {currentStatus === "active" && (
            <>
              <div onClick={() => openConfirmDialog("on_hold")} className="flex items-center px-2 py-1.5 cursor-pointer hover:bg-accent">
                <Pause className="h-4 w-4 mr-2" />
                <span>Pause</span>
              </div>
              <div onClick={() => openConfirmDialog("completed")} className="flex items-center px-2 py-1.5 cursor-pointer hover:bg-accent">
                <CheckCircle2 className="h-4 w-4 mr-2" />
                <span>Complete</span>
              </div>
            </>
          )}
          {currentStatus === "on_hold" && (
            <div onClick={() => openConfirmDialog("active")} className="flex items-center px-2 py-1.5 cursor-pointer hover:bg-accent">
              <Play className="h-4 w-4 mr-2" />
              <span>Resume</span>
            </div>
          )}
          {currentStatus === "completed" && (
            <div onClick={() => openConfirmDialog("archived")} className="flex items-center px-2 py-1.5 cursor-pointer hover:bg-accent">
              <Archive className="h-4 w-4 mr-2" />
              <span>Archive</span>
            </div>
          )}
        </div>
      ) : (
        // Regular button mode for desktop
        <>
          {currentStatus === "planning" && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => openConfirmDialog("active")}
          disabled={isUpdating}
        >
          {isUpdating ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Play className="h-4 w-4 mr-2" />
          )}
          Activate
        </Button>
      )}

      {currentStatus === "active" && (
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={() => openConfirmDialog("on_hold")}
            disabled={isUpdating}
          >
            {isUpdating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Pause className="h-4 w-4 mr-2" />
            )}
            Pause
          </Button>
          <Button
            size="sm"
            onClick={() => openConfirmDialog("completed")}
            disabled={isUpdating}
          >
            {isUpdating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4 mr-2" />
            )}
            Complete
          </Button>
        </>
      )}

      {currentStatus === "on_hold" && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => openConfirmDialog("active")}
          disabled={isUpdating}
        >
          {isUpdating ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Play className="h-4 w-4 mr-2" />
          )}
          Resume
        </Button>
      )}

      {currentStatus === "completed" && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => openConfirmDialog("archived")}
          disabled={isUpdating}
        >
          {isUpdating ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Archive className="h-4 w-4 mr-2" />
          )}
          Archive
        </Button>
      )}
        </>
      )}

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

