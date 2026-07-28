"use client"

import Link from "next/link"
import { motion, useReducedMotion } from "framer-motion"
import {
  ArrowRight,
  Books,
  ClipboardText,
  Flask as FlaskConical,
  NotePencil,
  Sparkle as Sparkles,
  ChartLine,
} from "@phosphor-icons/react/ssr"
import type { Icon as PhosphorIcon } from "@phosphor-icons/react"
import { HeroSearch } from "@/components/marketing/hero-search"
import { cn } from "@/lib/utils"

/** House easing — matches `--n9-ease`. */
const EASE = [0.22, 1, 0.36, 1] as const

/**
 * Real records from the demo workspace, in the order a project actually moves
 * through them. Nothing here is invented: the citation, the protocol version,
 * the ratio and the fit statistic all exist in the seeded starter content, so
 * the hero is a picture of the product rather than an illustration of one.
 */
type Node = {
  id: string
  kind: string
  icon: PhosphorIcon
  title: string
  meta: string
  /** Anchor in percent of the stage, used for both the card and the edges. */
  x: number
  y: number
  /** Per-card drift offset so the constellation never breathes in unison. */
  delay: number
}

const NODES: Node[] = [
  {
    id: "lit",
    kind: "Literature",
    icon: Books,
    title: "High-density transfection of HEK293 cells",
    meta: "Backliwal et al. · Biotechnol Bioeng, 2008",
    x: 9,
    y: 15,
    delay: 0,
  },
  {
    id: "protocol",
    kind: "Protocol",
    icon: ClipboardText,
    title: "Transient transfection (HEK293T, PEI)",
    meta: "v1.2 · Cell culture",
    x: 91,
    y: 15,
    delay: 0.8,
  },
  {
    id: "experiment",
    kind: "Experiment",
    icon: FlaskConical,
    title: "Transfection screen — PEI:DNA ratios",
    meta: "8 conditions · data ready",
    x: 7,
    y: 51,
    delay: 1.6,
  },
  {
    id: "data",
    kind: "Data",
    icon: ChartLine,
    title: "ELISA standard curve",
    meta: "4PL · R² 0.9993",
    x: 93,
    y: 49,
    delay: 2.4,
  },
  {
    id: "note",
    kind: "Lab note",
    icon: NotePencil,
    title: "Condition B (3:1) gave the highest yield",
    meta: "12 Mar · conclusion",
    x: 13,
    y: 85,
    delay: 3.2,
  },
]

/** Edges are drawn to the centre — the assistant sits where the links meet. */
const CENTRE = { x: 50, y: 52 }

/**
 * Constellation hero.
 *
 * Conventional SaaS heroes put a screenshot under the headline. Four passes at
 * that shape did not land here, and on reflection the shape itself was the
 * problem: a screenshot shows one screen, while the thing Notes9 sells is the
 * relationship *between* screens. That is not photographable.
 *
 * So the visual is the argument instead. Real records from a project orbit the
 * headline, hairlines run from each of them to the centre, and a pulse travels
 * those lines inward — literature and protocol and data converging on the
 * answer. Aurora and Runway both float artefacts around a centred title this
 * way; the difference is that here the artefacts carry the product's own data.
 *
 * Deliberately restrained on colour: cards sit on the warm neutral surfaces
 * with a single accent tick, rather than the per-entity blues and purples the
 * app uses internally. A rainbow of chips would read as generic AI-startup and
 * fight the editorial register the rest of the page keeps.
 */
