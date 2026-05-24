"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Loader2 } from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"

type Role = "lead" | "researcher" | "viewer"

interface AddMemberDialogProps {
  projectId: string
  /** Existing member user_ids — used to short-circuit duplicate adds. */
  existingMemberIds?: string[]
}

/**
 * Add a registered user to this project as a member. The MVP looks the email
 * up in the `profiles` table; if the user already has a Notes9 account they
 * are linked immediately. If they don't, we surface a clear message so the
 * inviter knows to ask them to sign up first (full email-invite flow with
 * pending records is a follow-up — out of scope here).
 */
export function AddMemberDialog({ projectId, existingMemberIds = [] }: AddMemberDialogProps) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<Role>("researcher")
  const [submitting, setSubmitting] = useState(false)
  const router = useRouter()

  const reset = () => {
    setEmail("")
    setRole("researcher")
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const normalized = email.trim().toLowerCase()
    if (!normalized) {
      toast.error("Enter an email address")
      return
    }
    setSubmitting(true)
    try {
      const supabase = createClient()
      const { data: profile, error: lookupError } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .eq("email", normalized)
        .maybeSingle()
      if (lookupError) throw lookupError
      if (!profile) {
        toast.error("No Notes9 account with that email", {
          description:
            "Ask them to sign up at notes9.com first — invite tokens for unregistered users are not supported yet.",
        })
        return
      }
      if (existingMemberIds.includes(profile.id)) {
        toast.error(
          `${profile.first_name ?? "That user"} is already a member of this project.`,
        )
        return
      }
      const { error: insertError } = await supabase.from("project_members").insert({
        project_id: projectId,
        user_id: profile.id,
        role,
      })
      if (insertError) throw insertError
      toast.success(
        `Added ${profile.first_name ?? normalized} as ${role}`,
      )
      reset()
      setOpen(false)
      router.refresh()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to add member"
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button className="w-full sm:w-auto">
          <Plus className="h-4 w-4 mr-2" />
          Add Member
        </Button>
      </DialogTrigger>
      <DialogContent dialogSize="sm">
        <DialogHeader>
          <DialogTitle>Add team member</DialogTitle>
          <DialogDescription>
            Link an existing Notes9 user to this project. They&apos;ll get access on
            their next sign-in.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="member-email">Email</Label>
            <Input
              id="member-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="researcher@lab.edu"
              autoComplete="email"
              autoFocus
              required
              disabled={submitting}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="member-role">Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)} disabled={submitting}>
              <SelectTrigger id="member-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lead">Lead</SelectItem>
                <SelectItem value="researcher">Researcher</SelectItem>
                <SelectItem value="viewer">Viewer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                reset()
                setOpen(false)
              }}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !email.trim()}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Adding…
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Add to project
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
