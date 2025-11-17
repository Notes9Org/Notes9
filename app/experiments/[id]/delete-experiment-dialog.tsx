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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"
import { Trash2, Loader2, AlertTriangle } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface DeleteExperimentDialogProps {
  experimentId: string
  experimentName: string
  asMenuItem?: boolean
}

export function DeleteExperimentDialog({ experimentId, experimentName, asMenuItem = false }: DeleteExperimentDialogProps) {
  const { toast } = useToast()
  const router = useRouter()
  const supabase = createClient()

  const [open, setOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    setIsDeleting(true)

    try {
      const { error } = await supabase
        .from("experiments")
        .delete()
        .eq("id", experimentId)

      if (error) throw error

      toast({
        title: "Experiment Deleted",
        description: `"${experimentName}" and all related data have been permanently deleted.`,
      })

      // Redirect to experiments list
      router.push("/experiments")
      router.refresh()
    } catch (error: any) {
      console.error("Delete error:", error)
      toast({
        title: "Delete Failed",
        description: error.message || "Failed to delete experiment",
        variant: "destructive",
      })
      setIsDeleting(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      {asMenuItem ? (
        <AlertDialogTrigger className="flex items-center w-full px-2 py-1.5 text-destructive hover:bg-accent rounded-sm cursor-pointer text-left">
          <Trash2 className="h-4 w-4 mr-2" />
          <span>Delete</span>
        </AlertDialogTrigger>
      ) : (
        <AlertDialogTrigger asChild>
          <Button variant="destructive" size="sm">
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
        </AlertDialogTrigger>
      )}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Delete Experiment?
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-3 pt-2">
            <p>
              You are about to permanently delete <strong className="text-foreground">"{experimentName}"</strong>.
            </p>
            
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>Warning:</strong> This will also delete:
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>All lab notes</li>
                  <li>All uploaded data files (from storage)</li>
                  <li>All quality control records</li>
                  <li>All associated samples</li>
                  <li>Equipment usage logs</li>
                </ul>
              </AlertDescription>
            </Alert>

            <p className="text-sm">
              <strong className="text-foreground">This action cannot be undone.</strong> All experiment data will be permanently removed.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isDeleting}
            className="bg-destructive hover:bg-destructive/90"
          >
            {isDeleting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Permanently
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

