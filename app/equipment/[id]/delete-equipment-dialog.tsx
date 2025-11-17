"use client"

import { useState } from "react"
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

export function DeleteEquipmentDialog({
  equipmentId,
  equipmentName,
}: {
  equipmentId: string
  equipmentName: string
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const handleDelete = async () => {
    setIsLoading(true)

    try {
      const supabase = createClient()

      // Check if equipment has usage history
      const { count: usageCount } = await supabase
        .from("equipment_usage")
        .select("*", { count: "exact", head: true })
        .eq("equipment_id", equipmentId)

      // Check if equipment has maintenance records
      const { count: maintenanceCount } = await supabase
        .from("equipment_maintenance")
        .select("*", { count: "exact", head: true })
        .eq("equipment_id", equipmentId)

      if ((usageCount || 0) > 0 || (maintenanceCount || 0) > 0) {
        toast({
          title: "Cannot delete equipment",
          description: "This equipment has usage or maintenance records. Consider marking it as offline instead.",
          variant: "destructive",
        })
        setIsLoading(false)
        return
      }

      const { error } = await supabase
        .from("equipment")
        .delete()
        .eq("id", equipmentId)

      if (error) throw error

      toast({
        title: "Equipment deleted",
        description: `Equipment "${equipmentName}" has been deleted successfully.`,
      })

      router.push("/equipment")
      
      setTimeout(() => {
        window.location.href = "/equipment"
      }, 500)
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      })
      setIsLoading(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Trash2 className="h-4 w-4 mr-2" />
          Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Are you sure?
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <p>
              This will permanently delete <strong>"{equipmentName}"</strong>.
            </p>
            <p className="text-warning font-medium">
              Note: Equipment with usage or maintenance records cannot be deleted.
              Consider marking it as offline instead.
            </p>
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
            {isLoading ? "Deleting..." : "Delete Equipment"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

