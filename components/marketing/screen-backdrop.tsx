"use client"

/**
 * Ambient backdrop: ~15 small, uniformly-sized, lightly-blurred product screens
 * pinned as sticky notes in a tidy horizontal grid. As the user scrolls, a
 * single (blurrier) thread draws itself through every note in a serpentine
 * weave, with the Catalyst mascot watching over the connections in the centre.
 * Decorative only (aria-hidden, pointer-events-none), large screens only.
 * Light/dark screenshots swap via `dark:`.
 */

import { motion, useScroll } from "framer-motion"
import { IceMascot } from "@/components/ui/ice-mascot"
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

const COLS = [11, 30.5, 50, 69.5, 89]
const ROWS = [20, 50, 80]

// 15 notes in a 3×5 grid; serpentine row order so the thread weaves cleanly.
const NOTES = ROWS.flatMap((y, r) => {
  const cols = r % 2 === 0 ? COLS : [...COLS].reverse()
  return cols.map((x) => ({ x, y }))
}).map((p, i) => ({ ...p, name: SHOTS[i % SHOTS.length], rot: i % 2 ? 2.5 : -2.5 }))

const HUB = { x: 50, y: 50 }
const THREAD_D = NOTES.map((n, i) => `${i === 0 ? "M" : "L"} ${n.x} ${n.y}`).join(" ")

function StickyNote({ name, rot }: { name: string; rot: number }) {
  return (
    <div
      className="relative w-[92px] rounded-md bg-card p-1 shadow-[0_14px_32px_-16px_rgba(44,36,24,0.6)] ring-1 ring-border/50"
      style={{ rotate: `${rot}deg` }}
    >
      <span className="absolute -top-1.5 left-1/2 h-2.5 w-9 -translate-x-1/2 -rotate-6 rounded-[2px] bg-[var(--n9-accent)]/30" />
      <div className="overflow-hidden rounded-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/demo/light/${name}.png`} alt="" loading="lazy" className="block w-full dark:hidden" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/demo/${name}.png`} alt="" loading="lazy" className="hidden w-full dark:block" />
      </div>
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
      {/* connecting thread — blurrier than the notes, draws as the page scrolls */}
      <svg
        className="absolute inset-0 h-full w-full opacity-60 blur-[3.5px]"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <motion.path
          d={THREAD_D}
          fill="none"
          stroke="var(--n9-accent)"
          strokeWidth={2}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          style={{ pathLength: scrollYProgress }}
        />
      </svg>

      {/* sticky notes — lightly blurred */}
      <div className="absolute inset-0 opacity-[0.42] blur-[1.5px] dark:opacity-[0.32]">
        {NOTES.map((n, i) => (
          <div
            key={`${n.name}-${i}`}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${n.x}%`, top: `${n.y}%` }}
          >
            <StickyNote name={n.name} rot={n.rot} />
          </div>
        ))}
      </div>

      {/* Catalyst, watching over the connections */}
      <div
        className="absolute -translate-x-1/2 -translate-y-1/2 opacity-60 blur-[0.5px] dark:opacity-50"
        style={{ left: `${HUB.x}%`, top: `${HUB.y}%` }}
      >
        <IceMascot className="w-24 drop-shadow-[0_14px_28px_rgba(150,80,52,0.3)]" />
      </div>
    </div>
  )
}
