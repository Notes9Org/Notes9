"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  ClipboardList,
  Database,
  FileCheck,
  FileText,
  FlaskConical,
  FolderOpen,
  MessageCircle,
  PenLine,
  Play,
  Quote,
  Shield,
  Sparkles,
  TestTube2,
  UsersRound,
  type LucideIcon,
} from "lucide-react"
import { useId } from "react"

import { IceMascot } from "@/components/ui/ice-mascot"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/* ─── Panel data (icons match HTML intent) ─── */

const elnTools: { id: string; Icon: LucideIcon; label: string }[] = [
  { id: "nb", Icon: BookOpen, label: "Lab notebooks" },
  { id: "exp", Icon: TestTube2, label: "Experiment tracking" },
  { id: "dat", Icon: FolderOpen, label: "Data & files" },
]

const aiTools: { id: string; Icon: LucideIcon; label: string }[] = [
  { id: "chat", Icon: Sparkles, label: "General AI chat" },
  { id: "draft", Icon: PenLine, label: "Drafting assistance" },
  { id: "gen", Icon: Quote, label: "Text generation" },
]

/* ─── Card copy + styling (from Notes9 Marketing Page.html) ─── */

type CardTone = "green" | "purple" | "orange"

type CardDef = {
  id: string
  title: string
  body: string
  tone: CardTone
}

const cards: CardDef[] = [
  {
    id: "workflow",
    title: "Connected researchworkflow",
    body: "Links literature review, experiment work, and research writing in one workspace",
    tone: "green",
  },
  {
    id: "ai",
    title: "Biotech-aware AI",
    body: "Designed to work from connected biotech context from your papers, protocols, notes, and results",
    tone: "purple",
  },
  {
    id: "labs",
    title: "Practical, Researcher-first design",
    body: "A practical research workspace built for real lab work, day to day",
    tone: "orange",
  },
]

const toneStyles: Record<CardTone, { title: string; hover: string; border: string }> = {
  green: {
    title: "text-[#2d6045] dark:text-emerald-400",
    hover:
      "hover:border-[#5a9070]/50 hover:shadow-[0_20px_50px_-28px_rgba(90,144,112,0.35)] dark:hover:border-emerald-500/30",
    border: "border-[#e8e2d8] dark:border-border/60",
  },
  purple: {
    title: "text-[#6b4fa0] dark:text-violet-400",
    hover:
      "hover:border-[#9b72cf]/45 hover:shadow-[0_20px_50px_-28px_rgba(155,114,207,0.32)] dark:hover:border-violet-500/30",
    border: "border-[#e8e2d8] dark:border-border/60",
  },
  orange: {
    title: "text-[#d06a10] dark:text-[var(--n9-accent)]",
    hover:
      "hover:border-[#e07820]/45 hover:shadow-[0_20px_50px_-28px_rgba(224,120,32,0.28)] dark:hover:border-[var(--n9-accent)]/35",
    border: "border-[#e8e2d8] dark:border-border/60",
  },
}

/* ─── DNA decoration (HTML mock) ─── */

function DnaHelixDecoration() {
  return (
    <svg
      className="pointer-events-none absolute bottom-5 left-6 z-[1] hidden opacity-[0.18] lg:block"
      width={90}
      height={160}
      viewBox="0 0 90 160"
      aria-hidden
    >
      <g stroke="#3a6b50" strokeWidth={1.5} fill="none">
        <path d="M20,10 C10,30 30,50 20,70 C10,90 30,110 20,130 C10,150 30,160 20,160" />
        <path d="M60,10 C70,30 50,50 60,70 C70,90 50,110 60,130 C70,150 50,160 60,160" />
        <line x1="20" y1="30" x2="60" y2="30" strokeDasharray="2,2" />
        <line x1="16" y1="50" x2="64" y2="50" strokeDasharray="2,2" />
        <line x1="20" y1="70" x2="60" y2="70" strokeDasharray="2,2" />
        <line x1="16" y1="90" x2="64" y2="90" strokeDasharray="2,2" />
        <line x1="20" y1="110" x2="60" y2="110" strokeDasharray="2,2" />
        <line x1="16" y1="130" x2="64" y2="130" strokeDasharray="2,2" />
      </g>
    </svg>
  )
}

/* ─── Full-scene connectors: side panels → mascot hub (+ faint panel → cards) ─── */

