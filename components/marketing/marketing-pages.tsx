"use client"
import { useEffect, useState } from "react"
import {
  BookOpen,
  Bot,
  Database,
  FileSearch,
  FileText,
  FlaskConical,
  FolderKanban,
  GraduationCap,
  LayoutDashboard,
  LineChart,
  Microscope,
  Settings,
  ShieldCheck,
  Sparkles,
  TestTube2,
  Users,
  Workflow,
} from "lucide-react"
import {
  addEdge,
  Background,
  BackgroundVariant,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  PanOnScrollMode,
  reconnectEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"

import {
  CTAPanel,
  FeatureCard,
  LinkCard,
  MarketingPageFrame,
  PageHero,
  SectionHeader,
  WorkflowStep,
} from "@/components/marketing/site-ui"
import { MinimalCard, ProductFrame } from "@/components/marketing/three-d-card"
import { ProductShowcase } from "@/components/marketing/video-showcase"
import { IceMascot } from "@/components/ui/ice-mascot"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"

const cta = "/#contact"
const CONNECTED_LAYOUT_STORAGE_KEY = "notes9-platform-connected-layout"

function mergeSavedConnectedLayout(savedLayout: unknown): ComparisonFlowNode[] {
  if (!Array.isArray(savedLayout)) return connectedNodes

  const savedPositions = new Map<string, { x: number; y: number }>()

  for (const item of savedLayout) {
    if (
      typeof item === "object" &&
      item !== null &&
      "id" in item &&
      "position" in item &&
      typeof item.id === "string" &&
      typeof item.position === "object" &&
      item.position !== null &&
      "x" in item.position &&
      "y" in item.position &&
      typeof item.position.x === "number" &&
      typeof item.position.y === "number"
    ) {
      savedPositions.set(item.id, { x: item.position.x, y: item.position.y })
    }
  }

  if (savedPositions.size === 0) return connectedNodes

  return connectedNodes.map((node) => {
    const savedPosition = savedPositions.get(node.id)
    return savedPosition ? { ...node, position: savedPosition } : node
  })
}
const resourceGuides = [
  {
    id: "projects",
    title: "Projects",
    description: "Organize research into structured projects that hold experiments, notes, and supporting context together.",
    icon: LayoutDashboard,
    bullets: [
      "Create a project with a clear objective, owner, timeline, and working description.",
      "Use the project as the parent layer for experiments, linked notes, and reporting context.",
      "Review status and progress from one place instead of reconstructing updates manually.",
    ],
  },
  {
    id: "experiments",
    title: "Experiments",
    description: "Capture execution details, protocol context, and outcomes in a reusable experimental record.",
    icon: FlaskConical,
    bullets: [
      "Create experiments inside the relevant project so execution stays tied to purpose.",
      "Link protocols where needed and document deviations or observations as the work unfolds.",
      "Attach files, data, and outcomes directly to the experiment rather than scattering them across tools.",
    ],
  },
  {
    id: "protocols",
    title: "Protocols",
    description: "Build reusable SOPs and process templates that improve consistency across teams.",
    icon: FileText,
    bullets: [
      "Version protocols so teams know which procedure is current.",
      "Keep categories and naming conventions consistent for retrieval.",
      "Reuse protocols inside experiments to reduce setup friction and improve reproducibility.",
    ],
  },
  {
    id: "samples",
    title: "Samples",
    description: "Track physical materials, storage context, and experimental relationships in one inventory flow.",
    icon: TestTube2,
    bullets: [
      "Register samples with clear identifiers, type, storage details, and origin.",
      "Link samples to relevant experiments so material provenance stays visible.",
      "Use the sample record as the durable reference point for future work and review.",
    ],
  },
  {
    id: "lab-notes",
    title: "Lab Notes",
    description: "Record day-to-day observations and working notes without losing experiment context.",
    icon: BookOpen,
    bullets: [
      "Create notes inside experiment workflows so daily documentation stays attached to active work.",
      "Use the editor to capture observations, rationale, and supporting evidence in one place.",
      "Retrieve existing notes later from the lab notes workspace instead of searching across disconnected documents.",
    ],
  },
  {
    id: "literature",
    title: "Literature Reviews",
    description: "Search, stage, save, and review papers while preserving why they matter to the project.",
    icon: FileSearch,
    bullets: [
      "Use live search to find relevant papers and review ranked results before saving anything.",
      "Stage the strongest papers before adding them to the repository.",
      "Keep personal notes and relevance judgments alongside the citation rather than in a separate system.",
    ],
  },
  {
    id: "catalyst",
    title: "Catalyst AI",
    description: "Use AI assistance where it accelerates retrieval, drafting, and synthesis without replacing oversight.",
    icon: Bot,
    bullets: [
      "Summarize documents, draft structured content, or explore hypotheses from the current workflow context.",
      "Treat outputs as accelerants for serious work, not substitutes for scientific review.",
      "Use the surrounding project and note structure to keep AI interactions grounded in real work.",
    ],
  },
  {
    id: "settings",
    title: "Settings and Workspace",
    description: "Manage workspace preferences, account details, and data operations in one place.",
    icon: Settings,
    bullets: [
      "Update profile and workspace preferences without disrupting active work.",
      "Review data transfer and account controls from a predictable settings surface.",
      "Use this area for governance and maintenance, not workflow execution.",
    ],
  },
]

const resourceFaqs = [
  {
    question: "Where should a new team start?",
    answer:
      "Start with one active workflow that already suffers from context loss. Set up a project, create the experiment structure, and document one real note trail before trying to model everything.",
  },
  {
    question: "Should teams begin with literature, experiments, or notes?",
    answer:
      "Begin where the current pain is strongest. If evidence retrieval is the main problem, start with literature. If execution handoffs are weak, start with experiments and lab notes.",
  },
  {
    question: "How should Notes9 be evaluated?",
    answer:
      "Evaluate it against a live workflow rather than a generic feature checklist. Compare retrieval speed, reporting effort, and how much context remains attached after real work is recorded.",
  },
]

const platformVideoClips = [
  {
    title: "Find signal faster",
    description: "Search, stage, and review the papers that matter without breaking the workflow.",
    video: "/demo/platform-literature-search.mp4",
    poster: "/demo/light/literature-search.png",
    icon: FileSearch,
    eyebrow: "Literature",
  },
  {
    title: "See the work in context",
    description: "Track linked records and context trails instead of reconstructing what happened later.",
    video: "/demo/platform-research-map.mp4",
    poster: "/demo/light/experiment-details.png",
    icon: FlaskConical,
    eyebrow: "Experiments",
  },
  {
    title: "Follow the research graph",
    description: "Move through connected project structure with a visual map of the workflow.",
    video: "/demo/platform-experiments.mp4",
    poster: "/demo/light/research-map.png",
    icon: FolderKanban,
    eyebrow: "Research Map",
  },
  {
    title: "Turn sources into writing",
    description: "Read, annotate, and move from evidence to output in one continuous workspace.",
    video: "/demo/platform-writing.mp4",
    poster: "/demo/light/writing.png",
    icon: FileText,
    eyebrow: "Writing",
  },
]

type ComparisonNodeData = {
  label: string
  icon?: typeof FileSearch
  tone?: "amber" | "sky" | "emerald" | "violet" | "rose" | "slate"
  hub?: boolean
  role?: "default" | "projects" | "experiments" | "literature" | "writing" | "reports"
  editable?: boolean
}

type ComparisonFlowNode = Node<ComparisonNodeData, "comparisonNode">

const toneClasses: Record<NonNullable<ComparisonNodeData["tone"]>, string> = {
  amber:
    "border-[#f0d2ab] bg-[#fff1df] text-[#b96d1a] dark:border-[#7a5a35] dark:bg-[linear-gradient(180deg,rgba(69,47,23,0.92),rgba(42,30,17,0.95))] dark:text-[#f8d69c]",
  sky:
    "border-[#c6deef] bg-[#e9f4fb] text-[#3176a9] dark:border-[#355e79] dark:bg-[linear-gradient(180deg,rgba(20,44,58,0.94),rgba(15,31,43,0.96))] dark:text-[#9fd8ff]",
  emerald:
    "border-[#c9e7d2] bg-[#eaf7ee] text-[#2d875a] dark:border-[#2f6b4c] dark:bg-[linear-gradient(180deg,rgba(21,49,33,0.94),rgba(16,36,25,0.96))] dark:text-[#9de0ba]",
  violet:
    "border-[#dcc9f0] bg-[#f3ebfa] text-[#7f58a8] dark:border-[#5a4577] dark:bg-[linear-gradient(180deg,rgba(42,29,61,0.95),rgba(28,20,43,0.97))] dark:text-[#d5bcff]",
  rose:
    "border-[#efcdc9] bg-[#fceceb] text-[#b75c52] dark:border-[#7b4743] dark:bg-[linear-gradient(180deg,rgba(63,29,28,0.95),rgba(40,20,20,0.97))] dark:text-[#ffb7aa]",
  slate:
    "border-border/60 bg-muted/30 text-muted-foreground dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(37,37,41,0.94),rgba(26,26,30,0.97))] dark:text-slate-200",
}

const connectedNodes: ComparisonFlowNode[] = [
  {
    id: "c-projects",
    type: "comparisonNode",
    position: { x: 0, y: 260 },
    data: { label: "Projects", icon: FolderKanban, tone: "amber", role: "projects" },
  },
  {
    id: "c-literature",
    type: "comparisonNode",
    position: { x: 1200, y: 36 },
    data: { label: "Literature", icon: FileSearch, tone: "amber", role: "literature" },
  },
  {
    id: "c-experiments",
    type: "comparisonNode",
    position: { x: 240, y: 260 },
    data: { label: "Experiments", icon: FlaskConical, tone: "sky", role: "experiments" },
  },
  {
    id: "c-lab-notes",
    type: "comparisonNode",
    position: { x: 850, y: 36 },
    data: { label: "Lab Notes", icon: BookOpen, tone: "emerald" },
  },
  {
    id: "c-protocols",
    type: "comparisonNode",
    position: { x: 850, y: 178 },
    data: { label: "Protocols", icon: FileText, tone: "violet" },
  },
  {
    id: "c-samples",
    type: "comparisonNode",
    position: { x: 850, y: 320 },
    data: { label: "Samples", icon: TestTube2, tone: "sky" },
  },
  {
    id: "c-equipment",
    type: "comparisonNode",
    position: { x: 850, y: 462 },
    data: { label: "Equipment", icon: Microscope, tone: "sky" },
  },
  {
    id: "c-hub",
    type: "comparisonNode",
    position: { x: 480, y: 236 },
    data: { label: "Catalyst AI", hub: true },
  },
  {
    id: "c-reports",
    type: "comparisonNode",
    position: { x: 1200, y: 356 },
    data: { label: "Reports", icon: LineChart, tone: "rose", role: "reports" },
  },
  {
    id: "c-writing",
    type: "comparisonNode",
    position: { x: 1200, y: 520 },
    data: { label: "Writing", icon: FileText, tone: "violet", role: "writing" },
  },
]

const connectedEdges: Edge[] = [
  {
    id: "c-structure-1",
    source: "c-projects",
    target: "c-experiments",
    type: "smoothstep",
    sourceHandle: "right",
    targetHandle: "left",
    style: { stroke: "rgba(184,121,69,0.9)", strokeWidth: 3.2 },
    markerEnd: { type: MarkerType.ArrowClosed, color: "rgba(184,121,69,0.94)", width: 26, height: 26 },
  },
  {
    id: "c-structure-1b",
    source: "c-projects",
    target: "c-literature",
    type: "smoothstep",
    sourceHandle: "top-right",
    targetHandle: "left-center",
    style: {
      stroke: "rgba(184,121,69,0.62)",
      strokeWidth: 2.4,
      strokeDasharray: "7 8",
    },
    markerEnd: { type: MarkerType.ArrowClosed, color: "rgba(184,121,69,0.78)", width: 22, height: 22 },
  },
  {
    id: "c-structure-2",
    source: "c-experiments",
    target: "c-lab-notes",
    type: "smoothstep",
    sourceHandle: "branch-1",
    targetHandle: "left",
    style: { stroke: "rgba(184,121,69,0.9)", strokeWidth: 3 },
    markerEnd: { type: MarkerType.ArrowClosed, color: "rgba(184,121,69,0.94)", width: 25, height: 25 },
  },
  {
    id: "c-structure-3",
    source: "c-experiments",
    target: "c-protocols",
    type: "smoothstep",
    sourceHandle: "branch-2",
    targetHandle: "left",
    style: { stroke: "rgba(184,121,69,0.9)", strokeWidth: 3 },
    markerEnd: { type: MarkerType.ArrowClosed, color: "rgba(184,121,69,0.94)", width: 25, height: 25 },
  },
  {
    id: "c-structure-4",
    source: "c-experiments",
    target: "c-samples",
    type: "smoothstep",
    sourceHandle: "branch-3",
    targetHandle: "left",
    style: { stroke: "rgba(184,121,69,0.9)", strokeWidth: 3 },
    markerEnd: { type: MarkerType.ArrowClosed, color: "rgba(184,121,69,0.94)", width: 25, height: 25 },
  },
  {
    id: "c-structure-5",
    source: "c-experiments",
    target: "c-equipment",
    type: "smoothstep",
    sourceHandle: "branch-4",
    targetHandle: "left",
    style: { stroke: "rgba(184,121,69,0.9)", strokeWidth: 3 },
    markerEnd: { type: MarkerType.ArrowClosed, color: "rgba(184,121,69,0.94)", width: 25, height: 25 },
  },
  {
    id: "c-structure-6",
    source: "c-literature",
    target: "c-experiments",
    type: "smoothstep",
    sourceHandle: "left",
    targetHandle: "top-center",
    style: {
      stroke: "rgba(184,121,69,0.62)",
      strokeWidth: 2.4,
      strokeDasharray: "7 8",
    },
    markerEnd: { type: MarkerType.ArrowClosed, color: "rgba(184,121,69,0.78)", width: 22, height: 22 },
  },
  {
    id: "c-ai-1",
    source: "c-projects",
    target: "c-hub",
    type: "smoothstep",
    sourceHandle: "ai-right",
    targetHandle: "left-top",
    style: { stroke: "rgba(184,121,69,0.54)", strokeWidth: 2.2, strokeDasharray: "8 9" },
    markerEnd: { type: MarkerType.ArrowClosed, color: "rgba(184,121,69,0.88)", width: 22, height: 22 },
  },
  {
    id: "c-ai-2",
    source: "c-experiments",
    target: "c-hub",
    type: "smoothstep",
    sourceHandle: "ai-right",
    targetHandle: "left-mid-top",
    style: { stroke: "rgba(184,121,69,0.54)", strokeWidth: 2.2, strokeDasharray: "8 9" },
    markerEnd: { type: MarkerType.ArrowClosed, color: "rgba(184,121,69,0.84)", width: 22, height: 22 },
  },
  {
    id: "c-ai-3",
    source: "c-lab-notes",
    target: "c-hub",
    type: "smoothstep",
    sourceHandle: "right",
    targetHandle: "left-mid",
    style: { stroke: "rgba(184,121,69,0.54)", strokeWidth: 2.15, strokeDasharray: "8 9" },
    markerEnd: { type: MarkerType.ArrowClosed, color: "rgba(184,121,69,0.84)", width: 21, height: 21 },
  },
  {
    id: "c-ai-4",
    source: "c-protocols",
    target: "c-hub",
    type: "smoothstep",
    sourceHandle: "right",
    targetHandle: "left-mid-low",
    style: { stroke: "rgba(184,121,69,0.54)", strokeWidth: 2.15, strokeDasharray: "8 9" },
    markerEnd: { type: MarkerType.ArrowClosed, color: "rgba(184,121,69,0.84)", width: 21, height: 21 },
  },
  {
    id: "c-ai-5",
    source: "c-samples",
    target: "c-hub",
    type: "smoothstep",
    sourceHandle: "right",
    targetHandle: "left-low",
    style: { stroke: "rgba(184,121,69,0.54)", strokeWidth: 2.15, strokeDasharray: "8 9" },
    markerEnd: { type: MarkerType.ArrowClosed, color: "rgba(184,121,69,0.84)", width: 21, height: 21 },
  },
  {
    id: "c-ai-6",
    source: "c-equipment",
    target: "c-hub",
    type: "smoothstep",
    sourceHandle: "right",
    targetHandle: "right-mid",
    style: { stroke: "rgba(184,121,69,0.54)", strokeWidth: 2.15, strokeDasharray: "8 9" },
    markerEnd: { type: MarkerType.ArrowClosed, color: "rgba(184,121,69,0.84)", width: 21, height: 21 },
  },
  {
    id: "c-ai-7",
    source: "c-literature",
    target: "c-hub",
    type: "smoothstep",
    sourceHandle: "left",
    targetHandle: "top-right",
    style: { stroke: "rgba(184,121,69,0.54)", strokeWidth: 2.15, strokeDasharray: "8 9" },
    markerEnd: { type: MarkerType.ArrowClosed, color: "rgba(184,121,69,0.84)", width: 21, height: 21 },
  },
  {
    id: "c-write-1",
    source: "c-literature",
    target: "c-writing",
    type: "smoothstep",
    sourceHandle: "bottom",
    targetHandle: "top-center",
    style: { stroke: "rgba(184,121,69,0.6)", strokeWidth: 2.35, strokeDasharray: "8 9" },
    markerEnd: { type: MarkerType.ArrowClosed, color: "rgba(184,121,69,0.88)", width: 22, height: 22 },
  },
  {
    id: "c-write-2",
    source: "c-lab-notes",
    target: "c-writing",
    type: "smoothstep",
    sourceHandle: "right",
    targetHandle: "left-top",
    style: { stroke: "rgba(184,121,69,0.6)", strokeWidth: 2.2, strokeDasharray: "8 9" },
    markerEnd: { type: MarkerType.ArrowClosed, color: "rgba(184,121,69,0.84)", width: 21, height: 21 },
  },
  {
    id: "c-write-3",
    source: "c-protocols",
    target: "c-writing",
    type: "smoothstep",
    sourceHandle: "right",
    targetHandle: "left-mid",
    style: { stroke: "rgba(184,121,69,0.6)", strokeWidth: 2.2, strokeDasharray: "8 9" },
    markerEnd: { type: MarkerType.ArrowClosed, color: "rgba(184,121,69,0.84)", width: 21, height: 21 },
  },
  {
    id: "c-write-4",
    source: "c-hub",
    target: "c-writing",
    type: "smoothstep",
    sourceHandle: "bottom-center",
    targetHandle: "top-center",
    style: { stroke: "rgba(184,121,69,0.62)", strokeWidth: 2.35, strokeDasharray: "8 9" },
    markerEnd: { type: MarkerType.ArrowClosed, color: "rgba(184,121,69,0.88)", width: 21, height: 21 },
  },
  {
    id: "c-write-5",
    source: "c-projects",
    target: "c-writing",
    type: "smoothstep",
    sourceHandle: "bottom-right",
    targetHandle: "left-center",
    style: { stroke: "rgba(184,121,69,0.6)", strokeWidth: 2.2, strokeDasharray: "8 9" },
    markerEnd: { type: MarkerType.ArrowClosed, color: "rgba(184,121,69,0.84)", width: 21, height: 21 },
  },
  {
    id: "c-feedback-1",
    source: "c-experiments",
    target: "c-reports",
    type: "smoothstep",
    sourceHandle: "bottom-right",
    targetHandle: "left-low",
    style: { stroke: "rgba(184,121,69,0.86)", strokeWidth: 2.8 },
    markerEnd: { type: MarkerType.ArrowClosed, color: "rgba(184,121,69,0.92)", width: 24, height: 24 },
  },
  {
    id: "c-ai-8",
    source: "c-reports",
    target: "c-hub",
    type: "smoothstep",
    sourceHandle: "left",
    targetHandle: "right-mid",
    style: { stroke: "rgba(184,121,69,0.54)", strokeWidth: 2.15, strokeDasharray: "8 9" },
    markerEnd: { type: MarkerType.ArrowClosed, color: "rgba(184,121,69,0.84)", width: 21, height: 21 },
  },
  {
    id: "c-output-1",
    source: "c-reports",
    target: "c-writing",
    type: "smoothstep",
    sourceHandle: "bottom",
    targetHandle: "top",
    style: { stroke: "rgba(184,121,69,0.86)", strokeWidth: 2.9 },
    markerEnd: { type: MarkerType.ArrowClosed, color: "rgba(184,121,69,0.92)", width: 25, height: 25 },
  },
]

const comparisonNodeTypes = { comparisonNode: ComparisonNode }

function ComparisonNode({ data }: NodeProps<ComparisonFlowNode>) {
  const handleClass = data.editable
    ? "!h-3.5 !w-3.5 !border-2 !border-white !bg-[var(--n9-accent)] !opacity-100 shadow-[0_0_0_4px_rgba(184,121,69,0.16)]"
    : "!h-0 !w-0 !border-0 !bg-transparent !opacity-0"

  if (data.hub) {
    return (
      <div className="nopan relative w-[360px] rounded-[38px] border border-[var(--n9-accent)]/25 bg-[linear-gradient(180deg,rgba(250,244,238,0.98),rgba(255,255,255,0.94))] p-9 text-center shadow-[0_42px_120px_-44px_rgba(155,71,34,0.38)] dark:border-[var(--n9-accent)]/20 dark:bg-[radial-gradient(circle_at_top,rgba(184,121,69,0.16),transparent_44%),linear-gradient(180deg,rgba(33,27,23,0.98),rgba(17,16,19,0.98))] dark:shadow-[0_42px_120px_-44px_rgba(0,0,0,0.72)]">
        <Handle id="top-left" type="target" position={Position.Top} style={{ left: "18%" }} className={handleClass} />
        <Handle id="top-center" type="target" position={Position.Top} style={{ left: "50%" }} className={handleClass} />
        <Handle id="top-right" type="target" position={Position.Top} style={{ left: "82%" }} className={handleClass} />
        <Handle id="left-top" type="target" position={Position.Left} style={{ top: "26%" }} className={handleClass} />
        <Handle id="left-mid-top" type="target" position={Position.Left} style={{ top: "38%" }} className={handleClass} />
        <Handle id="left-mid" type="target" position={Position.Left} style={{ top: "52%" }} className={handleClass} />
        <Handle id="left-mid-low" type="target" position={Position.Left} style={{ top: "66%" }} className={handleClass} />
        <Handle id="left-low" type="target" position={Position.Left} style={{ top: "78%" }} className={handleClass} />
        <Handle id="right-mid" type="target" position={Position.Right} style={{ top: "58%" }} className={handleClass} />
        <Handle id="bottom-center" type="source" position={Position.Bottom} style={{ left: "50%" }} className={handleClass} />
        <div className="mx-auto flex h-28 w-28 items-center justify-center overflow-hidden rounded-[30px] bg-[var(--n9-accent-light)] dark:bg-[linear-gradient(180deg,rgba(184,121,69,0.22),rgba(184,121,69,0.08))]">
          <IceMascot className="h-[6.75rem] w-[6.75rem]" options={{ src: "/notes9-mascot-ui.png" }} aria-hidden />
        </div>
        <p className="mt-6 text-[18px] font-bold uppercase tracking-[0.18em] text-[var(--n9-accent)]">
          {data.label}
        </p>
        <div className="mt-4 h-px w-full bg-[linear-gradient(90deg,transparent,rgba(184,121,69,0.26),transparent)] dark:bg-[linear-gradient(90deg,transparent,rgba(184,121,69,0.45),transparent)]" />
        <p className="mt-4 text-[15px] font-semibold text-muted-foreground dark:text-slate-300">
          keeps every phase connected
        </p>
      </div>
    )
  }

  const Icon = data.icon ?? FileSearch
  const tone = toneClasses[data.tone ?? "slate"]
  const role = data.role ?? "default"
  return (
    <div className={`nopan w-[184px] rounded-[26px] border p-5 shadow-[0_20px_44px_-24px_rgba(44,36,24,0.22)] dark:shadow-[0_20px_44px_-24px_rgba(0,0,0,0.54)] ${tone}`}>
      <Handle id="top" type="target" position={Position.Top} className={handleClass} />
      <Handle id="top-center" type="target" position={Position.Top} style={{ left: "50%" }} className={handleClass} />
      <Handle id="top-right" type="target" position={Position.Top} style={{ left: "76%" }} className={handleClass} />
      <Handle id="left" type="target" position={Position.Left} className={handleClass} />
      <Handle id="left-center" type="target" position={Position.Left} style={{ top: "50%" }} className={handleClass} />
      <Handle id="left-top" type="target" position={Position.Left} style={{ top: "34%" }} className={handleClass} />
      <Handle id="left-mid" type="target" position={Position.Left} style={{ top: "56%" }} className={handleClass} />
      <Handle id="left-low" type="target" position={Position.Left} style={{ top: "76%" }} className={handleClass} />
      <Handle id="right" type="target" position={Position.Right} className={handleClass} />
      <Handle id="bottom" type="source" position={Position.Bottom} className={handleClass} />
      <Handle id="top-right" type="source" position={Position.Top} style={{ left: "80%" }} className={handleClass} />
      <Handle id="left" type="source" position={Position.Left} className={handleClass} />
      <Handle id="right" type="source" position={Position.Right} className={handleClass} />
      <Handle id="ai-right" type="source" position={Position.Right} style={{ top: "74%" }} className={handleClass} />
      <Handle id="bottom-right" type="source" position={Position.Bottom} style={{ left: "76%" }} className={handleClass} />
      {role === "experiments" ? (
        <>
          <Handle id="branch-1" type="source" position={Position.Right} style={{ top: "18%" }} className={handleClass} />
          <Handle id="branch-2" type="source" position={Position.Right} style={{ top: "38%" }} className={handleClass} />
          <Handle id="branch-3" type="source" position={Position.Right} style={{ top: "60%" }} className={handleClass} />
          <Handle id="branch-4" type="source" position={Position.Right} style={{ top: "82%" }} className={handleClass} />
        </>
      ) : null}
      <div className="flex items-center justify-between">
        <Icon className="h-5 w-5" />
        <Sparkles className="h-4 w-4 opacity-60" />
      </div>
      <div className="mt-5 h-8 rounded-xl bg-white/55 dark:bg-white/10" />
      <div className="mt-3 flex gap-1.5">
        <div className="h-1.5 w-8 rounded-full bg-white/75 dark:bg-white/25" />
        <div className="h-1.5 w-6 rounded-full bg-white/55 dark:bg-white/15" />
      </div>
      <p className="mt-4 text-[14px] font-bold uppercase tracking-[0.16em]">{data.label}</p>
    </div>
  )
}

function ComparisonGraph({
  nodes,
  edges,
  backgroundColor,
  editable = false,
  onGraphChange,
}: {
  nodes: ComparisonFlowNode[]
  edges: Edge[]
  backgroundColor: string
  editable?: boolean
  onGraphChange?: (graph: { nodes: ComparisonFlowNode[]; edges: Edge[] }) => void
}) {
  const [graphNodes, setGraphNodes, onNodesChange] = useNodesState(nodes)
  const [graphEdges, setGraphEdges, onEdgesChange] = useEdgesState(edges)
  const renderNodes = graphNodes.map((node) => ({
    ...node,
    data: {
      ...node.data,
      editable,
    },
  }))

  useEffect(() => {
    setGraphNodes(nodes)
  }, [nodes, setGraphNodes])

  useEffect(() => {
    setGraphEdges(edges)
  }, [edges, setGraphEdges])

  useEffect(() => {
    onGraphChange?.({
      nodes: graphNodes as ComparisonFlowNode[],
      edges: graphEdges,
    })
  }, [graphNodes, graphEdges, onGraphChange])

  const handleConnect = (connection: Connection) => {
    if (!editable) return
    setGraphEdges((currentEdges) =>
      addEdge(
        {
          ...connection,
          type: "smoothstep",
          style: { stroke: "rgba(184,121,69,0.54)", strokeWidth: 2.15, strokeDasharray: "8 9" },
          markerEnd: { type: MarkerType.ArrowClosed, color: "rgba(184,121,69,0.84)", width: 21, height: 21 },
        },
        currentEdges,
      ),
    )
  }

  const handleReconnect = (oldEdge: Edge, newConnection: Connection) => {
    if (!editable) return
    setGraphEdges((currentEdges) => reconnectEdge(oldEdge, newConnection, currentEdges))
  }

  return (
    <ReactFlowProvider>
      <div className="h-[760px] w-full overflow-hidden rounded-[28px]">
        <ReactFlow
          nodes={renderNodes}
          edges={graphEdges}
          onNodesChange={editable ? onNodesChange : undefined}
          onEdgesChange={editable ? onEdgesChange : undefined}
          onConnect={editable ? handleConnect : undefined}
          onReconnect={editable ? handleReconnect : undefined}
          nodeTypes={comparisonNodeTypes}
          fitView
          fitViewOptions={{ padding: 0.1 }}
          proOptions={{ hideAttribution: true }}
          nodesDraggable={editable}
          nodesConnectable={editable}
          edgesReconnectable={editable}
          elementsSelectable={editable}
          panOnDrag={editable}
          panOnScroll={editable}
          panOnScrollMode={PanOnScrollMode.Free}
          selectionOnDrag={false}
          zoomOnDoubleClick={editable}
          zoomOnPinch={editable}
          zoomOnScroll={false}
          preventScrolling={false}
          className={backgroundColor}
          defaultEdgeOptions={{
            markerEnd: {
              type: MarkerType.ArrowClosed,
            },
          }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="rgba(148,163,184,0.16)" />
        </ReactFlow>
      </div>
    </ReactFlowProvider>
  )
}

export function AboutMarketingPage() {
  return (
    <MarketingPageFrame>
      <PageHero
        badge="About Notes9"
        title={
          <>
            Built for research teams that need{" "}
            <span className="text-[var(--n9-accent)]">continuity, provenance, and clarity</span>.
          </>
        }
        description="Notes9 exists because critical research context still gets lost between papers, notebooks, files, and reporting tools."
        actions={[
          { href: "/platform", label: "Explore the platform" },
          { href: cta, label: "Request a demo", variant: "outline" },
        ]}
      />

      <section className="border-t border-border/40">
        <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
          <SectionHeader badge="Why we exist" title="Modern research teams do not need more fragmented software." />
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            <FeatureCard icon={Workflow} title="Fragmented context" description="Important decisions disappear between PDFs, spreadsheets, instruments, and disconnected notes." />
            <FeatureCard icon={Workflow} title="Structured continuity" description="Notes9 links evidence, experiment work, and reporting so teams move without losing the trail." />
            <FeatureCard icon={ShieldCheck} title="Trustworthy assistance" description="AI support is most useful when researchers can inspect provenance, preserve oversight, and reuse context safely." />
          </div>
        </div>
      </section>

      <section className="border-t border-border/40 bg-muted/20">
        <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
          <SectionHeader badge="Principles" title="What guides the product" />
          <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            <FeatureCard icon={Database} title="Provenance by default" description="Outputs stay tied to the papers, records, and workflow events that produced them." />
            <FeatureCard icon={BookOpen} title="Scientific memory" description="Institutional knowledge becomes easier to retrieve as projects evolve, not harder." />
            <FeatureCard icon={Microscope} title="Workflow-aware design" description="Built around actual lab operations rather than generic AI chat abstractions." />
            <FeatureCard icon={Users} title="Adoption-friendly UX" description="Clarity and disciplined interfaces matter when teams are documenting serious work." />
          </div>
        </div>
      </section>

      <section className="border-t border-border/40">
        <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-2 lg:items-stretch">
            <MinimalCard className="h-full">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--n9-accent)]">Mission</p>
              <p className="mt-4 text-lg leading-8 text-foreground">Make rigorous scientific work easier to run, trace, and reuse across the full research cycle.</p>
            </MinimalCard>
            <MinimalCard className="h-full">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--n9-accent)]">Vision</p>
              <p className="mt-4 text-lg leading-8 text-foreground">Give every research team a trusted operating layer for decisions, documentation, and discovery.</p>
            </MinimalCard>
          </div>
        </div>
      </section>

      <section className="border-t border-border/40 bg-muted/20">
        <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
          <CTAPanel
            title="See how Notes9 fits your workflow."
            description="We can walk through the points where your current process loses context, adds manual effort, or makes retrieval harder."
            primary={{ href: cta, label: "Request a demo" }}
            secondary={{ href: "/pricing", label: "Review engagement options" }}
          />
        </div>
      </section>
    </MarketingPageFrame>
  )
}

