"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { IceMascot } from "@/components/ui/ice-mascot"

const PCOLS = ["#1a7a5e", "#2e5fa3", "#7a4fb8", "#b87333", "#5a3d99", "#c04a3a", "#c8882a"]

type PxMode = "orbit" | "shoot" | "quad" | "drift"

class Px {
  x: number
  y: number
  col: string
  mode: PxMode
  sz: number
  life = 0
  maxLife: number
  vx: number
  vy: number
  angle: number
  orbit: number
  spin: number
  sx: number
  sy: number
  tx = 0
  ty = 0
  a = 0

  constructor(x: number, y: number, col: string, mode: PxMode) {
    this.x = x
    this.y = y
    this.col = col
    this.mode = mode
    this.sz = mode === "quad" ? 3.2 : 2.5
    this.maxLife = mode === "shoot" ? 50 + Math.floor(Math.random() * 30) : 175 + Math.random() * 130
    this.vx = (Math.random() - 0.5) * 0.85
    this.vy = (Math.random() - 0.5) * 0.85
    this.angle = Math.random() * Math.PI * 2
    this.orbit = 38 + Math.random() * 42
    this.spin = (Math.random() - 0.5) * 0.021
    this.sx = x
    this.sy = y
  }

  tick(cx: number, cy: number) {
    this.life++
    const t = this.life / this.maxLife
    let alpha = (t < 0.15 ? t / 0.15 : t > 0.8 ? (1 - t) / 0.2 : 1) * 0.68
    alpha = Math.max(0, Math.min(1, alpha))
    this.a = alpha
    if (this.mode === "orbit") {
      this.angle += this.spin
      this.x = cx + Math.cos(this.angle) * this.orbit
      this.y = cy + Math.sin(this.angle) * this.orbit * 0.5
    } else if (this.mode === "shoot") {
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
      this.x = this.sx + (this.tx - this.sx) * e
      this.y = this.sy + (this.ty - this.sy) * e
    } else {
      this.x += this.vx
      this.y += this.vy
    }
    return this.life < this.maxLife
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.globalAlpha = this.a
    ctx.fillStyle = this.col
    if (this.mode === "quad") {
      const s = this.sz
      ctx.fillRect(this.x - s, this.y - s, s * 0.9, s * 0.9)
      ctx.fillRect(this.x + s * 0.1, this.y - s, s * 0.9, s * 0.9)
      ctx.fillRect(this.x - s, this.y + s * 0.1, s * 0.9, s * 0.9)
      ctx.fillRect(this.x + s * 0.1, this.y + s * 0.1, s * 0.9, s * 0.9)
    } else {
      ctx.fillRect(this.x - this.sz / 2, this.y - this.sz / 2, this.sz, this.sz)
    }
  }
}

const TOTAL_MS = 10000
/** Cap ambient grains so the loop can run forever without stacking unbounded work */
const AMBIENT_PARTICLE_CAP = 140
const CHIP_T = [0.5, 0.54, 0.58, 0.63, 0.68, 0.73] as const
/** Matches chip row tints: Lab notes, Experiments, Data analysis, Literature, Writing, Protocols */
const CHIP_COLS = ["#059669", "#0284c7", "#b87333", "#7c3aed", "#d97706", "#e11d48"] as const

/** Ray from rect center toward (tx, ty); return first intersection with the rectangle border (panel coords). */
function rectExitTowardCat(left: number, top: number, w: number, h: number, tx: number, ty: number) {
  const cx = left + w / 2
  const cy = top + h / 2
  let vx = tx - cx
  let vy = ty - cy
  const len = Math.hypot(vx, vy)
  if (len < 1e-6) return { x: cx, y: cy }
  vx /= len
  vy /= len
  const R = left + w
  const B = top + h
  let tMin = Infinity
  if (vx > 1e-9) {
    const t = (R - cx) / vx
    const y = cy + t * vy
    if (t > 0 && y >= top - 1e-4 && y <= B + 1e-4) tMin = Math.min(tMin, t)
  }
  if (vx < -1e-9) {
    const t = (left - cx) / vx
    const y = cy + t * vy
    if (t > 0 && y >= top - 1e-4 && y <= B + 1e-4) tMin = Math.min(tMin, t)
  }
  if (vy > 1e-9) {
    const t = (B - cy) / vy
    const x = cx + t * vx
    if (t > 0 && x >= left - 1e-4 && x <= R + 1e-4) tMin = Math.min(tMin, t)
  }
  if (vy < -1e-9) {
    const t = (top - cy) / vy
    const x = cx + t * vx
    if (t > 0 && x >= left - 1e-4 && x <= R + 1e-4) tMin = Math.min(tMin, t)
  }
  if (!Number.isFinite(tMin)) return { x: cx, y: cy }
  return { x: cx + tMin * vx, y: cy + tMin * vy }
}

/**
 * Overlapping deck (reference: fanned stack → rail). Order:
 * literature → research → protocols → experiments → data → analysis → writing → lab notes → projects
 */
