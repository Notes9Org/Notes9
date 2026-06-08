"use client"

/**
 * ReactFlow-based marketing diagrams — same engine as the research map, so the
 * connecting lines anchor to node handles and always line up (no hand-placed
 * SVG coordinates that drift across container sizes).
 */

import { useMemo } from "react"
import {
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { cn } from "@/lib/utils"

type ChipData = { label: string; hub?: boolean }
type ChipNode = Node<ChipData, "chip">

function ChipNodeComp({ data }: NodeProps<ChipNode>) {
  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2 text-[12px] font-semibold shadow-sm",
        data.hub
          ? "border-[var(--n9-accent)]/40 bg-[var(--n9-accent)] text-white shadow-[0_10px_30px_-12px_var(--n9-accent-glow)]"
          : "border-border/60 bg-card text-foreground",
      )}
    >
      {/* Invisible handles — present so edges anchor, but not shown. */}
      <Handle type="target" position={Position.Left} className="!h-1.5 !w-1.5 !border-0 !bg-transparent" />
      {data.label}
      <Handle type="source" position={Position.Right} className="!h-1.5 !w-1.5 !border-0 !bg-transparent" />
    </div>
  )
}

const nodeTypes = { chip: ChipNodeComp }

/** Shared non-interactive ReactFlow config for decorative marketing diagrams. */
const STATIC_FLOW_PROPS = {
  nodeTypes,
  nodesDraggable: false,
  nodesConnectable: false,
  elementsSelectable: false,
  nodesFocusable: false,
  edgesFocusable: false,
  panOnDrag: false,
  panOnScroll: false,
  zoomOnScroll: false,
  zoomOnPinch: false,
  zoomOnDoubleClick: false,
  preventScrolling: false,
  fitView: true,
  proOptions: { hideAttribution: true },
  defaultEdgeOptions: {
    type: "smoothstep",
    animated: true,
    style: { stroke: "var(--n9-accent)", strokeWidth: 1.8 },
  },
} as const

const dottedBg =
  "[background-image:radial-gradient(circle,rgba(0,0,0,0.05)_1px,transparent_1px)] [background-size:18px_18px] dark:[background-image:radial-gradient(circle,rgba(255,255,255,0.05)_1px,transparent_1px)]"

/** Sources feeding into one Project-memory hub (LR, animated edges). */
export function MemoryHubFlow({ className }: { className?: string }) {
  const { nodes, edges } = useMemo(() => {
    const sources = ["Literature", "Protocols", "Experiments", "Lab notes", "Data"]
    const gap = 64
    const ns: Node[] = sources.map((label, i) => ({
      id: `s${i}`,
      type: "chip",
      position: { x: 0, y: i * gap },
      data: { label },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    }))
    ns.push({
      id: "hub",
      type: "chip",
      position: { x: 300, y: ((sources.length - 1) * gap) / 2 },
      data: { label: "Project memory", hub: true },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    })
    const es: Edge[] = sources.map((_, i) => ({ id: `e${i}`, source: `s${i}`, target: "hub" }))
    return { nodes: ns, edges: es }
  }, [])

  return (
    <div
      className={cn(
        "h-[300px] w-full overflow-hidden rounded-2xl border border-border/60 bg-card",
        dottedBg,
        className,
      )}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitViewOptions={{ padding: 0.16 }}
        className="h-full w-full"
        {...STATIC_FLOW_PROPS}
      />
    </div>
  )
}

/** Compact project → experiment → outputs graph (LR, animated edges). */
export function MiniKnowledgeFlow({ className }: { className?: string }) {
  const { nodes, edges } = useMemo(() => {
    const ns: Node[] = [
      { id: "proj", type: "chip", position: { x: 0, y: 60 }, data: { label: "Project", hub: true }, sourcePosition: Position.Right, targetPosition: Position.Left },
      { id: "exp", type: "chip", position: { x: 150, y: 60 }, data: { label: "Experiment" }, sourcePosition: Position.Right, targetPosition: Position.Left },
      { id: "result", type: "chip", position: { x: 310, y: 0 }, data: { label: "Result" }, sourcePosition: Position.Right, targetPosition: Position.Left },
      { id: "note", type: "chip", position: { x: 310, y: 60 }, data: { label: "Lab note" }, sourcePosition: Position.Right, targetPosition: Position.Left },
      { id: "paper", type: "chip", position: { x: 310, y: 120 }, data: { label: "Paper" }, sourcePosition: Position.Right, targetPosition: Position.Left },
    ]
    const es: Edge[] = [
      { id: "a", source: "proj", target: "exp" },
      { id: "b", source: "exp", target: "result" },
      { id: "c", source: "exp", target: "note" },
      { id: "d", source: "exp", target: "paper" },
    ]
    return { nodes: ns, edges: es }
  }, [])

  return (
    <div className={cn("h-[150px] w-full overflow-hidden rounded-xl border border-border/60 bg-card", dottedBg, className)}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitViewOptions={{ padding: 0.12 }}
        className="h-full w-full"
        {...STATIC_FLOW_PROPS}
      />
    </div>
  )
}
