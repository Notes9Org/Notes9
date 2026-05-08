import dagre from "dagre"
import { Position, type Edge, type Node } from "@xyflow/react"

export type UserTrendGraphEdgeRaw = {
  source: string
  target: string
  weight?: number
  edge_type?: string
  last_seen?: string
}

export type UserTrendGraphNodeRaw = {
  id?: string
  label?: string
  /** Graffify / graph export: entity category for legend coloring */
  entity_type?: string
}

export type UserTrendGraphDataParsed = {
  edges: UserTrendGraphEdgeRaw[]
  nodes?: UserTrendGraphNodeRaw[]
}

/** Compact dot + label (relationship-graph style). */
const NODE_W = 92
const NODE_H = 52

export const USER_TREND_NODE_DIM = { width: NODE_W, height: NODE_H }

/** Legend palette aligned with relationship-graph UIs (hex for inline styles). */
export const USER_TREND_ENTITY_LEGEND: Record<string, { label: string; color: string }> = {
  entity: { label: "Entity", color: "#ec4899" },
  assistant: { label: "Assistant", color: "#3b82f6" },
  document: { label: "Document", color: "#f59e0b" },
  event: { label: "Event", color: "#f97316" },
  location: { label: "Location", color: "#a855f7" },
  object: { label: "Object", color: "#c2410c" },
  organization: { label: "Organization", color: "#14b8a6" },
  person: { label: "Person", color: "#c084fc" },
  topic: { label: "Topic", color: "#22d3ee" },
  user: { label: "User", color: "#16a34a" },
}

const ENTITY_KIND_POOL = Object.keys(USER_TREND_ENTITY_LEGEND)

export type UserTrendNodeData = {
  displayLabel: string
  /** Normalized key into USER_TREND_ENTITY_LEGEND */
  entityKind: string
  dimmed?: boolean
  ring?: boolean
}

export function normalizeEntityKind(raw: string | undefined): string {
  if (!raw?.trim()) return "topic"
  const k = raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
  if (k in USER_TREND_ENTITY_LEGEND) return k
  if (k.includes("person")) return "person"
  if (k.includes("org")) return "organization"
  if (k.includes("doc")) return "document"
  if (k.includes("topic")) return "topic"
  if (k.includes("user")) return "user"
  if (k.includes("assist")) return "assistant"
  if (k.includes("event")) return "event"
  if (k.includes("location")) return "location"
  return "topic"
}

export function inferEntityKindFromLabel(label: string): string {
  let h = 0
  for (let i = 0; i < label.length; i++) {
    h = (Math.imul(31, h) + label.charCodeAt(i)) | 0
  }
  return ENTITY_KIND_POOL[Math.abs(h) % ENTITY_KIND_POOL.length]!
}

/** Distinct legend keys present in raw graph_data (for dashboard chips). */
export function userTrendLegendKindsFromData(raw: unknown): string[] {
  const parsed = parseUserTrendGraphData(raw)
  const kinds = new Set<string>()
  if (parsed.nodes?.length) {
    for (const n of parsed.nodes) {
      kinds.add(normalizeEntityKind(n.entity_type))
    }
  }
  const labels = new Set<string>()
  for (const e of parsed.edges) {
    labels.add(e.source)
    labels.add(e.target)
  }
  for (const label of labels) {
    kinds.add(inferEntityKindFromLabel(label))
  }
  return Array.from(kinds).sort()
}

function slugPart(s: string): string {
  const t = s.trim().slice(0, 80)
  const base = t
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
  return base || "node"
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

function asString(v: unknown): string | null {
  if (typeof v === "string" && v.trim().length > 0) return v.trim()
  return null
}

function asNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return undefined
}

/** Accepts DB jsonb; returns normalized structure or empty edges. */
export function parseUserTrendGraphData(raw: unknown): UserTrendGraphDataParsed {
  if (!isRecord(raw)) return { edges: [] }

  const edgesIn = raw.edges
  const edges: UserTrendGraphEdgeRaw[] = []
  if (Array.isArray(edgesIn)) {
    for (const e of edgesIn) {
      if (!isRecord(e)) continue
      const source = asString(e.source)
      const target = asString(e.target)
      if (!source || !target) continue
      edges.push({
        source,
        target,
        weight: asNumber(e.weight),
        edge_type: asString(e.edge_type) ?? undefined,
        last_seen: asString(e.last_seen) ?? undefined,
      })
    }
  }

  const nodesIn = raw.nodes
  const nodes: UserTrendGraphNodeRaw[] | undefined = Array.isArray(nodesIn)
    ? nodesIn
        .map((n): UserTrendGraphNodeRaw | null => {
          if (!isRecord(n)) return null
          const out: UserTrendGraphNodeRaw = {}
          const id = asString(n.id)
          const label = asString(n.label)
          const et =
            asString(n.entity_type) ??
            asString(n.entityType) ??
            asString(n.type) ??
            asString(n.kind)
          if (id) out.id = id
          if (label) out.label = label
          if (et) out.entity_type = et
          if (!out.id && !out.label) return null
          return out
        })
        .filter((n): n is UserTrendGraphNodeRaw => n !== null)
    : undefined

  return { edges, nodes: nodes?.length ? nodes : undefined }
}