function SceneConnectorLines() {
  const dash = "5 4"
  /* ELN (left) = red family; AI (right) = blue family */
  return (
    <svg
      className="pointer-events-none absolute inset-0 z-0 h-full w-full"
      viewBox="0 0 1200 720"
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id="n9-diff-bridge" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#dc2626" stopOpacity={0.22} />
          <stop offset="50%" stopColor="#64748b" stopOpacity={0.08} />
          <stop offset="100%" stopColor="#2563eb" stopOpacity={0.22} />
        </linearGradient>
      </defs>

      {/* Soft bridge behind hub: red → blue */}
      <path
        d="M 400 172 C 470 162 730 162 800 172"
        stroke="url(#n9-diff-bridge)"
        strokeWidth={1.15}
        fill="none"
      />
      <path
        d="M 420 182 C 480 176 720 176 780 182"
        stroke="url(#n9-diff-bridge)"
        strokeWidth={0.95}
        fill="none"
        opacity={0.85}
      />

      {/* ELN (red) → mascot */}
      <path
        d="M 170 84 C 330 88 480 148 568 168"
        stroke="#dc2626"
        strokeWidth={1.25}
        fill="none"
        opacity={0.34}
        strokeDasharray={dash}
        strokeLinecap="round"
      />
      <path
        d="M 170 260 C 300 236 470 188 582 174"
        stroke="#b91c1c"
        strokeWidth={1}
        fill="none"
        opacity={0.28}
        strokeDasharray={dash}
        strokeLinecap="round"
      />
      <path
        d="M 170 456 C 290 412 500 212 592 180"
        stroke="#f87171"
        strokeWidth={0.95}
        fill="none"
        opacity={0.22}
        strokeDasharray={dash}
        strokeLinecap="round"
      />

      {/* AI (blue) → mascot */}
      <path
        d="M 1030 84 C 870 88 720 148 632 168"
        stroke="#2563eb"
        strokeWidth={1.25}
        fill="none"
        opacity={0.34}
        strokeDasharray={dash}
        strokeLinecap="round"
      />
      <path
        d="M 1030 260 C 900 236 730 188 618 174"
        stroke="#1d4ed8"
        strokeWidth={1}
        fill="none"
        opacity={0.28}
        strokeDasharray={dash}
        strokeLinecap="round"
      />
      <path
        d="M 1030 456 C 910 412 700 212 608 180"
        stroke="#60a5fa"
        strokeWidth={0.95}
        fill="none"
        opacity={0.22}
        strokeDasharray={dash}
        strokeLinecap="round"
      />

      {/* Faint side → card anchors */}
      <path
        d="M 170 520 Q 310 480 360 620"
        stroke="#dc2626"
        strokeWidth={0.75}
        fill="none"
        opacity={0.12}
        strokeDasharray="3 4"
        strokeLinecap="round"
      />
      <path
        d="M 1030 520 Q 890 480 840 620"
        stroke="#2563eb"
        strokeWidth={0.75}
        fill="none"
        opacity={0.12}
        strokeDasharray="3 4"
        strokeLinecap="round"
      />

      <circle cx="380" cy="128" r="3" fill="#dc2626" opacity={0.4} />
      <circle cx="460" cy="156" r="2.5" fill="#f87171" opacity={0.32} />
      <circle cx="820" cy="128" r="3" fill="#2563eb" opacity={0.4} />
      <circle cx="740" cy="156" r="2.5" fill="#60a5fa" opacity={0.32} />
    </svg>
  )
}

/* ─── Card illustrations (inline SVG from HTML) ─── */

