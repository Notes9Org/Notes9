"use client"

import { useEffect, useRef } from "react"
import { usePathname } from "next/navigation"

// One wiring point for the recency signal (context backend, Slice 3): watches
// the route and beacons "user viewed entity X" to /api/activity/touch.
// Flag-gated by NEXT_PUBLIC_ACTIVITY_BEACON; fire-and-forget (sendBeacon).
// Edit-actions are beaconed from the autosave path separately.

const ROUTE_TO_ENTITY: Array<[RegExp, string]> = [
  [/^\/projects\/([^/?#]+)/, "project"],
  [/^\/experiments\/([^/?#]+)/, "experiment"],
  [/^\/lab-notes\/([^/?#]+)/, "lab_note"],
  [/^\/protocols\/([^/?#]+)/, "protocol"],
  [/^\/literature-reviews\/([^/?#]+)/, "literature_review"],
  [/^\/samples\/([^/?#]+)/, "sample"],
  [/^\/papers\/([^/?#]+)/, "paper"],
  [/^\/reports\/([^/?#]+)/, "report"],
]

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const RESEND_MS = 60_000

export function ActivityBeacon() {
  const pathname = usePathname()
  const last = useRef<{ key: string; at: number }>({ key: "", at: 0 })

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_ACTIVITY_BEACON !== "true") return
    if (!pathname) return
    for (const [re, entityType] of ROUTE_TO_ENTITY) {
      const m = pathname.match(re)
      if (!m) continue
      const entityId = m[1]
      if (!UUID_RE.test(entityId)) return
      const key = `${entityType}:${entityId}`
      const now = Date.now()
      // throttle: same entity within 60s → skip (multi-render / tab-focus churn)
      if (last.current.key === key && now - last.current.at < RESEND_MS) return
      last.current = { key, at: now }
      const payload = JSON.stringify({ entity_type: entityType, entity_id: entityId, action: "view" })
      try {
        if (!navigator.sendBeacon?.("/api/activity/touch", new Blob([payload], { type: "application/json" }))) {
          void fetch("/api/activity/touch", { method: "POST", body: payload, keepalive: true })
        }
      } catch {
        // never let telemetry break navigation
      }
      return
    }
  }, [pathname])

  return null
}
