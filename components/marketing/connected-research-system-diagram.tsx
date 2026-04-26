"use client"

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react"
import { motion, useInView } from "framer-motion"
import { IceMascot } from "@/components/ui/ice-mascot"

/** Desktop deck + hub layout is authored at this size; narrower containers scale down uniformly. */
const DESKTOP_DIAGRAM_W = 1200
const DESKTOP_DIAGRAM_H = 768
/** Flow strip (left) vs hub (right): 40% / 60% at authored width. */
const DESKTOP_RAIL_LEFT_PCT = 40
const DESKTOP_FLOW_STRIP_W_PX = Math.round((DESKTOP_DIAGRAM_W * DESKTOP_RAIL_LEFT_PCT) / 100)

const TOTAL_MS = 10000
const CHIP_T = [0.5, 0.54, 0.58, 0.63, 0.68, 0.73] as const
/** Stroke + marker fill per chip order: Lab notes, Experiments, Data analysis, Literature, Writing, Protocols */
const CHIP_COLS = ["#059669", "#0284c7", "#b87333", "#7c3aed", "#d97706", "#e11d48"] as const

/** Extra hues for Catalyst mascot grain backdrop (chip tones + accents). */
const CATALYST_GRAIN_COLORS = [...CHIP_COLS, "#8b5cf6", "#34d399", "#fbbf24"] as const

