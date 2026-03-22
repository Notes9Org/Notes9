"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Background,
  BackgroundVariant,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
  MarkerType,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import type {
  ResearchMapNodeKind,
  ResearchMapResponse,
} from "@/lib/research-map-types"
import {
  layoutResearchMap,
  RESEARCH_NODE_DIM,
  kindDotClass,
  kindLabel,
} from "@/lib/research-map-layout"
import { ResearchEntityNode } from "@/components/research-map/research-entity-node"
import type { ResearchEntityNodeData } from "@/components/research-map/research-entity-node"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

const nodeTypes = { researchEntity: ResearchEntityNode }

const KINDS: ResearchMapNodeKind[] = [
  "project",
  "experiment",
  "protocol",
  "literature",
  "lab_note",
]

/** Tables whose changes affect the research map graph (requires Realtime enabled in Supabase). */
const RESEARCH_MAP_REALTIME_TABLES = [
  "projects",
  "experiments",
  "protocols",
  "literature_reviews",
  "lab_notes",
  "experiment_protocols",
  "lab_note_protocols",
] as const

function buildComponentHighlight(
  edgeId: string,
  edges: Edge[],
): { nodeIds: Set<string>; edgeIds: Set<string> } {
  const edge = edges.find((e) => e.id === edgeId)
  if (!edge) return { nodeIds: new Set(), edgeIds: new Set() }

  const adj = new Map<string, Set<string>>()
  const link = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, new Set())
    if (!adj.has(b)) adj.set(b, new Set())
    adj.get(a)!.add(b)
    adj.get(b)!.add(a)
  }
  for (const e of edges) {
    link(e.source, e.target)
  }

  const seen = new Set<string>()
  const stack = [edge.source, edge.target]
  while (stack.length) {
    const u = stack.pop()!
    if (seen.has(u)) continue
    seen.add(u)
    for (const v of adj.get(u) ?? []) stack.push(v)
  }

  const edgeIds = new Set<string>()
  for (const e of edges) {
    if (seen.has(e.source) && seen.has(e.target)) edgeIds.add(e.id)
  }
  return { nodeIds: seen, edgeIds }
}

function mapApiToFlow(
  payload: ResearchMapResponse,
  labelQuery: string,
): { nodes: Node[]; edges: Edge[] } {
  const q = labelQuery.trim().toLowerCase()
  const nodesRaw = q
    ? payload.nodes.filter((n) => n.label.toLowerCase().includes(q))
    : payload.nodes
  const idSet = new Set(nodesRaw.map((n) => n.id))
  const edgesRaw = payload.edges.filter(
    (e) => idSet.has(e.source) && idSet.has(e.target),
  )

  const nodes: Node[] = nodesRaw.map((n) => {
    const data: ResearchEntityNodeData = {
      kind: n.kind,
      displayLabel: n.label,
      href: n.href,
    }
    return {
      id: n.id,
      type: "researchEntity",
      position: { x: 0, y: 0 },
      width: RESEARCH_NODE_DIM.width,
      height: RESEARCH_NODE_DIM.height,
      data,
    }
  })

  const edges: Edge[] = edgesRaw.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
    data: { kind: e.kind, humanLabel: e.label },
  }))

  return { nodes, edges }
}

