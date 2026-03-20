"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent } from "react"
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Circle,
  CheckCircle2,
  ChevronRight,
  Clock3,
  ImagePlus,
  Maximize2,
  Minimize2,
  Play,
  RotateCcw,
  ShieldCheck,
  StickyNote,
  Sparkles,
  Square,
  Trash2,
  Upload,
  ZoomIn,
  ZoomOut,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

type AgentId =
  | "orchestrator"
  | "research"
  | "competitive"
  | "content"
  | "creative"
  | "presenter"

type RuntimeStatus = "idle" | "running" | "completed"

type AgentNode = {
  id: AgentId
  name: string
  role: string
  skillSummary: string
  enabled: boolean
  x: number
  y: number
  width: number
  height: number
  guardrails: Array<{ label: string; enabled: boolean }>
  rules: Array<{ label: string; enabled: boolean }>
}

const ORDERED_AGENT_IDS: AgentId[] = [
  "orchestrator",
  "research",
  "competitive",
  "content",
  "creative",
  "presenter",
]

const INITIAL_AGENTS: AgentNode[] = [
  {
    id: "orchestrator",
    name: "Marketing Orchestrator",
    role: "Sequences all stages and validates handoffs.",
    skillSummary: "Use when running end-to-end Notes9 Reddit + LinkedIn planning.",
    enabled: true,
    x: 5,
    y: 38,
    width: 180,
    height: 108,
    guardrails: [
      { label: "Require campaign brief before run", enabled: true },
      { label: "Block next stage when handoff is missing", enabled: true },
    ],
    rules: [
      { label: "Enforce source links in every stage", enabled: true },
      { label: "Enforce risk notes in every stage", enabled: true },
    ],
  },
  {
    id: "research",
    name: "Market Researcher",
    role: "Maps ICP, pain points, language, and channel opportunities.",
    skillSummary: "Produces evidence-backed research findings with confidence levels.",
    enabled: true,
    x: 23,
    y: 10,
    width: 180,
    height: 108,
    guardrails: [
      { label: "Separate facts from assumptions", enabled: true },
      { label: "Mark weak evidence as low confidence", enabled: true },
    ],
    rules: [
      { label: "Collect Reddit and LinkedIn audience signals", enabled: true },
      { label: "Output references for all key claims", enabled: true },
    ],
  },
  {
    id: "competitive",
    name: "Competitive Analyst",
    role: "Analyzes similar products and campaign patterns.",
    skillSummary: "Finds hooks, proof tactics, CTA patterns, and market gaps.",
    enabled: true,
    x: 41,
    y: 38,
    width: 180,
    height: 108,
    guardrails: [
      { label: "Use public attributable sources only", enabled: true },
      { label: "Avoid definitive performance claims", enabled: true },
    ],
    rules: [
      { label: "Track recurring campaign tactics by channel", enabled: true },
      { label: "Recommend tests for message, format, and CTA", enabled: true },
    ],
  },
  {
    id: "content",
    name: "Social Content Generator",
    role: "Generates platform-native Reddit and LinkedIn drafts.",
    skillSummary: "Creates 3-5 variants per channel with CTA options.",
    enabled: true,
    x: 59,
    y: 10,
    width: 180,
    height: 108,
    guardrails: [
      { label: "No unverifiable claims", enabled: true },
      { label: "No hype-heavy language", enabled: true },
    ],
    rules: [
      { label: "Reddit tone: practical + educational", enabled: true },
      { label: "LinkedIn tone: authority + B2B outcome", enabled: true },
    ],
  },
  {
    id: "creative",
    name: "Creative Designer",
    role: "Creates visual direction and asset briefs for selected posts.",
    skillSummary: "Translates winning copy into visual concepts and asset checklist.",
    enabled: true,
    x: 77,
    y: 38,
    width: 180,
    height: 108,
    guardrails: [
      { label: "Visuals must match approved copy claims", enabled: true },
      { label: "Preserve scientific credibility in style", enabled: true },
    ],
    rules: [
      { label: "Return concept, composition notes, and checklist", enabled: true },
      { label: "Provide rationale per channel", enabled: true },
    ],
  },
  {
    id: "presenter",
    name: "Campaign Presenter",
    role: "Builds executive-ready campaign pack and launch checklist.",
    skillSummary: "Summarizes strategy, outputs, risks, KPIs, and decisions.",
    enabled: true,
    x: 95,
    y: 10,
    width: 180,
    height: 108,
    guardrails: [
      { label: "Keep recommendations evidence-backed", enabled: true },
      { label: "Include assumptions and open questions", enabled: true },
    ],
    rules: [
      { label: "Produce concise decision-ready structure", enabled: true },
      { label: "Include KPI framework and timeline", enabled: true },
    ],
  },
]

