"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check, ArrowCounterClockwise } from "@phosphor-icons/react/ssr"
import { Button } from "@/components/ui/button"
import { setChecklistDismissedAction } from "@/app/actions/onboarding"

/**
 * Brings the dismissed Getting Started panel back to the dashboard.
 *
 * Dismissal has to be reversible somewhere the user can find later, the panel's
 * own X is the only way to hide it, and a checklist you can permanently destroy
 * by mis-clicking is worse than no checklist.
 */
export function RestoreChecklistButton() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [restored, setRestored] = useState(false)

  const restore = () => {
    startTransition(async () => {
      await setChecklistDismissedAction(false)
      setRestored(true)
      router.refresh()
    })
  }

  return (
    <Button
      variant="outline"
      className="h-10 text-sm"
      onClick={restore}
      disabled={isPending || restored}
    >
      {restored ? (
        <>
          <Check className="mr-2 size-4" aria-hidden />
          Shown on dashboard
        </>
      ) : (
        <>
          <ArrowCounterClockwise className="mr-2 size-4" aria-hidden />
          Show getting started
        </>
      )}
    </Button>
  )
}
