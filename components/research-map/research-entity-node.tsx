"use client"

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"
import { cn } from "@/lib/utils"
import type { ResearchMapNodeKind } from "@/lib/research-map-types"
import { kindAccentClass, kindLabel } from "@/lib/research-map-layout"

export type ResearchEntityNodeData = {
  kind: ResearchMapNodeKind
  displayLabel: string
  /** In-app path for double-click navigation (from `/api/research-map`). */
  href?: string
  dimmed?: boolean
  ring?: boolean
}

type ResearchEntityRFNode = Node<ResearchEntityNodeData, "researchEntity">

export function ResearchEntityNode({
  data,
  selected,
}: NodeProps<ResearchEntityRFNode>) {
  const { kind, displayLabel, href, dimmed, ring } = data

  return (
    <div
      className={cn(
        "group relative box-border flex h-full w-full min-h-0 flex-col overflow-hidden rounded-xl border-2 px-3 py-2 shadow-sm transition-[opacity,box-shadow,filter] duration-200 ease-out",
        "hover:z-[2] hover:shadow-lg hover:shadow-foreground/12 hover:ring-2 hover:ring-primary/45 dark:hover:shadow-black/50",
        href && "cursor-pointer",
        kindAccentClass(kind),
        dimmed && "opacity-[0.22]",
        (selected || ring) && "ring-2 ring-primary ring-offset-2 ring-offset-background",
      )}
    >
      <Handle type="target" position={Position.Left} className="!size-2.5 !border-2 !bg-background" />
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center text-center">
        <div className="min-h-0 w-full max-w-full overflow-hidden">
          <span className="sr-only">{kindLabel(kind)}: </span>
          <p
            className="line-clamp-5 text-sm font-medium leading-snug break-words text-foreground transition-[font-weight] duration-200 [overflow-wrap:anywhere] group-hover:font-semibold"
            title={
              href
                ? `${displayLabel} — Double-click to open`
                : displayLabel
            }
          >
            {displayLabel}
          </p>
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!size-2.5 !border-2 !bg-background" />
    </div>
  )
}
