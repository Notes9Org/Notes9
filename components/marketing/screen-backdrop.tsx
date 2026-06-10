"use client"

/**
 * Ambient backdrop: nine product screens shown as paper sticky notes, scattered
 * at random and joined by a dense web of solid threads that GROW as the page
 * scrolls (top → bottom). Decorative only (aria-hidden, pointer-events-none),
 * large screens only. Light/dark screenshots swap via `dark:`.
 */

import { motion, useScroll, useTransform, type MotionValue } from "framer-motion"
import { cn } from "@/lib/utils"

// Nine notes at random-looking (but deterministic, so SSR/CSR match) positions.
const NOTES = [
  { name: "dashboard", x: 12, y: 11, rot: -6 },
  { name: "literature-search", x: 43, y: 8, rot: 4 },
  { name: "projects", x: 73, y: 14, rot: -3 },
  { name: "experiment-details", x: 90, y: 33, rot: 5 },
  { name: "lab-memory", x: 26, y: 38, rot: -4 },
  { name: "project-report", x: 58, y: 45, rot: 3 },
  { name: "experiments-list", x: 83, y: 60, rot: -5 },
  { name: "new-lab-note", x: 17, y: 67, rot: 4 },
  { name: "literature-list", x: 50, y: 82, rot: -3 },
]

// A dense web: connect each note to its three nearest neighbours (deduped).
// Each edge is oriented from its UPPER endpoint → its LOWER endpoint, and the
// whole set is ordered top→bottom, so the web visibly grows downward on scroll.
const EDGES: { fx: number; fy: number; tx: number; ty: number }[] = (() => {
  const k = 3
  const pairs: [number, number][] = []
  const seen = new Set<string>()
  NOTES.forEach((n, i) => {
    NOTES.map((m, j) => ({ j, d: (m.x - n.x) ** 2 + (m.y - n.y) ** 2 }))
      .filter((o) => o.j !== i)
      .sort((a, b) => a.d - b.d)
      .slice(0, k)
      .forEach(({ j }) => {
        const key = i < j ? `${i}-${j}` : `${j}-${i}`
        if (seen.has(key)) return
        seen.add(key)
        pairs.push([Math.min(i, j), Math.max(i, j)])
      })
  })
  return pairs
    .map(([a, b]) => {
      const [upper, lower] = NOTES[a].y <= NOTES[b].y ? [a, b] : [b, a]
      return { fx: NOTES[upper].x, fy: NOTES[upper].y, tx: NOTES[lower].x, ty: NOTES[lower].y }
    })
    .sort((e1, e2) => Math.max(e1.fy, e1.ty) - Math.max(e2.fy, e2.ty))
})()

/** One thread that draws itself (upper → lower endpoint) during its slice of
 *  the page-scroll progress. */
function GrowEdge({
  fx,
  fy,
  tx,
  ty,
  start,
  end,
  progress,
}: {
  fx: number
  fy: number
  tx: number
  ty: number
  start: number
  end: number
  progress: MotionValue<number>
}) {
  const pathLength = useTransform(progress, [start, end], [0, 1])
  return (
    <motion.line
      x1={fx}
      y1={fy}
      x2={tx}
      y2={ty}
      stroke="var(--n9-accent)"
      strokeWidth={0.7}
      strokeLinecap="round"
      vectorEffect="non-scaling-stroke"
      initial={false}
      style={{ pathLength }}
    />
  )
}

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
      {/* solid threads that grow downward as the page scrolls */}
      <svg
        className="absolute inset-0 h-full w-full opacity-50 blur-[2px]"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        {EDGES.map((e, i) => {
          const start = (i / EDGES.length) * 0.85
          return (
            <GrowEdge key={i} {...e} start={start} end={start + 0.18} progress={scrollYProgress} />
          )
        })}
      </svg>

      {/* sticky notes - anchored at their TOP-MIDDLE so the thread meets the top.
          Softly blurred so they sit behind the foreground content. */}
      <div className="absolute inset-0 opacity-[0.82] blur-[2px] dark:opacity-[0.62]">
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
