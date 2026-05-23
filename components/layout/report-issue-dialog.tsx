"use client"

import { useState } from "react"
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
import { Textarea } from "@/components/ui/textarea"
import { Flag, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"

export function ReportIssueDialog() {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState("")
  const [sending, setSending] = useState(false)

  const handleSubmit = async () => {
    if (!message.trim() || message.trim().length < 10) {
      toast.error("Please write at least 10 characters.")
      return
    }

    setSending(true)
    try {
      // Get user email for reply-to
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      const userEmail = user?.email || "unknown@user.com"

      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: userEmail,
          subject: "User Report / Feedback",
          context: message.trim(),
        }),
      })

      if (!res.ok) {
        throw new Error("Failed to send")
      }

      toast.success("Report sent! We'll look into it.")
      setMessage("")
      setOpen(false)
    } catch {
      toast.error("Could not send your report. Please try again.")
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 sm:size-9 text-muted-foreground hover:text-foreground"
          aria-label="Report an issue or give feedback"
          title="Report / Feedback"
        >
          <Flag className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Report / Feedback</DialogTitle>
          <DialogDescription>
            Let us know about any issues, bugs, or suggestions. We read every message.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          placeholder="Describe the issue or share your feedback..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={5}
          className="resize-none"
          disabled={sending}
        />
        <DialogFooter>
          <Button
            onClick={handleSubmit}
            disabled={sending || message.trim().length < 10}
          >
            {sending ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              "Send Report"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
