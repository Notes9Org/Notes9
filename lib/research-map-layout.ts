import dagre from "dagre"
import { Position, type Edge, type Node } from "@xyflow/react"
import type { ResearchMapNodeKind } from "@/lib/research-map-types"

const NODE_W = 260
/** Fits kind label + up to ~4 lines of title at text-sm (dagre must match RF node width/height). */
const NODE_H = 108

export const RESEARCH_NODE_DIM = { width: NODE_W, height: NODE_H }

export function layoutResearchMap(
  nodes: Node[],
  edges: Edge[],
  direction: "LR" | "TB" = "LR",
): Node[] {
  if (nodes.length === 0) return []

  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({
    rankdir: direction,
    nodesep: 56,
    ranksep: 88,
    marginx: 32,
    marginy: 32,
  })

  for (const n of nodes) {
    g.setNode(n.id, { width: NODE_W, height: NODE_H })
  }
  for (const e of edges) {
    if (g.hasNode(e.source) && g.hasNode(e.target)) {
      g.setEdge(e.source, e.target)
    }
  }

  dagre.layout(g)

  return nodes.map((n) => {
    const pos = g.node(n.id)
    if (!pos) {
      return { ...n, position: n.position ?? { x: 0, y: 0 } }
    }
    return {
      ...n,
      position: {
        x: pos.x - NODE_W / 2,
        y: pos.y - NODE_H / 2,
      },
      targetPosition: direction === "LR" ? Position.Left : Position.Top,
      sourcePosition: direction === "LR" ? Position.Right : Position.Bottom,
    }
  })
}

export function kindAccentClass(kind: ResearchMapNodeKind): string {
  switch (kind) {
    case "project":
      return "border-violet-500/70 bg-violet-500/10 text-violet-950 dark:text-violet-100"
    case "experiment":
      return "border-sky-500/70 bg-sky-500/10 text-sky-950 dark:text-sky-100"
    case "protocol":
      return "border-amber-500/70 bg-amber-500/10 text-amber-950 dark:text-amber-100"
    case "literature":
      return "border-emerald-500/70 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100"
    case "lab_note":
      return "border-rose-500/70 bg-rose-500/10 text-rose-950 dark:text-rose-100"
    case "paper":
      return "border-orange-500/70 bg-orange-500/10 text-orange-950 dark:text-orange-100"
    default:
      return "border-border bg-muted/40"
  }
}

export function kindDotClass(kind: ResearchMapNodeKind): string {
  switch (kind) {
    case "project":
      return "bg-violet-500"
    case "experiment":
      return "bg-sky-500"
    case "protocol":
      return "bg-amber-500"
    case "literature":
      return "bg-emerald-500"
    case "lab_note":
      return "bg-rose-500"
    case "paper":
      return "bg-orange-500"
    default:
      return "bg-muted-foreground"
  }
}

export function kindLabel(kind: ResearchMapNodeKind): string {
  switch (kind) {
    case "project":
      return "Project"
    case "experiment":
      return "Experiment"
    case "protocol":
      return "Protocol"
    case "literature":
      return "Literature"
    case "lab_note":
      return "Lab note"
    case "paper":
      return "Paper"
    default:
      return kind
  }
}