function CardWorkflowIllustration({ markerId }: { markerId: string }) {
  return (
    <div className="mb-3.5 flex h-[100px] w-[120px] shrink-0 items-center justify-center">
      <svg width={120} height={100} viewBox="0 0 120 100" fill="none" aria-hidden>
        <g transform="translate(8,8)">
          {/* Circular arrows centered in the gaps between the 3 nodes */}
          <path d="M34 19 C44 13 58 13 68 19" stroke="#4a8864" strokeWidth={1.6} fill="none" markerEnd={`url(#${markerId})`} />
          <path d="M84 42 C86 51 83 61 77 67" stroke="#4a8864" strokeWidth={1.6} fill="none" markerEnd={`url(#${markerId})`} />
          <path d="M62 70 C49 74 34 72 25 66" stroke="#4a8864" strokeWidth={1.6} fill="none" markerEnd={`url(#${markerId})`} />

          {/* Document */}
          <rect x="40" y="0" width="24" height="30" rx="3" fill="#f3faf5" stroke="#3f7f5b" strokeWidth={1.8} />
          <path d="M56 0 L64 8 L56 8 Z" fill="#d9efdf" stroke="#3f7f5b" strokeWidth={1.4} />
          <line x1="45" y1="12" x2="57" y2="12" stroke="#6b9e82" strokeWidth={1.3} />
          <line x1="45" y1="17" x2="58" y2="17" stroke="#6b9e82" strokeWidth={1.3} />
          <line x1="45" y1="22" x2="56" y2="22" stroke="#6b9e82" strokeWidth={1.3} />

          {/* Flask */}
          <path
            d="M6 62 C6 54 12 49 16 45 L16 29 L28 29 L28 45 C32 49 38 54 38 62 C38 70 31 76 22 76 C13 76 6 70 6 62 Z"
            fill="#edf8f0"
            stroke="#3f7f5b"
            strokeWidth={1.8}
          />
          <path d="M12 63 C12 58 16 55 20 53 C24 51 28 50 32 52 C34 53 35 56 35 59 C35 66 30 70 22 70 C16 70 12 67 12 63 Z" fill="#9fd0a8" />
          <circle cx="16.5" cy="59" r="1.7" fill="#d8efdd" />
          <circle cx="23" cy="56.5" r="1.55" fill="#d8efdd" />
          <circle cx="29.5" cy="61" r="1.45" fill="#d8efdd" />

          {/* Chart card */}
          <rect x="72" y="44" width="28" height="26" rx="4" fill="#f3faf5" stroke="#3f7f5b" strokeWidth={1.8} />
          <rect x="78" y="58" width="4" height="7" rx="1" fill="#5d9a74" />
          <rect x="85" y="54" width="4" height="11" rx="1" fill="#5d9a74" />
          <rect x="92" y="49" width="4" height="16" rx="1" fill="#5d9a74" />

        </g>
        <defs>
          <marker id={markerId} markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="#4a8864" />
          </marker>
        </defs>
      </svg>
    </div>
  )
}

function CardAiIllustration() {
  return (
    <div className="mb-3.5 flex h-[100px] w-[120px] shrink-0 items-center justify-center">
      <svg width={120} height={100} viewBox="0 0 120 100" fill="none" aria-hidden>
        {/* Center brain */}
        <ellipse cx="60" cy="46" rx="30" ry="25" fill="#dcc8f2" />
        <line x1="60" y1="23" x2="60" y2="69" stroke="#a07dcc" strokeWidth={1.4} />
        <path d="M60 24 C49 24 41 31 41 39 C36 42 35 51 41 56 C41 64 48 69 56 69" stroke="#8f6cc0" strokeWidth={1.5} fill="none" />
        <path d="M60 24 C71 24 79 31 79 39 C84 42 85 51 79 56 C79 64 72 69 64 69" stroke="#8f6cc0" strokeWidth={1.5} fill="none" />
        <circle cx="52" cy="35" r="2.2" fill="#8f6cc0" />
        <circle cx="68" cy="35" r="2.2" fill="#8f6cc0" />
        <circle cx="47" cy="48" r="2.2" fill="#8f6cc0" />
        <circle cx="73" cy="48" r="2.2" fill="#8f6cc0" />
        <circle cx="56" cy="58" r="2.2" fill="#8f6cc0" />
        <circle cx="64" cy="58" r="2.2" fill="#8f6cc0" />

        {/* Corner cards */}
        <g transform="translate(6,14)">
          <rect x="0" y="0" width="22" height="22" rx="4" fill="#f8f3fe" stroke="#a78bce" strokeWidth={1.3} />
          <line x1="6" y1="7" x2="16" y2="7" stroke="#8f6cc0" strokeWidth={1.1} />
          <line x1="6" y1="11.5" x2="16" y2="11.5" stroke="#8f6cc0" strokeWidth={1.1} />
          <line x1="6" y1="16" x2="13" y2="16" stroke="#8f6cc0" strokeWidth={1.1} />
        </g>
        <g transform="translate(92,12)">
          <rect x="0" y="0" width="22" height="24" rx="4" fill="#f8f3fe" stroke="#a78bce" strokeWidth={1.3} />
          <rect x="7" y="-4" width="8" height="5" rx="1.5" fill="#ede3fa" stroke="#8f6cc0" strokeWidth={1} />
          <polyline points="5,10 8,13 12,8" stroke="#8f6cc0" strokeWidth={1.2} fill="none" />
          <line x1="13" y1="9" x2="17" y2="9" stroke="#8f6cc0" strokeWidth={1.2} />
          <polyline points="5,16 8,19 12,14" stroke="#8f6cc0" strokeWidth={1.2} fill="none" />
          <line x1="13" y1="15" x2="17" y2="15" stroke="#8f6cc0" strokeWidth={1.2} />
        </g>
        <g transform="translate(8,68)">
          <rect x="0" y="0" width="22" height="22" rx="4" fill="#f8f3fe" stroke="#a78bce" strokeWidth={1.3} />
          <line x1="6" y1="8" x2="16" y2="8" stroke="#8f6cc0" strokeWidth={1.1} />
          <line x1="6" y1="12.5" x2="16" y2="12.5" stroke="#8f6cc0" strokeWidth={1.1} />
          <line x1="6" y1="17" x2="13" y2="17" stroke="#8f6cc0" strokeWidth={1.1} />
        </g>
        <g transform="translate(91,69)">
          <rect x="0" y="0" width="23" height="21" rx="4" fill="#f8f3fe" stroke="#a78bce" strokeWidth={1.3} />
          <rect x="5" y="12" width="3.5" height="5" rx="0.8" fill="#7f5eb0" />
          <rect x="10.5" y="9" width="3.5" height="8" rx="0.8" fill="#7f5eb0" />
          <rect x="16" y="6" width="3.5" height="11" rx="0.8" fill="#7f5eb0" />
        </g>

        {/* Dashed connectors */}
        <path d="M28 25 C38 24 44 30 49 34" stroke="#a48ac9" strokeWidth={1.4} strokeDasharray="3 3" fill="none" />
        <path d="M92 25 C82 24 76 30 71 34" stroke="#a48ac9" strokeWidth={1.4} strokeDasharray="3 3" fill="none" />
        <path d="M30 79 C40 77 45 69 50 62" stroke="#a48ac9" strokeWidth={1.4} strokeDasharray="3 3" fill="none" />
        <path d="M91 79 C81 77 76 69 70 62" stroke="#a48ac9" strokeWidth={1.4} strokeDasharray="3 3" fill="none" />

        <circle cx="60" cy="46" r="5" fill="#ffffff" opacity={0.72} />
      </svg>
    </div>
  )
}

