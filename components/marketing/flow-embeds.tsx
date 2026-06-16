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
import { BarChart3, BookOpen, ClipboardList, FileText, FlaskConical, FolderKanban, NotebookPen, TestTube } from "lucide-react"
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

// ---------------------------------------------------------------------------
// LinkedRecordsMap - the connected memory shown as a linked database: entity
// tables (papers, protocols, experiments, results, reports) wired together by
// right-angle relationship links.
// ---------------------------------------------------------------------------

type TableNode = {
  name: string
  icon: typeof BookOpen
  color: string
  x: number
  y: number
  hub?: boolean
  fields: string[]
}

const TABLES: TableNode[] = [
  { name: "projects", icon: FolderKanban, color: "var(--n9-accent)", x: 12, y: 50, hub: true, fields: ["name", "team"] }, // 0
  { name: "literature", icon: BookOpen, color: "#16a34a", x: 37, y: 17, fields: ["title", "authors"] }, //               1
  { name: "protocols", icon: ClipboardList, color: "#ca8a04", x: 37, y: 50, fields: ["steps", "reagents"] }, //         2
  { name: "samples", icon: TestTube, color: "#7c3aed", x: 37, y: 83, fields: ["type", "barcode"] }, //                  3
  { name: "experiments", icon: FlaskConical, color: "#2563eb", x: 62, y: 33, fields: ["hypothesis", "conditions"] }, // 4
  { name: "lab_notes", icon: NotebookPen, color: "#dc2626", x: 62, y: 67, fields: ["entry", "date"] }, //               5
  { name: "results", icon: BarChart3, color: "#ea580c", x: 87, y: 28, fields: ["figures", "values"] }, //              6
  { name: "reports", icon: FileText, color: "#0891b2", x: 87, y: 72, fields: ["methods", "sources"] }, //              7
]
const REL: { a: number; b: number; spine?: boolean }[] = [
  { a: 0, b: 1 },
  { a: 0, b: 2, spine: true },
  { a: 0, b: 3 },
  { a: 1, b: 4 },
  { a: 2, b: 4 },
  { a: 3, b: 4 },
  { a: 4, b: 5 },
  { a: 4, b: 6, spine: true },
  { a: 6, b: 7 },
]
const REL_PULSE: [number, number][] = [
  [0, 1],
  [0, 2],
  [0, 3],
  [2, 4],
  [4, 6],
  [6, 7],
]

/** Right-angle waypoints between two table centres (horizontal → vertical →
 *  horizontal). Segments inside the opaque cards are hidden, so only the clean
 *  orthogonal connector between them shows. */
const orthoMidX = (a: TableNode, b: TableNode) => (a.x + b.x) / 2
const orthoPts = (a: TableNode, b: TableNode) => {
  const mx = orthoMidX(a, b)
  return `${a.x},${a.y} ${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}`
}

function TableCard({ t }: { t: TableNode }) {
  const Icon = t.icon
  return (
    <div
      className={cn(
        "absolute z-10 flex w-[23%] -translate-x-1/2 -translate-y-1/2 items-center gap-2.5 rounded-xl border bg-card px-3.5 py-3 shadow-[0_16px_38px_-16px_rgba(20,18,16,0.5)]",
        t.hub ? "border-[var(--n9-accent)]/50 ring-1 ring-[var(--n9-accent)]/30" : "border-border",
      )}
      style={{ left: `${t.x}%`, top: `${t.y}%` }}
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
        style={{ background: `color-mix(in oklab, ${t.color} 16%, var(--card))` }}
      >
        <Icon className="h-5 w-5" style={{ color: t.color }} />
      </span>
      <span className="truncate text-[14px] font-bold uppercase tracking-[0.08em] text-foreground">{t.name.replace("_", " ")}</span>
    </div>
  )
}

/** Connected memory as a linked database (entity tables joined by relationships). */
export function LinkedRecordsMap({ className }: { className?: string }) {
  const reduce = useReducedMotion()
  return (
    <>
      {/* Mobile: a simple stacked grid of the linked entities (the ER diagram
          would be far too cramped on a narrow screen). */}
      <div className={cn("grid grid-cols-2 gap-2.5 sm:hidden", className)}>
        {TABLES.map((t) => {
          const Icon = t.icon
          return (
            <div
              key={t.name}
              className={cn(
                "flex items-center gap-2.5 rounded-xl border bg-card px-3 py-3 shadow-sm",
                t.hub ? "border-[var(--n9-accent)]/50 ring-1 ring-[var(--n9-accent)]/30" : "border-border",
              )}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: `color-mix(in oklab, ${t.color} 16%, var(--card))` }}>
                <Icon className="h-4 w-4" style={{ color: t.color }} />
              </span>
              <span className="truncate text-[12px] font-bold uppercase tracking-[0.06em] text-foreground">{t.name.replace("_", " ")}</span>
            </div>
          )
        })}
      </div>

      {/* Desktop: the full linked-database ER diagram. */}
      <div
        className={cn(
          "relative hidden h-[420px] w-full overflow-hidden rounded-2xl border border-border/60 bg-background/45 backdrop-blur-[7px] dark:bg-background/35 sm:block",
          dottedBg,
          className,
        )}
      >
      {/* right-angle relationship links - same 0–100 space as table centres */}
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        {REL.map(({ a, b, spine }) => (
          <polyline
            key={`${a}-${b}`}
            points={orthoPts(TABLES[a], TABLES[b])}
            fill="none"
            stroke="var(--n9-accent)"
            strokeWidth={spine ? 1.7 : 1.3}
            strokeOpacity={spine ? 0.55 : 0.34}
            strokeDasharray="3 3"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>

      {/* records flowing across the relationships, following the right-angle route */}
      {!reduce
        ? REL_PULSE.map(([a, b], k) => {
            const A = TABLES[a]
            const B = TABLES[b]
            const mx = orthoMidX(A, B)
            return (
              <motion.span
                key={`rp-${a}-${b}`}
                aria-hidden
                className="pointer-events-none absolute z-[5] h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--n9-accent)] shadow-[0_0_8px_var(--n9-accent-glow)]"
                initial={{ left: `${A.x}%`, top: `${A.y}%`, opacity: 0 }}
                animate={{
                  left: [`${A.x}%`, `${mx}%`, `${mx}%`, `${B.x}%`],
                  top: [`${A.y}%`, `${A.y}%`, `${B.y}%`, `${B.y}%`],
                  opacity: [0, 1, 1, 0],
                }}
                transition={{ duration: 2.2, repeat: Infinity, delay: k * 0.4, ease: "easeInOut" }}
              />
            )
          })
        : null}

      {/* entity tables, above the links */}
      {TABLES.map((t) => (
        <TableCard key={t.name} t={t} />
      ))}
      </div>
    </>
  )
}
