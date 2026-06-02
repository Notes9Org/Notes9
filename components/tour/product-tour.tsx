"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowLeft, ArrowRight, MousePointerClick, X } from "lucide-react"
import { cn } from "@/lib/utils"

export type TourSide = "top" | "right" | "bottom" | "left" | "auto"

export type TourStep = {
  /** CSS selector for the element to highlight. Omit for a centered step. */
  target?: string
  title: string
  /** Plain text. Use `\n\n` to separate paragraphs. `**word**` renders bold. */
  body: string
  /** Preferred placement of the tooltip relative to the target. */
  side?: TourSide
  /** Fired right before the step is shown — e.g. to open a panel that contains
   *  the target. Runs even if the target is ultimately not found. */
  onBeforeStep?: () => void
  /** Invite the user to click the highlighted element themselves (adds a pulse
   *  ring + hint). */
  interactive?: boolean
  /** When interactive, clicking the highlighted element advances the tour. Use
   *  for nav links so the tour follows the user into the page. */
  advanceOnClick?: boolean
  /** Short call-to-action shown in the hint pill, e.g. "Click to open". */
  cta?: string
}

type Rect = { top: number; left: number; width: number; height: number }

const TIP_WIDTH = 372
const GAP = 16
const VIEWPORT_PAD = 16
const RESOLVE_TIMEOUT = 2600

/** First match that is actually rendered (handles duplicate ids / mobile+desktop
 *  copies of the same chrome where one copy is display:none). */
function firstVisible(selector: string): HTMLElement | null {
  const matches = Array.from(document.querySelectorAll<HTMLElement>(selector))
  return (
    matches.find((el) => {
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden"
    }) ?? null
  )
}

/** Poll for a visible element matching `selector`, or resolve null on timeout. */
function waitForElement(selector: string, timeoutMs: number, signal: { cancelled: boolean }) {
  return new Promise<HTMLElement | null>((resolve) => {
    const started = performance.now()
    const tick = () => {
      if (signal.cancelled) return resolve(null)
      const el = firstVisible(selector)
      if (el) return resolve(el)
      if (performance.now() - started >= timeoutMs) return resolve(null)
      requestAnimationFrame(tick)
    }
    tick()
  })
}

function rectOf(el: HTMLElement): Rect {
  const r = el.getBoundingClientRect()
  return { top: r.top, left: r.left, width: r.width, height: r.height }
}

/** Render `**bold**` segments; everything else stays plain text. */
function renderBody(text: string) {
  return text.split("\n\n").map((para, pi) => (
    <p key={pi} className={pi > 0 ? "mt-2" : undefined}>
      {para.split(/(\*\*[^*]+\*\*)/g).map((seg, si) =>
        seg.startsWith("**") && seg.endsWith("**") ? (
          <strong key={si} className="font-semibold text-foreground">
            {seg.slice(2, -2)}
          </strong>
        ) : (
          <span key={si}>{seg}</span>
        ),
      )}
    </p>
  ))
}

function computeTooltipPosition(
  rect: Rect | null,
  side: TourSide,
  tipW: number,
  tipH: number,
): { top: number; left: number } | null {
  if (typeof window === "undefined") return null
  const vw = window.innerWidth
  const vh = window.innerHeight
  if (!rect) return null // centered

  const order: TourSide[] =
    !side || side === "auto"
      ? ["right", "bottom", "left", "top"]
      : [side, "bottom", "right", "top", "left"]

  for (const s of order) {
    let top: number | null = null
    let left: number | null = null
    if (s === "right" && rect.left + rect.width + GAP + tipW <= vw - VIEWPORT_PAD) {
      left = rect.left + rect.width + GAP
      top = rect.top + rect.height / 2 - tipH / 2
    } else if (s === "left" && rect.left - GAP - tipW >= VIEWPORT_PAD) {
      left = rect.left - GAP - tipW
      top = rect.top + rect.height / 2 - tipH / 2
    } else if (s === "bottom" && rect.top + rect.height + GAP + tipH <= vh - VIEWPORT_PAD) {
      top = rect.top + rect.height + GAP
      left = rect.left + rect.width / 2 - tipW / 2
    } else if (s === "top" && rect.top - GAP - tipH >= VIEWPORT_PAD) {
      top = rect.top - GAP - tipH
      left = rect.left + rect.width / 2 - tipW / 2
    }
    if (top !== null && left !== null) {
      left = Math.min(Math.max(VIEWPORT_PAD, left), vw - tipW - VIEWPORT_PAD)
      top = Math.min(Math.max(VIEWPORT_PAD, top), vh - tipH - VIEWPORT_PAD)
      return { top, left }
    }
  }
  return null // nothing fits → fall back to centered
}

