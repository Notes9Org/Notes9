"use client"

import { Button } from "@/components/ui/button"

export default function SettingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-4">
      <p className="text-destructive">{error.message || "Something went wrong loading settings."}</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  )
}
