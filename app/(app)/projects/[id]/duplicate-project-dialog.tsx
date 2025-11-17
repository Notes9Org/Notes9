"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"
import { Copy, Loader2 } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"

interface Project {
  id: string
  name: string
  description: string | null
  status: string
  priority: string | null
  start_date: string | null
  end_date: string | null
}

interface DuplicateProjectDialogProps {
  project: Project
  asMenuItem?: boolean
}

export function DuplicateProjectDialog({ project, asMenuItem = false }: DuplicateProjectDialogProps) {
  const { toast } = useToast()
  const router = useRouter()
  const supabase = createClient()

  const [open, setOpen] = useState(false)
  const [isDuplicating, setIsDuplicating] = useState(false)
  const [newName, setNewName] = useState(`${project.name} (Copy)`)
  const [includeMembers, setIncludeMembers] = useState(true)

  const handleDuplicate = async () => {
    if (!newName.trim()) {
      toast({
        title: "Validation Error",
        description: "Project name is required.",
        variant: "destructive",
      })
      return
    }

    setIsDuplicating(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Not authenticated")

      // Get user's organization
      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", user.id)
        .single()

      if (!profile) throw new Error("Profile not found")

      // Create duplicate project
      const { data: newProject, error: projectError } = await supabase
        .from("projects")
        .insert({
          name: newName.trim(),
          description: project.description,
          status: "planning", // Reset to planning
          priority: project.priority,
          start_date: null, // Reset dates
          end_date: null,
          organization_id: profile.organization_id,
          created_by: user.id,
        })
        .select()
        .single()

      if (projectError) throw projectError

      // Copy team members if requested
      if (includeMembers) {
        const { data: members } = await supabase
          .from("project_members")
          .select("user_id, role")
          .eq("project_id", project.id)

        if (members && members.length > 0) {
          const newMembers = members.map(member => ({
            project_id: newProject.id,
            user_id: member.user_id,
            role: member.role,
          }))

          await supabase.from("project_members").insert(newMembers)
        }
      }

      toast({
        title: "Project Duplicated",
        description: `"${newName}" has been created successfully.`,
      })

      setOpen(false)
      // Navigate to the new project
      router.push(`/projects/${newProject.id}`)
      router.refresh()
    } catch (error: any) {
      console.error("Duplicate error:", error)
      toast({
        title: "Duplication Failed",
        description: error.message || "Failed to duplicate project",
        variant: "destructive",
      })
    } finally {
      setIsDuplicating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {asMenuItem ? (
        <DialogTrigger className="flex items-center w-full px-2 py-1.5 hover:bg-accent rounded-sm cursor-pointer text-left">
          <Copy className="h-4 w-4 mr-2" />
          <span>Duplicate</span>
        </DialogTrigger>
      ) : (
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Copy className="h-4 w-4 mr-2" />
            Duplicate
          </Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Duplicate Project</DialogTitle>
          <DialogDescription>
            Create a copy of "{project.name}" with a new name
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="newName">
              New Project Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="newName"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Enter new project name"
              disabled={isDuplicating}
              required
            />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="includeMembers"
              checked={includeMembers}
              onCheckedChange={(checked) => setIncludeMembers(checked as boolean)}
              disabled={isDuplicating}
            />
            <label
              htmlFor="includeMembers"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Copy team members
            </label>
          </div>

          <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
            <p className="font-medium mb-1">What will be copied:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Project description</li>
              <li>Priority level</li>
              {includeMembers && <li>Team members</li>}
            </ul>
            <p className="font-medium mt-2 mb-1">What won't be copied:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Experiments</li>
              <li>Lab notes and reports</li>
              <li>Start/end dates (will be reset)</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isDuplicating}>
            Cancel
          </Button>
          <Button onClick={handleDuplicate} disabled={isDuplicating}>
            {isDuplicating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Duplicating...
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 mr-2" />
                Create Copy
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

