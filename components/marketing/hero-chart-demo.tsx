"use client"

import { useMemo, useState } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { cn } from "@/lib/utils"

/** House easing — matches `--n9-ease`. */
const EASE = [0.22, 1, 0.36, 1] as const

/**
 * A real ELISA standard curve — the same shape the product's built-in demo
 * dataset uses, so the hero is showing the actual job, not invented numbers.
 */
const DATA = [
  { x: 0, y: 0.05, label: "Blank" },
  { x: 15.6, y: 0.28, label: "Std 7" },
  { x: 31.25, y: 0.51, label: "Std 6" },
  { x: 62.5, y: 0.92, label: "Std 5" },
  { x: 125, y: 1.45, label: "Std 4" },
  { x: 250, y: 1.98, label: "Std 3" },
  { x: 500, y: 2.42, label: "Std 2" },
  { x: 1000, y: 2.85, label: "Std 1" },
]

type Mode = "line" | "scatter" | "bar"

const MODES: { id: Mode; label: string }[] = [
  { id: "line", label: "Line" },
  { id: "scatter", label: "Scatter" },
  { id: "bar", label: "Bar" },
]

/* Plot geometry in viewBox units. */
const W = 520
const H = 300
const PAD = { l: 44, r: 16, t: 16, b: 34 }

/**
 * Live chart card for the hero.
 *
 * Deliberately hand-rolled SVG rather than Plotly. Plotly is already a
 * dependency for the real /data-analysis workspace, but it is a very large
 * bundle and pulling it into the landing page would cost far more in load time
 * than a marketing chart is worth. Eight points and three chart types need an
 * axis, a path and some rects — and doing it directly means the curve can draw
 * itself on mount, which a charting library would not give us for free.
 *
 * The interaction is real: the chart-type chips actually re-render the plot,
 * the same way the product's chart picker does.
 */
export function HeroChartDemo() {
  const [mode, setMode] = useState<Mode>("line")
  const reduceMotion = useReducedMotion()

  const { pts, linePath, xTicks, yTicks } = useMemo(() => {
    const xMax = 1000
    const yMax = 3
    const sx = (x: number) => PAD.l + (x / xMax) * (W - PAD.l - PAD.r)
    const sy = (y: number) => H - PAD.b - (y / yMax) * (H - PAD.t - PAD.b)

    const pts = DATA.map((d) => ({ ...d, cx: sx(d.x), cy: sy(d.y) }))

    // Catmull-Rom → cubic Bézier, so the standard curve reads as a fitted curve
    // rather than a polyline.
    let linePath = `M ${pts[0].cx} ${pts[0].cy}`
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] ?? pts[i]
      const p1 = pts[i]
      const p2 = pts[i + 1]
      const p3 = pts[i + 2] ?? p2
      const c1x = p1.cx + (p2.cx - p0.cx) / 6
      const c1y = p1.cy + (p2.cy - p0.cy) / 6
      const c2x = p2.cx - (p3.cx - p1.cx) / 6
      const c2y = p2.cy - (p3.cy - p1.cy) / 6
      linePath += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.cx} ${p2.cy}`
    }

    return {
      pts,
      linePath,
      xTicks: [0, 250, 500, 750, 1000].map((v) => ({ v, x: sx(v) })),
      yTicks: [0, 1, 2, 3].map((v) => ({ v, y: sy(v) })),
    }
  }, [])

  const barW = 16

  return (
    <div className="n9-elev-2 relative overflow-hidden rounded-2xl border border-border/60 bg-card/85 backdrop-blur-xl">
      {/* Window chrome, matching the frames used elsewhere on the site. */}
      <div className="flex items-center gap-2 border-b border-border/50 bg-muted/35 px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-[#ff5f57]" />
        <span className="size-2.5 rounded-full bg-[#febc2e]" />
        <span className="size-2.5 rounded-full bg-[#28c840]" />
        <span className="ml-2 truncate font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          ELISA standard curve
        </span>
      </div>

      <div className="p-4 sm:p-5">
        {/* Chart-type chips — the product's picker, in miniature. */}
        <div className="mb-3 flex items-center gap-1.5">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              aria-pressed={mode === m.id}
              className={cn(
                "rounded-full px-3 py-1 text-[11px] font-semibold transition-colors",
                mode === m.id
                  ? "bg-[var(--n9-accent)] text-white"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {m.label}
            </button>
          ))}
          <span className="ml-auto font-mono text-[10px] text-muted-foreground/70">
            n = {DATA.length}
          </span>
        </div>

        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          role="img"
          aria-label="A fitted ELISA standard curve: optical density at 450 nm against concentration in picograms per millilitre."
        >
          {/* Gridlines */}
          {yTicks.map((t) => (
            <line
              key={`gy-${t.v}`}
              x1={PAD.l}
              x2={W - PAD.r}
              y1={t.y}
              y2={t.y}
              className="stroke-border"
              strokeWidth={1}
              strokeDasharray={t.v === 0 ? undefined : "3 4"}
            />
          ))}

          {/* Axis labels */}
          {yTicks.map((t) => (
            <text
              key={`ty-${t.v}`}
              x={PAD.l - 8}
              y={t.y + 3}
              textAnchor="end"
              className="fill-muted-foreground font-mono text-[9px]"
            >
              {t.v}
            </text>
          ))}
          {xTicks.map((t) => (
            <text
              key={`tx-${t.v}`}
              x={t.x}
              y={H - PAD.b + 15}
              textAnchor="middle"
              className="fill-muted-foreground font-mono text-[9px]"
            >
              {t.v}
            </text>
          ))}
          <text
            x={(W + PAD.l) / 2}
            y={H - 4}
            textAnchor="middle"
            className="fill-muted-foreground font-mono text-[9px]"
          >
            Concentration (pg/mL)
          </text>

          {mode === "bar" &&
            pts.map((p, i) => (
              <motion.rect
                key={`bar-${p.x}`}
                x={p.cx - barW / 2}
                width={barW}
                rx={3}
                initial={reduceMotion ? false : { height: 0, y: H - PAD.b }}
                animate={{ height: H - PAD.b - p.cy, y: p.cy }}
                transition={{ duration: 0.5, ease: EASE, delay: reduceMotion ? 0 : i * 0.04 }}
                fill="var(--n9-accent)"
                opacity={0.85}
              />
            ))}

          {mode === "line" && (
            <motion.path
              d={linePath}
              fill="none"
              stroke="var(--n9-accent)"
              strokeWidth={2.5}
              strokeLinecap="round"
              initial={reduceMotion ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.1, ease: EASE }}
            />
          )}

          {mode !== "bar" &&
            pts.map((p, i) => (
              <motion.circle
                key={`pt-${p.x}`}
                cx={p.cx}
                cy={p.cy}
                r={4}
                fill="var(--card)"
                stroke="var(--n9-accent)"
                strokeWidth={2}
                initial={reduceMotion ? false : { scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{
                  type: "spring",
                  stiffness: 320,
                  damping: 30,
                  mass: 0.8,
                  delay: reduceMotion ? 0 : 0.35 + i * 0.05,
                }}
                style={{ transformOrigin: `${p.cx}px ${p.cy}px` }}
              />
            ))}
        </svg>

        {/* Fit readout — the numbers the product actually reports. */}
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-border/50 pt-3">
          {[
            ["Model", "4PL"],
            ["R²", "0.9993"],
            ["EC₅₀", "138 pg/mL"],
          ].map(([k, v]) => (
            <span key={k} className="font-mono text-[10px] text-muted-foreground">
              {k} <span className="font-semibold text-foreground">{v}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