/** Counts themes (unique node labels from edges) and edges for the collapsed dashboard preview. */
export function userTrendGraphSummary(raw: unknown): {
  themeCount: number
  edgeCount: number
} {
  const parsed = parseUserTrendGraphData(raw)
  const themes = new Set<string>()
  for (const e of parsed.edges) {
    themes.add(e.source)
    themes.add(e.target)
  }
  return { themeCount: themes.size, edgeCount: parsed.edges.length }
}

function stableLabelToId(
  label: string,
  used: Set<string>,
): string {
  const base = `ut-${slugPart(label)}`
  if (!used.has(base)) {
    used.add(base)
    return base
  }
  let i = 1
  while (used.has(`${base}-${i}`)) i++
  const id = `${base}-${i}`
  used.add(id)
  return id
}

function allocateNodeId(rawId: string | undefined, label: string, usedIds: Set<string>): string {
  if (rawId?.trim()) {
    const base = `ut-${slugPart(rawId)}`
    if (!usedIds.has(base)) {
      usedIds.add(base)
      return base
    }
    let i = 1
    while (usedIds.has(`${base}-${i}`)) i++
    const id = `${base}-${i}`
    usedIds.add(id)
    return id
  }
  return stableLabelToId(label, usedIds)
}

/** Map edge endpoint string (label or id) to React Flow node id. */
function resolveEndpoint(
  key: string,
  keyToRfId: Map<string, string>,
): string | undefined {
  return keyToRfId.get(key)
}

export function graphDataToFlow(parsed: UserTrendGraphDataParsed): {
  nodes: Node<UserTrendNodeData>[]
  edges: Edge[]
  labelById: Map<string, string>
} {
  const labelById = new Map<string, string>()
  const usedIds = new Set<string>()

  if (parsed.nodes?.length) {
    const keyToRfId = new Map<string, string>()
    const nodes: Node<UserTrendNodeData>[] = []

    for (const n of parsed.nodes) {
      const label = (n.label ?? n.id ?? "").trim()
      if (!label) continue
      const id = allocateNodeId(n.id, label, usedIds)
      labelById.set(id, n.label ?? n.id ?? label)
      if (n.label) keyToRfId.set(n.label, id)
      if (n.id) keyToRfId.set(n.id, id)
      keyToRfId.set(label, id)

      nodes.push({
        id,
        type: "userTrend",
        position: { x: 0, y: 0 },
        width: NODE_W,
        height: NODE_H,
        data: {
          displayLabel: n.label ?? n.id ?? label,
          entityKind: n.entity_type
            ? normalizeEntityKind(n.entity_type)
            : inferEntityKindFromLabel(n.label ?? n.id ?? label),
        },
      })
    }

    const idSet = new Set(nodes.map((n) => n.id))
    const edges: Edge[] = []
    let ei = 0
    const weights = parsed.edges
      .map((e) => e.weight)
      .filter((w): w is number => typeof w === "number")
    const wMax = weights.length ? Math.max(...weights, 0.001) : 1

    for (const e of parsed.edges) {
      const sourceId = resolveEndpoint(e.source, keyToRfId)
      const targetId = resolveEndpoint(e.target, keyToRfId)
      if (!sourceId || !targetId || !idSet.has(sourceId) || !idSet.has(targetId)) {
        continue
      }
      const strokeW = edgeStrokeWidth(e.weight, wMax)
      edges.push({
        id: `e-${ei++}-${sourceId}-${targetId}`,
        source: sourceId,
        target: targetId,
        data: {
          edgeType: e.edge_type,
          weight: e.weight,
          lastSeen: e.last_seen,
        },
        style: { strokeWidth: strokeW },
      })
    }
    return { nodes, edges, labelById }
  }

  const labelSet = new Set<string>()
  for (const e of parsed.edges) {
    labelSet.add(e.source)
    labelSet.add(e.target)
  }

  const labelToRfId = new Map<string, string>()
  for (const label of labelSet) {
    const id = stableLabelToId(label, usedIds)
    labelToRfId.set(label, id)
    labelById.set(id, label)
  }

  const nodes: Node<UserTrendNodeData>[] = Array.from(labelSet).map(
    (label) => ({
      id: labelToRfId.get(label)!,
      type: "userTrend",
      position: { x: 0, y: 0 },
      width: NODE_W,
      height: NODE_H,
      data: {
        displayLabel: label,
        entityKind: inferEntityKindFromLabel(label),
      },
    }),
  )

  const idSet = new Set(nodes.map((n) => n.id))
  const weights = parsed.edges
    .map((e) => e.weight)
    .filter((w): w is number => typeof w === "number")
  const wMax = weights.length ? Math.max(...weights, 0.001) : 1

  const edges: Edge[] = []
  let ei = 0
  for (const e of parsed.edges) {
    const source = labelToRfId.get(e.source)
    const target = labelToRfId.get(e.target)
    if (!source || !target || !idSet.has(source) || !idSet.has(target))
      continue
    const strokeW = edgeStrokeWidth(e.weight, wMax)
    edges.push({
      id: `e-${ei++}-${source}-${target}`,
      source,
      target,
      data: {
        edgeType: e.edge_type,
        weight: e.weight,
        lastSeen: e.last_seen,
      },
      style: { strokeWidth: strokeW },
    })
  }

  return { nodes, edges, labelById }
}

