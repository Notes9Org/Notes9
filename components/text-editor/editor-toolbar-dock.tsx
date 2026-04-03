"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { useMediaQuery } from "@/hooks/use-media-query"

const LEAVE_DELAY_MS = 280
const TOOLBAR_DOCK_POS_KEY = "notes9-tiptap-toolbar-dock-top"
const DEFAULT_TOP_PX = 12
const EDGE_GAP_PX = 12
const TOC_VIEWPORT_HEIGHT_RATIO = 0.7

export type EditorToolbarDockLauncherContext = { expanded: boolean }

export type EditorToolbarDockProps = {
  positionContainerRef: React.RefObject<HTMLDivElement | null>
  railRef: React.RefObject<HTMLDivElement | null>
  /** Keep formatting tools visible without hover (arrow-expanded strip). */
  toolsStripPinned?: boolean
  /** While a menu is open, keep the strip visible even if unpinned. */
  lockOpen?: boolean
  /** Reserve right-side lane (e.g. TOC width) so dock never overlaps it. */
  rightInsetPx?: number
  launcher:
    | React.ReactNode
    | ((ctx: EditorToolbarDockLauncherContext) => React.ReactNode)
  children: React.ReactNode
  className?: string
}

/**
 * Right-aligned compact dock: launcher stays on the right; tools expand to the **left**
 * in a single horizontal row (flex-row-reverse). Hover pen/tools control to reveal.
 */
