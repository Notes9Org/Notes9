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
import { CheckCircle2, Pause, Play, Ban, Loader2 } from "lucide-react"

interface StatusUpdateButtonsProps {
  experimentId: string
  currentStatus: string
}

export function StatusUpdateButtons({ experimentId, currentStatus }: StatusUpdateButtonsProps) {
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
        .from("experiments")
        .update({
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", experimentId)

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
    completed: {
      label: "Mark as Complete",
      description: "This will mark the experiment as completed. You can still edit and view the experiment later.",
      icon: <CheckCircle2 className="h-4 w-4 mr-2" />,
    },
    planned: {
      label: "Pause Experiment",
      description: "This will pause the experiment and move it back to planning status.",
      icon: <Pause className="h-4 w-4 mr-2" />,
    },
    in_progress: {
      label: "Resume Experiment",
      description: "This will resume the experiment and mark it as in progress.",
      icon: <Play className="h-4 w-4 mr-2" />,
    },
    cancelled: {
      label: "Cancel Experiment",
      description: "This will cancel the experiment. This action can be reversed by editing the experiment.",
      icon: <Ban className="h-4 w-4 mr-2" />,
    },
    data_ready: {
      label: "Mark Data Ready",
      description: "This will mark the experiment as having data ready for analysis.",
      icon: <CheckCircle2 className="h-4 w-4 mr-2" />,
    },
    analyzed: {
      label: "Mark as Analyzed",
      description: "This will mark the experiment as analyzed and ready for reporting.",
      icon: <CheckCircle2 className="h-4 w-4 mr-2" />,
    },
  }

  return (
    <>
      {/* Show buttons based on current status */}
      {currentStatus === "in_progress" && (
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={() => openConfirmDialog("planned")}
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

      {currentStatus === "planned" && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => openConfirmDialog("in_progress")}
          disabled={isUpdating}
        >
          {isUpdating ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Play className="h-4 w-4 mr-2" />
          )}
          Start
        </Button>
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

