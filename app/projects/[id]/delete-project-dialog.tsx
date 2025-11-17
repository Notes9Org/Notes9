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

interface DeleteProjectDialogProps {
  projectId: string
  projectName: string
  experimentCount?: number
  asMenuItem?: boolean
}

export function DeleteProjectDialog({ projectId, projectName, experimentCount = 0, asMenuItem = false }: DeleteProjectDialogProps) {
  const { toast } = useToast()
  const router = useRouter()
  const supabase = createClient()

  const [open, setOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    setIsDeleting(true)

    try {
      const { error } = await supabase
        .from("projects")
        .delete()
        .eq("id", projectId)

      if (error) throw error

      toast({
        title: "Project Deleted",
        description: `"${projectName}" and all related data have been permanently deleted.`,
      })

      // Redirect to projects list
      router.push("/projects")
      router.refresh()
    } catch (error: any) {
      console.error("Delete error:", error)
      toast({
        title: "Delete Failed",
        description: error.message || "Failed to delete project",
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
            Delete Project?
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-3 pt-2">
            <p>
              You are about to permanently delete <strong className="text-foreground">"{projectName}"</strong>.
            </p>
            
            {experimentCount > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Warning:</strong> This will also delete:
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>{experimentCount} experiment{experimentCount > 1 ? 's' : ''}</li>
                    <li>All lab notes and reports</li>
                    <li>All uploaded data files</li>
                    <li>All project members associations</li>
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            <p className="text-sm">
              <strong className="text-foreground">This action cannot be undone.</strong> All data will be permanently removed from the database.
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