export function EditorToolbarDock({
  positionContainerRef,
  railRef,
  toolsStripPinned = true,
  lockOpen = false,
  rightInsetPx = 308,
  launcher,
  children,
  className,
}: EditorToolbarDockProps) {
  const [toolsVisible, setToolsVisible] = useState(false)
  const [radixMenuOpen, setRadixMenuOpen] = useState(false)
  const [coarseExpanded, setCoarseExpanded] = useState(false)
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dockRootRef = useRef<HTMLDivElement>(null)
  const dragStateRef = useRef<{
    pointerId: number
    startY: number
    startTop: number
  } | null>(null)
  const coarsePointer = useMediaQuery("(pointer: coarse)")
  const [topPx, setTopPx] = useState(DEFAULT_TOP_PX)

  const clampTop = useCallback((nextTop: number) => {
    const container = positionContainerRef.current
    const dock = railRef.current
    if (!container || !dock) return Math.max(EDGE_GAP_PX, nextTop)
    const maxTop = Math.max(EDGE_GAP_PX, container.clientHeight - dock.offsetHeight - EDGE_GAP_PX)
    const clamped = Math.min(maxTop, Math.max(EDGE_GAP_PX, nextTop))

    // Keep toolbar above or below TOC (never vertically overlap the TOC band).
    const viewportBasedTocHeight =
      typeof window !== "undefined" ? Math.floor(window.innerHeight * TOC_VIEWPORT_HEIGHT_RATIO) : 0
    const tocHeight = Math.max(0, Math.min(container.clientHeight - 16, viewportBasedTocHeight))
    if (tocHeight <= 0) return clamped

    const tocTop = Math.floor((container.clientHeight - tocHeight) / 2)
    const tocBottom = tocTop + tocHeight
    const forbiddenStart = tocTop - dock.offsetHeight + EDGE_GAP_PX
    const forbiddenEnd = tocBottom - EDGE_GAP_PX
    if (forbiddenStart > forbiddenEnd) return clamped
    if (clamped < forbiddenStart || clamped > forbiddenEnd) return clamped

    const aboveCandidate = Math.max(EDGE_GAP_PX, forbiddenStart - 1)
    const belowCandidate = Math.min(maxTop, forbiddenEnd + 1)
    const aboveValid = aboveCandidate <= maxTop
    const belowValid = belowCandidate >= EDGE_GAP_PX
    if (!aboveValid && !belowValid) return clamped
    if (!aboveValid) return belowCandidate
    if (!belowValid) return aboveCandidate
    return Math.abs(clamped - aboveCandidate) <= Math.abs(clamped - belowCandidate) ? aboveCandidate : belowCandidate
  }, [positionContainerRef, railRef])

  useEffect(() => {
    if (typeof window === "undefined") return
    const raw = localStorage.getItem(TOOLBAR_DOCK_POS_KEY)
    if (!raw) return
    const n = Number(raw)
    if (!Number.isFinite(n)) return
    setTopPx(clampTop(n))
  }, [clampTop])

  useEffect(() => {
    const onResize = () => {
      setTopPx((prev) => clampTop(prev))
    }
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [clampTop])

  useEffect(() => {
    if (!toolsStripPinned) return
    setTopPx(EDGE_GAP_PX)
  }, [toolsStripPinned])

  const clearLeaveTimer = useCallback(() => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current)
      leaveTimerRef.current = null
    }
  }, [])

  const scanRadixOpen = useCallback(() => {
    const root = dockRootRef.current
    if (!root) {
      setRadixMenuOpen(false)
      return
    }
    const openTrigger =
      root.querySelector(
        '[data-slot="dropdown-menu-trigger"][data-state="open"], [data-slot="dropdown-menu-sub-trigger"][data-state="open"]',
      ) || root.querySelector('[data-slot="popover-trigger"][data-state="open"]')
    setRadixMenuOpen(!!openTrigger)
  }, [])

  useEffect(() => {
    const root = dockRootRef.current
    if (!root) return
    const mo = new MutationObserver(() => scanRadixOpen())
    mo.observe(root, {
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state", "aria-expanded"],
    })
    scanRadixOpen()
    return () => mo.disconnect()
  }, [scanRadixOpen])

  useEffect(() => {
    if (!coarsePointer || !coarseExpanded) return
    const onDown = (e: MouseEvent) => {
      const root = dockRootRef.current
      if (root && e.target instanceof Node && root.contains(e.target)) return
      setCoarseExpanded(false)
      setToolsVisible(false)
    }
    document.addEventListener("pointerdown", onDown, true)
    return () => document.removeEventListener("pointerdown", onDown, true)
  }, [coarsePointer, coarseExpanded])

  const tryShowToolsFromPointer = useCallback((target: EventTarget | null) => {
    if (!(target instanceof Element)) return
    const el = target as HTMLElement
    if (el.closest('[data-slot="toolbar-tools"]')) {
      setToolsVisible(true)
    }
  }, [])

  const onDockPointerOver = useCallback(
    (e: React.PointerEvent) => {
      clearLeaveTimer()
      tryShowToolsFromPointer(e.target)
    },
    [clearLeaveTimer, tryShowToolsFromPointer],
  )

  const radixMenuOpenDom = useCallback(() => {
    const root = dockRootRef.current
    if (!root) return false
    return !!(
      root.querySelector(
        '[data-slot="dropdown-menu-trigger"][data-state="open"], [data-slot="dropdown-menu-sub-trigger"][data-state="open"]',
      ) || root.querySelector('[data-slot="popover-trigger"][data-state="open"]')
    )
  }, [])

  const onDockLeave = useCallback(() => {
    clearLeaveTimer()
    leaveTimerRef.current = setTimeout(() => {
      leaveTimerRef.current = null
      if (lockOpen || toolsStripPinned || radixMenuOpenDom()) return
      setToolsVisible(false)
    }, LEAVE_DELAY_MS)
  }, [clearLeaveTimer, lockOpen, radixMenuOpenDom, toolsStripPinned])

  const expanded =
    lockOpen ||
    radixMenuOpen ||
    toolsStripPinned ||
    toolsVisible ||
    (coarsePointer && coarseExpanded)

  const onLauncherPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!toolsStripPinned && e.pointerType === "mouse" && e.button === 0) {
        const target = e.target as HTMLElement
        if (target.closest("[data-toolbar-drag-handle]")) {
          dragStateRef.current = {
            pointerId: e.pointerId,
            startY: e.clientY,
            startTop: topPx,
          }
          ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
          return
        }
      }
      if (!coarsePointer) return
      if (e.pointerType === "mouse") return
      const el = e.target as HTMLElement
      if (el.closest("[data-toolbar-strip-toggle]") || el.closest("[data-toolbar-expand-trigger]")) return
      setCoarseExpanded((v) => !v)
      setToolsVisible((v) => !v)
    },
    [coarsePointer, toolsStripPinned, topPx],
  )

  const onLauncherPointerMove = useCallback((e: React.PointerEvent) => {
    const drag = dragStateRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    e.preventDefault()
    const next = clampTop(drag.startTop + (e.clientY - drag.startY))
    setTopPx(next)
  }, [clampTop])

  const finishDrag = useCallback((pointerId: number) => {
    const drag = dragStateRef.current
    if (!drag || drag.pointerId !== pointerId) return
    dragStateRef.current = null
    if (typeof window !== "undefined") {
      localStorage.setItem(TOOLBAR_DOCK_POS_KEY, String(topPx))
    }
  }, [topPx])

  return (
    <div
      ref={positionContainerRef}
      className={cn(
        "pointer-events-none absolute inset-x-0 z-[85] flex justify-end",
        className,
      )}
      style={{ top: topPx, paddingRight: `${rightInsetPx}px` }}
    >
      <div ref={railRef} className="pointer-events-auto w-max max-w-[min(calc(100%-1.5rem),calc(100vw-2rem))]">
        <div
          ref={dockRootRef}
          className="pointer-events-auto"
          onPointerOver={onDockPointerOver}
          onPointerLeave={onDockLeave}
          onFocusCapture={(e) => {
            const t = e.target as HTMLElement
            if (
              t.closest("[data-toolbar-expand-trigger]") ||
              t.closest('[data-slot="toolbar-tools"]')
            ) {
              clearLeaveTimer()
              setToolsVisible(true)
            }
          }}
          onBlurCapture={(e) => {
            const root = dockRootRef.current
            if (root && e.relatedTarget instanceof Node && root.contains(e.relatedTarget)) return
            if (lockOpen || toolsStripPinned || radixMenuOpen) return
            clearLeaveTimer()
            leaveTimerRef.current = setTimeout(() => setToolsVisible(false), LEAVE_DELAY_MS)
          }}
        >
          <div
            className={cn(
              "box-content flex min-h-8 max-w-[min(calc(100vw-2rem),calc(100%-1.5rem))] origin-top-right scale-95 flex-row-reverse flex-nowrap items-center gap-x-0.5 gap-y-0 overflow-x-auto overflow-y-hidden rounded-md border border-border bg-muted/30 px-1.5 py-0.5 shadow-sm [scrollbar-width:thin] transition-[box-shadow,opacity,transform] duration-200 ease-out dark:border-border/80",
              expanded && "bg-background/95 shadow-md backdrop-blur-sm dark:bg-card/95",
            )}
          >
            <div
              className="group/launcher flex shrink-0 items-center gap-0.5"
              onPointerDown={onLauncherPointerDown}
              onPointerMove={onLauncherPointerMove}
              onPointerUp={(e) => finishDrag(e.pointerId)}
              onPointerCancel={(e) => finishDrag(e.pointerId)}
            >
              {typeof launcher === "function" ? launcher({ expanded }) : launcher}
            </div>
            {expanded && (
              <div
                data-slot="toolbar-tools"
                className="flex min-w-0 flex-nowrap items-center gap-x-1 border-r border-border/60 pr-1.5 [&>*]:shrink-0"
              >
                {children}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
