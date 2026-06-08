"use client"

/**
 * Ambient backdrop: product screens shown as paper sticky notes, scattered at
 * random (no grid), connected by ONE continuous thread that grows in length as
 * the page scrolls (top → bottom) — a progress line that connects more notes the
 * further you scroll. Decorative only (aria-hidden, pointer-events-none), large
 * screens only. Light/dark screenshots swap via `dark:`.
 */

import { motion, useScroll } from "framer-motion"
import { cn } from "@/lib/utils"

// Screenshots that exist in BOTH /public/demo and /public/demo/light.
const SHOTS = [
  "dashboard",
  "literature-search",
  "projects",
  "experiment-details",
  "lab-memory",
  "project-report",
  "experiments-list",
  "new-lab-note",
  "literature-list",
]

// Hand-placed (deterministic, so SSR/CSR match) scattered positions, ordered
// top→bottom so the single thread flows downward as the user scrolls.
const POS: { x: number; y: number; rot: number }[] = [
  { x: 16, y: 6, rot: -5 },
  { x: 73, y: 8, rot: 4 },
  { x: 41, y: 15, rot: -3 },
  { x: 89, y: 22, rot: 5 },
  { x: 8, y: 28, rot: 3 },
  { x: 58, y: 33, rot: -4 },
  { x: 27, y: 42, rot: 4 },
  { x: 82, y: 47, rot: -3 },
  { x: 47, y: 55, rot: 3 },
  { x: 13, y: 60, rot: -4 },
  { x: 68, y: 66, rot: 4 },
  { x: 34, y: 73, rot: -3 },
  { x: 85, y: 79, rot: 3 },
  { x: 54, y: 85, rot: -4 },
]

const NOTES = POS.map((p, i) => ({ ...p, name: SHOTS[i % SHOTS.length] }))

// A dense web: connect each note to its eight nearest neighbours (deduped), so
// many notes link to each other at once. Edges are ordered by their lower
// endpoint so the web fills in top→bottom as the page scrolls.
const EDGES: [number, number][] = (() => {
  const out: [number, number][] = []
  const seen = new Set<string>()
  NOTES.forEach((n, i) => {
    NOTES.map((m, j) => ({ j, d: (m.x - n.x) ** 2 + (m.y - n.y) ** 2 }))
      .filter((o) => o.j !== i)
      .sort((a, b) => a.d - b.d)
      .slice(0, 8)
      .forEach(({ j }) => {
        const key = i < j ? `${i}-${j}` : `${j}-${i}`
        if (seen.has(key)) return
        seen.add(key)
        out.push([Math.min(i, j), Math.max(i, j)])
      })
  })
  return out.sort(
    (a, b) =>
      Math.max(NOTES[a[0]].y, NOTES[a[1]].y) - Math.max(NOTES[b[0]].y, NOTES[b[1]].y),
  )
})()

const WEB_D = EDGES.map(
  ([a, b]) => `M ${NOTES[a].x} ${NOTES[a].y} L ${NOTES[b].x} ${NOTES[b].y}`,
).join(" ")

function StickyNote({ name, rot }: { name: string; rot: number }) {
  return (
    <div
      className="n9-sticky relative w-[164px] rounded-[3px] p-2 pb-5 shadow-[0_20px_42px_-16px_rgba(44,36,24,0.5)] ring-1 ring-black/5 dark:ring-white/10"
      style={{ rotate: `${rot}deg` }}
    >
      <div className="overflow-hidden rounded-[2px] ring-1 ring-black/10 dark:ring-white/10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/demo/light/${name}.png`} alt="" loading="lazy" className="block w-full dark:hidden" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/demo/${name}.png`} alt="" loading="lazy" className="hidden w-full dark:block" />
      </div>
      {/* curled fold at the bottom-right corner */}
      <span
        className="absolute -bottom-px -right-px h-6 w-6 rounded-tl-[10px] bg-[linear-gradient(135deg,transparent_46%,rgba(0,0,0,0.12)_47%,rgba(255,255,255,0.5)_60%)] shadow-[-3px_-3px_8px_-4px_rgba(0,0,0,0.35)] dark:bg-[linear-gradient(135deg,transparent_46%,rgba(0,0,0,0.4)_47%,rgba(255,255,255,0.08)_60%)]"
      />
    </div>
  )
}

export function ScreenBackdrop({ className }: { className?: string }) {
  const { scrollYProgress } = useScroll()

  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none fixed inset-0 z-0 hidden overflow-hidden lg:block",
        className,
      )}
    >
      {/* A web of thin connections that fills in (more notes link to each other)
          as the page scrolls. */}
      <svg
        className="absolute inset-0 h-full w-full opacity-45 blur-[3px]"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <motion.path
          d={WEB_D}
          fill="none"
          stroke="var(--n9-accent)"
          strokeWidth={0.7}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          style={{ pathLength: scrollYProgress }}
        />
      </svg>

      {/* sticky notes — anchored at their TOP-MIDDLE (so the web meets the top of
          each note) and opaque enough to hide the web running behind them */}
      <div className="absolute inset-0 opacity-[0.82] blur-[1px] dark:opacity-[0.62]">
        {NOTES.map((n, i) => (
          <div
            key={`${n.name}-${i}`}
            className="absolute -translate-x-1/2"
            style={{ left: `${n.x}%`, top: `${n.y}%` }}
          >
            <StickyNote name={n.name} rot={n.rot} />
          </div>
        ))}
      </div>
    </div>
  )
}
