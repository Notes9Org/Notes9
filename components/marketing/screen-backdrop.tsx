"use client"

/**
 * Ambient backdrop: product screens pinned as sticky notes, scattered at random
 * (no grid), connected by ONE continuous thread that grows note-by-note as the
 * page scrolls — top to bottom — so scrolling literally "connects" more notes,
 * with the Catalyst mascot watching over it all. Decorative only (aria-hidden,
 * pointer-events-none), large screens only. Light/dark screenshots swap via `dark:`.
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

// Hand-placed (deterministic so SSR/CSR match) scattered positions, ordered
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
  { x: 13, y: 63, rot: -4 },
  { x: 68, y: 69, rot: 4 },
  { x: 34, y: 78, rot: -3 },
  { x: 85, y: 84, rot: 3 },
  { x: 54, y: 92, rot: -4 },
]

const NOTES = POS.map((p, i) => ({ ...p, name: SHOTS[i % SHOTS.length] }))
const THREAD_D = NOTES.map((n, i) => `${i === 0 ? "M" : "L"} ${n.x} ${n.y}`).join(" ")

function StickyNote({ name, rot }: { name: string; rot: number }) {
  return (
    <div
      className="relative w-[160px] rounded-[5px] bg-[#fcf3e0] p-1.5 pb-5 shadow-[0_20px_40px_-14px_rgba(44,36,24,0.5)] ring-1 ring-black/5 dark:bg-[#2c2820] dark:ring-white/10"
      style={{ rotate: `${rot}deg` }}
    >
      {/* tape */}
      <span className="absolute -top-2.5 left-1/2 h-4 w-14 -translate-x-1/2 -rotate-6 rounded-[2px] bg-[var(--n9-accent)]/25" />
      <div className="overflow-hidden rounded-[2px] ring-1 ring-black/10 dark:ring-white/10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/demo/light/${name}.png`} alt="" loading="lazy" className="block w-full dark:hidden" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/demo/${name}.png`} alt="" loading="lazy" className="hidden w-full dark:block" />
      </div>
      {/* peeled corner */}
      <span className="absolute bottom-0 right-0 h-5 w-5 rounded-tl-[6px] bg-gradient-to-tl from-black/15 to-transparent" />
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
      {/* ONE continuous thread — grows note-by-note as the page scrolls (blurrier
          than the notes) */}
      <svg
        className="absolute inset-0 h-full w-full opacity-60 blur-[2.5px]"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <motion.path
          d={THREAD_D}
          fill="none"
          stroke="var(--n9-accent)"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          style={{ pathLength: scrollYProgress }}
        />
      </svg>

      {/* sticky notes — lightly blurred so they still read as notes */}
      <div className="absolute inset-0 opacity-[0.5] blur-[1px] dark:opacity-[0.38]">
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

      {/* Catalyst, watching over the thread */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-60 blur-[0.5px] dark:opacity-50"
      >
        <IceMascot className="w-24 drop-shadow-[0_14px_28px_rgba(150,80,52,0.3)]" />
      </div>
    </div>
  )
}
