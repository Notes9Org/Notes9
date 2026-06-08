"use client"

/**
 * HTML/CSS-based marketing embeds — animated UI mockups in the spirit of the
 * hero's ConnectedResearchSystemDiagram. No WebGL: everything here is DOM +
 * framer-motion + CSS so the bundle stays light and the look matches the app.
 *
 * All colors come from the marketing theme tokens (var(--n9-accent), etc.).
 */

import { Fragment, useEffect, useRef, useState } from "react"
import {
  AnimatePresence,
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "framer-motion"
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Boxes,
  Check,
  ClipboardList,
  Database,
  FileSignature,
  FileText,
  FlaskConical,
  GraduationCap,
  Microscope,
  NotebookPen,
  Quote,
  Sparkles,
  Users,
  X,
  Zap,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { IceMascot } from "@/components/ui/ice-mascot"
import { MiniKnowledgeFlow } from "@/components/marketing/flow-embeds"

// ---------------------------------------------------------------------------
// 1. Connected-research chain — a seamless marquee of the research lifecycle.
// ---------------------------------------------------------------------------

const CHAIN = [
  { label: "Literature", icon: BookOpen },
  { label: "Hypothesis", icon: Sparkles },
  { label: "Protocol", icon: ClipboardList },
  { label: "Experiment", icon: FlaskConical },
  { label: "Observation", icon: Microscope },
  { label: "Result", icon: BarChart3 },
  { label: "Report", icon: FileSignature },
] as const

function ChainPill({ label, icon: Icon }: { label: string; icon: typeof BookOpen }) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <div className="flex items-center gap-2 rounded-full border border-border/60 bg-card/80 px-4 py-2 shadow-sm backdrop-blur-sm">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--n9-accent-light)] text-[var(--n9-accent)]">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="text-sm font-medium text-foreground">{label}</span>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-[var(--n9-accent)]/50" />
    </div>
  )
}

