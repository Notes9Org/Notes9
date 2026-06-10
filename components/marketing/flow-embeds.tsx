"use client"

/**
 * Marketing "research-map" diagram - mirrors the in-app Research Map: a
 * left→right hierarchy of colored, ribboned entity cards.
 *
 *                  Literature ┐          ┌ Data
 *   Project ───────────────── Experiment ──────────── Report
 *                  Protocol  ┘          └ Lab note
 *
 * Nodes and edges share ONE 0–100 coordinate space: each card is positioned by
 * its CENTRE (left/top %) and every edge is drawn centre-to-centre in a matching
 * SVG viewBox (preserveAspectRatio="none"). Cards are opaque and sit above the
 * edges, so only the segment between two cards shows - exactly like the product
 * map - and the wiring can never fall out of alignment at any size or zoom.
 */

import { motion, useReducedMotion } from "framer-motion"
import { cn } from "@/lib/utils"

const dottedBg =
  "[background-image:radial-gradient(circle,rgba(0,0,0,0.05)_1px,transparent_1px)] [background-size:18px_18px] dark:[background-image:radial-gradient(circle,rgba(255,255,255,0.05)_1px,transparent_1px)]"

// Layered left→right columns. Centre coords in a 0–100 space (also left/top %).
// Colors match the in-app research-map kind palette.
type MapNode = { label: string; kind: string; color: string; x: number; y: number; hub?: boolean }
const NODES: MapNode[] = [
  { label: "Project", kind: "Project", color: "var(--n9-accent)", x: 10, y: 50, hub: true }, // 0
  { label: "Literature", kind: "Literature", color: "#16a34a", x: 31, y: 24 }, //               1
  { label: "Protocol", kind: "Protocol", color: "#ca8a04", x: 31, y: 76 }, //                    2
  { label: "Experiment", kind: "Experiment", color: "#2563eb", x: 51, y: 50 }, //               3
  { label: "Data", kind: "Data", color: "#ea580c", x: 71, y: 24 }, //                            4
  { label: "Lab note", kind: "Lab note", color: "#dc2626", x: 71, y: 76 }, //                    5
  { label: "Report", kind: "Report", color: "#0891b2", x: 90, y: 50 }, //                        6
]
// Forward edges, left → right. `spine` ones are drawn a touch stronger.
const EDGES: { a: number; b: number; spine?: boolean }[] = [
  { a: 0, b: 1 },
  { a: 0, b: 2 },
  { a: 0, b: 3, spine: true },
  { a: 1, b: 3 },
  { a: 2, b: 3 },
  { a: 3, b: 4 },
  { a: 3, b: 5 },
  { a: 4, b: 6 },
  { a: 5, b: 6 },
]
// Edges that carry an animated pulse, in flow direction.
const PULSE: [number, number][] = [
  [0, 3],
  [3, 4],
  [3, 5],
  [4, 6],
  [5, 6],
]

function NodeCard({ node }: { node: MapNode }) {
  return (
    <div
      className={cn(
        "absolute z-10 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-md border border-border shadow-sm",
        node.hub ? "bg-[var(--n9-accent-light)] ring-1 ring-[var(--n9-accent)]/40" : "bg-card",
      )}
      style={{ left: `${node.x}%`, top: `${node.y}%`, width: "19%", borderLeft: `5px solid ${node.color}` }}
    >
      <div className="px-2 py-1.5">
        <div className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: node.color }} aria-hidden />
          <span className="truncate text-[8px] font-semibold uppercase tracking-[0.08em] text-muted-foreground sm:text-[9px]">
            {node.kind}
          </span>
        </div>
        <p className="mt-0.5 line-clamp-2 text-[11px] font-semibold leading-snug text-foreground [overflow-wrap:anywhere] sm:text-[12px]">
          {node.label}
        </p>
      </div>
    </div>
  )
}

/** Research-map view: Project → Experiment → outputs → Report. */
export function MemoryHubFlow({ className }: { className?: string }) {
  const reduce = useReducedMotion()
  return (
    <div
      className={cn(
        // Frosted glass: blurs the sticky-note backdrop behind it (like the
        // hero) while staying transparent enough to keep it visible.
        "relative h-[340px] w-full overflow-hidden rounded-2xl border border-border/60 bg-background/45 backdrop-blur-[7px] dark:bg-background/35 sm:h-[420px]",
        dottedBg,
        className,
      )}
    >
      {/* edges - same 0–100 space as the card centres */}
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden
      >
        {EDGES.map(({ a, b, spine }) => (
          <line
            key={`${a}-${b}`}
            x1={NODES[a].x}
            y1={NODES[a].y}
            x2={NODES[b].x}
            y2={NODES[b].y}
            stroke="var(--n9-accent)"
            strokeWidth={spine ? 1.8 : 1.3}
            strokeOpacity={spine ? 0.5 : 0.3}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>

      {/* pulses flowing forward through the map */}
      {!reduce
        ? PULSE.map(([a, b], k) => (
            <motion.span
              key={`pulse-${a}-${b}`}
              aria-hidden
              className="pointer-events-none absolute z-[5] h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--n9-accent)] shadow-[0_0_8px_var(--n9-accent-glow)]"
              initial={{ left: `${NODES[a].x}%`, top: `${NODES[a].y}%`, opacity: 0 }}
              animate={{
                left: [`${NODES[a].x}%`, `${NODES[b].x}%`],
                top: [`${NODES[a].y}%`, `${NODES[b].y}%`],
                opacity: [0, 1, 0],
              }}
              transition={{ duration: 1.8, repeat: Infinity, delay: k * 0.4, ease: "easeInOut" }}
            />
          ))
        : null}

      {/* entity cards, above the edges */}
      {NODES.map((n) => (
        <NodeCard key={n.label} node={n} />
      ))}
    </div>
  )
}
