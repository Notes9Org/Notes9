"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { recordRumEvent } from "@/lib/rum"

export default function EquipmentError({
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
      <p className="text-destructive">{error.message || "Something went wrong loading equipment."}</p>
      <button
        onClick={reset}
        className="px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
      >
        Try again
      </button>
    </div>
  )
}