function CardLabIllustration() {
  return (
    <div className="mb-3.5 flex h-[100px] w-[120px] shrink-0 items-center justify-center">
      <svg width={120} height={100} viewBox="0 0 120 100" fill="none" aria-hidden>
        <g transform="translate(8,10)">
          <rect x="16" y="0" width="12" height="30" rx="2" stroke="#c87830" strokeWidth={1.5} fill="#fdf0e0" />
          <rect x="10" y="28" width="24" height="10" rx="2" stroke="#c87830" strokeWidth={1.5} fill="#fdf0e0" />
          <ellipse cx="22" cy="48" rx="16" ry="5" stroke="#c87830" strokeWidth={1.5} fill="#fdf0e0" />
          <rect x="18" y="36" width="8" height="14" stroke="#c87830" strokeWidth={1.2} fill="#fdf0e0" />
          <circle cx="22" cy="4" r="4" stroke="#c87830" strokeWidth={1.3} fill="none" />
        </g>
        <g transform="translate(54,8)">
          <rect x="0" y="6" width="46" height="56" rx="3" stroke="#c87830" strokeWidth={1.5} fill="#fff9f2" />
          <rect x="14" y="0" width="18" height="12" rx="3" stroke="#c87830" strokeWidth={1.3} fill="#fff9f2" />
          <line x1="8" y1="22" x2="38" y2="22" stroke="#d8a070" strokeWidth={1.2} />
          <polyline points="8,20 11,23 16,17" stroke="#c87830" strokeWidth={1.5} fill="none" />
          <line x1="8" y1="32" x2="38" y2="32" stroke="#d8a070" strokeWidth={1.2} />
          <polyline points="8,30 11,33 16,27" stroke="#c87830" strokeWidth={1.5} fill="none" />
          <line x1="8" y1="42" x2="38" y2="42" stroke="#d8a070" strokeWidth={1.2} />
          <polyline points="8,40 11,43 16,37" stroke="#c87830" strokeWidth={1.5} fill="none" />
        </g>
        <g transform="translate(60,54)">
          <rect x="0" y="12" width="7" height="8" fill="#e07820" opacity={0.5} />
          <rect x="11" y="6" width="7" height="14" fill="#e07820" opacity={0.5} />
          <rect x="22" y="2" width="7" height="18" fill="#e07820" opacity={0.5} />
          <line x1="-2" y1="20" x2="34" y2="20" stroke="#c87830" strokeWidth={1} />
        </g>
        <g transform="translate(88,54)">
          <circle cx="12" cy="12" r="12" fill="#fdf0e0" stroke="#c87830" strokeWidth={1.3} />
          <path d="M12 12 L12 0 A12 12 0 0 1 24 12 Z" fill="#e07820" opacity={0.6} />
          <path d="M12 12 L24 12 A12 12 0 0 1 6 22 Z" fill="#c87830" opacity={0.4} />
        </g>
      </svg>
    </div>
  )
}