export function PlatformDifferentiationSection({
  className = "border-t border-border/40",
}: {
  className?: string
}) {
  const [connectedLayout, setConnectedLayout] = useState<ComparisonFlowNode[]>(connectedNodes)
  const [connectedEdgeLayout, setConnectedEdgeLayout] = useState<Edge[]>(connectedEdges)

  useEffect(() => {
    if (typeof window === "undefined") return

    const savedLayout = window.localStorage.getItem(CONNECTED_LAYOUT_STORAGE_KEY)

    if (savedLayout) {
      try {
        const parsed = JSON.parse(savedLayout)
        const savedNodes = Array.isArray(parsed) ? parsed : parsed?.nodes
        const savedEdges = Array.isArray(parsed?.edges) ? parsed.edges : connectedEdges
        const mergedLayout = mergeSavedConnectedLayout(savedNodes)
        setConnectedLayout(mergedLayout)
        setConnectedEdgeLayout(savedEdges)
      } catch {
        setConnectedLayout(connectedNodes)
        setConnectedEdgeLayout(connectedEdges)
      }
    }
  }, [])

  return (
    <section className={className}>
      <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[88rem]">
          <div className="flex flex-col rounded-[36px] border border-[var(--n9-accent)]/15 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,242,236,0.92))] p-6 shadow-[0_28px_90px_-44px_rgba(44,36,24,0.24)] backdrop-blur-sm dark:border-[var(--n9-accent)]/12 dark:bg-[radial-gradient(circle_at_top,rgba(184,121,69,0.09),transparent_30%),linear-gradient(180deg,rgba(19,18,20,0.98),rgba(12,12,14,0.99))] dark:shadow-[0_32px_100px_-44px_rgba(0,0,0,0.72)] sm:p-8 lg:p-10">
            <SectionHeader
              badge="Connected Research System"
              title="Research slows down when context breaks between tools"
              className="max-w-none text-left"
            />
            <p className="mt-4 w-full text-justify text-base leading-7 text-muted-foreground sm:text-lg">
              Disconnected phases force teams to reconstruct rationale, repeat handoffs, and lose continuity. Notes9 keeps the workflow connected from literature to experiments to writing.
            </p>
            <div className="mt-6 flex flex-wrap gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70 dark:text-slate-400">
              <span className="rounded-full border border-border/60 bg-background/75 px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]">fragmentation costs time</span>
              <span className="rounded-full border border-border/60 bg-background/75 px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]">handoffs break provenance</span>
              <span className="rounded-full border border-border/60 bg-background/75 px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]">reconstruction slows decisions</span>
            </div>
            <div className="mt-8 flex flex-1 items-center justify-center">
              <div className="w-full rounded-[32px] border border-[var(--n9-accent)]/15 bg-[radial-gradient(circle_at_center,rgba(184,121,69,0.08),transparent_58%)] p-5 dark:border-[var(--n9-accent)]/14 dark:bg-[radial-gradient(circle_at_center,rgba(184,121,69,0.14),transparent_54%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01))] lg:p-6">
                <ComparisonGraph
                  nodes={connectedLayout}
                  edges={connectedEdgeLayout}
                  backgroundColor="bg-transparent"
                  editable={false}
                />
              </div>
            </div>
            <div className="mt-6 grid gap-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/65 dark:text-slate-400 sm:grid-cols-3">
              <div className="rounded-[18px] border border-border/50 bg-background/70 px-4 py-3 dark:border-white/10 dark:bg-white/[0.04]">
                Evidence stays linked
              </div>
              <div className="rounded-[18px] border border-border/50 bg-background/70 px-4 py-3 dark:border-white/10 dark:bg-white/[0.04]">
                Catalyst AI sees full context
              </div>
              <div className="rounded-[18px] border border-border/50 bg-background/70 px-4 py-3 dark:border-white/10 dark:bg-white/[0.04]">
                Writing reflects the work
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export function PlatformMarketingPage() {
  return (
    <MarketingPageFrame>
      <PageHero
        badge="Platform"
        title={
          <>
            One workflow layer for{" "}
            <span className="text-[var(--n9-accent)]">literature, lab work, memory, and reporting</span>.
          </>
        }
        description="Notes9 helps research teams capture work in a structured way, retrieve context quickly, and move from fragmented notes to decision-ready outputs."
        actions={[
          { href: cta, label: "Request a demo" },
          { href: "/resources", label: "Review resources", variant: "outline" },
        ]}
      />

      <ProductShowcase />

      <section className="border-t border-border/40 bg-muted/20">
        <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
          <SectionHeader
            badge="See Notes9"
            title="Watch how research work stays connected"
            description="Short product moments that show how Notes9 turns scattered lab work into one continuous system."
            align="center"
          />
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {platformVideoClips.map((clip) => (
              <MinimalCard
                key={clip.title}
                className="group overflow-hidden rounded-[28px] border-border/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(244,239,233,0.88))] p-0 shadow-[0_28px_80px_-34px_rgba(44,36,24,0.18)] transition-transform duration-300 hover:-translate-y-1 dark:bg-[linear-gradient(180deg,rgba(24,20,16,0.96),rgba(36,28,22,0.9))] dark:shadow-[0_28px_80px_-34px_rgba(0,0,0,0.45)]"
              >
                <div className="h-1.5 bg-gradient-to-r from-[var(--n9-accent)] via-amber-500/70 to-transparent" />
                <div className="px-5 py-5">
                  <div className="mb-4 inline-flex rounded-full border border-[var(--n9-accent)]/20 bg-[var(--n9-accent-light)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--n9-accent)]">
                    {clip.eyebrow}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--n9-accent-light)] text-[var(--n9-accent)] transition-transform duration-300 group-hover:scale-105">
                      <clip.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold tracking-tight text-foreground">{clip.title}</h3>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">{clip.description}</p>
                    </div>
                  </div>
                </div>
                <div className="px-5 pb-5">
                  <ProductFrame className="overflow-hidden rounded-[24px] border-border/60 bg-[#060606] shadow-[0_24px_60px_-34px_rgba(12,10,8,0.6)] [transform:none] hover:[transform:none]">
                    <div className="flex h-9 items-center gap-2 border-b border-white/10 bg-[#111111] px-4">
                      <div className="flex gap-1.5">
                        <div className="h-2.5 w-2.5 rounded-full bg-[#ff6b5f]" />
                        <div className="h-2.5 w-2.5 rounded-full bg-[#f8c14d]" />
                        <div className="h-2.5 w-2.5 rounded-full bg-[#45d483]" />
                      </div>
                      <div className="ml-3 h-5 flex-1 rounded-full bg-white/5" />
                    </div>
                    <div className="relative aspect-[16/10] bg-[#080808]">
                      <iframe
                        src={clip.video}
                        title={clip.title}
                        loading="lazy"
                        allow="autoplay; fullscreen; picture-in-picture"
                        className="block h-full w-full border-0 bg-black"
                      />
                    </div>
                  </ProductFrame>
                </div>
              </MinimalCard>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border/40 bg-muted/20">
        <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
          <CTAPanel
            title="See the platform through your own workflow."
            description="We can map Notes9 against your current process to show where value is most immediate."
            primary={{ href: cta, label: "Request a demo" }}
            secondary={{ href: "/pricing", label: "See engagement options" }}
          />
        </div>
      </section>
    </MarketingPageFrame>
  )
}

export function PricingMarketingPage() {
  return (
    <MarketingPageFrame>
      <PageHero
        badge="Pricing"
        title={
          <>
            Engagements structured around{" "}
            <span className="text-[var(--n9-accent)]">lab scope and workflow depth</span>.
          </>
        }
        description="Notes9 pricing is scoped around workflow complexity, team size, and enablement needs."
        actions={[
          { href: cta, label: "Discuss fit and pricing" },
          { href: "/platform", label: "Review platform", variant: "outline" },
        ]}
      />

      <section className="border-t border-border/40 bg-muted/20">
        <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
          <SectionHeader badge="Engagement models" title="A clearer path from evaluation to team rollout" align="center" />
          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            {[
              { title: "Pilot engagement", icon: FlaskConical, points: ["Focused evaluation for a single team", "Hands-on workflow mapping", "Best for labs validating fit"] },
              { title: "Team deployment", icon: Users, points: ["Shared operating model across collaborators", "Repeatable documentation and retrieval", "Best for labs needing operational consistency"] },
              { title: "Research operations", icon: ShieldCheck, points: ["Broader workflow design and governance", "Suitable for complex research operations", "Best for multi-project environments"] },
            ].map((item) => (
              <MinimalCard key={item.title}>
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--n9-accent-light)] text-[var(--n9-accent)]">
                  <item.icon className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">{item.title}</h3>
                <ul className="mt-4 space-y-2 text-sm leading-6 text-muted-foreground">
                  {item.points.map((p) => (
                    <li key={p} className="flex items-start gap-2">
                      <span className="mt-1.5 block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--n9-accent)]" />
                      {p}
                    </li>
                  ))}
                </ul>
              </MinimalCard>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border/40">
        <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
          <SectionHeader badge="Buyer clarity" title="What buyers can expect" align="center" />
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            <FeatureCard icon={Workflow} title="Workflow-led scoping" description="Pricing conversations begin with the workflows you want to improve." />
            <FeatureCard icon={GraduationCap} title="Enablement included" description="Implementation and education are part of the discussion." />
            <FeatureCard icon={ShieldCheck} title="Clear expectations" description="We align on support and rollout approach early." />
          </div>
        </div>
      </section>

      <section className="border-t border-border/40 bg-muted/20">
        <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
          <CTAPanel
            title="Get a pricing conversation grounded in your workflow."
            description="Share your team shape and workflow goals, and we will scope a practical engagement path."
            primary={{ href: cta, label: "Discuss fit and pricing" }}
            secondary={{ href: "/resources", label: "Review enablement surfaces" }}
          />
        </div>
      </section>
    </MarketingPageFrame>
  )
}

export function DocsMarketingPage() {
  return <ResourcesMarketingPage />
}

export function ResourcesMarketingPage() {
  return (
    <MarketingPageFrame>
      <PageHero
        badge="Resources"
        title={
          <>
            Practical guidance for teams using{" "}
            <span className="text-[var(--n9-accent)]">the full Notes9 research workflow</span>.
          </>
        }
        description="Use this page to understand how the major surfaces work, where each module fits, and how to adopt the platform around real scientific workflows."
        actions={[
          { href: "/platform", label: "Explore the platform" },
          { href: cta, label: "Request a demo", variant: "outline" },
        ]}
      />

      <section className="border-t border-border/40 bg-muted/20">
        <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
          <SectionHeader
            badge="Guide Map"
            title="Start with the surface that matches your current workflow gap"
            description="These are the most important Notes9 areas to understand when setting up or evaluating a real research workflow."
            align="center"
          />
          <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {resourceGuides.slice(0, 4).map((guide) => (
              <FeatureCard
                key={guide.id}
                icon={guide.icon}
                title={guide.title}
                description={guide.description}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border/40">
        <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-stretch">
            <div className="flex h-full flex-col">
              <SectionHeader
                badge="Adoption Path"
                title="How teams should think about rollout"
                description="The best starting point is not everything at once. It is the one workflow where context loss is already expensive."
                className="lg:min-h-[12rem]"
              />
              <div className="mt-8 flex-1 grid gap-4">
                <WorkflowStep step="01" title="Pick one live workflow" description="Choose a project or experiment sequence where the team already loses time reconstructing context." />
                <WorkflowStep step="02" title="Set structure before scale" description="Establish the project, experiment, and note pattern first so the system stays coherent as usage grows." />
                <WorkflowStep step="03" title="Measure retrieval and reporting" description="Judge success by how much easier it becomes to recover prior work and produce clean updates." />
              </div>
            </div>
            <div className="flex h-full flex-col">
              <SectionHeader
                badge="Common Questions"
                title="Themes that usually determine fit"
                description="These are the concerns teams usually raise first when evaluating workflow tooling."
                className="lg:min-h-[12rem]"
              />
              <div className="mt-8 flex-1 grid gap-4">
                {resourceFaqs.map((faq) => (
                  <MinimalCard key={faq.question}>
                    <h3 className="text-base font-semibold text-foreground">{faq.question}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{faq.answer}</p>
                  </MinimalCard>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-border/40 bg-muted/20">
        <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
          <SectionHeader
            badge="Feature Guides"
            title="Module-by-module guidance"
            description="Each section below distills the older resources content into practical guidance for how that part of the workflow should be used."
          />
          <div className="mt-10 rounded-2xl border border-border/50 bg-background/80 px-6 py-2 shadow-sm backdrop-blur-sm sm:px-8">
            <Accordion type="single" collapsible className="w-full">
              {resourceGuides.map((guide) => (
                <AccordionItem key={guide.id} value={guide.id}>
                  <AccordionTrigger className="py-5 hover:no-underline">
                    <div className="flex min-w-0 items-start gap-4 text-left">
                      <div className="mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--n9-accent-light)] text-[var(--n9-accent)]">
                        <guide.icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-base font-semibold text-foreground">{guide.title}</h3>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">{guide.description}</p>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="pb-4 pl-14">
                      <ul className="space-y-3 text-sm leading-6 text-muted-foreground">
                        {guide.bullets.map((bullet) => (
                          <li key={bullet} className="flex items-start gap-3">
                            <span className="mt-2 block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--n9-accent)]" />
                            <span>{bullet}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>

      <section className="border-t border-border/40 bg-muted/20">
        <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
          <CTAPanel
            title="Need help mapping these guides to your own workflow?"
            description="We can walk through the specific part of your research process where documentation, retrieval, or reporting is currently breaking down."
            primary={{ href: cta, label: "Request a demo" }}
            secondary={{ href: "/platform", label: "Review platform" }}
          />
        </div>
      </section>
    </MarketingPageFrame>
  )
}