const FLOW_CARDS = [
  { key: "literature", label: "Literature", accent: "#5b6bd6" },
  { key: "research", label: "Research", accent: "#2d9f6f" },
  { key: "protocols", label: "Protocols", accent: "#d64a5c" },
  { key: "experiments", label: "Experiments", accent: "#3d8fd6" },
  { key: "data", label: "Data", accent: "#4f7fd6" },
  { key: "analysis", label: "Analysis", accent: "#8b6fd6" },
  { key: "writing", label: "Writing", accent: "#d9a24a" },
  { key: "lab-notes", label: "Lab notes", accent: "#3aa89a" },
  { key: "projects", label: "Projects", accent: "#c4923e" },
] as const

type FlowCardKey = (typeof FLOW_CARDS)[number]["key"]

function CardSkeleton({ cardKey }: { cardKey: FlowCardKey }) {
  const line = (w: string, h = "h-[2px]") => (
    <div className={`${h} rounded-full bg-black/[0.09] dark:bg-white/[0.11]`} style={{ width: w }} />
  )
  const thinLine = (w: string) => (
    <div className="h-[1.5px] rounded-full bg-black/[0.06] dark:bg-white/[0.08]" style={{ width: w }} />
  )

  if (cardKey === "literature") {
    return (
      <div className="space-y-2">
        {/* Search bar */}
        <div className="flex items-center gap-1 rounded-[3px] border border-black/[0.08] bg-black/[0.03] px-1.5 py-1 dark:border-white/[0.1] dark:bg-white/[0.04]">
          <div className="h-[5px] w-[5px] shrink-0 rounded-full border border-black/[0.15] dark:border-white/[0.18]" />
          {thinLine("72%")}
        </div>
        {/* Paper result rows */}
        {[["88%", "55%"], ["92%", "48%"], ["80%", "60%"]].map(([t, a], i) => (
          <div key={i} className="space-y-[3px]">
            {line(t, "h-[2px]")}
            {thinLine(a)}
          </div>
        ))}
        <div className="flex gap-1 pt-0.5">
          <div className="h-[5px] w-[22px] rounded-sm bg-[#5b6bd6]/25" />
          <div className="h-[5px] w-[16px] rounded-sm bg-black/[0.05] dark:bg-white/[0.07]" />
        </div>
      </div>
    )
  }

  if (cardKey === "research") {
    return (
      <div className="space-y-1.5">
        {line("90%", "h-[2.5px]")}
        {thinLine("60%")}
        <div className="mt-2 space-y-[4px]">
          {thinLine("100%")}
          {thinLine("96%")}
          {thinLine("88%")}
          {thinLine("72%")}
        </div>
        <div className="mt-1.5 flex gap-1">
          <div className="h-[5px] w-[28px] rounded-sm bg-[#2d9f6f]/25" />
          <div className="h-[5px] w-[20px] rounded-sm bg-black/[0.05] dark:bg-white/[0.07]" />
        </div>
      </div>
    )
  }

  if (cardKey === "protocols") {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4].map((n) => (
          <div key={n} className="flex items-center gap-1.5">
            <div className="h-[7px] w-[7px] shrink-0 rounded-full border border-black/[0.12] bg-black/[0.05] dark:border-white/[0.15] dark:bg-white/[0.07]" />
            {thinLine(n === 2 ? "78%" : n === 4 ? "55%" : "88%")}
          </div>
        ))}
      </div>
    )
  }

  if (cardKey === "experiments") {
    return (
      <div className="space-y-1.5">
        {[["Protocol", "80%"], ["Sample", "65%"], ["Date", "50%"]].map(([label, w]) => (
          <div key={label} className="flex flex-col gap-[3px]">
            <div className="h-[1.5px] w-[30%] rounded-full bg-black/[0.08] dark:bg-white/[0.1]" />
            <div className="h-[5px] w-full rounded-sm bg-black/[0.05] dark:bg-white/[0.07]" />
          </div>
        ))}
        <div className="mt-1 flex items-center gap-1">
          <div className="h-[5px] w-[5px] rounded-full bg-[#3d8fd6]/50" />
          {thinLine("45%")}
        </div>
      </div>
    )
  }

  if (cardKey === "data") {
    return (
      <div className="space-y-[3px]">
        <div className="flex gap-[3px]">
          {["30%", "35%", "30%"].map((w, i) => (
            <div key={i} className="h-[5px] rounded-sm bg-black/[0.12] dark:bg-white/[0.14]" style={{ width: w }} />
          ))}
        </div>
        {[1, 2, 3, 4].map((r) => (
          <div key={r} className="flex gap-[3px]">
            {["30%", "35%", "30%"].map((w, i) => (
              <div key={i} className="h-[4px] rounded-sm bg-black/[0.05] dark:bg-white/[0.07]" style={{ width: w }} />
            ))}
          </div>
        ))}
      </div>
    )
  }

  if (cardKey === "analysis") {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-end gap-[3px]" style={{ height: 28 }}>
          {[55, 80, 40, 90, 65, 50, 75].map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-t-[2px] bg-[#8b6fd6]/30 dark:bg-[#8b6fd6]/40"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
        <div className="h-[1.5px] w-full rounded-full bg-black/[0.1] dark:bg-white/[0.12]" />
        <div className="flex justify-between">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-[1.5px] w-[10%] rounded-full bg-black/[0.05] dark:bg-white/[0.07]" />
          ))}
        </div>
      </div>
    )
  }

  if (cardKey === "writing") {
    return (
      <div className="space-y-[4px]">
        {line("75%", "h-[2.5px]")}
        <div className="mt-1.5 space-y-[3px]">
          {thinLine("100%")}
          {thinLine("96%")}
          {thinLine("90%")}
        </div>
        <div className="mt-1 space-y-[3px]">
          {thinLine("100%")}
          {thinLine("82%")}
          {thinLine("68%")}
        </div>
        <div className="mt-1 flex items-center gap-1">
          <div className="h-[4px] w-[4px] rounded-sm bg-[#d9a24a]/40" />
          {thinLine("58%")}
        </div>
      </div>
    )
  }

  if (cardKey === "lab-notes") {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-1">
          <div className="h-[5px] w-[38px] rounded-sm bg-[#3aa89a]/30" />
          {thinLine("30%")}
        </div>
        {[1, 2, 3].map((n) => (
          <div key={n} className="flex items-start gap-1">
            <div className="mt-[3px] h-[4px] w-[4px] shrink-0 rounded-[1px] bg-black/[0.1] dark:bg-white/[0.12]" />
            {thinLine(n === 2 ? "75%" : "90%")}
          </div>
        ))}
        <div className="mt-1 h-[5px] w-[42px] rounded-sm bg-black/[0.06] dark:bg-white/[0.08]" />
      </div>
    )
  }

  // projects
  return (
    <div className="flex gap-1.5">
      {[["To Do", 2], ["Active", 3], ["Done", 1]].map(([col, count]) => (
        <div key={col as string} className="flex flex-1 flex-col gap-[3px]">
          <div className="h-[4px] rounded-sm bg-black/[0.1] dark:bg-white/[0.12]" />
          {Array.from({ length: count as number }).map((_, i) => (
            <div key={i} className="h-[6px] rounded-sm bg-black/[0.05] dark:bg-white/[0.07]" />
          ))}
        </div>
      ))}
    </div>
  )
}

