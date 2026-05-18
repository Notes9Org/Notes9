"use client"

import type { MouseEvent } from "react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Background,
  BackgroundVariant,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  Handle,
  Position,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { Network, RefreshCw } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import {
  USER_TREND_ENTITY_LEGEND,
  graphDataToFlow,
  layoutUserTrendForce,
  parseUserTrendGraphData,
  userTrendGraphSummary,
  type UserTrendNodeData,
} from "@/lib/user-trend-graph"

type UserTrendRFNode = Node<UserTrendNodeData, "userTrend">

const GRAPH_EDGE_COLOR = "#64748b"
const GRAPH_EDGE_OPACITY = 0.52

function UserTrendNode({ data, selected }: NodeProps<UserTrendRFNode>) {
  const { displayLabel, dimmed, ring, entityKind } = data
  const meta = USER_TREND_ENTITY_LEGEND[entityKind] ?? USER_TREND_ENTITY_LEGEND.topic
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-1",
        dimmed && "opacity-[0.2]",
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!size-2 !border-2 !border-white/90 !bg-slate-600 dark:!border-zinc-800 dark:!bg-zinc-400"
      />
      <div
        className={cn(
          "size-4 shrink-0 rounded-full border-[3px] border-white shadow-md dark:border-zinc-900",
          (selected || ring) && "ring-2 ring-blue-600 ring-offset-2 ring-offset-slate-100 dark:ring-offset-zinc-900",
        )}
        style={{ backgroundColor: meta.color }}
        title={displayLabel}
      />
      <p className="max-w-[6.5rem] text-center text-2xs font-semibold leading-tight text-slate-800 [overflow-wrap:anywhere] dark:text-zinc-100">
        {displayLabel}
      </p>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!size-2 !border-2 !border-white/90 !bg-slate-600 dark:!border-zinc-800 dark:!bg-zinc-400"
      />
    </div>
  )
}

const nodeTypes = { userTrend: UserTrendNode }

function EntityLegendPanel() {
  return (
    <Panel
      position="top-left"
      className="m-2 max-h-[min(42vh,320px)] w-[11.75rem] overflow-y-auto rounded-lg border border-slate-200 bg-white/95 p-2.5 text-left shadow-lg backdrop-blur-sm [scrollbar-width:thin] dark:border-zinc-700 dark:bg-zinc-950/95"
    >
      <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400">
        Entity types
      </p>
      <ul className="space-y-1.5">
        {Object.entries(USER_TREND_ENTITY_LEGEND).map(([key, v]) => (
          <li
            key={key}
            className="flex items-center gap-2 text-micro font-medium text-slate-800 dark:text-zinc-100"
          >
            <span
              className="size-2.5 shrink-0 rounded-full border border-white/50 shadow-sm dark:border-zinc-800"
              style={{ backgroundColor: v.color }}
            />
            {v.label}
          </li>
        ))}
      </ul>
    </Panel>
  )
}

function buildNeighborHighlight(
  nodeId: string,
  edges: Edge[],
): { nodeIds: Set<string>; edgeIds: Set<string> } {
  const nodeIds = new Set<string>([nodeId])
  const edgeIds = new Set<string>()
  for (const e of edges) {
    if (e.source === nodeId || e.target === nodeId) {
      nodeIds.add(e.source)
      nodeIds.add(e.target)
      edgeIds.add(e.id)
    }
  }
  return { nodeIds, edgeIds }
}

type UserTrendEdgeData = {
  edgeType?: string
  weight?: number
  lastSeen?: string
}