function CardIllustration({ cardId, markerId }: { cardId: string; markerId: string }) {
  if (cardId === "workflow") return <CardWorkflowIllustration markerId={markerId} />
  if (cardId === "ai") return <CardAiIllustration />
  return <CardLabIllustration />
}

/* ─── Sidebars (HTML: 148px, icon well 52×44) ─── */

function ToolPanel({
  variant,
  label,
  tools,
}: {
  variant: "eln" | "ai"
  label: string
  tools: typeof elnTools
}) {
  const isEln = variant === "eln"
  return (
    <div
      className={cn(
        "flex h-full min-h-[428px] w-[164px] shrink-0 flex-col self-stretch rounded-[18px] border bg-white px-4 pb-6 pt-5 transition-colors duration-300 sm:min-h-[440px] sm:w-[172px] sm:px-4 sm:pb-7 sm:pt-5 dark:bg-card/95",
        isEln
          ? "border-[#e8e2d8] hover:border-[#d87474]/45 hover:shadow-[0_20px_50px_-28px_rgba(216,116,116,0.3)] dark:border-border/60 dark:hover:border-rose-500/35"
          : "border-[#e8e2d8] hover:border-[#6ea4df]/45 hover:shadow-[0_20px_50px_-28px_rgba(110,164,223,0.3)] dark:border-border/60 dark:hover:border-blue-500/35",
      )}
    >
      <div className="shrink-0">
        <p
          className={cn(
            "text-[10.5px] font-bold uppercase tracking-[0.08em]",
            isEln ? "text-red-800 dark:text-red-300" : "text-blue-800 dark:text-blue-300",
          )}
        >
          {label}
        </p>
        <div
          className={cn(
            "mb-4 mt-1.5 h-0.5 w-9 rounded-sm",
            isEln ? "bg-red-600 dark:bg-red-500" : "bg-blue-600 dark:bg-blue-500",
          )}
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col justify-between gap-4 py-2 sm:gap-5 sm:py-3">
        {tools.map((t) => (
          <div key={t.id} className="flex flex-col items-center">
            <div
              className={cn(
                "mb-1.5 flex h-11 w-[52px] items-center justify-center rounded-lg border-[1.5px]",
                isEln
                  ? "border-red-200/90 bg-white/90 dark:border-red-800/50 dark:bg-red-950/40"
                  : "border-blue-200/90 bg-white/90 dark:border-blue-800/50 dark:bg-blue-950/40",
              )}
            >
              <t.Icon
                className={cn(
                  "h-[26px] w-[26px]",
                  isEln ? "text-red-700 dark:text-red-400" : "text-blue-700 dark:text-blue-400",
                )}
                strokeWidth={1.5}
              />
            </div>
            <span className="max-w-full text-center text-[11.5px] leading-[1.3] text-[#444] dark:text-muted-foreground">
              {t.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function HubNotes9Mascot({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative z-[3] mb-4 flex shrink-0 items-center justify-center pt-1 sm:mb-5",
        className,
      )}
    >
      <IceMascot
        className="hero-pendulum h-20 w-20 sm:h-[5.25rem] sm:w-[5.25rem]"
        options={{ src: "/notes9-mascot-ui.png" }}
        aria-label="Notes9 connected research workspace"
      />
    </div>
  )
}

/* ─── Motion ─── */

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
}

/* ─── Trust strip (after “The Notes9 difference” intro) ─── */

const trustPillars: { id: string; Icon: LucideIcon; body: string }[] = [
  {
    id: "data",
    Icon: Shield,
    body: "Designed for responsible research data handling",
  },
  {
    id: "teams",
    Icon: UsersRound,
    body: "Built to reduce knowledge loss across teams and projects",
  },
  {
    id: "lab",
    Icon: FlaskConical,
    body: "Practical for real lab and research workflows",
  },
  {
    id: "compliance",
    Icon: FileCheck,
    body: "Structured for a credible long-term compliance path",
  },
]

const CONTACT_HASH = "/#contact" as const
const FEATURES_HASH = "/#features" as const

/** Radial “connected workflow” graphic for practice CTA (right column). */
function PracticeCtaDiagram() {
  const orbit = 38
  const cx = 50
  const cy = 50
  const satellites: { Icon: LucideIcon; deg: number }[] = [
    { Icon: FileText, deg: -90 },
    { Icon: ClipboardList, deg: -18 },
    { Icon: BarChart3, deg: 54 },
    { Icon: FlaskConical, deg: 126 },
    { Icon: Database, deg: 198 },
  ]

  return (
    <div className="relative mx-auto w-full max-w-[min(100%,280px)] aspect-square">
      <svg
        className="absolute inset-0 h-full w-full text-[var(--n9-accent)]/28 dark:text-amber-400/30"
        viewBox="0 0 100 100"
        aria-hidden
      >
        {satellites.map(({ deg }) => {
          const rad = (deg * Math.PI) / 180
          const x = cx + orbit * Math.cos(rad)
          const y = cy + orbit * Math.sin(rad)
          return (
            <line
              key={deg}
              x1={cx}
              y1={cy}
              x2={x}
              y2={y}
              stroke="currentColor"
              strokeWidth={0.35}
              strokeDasharray="1.2 0.8"
              strokeLinecap="round"
            />
          )
        })}
      </svg>
      <div className="absolute left-1/2 top-1/2 z-[2] -translate-x-1/2 -translate-y-1/2">
        <IceMascot
          className="h-14 w-14"
          options={{ src: "/notes9-mascot-ui.png" }}
          aria-label="Notes9 mascot"
        />
      </div>
      {satellites.map(({ Icon, deg }) => {
        const rad = (deg * Math.PI) / 180
        const x = cx + orbit * Math.cos(rad)
        const y = cy + orbit * Math.sin(rad)
        return (
          <div
            key={deg}
            className={cn(
              "absolute z-[1] flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border shadow-sm",
              "border-[#e8e2d8] bg-white text-[#6b4420] dark:border-amber-400/35 dark:bg-[#141210]/95 dark:text-amber-100/95",
            )}
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            <Icon className="h-[18px] w-[18px]" strokeWidth={1.5} aria-hidden />
          </div>
        )
      })}
    </div>
  )
}

function AdoptionIntroBlock() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      viewport={{ once: true, margin: "-32px" }}
      className="mx-auto mt-12 max-w-3xl text-center sm:mt-14 lg:mt-16"
    >
      <p className="text-[13px] font-semibold leading-snug text-[#2a5740] dark:text-[var(--n9-accent)] sm:text-sm">
        Practical to adopt. Serious about research data.
      </p>
    </motion.div>
  )
}

function PostTrustCtaBlock() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.48 }}
      viewport={{ once: true, margin: "-40px" }}
      className={cn(
        "mx-auto mt-10 max-w-6xl overflow-hidden rounded-[24px] border px-5 py-7 font-sans sm:mt-12 sm:rounded-3xl sm:px-8 sm:py-10",
        /* Light: Notes9 cream / white card on section */
        "border-[#e8e2d8] bg-white text-[#1a1a1a] shadow-[0_22px_55px_-38px_rgba(44,36,24,0.12)] ring-1 ring-black/[0.03]",
        /* Dark: Notes9 base dark theme */
        "dark:border-[#c59d7c]/25 dark:bg-[#1a1614] dark:text-[#f5f0e8] dark:shadow-[0_24px_70px_-40px_rgba(0,0,0,0.45)] dark:ring-0",
      )}
    >
      <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(220px,300px)] lg:gap-12 lg:divide-x lg:divide-[#e8e2d8] dark:lg:divide-[#c59d7c]/22">
        <div className="text-left">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold tracking-wide",
              "border-emerald-600/35 bg-emerald-50/80 text-[#1f6b49]",
              "dark:border-emerald-400/45 dark:bg-emerald-500/10 dark:text-emerald-300",
            )}
          >
            <span className="text-emerald-500 dark:text-emerald-300" aria-hidden>
              ●
            </span>
            Free to get started
          </span>
          <h3 className="mt-5 text-[1.65rem] font-bold leading-tight tracking-tight text-[#1a1a1a] dark:text-[#f5f0e8] sm:text-3xl lg:text-[1.75rem] lg:leading-snug">
            See how <span className="text-[var(--n9-accent)]">connected</span> research can feel in practice
          </h3>
          <p className="mt-3 max-w-xl text-pretty text-[0.9375rem] leading-relaxed text-[#555] sm:text-base dark:text-[#f5f0e8]/92">
            If your team is juggling with papers, protocols, notes, data, and reporting across too many tools, <span className="text-[var(--n9-accent)]">Notes9</span> can help bringing that workflow together. Start free, request a demo or see how it works.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:mt-9 sm:flex-row sm:flex-wrap sm:items-center">
            <Button
              asChild
              className={cn(
                "h-11 w-full rounded-full border-0 px-6 text-white sm:w-auto",
                "bg-[var(--n9-accent)] shadow-[0_12px_30px_-14px_var(--n9-accent-glow)] hover:bg-[var(--n9-accent-hover)] hover:shadow-[0_18px_38px_-14px_var(--n9-accent-glow)]",
                "dark:bg-[var(--n9-accent)] dark:hover:bg-[var(--n9-accent-hover)]",
              )}
            >
              <Link href="/auth/sign-up" className="inline-flex items-center justify-center gap-2">
                Start free
                <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
              </Link>
            </Button>
            <Button
              variant="outline"
              asChild
              className={cn(
                "w-full bg-transparent sm:w-auto",
                "border-[#2a5740]/30 text-[#1a1a1a] hover:bg-[var(--n9-accent-light)]/60",
                "dark:border-[#c59d7c]/55 dark:text-[#f5f0e8] dark:hover:bg-white/5",
              )}
            >
              <Link href={CONTACT_HASH} className="inline-flex items-center justify-center gap-2">
                <span
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full border",
                    "border-[var(--n9-accent)]/40 dark:border-[#c59d7c]/50",
                  )}
                >
                  <Play className="h-3.5 w-3.5 fill-current" aria-hidden />
                </span>
                Request a demo
              </Link>
            </Button>
            <Button
              variant="outline"
              asChild
              className={cn(
                "w-full bg-transparent sm:w-auto",
                "border-[#2a5740]/30 text-[#1a1a1a] hover:bg-[var(--n9-accent-light)]/60",
                "dark:border-[#c59d7c]/55 dark:text-[#f5f0e8] dark:hover:bg-white/5",
              )}
            >
              <Link href={CONTACT_HASH} className="inline-flex items-center justify-center gap-2">
                <MessageCircle className="h-4 w-4 shrink-0" aria-hidden />
                Contact us
              </Link>
            </Button>
          </div>
        </div>

        <div className="flex justify-center lg:justify-end">
          <PracticeCtaDiagram />
        </div>
      </div>
    </motion.div>
  )
}

