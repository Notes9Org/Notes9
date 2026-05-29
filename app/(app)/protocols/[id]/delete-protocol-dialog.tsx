"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
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
import { Trash2, AlertTriangle } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

export function DeleteProtocolDialog({
  protocolId,
  protocolName,
  usageCount,
}: {
  protocolId: string
  protocolName: string
  usageCount: number
}) {
  const router = useRouter()
  const { toast } = useToast()
  const supabase = useMemo(() => createClient(), [])
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const handleDelete = async () => {
    setIsLoading(true)

    try {
      const { error } = await supabase
        .from("protocols")
        .delete()
        .eq("id", protocolId)

      if (error) throw error

      toast({
        title: "Protocol deleted",
        description: `Protocol "${protocolName}" has been deleted successfully.`,
      })

      ;(() => { const pq = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("project") : null; router.push(pq ? "/protocols?project=" + pq : "/protocols"); })()
      router.refresh()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive" aria-label="Delete protocol">
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {usageCount > 0 && <AlertTriangle className="h-5 w-5 text-destructive" />}
            Are you sure?
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <p>
              This will permanently delete the protocol <strong>"{protocolName}"</strong>.
            </p>
            {usageCount > 0 && (
              <p className="text-destructive font-medium">
                Warning: This protocol is currently used in {usageCount} experiment{usageCount > 1 ? 's' : ''}.
                Deleting it will remove the protocol reference from those experiments.
              </p>
            )}
            <p>This action cannot be undone.</p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isLoading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isLoading ? "Deleting..." : "Delete Protocol"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

