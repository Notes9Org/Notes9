"use client"

/**
 * app/global-error.tsx
 *
 * Root-level error boundary — catches errors thrown in the root layout that
 * route-segment error.tsx boundaries cannot. Must render its own <html>/<body>.
 * Reports the exception to PostHog Error Tracking.
 */

import { useEffect } from "react"
import { captureClientException } from "@/lib/rum"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    captureClientException(error, { route: "__global__", digest: error.digest ?? null })
  }, [error])

  return (
    <html lang="en">
      <body>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            gap: "1rem",
            fontFamily: "system-ui, sans-serif",
            padding: "2rem",
            textAlign: "center",
          }}
        >
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600 }}>
            Something went wrong
          </h2>
          <p style={{ color: "#6b7280" }}>
            {error.message || "An unexpected error occurred."}
          </p>
          <button
            onClick={reset}
            style={{
              borderRadius: "0.375rem",
              background: "#111827",
              color: "#fff",
              padding: "0.5rem 1rem",
              fontSize: "0.875rem",
              border: "none",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
