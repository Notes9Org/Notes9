"use client"

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"
import { cn } from "@/lib/utils"
import type { ResearchMapNodeKind } from "@/lib/research-map-types"
import { kindAccentClass, kindIcon, kindIconClass, kindLabel, kindTintClass } from "@/lib/research-map-kinds"

export type ResearchEntityNodeData = {
  kind: ResearchMapNodeKind
  displayLabel: string
  /** In-app path for double-click navigation (from `/api/research-map`). */
  href?: string
  dimmed?: boolean
  ring?: boolean
}

type ResearchEntityRFNode = Node<ResearchEntityNodeData, "researchEntity">

/**
 * Compact rectangular node — colored left ribbon + uppercase kind tag + title.
 * The kind tag survives even when the canvas zooms out, which is the bug we
 * saw in the screenshot where nodes became unreadable slivers. Hover gives a
 * subtle elevation; selection / ancestor-highlight ring uses the brand
 * primary so the active path stays visually obvious.
 */
export function ResearchEntityNode({
  data,
  selected,
}: NodeProps<ResearchEntityRFNode>) {
  const { kind, displayLabel, href, dimmed, ring } = data
  const KindIcon = kindIcon(kind)

  return (
    <div
      className={cn(
        // `isolate` + an opaque `bg-card` base keep the connecting edges (which
        // ReactFlow paints in a layer behind the nodes) from showing through the
        // node and covering its text. The kind color is a tint overlay below.
        "group relative isolate box-border flex h-full w-full flex-col overflow-hidden rounded-md bg-card shadow-sm",
        "transition-[opacity,box-shadow,transform] duration-150 ease-out",
        "hover:z-[2] hover:-translate-y-[1px] hover:shadow-md dark:hover:shadow-black/40",
        href && "cursor-pointer",
        kindAccentClass(kind),
        dimmed && "opacity-[0.22]",
        (selected || ring) && "ring-2 ring-primary ring-offset-2 ring-offset-background",
      )}
      title={
        href ? `${displayLabel} — Double-click to open` : displayLabel
      }
    >
      {/* Kind tint, painted over the opaque base but behind the content. */}
      <div
        aria-hidden
        className={cn("pointer-events-none absolute inset-0 -z-10", kindTintClass(kind))}
      />

      <Handle
        type="target"
        position={Position.Left}
        className="!size-2 !border !bg-background !border-border"
      />

      {/* Kind ribbon — tiny chip that keeps the type readable even when the
          map is zoomed out. Mirrors the dot legend in the filter panel so a
          user can map the two views together. */}
      <div className="flex items-center gap-1.5 px-2 pt-1.5">
        <KindIcon className={cn("size-3 shrink-0", kindIconClass(kind))} aria-hidden />
        <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {kindLabel(kind)}
        </span>
      </div>

      {/* Title */}
      <div className="flex min-h-0 flex-1 items-start px-2 pb-2 pt-0.5">
        <p
          className="line-clamp-3 text-[13px] font-medium leading-snug text-foreground [overflow-wrap:anywhere]"
        >
          {displayLabel}
        </p>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!size-2 !border !bg-background !border-border"
      />
    </div>
  )
}
