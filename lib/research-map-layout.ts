import dagre from "dagre"
import { Position, type Edge, type Node } from "@xyflow/react"
import type { ResearchMapNodeKind } from "@/lib/research-map-types"

const NODE_W = 200
/** Fits kind ribbon + 3 lines of title at text-sm — kept narrow so dense graphs
 *  don't collapse into thin slivers when fit-to-view zooms out. dagre must
 *  match RF node width/height. */
const NODE_H = 84

export const RESEARCH_NODE_DIM = { width: NODE_W, height: NODE_H }

export function layoutResearchMap(
  nodes: Node[],
  edges: Edge[],
  direction: "LR" | "TB" = "LR",
): { nodes: Node[]; edges: Edge[] } {
  if (nodes.length === 0) return { nodes: [], edges: [] }

  // Create an adjacency list to find weakly connected components
  const adj = new Map<string, Set<string>>()
  for (const n of nodes) adj.set(n.id, new Set())
  for (const e of edges) {
    if (adj.has(e.source) && adj.has(e.target)) {
      adj.get(e.source)!.add(e.target)
      adj.get(e.target)!.add(e.source)
    }
  }

  const visited = new Set<string>()
  const components: Node[][] = []
  
  for (const n of nodes) {
    if (!visited.has(n.id)) {
      const compNodes: Node[] = []
      const q = [n.id]
      visited.add(n.id)
      while (q.length > 0) {
        const cur = q.shift()!
        compNodes.push(nodes.find(x => x.id === cur)!)
        for (const neighbor of adj.get(cur)!) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor)
            q.push(neighbor)
          }
        }
      }
      components.push(compNodes)
    }
  }

  let currentXOffset = 0
  const finalNodes: Node[] = []
  const finalEdges: Edge[] = []

  for (const compNodes of components) {
    const compNodeIds = new Set(compNodes.map(n => n.id))
    const compEdges = edges.filter(e => compNodeIds.has(e.source) && compNodeIds.has(e.target))

    const g = new dagre.graphlib.Graph()
    g.setDefaultEdgeLabel(() => ({}))
    g.setGraph({
      rankdir: direction,
      nodesep: 90,
      ranksep: 220,
      edgesep: 40,
      marginx: 56,
      marginy: 56,
      ranker: "network-simplex",
      align: "UL",
    })

    for (const n of compNodes) {
      g.setNode(n.id, { width: NODE_W, height: NODE_H })
    }
    for (const e of compEdges) {
      g.setEdge(e.source, e.target)
    }

    dagre.layout(g)

    let maxW = 0

    const compFinalNodes = compNodes.map((n) => {
      const pos = g.node(n.id)
      if (!pos) {
        return { ...n, position: n.position ?? { x: 0, y: 0 } }
      }
      
      const x = pos.x - NODE_W / 2
      const y = pos.y - NODE_H / 2
      
      maxW = Math.max(maxW, x + NODE_W)

      return {
        ...n,
        position: {
          x: x + currentXOffset,
          y: y,
        },
        targetPosition: direction === "LR" ? Position.Left : Position.Top,
        sourcePosition: direction === "LR" ? Position.Right : Position.Bottom,
      }
    })

    finalNodes.push(...compFinalNodes)
    
    // Process edges to extract Dagre's routing points and shift them
    const compFinalEdges = compEdges.map((e) => {
      const graphEdge = g.edge(e.source, e.target)
      let points = graphEdge?.points || []
      // Shift points by the component's offset and center them relative to the margin
      points = points.map(p => ({
        x: p.x + currentXOffset,
        y: p.y
      }))
      return {
        ...e,
        data: {
          ...e.data,
          points
        }
      }
    })
    finalEdges.push(...compFinalEdges)
    
    currentXOffset += maxW + 120 // 120px gap between independent components
  }

  return { nodes: finalNodes, edges: finalEdges }
}