function UserTrendCanvas({
  graphData,
  flowClassName,
  filterQuery,
}: {
  graphData: unknown
  flowClassName?: string
  filterQuery?: string
}) {
  const { fitView } = useReactFlow()
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [highlightNodes, setHighlightNodes] = useState<Set<string> | null>(null)
  const [highlightEdges, setHighlightEdges] = useState<Set<string> | null>(null)

  const parsed = useMemo(() => parseUserTrendGraphData(graphData), [graphData])
  const hasEdges = parsed.edges.length > 0

  const { baseNodes, baseEdges, labelById } = useMemo(() => {
    if (!hasEdges) {
      return {
        baseNodes: [] as Node<UserTrendNodeData>[],
        baseEdges: [] as Edge[],
        labelById: new Map<string, string>(),
      }
    }
    const { nodes: n0, edges: e0, labelById: labels } = graphDataToFlow(parsed)
    const laid = layoutUserTrendForce(n0, e0)
    const edgesOut: Edge[] = e0.map((e) => ({
      ...e,
      type: "straight",
      markerEnd: undefined,
      style: {
        ...e.style,
        stroke: GRAPH_EDGE_COLOR,
        strokeWidth: 1,
        opacity: GRAPH_EDGE_OPACITY,
      },
    }))
    return { baseNodes: laid, baseEdges: edgesOut, labelById: labels }
  }, [parsed, hasEdges])

  const { initialNodes, initialEdges } = useMemo(() => {
    const q = (filterQuery ?? "").trim().toLowerCase()
    if (!q) {
      return { initialNodes: baseNodes, initialEdges: baseEdges }
    }
    const match = new Set(
      baseNodes
        .filter((n) =>
          ((n.data as UserTrendNodeData).displayLabel ?? "")
            .toLowerCase()
            .includes(q),
        )
        .map((n) => n.id),
    )
    if (match.size === 0) {
      return { initialNodes: baseNodes, initialEdges: baseEdges }
    }
    const edges = baseEdges.filter((e) => match.has(e.source) && match.has(e.target))
    const ids = new Set<string>()
    for (const e of edges) {
      ids.add(e.source)
      ids.add(e.target)
    }
    const nodes = baseNodes.filter((n) => ids.has(n.id)) as Node<UserTrendNodeData>[]
    const laid = layoutUserTrendForce(nodes, edges)
    const styledEdges = edges.map((e) => ({
      ...e,
      type: "straight" as const,
      markerEnd: undefined,
      style: {
        ...e.style,
        stroke: GRAPH_EDGE_COLOR,
        strokeWidth: 1,
        opacity: GRAPH_EDGE_OPACITY,
      },
    }))
    return { initialNodes: laid, initialEdges: styledEdges }
  }, [baseNodes, baseEdges, filterQuery])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  useEffect(() => {
    setNodes(initialNodes)
    setEdges(initialEdges)
    setSelectedNodeId(null)
    setHighlightNodes(null)
    setHighlightEdges(null)
    if (initialNodes.length > 0) {
      requestAnimationFrame(() => {
        fitView({ padding: 0.22, duration: 240 })
        requestAnimationFrame(() => fitView({ padding: 0.22, duration: 0 }))
      })
    }
  }, [initialNodes, initialEdges, setNodes, setEdges, fitView])

  const applyHighlight = useCallback(
    (hn: Set<string> | null, he: Set<string> | null, nodeSelected: string | null) => {
      setNodes((curr) =>
        curr.map((n) => ({
          ...n,
          data: {
            ...(n.data as UserTrendNodeData),
            dimmed: hn ? !hn.has(n.id) : false,
            ring: Boolean(nodeSelected && hn?.has(n.id) && n.id === nodeSelected),
          },
        })),
      )
      setEdges((curr) =>
        curr.map((e) => {
          const baseW =
            typeof e.style?.strokeWidth === "number" ? e.style.strokeWidth : 1
          const baseOp = GRAPH_EDGE_OPACITY
          const dimOp = 0.1
          const hiOp = 0.92
          let opacity = baseOp
          if (he) {
            opacity = he.has(e.id) ? hiOp : dimOp
          }
          return {
            ...e,
            style: {
              ...e.style,
              stroke: GRAPH_EDGE_COLOR,
              opacity,
              strokeWidth: nodeSelected && he?.has(e.id) ? baseW + 0.85 : baseW,
            },
            animated: Boolean(nodeSelected && he?.has(e.id)),
          }
        }),
      )
    },
    [setNodes, setEdges],
  )

  useEffect(() => {
    applyHighlight(highlightNodes, highlightEdges, selectedNodeId)
  }, [highlightNodes, highlightEdges, selectedNodeId, applyHighlight])

  const onNodeClick = useCallback(
    (_: MouseEvent, node: Node) => {
      if (selectedNodeId === node.id) {
        setSelectedNodeId(null)
        setHighlightNodes(null)
        setHighlightEdges(null)
        return
      }
      setSelectedNodeId(node.id)
      const { nodeIds, edgeIds } = buildNeighborHighlight(node.id, edges)
      setHighlightNodes(nodeIds)
      setHighlightEdges(edgeIds)
    },
    [selectedNodeId, edges],
  )

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null)
    setHighlightNodes(null)
    setHighlightEdges(null)
  }, [])

  const incidentEdges = useMemo(() => {
    if (!selectedNodeId) return []
    return edges.filter(
      (e) => e.source === selectedNodeId || e.target === selectedNodeId,
    )
  }, [selectedNodeId, edges])

  if (!hasEdges) {
    return null
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 px-0 sm:px-1">
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-none border-y border-slate-200/90 bg-slate-100 dark:border-zinc-800 dark:bg-zinc-950 sm:rounded-lg sm:border">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          nodesDraggable
          nodesConnectable={false}
          panOnScroll
          zoomOnScroll
          zoomOnDoubleClick={false}
          fitView
          minZoom={0.03}
          maxZoom={2.2}
          proOptions={{ hideAttribution: true }}
          className={cn("h-full w-full touch-none", flowClassName)}
          defaultEdgeOptions={{
            type: "straight",
            style: {
              stroke: GRAPH_EDGE_COLOR,
              strokeWidth: 1,
              opacity: GRAPH_EDGE_OPACITY,
            },
          }}
        >
          <Background
            id="user-trend-bg"
            variant={BackgroundVariant.Dots}
            gap={14}
            size={1}
            color="#94a3b8"
          />
          <EntityLegendPanel />
        </ReactFlow>
      </div>

      {selectedNodeId && incidentEdges.length > 0 && (
        <div className="mx-1 shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:mx-2">
          <p className="mb-1.5 font-semibold text-foreground">
            {labelById.get(selectedNodeId) ?? selectedNodeId}
          </p>
          <ul className="max-h-36 space-y-1.5 overflow-y-auto text-muted-foreground">
            {incidentEdges.map((e) => {
              const d = e.data as UserTrendEdgeData | undefined
              const other =
                e.source === selectedNodeId
                  ? labelById.get(e.target) ?? e.target
                  : labelById.get(e.source) ?? e.source
              return (
                <li
                  key={e.id}
                  className="border-b border-border/60 pb-1.5 last:border-0 last:pb-0"
                >
                  <span className="text-foreground">{other}</span>
                  {d?.edgeType != null && d.edgeType !== "" && (
                    <span className="ml-1 text-2xs uppercase tracking-wide">
                      · {d.edgeType}
                    </span>
                  )}
                  {d?.weight != null && (
                    <span className="ml-1">· weight {d.weight}</span>
                  )}
                  {d?.lastSeen != null && d.lastSeen !== "" && (
                    <span className="mt-0.5 block text-2xs text-muted-foreground/90">
                      {d.lastSeen}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

/**
 * Quick Actions entry: outline button (matches other dashboard actions) opens the full graph dialog.
 */
export function UserTrendGraph({
  graphData,
  updatedAt,
}: {
  graphData: unknown
  updatedAt: string | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [scope, setScope] = useState("all")

  const parsed = useMemo(() => parseUserTrendGraphData(graphData), [graphData])
  const hasEdges = parsed.edges.length > 0
  const summary = useMemo(() => userTrendGraphSummary(graphData), [graphData])

  useEffect(() => {
    if (!open) setSearch("")
  }, [open])

  const noDataTitle =
    "Relationship graph is not available yet—chat themes will populate this when ready."

  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={!hasEdges}
        title={!hasEdges ? noDataTitle : undefined}
        className="gap-2"
        onClick={() => setOpen(true)}
      >
        <Network className="size-4 shrink-0" aria-hidden />
        Relationship graph
      </Button>

      {hasEdges ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent
            showCloseButton
            overlayClassName="z-[125]"
            className={cn(
              "flex h-[100dvh] max-h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 p-0 shadow-none",
              /* Dialog default includes sm:max-w-lg — without this, desktop width stays ~32rem (~30% of screen). */
              "sm:max-w-none",
              "!inset-0 !left-0 !top-0 !z-[130] !translate-x-0 !translate-y-0",
              "data-[state=closed]:zoom-out-100",
            )}
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-background px-4 py-3 pr-14 dark:border-zinc-800">
              <DialogTitle className="text-left text-base font-semibold sm:text-lg">
                User relationship graph
              </DialogTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 gap-1.5"
                onClick={() => router.refresh()}
              >
                <RefreshCw className="size-3.5" aria-hidden />
                Refresh
              </Button>
            </div>
            <DialogDescription className="sr-only">
              Interactive relationship map from your researcher profile graph data.
              Search, pan, and zoom; click a node for connection details.
            </DialogDescription>

            <p className="shrink-0 border-b border-slate-200 px-4 py-2 text-xs text-muted-foreground dark:border-zinc-800">
              {summary.themeCount} themes · {summary.edgeCount} connections
              {updatedAt
                ? ` · updated ${new Date(updatedAt).toLocaleString()}`
                : ""}
            </p>

            <div className="flex shrink-0 flex-col gap-2 border-b border-slate-200 bg-background px-4 py-2 sm:flex-row sm:flex-wrap sm:items-center dark:border-zinc-800">
              <Input
                placeholder="Search graph…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 sm:max-w-[220px]"
                aria-label="Search graph"
              />
              <Select value={scope} onValueChange={setScope}>
                <SelectTrigger className="h-8 w-full sm:w-[120px]" aria-label="Scope">
                  <SelectValue placeholder="Scope" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2 sm:ml-auto">
                <Switch id="user-trend-episodes" disabled aria-hidden />
                <Label
                  htmlFor="user-trend-episodes"
                  className="cursor-not-allowed text-xs text-muted-foreground"
                >
                  Show episodes
                </Label>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-0 pb-0 pt-0">
              {open ? (
                <ReactFlowProvider>
                  <UserTrendCanvas
                    graphData={graphData}
                    filterQuery={search}
                    flowClassName="min-h-0 flex-1"
                  />
                </ReactFlowProvider>
              ) : null}
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  )
}