/** Hub orbit chips: same domains as deck CardSkeleton, compact for small cards */
function OrbitalChipSkeleton({ cardKey }: { cardKey: FlowCardKey }) {
  const line = (w: string, h = "h-[2px]") => (
    <div className={`${h} rounded-full bg-black/[0.1] dark:bg-white/[0.13]`} style={{ width: w }} />
  )
  const thin = (w: string) => (
    <div className="h-[1px] rounded-full bg-black/[0.07] dark:bg-white/[0.1]" style={{ width: w }} />
  )

  if (cardKey === "literature") {
    return (
      <div className="flex flex-1 flex-col justify-end gap-1">
        <div className="flex items-center gap-0.5 rounded-[2px] border border-black/[0.08] bg-black/[0.03] px-1 py-0.5 dark:border-white/[0.1] dark:bg-white/[0.04]">
          <div className="h-[3px] w-[3px] shrink-0 rounded-full border border-black/[0.12] dark:border-white/[0.15]" />
          {thin("68%")}
        </div>
        {[
          ["82%", "52%"],
          ["76%", "44%"],
        ].map(([a, b], i) => (
          <div key={i} className="space-y-[2px]">
            {line(a)}
            {thin(b)}
          </div>
        ))}
        <div className="flex gap-0.5 pt-0.5">
          <div className="h-[3px] w-[14px] rounded-sm bg-[#5b6bd6]/28" />
          <div className="h-[3px] w-[10px] rounded-sm bg-black/[0.06] dark:bg-white/[0.08]" />
        </div>
      </div>
    )
  }

  if (cardKey === "lab-notes") {
    return (
      <div className="flex flex-1 flex-col justify-end gap-1">
        <div className="flex items-center gap-0.5">
          <div className="h-[3px] w-[26px] rounded-sm bg-[#3aa89a]/28" />
          {thin("28%")}
        </div>
        {[1, 2, 3].map((n) => (
          <div key={n} className="flex items-start gap-0.5">
            <div className="mt-[2px] h-[3px] w-[3px] shrink-0 rounded-[1px] bg-black/[0.12] dark:bg-white/[0.14]" />
            {thin(n === 2 ? "72%" : "88%")}
          </div>
        ))}
        <div className="h-[3px] w-[34px] rounded-sm bg-black/[0.06] dark:bg-white/[0.08]" />
      </div>
    )
  }

  if (cardKey === "experiments") {
    return (
      <div className="flex flex-1 flex-col justify-end gap-1">
        {["78%", "62%", "48%"].map((w) => (
          <div key={w} className="flex flex-col gap-[2px]">
            <div className="h-[1px] w-[28%] rounded-full bg-black/[0.08] dark:bg-white/[0.1]" />
            <div className="h-[4px] w-full rounded-sm bg-black/[0.06] dark:bg-white/[0.08]" />
          </div>
        ))}
        <div className="flex items-center gap-0.5">
          <div className="h-[3px] w-[3px] rounded-full bg-[#3d8fd6]/45" />
          {thin("40%")}
        </div>
      </div>
    )
  }

  if (cardKey === "analysis") {
    return (
      <div className="flex flex-1 flex-col justify-end gap-1">
        <div className="flex items-end gap-[2px]" style={{ height: 36 }}>
          {[50, 78, 38, 88, 58, 44, 70].map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-t-[1px] bg-[#b87333]/35 dark:bg-[#b87333]/45"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
        <div className="h-[1px] w-full rounded-full bg-black/[0.1] dark:bg-white/[0.12]" />
        <div className="flex justify-between">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-[1px] w-[12%] rounded-full bg-black/[0.06] dark:bg-white/[0.08]" />
          ))}
        </div>
      </div>
    )
  }

  if (cardKey === "protocols") {
    return (
      <div className="flex flex-1 flex-col justify-end gap-1">
        {[1, 2, 3, 4].map((n) => (
          <div key={n} className="flex items-center gap-1">
            <div className="h-[5px] w-[5px] shrink-0 rounded-full border border-black/[0.12] bg-black/[0.05] dark:border-white/[0.14] dark:bg-white/[0.07]" />
            {thin(n === 2 ? "72%" : n === 4 ? "50%" : "84%")}
          </div>
        ))}
      </div>
    )
  }

  if (cardKey === "writing") {
    return (
      <div className="flex flex-1 flex-col justify-end gap-1">
        {line("70%", "h-[2px]")}
        <div className="space-y-[2px]">
          {thin("100%")}
          {thin("92%")}
          {thin("84%")}
        </div>
        <div className="space-y-[2px]">
          {thin("100%")}
          {thin("76%")}
        </div>
        <div className="flex items-center gap-0.5 pt-0.5">
          <div className="h-[3px] w-[3px] rounded-sm bg-[#d9a24a]/38" />
          {thin("52%")}
        </div>
      </div>
    )
  }

  if (cardKey === "research") {
    return (
      <div className="flex flex-1 flex-col justify-end gap-1">
        {line("86%", "h-[2px]")}
        {thin("56%")}
        <div className="mt-0.5 space-y-[2px]">
          {thin("100%")}
          {thin("90%")}
          {thin("78%")}
        </div>
        <div className="mt-0.5 flex gap-0.5">
          <div className="h-[3px] w-[20px] rounded-sm bg-[#2d9f6f]/28" />
          <div className="h-[3px] w-[14px] rounded-sm bg-black/[0.06] dark:bg-white/[0.08]" />
        </div>
      </div>
    )
  }

  if (cardKey === "data") {
    return (
      <div className="flex flex-1 flex-col justify-end gap-[2px]">
        <div className="flex gap-[2px]">
          {["32%", "34%", "28%"].map((w, i) => (
            <div key={i} className="h-[4px] rounded-sm bg-black/[0.11] dark:bg-white/[0.13]" style={{ width: w }} />
          ))}
        </div>
        {[1, 2, 3].map((r) => (
          <div key={r} className="flex gap-[2px]">
            {["32%", "34%", "28%"].map((w, i) => (
              <div key={i} className="h-[3px] rounded-sm bg-black/[0.06] dark:bg-white/[0.08]" style={{ width: w }} />
            ))}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col justify-end gap-1">
      {line("88%", "h-[2px]")}
      {thin("58%")}
      <div className="mt-0.5 space-y-[2px]">
        {thin("100%")}
        {thin("86%")}
      </div>
    </div>
  )
}

export function ConnectedResearchSystemDiagram({ className = "" }: { className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const catRef = useRef<HTMLDivElement>(null)
  const n9Ref = useRef<HTMLDivElement>(null)
  /** First marquee card (left strip) — rail height = 140% of this */
  const flowDeckCardRef = useRef<HTMLDivElement>(null)
  const rightPanelRef = useRef<HTMLDivElement>(null)
  const chipRefs = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)]
  const rafRef = useRef(0)
  const partsRef = useRef<Px[]>([])
  const playingRef = useRef(false)
  const t0Ref = useRef(0)
  const chipShownRef = useRef([false, false, false, false, false, false])
  const lastOrbitRef = useRef(0)
  const lastDriftRef = useRef(0)
  const playGenRef = useRef(0)
  const timeoutIdsRef = useRef<number[]>([])
  const n9StatusRef = useRef("ingesting")
  const catPulseTriggeredRef = useRef(false)

  const [phase, setPhase] = useState({
    n9: false,
    cat: false,
    catPulse: false,
    chips: [false, false, false, false, false, false],
  })
  const [n9Status, setN9Status] = useState("ingesting")
  const [statusFade, setStatusFade] = useState(true)
  const [reduceMotion, setReduceMotion] = useState(false)
  /** Violet rail height = 140% of a left flow deck card (marquee cards) */
  const [violetRailPx, setVioletRailPx] = useState(Math.round(230 * 1.4))
  const [connInfo, setConnInfo] = useState<{
    svgW: number
    svgH: number
    catX: number
    catY: number
    chips: { sx: number; sy: number; cx: number; cy: number }[]
  }>({ svgW: 0, svgH: 0, catX: 0, catY: 0, chips: [] })

  useEffect(() => {
    setReduceMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches)
  }, [])

  useLayoutEffect(() => {
    const el = flowDeckCardRef.current
    if (!el) return
    const measure = () => {
      const h = el.getBoundingClientRect().height
      if (h > 0) setVioletRailPx(Math.max(64, Math.round(h * 1.4)))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const clearScheduledTimeouts = useCallback(() => {
    for (const id of timeoutIdsRef.current) window.clearTimeout(id)
    timeoutIdsRef.current = []
  }, [])

  const updateConnections = useCallback(() => {
    const panel = rightPanelRef.current
    const cat = catRef.current
    if (!panel || !cat) return
    const pr = panel.getBoundingClientRect()
    const cr = cat.getBoundingClientRect()
    const catX = cr.left - pr.left + cr.width / 2
    const catY = cr.top - pr.top + cr.height / 2
    setConnInfo({
      svgW: pr.width,
      svgH: pr.height,
      catX,
      catY,
      chips: chipRefs.map((ref) => {
        const el = ref.current
        if (!el) return { sx: 0, sy: 0, cx: 0, cy: 0 }
        const r = el.getBoundingClientRect()
        const L = r.left - pr.left
        const T = r.top - pr.top
        const W = r.width
        const H = r.height
        const cx = L + W / 2
        const cy = T + H / 2
        const edge = rectExitTowardCat(L, T, W, H, catX, catY)
        return { sx: edge.x, sy: edge.y, cx, cy }
      }),
    })
  }, [])

  const gc = useCallback((el: HTMLElement) => {
    const w = wrapRef.current
    if (!w) return { x: 0, y: 0 }
    const r = el.getBoundingClientRect()
    const wr = w.getBoundingClientRect()
    return { x: r.left - wr.left + r.width / 2, y: r.top - wr.top + r.height / 2 }
  }, [])

  const schedule = useCallback((fn: () => void, ms: number, gen: number) => {
    const id = window.setTimeout(() => {
      if (playGenRef.current !== gen) return
      fn()
    }, ms)
    timeoutIdsRef.current.push(id)
  }, [])

  const reset = useCallback(() => {
    clearScheduledTimeouts()
    partsRef.current = []
    chipShownRef.current = [false, false, false, false, false, false]
    cancelAnimationFrame(rafRef.current)
    playingRef.current = false
    n9StatusRef.current = "ingesting"
    catPulseTriggeredRef.current = false
    setPhase({
      n9: false,
      cat: false,
      catPulse: false,
      chips: [false, false, false, false, false, false],
    })
    setN9Status("ingesting")
  }, [clearScheduledTimeouts])

  const start = useCallback(() => {
    if (reduceMotion) {
      setPhase({
        n9: true,
        cat: true,
        catPulse: true,
        chips: [true, true, true, true, true, true],
      })
      setN9Status("connected")
      return
    }
    cancelAnimationFrame(rafRef.current)
    reset()
    playGenRef.current += 1
    const gen = playGenRef.current
    playingRef.current = true
    t0Ref.current = performance.now()
    lastOrbitRef.current = 0
    lastDriftRef.current = 0

    schedule(() => setPhase((p) => ({ ...p, n9: true })), 550, gen)
    schedule(() => setPhase((p) => ({ ...p, cat: true })), 1100, gen)

    function orbit(cx: number, cy: number) {
      partsRef.current.push(new Px(cx, cy, PCOLS[Math.floor(Math.random() * PCOLS.length)], "orbit"))
    }
    function shoot(cx: number, cy: number, col: string) {
      for (let k = 0; k < 8; k++) {
        const p = new Px(cx, cy, col, "shoot")
        const a = Math.random() * Math.PI * 2
        const d = 70 + Math.random() * 75
        p.tx = cx + Math.cos(a) * d
        p.ty = cy + Math.sin(a) * d
        p.maxLife = 46 + k * 5
        partsRef.current.push(p)
      }
    }
    function drift(x: number, y: number) {
      const m = Math.random() > 0.45 ? "quad" : "drift"
      const p = new Px(x, y, PCOLS[Math.floor(Math.random() * PCOLS.length)], m as PxMode)
      p.vx = (Math.random() - 0.5) * 1.1
      p.vy = (Math.random() - 0.5) * 1.1
      partsRef.current.push(p)
    }

    function tick(now: number) {
      if (playGenRef.current !== gen) return
      const canvas = canvasRef.current
      const ctx = canvas?.getContext("2d")
      const w = wrapRef.current
      const catEl = catRef.current
      if (!ctx || !canvas || !w || !catEl) {
        playingRef.current = false
        return
      }

      const raw = Math.min(1, (now - t0Ref.current) / TOTAL_MS)

      let nextStatus = n9StatusRef.current
      if (raw > 0.32 && raw < 0.48) nextStatus = "processing"
      else if (raw > 0.48) nextStatus = "connected"
      if (nextStatus !== n9StatusRef.current) {
        n9StatusRef.current = nextStatus
        setN9Status(nextStatus)
      }

      if (raw > 0.46 && !catPulseTriggeredRef.current) {
        catPulseTriggeredRef.current = true
        setPhase((p) => ({ ...p, catPulse: true }))
      }

      const cc = gc(catEl)
      const nc = n9Ref.current ? gc(n9Ref.current) : cc
      const partsLen = partsRef.current.length

      if (raw > 0.46 && raw < 0.92 && now - lastOrbitRef.current > 44 && partsLen < AMBIENT_PARTICLE_CAP) {
        orbit(cc.x, cc.y)
        lastOrbitRef.current = now
      }
      if (raw < 0.4 && now - lastDriftRef.current > 88 && partsLen < AMBIENT_PARTICLE_CAP) {
        drift(65 + Math.random() * 60, nc.y + (Math.random() - 0.5) * 120)
        lastDriftRef.current = now
      }

      // After the scripted timeline, keep the grain / orbit field running indefinitely
      if (raw >= 1 && partsLen < AMBIENT_PARTICLE_CAP) {
        if (now - lastOrbitRef.current > 72) {
          orbit(cc.x, cc.y)
          lastOrbitRef.current = now
        }
        if (now - lastDriftRef.current > 96) {
          drift(65 + Math.random() * 60, nc.y + (Math.random() - 0.5) * 120)
          lastDriftRef.current = now
        }
      }

      CHIP_T.forEach((t, i) => {
        if (!chipShownRef.current[i] && raw > t) {
          chipShownRef.current[i] = true
          setPhase((p) => {
            const chips = [...p.chips]
            chips[i] = true
            return { ...p, chips }
          })
          shoot(cc.x, cc.y, CHIP_COLS[i])
        }
      })

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const parts = partsRef.current
      for (let i = parts.length - 1; i >= 0; i--) {
        if (!parts[i]!.tick(cc.x, cc.y)) parts.splice(i, 1)
        else parts[i]!.draw(ctx)
      }
      ctx.globalAlpha = 1

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
  }, [gc, reduceMotion, reset, schedule])

  useEffect(() => {
    const ro = new ResizeObserver(() => {
      const w = wrapRef.current
      const c = canvasRef.current
      if (!w || !c) return
      c.width = w.offsetWidth
      c.height = w.offsetHeight
    })
    if (wrapRef.current) ro.observe(wrapRef.current)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const t = window.setTimeout(start, 150)
    return () => {
      window.clearTimeout(t)
      clearScheduledTimeouts()
      cancelAnimationFrame(rafRef.current)
    }
  }, [start, clearScheduledTimeouts])

  // Recompute SVG connection positions when chips/cat phase in
  useEffect(() => {
    if (!phase.chips.some(Boolean) && !phase.cat) return
    const t = window.setTimeout(updateConnections, 120)
    return () => window.clearTimeout(t)
  }, [phase.chips, phase.cat, updateConnections])

  // Keep connection positions in sync on resize
  useEffect(() => {
    const panel = rightPanelRef.current
    if (!panel) return
    const ro = new ResizeObserver(updateConnections)
    ro.observe(panel)
    return () => ro.disconnect()
  }, [updateConnections])

  // Continuous status cycle: connected → ingesting → processing → repeat
  useEffect(() => {
    if (!phase.n9) return
    const steps: Array<[string, number]> = [
      ["connected", 3200],
      ["ingesting", 2200],
      ["processing", 1800],
    ]
    let idx = 0
    const tids: number[] = []

    const advance = () => {
      // Fade out
      setStatusFade(false)
      tids.push(
        window.setTimeout(() => {
          idx = (idx + 1) % steps.length
          setN9Status(steps[idx][0])
          // Fade in
          setStatusFade(true)
          // Schedule next step
          tids.push(window.setTimeout(advance, steps[idx][1]))
        }, 280),
      )
    }

    // First cycle starts after the main animation finishes
    const initialDelay = reduceMotion ? 3200 : TOTAL_MS + 2000
    tids.push(window.setTimeout(advance, initialDelay))
    return () => tids.forEach((t) => window.clearTimeout(t))
  }, [phase.n9, reduceMotion])

  const chipMeta: ReadonlyArray<{
    label: string
    tone: "o0" | "o1" | "o2" | "o3" | "o4" | "o5"
    skeletonKey: FlowCardKey
  }> = [
    { label: "Lab notes", tone: "o0", skeletonKey: "lab-notes" },
    { label: "Experiments", tone: "o1", skeletonKey: "experiments" },
    { label: "Data analysis", tone: "o2", skeletonKey: "analysis" },
    { label: "Literature search", tone: "o3", skeletonKey: "literature" },
    { label: "Writing", tone: "o4", skeletonKey: "writing" },
    { label: "Protocols", tone: "o5", skeletonKey: "protocols" },
  ]

  const chipTone = (tone: (typeof chipMeta)[number]["tone"]) =>
    tone === "o0"
      ? "border-emerald-600/25 bg-emerald-50/90 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-200"
      : tone === "o1"
        ? "border-sky-600/25 bg-sky-50/90 text-sky-900 dark:border-sky-500/30 dark:bg-sky-950/40 dark:text-sky-200"
        : tone === "o2"
          ? "border-[var(--n9-accent)]/30 bg-[var(--n9-accent-light)] text-[#6b4420] dark:bg-[#2a2218] dark:text-[#e8c49a]"
          : tone === "o3"
            ? "border-violet-500/25 bg-violet-50/90 text-violet-900 dark:border-violet-400/30 dark:bg-violet-950/40 dark:text-violet-200"
            : tone === "o4"
              ? "border-amber-600/25 bg-amber-50/90 text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-200"
              : "border-rose-500/25 bg-rose-50/90 text-rose-900 dark:border-rose-400/30 dark:bg-rose-950/40 dark:text-rose-200"

  const chipEl = (c: (typeof chipMeta)[number], i: number) => (
    <div
      key={c.label}
      ref={chipRefs[i]}
      className={`flex min-h-[118px] min-w-0 flex-col rounded-lg border px-2.5 pb-2.5 pt-2 shadow-sm transition-all duration-300 ease-out ${phase.chips[i] ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"} ${chipTone(c.tone)}`}
    >
      <p className="shrink-0 text-center text-[10px] font-semibold leading-snug">{c.label}</p>
      <div className="mt-2 flex min-h-[5.25rem] flex-1 flex-col px-0.5">
        <OrbitalChipSkeleton cardKey={c.skeletonKey} />
      </div>
    </div>
  )

  return (
    <div
      ref={wrapRef}
      className={`relative mx-auto h-[620px] min-h-[500px] w-full min-w-[680px] max-w-[1200px] overflow-x-auto rounded-[28px] border border-[var(--n9-accent)]/15 bg-[radial-gradient(circle,rgba(0,0,0,0.06)_1px,transparent_1px)] [background-size:22px_22px] dark:border-[var(--n9-accent)]/14 dark:bg-[radial-gradient(circle,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(180deg,rgba(24,22,20,0.96),rgba(14,14,16,0.99))] dark:[background-size:22px_22px,auto] ${className}`}
    >
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 z-[2] h-full w-full" aria-hidden />

      <div className="relative z-[5] h-full" aria-labelledby="n9-marketing-diagram-title">
        {/* Card deck marquee — seamless loop; right edge fade only */}
        <div
          className="n9-marketing-flow-strip pointer-events-none absolute inset-y-0 left-0 z-[3] flex w-[36%] items-center justify-start overflow-hidden"
          aria-hidden
        >
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-white to-transparent dark:from-[#131214] dark:to-transparent" />

          <div className="n9-marketing-flow-deck-marquee flex items-center">
              {[0, 1].map((dup) => (
                <div
                  key={dup}
                  className="flex shrink-0 items-stretch gap-5 pr-5"
                >
                  {FLOW_CARDS.map((row) => (
                    <div
                      key={`${dup}-${row.key}`}
                      ref={dup === 0 && row.key === FLOW_CARDS[0]!.key ? flowDeckCardRef : undefined}
                      className="relative flex w-[196px] min-h-[230px] shrink-0 flex-col overflow-hidden rounded-2xl border border-black/[0.07] bg-white shadow-[0_6px_24px_-8px_rgba(20,18,16,0.18)] dark:border-white/[0.1] dark:bg-[#222024] dark:shadow-[0_6px_28px_-8px_rgba(0,0,0,0.6)]"
                    >
                      <div className="h-[4px] w-full shrink-0" style={{ backgroundColor: row.accent }} />
                      <div className="flex flex-1 flex-col px-4 pb-5 pt-3.5">
                        <p
                          className="mb-3 text-[10px] font-bold uppercase leading-snug tracking-[0.18em]"
                          style={{ color: row.accent }}
                        >
                          {row.label}
                        </p>
                        <CardSkeleton cardKey={row.key} />
                      </div>
                    </div>
                  ))}
                </div>
              ))}
          </div>
        </div>

        {/* Rail: height = 140% of left marquee card; centered on Notes9, not full diagram height */}
        <div className="pointer-events-none absolute bottom-0 left-[36%] top-0 z-[4] w-0 -translate-x-1/2">
          <div
            className="absolute left-1/2 top-1/2 w-0 -translate-x-1/2 -translate-y-1/2"
            style={{ height: violetRailPx }}
            aria-hidden
          >
            <div className="pointer-events-none absolute inset-y-0 left-1/2 w-[1.5px] -translate-x-1/2 rounded-full bg-violet-600/30 dark:bg-violet-400/25" />
          </div>
          <div
              id="n9-marketing-diagram-title"
              ref={n9Ref}
              className="pointer-events-auto absolute left-1/2 top-1/2 z-[12] min-w-[7.5rem] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-black/[0.08] bg-white px-3.5 py-3 text-center shadow-[0_4px_28px_-8px_rgba(20,16,12,0.22)] dark:border-white/[0.12] dark:bg-[#1e1d20] dark:shadow-[0_8px_32px_-10px_rgba(0,0,0,0.65)]"
            >
              <p className="text-[13px] font-semibold tracking-tight text-[#12100e] dark:text-white/95">
                Notes9
              </p>
              {/* Status row — always visible once phase.n9, fades between cycles */}
              <div
                className={`mt-2 flex items-center justify-center gap-1.5 transition-opacity duration-[280ms] ${
                  phase.n9 ? (statusFade ? "opacity-100" : "opacity-0") : "opacity-0"
                }`}
              >
                <span
                  className={`h-[6px] w-[6px] shrink-0 rounded-full ${
                    n9Status === "connected"
                      ? "bg-emerald-500"
                      : n9Status === "processing"
                        ? "bg-violet-500"
                        : "bg-amber-400"
                  }`}
                />
                <span
                  className={`text-[8px] font-semibold uppercase tracking-[0.18em] ${
                    n9Status === "connected"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : n9Status === "processing"
                        ? "text-violet-500 dark:text-violet-400"
                        : "text-amber-600 dark:text-amber-400"
                  }`}
                >
                  {n9Status}
                </span>
              </div>
            </div>
          </div>

          <div ref={rightPanelRef} className="absolute left-[36%] right-0 top-0 bottom-0 z-[5] grid min-h-0 grid-rows-[auto_1fr_auto] gap-y-4 overflow-hidden px-[2.5%] pb-6 pt-4">

            {/* Animated connection lines: chip → Catalyst AI */}
            {connInfo.svgW > 0 && (
              <svg
                className="pointer-events-none absolute inset-0 z-[7]"
                style={{ overflow: "hidden" }}
                width={connInfo.svgW}
                height={connInfo.svgH}
                viewBox={`0 0 ${connInfo.svgW} ${connInfo.svgH}`}
                aria-hidden
              >
                <defs>
                  {CHIP_COLS.map((col, mi) => (
                    <marker
                      key={mi}
                      id={`n9-flow-arrow-${mi}`}
                      markerWidth="7"
                      markerHeight="7"
                      refX="6"
                      refY="3.5"
                      orient="auto"
                      markerUnits="userSpaceOnUse"
                    >
                      <path d="M0,0.5 L6.5,3.5 L0,6.5 Z" fill={col} fillOpacity={0.9} />
                    </marker>
                  ))}
                </defs>
                {connInfo.chips.map((chip, i) => {
                  if (!phase.chips[i] || (!chip.cx && !chip.cy)) return null
                  const dx = connInfo.catX - chip.cx
                  const dy = connInfo.catY - chip.cy
                  const dist = Math.sqrt(dx * dx + dy * dy)
                  if (dist < 2) return null
                  const ratio = (dist - 72) / dist
                  const ex = chip.cx + dx * ratio
                  const ey = chip.cy + dy * ratio
                  const cpx = (chip.cx + connInfo.catX) / 2
                  const cpy = (chip.cy + connInfo.catY) / 2 + (i < 3 ? 28 : -28)
                  const col = CHIP_COLS[i] ?? "#8b6fd6"
                  return (
                    <path
                      key={i}
                      d={`M ${chip.sx} ${chip.sy} Q ${cpx} ${cpy} ${ex} ${ey}`}
                      stroke={col}
                      strokeWidth="1.5"
                      strokeOpacity={0.5}
                      fill="none"
                      strokeDasharray="5 8"
                      markerEnd={`url(#n9-flow-arrow-${i})`}
                      className={reduceMotion ? "" : "n9-conn-flow"}
                      style={{ animationDelay: `${i * 0.28}s` }}
                    />
                  )
                })}
              </svg>
            )}

            <div className="grid grid-cols-3 gap-x-2 sm:gap-x-3">{chipMeta.slice(0, 3).map((c, i) => chipEl(c, i))}</div>
            <div className="relative flex min-h-[6.5rem] items-center justify-center">
              <div
                ref={catRef}
                className={`relative z-[8] flex shrink-0 flex-col items-center justify-center gap-1 py-1 transition-opacity duration-300 ${phase.cat ? "opacity-100" : "opacity-0"}`}
              >
                <IceMascot
                  className="hero-pendulum mx-auto h-11 w-11 sm:h-12 sm:w-12"
                  options={{ src: "/notes9-mascot-ui.png" }}
                  aria-hidden
                />
                <p className="text-center text-[8px] font-semibold uppercase tracking-[0.12em] text-[var(--n9-accent)]">Catalyst AI</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-x-2 sm:gap-x-3">{chipMeta.slice(3, 6).map((c, i) => chipEl(c, i + 3))}</div>
          </div>
      </div>
    </div>
  )
}