function edgeStrokeWidth(weight: number | undefined, wMax: number): number {
  if (weight == null) return 1.5
  const t = Math.min(1, Math.max(0, weight / wMax))
  return 1.2 + t * 2.8
}

export function layoutUserTrendGraph(
  nodes: Node[],
  edges: Edge[],
  direction: "LR" | "TB" = "LR",
): Node[] {
  if (nodes.length === 0) return []

  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({
    rankdir: direction,
    nodesep: direction === "TB" ? 28 : 36,
    ranksep: direction === "TB" ? 40 : 56,
    marginx: 20,
    marginy: 20,
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

/** Force-directed layout (seeded on a circle) for a dense, circular cluster like reference UIs. */
export function layoutUserTrendForce(
  nodes: Node<UserTrendNodeData>[],
  edges: Edge[],
  iterations = 160,
): Node[] {
  if (nodes.length === 0) return []

  const n = nodes.length
  const seedR = 180 + Math.sqrt(n) * 42
  const pos = new Map<string, { x: number; y: number; vx: number; vy: number }>()

  nodes.forEach((node, i) => {
    const ang = (2 * Math.PI * i) / n + i * 0.07
    pos.set(node.id, {
      x: Math.cos(ang) * seedR,
      y: Math.sin(ang) * seedR,
      vx: 0,
      vy: 0,
    })
  })

  const REPULSE = 5200
  const ATTRACT = 0.028
  const IDEAL = 95 + Math.min(40, n * 0.35)
  const DAMPING = 0.82

  for (let iter = 0; iter < iterations; iter++) {
    const forces = new Map<string, { fx: number; fy: number }>()
    for (const node of nodes) {
      forces.set(node.id, { fx: 0, fy: 0 })
    }

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i]!
        const b = nodes[j]!
        const pa = pos.get(a.id)!
        const pb = pos.get(b.id)!
        let dx = pa.x - pb.x
        let dy = pa.y - pb.y
        let distSq = dx * dx + dy * dy
        if (distSq < 1) distSq = 1
        const dist = Math.sqrt(distSq)
        const f = REPULSE / distSq
        dx /= dist
        dy /= dist
        forces.get(a.id)!.fx += dx * f
        forces.get(a.id)!.fy += dy * f
        forces.get(b.id)!.fx -= dx * f
        forces.get(b.id)!.fy -= dy * f
      }
    }

    for (const e of edges) {
      const pa = pos.get(e.source)
      const pb = pos.get(e.target)
      if (!pa || !pb) continue
      let dx = pb.x - pa.x
      let dy = pb.y - pa.y
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01
      dx /= dist
      dy /= dist
      const f = ATTRACT * (dist - IDEAL)
      forces.get(e.source)!.fx += dx * f
      forces.get(e.source)!.fy += dy * f
      forces.get(e.target)!.fx -= dx * f
      forces.get(e.target)!.fy -= dy * f
    }

    let cx = 0
    let cy = 0
    for (const node of nodes) {
      const p = pos.get(node.id)!
      const fc = forces.get(node.id)!
      p.vx = (p.vx + fc.fx) * DAMPING
      p.vy = (p.vy + fc.fy) * DAMPING
      p.x += p.vx
      p.y += p.vy
      cx += p.x
      cy += p.y
    }
    cx /= n
    cy /= n
    for (const node of nodes) {
      const p = pos.get(node.id)!
      p.x -= cx
      p.y -= cy
    }
  }

  return nodes.map((node) => {
    const p = pos.get(node.id)!
    return {
      ...node,
      position: {
        x: p.x - NODE_W / 2,
        y: p.y - NODE_H / 2,
      },
      targetPosition: Position.Top,
      sourcePosition: Position.Bottom,
    }
  })
}