function TrustApproachStrip() {
  return (
    <motion.div
      role="region"
      aria-labelledby="n9-trust-approach-heading"
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.05 }}
      viewport={{ once: true, margin: "-40px" }}
      className={cn(
        "mx-auto mt-8 max-w-6xl overflow-hidden rounded-[22px] border px-5 py-7 font-sans sm:mt-9 sm:rounded-3xl sm:px-8 sm:py-8",
        "border-[#e8e2d8] bg-white text-[#3d342e] shadow-[0_22px_55px_-38px_rgba(44,36,24,0.12)] ring-1 ring-black/[0.03]",
        "dark:border-[#c59d7c]/25 dark:bg-[#1a1614] dark:text-[#f5f0e8] dark:shadow-[0_24px_70px_-40px_rgba(0,0,0,0.45)] dark:ring-0",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-3 border-b pb-4 sm:gap-3.5 sm:pb-5",
          "border-[#e8e2d8]/90 dark:border-[#c59d7c]/25",
        )}
      >
        <Shield
          className="h-5 w-5 shrink-0 text-[#7c4b32] sm:h-[1.35rem] sm:w-[1.35rem] dark:text-[#f5f0e8]"
          strokeWidth={1.75}
          aria-hidden
        />
        <h3
          id="n9-trust-approach-heading"
          className="text-left text-[0.8125rem] font-semibold leading-snug tracking-tight text-[#2a2420] dark:text-[#f5f0e8] sm:text-[0.9375rem]"
        >
          Why teams can trust <span className="text-[var(--n9-accent)]">Notes9</span>
        </h3>
      </div>

      <div
        className={cn(
          "mt-7 flex flex-col gap-9 sm:mt-8 md:gap-10 lg:mt-9 lg:flex-row lg:gap-0 lg:divide-x",
          "lg:divide-[#e8e2d8] dark:lg:divide-[#c59d7c]/30",
        )}
      >
        {trustPillars.map((item) => (
          <div
            key={item.id}
            className="flex flex-1 flex-col items-center px-1 text-center sm:px-3 lg:px-5 lg:py-1"
          >
            <div
              className={cn(
                "flex h-14 w-14 shrink-0 items-center justify-center rounded-full border sm:h-[3.75rem] sm:w-[3.75rem]",
                "border-[#d7cbb9] bg-white/60 text-[#6b4420] dark:border-[#c59d7c]/45 dark:bg-[#1e1a22] dark:text-[#df7a97]",
              )}
            >
              <item.Icon className="h-6 w-6 sm:h-7 sm:w-7" strokeWidth={1.5} aria-hidden />
            </div>
            <p className="mt-3 max-w-[15rem] text-[0.8125rem] leading-relaxed text-[#555] sm:mt-3.5 sm:max-w-none sm:text-sm sm:leading-relaxed dark:text-[#f5f0e8]/92">
              {item.body}
            </p>
          </div>
        ))}
      </div>
    </motion.div>
  )
}