export function ConnectedChainMarquee() {
  // Four copies so the track is always far wider than any viewport; the CSS
  // animation translates exactly -50% (= two copies) for a perfectly seamless,
  // never-ending loop.
  const sequence = [...CHAIN, ...CHAIN, ...CHAIN, ...CHAIN]
  return (
    <div className="relative w-full overflow-hidden py-2">
      {/* edge fades — matched to the page background so the strip never looks
          like it "ends" */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-20 bg-gradient-to-r from-[var(--background)] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-20 bg-gradient-to-l from-[var(--background)] to-transparent" />
      <div className="n9-marquee-track flex w-max items-center gap-3">
        {sequence.map((item, i) => (
          <ChainPill key={`${item.label}-${i}`} label={item.label} icon={item.icon} />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 2. Scattered → connected — the "pain" embed. Tool chips fly into one memory.
// ---------------------------------------------------------------------------

const SCATTERED = [
  { label: "paper.pdf", sub: "Zotero", icon: FileText, scatter: { x: 6, y: 10 } },
  { label: "plate_map.xlsx", sub: "Excel", icon: BarChart3, scatter: { x: 66, y: 6 } },
  { label: "notes", sub: "Notion", icon: NotebookPen, scatter: { x: 70, y: 70 } },
  { label: "protocol.docx", sub: "Word", icon: ClipboardList, scatter: { x: 4, y: 66 } },
  { label: "ai-chat.txt", sub: "ChatGPT", icon: Sparkles, scatter: { x: 38, y: 84 } },
] as const

// Even orbit around the centre node (percent coordinates) for the connected state.
const ORBIT = SCATTERED.map((_, i) => {
  const angle = (i / SCATTERED.length) * Math.PI * 2 - Math.PI / 2
  return { x: 50 + 36 * Math.cos(angle), y: 50 + 32 * Math.sin(angle) }
})

export function ScatteredToConnected({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: "-80px" })
  const reduce = useReducedMotion()
  const connected = inView || reduce

  return (
    <div
      ref={ref}
      className={cn(
        "relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-border/60 bg-card/70 p-4 backdrop-blur-sm sm:aspect-[16/10]",
        className,
      )}
    >
      <div className="absolute left-4 top-4 z-20 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
        {connected ? "Connected in Notes9" : "Today: scattered context"}
      </div>

      {/* connecting lines (percent coordinate space) */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden
      >
        {ORBIT.map((p, i) => (
          <motion.line
            key={i}
            x1={p.x}
            y1={p.y}
            x2={50}
            y2={50}
            initial={false}
            animate={{ opacity: connected ? 0.4 : 0 }}
            transition={{ duration: 0.5, delay: 0.2 + i * 0.06 }}
            stroke="var(--n9-accent)"
            strokeWidth={0.4}
            strokeDasharray="1.5 1.5"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>

      {/* data flowing from each source into the memory node */}
      {connected
        ? ORBIT.map((p, i) => (
            <motion.span
              key={`flow-${i}`}
              aria-hidden
              className="pointer-events-none absolute z-[5] h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--n9-accent)] shadow-[0_0_8px_var(--n9-accent-glow)]"
              initial={{ left: `${p.x}%`, top: `${p.y}%`, opacity: 0 }}
              animate={{ left: [`${p.x}%`, "50%"], top: [`${p.y}%`, "50%"], opacity: [0, 1, 0] }}
              transition={{ duration: 1.9, repeat: Infinity, delay: 0.6 + i * 0.28, ease: "easeIn" }}
            />
          ))
        : null}

      {/* central memory node */}
      <motion.div
        initial={false}
        animate={{ scale: connected ? 1 : 0.82, opacity: connected ? 1 : 0.45 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 rounded-2xl border border-[var(--n9-accent)]/30 bg-[var(--n9-accent-light)] px-5 py-3 text-center shadow-[0_12px_40px_-16px_var(--n9-accent-glow)]"
      >
        <Database className="h-5 w-5 text-[var(--n9-accent)]" />
        <span className="text-xs font-semibold text-[var(--n9-accent)]">Project memory</span>
      </motion.div>

      {/* tool chips */}
      {SCATTERED.map((s, i) => {
        const Icon = s.icon
        const pos = connected ? ORBIT[i] : s.scatter
        return (
          <motion.div
            key={s.label}
            initial={false}
            animate={{ left: `${pos.x}%`, top: `${pos.y}%`, opacity: connected ? 1 : 0.9 }}
            transition={{ duration: 0.7, ease: "easeInOut", delay: i * 0.05 }}
            className="absolute z-10 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-lg border border-border/60 bg-card px-2.5 py-1.5 shadow-sm"
          >
            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-foreground">{s.label}</span>
            <span className="hidden text-xs text-muted-foreground/70 sm:inline">{s.sub}</span>
          </motion.div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 3. Role use-case switcher — tabs of who Notes9 is for + the outcome.
// ---------------------------------------------------------------------------

const ROLES = [
  {
    key: "phd",
    label: "PhD student",
    icon: GraduationCap,
    outcome: "Make months of work defensible.",
    chips: ["Trace every result", "Reconstruct decisions", "Draft methods"],
    mock: <MiniNoteMock />,
  },
  {
    key: "pi",
    label: "PI",
    icon: Users,
    outcome: "Walk in with the full trail.",
    chips: ["See every run", "Ask your lab", "PI-ready updates"],
    mock: <MiniChatMock />,
  },
  {
    key: "lab-manager",
    label: "Lab manager",
    icon: Boxes,
    outcome: "Keep everything traceable.",
    chips: ["Versioned protocols", "Linked samples", "Easy onboarding"],
    mock: <MiniKnowledgeFlow />,
  },
  {
    key: "biotech",
    label: "Biotech R&D",
    icon: FlaskConical,
    outcome: "Keep knowledge as people rotate.",
    chips: ["Rationale kept", "Cited reports", "Audit-friendly"],
    mock: <MiniReportMock />,
  },
] as const

export function RoleUseCaseSwitcher() {
  const [active, setActive] = useState(0)
  const role = ROLES[active]
  const Icon = role.icon
  return (
    <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
      <div className="flex flex-wrap gap-2 lg:flex-col">
        {ROLES.map((r, i) => {
          const RIcon = r.icon
          const isActive = i === active
          return (
            <button
              key={r.key}
              type="button"
              onClick={() => setActive(i)}
              className={cn(
                "group inline-flex items-center gap-2.5 rounded-xl border px-4 py-3 text-left text-sm font-medium transition-all",
                isActive
                  ? "border-[var(--n9-accent)]/40 bg-[var(--n9-accent-light)] text-[var(--n9-accent)] shadow-sm"
                  : "border-border/50 bg-card/60 text-foreground hover:border-[var(--n9-accent)]/30",
              )}
            >
              <span
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-lg",
                  isActive ? "bg-[var(--n9-accent)] text-white" : "bg-muted text-muted-foreground",
                )}
              >
                <RIcon className="h-4 w-4" />
              </span>
              {r.label}
            </button>
          )
        })}
      </div>

      <div className="rounded-2xl border border-border/50 bg-card/80 p-6 backdrop-blur-sm sm:p-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={role.key}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--n9-accent-light)] text-[var(--n9-accent)]">
              <Icon className="h-5 w-5" />
            </div>
            <p className="text-xl font-semibold text-foreground sm:text-2xl">{role.outcome}</p>
            <div className="mt-5 [transform:translateZ(24px)]">{role.mock}</div>
            <div className="mt-5 flex flex-wrap gap-1.5">
              {role.chips.map((c) => (
                <span
                  key={c}
                  className="inline-flex items-center gap-1 rounded-full border border-[var(--n9-accent)]/20 bg-[var(--n9-accent-light)] px-2.5 py-1 text-xs font-medium text-[var(--n9-accent)]"
                >
                  <Check className="h-3 w-3" />
                  {c}
                </span>
              ))}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 4. ELN vs AI chat vs Notes9 — sharp differentiation table.
// ---------------------------------------------------------------------------

const DIFF_ROWS = [
  { cap: "Records what happened", eln: true, ai: false, n9: true },
  { cap: "Remembers why it happened", eln: false, ai: false, n9: true },
  { cap: "Answers from your lab's context", eln: false, ai: false, n9: true },
  { cap: "Traces every output to its sources", eln: false, ai: false, n9: true },
  { cap: "Links papers → protocols → results", eln: false, ai: false, n9: true },
] as const

function Cell({ on }: { on: boolean }) {
  return on ? (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--n9-accent-light)] text-[var(--n9-accent)]">
      <Check className="h-3.5 w-3.5" />
    </span>
  ) : (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-muted-foreground/50">
      <X className="h-3.5 w-3.5" />
    </span>
  )
}

export function ElnVsAiVsNotes9() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/70 backdrop-blur-sm">
      <div className="grid grid-cols-[1.4fr_repeat(3,0.8fr)] items-center gap-2 border-b border-border/60 bg-muted/40 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:px-6">
        <span>Capability</span>
        <span className="text-center">ELN</span>
        <span className="text-center">AI chat</span>
        <span className="text-center text-[var(--n9-accent)]">Notes9</span>
      </div>
      {DIFF_ROWS.map((r, i) => (
        <div
          key={r.cap}
          className={cn(
            "grid grid-cols-[1.4fr_repeat(3,0.8fr)] items-center gap-2 px-4 py-3.5 text-sm sm:px-6",
            i % 2 === 1 && "bg-muted/20",
          )}
        >
          <span className="font-medium text-foreground">{r.cap}</span>
          <span className="flex justify-center"><Cell on={r.eln} /></span>
          <span className="flex justify-center"><Cell on={r.ai} /></span>
          <span className="flex justify-center rounded-md bg-[var(--n9-accent-light)]/60 py-1"><Cell on={r.n9} /></span>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 5. Demo-story stepper — the antibody-expression walkthrough, auto-advancing.
// ---------------------------------------------------------------------------

const STORY = [
  { t: "Upload 8 papers", d: "Catalyst extracts the design rationale across the literature.", icon: BookOpen },
  { t: "Create the construct plan", d: "Turn that rationale into an experiment plan, traceable to each source.", icon: Sparkles },
  { t: "Attach the protocol", d: "Link a versioned transfection protocol to the run.", icon: ClipboardList },
  { t: "Record conditions & samples", d: "Capture transfection conditions and the constructs used.", icon: FlaskConical },
  { t: "Link purification data", d: "Drop yield data in; it stays attached to the run that produced it.", icon: BarChart3 },
  { t: "Generate the PI update", d: "A cited summary of yield differences — with the full decision trail intact.", icon: FileSignature },
] as const

export function DemoStoryStepper() {
  const [active, setActive] = useState(0)
  const reduce = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { margin: "-120px" })

  useEffect(() => {
    if (reduce || !inView) return
    const id = setInterval(() => setActive((a) => (a + 1) % STORY.length), 2600)
    return () => clearInterval(id)
  }, [reduce, inView])

  const ActiveIcon = STORY[active].icon

  return (
    <div ref={ref} className="grid gap-6 lg:grid-cols-[1fr_1fr] lg:items-stretch">
      {/* steps */}
      <ol className="space-y-2">
        {STORY.map((s, i) => {
          const Icon = s.icon
          const isActive = i === active
          return (
            <li key={s.t}>
              <button
                type="button"
                onClick={() => setActive(i)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition-all",
                  isActive
                    ? "border-[var(--n9-accent)]/40 bg-[var(--n9-accent-light)]"
                    : "border-transparent hover:bg-muted/40",
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold",
                    isActive ? "bg-[var(--n9-accent)] text-white" : "bg-muted text-muted-foreground",
                  )}
                >
                  {i + 1}
                </span>
                <span>
                  <span className={cn("flex items-center gap-2 text-sm font-semibold", isActive ? "text-[var(--n9-accent)]" : "text-foreground")}>
                    <Icon className="h-3.5 w-3.5" />
                    {s.t}
                  </span>
                  {isActive ? (
                    <motion.span
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="mt-1 block text-xs leading-5 text-muted-foreground"
                    >
                      {s.d}
                    </motion.span>
                  ) : null}
                </span>
              </button>
            </li>
          )
        })}
      </ol>

      {/* mock panel */}
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card/80 p-5 backdrop-blur-sm">
        <div className="flex items-center gap-1.5 border-b border-border/50 pb-3">
          <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
          <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
          <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
          <span className="ml-3 text-xs font-medium text-muted-foreground">Antibody expression · project memory</span>
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="pt-4"
          >
            <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--n9-accent-light)] text-[var(--n9-accent)]">
              <ActiveIcon className="h-4 w-4" />
            </div>
            <p className="text-sm font-semibold text-foreground">{STORY[active].t}</p>
            <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{STORY[active].d}</p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {STORY.slice(0, active + 1).map((s) => (
                <span
                  key={s.t}
                  className="rounded-full border border-[var(--n9-accent)]/20 bg-[var(--n9-accent-light)] px-2.5 py-1 text-xs font-medium text-[var(--n9-accent)]"
                >
                  {s.t}
                </span>
              ))}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 6. Catalyst answer card — biology-first answer with citations at the bottom.
// ---------------------------------------------------------------------------

export function CatalystAnswerCard({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-border/60 bg-card/80 p-5 backdrop-blur-sm", className)}>
      <div className="flex items-center gap-2 border-b border-border/50 pb-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--n9-accent)] text-white">
          <Sparkles className="h-4 w-4" />
        </span>
        <span className="text-sm font-semibold text-foreground">Catalyst</span>
        <span className="ml-auto rounded-full bg-[var(--n9-accent-light)] px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-[var(--n9-accent)]">
          Biology-first
        </span>
      </div>
      <div className="space-y-2 pt-4 text-sm leading-6 text-muted-foreground">
        <p className="text-foreground">Why was condition B chosen for the transfection?</p>
        <p>
          Condition B used a 3:1 PEI-to-DNA ratio because it gave the highest transient yield in your
          earlier screen, and it matches the ratio reported in the two papers you saved.
        </p>
      </div>
      <div className="mt-4 border-t border-border/50 pt-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">
          Sources
        </p>
        <div className="flex flex-wrap gap-1.5">
          {[
            { label: "Expt #14 — PEI screen", internal: true },
            { label: "Lab note · 12 Mar", internal: true },
            { label: "Longo et al., 2023", internal: false },
          ].map((c) => (
            <span
              key={c.label}
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs",
                c.internal
                  ? "border-[var(--n9-accent)]/25 bg-[var(--n9-accent-light)] text-[var(--n9-accent)]"
                  : "border-border/60 bg-muted/40 text-muted-foreground",
              )}
            >
              <Quote className="h-3 w-3" />
              {c.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 7. TiltCard — interactive 3D perspective tilt that follows the pointer.
// ---------------------------------------------------------------------------

export function TiltCard({
  children,
  className,
  max = 7,
}: {
  children: React.ReactNode
  className?: string
  max?: number
}) {
  const reduce = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  const rx = useMotionValue(0)
  const ry = useMotionValue(0)
  const srx = useSpring(rx, { stiffness: 140, damping: 14 })
  const sry = useSpring(ry, { stiffness: 140, damping: 14 })

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    if (reduce) return
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width - 0.5
    const py = (e.clientY - r.top) / r.height - 0.5
    ry.set(px * max * 2)
    rx.set(-py * max * 2)
  }
  function reset() {
    rx.set(0)
    ry.set(0)
  }

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={reset}
      whileHover={reduce ? undefined : { scale: 1.015 }}
      transition={{ type: "spring", stiffness: 200, damping: 18 }}
      style={{ rotateX: srx, rotateY: sry, transformPerspective: 1100 }}
      className={cn("[transform-style:preserve-3d] will-change-transform", className)}
    >
      {children}
    </motion.div>
  )
}

/** Scroll-in 3D reveal — content rises and rotates up into place. Stack on top
 *  of TiltCard for entrance-3D + interactive-3D. */
export function Reveal3D({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode
  className?: string
  delay?: number
}) {
  const reduce = useReducedMotion()
  if (reduce) return <div className={className}>{children}</div>
  return (
    <motion.div
      className={cn("[transform-style:preserve-3d]", className)}
      initial={{ opacity: 0, y: 30, rotateX: 13 }}
      whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay }}
      style={{ transformPerspective: 1000 }}
    >
      {children}
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// 8. Mini illustrative mocks — tiny skeleton UIs for the capability bento.
// ---------------------------------------------------------------------------

function Bar({ w, tone = "muted" }: { w: string; tone?: "muted" | "accent" }) {
  return (
    <div
      className={cn("h-1.5 rounded-full", tone === "accent" ? "bg-[var(--n9-accent)]/35" : "bg-foreground/10")}
      style={{ width: w }}
    />
  )
}

function MockFrame({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/80 p-3 shadow-sm">
      <div className="mb-2 flex items-center gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
        <span className="ml-auto text-xs font-semibold uppercase tracking-wide text-muted-foreground/60">
          {label}
        </span>
      </div>
      {children}
    </div>
  )
}

/** A lab note with inline @cite / @sample chips. */
export function MiniNoteMock() {
  return (
    <MockFrame label="Lab note">
      <div className="space-y-1.5">
        <Bar w="70%" />
        <Bar w="92%" />
        <div className="flex flex-wrap items-center gap-1 py-0.5">
          <span className="rounded bg-[var(--n9-accent-light)] px-1.5 py-0.5 text-xs font-medium text-[var(--n9-accent)]">@protocol</span>
          <Bar w="28%" />
          <span className="rounded bg-[var(--n9-accent-light)] px-1.5 py-0.5 text-xs font-medium text-[var(--n9-accent)]">@sample</span>
        </div>
        <Bar w="84%" />
      </div>
    </MockFrame>
  )
}

/** A Catalyst answer with a citation chip. */
export function MiniChatMock() {
  return (
    <MockFrame label="Catalyst">
      <div className="space-y-1.5">
        <div className="ml-auto w-[60%] rounded-lg rounded-br-sm bg-muted/60 p-1.5">
          <Bar w="80%" />
        </div>
        <div className="w-[78%] rounded-lg rounded-bl-sm bg-[var(--n9-accent-light)] p-1.5">
          <Bar w="90%" tone="accent" />
          <div className="mt-1"><Bar w="60%" tone="accent" /></div>
        </div>
        <div className="flex gap-1">
          <span className="inline-flex items-center gap-0.5 rounded border border-[var(--n9-accent)]/25 bg-[var(--n9-accent-light)] px-1 py-0.5 text-xs text-[var(--n9-accent)]">
            <Quote className="h-2 w-2" /> source
          </span>
        </div>
      </div>
    </MockFrame>
  )
}

/** A tiny animated knowledge graph — nodes + edges drawn in one SVG coordinate
 *  space so the lines always meet the nodes exactly. */
export function MiniGraphMock() {
  const nodes = [
    { x: 24, y: 22 },
    { x: 96, y: 16 },
    { x: 62, y: 44 },
    { x: 102, y: 66 },
    { x: 26, y: 66 },
  ]
  const edges = [
    [0, 2],
    [1, 2],
    [2, 3],
    [2, 4],
  ]
  return (
    <MockFrame label="Research map">
      <svg viewBox="0 0 120 80" className="h-[72px] w-full">
        {edges.map(([a, b], i) => (
          <line
            key={i}
            x1={nodes[a].x}
            y1={nodes[a].y}
            x2={nodes[b].x}
            y2={nodes[b].y}
            stroke="var(--n9-accent)"
            strokeWidth={1}
            strokeOpacity={0.45}
          />
        ))}
        {nodes.map((n, i) => (
          <motion.circle
            key={i}
            cx={n.x}
            cy={n.y}
            r={4}
            fill="var(--n9-accent)"
            animate={{ r: [4, 5, 4] }}
            transition={{ duration: 2, repeat: Infinity, delay: i * 0.3 }}
          />
        ))}
      </svg>
    </MockFrame>
  )
}

// ---------------------------------------------------------------------------
// 9. BioCatalystDemo — interactive, biology-first AI showcase with the mascot.
// ---------------------------------------------------------------------------

const BIO_QA = [
  {
    q: "Why did condition B win?",
    a: "Condition B used a 3:1 PEI:DNA ratio — it gave the highest transient yield in your earlier screen and matches the ratio in the two papers you saved.",
    sources: ["Expt #14 — PEI screen", "Lab note · 12 Mar", "Longo et al., 2023"],
  },
  {
    q: "Design primers for this construct",
    a: "Here are Tm-matched primers (~60 °C) flanking your insert, with Gibson overhangs for pET-28a. Want me to add a TEV site before the tag?",
    sources: ["Construct map", "NEB Tm calculator"],
  },
  {
    q: "Summarize today's Western blot",
    a: "Your ~52 kDa target is clearly enriched in lane 3; the loading control is even — consistent with successful induction. Quantify by densitometry to confirm.",
    sources: ["blot.tif", "Expt #21"],
  },
  {
    q: "Best buffer for this protein?",
    a: "For this His-tagged kinase: 50 mM Tris pH 8, 300 mM NaCl, 10 % glycerol, plus 1 mM TCEP to keep the cysteines reduced.",
    sources: ["UniProt entry", "Protocol P-07"],
  },
] as const

export function BioCatalystDemo() {
  const reduce = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { margin: "-100px" })
  const [active, setActive] = useState(0)
  const [typed, setTyped] = useState<string>(BIO_QA[0].a)
  const qa = BIO_QA[active]

  // Type the answer out character-by-character when the question changes.
  useEffect(() => {
    if (reduce) {
      setTyped(qa.a)
      return
    }
    setTyped("")
    let i = 0
    const id = setInterval(() => {
      i += 1
      setTyped(qa.a.slice(0, i))
      if (i >= qa.a.length) clearInterval(id)
    }, 14)
    return () => clearInterval(id)
  }, [active, qa.a, reduce])

  // Auto-advance through the questions while in view.
  useEffect(() => {
    if (reduce || !inView) return
    const id = setTimeout(() => setActive((a) => (a + 1) % BIO_QA.length), 6800)
    return () => clearTimeout(id)
  }, [active, reduce, inView])

  const typing = !reduce && typed.length < qa.a.length

  return (
    <div ref={ref} className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
      {/* Mascot + positioning copy */}
      <div className="flex flex-col items-start gap-4">
        <IceMascot className="w-28 drop-shadow-[0_16px_30px_rgba(150,80,52,0.25)] sm:w-36" />
        <span className="inline-flex items-center gap-2 rounded-full border border-[var(--n9-accent)]/25 bg-[var(--n9-accent-light)] px-3 py-1 text-xs font-semibold text-[var(--n9-accent)]">
          <Sparkles className="h-3.5 w-3.5" /> Biology-first AI
        </span>
        <p className="text-base leading-7 text-muted-foreground">
          Tuned for the life sciences. It reads your context fast and answers in the language of the
          bench.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {["Genomics", "Proteomics", "Cell culture", "Assays", "Constructs"].map((d) => (
            <span
              key={d}
              className="rounded-full border border-[var(--n9-accent)]/20 bg-[var(--n9-accent-light)]/70 px-2.5 py-1 text-xs font-medium text-[var(--n9-accent)]"
            >
              {d}
            </span>
          ))}
        </div>
      </div>

      {/* Interactive chat */}
      <TiltCard max={5}>
        <div className="rounded-2xl border border-border/60 bg-card/85 p-5 shadow-[0_24px_60px_-32px_rgba(44,36,24,0.25)] backdrop-blur-sm">
          <div className="flex items-center gap-2 border-b border-border/50 pb-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--n9-accent)] text-white">
              <Sparkles className="h-4 w-4" />
            </span>
            <span className="text-sm font-semibold text-foreground">Catalyst</span>
            <span className="ml-auto rounded-full bg-[var(--n9-accent-light)] px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-[var(--n9-accent)]">
              Biology-first
            </span>
          </div>

          {/* Clickable bio questions */}
          <div className="flex flex-wrap gap-1.5 pt-3">
            {BIO_QA.map((item, i) => (
              <button
                key={item.q}
                type="button"
                onClick={() => setActive(i)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  i === active
                    ? "border-[var(--n9-accent)]/40 bg-[var(--n9-accent-light)] text-[var(--n9-accent)]"
                    : "border-border/60 bg-muted/30 text-muted-foreground hover:text-foreground",
                )}
              >
                {item.q}
              </button>
            ))}
          </div>

          {/* Answer */}
          <div className="mt-4 min-h-[6.5rem] space-y-2 text-sm leading-6">
            <p className="font-medium text-foreground">{qa.q}</p>
            <p className="text-muted-foreground">
              {typed}
              {typing ? (
                <span className="ml-0.5 inline-block h-4 w-[2px] -translate-y-[1px] animate-pulse bg-[var(--n9-accent)] align-middle" />
              ) : null}
            </p>
          </div>

          {/* Sources */}
          {!typing ? (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-3 border-t border-border/50 pt-3"
            >
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">
                Sources
              </p>
              <div className="flex flex-wrap gap-1.5">
                {qa.sources.map((s, i) => (
                  <span
                    key={s}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs",
                      i < qa.sources.length - 1
                        ? "border-[var(--n9-accent)]/25 bg-[var(--n9-accent-light)] text-[var(--n9-accent)]"
                        : "border-border/60 bg-muted/40 text-muted-foreground",
                    )}
                  >
                    <Quote className="h-3 w-3" />
                    {s}
                  </span>
                ))}
              </div>
            </motion.div>
          ) : null}
        </div>
      </TiltCard>
    </div>
  )
}

/** A generated report with a tiny chart. */
export function MiniReportMock() {
  return (
    <MockFrame label="Report">
      <div className="space-y-1.5">
        <Bar w="55%" tone="accent" />
        <div className="flex items-end gap-1 py-0.5" style={{ height: 28 }}>
          {[50, 80, 40, 92, 64].map((h, i) => (
            <div key={i} className="flex-1 rounded-t-sm bg-[var(--n9-accent)]/30" style={{ height: `${h}%` }} />
          ))}
        </div>
        <Bar w="88%" />
        <Bar w="72%" />
      </div>
    </MockFrame>
  )
}

/** Academic ICP — a manuscript with auto-cited methods drafted from notes. */
export function AcademicMock() {
  return (
    <MockFrame label="Manuscript">
      <div className="space-y-1.5">
        <span className="text-xs font-semibold text-[var(--n9-accent)]">Methods</span>
        <Bar w="94%" />
        <div className="flex items-center gap-1">
          <Bar w="58%" />
          <span className="rounded bg-[var(--n9-accent-light)] px-1 text-xs font-bold text-[var(--n9-accent)]">[1]</span>
        </div>
        <Bar w="86%" />
        <div className="flex items-center gap-1">
          <Bar w="44%" />
          <span className="rounded bg-[var(--n9-accent-light)] px-1 text-xs font-bold text-[var(--n9-accent)]">[2]</span>
        </div>
        <p className="pt-0.5 text-xs text-muted-foreground/70">Drafted from your notes · auto-cited</p>
      </div>
    </MockFrame>
  )
}

// ---------------------------------------------------------------------------
// 9b. AccelerateDiscovery — bio-first AI compresses the path to insight.
// ---------------------------------------------------------------------------

const ACCEL_PATH = ["Literature", "Hypothesis", "Experiment", "Insight"] as const

function AccelTrack({
  label,
  value,
  pct,
  accent,
}: {
  label: string
  value: string
  pct: number
  accent: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: "-40px" })
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className={accent ? "font-semibold text-[var(--n9-accent)]" : "text-muted-foreground"}>{label}</span>
        <span className={accent ? "font-semibold text-[var(--n9-accent)]" : "text-muted-foreground/70"}>{value}</span>
      </div>
      <div ref={ref} className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <motion.div
          className={cn("h-full rounded-full", accent ? "bg-[var(--n9-accent)] shadow-[0_0_12px_var(--n9-accent-glow)]" : "bg-muted-foreground/30")}
          initial={{ width: 0 }}
          animate={inView ? { width: `${pct}%` } : {}}
          transition={{ duration: 1, ease: "easeOut" }}
        />
      </div>
    </div>
  )
}

export function AccelerateDiscovery() {
  return (
    <div className="n9-card p-6 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--n9-accent)]/25 bg-[var(--n9-accent-light)] px-3 py-1 text-xs font-semibold text-[var(--n9-accent)]">
          <Sparkles className="h-3.5 w-3.5" /> Biology-first AI
        </span>
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Zap className="h-4 w-4 text-[var(--n9-accent)]" /> Weeks → days
        </span>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-1.5">
        {ACCEL_PATH.map((s, i) => (
          <Fragment key={s}>
            <span className="rounded-lg border border-border/60 bg-card px-2.5 py-1 text-xs font-medium text-foreground">
              {s}
            </span>
            {i < ACCEL_PATH.length - 1 ? <ArrowRight className="h-3.5 w-3.5 text-[var(--n9-accent)]/50" /> : null}
          </Fragment>
        ))}
      </div>

      <div className="mt-6 space-y-4">
        <AccelTrack label="Scattered tools" value="~6 weeks" pct={100} accent={false} />
        <AccelTrack label="With Catalyst" value="~9 days" pct={26} accent />
      </div>

      <p className="mt-5 text-sm leading-6 text-muted-foreground">
        From question to validated insight — Catalyst reasons over your bio context to cut the
        busywork, not the rigor.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 10. ICP narratives — richer animated stories, not single tool glimpses.
// ---------------------------------------------------------------------------

/** Academics: a PI's "why?" is reconstructed as a cited chain, step by step. */
export function AcademicNarrative() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { margin: "-80px" })
  const reduce = useReducedMotion()
  const [cycle, setCycle] = useState(0)

  useEffect(() => {
    if (reduce || !inView) return
    const id = setInterval(() => setCycle((c) => c + 1), 5200)
    return () => clearInterval(id)
  }, [reduce, inView])

  const chain = [
    { label: "Paper", cite: "1" },
    { label: "Protocol", cite: null },
    { label: "Expt #14", cite: null },
    { label: "Result", cite: null },
  ]
  const base = reduce ? 0 : 1

  return (
    <div
      ref={ref}
      className="rounded-xl border border-border/60 bg-card/80 p-4 shadow-[0_18px_50px_-30px_rgba(44,36,24,0.3)]"
    >
      {/* the question */}
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
          PI
        </span>
        <span className="rounded-lg rounded-bl-sm bg-muted/60 px-2.5 py-1.5 text-xs text-foreground">
          Why was condition B chosen?
        </span>
      </div>

      {/* the reconstructed chain */}
      <div key={cycle} className="mt-4 flex flex-wrap items-center gap-1.5">
        {chain.map((c, i) => (
          <Fragment key={c.label}>
            <motion.span
              initial={{ opacity: 0, y: 6, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: base * i * 0.5, duration: 0.4 }}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--n9-accent)]/25 bg-[var(--n9-accent-light)] px-2 py-1 text-xs font-semibold text-[var(--n9-accent)]"
            >
              {c.label}
              {c.cite ? <sup className="text-xs">[{c.cite}]</sup> : null}
            </motion.span>
            {i < chain.length - 1 ? (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: base * (i * 0.5 + 0.25) }}
              >
                <ArrowRight className="h-3.5 w-3.5 text-[var(--n9-accent)]/50" />
              </motion.span>
            ) : null}
          </Fragment>
        ))}
      </div>

      {/* the payoff */}
      <motion.div
        key={`r${cycle}`}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: base * (chain.length * 0.5 + 0.2) }}
        className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-[var(--n9-accent)] px-2.5 py-1 text-xs font-semibold text-white"
      >
        <Check className="h-3 w-3" /> Reconstructed, with citations
      </motion.div>
    </div>
  )
}

/** Startup labs: people rotate quarter to quarter, but the shared memory keeps
 *  filling and never drops — knowledge compounds. */
export function StartupNarrative() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { margin: "-80px" })
  const reduce = useReducedMotion()
  const [q, setQ] = useState(reduce ? 2 : 0)

  useEffect(() => {
    if (reduce || !inView) return
    const id = setInterval(() => setQ((v) => (v + 1) % 3), 1900)
    return () => clearInterval(id)
  }, [reduce, inView])

  // Per-quarter: who's present (and who has left), memory fill, item count.
  const QUARTERS = [
    { team: [{ id: "A", left: false }], fill: 42, items: 18 },
    { team: [{ id: "A", left: false }, { id: "B", left: false }], fill: 74, items: 47 },
    { team: [{ id: "A", left: true }, { id: "B", left: false }, { id: "C", left: false }], fill: 100, items: 86 },
  ]
  const cur = QUARTERS[q]

  return (
    <div
      ref={ref}
      className="rounded-xl border border-border/60 bg-card/80 p-4 shadow-[0_18px_50px_-30px_rgba(44,36,24,0.3)]"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
          Quarter {q + 1}
        </span>
        <span className="flex -space-x-1.5">
          {cur.team.map((m) => (
            <span
              key={m.id}
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded-full border-2 border-card bg-muted text-xs font-bold text-muted-foreground",
                m.left && "opacity-30 line-through",
              )}
            >
              {m.id}
            </span>
          ))}
        </span>
      </div>

      {/* memory meter — grows and stays full even as A leaves */}
      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>Project memory</span>
          <span className="font-semibold text-[var(--n9-accent)]">{cur.items} items</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <motion.div
            className="h-full rounded-full bg-[var(--n9-accent)]"
            animate={{ width: `${cur.fill}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
        </div>
      </div>

      <p className="mt-3 text-xs leading-5 text-muted-foreground">
        A rotated out — the work, rationale and results <span className="font-semibold text-foreground">stayed</span>.
      </p>
    </div>
  )
}

/** Startup ICP — people rotate in and out; the shared memory persists. Clean
 *  flex layout (no diagonal lines to misalign). */
export function StartupMock() {
  return (
    <MockFrame label="Lab memory">
      <div className="flex h-[72px] flex-col justify-center gap-2.5">
        <div className="flex items-center gap-2">
          <div className="flex -space-x-1.5">
            {[false, false, true].map((faded, i) => (
              <span
                key={i}
                className={cn(
                  "h-5 w-5 rounded-full border-2 border-card bg-muted",
                  faded && "opacity-40",
                )}
              />
            ))}
          </div>
          <span className="text-xs text-muted-foreground/70">people rotate</span>
          <ArrowRight className="ml-auto h-3.5 w-3.5 text-[var(--n9-accent)]/60" />
          <span className="inline-flex items-center gap-1 rounded-md border border-[var(--n9-accent)]/30 bg-[var(--n9-accent-light)] px-2 py-1 text-xs font-semibold text-[var(--n9-accent)]">
            <Database className="h-3 w-3" /> memory
          </span>
        </div>
        <Bar w="86%" />
        <Bar w="64%" />
      </div>
    </MockFrame>
  )
}