/**
 * Node accent — left-border bar + soft tint. Each kind picks a hue spread
 * around the color wheel so seven kinds stay maximally distinct at low zoom
 * (the previous palette had amber/rose/orange clustered in warm tones,
 * making writing/lab-notes/protocols look almost identical from afar).
 *
 * Final assignment (matches `kindHexColor` + `edgeColorForKind` exactly):
 *   project    burnt sienna (brand)    — warm brown
 *   experiment blue-600                — blue
 *   protocol   yellow-600              — gold
 *   literature green-600               — green
 *   lab_note   red-600                 — red
 *   paper      purple-600              — purple   (formerly orange)
 *   report     cyan-600                — teal     (formerly indigo)
 */
export function kindAccentClass(kind: ResearchMapNodeKind): string {
  switch (kind) {
    case "project":
      return "border-l-[6px] border-l-primary border-y border-r border-border bg-primary/[0.06] text-foreground"
    case "experiment":
      return "border-l-[6px] border-l-blue-600 border-y border-r border-border bg-blue-500/[0.07] text-foreground"
    case "protocol":
      return "border-l-[6px] border-l-yellow-600 border-y border-r border-border bg-yellow-500/[0.07] text-foreground"
    case "literature":
      return "border-l-[6px] border-l-green-600 border-y border-r border-border bg-green-500/[0.07] text-foreground"
    case "lab_note":
      return "border-l-[6px] border-l-red-600 border-y border-r border-border bg-red-500/[0.07] text-foreground"
    case "paper":
      return "border-l-[6px] border-l-purple-600 border-y border-r border-border bg-purple-500/[0.07] text-foreground"
    case "report":
      return "border-l-[6px] border-l-cyan-600 border-y border-r border-border bg-cyan-500/[0.07] text-foreground"
    default:
      return "border border-border bg-muted/40"
  }
}

export function kindDotClass(kind: ResearchMapNodeKind): string {
  switch (kind) {
    case "project":
      return "bg-primary"
    case "experiment":
      return "bg-blue-600"
    case "protocol":
      return "bg-yellow-600"
    case "literature":
      return "bg-green-600"
    case "lab_note":
      return "bg-red-600"
    case "paper":
      return "bg-purple-600"
    case "report":
      return "bg-cyan-600"
    default:
      return "bg-muted-foreground"
  }
}

/**
 * Hex stroke colors keyed by edge `kind`. ReactFlow's edge stroke is set via
 * inline style; CSS variables don't resolve there because the renderer paints
 * with raw SVG. Each edge takes the hue of its *target* node so a researcher
 * can trace "what connects to what" by color — any arrow pointing at a
 * Writing node is purple, any arrow at a Report is teal, etc.
 *
 * Palette is spread around the color wheel for maximum distinction at low
 * zoom (the previous warm cluster — amber / rose / orange — made writing,
 * lab notes and protocols visually indistinguishable on small nodes).
 */
export function edgeColorForKind(kind: string): string {
  switch (kind) {
    case "project_contains_experiment":
      return "#2563eb" // blue-600 → experiment
    case "experiment_uses_protocol":
    case "project_contains_protocol":
    case "lab_note_uses_protocol":
      return "#ca8a04" // yellow-600 → protocol
    case "project_linked_literature":
    case "experiment_linked_literature":
      return "#16a34a" // green-600 → literature
    case "experiment_has_lab_note":
    case "project_has_lab_note":
      return "#dc2626" // red-600 → lab note
    case "project_contains_paper":
      return "#9333ea" // purple-600 → writing
    case "project_contains_report":
    case "experiment_has_report":
      return "#0891b2" // cyan-600 → report
    default:
      return "#9ca3af" // gray-400 fallback
  }
}

/** Minimap dot color — mirrors edge palette so the minimap reads as a legend. */
export function kindHexColor(kind: ResearchMapNodeKind): string {
  switch (kind) {
    case "project":
      return "#965034" // burnt-sienna primary
    case "experiment":
      return "#2563eb" // blue-600
    case "protocol":
      return "#ca8a04" // yellow-600
    case "literature":
      return "#16a34a" // green-600
    case "lab_note":
      return "#dc2626" // red-600
    case "paper":
      return "#9333ea" // purple-600
    case "report":
      return "#0891b2" // cyan-600
    default:
      return "#9ca3af"
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
      return "Writing"
    case "report":
      return "Report"
    case "sample":
      return "Sample"
    default:
      return kind
  }
}