export function HeroConstellation() {
  const reduceMotion = useReducedMotion()

  return (
    <section className="relative isolate overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="n9-grid-fine" />
        <div className="n9-organic n9-organic-mask" />
        <div className="n9-grain-overlay" />
        <div className="n9-vignette" />
      </div>

      <div className="container mx-auto px-4 pb-20 pt-14 sm:px-6 sm:pb-24 sm:pt-20 lg:px-8">
        {/* The stage is only a positioning context on lg+; below that the cards
            are hidden and this collapses to an ordinary centred column. */}
        <div className="relative mx-auto min-h-[36rem] max-w-6xl lg:min-h-[44rem] lg:max-w-[88rem]">
          <ConstellationEdges reduceMotion={reduceMotion} />

          {NODES.map((node) => (
            <NodeCard key={node.id} node={node} reduceMotion={reduceMotion} />
          ))}

          {/* Centre column. Sits above the constellation and carries its own
              backdrop so the headline never has to compete with a card. */}
          <div className="relative z-20 mx-auto flex max-w-2xl flex-col items-center px-2 py-10 text-center lg:py-24">
            <p
              className="n9-label n9-rise"
              style={{ ["--n9-rise-delay" as string]: "60ms" }}
            >
              The connected research workspace
            </p>

            <h1 className="mt-6 font-serif tracking-[-0.03em] text-[clamp(2.3rem,5.6vw,4.4rem)] leading-[1.02]">
              <span
                className="n9-rise block text-foreground"
                style={{ ["--n9-rise-delay" as string]: "140ms" }}
              >
                AI that answers from
              </span>
              <span
                className="n9-rise block text-muted-foreground"
                style={{ ["--n9-rise-delay" as string]: "240ms" }}
              >
                your lab&apos;s actual work.
              </span>
            </h1>

            <p
              className="n9-rise mt-5 max-w-lg text-[16px] leading-7 text-foreground/75"
              style={{ ["--n9-rise-delay" as string]: "320ms" }}
            >
              Every paper, protocol, result and note stays linked. Ask Catalyst
              anything and it answers from that record — and cites it.
            </p>

            <div
              className="n9-rise mt-8 w-full max-w-lg"
              style={{ ["--n9-rise-delay" as string]: "380ms" }}
            >
              <HeroSearch />
            </div>

            <div
              className="n9-rise mt-6 flex flex-wrap items-center justify-center gap-3"
              style={{ ["--n9-rise-delay" as string]: "440ms" }}
            >
              <Link
                href="/auth/sign-up"
                className="n9-press inline-flex h-12 items-center gap-2 rounded-full bg-[var(--n9-accent)] px-7 text-[15px] font-semibold text-white shadow-[0_14px_44px_-12px_var(--n9-accent-glow)] transition-colors hover:bg-[var(--n9-accent-hover)]"
              >
                Start free
                <ArrowRight className="size-4" aria-hidden />
              </Link>
              <Link
                href="/how-it-works"
                className="inline-flex h-12 items-center gap-2 rounded-full border border-border bg-background/60 px-6 text-[15px] font-semibold text-foreground backdrop-blur transition-colors hover:bg-muted"
              >
                See how it works
              </Link>
            </div>
          </div>
        </div>

        {/* Small screens get the same idea as a legible row of entity chips —
            the constellation would be unreadable at this width. */}
        <ul className="mt-2 flex flex-wrap items-center justify-center gap-2 lg:hidden">
          {NODES.map((n) => (
            <li
              key={n.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card/70 px-3 py-1.5 backdrop-blur"
            >
              <n.icon className="size-3.5 text-[var(--n9-accent)]" aria-hidden />
              <span className="text-[12px] font-medium text-foreground">{n.kind}</span>
            </li>
          ))}
          <li className="inline-flex items-center gap-1.5 rounded-full bg-[var(--n9-accent)] px-3 py-1.5">
            <Sparkles className="size-3.5 text-white" aria-hidden />
            <span className="text-[12px] font-semibold text-white">Catalyst</span>
          </li>
        </ul>
      </div>
    </section>
  )
}

/**
 * Hairlines from each record to the centre, with a pulse travelling inward.
 * `preserveAspectRatio="none"` lets the percentage viewBox stretch with the
 * stage, so the line ends stay glued to the cards at any width.
 */
function ConstellationEdges({ reduceMotion }: { reduceMotion: boolean | null }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 hidden h-full w-full lg:block"
    >
      {NODES.map((n, i) => {
        // Curve each edge through a control point pulled toward the centre, so
        // the lines read as organic links rather than as a radial starburst.
        const cx = (n.x + CENTRE.x) / 2 + (CENTRE.x - n.x) * 0.12
        const cy = (n.y + CENTRE.y) / 2 + (CENTRE.y - n.y) * 0.12
        const d = `M ${n.x} ${n.y} Q ${cx} ${cy} ${CENTRE.x} ${CENTRE.y}`
        return (
          <g key={n.id}>
            <path
              d={d}
              fill="none"
              stroke="var(--n9-accent)"
              strokeOpacity={0.28}
              strokeWidth={0.22}
              vectorEffect="non-scaling-stroke"
            />
            {!reduceMotion && (
              <motion.path
                d={d}
                fill="none"
                stroke="var(--n9-accent)"
                strokeOpacity={0.75}
                strokeWidth={0.4}
                vectorEffect="non-scaling-stroke"
                strokeLinecap="round"
                initial={{ pathLength: 0.06, pathOffset: 0 }}
                animate={{ pathOffset: [0, 0.94] }}
                transition={{
                  duration: 3.6,
                  ease: "linear",
                  repeat: Infinity,
                  delay: i * 0.7,
                }}
              />
            )}
          </g>
        )
      })}
    </svg>
  )
}

/** One record, floating. */
function NodeCard({ node, reduceMotion }: { node: Node; reduceMotion: boolean | null }) {
  const Icon = node.icon
  return (
    <motion.div
      className="absolute z-10 hidden w-[15.5rem] lg:block xl:w-[17rem]"
      style={{ left: `${node.x}%`, top: `${node.y}%`, translateX: "-50%", translateY: "-50%" }}
      initial={reduceMotion ? false : { opacity: 0, scale: 0.94, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.7, ease: EASE, delay: reduceMotion ? 0 : 0.5 + node.delay * 0.12 }}
    >
      <motion.div
        animate={reduceMotion ? undefined : { y: [0, -7, 0] }}
        transition={{ duration: 9, ease: "easeInOut", repeat: Infinity, delay: node.delay }}
        className={cn(
          "rounded-xl border border-border/70 bg-card/80 p-3.5 backdrop-blur-md",
          "shadow-[0_18px_50px_-24px_rgba(44,36,24,0.4)]"
        )}
      >
        <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          <Icon className="size-3.5 text-[var(--n9-accent)]" aria-hidden />
          {node.kind}
        </p>
        <p className="mt-2 line-clamp-2 text-[13px] font-semibold leading-snug text-foreground">
          {node.title}
        </p>
        <p className="mt-1 truncate text-[11px] text-muted-foreground">{node.meta}</p>
      </motion.div>
    </motion.div>
  )
}
