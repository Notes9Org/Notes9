"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { recordRumEvent } from "@/lib/rum"

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const pathname = usePathname()
  useEffect(() => {
    recordRumEvent('page_error', { message: error.message, digest: error.digest, route: pathname })
  }, [error, pathname])
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
      <p className="text-destructive">{error.message || "Something went wrong loading the dashboard."}</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  )
}