/** Soft multi-color grains behind the hub IceMascot (canvas, hub-local only). */
function CatalystGrainBackdrop({
  active,
  reduceMotion,
  className,
  children,
}: {
  active: boolean
  reduceMotion: boolean
  className?: string
  children: ReactNode
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)

  useEffect(() => {
    if (reduceMotion || !active) return
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    type Grain = {
      ang: number
      rBase: number
      rPulse: number
      speed: number
      phase: number
      sz: number
      col: string
      wobble: number
    }
    const grains: Grain[] = []
    const n = 36
    for (let i = 0; i < n; i++) {
      grains.push({
        ang: Math.random() * Math.PI * 2,
        rBase: 0.14 + Math.random() * 0.34,
        rPulse: 0.03 + Math.random() * 0.07,
        speed: 0.0011 + Math.random() * 0.0024,
        phase: Math.random() * Math.PI * 2,
        sz: 1 + Math.random() * 2.2,
        col: CATALYST_GRAIN_COLORS[i % CATALYST_GRAIN_COLORS.length]!,
        wobble: 0.6 + Math.random() * 1.1,
      })
    }

    const resize = () => {
      const w = Math.max(1, wrap.clientWidth)
      const h = Math.max(1, wrap.clientHeight)
      const dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1)
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    let frame = 0
    const tick = () => {
      frame++
      const W = wrap.clientWidth
      const H = wrap.clientHeight
      if (W < 2 || H < 2) {
        rafRef.current = requestAnimationFrame(tick)
        return
      }
      const cx = W / 2
      const cy = H / 2
      const R = Math.min(W, H) * 0.46
      ctx.clearRect(0, 0, W, H)
      for (const g of grains) {
        g.ang += g.speed
        const pulse = Math.sin(g.ang * 1.4 + g.phase) * g.rPulse * R
        const r = g.rBase * R + pulse + Math.sin(frame * 0.035 * g.wobble + g.phase) * (0.04 * R)
        const px = cx + Math.cos(g.ang) * r
        const py = cy + Math.sin(g.ang) * r
        const alpha = 0.2 + 0.42 * (0.5 + 0.5 * Math.sin(g.ang * 2.1 + g.phase))
        ctx.save()
        ctx.translate(px, py)
        ctx.rotate(g.ang * 1.15 + g.phase)
        ctx.globalAlpha = alpha
        ctx.fillStyle = g.col
        ctx.fillRect(-g.sz * 1.1, -g.sz * 0.5, g.sz * 2.2, g.sz)
        ctx.restore()
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      ro.disconnect()
      cancelAnimationFrame(rafRef.current)
    }
  }, [active, reduceMotion])

  return (
    <div ref={wrapRef} className={`relative inline-flex shrink-0 items-center justify-center ${className ?? ""}`}>
      {!reduceMotion && active ? (
        <canvas
          ref={canvasRef}
          className="pointer-events-none absolute left-1/2 top-1/2 z-0 h-[148%] w-[148%] max-w-none -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.88] [mask-image:radial-gradient(circle_at_50%_50%,black_32%,transparent_74%)] dark:opacity-[0.72]"
          aria-hidden
        />
      ) : null}
      <div className="relative z-[1]">{children}</div>
    </div>
  )
}

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

/** Scales authored orbit radius, chord margin, and in-hub clearance (1.5× then another 1.4×). */
const HUB_ORBIT_SCALE = 1.5 * 1.2

/**
 * Hub center → chip anchor distance (px). Chord between neighbors ≈ R (60° steps).
 * Large radius so orbit chips clear the mascot.
 */
const HUB_ORBIT_RADIUS_PX = Math.round(352 * HUB_ORBIT_SCALE)
const HUB_ORBIT_R_FLOOR = Math.round(120 * HUB_ORBIT_SCALE)
const HUB_CHORD_EXTRA = Math.round(50 * HUB_ORBIT_SCALE)

/**
 * Deck: fixed left gate, four vertical slots (conveyor), horizontal run to the
 * violet rail, opacity fades only while crossing the rail. Stagger = ⅓ flight.
 */
const DECK_FLIGHT_MS = 5800

type DeckGeo = { laneW: number; laneH: number }

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
const MOBILE_SOURCE_KEYS = ["literature", "protocols", "experiments", "lab-notes"] as const

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

const DECK_CARD_W = 196
const DECK_CARD_H = 230
/** Fixed left gate (layout px) — same for every card. */
const DECK_SPAWN_LEFT_PX = -DECK_CARD_W - 20
/** Fixed row heights (fraction of lane) — cycles for a conveyor, not random Y. */
const DECK_LANE_SLOT_FRACS = [0.17, 0.34, 0.51, 0.68] as const

/** Lane's own right inset from the strip edge (Tailwind right-2 = 0.5 rem = 8 px).
 *  The strip right edge == the violet rail at `DESKTOP_RAIL_LEFT_PCT`% of 1200 px. */
/** Strip padding: lane `right-2` (Tailwind) — distance from lane inner edge to strip / rail edge. */
const LANE_R_INSET_PX = 8
/** Horizontal travel must be at least this wide so opacity keyframes stay sane. */
const DECK_MIN_TRAVEL_X = 120
/** Fade starts when the card's right edge is this far before the rail (smooth portal). */
const DECK_FADE_BEFORE_RAIL_PX = 48
/** Fade completes when the right edge is this far past the rail. */
const DECK_FADE_AFTER_RAIL_PX = 32
const defaultDeckGeo: DeckGeo = { laneW: DESKTOP_FLOW_STRIP_W_PX, laneH: DESKTOP_DIAGRAM_H }


// ─── Flight card ──────────────────────────────────────────────────────────────

type DeckFlight = {
  id: number
  cardIndex: number
  geo: DeckGeo
  spawnLeft: number
  spawnTop: number
}

function deckOpacityTimes(spawnLeft: number, endLeft: number, railX: number): number[] {
  const dist = endLeft - spawnLeft
  if (dist < DECK_MIN_TRAVEL_X) return [0, 0.06, 0.55, 0.72, 1]
  /* Fade at the rail boundary so anything after the line is not visible. */
  let uFadeStart = (railX - DECK_FADE_BEFORE_RAIL_PX - spawnLeft) / dist
  let uFadeEnd = (railX + DECK_FADE_AFTER_RAIL_PX - spawnLeft) / dist
  uFadeStart = Math.min(0.9, Math.max(0.08, uFadeStart))
  uFadeEnd = Math.min(0.995, Math.max(uFadeStart + 0.08, uFadeEnd))
  return [0, 0.04, uFadeStart, uFadeEnd, 1]
}

function DeckFlightInstance({
  flight,
  row,
  onDone,
}: {
  flight: DeckFlight
  row: (typeof FLOW_CARDS)[number]
  onDone: () => void
}) {
  const { geo, spawnLeft, spawnTop } = flight
  const { laneW, laneH } = geo
  const d = DECK_FLIGHT_MS / 1000

  /** Strip right / violet rail / Notes9 centerline in lane-local X (matches `left-3` + `right-2` lane). */
  const railX = laneW + LANE_R_INSET_PX
  /** Continue travel, but flow strip clips at rail so post-rail content is not visible. */
  const endLeft = railX + DECK_CARD_W + 32
  /** Strong bend into the center of the Notes9 rail. */
  const centerTop = Math.min(Math.max(8, laneH / 2 - DECK_CARD_H / 2), Math.max(8, laneH - DECK_CARD_H - 8))
  const earlyBendTop = spawnTop + (centerTop - spawnTop) * 0.46
  const bendStartLeft = railX - Math.round(DECK_CARD_W * 1.2)
  const nearRailLeft = railX - Math.round(DECK_CARD_W * 0.44)
  const opacityTimes = deckOpacityTimes(spawnLeft, endLeft, railX)
  const moveTimes = [0, 0.34, 0.8, 1]

  return (
    <motion.div
      className="pointer-events-none absolute z-[10] flex w-[196px] min-h-[230px] flex-col overflow-hidden rounded-2xl border border-black/[0.08] bg-white shadow-[0_10px_36px_-12px_rgba(20,18,16,0.2)] will-change-[left,top,opacity] dark:border-white/[0.11] dark:bg-[#222024] dark:shadow-[0_12px_40px_-12px_rgba(0,0,0,0.65)]"
      initial={{ left: spawnLeft, top: spawnTop, opacity: 0, scale: 0.97, rotate: 0 }}
      animate={{
        left: [spawnLeft, bendStartLeft, nearRailLeft, endLeft],
        top: [spawnTop, earlyBendTop, centerTop, centerTop],
        scale: 1,
        rotate: 0,
        opacity: [0, 1, 1, 1, 1],
      }}
      transition={{
        left:    { duration: d, times: moveTimes, ease: [0.2, 0.08, 0.2, 1] },
        top:     { duration: d, times: moveTimes, ease: [0.18, 0.04, 0.16, 1] },
        scale:   { duration: d * 0.28, ease: "easeOut" },
        opacity: { duration: d, times: opacityTimes, ease: "easeInOut" },
      }}
      onAnimationComplete={onDone}
    >
      <div className="h-[4px] w-full shrink-0" style={{ backgroundColor: row.accent }} />
      <div className="flex flex-1 flex-col px-4 pb-5 pt-3.5">
        <p
          className="mb-3 text-[15px] font-bold uppercase leading-snug tracking-[0.18em]"
          style={{ color: row.accent }}
        >
          {row.label}
        </p>
        <CardSkeleton cardKey={row.key} />
      </div>
    </motion.div>
  )
}

// ─── Pipeline ─────────────────────────────────────────────────────────────────

function MarketingDeckPipeline({
  reduceMotion,
  stripInView,
  flowDeckCardRef,
  laneRef,

}: {
  reduceMotion: boolean
  stripInView: boolean
  flowDeckCardRef: RefObject<HTMLDivElement | null>
  laneRef: RefObject<HTMLDivElement | null>
}) {
  const [geo, setGeo] = useState<DeckGeo>(defaultDeckGeo)
  const geoRef = useRef(geo)
  geoRef.current = geo

  const [flights, setFlights] = useState<DeckFlight[]>([])

  const cardIdxRef = useRef(0)
  const nextIdRef = useRef(1)

  useLayoutEffect(() => {
    const el = laneRef.current
    if (!el) return
    // Use offsetWidth/offsetHeight (layout dimensions, unaffected by CSS
    // transform) so that endLeft/endTop values are in the same unscaled
    // coordinate space as the CSS `left`/`top` props on animated children.
    const apply = () => {
      setGeo({ laneW: Math.max(200, el.offsetWidth), laneH: Math.max(300, el.offsetHeight) })
    }
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(el)
    return () => ro.disconnect()
  }, [laneRef])

  useEffect(() => {
    if (!stripInView) {
      cardIdxRef.current = 0
    }
  }, [stripInView])

  useEffect(() => {
    if (reduceMotion || !stripInView) {
      setFlights([])
      return
    }
    // ⅓ stagger → 3 cards always in flight simultaneously
    const interval = DECK_FLIGHT_MS * (1 / 3)

    const spawn = () => {
      const id = nextIdRef.current++
      const deckIdx = cardIdxRef.current
      const cardIndex = deckIdx % FLOW_CARDS.length
      const slot = deckIdx % DECK_LANE_SLOT_FRACS.length
      cardIdxRef.current++
      const geo = geoRef.current

      const { laneW, laneH } = geo
      const railX = laneW + LANE_R_INSET_PX
      const endLeft = railX - DECK_CARD_W / 2
      const spawnLeft = DECK_SPAWN_LEFT_PX
      const frac = DECK_LANE_SLOT_FRACS[slot]!
      const hh = DECK_CARD_H / 2
      let spawnTop = laneH * frac - hh
      spawnTop = Math.min(Math.max(8, spawnTop), Math.max(8, laneH - DECK_CARD_H - 8))

      if (endLeft - spawnLeft < DECK_MIN_TRAVEL_X) return

      setFlights((prev) => [
        ...prev.slice(-8),
        { id, cardIndex, geo: { ...geo }, spawnLeft, spawnTop },
      ])
    }

    spawn()
    const iv = window.setInterval(spawn, interval)
    return () => window.clearInterval(iv)
  }, [reduceMotion, stripInView])

  const removeFlight = useCallback((id: number) => {
    setFlights((prev) => prev.filter((f) => f.id !== id))
  }, [])

  const row0 = FLOW_CARDS[0]!

  return (
    <div ref={laneRef} className="absolute inset-y-2 left-3 right-2 overflow-visible">
      {/* Hidden sizer so violetRailPx ResizeObserver has a real element */}
      <div
        ref={flowDeckCardRef}
        className="pointer-events-none invisible absolute left-1/2 top-1/2 w-[196px] min-h-[230px] -translate-x-1/2 -translate-y-1/2"
        aria-hidden
      />

      {reduceMotion ? (
        <div
          className="pointer-events-none absolute z-[1] flex w-[196px] min-h-[230px] flex-col overflow-hidden rounded-2xl border border-black/[0.08] bg-white shadow-[0_10px_36px_-12px_rgba(20,16,12,0.2)] dark:border-white/[0.11] dark:bg-[#222024] dark:shadow-[0_12px_40px_-12px_rgba(0,0,0,0.65)]"
          style={{
            left: Math.max(
              12,
              Math.min(geo.laneW + LANE_R_INSET_PX - DECK_CARD_W / 2, geo.laneW - DECK_CARD_W - 8),
            ),
            top: Math.max(8, geo.laneH * DECK_LANE_SLOT_FRACS[0]! - DECK_CARD_H / 2),
          }}
        >
          <div className="h-[4px] w-full shrink-0" style={{ backgroundColor: row0.accent }} />
          <div className="flex flex-1 flex-col px-4 pb-5 pt-3.5">
            <p className="mb-3 text-[15px] font-bold uppercase leading-snug tracking-[0.18em]" style={{ color: row0.accent }}>
              {row0.label}
            </p>
            <CardSkeleton cardKey={row0.key} />
          </div>
        </div>
      ) : (
        <>
          {flights.map((f) => (
            <DeckFlightInstance
              key={f.id}
              flight={f}
              row={FLOW_CARDS[f.cardIndex]!}
              onDone={() => removeFlight(f.id)}
            />
          ))}
        </>
      )}
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
  const flowMarkerId = useId().replace(/:/g, "")
  const wrapRef = useRef<HTMLDivElement>(null)
  const catRef = useRef<HTMLDivElement>(null)
  const n9Ref = useRef<HTMLDivElement>(null)
  /** First marquee card (left strip) — rail height = 140% of this */
  const flowDeckCardRef = useRef<HTMLDivElement>(null)
  const rightPanelRef = useRef<HTMLDivElement>(null)
  const chipRefs = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)]
  const rafRef = useRef(0)
  const playingRef = useRef(false)
  const t0Ref = useRef(0)
  const chipShownRef = useRef([false, false, false, false, false, false])
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
  const [wrapWidth, setWrapWidth] = useState(720)
  const hubContainerRef = useRef<HTMLDivElement>(null)
  const [hubSize, setHubSize] = useState(640)

  const deckLaneRef = useRef<HTMLDivElement>(null)
  /** Whole diagram wrapper — avoids false negatives when the flow strip alone barely intersects the viewport. */
  const stripInView = useInView(wrapRef, { once: false, margin: "100px" })


  /** Violet rail height increased by 50% for stronger vertical emphasis. */
  const [violetRailPx, setVioletRailPx] = useState(Math.round(230 * 1.4 * 2 * 1.5))
  const [connInfo, setConnInfo] = useState<{
    svgW: number
    svgH: number
    catX: number
    catY: number
    catR: number
    chips: { sx: number; sy: number; cx: number; cy: number }[]
  }>({ svgW: 0, svgH: 0, catX: 0, catY: 0, catR: 50, chips: [] })

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    const apply = () => setReduceMotion(mq.matches)
    apply()
    mq.addEventListener("change", apply)
    return () => mq.removeEventListener("change", apply)
  }, [])

  useLayoutEffect(() => {
    const el = flowDeckCardRef.current
    if (!el) return
    const measure = () => {
      const h = el.getBoundingClientRect().height
      if (h > 0) setVioletRailPx(Math.max(128, Math.round(h * 1.4 * 2 * 1.5)))
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
    /**
     * Hub lives under `transform: scale(desktopFitScale)`. getBoundingClientRect is in
     * viewport pixels; the SVG uses layout width/height (inset-0) = pre-transform CSS px.
     * Without dividing by scale, viewBox coords don't match the painted box — strokes clip
     * oddly and markerEnd triangles look "random" vs the cards.
     */
    const svgW = Math.max(1, panel.offsetWidth)
    const svgH = Math.max(1, panel.offsetHeight)
    const pr = panel.getBoundingClientRect()
    const sx = pr.width / svgW
    const sy = pr.height / svgH
    const cr = cat.getBoundingClientRect()
    const catX = (cr.left - pr.left + cr.width / 2) / sx
    const catY = (cr.top - pr.top + cr.height / 2) / sy
    const catR = Math.max(40, Math.min(cr.width / sx, cr.height / sy) * 0.5)
    setConnInfo({
      svgW,
      svgH,
      catX,
      catY,
      catR,
      chips: chipRefs.map((ref) => {
        const el = ref.current
        if (!el) return { sx: 0, sy: 0, cx: 0, cy: 0 }
        const r = el.getBoundingClientRect()
        const L = (r.left - pr.left) / sx
        const T = (r.top - pr.top) / sy
        const W = r.width / sx
        const H = r.height / sy
        const cx = L + W / 2
        const cy = T + H / 2
        const edge = rectExitTowardCat(L, T, W, H, catX, catY)
        return { sx: edge.x, sy: edge.y, cx, cy }
      }),
    })
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

    schedule(() => setPhase((p) => ({ ...p, n9: true })), 550, gen)
    schedule(() => setPhase((p) => ({ ...p, cat: true })), 1100, gen)

    function tick(now: number) {
      if (playGenRef.current !== gen) return
      const w = wrapRef.current
      if (!w) {
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

      CHIP_T.forEach((t, i) => {
        if (!chipShownRef.current[i] && raw > t) {
          chipShownRef.current[i] = true
          setPhase((p) => {
            const chips = [...p.chips]
            chips[i] = true
            return { ...p, chips }
          })
        }
      })

      if (raw >= 1) {
        playingRef.current = false
        return
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
  }, [reduceMotion, reset, schedule])

  useEffect(() => {
    const ro = new ResizeObserver(() => {
      const w = wrapRef.current
      if (!w) return
      setWrapWidth(w.offsetWidth)
    })
    if (wrapRef.current) {
      ro.observe(wrapRef.current)
      setWrapWidth(wrapRef.current.offsetWidth)
    }
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const el = hubContainerRef.current
    if (!el) return
    const update = () => {
      const s = el.getBoundingClientRect().width
      if (s > 0) setHubSize(s)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
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

  useEffect(() => {
    if (!phase.chips.some(Boolean) && !phase.cat) return
    const t = window.setTimeout(updateConnections, 120)
    return () => window.clearTimeout(t)
  }, [phase.chips, phase.cat, updateConnections, wrapWidth, hubSize])

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
    { label: "Analysis", tone: "o2", skeletonKey: "analysis" },
    { label: "Literature", tone: "o3", skeletonKey: "literature" },
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

  const isMobile = wrapWidth > 0 && wrapWidth < 580
  const mobileSourceCards = FLOW_CARDS.filter((card) =>
    MOBILE_SOURCE_KEYS.includes(card.key as (typeof MOBILE_SOURCE_KEYS)[number]),
  )

  const desktopFitScale = useMemo(() => {
    if (wrapWidth <= 0 || wrapWidth < 580) return 1
    return Math.min(1.35, wrapWidth / DESKTOP_DIAGRAM_W)
  }, [wrapWidth])

  const desktopLayoutW = Math.round(DESKTOP_DIAGRAM_W * desktopFitScale)
  const desktopLayoutH = Math.round(DESKTOP_DIAGRAM_H * desktopFitScale)

  /**
   * Orbital radius: six chips at 60° need chord ≥ chip width (chord ≈ R at 60°).
   */
  const maxRInsideHub = Math.max(
    Math.round(100 * HUB_ORBIT_SCALE),
    Math.round(hubSize / 2 - Math.round(56 / HUB_ORBIT_SCALE)),
  )
  let dynChipW = Math.max(90, Math.min(116, Math.round(hubSize * 0.29)))
  let minNeed = Math.ceil(dynChipW + HUB_CHORD_EXTRA)
  while (minNeed > maxRInsideHub && dynChipW > 84) {
    dynChipW -= 2
    minNeed = Math.ceil(dynChipW + HUB_CHORD_EXTRA)
  }
  const dynOrbitR = Math.max(
    HUB_ORBIT_R_FLOOR,
    Math.min(HUB_ORBIT_RADIUS_PX, maxRInsideHub, Math.max(minNeed, HUB_ORBIT_R_FLOOR)),
  )

  const hubChipCard = (c: (typeof chipMeta)[number], compact = false) => (
    <div
      className={`flex w-full min-w-0 flex-col rounded-xl border px-2 pb-2 pt-1.5 shadow-[0_8px_28px_-14px_rgba(20,18,16,0.12)] backdrop-blur-[2px] dark:shadow-[0_12px_36px_-16px_rgba(0,0,0,0.45)] ${chipTone(c.tone)} ${compact ? "min-h-[82px]" : "min-h-[96px]"}`}
    >
      <p className={`shrink-0 text-center font-semibold leading-snug ${compact ? "text-[14px]" : dynChipW < 120 ? "text-[15px]" : "text-[16px] sm:text-[20px]"}`}>{c.label}</p>
      <div className={`mt-1.5 flex flex-1 flex-col px-0.5 ${compact ? "min-h-[3.5rem]" : "min-h-[4rem]"}`}>
        <OrbitalChipSkeleton cardKey={c.skeletonKey} />
      </div>
    </div>
  )

  const n9StatusNode = (id?: string) => (
    <div
      id={id}
      ref={n9Ref}
      className="pointer-events-auto rounded-xl border border-black/[0.09] bg-white/95 px-3.5 py-3 text-center shadow-[0_12px_40px_-12px_rgba(20,16,12,0.25)] backdrop-blur-sm dark:border-white/[0.12] dark:bg-[#1e1d20]/95 dark:shadow-[0_16px_44px_-12px_rgba(0,0,0,0.7)]"
    >
      <p className="text-[20px] font-semibold tracking-tight text-[#12100e] dark:text-white/95">Notes9</p>
      <div className={`mt-2 flex items-center justify-center gap-1.5 transition-opacity duration-[280ms] ${phase.n9 ? (statusFade ? "opacity-100" : "opacity-0") : "opacity-0"}`}>
        <span className={`h-[6px] w-[6px] shrink-0 rounded-full ${n9Status === "connected" ? "bg-emerald-500" : n9Status === "processing" ? "bg-violet-500" : "bg-amber-400"}`} />
        <span className={`text-[12px] font-semibold uppercase tracking-[0.18em] ${n9Status === "connected" ? "text-emerald-600 dark:text-emerald-400" : n9Status === "processing" ? "text-violet-500 dark:text-violet-400" : "text-amber-600 dark:text-amber-400"}`}>{n9Status}</span>
      </div>
    </div>
  )

  return (
    <div
      ref={wrapRef}
      className={`relative mx-auto w-full min-w-0 max-w-[min(100%,88rem)] rounded-[28px] border border-[var(--n9-accent)]/18 bg-[radial-gradient(circle,rgba(0,0,0,0.055)_1px,transparent_1px)] [background-size:20px_20px] shadow-[0_28px_90px_-52px_rgba(44,36,24,0.2),inset_0_1px_0_0_rgba(255,255,255,0.55)] ring-1 ring-black/[0.04] dark:border-[var(--n9-accent)]/16 dark:bg-[radial-gradient(circle,rgba(255,255,255,0.055)_1px,transparent_1px),linear-gradient(180deg,rgba(26,24,22,0.98),rgba(12,12,14,0.995))] dark:[background-size:20px_20px,auto] dark:shadow-[0_32px_100px_-52px_rgba(0,0,0,0.65),inset_0_1px_0_0_rgba(255,255,255,0.04)] dark:ring-white/[0.06] ${isMobile ? "min-h-[520px]" : "min-h-0"} ${className}`}
      style={!isMobile ? { height: `${desktopLayoutH}px` } : undefined}
    >
      {isMobile ? (
        /* ── Mobile: preserve the connection story as a vertical flow ── */
        <div className="relative z-[5] flex h-full flex-col px-3 pb-5 pt-4" aria-labelledby="n9-diagram-mobile-title">
          <div className="pb-4 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--n9-accent)]">
              Research context flowing together
            </p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Literature, protocols, experiments, and notes converge before Catalyst helps move the work forward.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {mobileSourceCards.map((card, index) => (
              <div
                key={card.key}
                className={`rounded-2xl border border-black/[0.08] bg-white/92 px-3 py-2.5 shadow-[0_12px_32px_-18px_rgba(20,16,12,0.2)] backdrop-blur-sm transition-all duration-300 dark:border-white/[0.1] dark:bg-[#1e1d20]/92 dark:shadow-[0_14px_32px_-18px_rgba(0,0,0,0.45)] ${
                  phase.cat || phase.n9 ? "translate-y-0 opacity-100" : "translate-y-1 opacity-75"
                }`}
                style={{ transitionDelay: `${index * 90}ms` }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: card.accent }}
                    aria-hidden
                  />
                  <p className="text-[13px] font-semibold tracking-tight text-[#12100e] dark:text-white/95">
                    {card.label}
                  </p>
                </div>
                <div className="mt-2 space-y-1.5 opacity-80">
                  <CardSkeleton cardKey={card.key} />
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col items-center py-3" aria-hidden>
            <div className="h-6 w-px bg-[linear-gradient(180deg,rgba(139,92,246,0.14),rgba(139,92,246,0.45))]" />
            <div className="h-2 w-2 rounded-full bg-violet-400/55 shadow-[0_0_16px_rgba(139,92,246,0.35)]" />
          </div>

          <div className="flex flex-col items-center gap-3">
            {n9StatusNode("n9-diagram-mobile-title")}

            <div className="flex flex-col items-center" aria-hidden>
              <div className="h-8 w-px bg-[linear-gradient(180deg,rgba(139,92,246,0.58),rgba(139,92,246,0.16))]" />
              <div className="h-2.5 w-2.5 rounded-full bg-violet-500/60 shadow-[0_0_18px_rgba(139,92,246,0.35)]" />
            </div>

            <div ref={catRef} className={`flex flex-col items-center gap-1.5 transition-all duration-300 ${phase.cat ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}>
              <CatalystGrainBackdrop active={phase.cat} reduceMotion={reduceMotion} className="h-16 w-16">
                <IceMascot className="hero-pendulum h-full w-full" options={{ src: "/notes9-mascot-ui.png" }} aria-hidden />
              </CatalystGrainBackdrop>
              <p className="text-center text-[15px] font-semibold uppercase tracking-[0.14em] text-[var(--n9-accent)]">Catalyst AI</p>
              <p className="max-w-[16rem] text-center text-[12px] leading-5 text-muted-foreground">
                Grounds answers in connected research context instead of isolated files.
              </p>
            </div>

            <div className="flex flex-col items-center" aria-hidden>
              <div className="h-7 w-px bg-[linear-gradient(180deg,rgba(139,92,246,0.58),rgba(139,92,246,0.16))]" />
              <div className="h-2.5 w-2.5 rounded-full bg-violet-500/60 shadow-[0_0_18px_rgba(139,92,246,0.35)]" />
            </div>

            <div className="rounded-xl border border-black/[0.08] bg-white/90 px-3 py-2.5 text-center backdrop-blur-sm dark:border-white/[0.1] dark:bg-[#1e1d20]/90">
              <p className="text-[18px] font-semibold tracking-tight text-[#12100e] dark:text-white/95">Research workflow</p>
              <p className="mt-0.5 text-[13px] font-medium text-muted-foreground">
                Connected outputs across the workspace
              </p>
            </div>
          </div>

          <div className="mt-4 grid flex-1 grid-cols-2 gap-2.5">
            {chipMeta.map((c, i) => (
              <div
                key={c.label}
                ref={chipRefs[i]}
                className={`transition-all duration-300 ${phase.chips[i] ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}
                style={{ transitionDelay: `${i * 90}ms` }}
              >
                {hubChipCard(c, true)}
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* ── Desktop: flying deck + orbital hub (fixed design size, scaled to parent width) ── */
        <div
          className="relative z-[5] flex w-full items-center justify-center overflow-hidden"
          style={{ height: `${desktopLayoutH}px` }}
          aria-labelledby="n9-marketing-diagram-title"
        >
          <div
            className="relative shrink-0 overflow-hidden"
            style={{
              width: desktopLayoutW,
              height: desktopLayoutH,
            }}
          >
            <div
              className="absolute left-0 top-0"
              style={{
                width: DESKTOP_DIAGRAM_W,
                height: DESKTOP_DIAGRAM_H,
                transform: `scale(${desktopFitScale})`,
                transformOrigin: "top left",
              }}
            >
            <div className="relative h-full w-full">
          <div
            ref={rightPanelRef}
            className="n9-marketing-hub-panel absolute bottom-0 right-0 top-0 z-[5] flex min-h-0 flex-col overflow-hidden px-[3%] pb-6 pt-4 sm:px-[4%] lg:px-[5%]"
            style={{ left: `${DESKTOP_RAIL_LEFT_PCT}%` }}
          >

            {/* Each workflow card → Catalyst (stroke + arrow match chip accent) */}
            {connInfo.svgW > 0 && (
              <svg
                id="n9-conn-svg"
                className="pointer-events-none absolute inset-0 z-[7]"
                style={{ overflow: "visible" }}
                width={connInfo.svgW}
                height={connInfo.svgH}
                viewBox={`0 0 ${connInfo.svgW} ${connInfo.svgH}`}
                aria-hidden
              >
                <defs>
                  {CHIP_COLS.map((col, mi) => (
                    <marker
                      key={mi}
                      id={`${flowMarkerId}-n9-chip-to-cat-${mi}`}
                      markerWidth="11"
                      markerHeight="11"
                      refX="9.5"
                      refY="5.5"
                      orient="auto"
                      markerUnits="userSpaceOnUse"
                    >
                      <path
                        d="M0.5,1 L9.5,5.5 L0.5,10 Z"
                        fill={col}
                        fillOpacity={1}
                        stroke={col}
                        strokeOpacity={0.35}
                        strokeWidth={0.5}
                      />
                    </marker>
                  ))}
                </defs>
                {connInfo.chips.map((chip, i) => {
                  if (!phase.chips[i] || (!chip.cx && !chip.cy)) return null
                  const sx = chip.sx
                  const sy = chip.sy
                  const tcx = connInfo.catX
                  const tcy = connInfo.catY
                  const dx = tcx - sx
                  const dy = tcy - sy
                  const len = Math.hypot(dx, dy)
                  if (len < 2) return null
                  const ux = dx / len
                  const uy = dy / len
                  /* Same clearance as notes9-diagram.html: max(catR, 44) + 26 toward Catalyst */
                  const hubClear = Math.max(connInfo.catR, 44) + 26
                  const ex = tcx - ux * hubClear
                  const ey = tcy - uy * hubClear
                  const col = CHIP_COLS[i] ?? "#8b6fd6"
                  return (
                    <path
                      key={i}
                      d={`M ${sx} ${sy} L ${ex} ${ey}`}
                      stroke={col}
                      strokeWidth={2}
                      strokeOpacity={0.85}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                      strokeDasharray="5 7"
                      strokeDashoffset={0}
                      markerEnd={`url(#${flowMarkerId}-n9-chip-to-cat-${i})`}
                      className={reduceMotion ? "" : "n9-hub-dash-flow"}
                      style={{ animationDelay: `${i * 0.12}s` }}
                    />
                  )
                })}
              </svg>
            )}

            <div className="relative z-[6] mx-auto flex min-h-0 w-full flex-1 items-center justify-center py-3 sm:py-5">
              <div
                ref={hubContainerRef}
                className="n9-marketing-hub-geometry relative aspect-square w-full max-w-[min(100%,1344px)] min-w-0 shrink-0 sm:max-w-[min(100%,1512px)]"
              >
                <div
                  ref={catRef}
                  className={`absolute left-1/2 top-1/2 z-[9] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-2 py-1 transition-opacity duration-300 ${phase.cat ? "opacity-100" : "opacity-0"}`}
                >
                  <CatalystGrainBackdrop
                    active={phase.cat}
                    reduceMotion={reduceMotion}
                    className="mx-auto h-16 w-16 sm:h-[4.5rem] sm:w-[4.5rem]"
                  >
                    <IceMascot
                      className="hero-pendulum h-full w-full"
                      options={{ src: "/notes9-mascot-ui.png" }}
                      aria-hidden
                    />
                  </CatalystGrainBackdrop>
                  <p className="text-center text-[16px] font-semibold uppercase tracking-[0.14em] text-[var(--n9-accent)] sm:text-[14px]">
                    Catalyst AI
                  </p>
                </div>
                {chipMeta.map((c, i) => (
                  <div
                    key={c.label}
                    ref={chipRefs[i]}
                    className={`absolute left-1/2 top-1/2 z-[10] min-w-[108px] transition-opacity duration-300 ease-out ${
                      phase.chips[i] ? "opacity-100" : "pointer-events-none opacity-0"
                    }`}
                    style={{
                      width: `${dynChipW}px`,
                      maxWidth: `${dynChipW}px`,
                      transform: `translate(-50%, -50%) rotate(${-90 + i * 60}deg) translateY(-${dynOrbitR}px) rotate(${90 - i * 60}deg)`,
                    }}
                  >
                    {hubChipCard(c)}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Deck: fixed left gate → rail (z-9); cards use z-10 inside lane */}
          <div
            className="n9-marketing-flow-strip pointer-events-none absolute inset-y-0 left-0 z-[9] overflow-hidden"
            style={{ width: `${DESKTOP_RAIL_LEFT_PCT}%` }}
            aria-hidden
          >
            <MarketingDeckPipeline
              reduceMotion={reduceMotion}
              stripInView={stripInView}
              flowDeckCardRef={flowDeckCardRef}
              laneRef={deckLaneRef}
            />
          </div>

          {/* Violet rail — above deck, below Notes9 */}
          <div
            className="pointer-events-none absolute bottom-0 top-0 z-[13] w-0 -translate-x-1/2"
            style={{ left: `${DESKTOP_RAIL_LEFT_PCT}%` }}
            aria-hidden
          >
            <div
              className="absolute left-1/2 top-1/2 w-0 -translate-x-1/2 -translate-y-1/2"
              style={{ height: violetRailPx }}
            >
              {/* Feather uses same height as rail for exact length match. */}
              <div
                className="pointer-events-none absolute inset-y-0 left-1/2 w-[26px] -translate-x-full"
                style={{
                  background:
                    "linear-gradient(90deg, rgba(139,92,246,0) 0%, rgba(139,92,246,0.08) 62%, rgba(139,92,246,0.2) 100%)",
                }}
              />
              <div className="pointer-events-none absolute inset-y-0 left-1/2 w-[1.5px] -translate-x-1/2 rounded-full bg-violet-500/45 shadow-[0_0_12px_rgba(139,92,246,0.35)] dark:bg-violet-400/50 dark:shadow-[0_0_14px_rgba(167,139,250,0.25)]" />
            </div>
          </div>

          {/* Notes9 above flying cards and the rail line */}
          <div className="pointer-events-none absolute bottom-0 top-0 z-[15] w-0 -translate-x-1/2" style={{ left: `${DESKTOP_RAIL_LEFT_PCT}%` }}>
            <div
              id="n9-marketing-diagram-title"
              ref={n9Ref}
              className="pointer-events-auto absolute left-1/2 top-1/2 z-[1] min-w-[7.5rem] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-black/[0.09] bg-white/95 px-3.5 py-3 text-center shadow-[0_12px_40px_-12px_rgba(20,16,12,0.25)] backdrop-blur-sm dark:border-white/[0.12] dark:bg-[#1e1d20]/95 dark:shadow-[0_16px_44px_-12px_rgba(0,0,0,0.7)]"
            >
              <p className="text-[20px] font-semibold tracking-tight text-[#12100e] dark:text-white/95">
                Notes9
              </p>
              <div
                className={`mt-2 flex items-center justify-center gap-1.5 transition-opacity duration-[280ms] ${
                  phase.n9 && statusFade ? "opacity-100" : "opacity-0"
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
                  className={`text-[12px] font-semibold uppercase tracking-[0.18em] ${
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
            </div>
          </div>
        </div>
        </div>
      )}
    </div>
  )
}
