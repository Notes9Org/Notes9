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
  Share2,
  ShieldCheck,
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
    title: "Connected workflow",
    body: "Across literature, experiments, and writing",
    tone: "green",
  },
  {
    id: "ai",
    title: "Biotech-aware AI",
    body: "Grounded in papers, protocols, notes, and results",
    tone: "purple",
  },
  {
    id: "labs",
    title: "Researcher-first design",
    body: "Built for real lab work, day to day",
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
        <g transform="translate(10,18)">
          <path
            d="M18 0 L18 22 L4 44 Q0 50 6 54 L30 54 Q36 50 32 44 L18 22"
            stroke="#5a9070"
            strokeWidth={1.8}
            fill="none"
          />
          <path
            d="M4 44 Q0 50 6 54 L30 54 Q36 50 32 44 L22 28 L14 28 Z"
            fill="#c8e8d8"
            opacity={0.7}
          />
          <line x1="13" y1="4" x2="23" y2="4" stroke="#5a9070" strokeWidth={1.5} />
        </g>
        <g transform="translate(62,10)">
          <rect x="0" y="0" width="32" height="38" rx="3" stroke="#8aaa95" strokeWidth={1.5} fill="#f0f8f4" />
          <line x1="6" y1="10" x2="26" y2="10" stroke="#8aaa95" strokeWidth={1.2} />
          <line x1="6" y1="16" x2="26" y2="16" stroke="#8aaa95" strokeWidth={1.2} />
          <line x1="6" y1="22" x2="18" y2="22" stroke="#8aaa95" strokeWidth={1.2} />
        </g>
        <g transform="translate(58,58)">
          <rect x="0" y="0" width="38" height="30" rx="3" stroke="#8aaa95" strokeWidth={1.5} fill="#f0f8f4" />
          <rect x="6" y="18" width="6" height="8" fill="#5a9070" opacity={0.7} />
          <rect x="16" y="12" width="6" height="14" fill="#5a9070" opacity={0.7} />
          <rect x="26" y="8" width="6" height="18" fill="#5a9070" opacity={0.7} />
        </g>
        <path
          d="M38 40 Q54 30 64 24"
          stroke="#5a9070"
          strokeWidth={1.3}
          strokeDasharray="3,2"
          fill="none"
          markerEnd={`url(#${markerId})`}
        />
        <path
          d="M78 50 Q72 60 76 60"
          stroke="#5a9070"
          strokeWidth={1.3}
          strokeDasharray="3,2"
          fill="none"
          markerEnd={`url(#${markerId})`}
        />
        <path
          d="M62 78 Q44 78 36 62"
          stroke="#5a9070"
          strokeWidth={1.3}
          strokeDasharray="3,2"
          fill="none"
          markerEnd={`url(#${markerId})`}
        />
        <defs>
          <marker id={markerId} markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="#5a9070" />
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
        <g transform="translate(18,6)">
          <ellipse cx="42" cy="44" rx="36" ry="32" fill="#e8d8f5" opacity={0.6} />
          <path
            d="M42 14 C28 14 16 24 14 36 C12 46 16 56 24 60 C28 62 32 62 36 60 C38 66 40 70 42 72 C44 70 46 66 48 60 C52 62 56 62 60 60 C68 56 72 46 70 36 C68 24 56 14 42 14 Z"
            stroke="#9b72cf"
            strokeWidth={1.8}
            fill="none"
          />
          <path d="M28 32 C30 28 36 26 40 30" stroke="#9b72cf" strokeWidth={1.2} fill="none" />
          <path d="M46 30 C50 26 56 28 58 32" stroke="#9b72cf" strokeWidth={1.2} fill="none" />
          <path d="M20 44 C22 40 28 40 30 44" stroke="#9b72cf" strokeWidth={1.2} fill="none" />
          <path d="M54 44 C56 40 62 40 64 44" stroke="#9b72cf" strokeWidth={1.2} fill="none" />
          <path d="M32 56 C36 52 48 52 52 56" stroke="#9b72cf" strokeWidth={1.2} fill="none" />
          <line x1="42" y1="16" x2="42" y2="72" stroke="#9b72cf" strokeWidth={1} strokeDasharray="2,3" />
        </g>
        <g transform="translate(4,6)">
          <rect x="0" y="0" width="22" height="26" rx="2" stroke="#b090d8" strokeWidth={1.3} fill="#f5f0fc" />
          <line x1="4" y1="7" x2="18" y2="7" stroke="#b090d8" strokeWidth={1} />
          <line x1="4" y1="12" x2="18" y2="12" stroke="#b090d8" strokeWidth={1} />
          <line x1="4" y1="17" x2="12" y2="17" stroke="#b090d8" strokeWidth={1} />
        </g>
        <g transform="translate(92,4)">
          <rect x="0" y="4" width="22" height="26" rx="2" stroke="#b090d8" strokeWidth={1.3} fill="#f5f0fc" />
          <rect x="6" y="0" width="10" height="8" rx="2" stroke="#b090d8" strokeWidth={1.2} fill="#f5f0fc" />
          <line x1="4" y1="14" x2="18" y2="14" stroke="#b090d8" strokeWidth={1} />
          <line x1="4" y1="19" x2="18" y2="19" stroke="#b090d8" strokeWidth={1} />
        </g>
        <g transform="translate(44,78)">
          <rect x="0" y="10" width="6" height="10" fill="#9b72cf" opacity={0.6} />
          <rect x="10" y="5" width="6" height="15" fill="#9b72cf" opacity={0.6} />
          <rect x="20" y="0" width="6" height="20" fill="#9b72cf" opacity={0.6} />
          <line x1="-2" y1="20" x2="32" y2="20" stroke="#9b72cf" strokeWidth={1} />
        </g>
        <g transform="translate(6,68)">
          <rect x="0" y="0" width="22" height="24" rx="2" stroke="#b090d8" strokeWidth={1.3} fill="#f5f0fc" />
          <line x1="4" y1="7" x2="18" y2="7" stroke="#b090d8" strokeWidth={1} />
          <line x1="4" y1="12" x2="16" y2="12" stroke="#b090d8" strokeWidth={1} />
        </g>
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
        "flex h-full min-h-[428px] w-[164px] shrink-0 flex-col self-stretch rounded-[18px] border px-4 pb-6 pt-5 sm:min-h-[440px] sm:w-[172px] sm:px-4 sm:pb-7 sm:pt-5",
        isEln
          ? "border-red-200/90 bg-[#fff5f5] dark:border-red-900/45 dark:bg-red-950/25"
          : "border-blue-200/90 bg-[#f0f7ff] dark:border-blue-900/45 dark:bg-blue-950/25",
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
    Icon: ShieldCheck,
    body: "Designed for research data responsibility",
  },
  {
    id: "teams",
    Icon: UsersRound,
    body: "Built to reduce knowledge loss",
  },
  {
    id: "lab",
    Icon: FlaskConical,
    body: "Practical for real lab workflows",
  },
  {
    id: "compliance",
    Icon: FileCheck,
    body: "Structured around a credible long-term compliance path",
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
      <div
        className="pointer-events-none absolute inset-[12%] rounded-full bg-[var(--n9-accent)]/12 blur-2xl dark:bg-amber-400/10"
        aria-hidden
      />
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
      <div
        className={cn(
          "absolute left-1/2 top-1/2 z-[2] flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border shadow-md",
          "border-[var(--n9-accent)]/35 bg-[var(--n9-accent-light)]/80 text-[#5c4024] dark:border-amber-400/35 dark:bg-amber-500/15 dark:text-amber-100",
          "dark:shadow-[0_0_28px_-4px_rgba(251,191,36,0.45)]",
        )}
      >
        <Share2 className="h-6 w-6" strokeWidth={1.5} aria-hidden />
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
      <h2 className="mt-4 font-serif text-2xl font-bold leading-snug tracking-tight text-[#1a1a1a] dark:text-foreground sm:text-3xl lg:text-[2rem] lg:leading-tight">
        Start where Notes9 is strongest, and expand from there.
      </h2>
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
        "mx-auto mt-10 max-w-6xl overflow-hidden rounded-[24px] border px-6 py-9 font-sans sm:mt-12 sm:rounded-3xl sm:px-8 sm:py-10",
        /* Light: Notes9 cream / white card on section */
        "border-[#e8e2d8] bg-white text-[#1a1a1a] shadow-[0_22px_55px_-38px_rgba(44,36,24,0.12)] ring-1 ring-black/[0.03]",
        /* Dark: ink + bronze */
        "dark:border-[#c59d7c]/30 dark:bg-[#1a1614] dark:text-[#f5f0e8] dark:shadow-[0_32px_90px_-36px_rgba(0,0,0,0.65)] dark:ring-0",
      )}
    >
      <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(220px,300px)] lg:gap-12">
        <div className="text-left">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold tracking-wide",
              "border-[var(--n9-accent)]/35 bg-[var(--n9-accent-light)]/55 text-[#2a5740]",
              "dark:border-[#ea8c55]/70 dark:bg-transparent dark:text-[#fde68a]/95",
            )}
          >
            <span className="text-[var(--n9-accent)] dark:text-[#fb923c]" aria-hidden>
              ●
            </span>
            Free to get started
          </span>
          <h3 className="mt-5 text-2xl font-bold leading-tight tracking-tight text-[#1a1a1a] dark:text-[#f5f0e8] sm:text-3xl lg:text-[1.75rem] lg:leading-snug">
            See how connected research can feel in practice
          </h3>
          <p className="mt-3 max-w-xl text-pretty text-[0.9375rem] leading-relaxed text-[#555] sm:text-base dark:text-[#c59d7c]/95">
            Bring papers, protocols, notes, data, and reporting into a more connected workflow.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:mt-9 sm:flex-row sm:flex-wrap sm:items-center">
            <Button
              asChild
              className={cn(
                "w-full border-0 text-white sm:w-auto",
                "bg-[var(--n9-accent)] hover:bg-[var(--n9-accent)]/90",
                "dark:bg-[#a56d54] dark:hover:bg-[#955b46]",
              )}
            >
              <Link href={CONTACT_HASH} className="inline-flex items-center justify-center gap-2">
                Request a demo
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
              <Link href={FEATURES_HASH} className="inline-flex items-center justify-center gap-2">
                <span
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full border",
                    "border-[var(--n9-accent)]/40 dark:border-[#c59d7c]/50",
                  )}
                >
                  <Play className="h-3.5 w-3.5 fill-current" aria-hidden />
                </span>
                See how it works
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
        "mx-auto mt-10 max-w-5xl rounded-[22px] border px-5 py-7 font-sans sm:mt-12 sm:rounded-3xl sm:px-8 sm:py-8",
        /* Light: warm card on cream section */
        "border-[#e8e2d8] bg-white text-[#3d342e] shadow-[0_22px_55px_-38px_rgba(44,36,24,0.12)] ring-1 ring-black/[0.03]",
        /* Dark: ink + bronze (original) */
        "dark:border-[#c59d7c]/25 dark:bg-[#1a1614] dark:text-[#c59d7c] dark:shadow-[0_24px_70px_-40px_rgba(0,0,0,0.35)] dark:ring-0",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-3 border-b pb-4 sm:gap-3.5 sm:pb-5",
          "border-[#e8e2d8] dark:border-[#c59d7c]/25",
        )}
      >
        <ShieldCheck
          className="h-5 w-5 shrink-0 text-[#7c4b32] sm:h-[1.35rem] sm:w-[1.35rem] dark:text-[#c59d7c]"
          strokeWidth={1.75}
          aria-hidden
        />
        <h3
          id="n9-trust-approach-heading"
          className="text-left text-[0.8125rem] font-semibold leading-snug tracking-tight text-[#2a2420] dark:text-[#c59d7c] sm:text-[0.9375rem]"
        >
          Why teams can trust the approach
        </h3>
      </div>

      <div
        className={cn(
          "mt-7 flex flex-col gap-10 sm:mt-8 md:gap-11 lg:mt-9 lg:flex-row lg:gap-0 lg:divide-x",
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
                "border-[#c59d7c]/45 text-[#6b4420] dark:border-[#c59d7c]/55 dark:text-[#c59d7c]",
              )}
            >
              <item.Icon className="h-6 w-6 sm:h-7 sm:w-7" strokeWidth={1.5} aria-hidden />
            </div>
            <p className="mt-3 max-w-[15rem] text-[0.8125rem] leading-relaxed text-[#555] sm:mt-3.5 sm:max-w-none sm:text-sm sm:leading-relaxed dark:text-[#c59d7c]/95">
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
          <div className="mb-[18px] flex items-center justify-center gap-3">
            <div className="h-[1.5px] w-[60px] bg-[#3a6b50]/80 dark:bg-[var(--n9-accent)]/50" aria-hidden />
            <p className="text-[13.5px] font-semibold tracking-[0.01em] text-[#2a5740] dark:text-[var(--n9-accent)]">
              The Notes9 difference
            </p>
            <div className="h-[1.5px] w-[60px] bg-[#3a6b50]/80 dark:bg-[var(--n9-accent)]/50" aria-hidden />
          </div>
          <h2 className="font-serif text-[clamp(1.75rem,4.2vw,3.25rem)] font-bold leading-[1.15] tracking-tight text-[#1a1a1a] dark:text-foreground">
            Not just another ELN.
            <br />
            Not just another AI tool.
          </h2>
          <p className="mt-3.5 text-base font-normal text-[#555] dark:text-muted-foreground sm:text-[16px]">
            A connected research workspace for the full workflow.
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
