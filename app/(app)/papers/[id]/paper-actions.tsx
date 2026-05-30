"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { MoreHorizontal, FileCheck, FileEdit, FileDown } from "lucide-react"
import { toast } from "sonner"

interface PaperActionsProps {
  paper: {
    id: string
    title: string
    status: string
  }
  /** After successful delete or status update (e.g. refresh hub tabs). */
  onAfterMutation?: () => void
}

export function PaperActions({ paper, onAfterMutation }: PaperActionsProps) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [deleteOpen, setDeleteOpen] = useState(false)

  const updateStatus = async (status: string) => {
    const { error } = await supabase
      .from("papers")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", paper.id)

    if (error) {
      toast.error("Failed to update status")
      return
    }
    toast.success(`Status updated to ${status.replace("_", " ")}`)
    onAfterMutation?.()
    router.refresh()
  }

  const exportToWord = async () => {
    // Placeholder for export logic
    toast.info("Exporting to Word...")
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
          <DropdownMenuItem onClick={exportToWord}>
            <FileDown className="h-4 w-4 mr-2" />
            Export to Word
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

    </>
  )
}
