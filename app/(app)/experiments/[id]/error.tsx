"use client"

import { useEffect } from "react"

export default function ExperimentError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[ExperimentPage Error]", error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center gap-4 p-8">
      <h2 className="text-lg font-semibold text-destructive">
        Something went wrong loading this experiment
      </h2>
      <pre className="max-w-2xl overflow-auto rounded-md border bg-muted p-4 text-xs whitespace-pre-wrap">
        {error.message}
        {error.digest && `\nDigest: ${error.digest}`}
        {error.stack && `\n\n${error.stack}`}
      </pre>
      <button
        onClick={reset}
        className="rounded-md bg-primary px-4 py-2 text-primary-foreground text-sm"
      >
        Try again
      </button>
    </div>
  )
}