/* ─── Section ─── */

export function WhyResearchersStaySection() {
  const markerId = `n9-diff-wf-${useId().replace(/:/g, "")}`

  return (
    <section className="border-t border-[#e8e2d8]/80 bg-[#f8f5f0] dark:border-border/40 dark:bg-muted/20">
      <div className="container mx-auto px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        {/* Header — typography aligned with HTML mock */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          viewport={{ once: true }}
          className="mx-auto max-w-4xl text-center"
        >
          <div className="mb-[18px] flex items-center justify-center gap-3 leading-none">
            <p className="text-[15px] font-semibold tracking-[0.012em] text-[#2f6a4d] dark:text-[var(--n9-accent)]">
              The Notes9 difference
            </p>
          </div>
          <h2 className="font-serif text-[clamp(1.75rem,4.2vw,3.25rem)] font-bold leading-[1.15] tracking-tight text-[#1a1a1a] dark:text-foreground">
            Not just another ELN.
            <br />
            Not just another AI tool.
          </h2>
          <p className="mt-3.5 text-base font-normal text-[#555] dark:text-muted-foreground sm:text-[16px]">
          Traditional ELNs are good at recordkeeping. Current Al tools are good at general tasks, literature search, and writing assistance. Notes bridges that gap by connecting
          literature review, experiment work, and research writing in one Al-native workspace.
          </p>
        </motion.div>

        {/* Desktop scene — layout from Notes9 Marketing Page.html */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.06 }}
          viewport={{ once: true }}
          className="relative mx-auto mt-9 hidden max-w-[1200px] overflow-hidden rounded-none px-5 pb-12 pt-10 sm:px-8 md:block"
        >
          <DnaHelixDecoration />
          <SceneConnectorLines />

          <div className="relative z-[2] flex items-stretch gap-6 sm:gap-7 lg:gap-8">
            <ToolPanel variant="eln" label="ELN TOOLS" tools={elnTools} />

            <div className="flex min-h-0 min-w-0 flex-1 flex-col items-center self-stretch px-2 sm:px-4 lg:px-6">
              <HubNotes9Mascot />

              <motion.div
                variants={containerVariants}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-24px" }}
                className="mt-auto flex w-full items-stretch gap-4 sm:gap-5"
              >
                {cards.map((c) => {
                  const ts = toneStyles[c.tone]
                  return (
                    <motion.article
                      key={c.id}
                      variants={itemVariants}
                      className={cn(
                        "flex h-full min-h-0 flex-1 flex-col items-center rounded-[18px] border bg-white px-5 pb-6 pt-5 text-center transition-colors duration-300 dark:bg-card/95",
                        ts.border,
                        ts.hover,
                      )}
                    >
                      <CardIllustration cardId={c.id} markerId={markerId} />
                      <h3 className={cn("mt-1 text-[17px] font-bold leading-[1.2]", ts.title)}>{c.title}</h3>
                      <p className="text-[13px] leading-[1.5] text-[#666] dark:text-muted-foreground">{c.body}</p>
                    </motion.article>
                  )
                })}
              </motion.div>
            </div>

            <ToolPanel variant="ai" label="AI WRITING TOOLS" tools={aiTools} />
          </div>
        </motion.div>

        {/* Mobile: stacked cards + compact hub */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mx-auto mt-10 max-w-lg space-y-5 md:hidden"
        >
          <div className="flex justify-center">
            <HubNotes9Mascot className="mb-0" />
          </div>
          {cards.map((c) => {
            const ts = toneStyles[c.tone]
            return (
              <article
                key={c.id}
                className={cn(
                  "flex flex-col items-center rounded-[18px] border bg-white px-5 pb-6 pt-5 text-center dark:bg-card/95",
                  ts.border,
                )}
              >
                <CardIllustration cardId={c.id} markerId={markerId} />
                <h3 className={cn("mt-1 text-lg font-bold", ts.title)}>{c.title}</h3>
                <p className="text-sm leading-relaxed text-[#666] dark:text-muted-foreground">{c.body}</p>
              </article>
            )
          })}
        </motion.div>

        <AdoptionIntroBlock />
        <TrustApproachStrip />
        <PostTrustCtaBlock />
      </div>
    </section>
  )
}