export function ProductTour({
  steps,
  onFinish,
  onSkip,
  skipLabel = "Skip tour",
  doneLabel = "Finish",
  mascotSrc = "/notes9-mascot-ui.png",
}: {
  steps: TourStep[]
  onFinish: () => void
  onSkip: () => void
  skipLabel?: string
  doneLabel?: string
  mascotSrc?: string
}) {
  const [mounted, setMounted] = useState(false)
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const [tipPos, setTipPos] = useState<{ top: number; left: number } | null>(null)
  const [ready, setReady] = useState(false)

  const dirRef = useRef(1)
  const elRef = useRef<HTMLElement | null>(null)
  const tipRef = useRef<HTMLDivElement | null>(null)

  // Keep latest callbacks without re-subscribing listeners.
  const finishRef = useRef(onFinish)
  const skipRef = useRef(onSkip)
  finishRef.current = onFinish
  skipRef.current = onSkip

  useEffect(() => setMounted(true), [])

  const step = steps[index]

  const advance = useCallback(() => {
    dirRef.current = 1
    // Decide outside any setState updater: calling finishRef (which setMode()s a
    // parent) from inside an updater runs during the render phase and triggers
    // React's "cannot update a component while rendering" warning.
    if (index >= steps.length - 1) {
      finishRef.current()
    } else {
      setIndex((i) => i + 1)
    }
  }, [index, steps.length])

  // Resolve the requested step: fire its hook, wait for the target, and skip in
  // the current direction if the target never appears. This prevents the old
  // "dark overlay on nothing" hang.
  useEffect(() => {
    if (!mounted) return
    const signal = { cancelled: false }

    const resolve = async () => {
      let i = index
      const dir = dirRef.current
      while (i >= 0 && i < steps.length) {
        const s = steps[i]
        s.onBeforeStep?.()
        if (!s.target) {
          elRef.current = null
          setReady(false)
          setRect(null)
          if (i !== index) {
            setIndex(i)
            return
          }
          setReady(true)
          return
        }
        const el = await waitForElement(s.target, RESOLVE_TIMEOUT, signal)
        if (signal.cancelled) return
        if (el) {
          el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" })
          await new Promise((r) => setTimeout(r, 300))
          if (signal.cancelled) return
          elRef.current = el
          setRect(rectOf(el))
          if (i !== index) {
            setIndex(i)
            return
          }
          setReady(true)
          return
        }
        console.warn(
          `product-tour: step ${i} target not found within ${RESOLVE_TIMEOUT}ms; skipping`,
          s.target,
        )
        i += dir // target missing → skip onward
      }
      if (dir > 0) finishRef.current()
      else {
        dirRef.current = 1
        setIndex(0)
      }
    }

    setReady(false)
    void resolve()
    return () => {
      signal.cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, mounted, steps])

  // Track the highlighted element through scroll/resize.
  useEffect(() => {
    if (!ready || !elRef.current) return
    const update = () => {
      if (elRef.current) setRect(rectOf(elRef.current))
    }
    window.addEventListener("scroll", update, true)
    window.addEventListener("resize", update)
    return () => {
      window.removeEventListener("scroll", update, true)
      window.removeEventListener("resize", update)
    }
  }, [ready, index])

  // Interactive steps: let the user click the highlighted element to advance,
  // so the tour follows them into the page they open.
  useEffect(() => {
    if (!ready) return
    const s = steps[index]
    const el = elRef.current
    if (!s?.interactive || !s.advanceOnClick || !el) return
    const onClick = () => {
      // Give the click's own handler (e.g. router navigation) a tick first.
      window.setTimeout(() => advance(), 60)
    }
    el.addEventListener("click", onClick, { once: true })
    return () => el.removeEventListener("click", onClick)
  }, [ready, index, steps, advance])

  // Position the tooltip once it (and the target) are measured.
  useLayoutEffect(() => {
    if (!ready) return
    const tip = tipRef.current
    const tipH = tip?.offsetHeight ?? 220
    const tipW = tip?.offsetWidth ?? TIP_WIDTH
    setTipPos(computeTooltipPosition(rect, step?.side ?? "auto", tipW, tipH))
  }, [ready, rect, index, step?.side])

  const goBack = useCallback(() => {
    dirRef.current = -1
    setIndex((i) => Math.max(0, i - 1))
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        skipRef.current()
      } else if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault()
        advance()
      } else if (e.key === "ArrowLeft") {
        e.preventDefault()
        goBack()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [advance, goBack])

  if (!mounted || steps.length === 0) return null

  const isLast = index >= steps.length - 1
  const centered = !rect || !tipPos
  const interactive = Boolean(step?.interactive && rect)

  return createPortal(
    // pointer-events-none on the container lets clicks reach the highlighted
    // element underneath; only the tooltip captures pointer events.
    <div
      className="pointer-events-none fixed inset-0 z-[9998]"
      aria-live="polite"
      role="dialog"
      aria-modal="false"
    >
      {/* Backdrop / spotlight */}
      {rect ? (
        <>
          <motion.div
            aria-hidden
            className="absolute rounded-xl"
            initial={false}
            animate={{
              top: rect.top - 6,
              left: rect.left - 6,
              width: rect.width + 12,
              height: rect.height + 12,
            }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            style={{
              boxShadow:
                "0 0 0 9999px rgba(24, 16, 12, 0.55), 0 0 0 2px var(--ring), 0 0 26px 4px rgba(150,80,52,0.45)",
            }}
          />
          {interactive && (
            <motion.div
              aria-hidden
              className="absolute rounded-xl ring-2 ring-primary"
              initial={false}
              animate={{
                top: rect.top - 6,
                left: rect.left - 6,
                width: rect.width + 12,
                height: rect.height + 12,
                opacity: [0.9, 0.25, 0.9],
                scale: [1, 1.04, 1],
              }}
              transition={{
                top: { type: "spring", stiffness: 320, damping: 32 },
                left: { type: "spring", stiffness: 320, damping: 32 },
                width: { type: "spring", stiffness: 320, damping: 32 },
                height: { type: "spring", stiffness: 320, damping: 32 },
                opacity: { duration: 1.6, repeat: Infinity, ease: "easeInOut" },
                scale: { duration: 1.6, repeat: Infinity, ease: "easeInOut" },
              }}
            />
          )}
        </>
      ) : (
        <div aria-hidden className="absolute inset-0 bg-[rgba(24,16,12,0.62)] backdrop-blur-[1px]" />
      )}

      {/* Tooltip card */}
      <AnimatePresence mode="wait">
        {ready && step && (
          <motion.div
            key={index}
            ref={tipRef}
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className={cn(
              "pointer-events-auto absolute w-[min(372px,calc(100vw-32px))] overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl",
              centered && "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
            )}
            style={centered ? undefined : { top: tipPos!.top, left: tipPos!.left }}
          >
            {/* Brand header strip */}
            <div className="flex items-center gap-3 bg-gradient-to-r from-[var(--n9-accent-light)] via-[var(--n9-accent-light)] to-transparent px-5 pt-4 pb-3">
              <img
                src={mascotSrc}
                alt=""
                aria-hidden
                className="tour-mascot-animate size-10 shrink-0 rounded-full object-contain"
              />
              <div className="min-w-0 flex-1">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-primary/70">
                  Step {index + 1} of {steps.length}
                </span>
                <h2 className="truncate text-base font-semibold leading-tight text-primary">
                  {step.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => skipRef.current()}
                aria-label="Close tour"
                className="-mr-1 shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 pb-1 pt-2 text-sm leading-relaxed text-muted-foreground">
              {renderBody(step.body)}
            </div>

            {/* Interactive hint */}
            {interactive && (
              <div className="mx-5 mb-1 mt-2 inline-flex items-center gap-1.5 rounded-lg bg-[var(--n9-accent-light)] px-2.5 py-1.5 text-xs font-medium text-primary">
                <MousePointerClick className="size-3.5" />
                {step.cta ?? "Click the highlighted area to try it"}
              </div>
            )}

            {/* Footer */}
            <div className="mt-2 flex items-center justify-between gap-3 border-t border-border/70 px-5 py-3">
              <div className="flex items-center gap-1.5">
                {steps.map((_, i) => (
                  <span
                    key={i}
                    className={cn(
                      "h-1.5 rounded-full transition-all",
                      i === index ? "w-4 bg-primary" : "w-1.5 bg-border",
                    )}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2">
                {index === 0 ? (
                  <button
                    type="button"
                    onClick={() => skipRef.current()}
                    className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {skipLabel}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={goBack}
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    <ArrowLeft className="size-3.5" />
                    Back
                  </button>
                )}
                <button
                  type="button"
                  onClick={advance}
                  className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
                >
                  {isLast ? doneLabel : "Next"}
                  {!isLast && <ArrowRight className="size-3.5" />}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body,
  )
}