type RunLog = {
  id: string
  ts: string
  message: string
  details?: string
}

type StageExecution = {
  id: string
  title: string
  output: string
}

type StageContext = {
  campaignName: string
  previousStages: StageExecution[]
  agent: AgentNode
}

type ExtraNode = {
  id: string
  kind: "shape" | "image"
  shapeType?: "rectangle" | "circle" | "note"
  label: string
  imageUrl?: string
  x: number
  y: number
  width: number
  height: number
}


function getStatusBadge(status: RuntimeStatus) {
  if (status === "running") return "bg-blue-500/10 text-blue-700 border-blue-500/20"
  if (status === "completed") return "bg-emerald-500/10 text-emerald-700 border-emerald-500/20"
  return "bg-muted text-muted-foreground border-border"
}

export function AgentWorkflowStudio() {
  const canvasRef = useRef<HTMLDivElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const [agents, setAgents] = useState<AgentNode[]>(INITIAL_AGENTS)
  const [extraNodes, setExtraNodes] = useState<ExtraNode[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState<AgentId>("orchestrator")
  const [selectedNodeId, setSelectedNodeId] = useState<string>("orchestrator")
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null)
  const [runtimeStatus, setRuntimeStatus] = useState<Record<AgentId, RuntimeStatus>>({
    orchestrator: "idle",
    research: "idle",
    competitive: "idle",
    content: "idle",
    creative: "idle",
    presenter: "idle",
  })
  const [running, setRunning] = useState(false)
  const [runLogs, setRunLogs] = useState<RunLog[]>([])
  const [stageExecutions, setStageExecutions] = useState<StageExecution[]>([])
  const [campaignName, setCampaignName] = useState("Q2 Notes9 Market Push")
  const [isCanvasExpanded, setIsCanvasExpanded] = useState(false)
  const [canvasHeight, setCanvasHeight] = useState(360)
  const [canvasZoom, setCanvasZoom] = useState(1)
  const [canvasPan, setCanvasPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [lastPointer, setLastPointer] = useState<{ x: number; y: number } | null>(null)
  const runAbortRef = useRef<AbortController | null>(null)

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? agents[0],
    [agents, selectedAgentId],
  )
  const selectedNode = useMemo(() => {
    const agent = agents.find((item) => item.id === selectedNodeId)
    if (agent)
      return { id: agent.id, label: agent.name, width: agent.width, height: agent.height, kind: "agent" as const }
    const extra = extraNodes.find((item) => item.id === selectedNodeId)
    if (extra)
      return { id: extra.id, label: extra.label, width: extra.width, height: extra.height, kind: extra.kind }
    return null
  }, [agents, extraNodes, selectedNodeId])

  const isAgentId = (value: string): value is AgentId =>
    ORDERED_AGENT_IDS.includes(value as AgentId)

  const runtimeOrder = useMemo(
    () =>
      agents
        .filter((agent) => agent.enabled)
        .map((agent) => agent.id)
        .filter((id) => ORDERED_AGENT_IDS.includes(id)),
    [agents],
  )

  const createLocalStageOutput = ({ campaignName, previousStages, agent }: StageContext) => {
    const previousSummary =
      previousStages.length === 0
        ? "No previous stage output."
        : previousStages
            .slice(-2)
            .map((stage) => `${stage.title}: ${stage.output.split("\n")[0]}`)
            .join(" | ")

    const activeGuardrails = agent.guardrails.filter((item) => item.enabled).map((item) => item.label)
    const activeRules = agent.rules.filter((item) => item.enabled).map((item) => item.label)

    const baseHeader = `## ${agent.name} Output\nCampaign: ${campaignName}\nRole: ${agent.role}`
    const governance = `\n### Active Guardrails\n${activeGuardrails.map((g) => `- ${g}`).join("\n") || "- none"}\n\n### Active Rules\n${activeRules.map((r) => `- ${r}`).join("\n") || "- none"}`

    if (agent.id === "research") {
      return `${baseHeader}\n\n### Audience Signals\n- Lab managers need fewer tool switches.\n- Researchers prefer practical workflows over generic AI claims.\n- Decision makers want evidence-backed differentiation.\n\n### Channel Notes\n- Reddit: educational problem-first angle.\n- LinkedIn: authority and workflow outcomes.\n\n### Context Used\n- ${previousSummary}${governance}`
    }

    if (agent.id === "competitive") {
      return `${baseHeader}\n\n### Competitive Pattern Snapshot\n- Most competitors emphasize automation buzzwords.\n- Few explain end-to-end research workflow continuity.\n- Strongest posts combine specific pain point + measurable outcome.\n\n### Test Opportunities\n- Compare "unified ELN+LIMS workflow" against "AI assistant" framing.\n- Test educational Reddit posts vs direct CTA posts.\n\n### Context Used\n- ${previousSummary}${governance}`
    }

    if (agent.id === "content") {
      return `${baseHeader}\n\n### Reddit Drafts\n- Draft A: "What slows research ops the most in your lab stack?"\n- Draft B: "How we reduced context switching in experiment documentation."\n\n### LinkedIn Drafts\n- Draft A: "Why agentic workflow orchestration matters for lab teams."\n- Draft B: "From fragmented tools to one research operating layer."\n\n### CTA Options\n- Book a workflow walkthrough\n- Request an early access demo\n\n### Context Used\n- ${previousSummary}${governance}`
    }

    if (agent.id === "creative") {
      return `${baseHeader}\n\n### Visual Concepts\n- Concept 1: Workflow before/after split panel.\n- Concept 2: Research lifecycle pipeline card set.\n\n### Asset Checklist\n- 2 static visuals for Reddit\n- 1 carousel pack for LinkedIn\n- 1 comparison visual for differentiation\n\n### Context Used\n- ${previousSummary}${governance}`
    }

    if (agent.id === "presenter") {
      return `${baseHeader}\n\n### Executive Summary\n- Campaign positions Notes9 as a unified research workflow layer.\n- Content mix balances educational trust-building and product intent.\n\n### Launch Plan\n1. Publish Reddit education-first post set.\n2. Publish LinkedIn authority post set.\n3. Review engagement and CTA quality after week 1.\n\n### KPI Draft\n- Engagement quality score\n- Qualified demo intent\n- Save/share rate on LinkedIn carousels\n\n### Context Used\n- ${previousSummary}${governance}`
    }

    return `${baseHeader}\n\n### Orchestration Notes\n- Stage sequence verified.\n- Runbook initialized.\n- Downstream stages will inherit active governance context.\n\n### Context Used\n- ${previousSummary}${governance}`
  }

  const sleep = (ms: number, signal: AbortSignal) =>
    new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => resolve(), ms)
      signal.addEventListener("abort", () => {
        window.clearTimeout(timer)
        reject(new DOMException("Aborted", "AbortError"))
      })
    })

  const completion = useMemo(() => {
    const total = runtimeOrder.length
    if (total === 0) return 0
    const done = runtimeOrder.filter((id) => runtimeStatus[id] === "completed").length
    return Math.round((done / total) * 100)
  }, [runtimeOrder.length, runtimeStatus])

  const buildRuntimeStatus = (activeIndex: number) => {
    const nextStatus: Record<AgentId, RuntimeStatus> = {
      orchestrator: "idle",
      research: "idle",
      competitive: "idle",
      content: "idle",
      creative: "idle",
      presenter: "idle",
    }
    runtimeOrder.forEach((id, index) => {
      if (index < activeIndex) nextStatus[id] = "completed"
      else if (index === activeIndex) nextStatus[id] = "running"
      else nextStatus[id] = "idle"
    })
    return nextStatus
  }

  const handleStart = async () => {
    if (running || runtimeOrder.length === 0) return

    const controller = new AbortController()
    runAbortRef.current = controller
    setRunning(true)
    setStageExecutions([])
    setRuntimeStatus(buildRuntimeStatus(-1))
    setRunLogs((previous) => [
      {
        id: `${Date.now()}_start`,
        ts: new Date().toLocaleTimeString(),
        message: `Started independent campaign run: ${campaignName}.`,
        details: `Workflow order: ${runtimeOrder.join(" -> ")}`,
      },
      ...previous,
    ])

    const stageResults: StageExecution[] = []

    try {
      for (let index = 0; index < runtimeOrder.length; index += 1) {
        const agentId = runtimeOrder[index]
        const agent = agents.find((item) => item.id === agentId)
        if (!agent) continue

        setSelectedAgentId(agent.id)
        setSelectedNodeId(agent.id)
        setRuntimeStatus(buildRuntimeStatus(index))
        setRunLogs((previous) => [
          {
            id: `${Date.now()}_${agent.id}_running`,
            ts: new Date().toLocaleTimeString(),
            message: `${agent.name} is running with local stage generation.`,
            details: `Guardrails:\n${agent.guardrails
              .filter((item) => item.enabled)
              .map((item) => `- ${item.label}`)
              .join("\n") || "- none"}\n\nRules:\n${agent.rules
              .filter((item) => item.enabled)
              .map((item) => `- ${item.label}`)
              .join("\n") || "- none"}`,
          },
          ...previous,
        ])

        await sleep(450, controller.signal)
        const output = createLocalStageOutput({
          campaignName,
          previousStages: stageResults,
          agent,
        }).trim()
        stageResults.push({
          id: agent.id,
          title: agent.name,
          output: output || "No output generated for this stage.",
        })
        setStageExecutions([...stageResults])

        setRunLogs((previous) => [
          {
            id: `${Date.now()}_${agent.id}_done`,
            ts: new Date().toLocaleTimeString(),
            message: `${agent.name} completed successfully.`,
            details: output,
          },
          ...previous,
        ])
      }

      setRuntimeStatus(buildRuntimeStatus(runtimeOrder.length))
      setRunLogs((previous) => [
        {
          id: `${Date.now()}_done`,
          ts: new Date().toLocaleTimeString(),
          message: "Campaign run complete. Outputs generated by the independent local workflow.",
          details: stageResults.map((stage) => `## ${stage.title}\n${stage.output}`).join("\n\n"),
        },
        ...previous,
      ])
    } catch (error) {
      const message =
        error instanceof Error && error.name === "AbortError"
          ? "Campaign run stopped by user."
          : error instanceof Error
            ? error.message
            : "Campaign run failed."
      setRunLogs((previous) => [
        {
          id: `${Date.now()}_error`,
          ts: new Date().toLocaleTimeString(),
          message,
          details: "Workflow halted before all enabled stages completed.",
        },
        ...previous,
      ])
    } finally {
      setRunning(false)
      runAbortRef.current = null
    }
  }

  const handleStop = () => {
    runAbortRef.current?.abort()
    runAbortRef.current = null
    setRunning(false)
    setRunLogs((previous) => [
      {
        id: `${Date.now()}_stop`,
        ts: new Date().toLocaleTimeString(),
        message: "Workflow stop requested by user.",
        details: `Completed stages so far: ${stageExecutions.map((stage) => stage.title).join(", ") || "none"}`,
      },
      ...previous,
    ])
  }

  const updateSkillSummary = (value: string) => {
    setAgents((previous) =>
      previous.map((agent) => (agent.id === selectedAgent.id ? { ...agent, skillSummary: value } : agent)),
    )
  }

  const updateRuleToggle = (index: number, enabled: boolean) => {
    setAgents((previous) =>
      previous.map((agent) =>
        agent.id === selectedAgent.id
          ? {
              ...agent,
              rules: agent.rules.map((rule, ruleIndex) =>
                ruleIndex === index ? { ...rule, enabled } : rule,
              ),
            }
          : agent,
      ),
    )
  }

  const updateGuardrailToggle = (index: number, enabled: boolean) => {
    setAgents((previous) =>
      previous.map((agent) =>
        agent.id === selectedAgent.id
          ? {
              ...agent,
              guardrails: agent.guardrails.map((guardrail, guardrailIndex) =>
                guardrailIndex === index ? { ...guardrail, enabled } : guardrail,
              ),
            }
          : agent,
      ),
    )
  }

  const updateAgentEnabled = (id: AgentId, enabled: boolean) => {
    setAgents((previous) =>
      previous.map((agent) => {
        if (agent.id !== id) return agent
        if (agent.id === "orchestrator") return { ...agent, enabled: true }
        return { ...agent, enabled }
      }),
    )
  }

  const moveAgent = (id: AgentId, direction: "up" | "down") => {
    setAgents((previous) => {
      const index = previous.findIndex((agent) => agent.id === id)
      if (index === -1) return previous
      if (id === "orchestrator") return previous
      const targetIndex = direction === "up" ? index - 1 : index + 1
      if (targetIndex < 1 || targetIndex >= previous.length) return previous
      const next = [...previous]
      ;[next[index], next[targetIndex]] = [next[targetIndex], next[index]]
      return next
    })
  }

  const worldToScreenPercent = (value: number) => 50 + (value - 50) * canvasZoom
  const screenToWorldPercent = (value: number) => 50 + (value - 50) / canvasZoom
  const worldToViewPercent = (x: number, y: number) => ({
    x: worldToScreenPercent(x) + canvasPan.x,
    y: worldToScreenPercent(y) + canvasPan.y,
  })
  const viewToWorldPercent = (x: number, y: number) => ({
    x: screenToWorldPercent(x - canvasPan.x),
    y: screenToWorldPercent(y - canvasPan.y),
  })

  const updateNodeSize = (id: string, nextWidth: number, nextHeight: number) => {
    const width = Math.min(420, Math.max(100, nextWidth))
    const height = Math.min(260, Math.max(60, nextHeight))
    setAgents((previous) =>
      previous.map((agent) => (agent.id === id ? { ...agent, width, height } : agent)),
    )
    setExtraNodes((previous) =>
      previous.map((node) => (node.id === id ? { ...node, width, height } : node)),
    )
  }

  const deleteNodeById = (id: string) => {
    const isAgent = isAgentId(id)
    if (id === "orchestrator") return

    if (isAgent) {
      setAgents((previous) => previous.filter((agent) => agent.id !== id))
      setRuntimeStatus((previous) => ({ ...previous, [id as AgentId]: "idle" }))
    } else {
      setExtraNodes((previous) => previous.filter((node) => node.id !== id))
    }

    setSelectedNodeId("orchestrator")
    setSelectedAgentId("orchestrator")
  }

  const canDeleteNode = (id: string) => id !== "orchestrator"

  const onNodeClick = (id: string) => {
    setSelectedNodeId(id)
    if (isAgentId(id)) setSelectedAgentId(id)
  }

  const moveNodeToClientPoint = (id: string, clientX: number, clientY: number) => {
    const canvasRect = canvasRef.current?.getBoundingClientRect()
    if (!canvasRect) return
    const viewX = ((clientX - canvasRect.left) / canvasRect.width) * 100
    const viewY = ((clientY - canvasRect.top) / canvasRect.height) * 100
    const { x, y } = viewToWorldPercent(viewX, viewY)
    setAgents((previous) =>
      previous.map((agent) => (agent.id === id ? { ...agent, x, y } : agent)),
    )
    setExtraNodes((previous) =>
      previous.map((node) => (node.id === id ? { ...node, x, y } : node)),
    )
  }

  const handleCanvasMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    if (isPanning && lastPointer) {
      const canvasRect = canvasRef.current?.getBoundingClientRect()
      if (canvasRect) {
        const dxPct = ((event.clientX - lastPointer.x) / canvasRect.width) * 100
        const dyPct = ((event.clientY - lastPointer.y) / canvasRect.height) * 100
        setCanvasPan((current) => ({ x: current.x + dxPct, y: current.y + dyPct }))
        setLastPointer({ x: event.clientX, y: event.clientY })
      }
      return
    }
    if (!draggingNodeId) return
    moveNodeToClientPoint(draggingNodeId, event.clientX, event.clientY)
  }

  const handleCanvasMouseUp = () => {
    setDraggingNodeId(null)
    setIsPanning(false)
    setLastPointer(null)
  }

  const handleCanvasWheel = useCallback((event: globalThis.WheelEvent) => {
    event.preventDefault()
    event.stopPropagation()
    if (event.ctrlKey || event.metaKey) {
      const zoomDelta = event.deltaY < 0 ? 0.08 : -0.08
      setCanvasZoom((current) => Math.max(0.4, Math.min(3.5, Number((current + zoomDelta).toFixed(2)))))
      return
    }

    const canvasRect = canvasRef.current?.getBoundingClientRect()
    if (!canvasRect) return
    const dxPct = (event.deltaX / canvasRect.width) * 100
    const dyPct = (event.deltaY / canvasRect.height) * 100
    setCanvasPan((current) => ({ x: current.x - dxPct, y: current.y - dyPct }))
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (event: globalThis.WheelEvent) => handleCanvasWheel(event)
    canvas.addEventListener("wheel", onWheel, { passive: false })
    return () => canvas.removeEventListener("wheel", onWheel)
  }, [handleCanvasWheel])

  const canvasHeightPx = isCanvasExpanded ? "78vh" : `${canvasHeight}px`
  const canvasVisual = useMemo(() => {
    return {
      backgroundColor: "#030405",
      glow: "radial-gradient(circle at center, rgba(148,163,184,0.025) 0%, transparent 72%)",
      nodeBg: "rgba(15,23,42,0.92)",
      nodeBorder: "rgba(148,163,184,0.38)",
      nodeText: "#e2e8f0",
      nodeSubtext: "#a8b8cc",
    }
  }, [])

  useEffect(() => {
    if (!isCanvasExpanded) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsCanvasExpanded(false)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [isCanvasExpanded])

  const addShapeNode = (shapeType: ExtraNode["shapeType"]) => {
    const id = `shape_${Date.now()}`
    const label =
      shapeType === "rectangle" ? "Rectangle" : shapeType === "circle" ? "Circle" : "Note"
    const center = viewToWorldPercent(52, 48)
    setExtraNodes((previous) => [
      ...previous,
      {
        id,
        kind: "shape",
        shapeType,
        label,
        x: center.x,
        y: center.y,
        width: shapeType === "note" ? 220 : 160,
        height: shapeType === "circle" ? 120 : 90,
      },
    ])
  }

  const addImageNode = (url: string) => {
    const trimmed = url.trim()
    if (!trimmed) return
    const center = viewToWorldPercent(54, 52)
    setExtraNodes((previous) => [
      ...previous,
      {
        id: `image_${Date.now()}`,
        kind: "image",
        label: "Image",
        imageUrl: trimmed,
        x: center.x,
        y: center.y,
        width: 220,
        height: 140,
      },
    ])
  }

  const handleImageFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file || !file.type.startsWith("image/")) return
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : ""
      if (result) addImageNode(result)
    }
    reader.readAsDataURL(file)
  }

  const completeRunLogText = runLogs
    .slice()
    .reverse()
    .map((log) => {
      const detailBlock = log.details ? `\n${log.details}` : ""
      return `[${log.ts}] ${log.message}${detailBlock}`
    })
    .join("\n\n")

  return (
    <div className="space-y-4">
      {isCanvasExpanded && <div className="fixed inset-0 z-40 bg-black/40" aria-hidden="true" />}
      <Card className="border-primary/20 bg-gradient-to-r from-primary/10 via-background to-secondary/10">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Agent Workflow Studio
          </CardTitle>
          <CardDescription>
            Visualize your Notes9 marketing agents on a canvas, click any agent to configure its skill/guardrails/rules, then run the workflow and observe execution in real time.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card
          className={cn(
            "xl:col-span-2",
            isCanvasExpanded && "fixed inset-4 z-50 m-0 overflow-auto shadow-2xl",
          )}
        >
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">Agent Canvas</CardTitle>
                <CardDescription>
                  Drag nodes to reposition. Enable connect mode to create custom links.
                </CardDescription>
              </div>
              <Badge variant="outline" className="border-primary/30 bg-primary/5">
                {completion}% completed
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div
              ref={canvasRef}
              className={cn(
                "relative rounded-lg border overflow-hidden",
                (draggingNodeId || isPanning) && "cursor-grabbing",
              )}
              style={{
                height: canvasHeightPx,
                backgroundColor: canvasVisual.backgroundColor,
                touchAction: "none",
              }}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={handleCanvasMouseUp}
              onMouseDown={(event) => {
                if (event.target !== event.currentTarget) return
                setIsPanning(true)
                setLastPointer({ x: event.clientX, y: event.clientY })
              }}
            >
              <div className="absolute right-3 top-3 z-30 flex items-center gap-1 rounded-md border bg-background/85 p-1 backdrop-blur">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label="Zoom out"
                  onClick={() => setCanvasZoom((current) => Math.max(0.4, Number((current - 0.1).toFixed(2))))}
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label="Zoom in"
                  onClick={() => setCanvasZoom((current) => Math.min(3.5, Number((current + 0.1).toFixed(2))))}
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label="Reset view"
                  onClick={() => {
                    setCanvasPan({ x: 0, y: 0 })
                    setCanvasZoom(1)
                  }}
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label="Add rectangle"
                  onClick={() => addShapeNode("rectangle")}
                >
                  <Square className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label="Add circle"
                  onClick={() => addShapeNode("circle")}
                >
                  <Circle className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label="Add note"
                  onClick={() => addShapeNode("note")}
                >
                  <StickyNote className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label="Add image URL"
                  onClick={() => {
                    const url = window.prompt("Paste image URL")
                    if (url) addImageNode(url)
                  }}
                >
                  <ImagePlus className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label="Upload image"
                  onClick={() => imageInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant={isCanvasExpanded ? "secondary" : "ghost"}
                  size="icon"
                  className="h-8 w-8"
                  aria-label={isCanvasExpanded ? "Collapse canvas" : "Expand canvas"}
                  onClick={() => setIsCanvasExpanded((previous) => !previous)}
                >
                  {isCanvasExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </Button>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageFileSelect}
                />
              </div>
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  background: canvasVisual.glow,
                }}
              />
              {agents.map((agent) => {
                const status = runtimeStatus[agent.id]
                const isSelected = selectedAgent.id === agent.id
                const isSelectedNode = selectedNodeId === agent.id
                return (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => onNodeClick(agent.id)}
                    onMouseDown={(event) => {
                      setSelectedAgentId(agent.id)
                      setDraggingNodeId(agent.id)
                      moveNodeToClientPoint(agent.id, event.clientX, event.clientY)
                    }}
                    className={cn(
                      "absolute -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background text-left p-3 shadow-sm transition cursor-grab",
                      isSelected && "ring-2 ring-primary/30 border-primary/40",
                      status === "running" && "border-blue-500/40 shadow-blue-500/10",
                      status === "completed" && "border-emerald-500/40 shadow-emerald-500/10",
                    )}
                    style={{
                      left: `${worldToViewPercent(agent.x, agent.y).x}%`,
                      top: `${worldToViewPercent(agent.x, agent.y).y}%`,
                      width: `${agent.width}px`,
                      height: `${agent.height}px`,
                      backgroundColor: canvasVisual.nodeBg,
                      borderColor: canvasVisual.nodeBorder,
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold leading-tight" style={{ color: canvasVisual.nodeText }}>
                        {agent.name}
                      </p>
                    </div>
                    <p className="text-xs mt-1 line-clamp-2" style={{ color: canvasVisual.nodeSubtext }}>
                      {agent.role}
                    </p>
                    <Badge variant="outline" className={cn("mt-2 text-[10px]", getStatusBadge(status))}>
                      {status}
                    </Badge>
                    {isSelectedNode && canDeleteNode(agent.id) && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(event) => {
                          event.stopPropagation()
                          deleteNodeById(agent.id)
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault()
                            deleteNodeById(agent.id)
                          }
                        }}
                        className="absolute -top-2 -right-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-destructive/50 bg-destructive text-destructive-foreground shadow-sm"
                        aria-label="Delete node"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </button>
                )
              })}
              {extraNodes.map((node) => {
                const pos = worldToViewPercent(node.x, node.y)
                const isCircle = node.shapeType === "circle"
                const isNote = node.shapeType === "note"
                const isSelectedNode = selectedNodeId === node.id
                return (
                  <div
                    key={node.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onNodeClick(node.id)}
                    onMouseDown={(event) => {
                      setDraggingNodeId(node.id)
                      moveNodeToClientPoint(node.id, event.clientX, event.clientY)
                    }}
                    className={cn(
                      "absolute -translate-x-1/2 -translate-y-1/2 border shadow-sm cursor-grab overflow-hidden",
                      isCircle ? "rounded-full" : "rounded-lg",
                      isNote && "border-amber-300 bg-amber-100/90",
                    )}
                    style={{
                      left: `${pos.x}%`,
                      top: `${pos.y}%`,
                      width: `${node.width}px`,
                      height: `${node.height}px`,
                      backgroundColor: node.kind === "image" ? "#ffffff" : isNote ? undefined : canvasVisual.nodeBg,
                      borderColor: isNote ? undefined : canvasVisual.nodeBorder,
                    }}
                  >
                    {node.kind === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={node.imageUrl} alt={node.label} className="h-full w-full object-cover" />
                    ) : (
                      <div className="p-2 text-xs font-medium" style={{ color: canvasVisual.nodeText }}>
                        {node.label}
                      </div>
                    )}
                    {isSelectedNode && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(event) => {
                          event.stopPropagation()
                          deleteNodeById(node.id)
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault()
                            deleteNodeById(node.id)
                          }
                        }}
                        className="absolute -top-2 -right-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-destructive/50 bg-destructive text-destructive-foreground shadow-sm"
                        aria-label="Delete node"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Simple canvas: drag nodes to reposition, pinch to zoom, and two-finger scroll to pan.
            </p>
            <div className="mt-3 space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Canvas height</span>
                <span>
                  {isCanvasExpanded ? "Auto (expanded)" : `${canvasHeight}px`} · Zoom {Math.round(canvasZoom * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={260}
                max={900}
                step={20}
                value={canvasHeight}
                disabled={isCanvasExpanded}
                onChange={(event) => setCanvasHeight(Number(event.target.value))}
                className="w-full accent-primary disabled:opacity-50"
                aria-label="Canvas height"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{selectedAgent.name}</CardTitle>
            <CardDescription>Skill profile, guardrails, and execution rules.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Skill Summary</Label>
              <Textarea
                value={selectedAgent.skillSummary}
                onChange={(event) => updateSkillSummary(event.target.value)}
                className="min-h-[90px]"
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <ShieldCheck className="h-4 w-4" />
                Guardrails
              </Label>
              <div className="space-y-2">
                {selectedAgent.guardrails.map((guardrail, index) => (
                  <div key={guardrail.label} className="flex items-center justify-between rounded-md border p-2">
                    <p className="text-xs pr-3">{guardrail.label}</p>
                    <Switch
                      checked={guardrail.enabled}
                      onCheckedChange={(checked) => updateGuardrailToggle(index, checked)}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4" />
                Rules
              </Label>
              <div className="space-y-2">
                {selectedAgent.rules.map((rule, index) => (
                  <div key={rule.label} className="flex items-center justify-between rounded-md border p-2">
                    <p className="text-xs pr-3">{rule.label}</p>
                    <Switch
                      checked={rule.enabled}
                      onCheckedChange={(checked) => updateRuleToggle(index, checked)}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Selected Node Size</Label>
              {!selectedNode && (
                <p className="text-xs text-muted-foreground rounded-md border p-2">
                  Click any node to resize it.
                </p>
              )}
              {selectedNode && (
                <div className="space-y-2 rounded-md border p-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">{selectedNode.label}</p>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => deleteNodeById(selectedNode.id)}
                      disabled={selectedNode.id === "orchestrator"}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[11px]">Width</Label>
                      <Input
                        type="number"
                        min={100}
                        max={420}
                        value={selectedNode.width}
                        onChange={(event) =>
                          updateNodeSize(
                            selectedNode.id,
                            Number(event.target.value) || selectedNode.width,
                            selectedNode.height,
                          )
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">Height</Label>
                      <Input
                        type="number"
                        min={60}
                        max={260}
                        value={selectedNode.height}
                        onChange={(event) =>
                          updateNodeSize(
                            selectedNode.id,
                            selectedNode.width,
                            Number(event.target.value) || selectedNode.height,
                          )
                        }
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Workflow Order</Label>
              <div className="space-y-2 rounded-md border p-2">
                {agents.map((agent, index) => (
                  <div key={agent.id} className="flex items-center gap-2 rounded-md border p-2">
                    <Switch
                      checked={agent.enabled}
                      onCheckedChange={(checked) => updateAgentEnabled(agent.id, checked)}
                      disabled={agent.id === "orchestrator" || running}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium">{agent.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        Step {index + 1} {agent.enabled ? "enabled" : "disabled"}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => moveAgent(agent.id, "up")}
                      disabled={running || agent.id === "orchestrator" || index <= 1}
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => moveAgent(agent.id, "down")}
                      disabled={running || agent.id === "orchestrator" || index === agents.length - 1}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <p className="text-[11px] text-muted-foreground">
                  Stop the workflow, change enabled stages or order, then start again to run the new flow.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Live Workflow Runtime
            </CardTitle>
            <CardDescription>
              Start a campaign run to see stage-by-stage execution updates in real time.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="campaign-name">Campaign Name</Label>
                <Input
                  id="campaign-name"
                  value={campaignName}
                  onChange={(event) => setCampaignName(event.target.value)}
                />
              </div>
              <div className="flex items-end gap-2">
                {!running ? (
                  <Button onClick={handleStart} className="w-full">
                    <Play className="h-4 w-4 mr-2" />
                    Start Run
                  </Button>
                ) : (
                  <Button onClick={handleStop} variant="outline" className="w-full">
                    <Square className="h-4 w-4 mr-2" />
                    Pause Run
                  </Button>
                )}
              </div>
            </div>

            <Progress value={completion} />

            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {runtimeOrder.map((id, index) => {
                const node = agents.find((agent) => agent.id === id)
                if (!node) return null
                const status = runtimeStatus[id]
                return (
                  <div key={id} className="rounded-md border p-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold">{node.name}</p>
                      <Badge variant="outline" className={cn("text-[10px]", getStatusBadge(status))}>
                        {status}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Stage {index + 1} {status === "running" ? "is active now" : ""}
                    </p>
                  </div>
                )
              })}
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Generated Outputs</p>
              {stageExecutions.length === 0 && (
                <p className="text-xs text-muted-foreground rounded-md border p-2">
                  Start a run to generate real stage outputs.
                </p>
              )}
              {stageExecutions.map((stage) => (
                <div key={stage.id} className="rounded-md border p-2">
                  <p className="text-xs font-semibold">{stage.title}</p>
                  <p className="mt-1 max-h-32 overflow-auto text-xs text-muted-foreground whitespace-pre-wrap">
                    {stage.output}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock3 className="h-4 w-4" />
                  Run Timeline
                </CardTitle>
                <CardDescription>Newest event appears at the top.</CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={async () => {
                  if (!completeRunLogText) return
                  await navigator.clipboard.writeText(completeRunLogText)
                }}
                disabled={!completeRunLogText}
              >
                Copy Logs
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[360px] overflow-auto">
            {runLogs.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No runtime events yet. Click <span className="font-medium">Start Run</span> to begin.
              </p>
            )}
            {runLogs.map((log) => (
              <div key={log.id} className="rounded-md border p-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <ChevronRight className="h-3 w-3" />
                  {log.ts}
                </div>
                <p className="text-xs mt-1">{log.message}</p>
                {log.details && (
                  <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-muted/40 p-2 text-[11px] text-muted-foreground">
                    {log.details}
                  </pre>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
