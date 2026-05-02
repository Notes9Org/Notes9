"use client"

import { useEffect, useMemo, useState } from "react"
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion"

import { cn } from "@/lib/utils"

const BLOB_COUNT = 26
/** Longer interval + slower tweens so the field feels calm, not frantic */
const TICK_MS = 19_000
const MOVE_DURATION = 5.4
const OPACITY_DURATION = 3.2

/** Deterministic PRNG for stable layouts per seed */
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type HeroBlob = {
  id: number
  left: number
  top: number
  size: number
  opacity: number
  /** Filled disc vs hollow ring (outline only) */
  variant: "fill" | "ring"
}

function generateBlobs(seed: number): HeroBlob[] {
  const rng = mulberry32(seed)
  return Array.from({ length: BLOB_COUNT }, (_, id) => ({
    id,
    left: rng() * 86 + 7,
    top: rng() * 86 + 7,
    size: 5 + rng() * 42,
    opacity: 0.035 + rng() * 0.14,
    variant: rng() > 0.48 ? "fill" : "ring",
  }))
}

const easeSoft = [0.25, 0.1, 0.25, 1] as const

/**
 * Ambient circles / “molecules” that drift slowly to new random positions.
 * Mix of filled discs and empty rings; no technical watermark text.
 */
export function HeroMoleculeField({ reduceMotion }: { reduceMotion: boolean }) {
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1_000_000_000))

  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)
  const parallaxX = useSpring(mouseX, { stiffness: 24, damping: 32, mass: 0.85 })
  const parallaxY = useSpring(mouseY, { stiffness: 24, damping: 32, mass: 0.85 })
  const parallaxTx = useTransform(parallaxX, [-1, 1], [-11, 11])
  const parallaxTy = useTransform(parallaxY, [-1, 1], [-8, 8])

  useEffect(() => {
    if (reduceMotion) return
    const id = window.setInterval(() => {
      setSeed((s) => s + 107)
    }, TICK_MS)
    return () => window.clearInterval(id)
  }, [reduceMotion])

  useEffect(() => {
    if (reduceMotion) return
    const onMove = (e: MouseEvent) => {
      mouseX.set((e.clientX / window.innerWidth - 0.5) * 2)
      mouseY.set((e.clientY / window.innerHeight - 0.5) * 2)
    }
    window.addEventListener("mousemove", onMove, { passive: true })
    return () => window.removeEventListener("mousemove", onMove)
  }, [reduceMotion, mouseX, mouseY])

  const blobs = useMemo(() => generateBlobs(seed), [seed])

  if (reduceMotion) {
    const staticBlobs = generateBlobs(42_424).slice(0, 10)
    return (
      <div
        className="pointer-events-none absolute inset-0 z-[1] overflow-hidden opacity-[0.28]"
        aria-hidden
      >
        {staticBlobs.map((b) => (
          <div
            key={b.id}
            className={cn(
              "absolute -translate-x-1/2 -translate-y-1/2 rounded-full",
              b.variant === "fill"
                ? "bg-[var(--n9-accent)] mix-blend-multiply dark:mix-blend-plus-lighter"
                : "box-border border-[1.5px] border-[var(--n9-accent)]/40 bg-transparent dark:border-[var(--n9-accent)]/35",
            )}
            style={{
              left: `${b.left}%`,
              top: `${b.top}%`,
              width: b.size,
              height: b.size,
              opacity: b.opacity * 0.45,
            }}
          />
        ))}
      </div>
    )
  }

  return (
    <motion.div
      className="pointer-events-none absolute inset-0 z-[1] overflow-hidden will-change-transform"
      style={{ x: parallaxTx, y: parallaxTy }}
      aria-hidden
    >
      {/* Large orbital rings — very slow drift, mild contrast */}
      <div className="absolute left-[8%] top-[22%] h-[min(48vmin,380px)] w-[min(48vmin,380px)] rounded-full border border-[var(--n9-accent)]/[0.042] opacity-45 animate-[drift_78s_ease-in-out_infinite]" />
      <div className="absolute bottom-[12%] right-[4%] h-[min(36vmin,280px)] w-[min(36vmin,280px)] rounded-full border border-[var(--n9-accent)]/[0.032] opacity-40 animate-[drift_92s_ease-in-out_infinite_reverse]" />
      <div className="absolute left-[55%] top-[8%] h-[min(28vmin,220px)] w-[min(28vmin,220px)] rounded-full border border-emerald-600/[0.07] opacity-38 animate-[drift_70s_ease-in-out_infinite_6s]" />

      {blobs.map((b) => (
        <motion.div
          key={b.id}
          className="absolute -translate-x-1/2 -translate-y-1/2"
          initial={false}
          animate={{
            left: `${b.left}%`,
            top: `${b.top}%`,
          }}
          transition={{
            duration: MOVE_DURATION,
            ease: easeSoft,
          }}
        >
          <motion.div
            className={cn(
              "box-border rounded-full",
              b.variant === "fill"
                ? "bg-[var(--n9-accent)] mix-blend-multiply shadow-[0_0_18px_-12px_var(--n9-accent-glow)] dark:mix-blend-plus-lighter dark:shadow-[0_0_22px_-12px_var(--n9-accent-glow)]"
                : "border-[1.5px] border-[var(--n9-accent)]/32 bg-transparent shadow-none dark:border-[var(--n9-accent)]/28",
            )}
            initial={false}
            animate={{
              width: b.size,
              height: b.size,
              opacity: b.variant === "ring" ? Math.min(b.opacity + 0.08, 0.38) : b.opacity,
            }}
            transition={{
              duration: MOVE_DURATION,
              ease: easeSoft,
              opacity: { duration: OPACITY_DURATION, ease: easeSoft },
            }}
          />
        </motion.div>
      ))}
    </motion.div>
  )
}
