"use client"

import { useState } from "react"
import { Send } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { useToast } from "@/hooks/use-toast"

export interface InviteRole {
  id: string
  name: string
}

interface InviteDialogProps {
  roles: InviteRole[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onInvitesSent: () => void
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function parseEmails(input: string): string[] {
  return input
    .split(/[,\n]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0)
}

function validateEmails(emails: string[]): { valid: string[]; invalid: string[] } {
  const valid: string[] = []
  const invalid: string[] = []
  const seen = new Set<string>()

  for (const email of emails) {
    if (seen.has(email)) continue
    seen.add(email)
    if (EMAIL_REGEX.test(email)) {
      valid.push(email)
    } else {
      invalid.push(email)
    }
  }

  return { valid, invalid }
}

export function InviteDialog({
  roles,
  open,
  onOpenChange,
  onInvitesSent,
}: InviteDialogProps) {
  const { toast } = useToast()
  const [emailInput, setEmailInput] = useState("")
  const [emailError, setEmailError] = useState("")
  const [selectedRoleId, setSelectedRoleId] = useState("")
  const [roleError, setRoleError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  function resetForm() {
    setEmailInput("")
    setEmailError("")
    setSelectedRoleId("")
    setRoleError("")
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) resetForm()
    onOpenChange(nextOpen)
  }

  async function handleSubmit() {
    setEmailError("")
    setRoleError("")

    // Validate emails
    const parsed = parseEmails(emailInput)
    if (parsed.length === 0) {
      setEmailError("Please enter at least one email address")
      return
    }

    const { valid, invalid } = validateEmails(parsed)
    if (invalid.length > 0) {
      setEmailError(`Invalid email${invalid.length > 1 ? "s" : ""}: ${invalid.join(", ")}`)
      return
    }

    // Validate role selection
    if (!selectedRoleId) {
      setRoleError("Please select a role")
      return
    }

    setIsSubmitting(true)

    try {
      const res = await fetch("/api/org/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails: valid, roleId: selectedRoleId }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        const message = data?.error || "Failed to send invitations"
        toast({ title: "Error", description: message, variant: "destructive" })
        return
      }

      toast({
        title: "Invitations sent",
        description: `${valid.length} invitation${valid.length !== 1 ? "s" : ""} created successfully.`,
      })
      handleOpenChange(false)
      onInvitesSent()
    } catch {
      toast({
        title: "Error",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite Members</DialogTitle>
          <DialogDescription>
            Send email invitations to join your organization. Separate multiple
            emails with commas.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Email input */}
          <div className="grid gap-2">
            <Label htmlFor="invite-emails">
              Email addresses <span className="text-destructive">*</span>
            </Label>
            <Input
              id="invite-emails"
              placeholder="e.g. alice@lab.edu, bob@lab.edu"
              value={emailInput}
              onChange={(e) => {
                setEmailInput(e.target.value)
                if (emailError) setEmailError("")
              }}
              aria-invalid={!!emailError}
              aria-describedby={emailError ? "invite-emails-error" : undefined}
              disabled={isSubmitting}
            />
            {emailError && (
              <p id="invite-emails-error" className="text-sm text-destructive">
                {emailError}
              </p>
            )}
          </div>

          {/* Role select */}
          <div className="grid gap-2">
            <Label htmlFor="invite-role">
              Role <span className="text-destructive">*</span>
            </Label>
            <Select
              value={selectedRoleId}
              onValueChange={(value) => {
                setSelectedRoleId(value)
                if (roleError) setRoleError("")
              }}
              disabled={isSubmitting}
            >
              <SelectTrigger id="invite-role" aria-invalid={!!roleError}>
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {roles.map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    {role.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {roleError && (
              <p id="invite-role-error" className="text-sm text-destructive">
                {roleError}
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            className="cursor-pointer"
            onClick={() => handleOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            className="cursor-pointer"
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Spinner className="mr-2" />
                Sending...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Send Invitations
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
