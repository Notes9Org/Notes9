"use client"

import { AgentWorkflowStudio } from "@/components/settings/agent-workflow-studio"

export default function AgentStudioPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Personal Agent Studio</h1>
        <p className="mt-1 text-muted-foreground">
          Standalone workspace for visualizing and configuring your marketing agent workflow.
        </p>
      </div>

      <AgentWorkflowStudio />
    </div>
  )
}
