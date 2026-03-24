"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
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
import { MoreHorizontal, Trash2, FileCheck, FileEdit } from "lucide-react"
import { toast } from "sonner"
import { IS_PAPERS_MOCKED, updateMockPaper, deleteMockPaper } from "@/lib/papers-mock"

interface PaperActionsProps {
  paper: {
    id: string
    title: string
    status: string
  }
}

export function PaperActions({ paper }: PaperActionsProps) {
  const router = useRouter()
  const [deleteOpen, setDeleteOpen] = useState(false)

  const updateStatus = async (status: string) => {
    if (IS_PAPERS_MOCKED) {
      updateMockPaper(paper.id, { status })
      toast.success(`Status updated to ${status.replace("_", " ")}`)
      router.refresh()
      return
    }

    const supabase = createClient()
    const { error } = await supabase
      .from("papers")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", paper.id)

    if (error) {
      toast.error("Failed to update status")
      return
    }
    toast.success(`Status updated to ${status.replace("_", " ")}`)
    router.refresh()
  }

  const handleDelete = async () => {
    if (IS_PAPERS_MOCKED) {
      deleteMockPaper(paper.id)
      toast.success("Paper deleted")
      router.push("/papers")
      return
    }

    const supabase = createClient()
    const { error } = await supabase
      .from("papers")
      .delete()
      .eq("id", paper.id)

    if (error) {
      toast.error("Failed to delete paper")
      return
    }
    toast.success("Paper deleted")
    router.push("/papers")
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {paper.status !== "draft" && (
            <DropdownMenuItem onClick={() => updateStatus("draft")}>
              <FileEdit className="h-4 w-4 mr-2" />
              Move to Draft
            </DropdownMenuItem>
          )}
          {paper.status !== "in_review" && (
            <DropdownMenuItem onClick={() => updateStatus("in_review")}>
              <FileCheck className="h-4 w-4 mr-2" />
              Mark as In Review
            </DropdownMenuItem>
          )}
          {paper.status !== "published" && (
            <DropdownMenuItem onClick={() => updateStatus("published")}>
              <FileCheck className="h-4 w-4 mr-2" />
              Mark as Published
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete paper?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &quot;{paper.title}&quot;. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
