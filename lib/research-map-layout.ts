import dagre from "dagre"
import { Position, type Edge, type Node } from "@xyflow/react"

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
        compNodes.push(nodes.find((x) => x.id === cur)!)
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
    const compNodeIds = new Set(compNodes.map((n) => n.id))
    const compEdges = edges.filter(
      (e) => compNodeIds.has(e.source) && compNodeIds.has(e.target),
    )

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

    // Edge routing points are no longer consumed by the custom edge (it routes
    // from live node endpoints so lines follow nodes on drag), so we just pass
    // edges through unchanged.
    finalEdges.push(...compEdges.map((e) => ({ ...e })))

    currentXOffset += maxW + 120 // 120px gap between independent components
  }

  return { nodes: finalNodes, edges: finalEdges }
}
