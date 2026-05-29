"use client"

import { RightSidebar } from "@/components/layout/right-sidebar"

type CatalystFullPageProps = {
  sessionId?: string
}

/** Full-route Catalyst — same assistant as the former header / right panel. */
export function CatalystFullPage({ sessionId }: CatalystFullPageProps) {
  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      <RightSidebar variant="page" initialSessionId={sessionId} />
    </div>
  )
}
