"use client"

import { RightSidebar } from "@/components/layout/right-sidebar"
import { CatalystErrorBoundary } from "@/components/catalyst/catalyst-error-boundary"

type CatalystFullPageProps = {
  sessionId?: string
}

/** Full-route Catalyst — same assistant as the former header / right panel. */
export function CatalystFullPage({ sessionId }: CatalystFullPageProps) {
  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      <CatalystErrorBoundary>
        <RightSidebar variant="page" initialSessionId={sessionId} />
      </CatalystErrorBoundary>
    </div>
  )
}
