"use client"

import { motion } from "framer-motion"

/**
 * Subtle animated molecular/node structure for the hero background.
 * Renders as an SVG with nodes and connecting lines that fade in
 * with a staggered animation. Respects prefers-reduced-motion via
 * framer-motion's built-in support.
 */

interface Node {
  cx: number
  cy: number
  r: number
  delay: number
}

interface Link {
  x1: number
  y1: number
  x2: number
  y2: number
  delay: number
}

const nodes: Node[] = [
  { cx: 120, cy: 80, r: 4, delay: 0.3 },
  { cx: 220, cy: 140, r: 3, delay: 0.5 },
  { cx: 80, cy: 200, r: 3.5, delay: 0.7 },
  { cx: 300, cy: 60, r: 3, delay: 0.4 },
  { cx: 350, cy: 180, r: 4, delay: 0.6 },
  { cx: 180, cy: 260, r: 3, delay: 0.8 },
  { cx: 420, cy: 120, r: 3.5, delay: 0.5 },
  // Right side cluster
  { cx: 680, cy: 100, r: 4, delay: 0.4 },
  { cx: 760, cy: 180, r: 3, delay: 0.6 },
  { cx: 620, cy: 200, r: 3.5, delay: 0.7 },
  { cx: 840, cy: 80, r: 3, delay: 0.5 },
  { cx: 720, cy: 260, r: 4, delay: 0.8 },
  { cx: 900, cy: 160, r: 3, delay: 0.6 },
]

const links: Link[] = [
  { x1: 120, y1: 80, x2: 220, y2: 140, delay: 0.6 },
  { x1: 120, y1: 80, x2: 80, y2: 200, delay: 0.8 },
  { x1: 220, y1: 140, x2: 350, y2: 180, delay: 0.7 },
  { x1: 300, y1: 60, x2: 420, y2: 120, delay: 0.6 },
  { x1: 220, y1: 140, x2: 180, y2: 260, delay: 0.9 },
  { x1: 350, y1: 180, x2: 420, y2: 120, delay: 0.7 },
  { x1: 80, y1: 200, x2: 180, y2: 260, delay: 1.0 },
  // Right side
  { x1: 680, y1: 100, x2: 760, y2: 180, delay: 0.7 },
  { x1: 680, y1: 100, x2: 620, y2: 200, delay: 0.8 },
  { x1: 760, y1: 180, x2: 720, y2: 260, delay: 0.9 },
  { x1: 840, y1: 80, x2: 900, y2: 160, delay: 0.7 },
  { x1: 760, y1: 180, x2: 900, y2: 160, delay: 0.8 },
  { x1: 620, y1: 200, x2: 720, y2: 260, delay: 1.0 },
]

export function HeroMolecules() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <svg
        viewBox="0 0 1000 320"
        fill="none"
        className="absolute left-1/2 top-8 h-[320px] w-[1000px] -translate-x-1/2 opacity-[0.12] dark:opacity-[0.08]"
        preserveAspectRatio="xMidYMid slice"
      >
        {/* Connection lines */}
        {links.map((link, i) => (
          <motion.line
            key={`link-${i}`}
            x1={link.x1}
            y1={link.y1}
            x2={link.x2}
            y2={link.y2}
            stroke="var(--n9-accent)"
            strokeWidth="1"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 1.2, delay: link.delay, ease: "easeOut" }}
          />
        ))}
        {/* Nodes */}
        {nodes.map((node, i) => (
          <motion.circle
            key={`node-${i}`}
            cx={node.cx}
            cy={node.cy}
            r={node.r}
            fill="var(--n9-accent)"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4, delay: node.delay, ease: "easeOut" }}
          />
        ))}
      </svg>
    </div>
  )
}