function ResearchMapCanvas() {
  const router = useRouter()
  const { fitView, getEdges } = useReactFlow()
  const supabase = useMemo(() => createClient(), [])

  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
  const [projectId, setProjectId] = useState<string | "all">("all")
  const [include, setInclude] = useState<Record<ResearchMapNodeKind, boolean>>({
    project: true,
    experiment: true,
    protocol: true,
    literature: true,
    lab_note: true,
  })
  const [labelQuery, setLabelQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")

  const [loading, setLoading] = useState(true)
  const [rawPayload, setRawPayload] = useState<ResearchMapResponse | null>(null)

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [highlightNodes, setHighlightNodes] = useState<Set<string> | null>(
    null,
  )
  const [highlightEdges, setHighlightEdges] = useState<Set<string> | null>(
    null,
  )

  const truncationToastShown = useRef(false)
  const mapRefreshDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(labelQuery), 200)
    return () => clearTimeout(t)
  }, [labelQuery])

  const loadProjectOptions = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single()
    if (!profile?.organization_id) return
    const { data, error: pErr } = await supabase
      .from("projects")
      .select("id, name")
      .eq("organization_id", profile.organization_id)
      .order("name")
    if (!pErr) setProjects(data ?? [])
  }, [supabase])

  useEffect(() => {
    void loadProjectOptions()
  }, [loadProjectOptions])

  const includeTypesParam = useMemo(() => {
    const on = KINDS.filter((k) => include[k])
    return on.length === KINDS.length ? "" : on.join(",")
  }, [include])

  const fetchMap = useCallback(
    async (options?: { showLoadingOverlay?: boolean }) => {
      const showLoadingOverlay = options?.showLoadingOverlay ?? true
      if (!KINDS.some((k) => include[k])) {
        toast.message("Select at least one entity type.")
        return
      }
      if (showLoadingOverlay) setLoading(true)
      try {
        const params = new URLSearchParams()
        if (projectId !== "all") params.set("projectId", projectId)
        if (includeTypesParam) params.set("includeTypes", includeTypesParam)
        const res = await fetch(`/api/research-map?${params.toString()}`)
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          throw new Error(j.error || res.statusText)
        }
        const data = (await res.json()) as ResearchMapResponse
        setRawPayload(data)
        if (data.truncated) {
          if (!truncationToastShown.current) {
            truncationToastShown.current = true
            toast.message("Partial map", {
              description: `Showing a subset of your data (${data.truncatedReason || "limits"}). Narrow scope with filters or a project.`,
            })
          }
        } else {
          truncationToastShown.current = false
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Failed to load map"
        toast.error(msg)
        setRawPayload(null)
        setNodes([])
        setEdges([])
      } finally {
        if (showLoadingOverlay) setLoading(false)
      }
    },
    [projectId, includeTypesParam, include, setNodes, setEdges],
  )

  useEffect(() => {
    void fetchMap({ showLoadingOverlay: true })
  }, [fetchMap])

  const scheduleBackgroundMapRefresh = useCallback(() => {
    if (mapRefreshDebounceRef.current) {
      clearTimeout(mapRefreshDebounceRef.current)
    }
    mapRefreshDebounceRef.current = setTimeout(() => {
      mapRefreshDebounceRef.current = null
      void loadProjectOptions()
      void fetchMap({ showLoadingOverlay: false })
    }, 650)
  }, [fetchMap, loadProjectOptions])

  useEffect(() => {
    const channel = supabase.channel("research-map-graph")
    const handler = () => {
      scheduleBackgroundMapRefresh()
    }
    for (const table of RESEARCH_MAP_REALTIME_TABLES) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        handler,
      )
    }
    channel.subscribe()
    return () => {
      if (mapRefreshDebounceRef.current) {
        clearTimeout(mapRefreshDebounceRef.current)
        mapRefreshDebounceRef.current = null
      }
      supabase.removeChannel(channel)
    }
  }, [supabase, scheduleBackgroundMapRefresh])

  useEffect(() => {
    if (!rawPayload) {
      setNodes([])
      setEdges([])
      return
    }
    const { nodes: n0, edges: e0 } = mapApiToFlow(rawPayload, debouncedQuery)
    const laid = layoutResearchMap(n0, e0, "LR")
    setNodes(laid)
    setEdges(e0)
    setSelectedEdgeId(null)
    setHighlightNodes(null)
    setHighlightEdges(null)
    requestAnimationFrame(() => {
      fitView({ padding: 0.2, duration: 200 })
    })
  }, [rawPayload, debouncedQuery, setNodes, setEdges, fitView])

  const applyHighlightToGraph = useCallback(
    (hn: Set<string> | null, he: Set<string> | null, edgeSelected: string | null) => {
      setNodes((curr) =>
        curr.map((n) => ({
          ...n,
          data: {
            ...(n.data as ResearchEntityNodeData),
            dimmed: hn ? !hn.has(n.id) : false,
            ring: Boolean(edgeSelected && hn?.has(n.id)),
          },
        })),
      )
      setEdges((curr) =>
        curr.map((e) => {
          const inComp = he?.has(e.id) ?? false
          const isSel = e.id === edgeSelected
          return {
            ...e,
            style: {
              opacity: he && !he.has(e.id) ? 0.12 : 1,
              strokeWidth: isSel ? 3.2 : inComp ? 2.4 : 1.5,
            },
            animated: Boolean(isSel || (he && he.has(e.id))),
          }
        }),
      )
    },
    [setNodes, setEdges],
  )

  useEffect(() => {
    applyHighlightToGraph(highlightNodes, highlightEdges, selectedEdgeId)
  }, [highlightNodes, highlightEdges, selectedEdgeId, applyHighlightToGraph])

  const onNodeClick = useCallback((_: React.MouseEvent, _node: Node) => {
    setSelectedEdgeId(null)
    setHighlightNodes(null)
    setHighlightEdges(null)
  }, [])

  const onEdgeClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      setSelectedEdgeId(edge.id)
      const { nodeIds, edgeIds } = buildComponentHighlight(edge.id, getEdges())
      setHighlightNodes(nodeIds)
      setHighlightEdges(edgeIds)
    },
    [getEdges],
  )

  const onPaneClick = useCallback(() => {
    setSelectedEdgeId(null)
    setHighlightNodes(null)
    setHighlightEdges(null)
  }, [])

  const onNodeDoubleClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const href = (node.data as ResearchEntityNodeData)?.href
      if (href) router.push(href)
    },
    [router],
  )

  return (
    <div className="relative h-full min-h-[min(70vh,640px)] min-w-0 flex-1 overflow-hidden rounded-xl border bg-muted/20 lg:min-h-0">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-background/60 backdrop-blur-[1px]">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        )}
        <div className="absolute inset-0 min-h-0">
          <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          onNodeClick={onNodeClick}
          onNodeDoubleClick={onNodeDoubleClick}
          onEdgeClick={onEdgeClick}
          onPaneClick={onPaneClick}
          fitView
          minZoom={0.08}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
          className="h-full w-full rounded-xl"
          defaultEdgeOptions={{
            style: { stroke: "var(--border)", strokeWidth: 1.5 },
          }}
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
          <Panel
            position="top-left"
            className="m-2 flex max-w-[calc(100%-1rem)] flex-nowrap items-center gap-2 overflow-x-auto rounded-lg border bg-card/95 py-1.5 pl-2 pr-2 shadow-sm backdrop-blur-sm [scrollbar-width:thin]"
          >
            <Select
              value={projectId}
              onValueChange={(v) => setProjectId(v as typeof projectId)}
            >
              <SelectTrigger className="h-8 w-[min(160px,40vw)] shrink-0 text-xs">
                <SelectValue placeholder="Scope" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All accessible data</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={labelQuery}
              onChange={(e) => setLabelQuery(e.target.value)}
              placeholder="Filter by name…"
              className="h-8 w-[min(140px,28vw)] shrink-0 text-xs"
              aria-label="Filter by name"
            />
            {KINDS.map((k) => (
              <label
                key={k}
                className="flex shrink-0 cursor-pointer items-center gap-1 text-[11px] whitespace-nowrap"
              >
                <Checkbox
                  checked={include[k]}
                  onCheckedChange={(c) =>
                    setInclude((prev) => {
                      const next = { ...prev, [k]: Boolean(c) }
                      if (!KINDS.some((x) => next[x])) return prev
                      return next
                    })
                  }
                  className="size-3.5"
                />
                <span className="inline-flex items-center gap-1 font-medium">
                  <span
                    className={cn("size-1.5 shrink-0 rounded-full", kindDotClass(k))}
                  />
                  {kindLabel(k)}
                </span>
              </label>
            ))}
          </Panel>
        </ReactFlow>
        </div>
    </div>
  )
}

export function ResearchMapView() {
  return (
    <ReactFlowProvider>
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
        <ResearchMapCanvas />
      </div>
    </ReactFlowProvider>
  )
}
