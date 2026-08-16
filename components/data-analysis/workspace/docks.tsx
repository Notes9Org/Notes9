"use client"

/**
 * Dock primitives for the analysis workspace.
 *
 * Three surfaces surround the figure: the data, the statistics, and the chart
 * settings. Each has to be dismissable without becoming a place you travel to,
 * because the master document's "one thing, three views, not three tools" only
 * holds if closing the statistics leaves you on the same screen with the same
 * figure, rather than navigating you into a statistics tab.
 *
 * So each is a dock: it collapses to a rail button in place, it remembers its
 * size, and it can be dragged to a new one. Collapsing is not destructive and
 * nothing recomputes, which matters because Law 5 says style and layout edits
 * must never touch the engine.
 *
 * Sizes persist per workspace instance in localStorage. A researcher who works
 * with the sheet wide open should not have to widen it again every morning.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react"
import { motion, useReducedMotion } from "framer-motion"
import { CaretDown, CaretLeft, CaretRight, CaretUp } from "@phosphor-icons/react/ssr"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { PANEL_SPRING } from "./motion"

export type DockSide = "left" | "right" | "bottom"

export interface DockConfig {
  /** Pixel extent when open: width for side docks, height for the bottom dock. */
  size: number
  open: boolean
}

export type DockLayout = Record<DockSide, DockConfig>

/**
 * One tab inside a dock that hosts more than one panel (e.g. the right rail's
 * Chart settings / Ask Notes9 pair). `label` is rendered verbatim rather than
 * derived, because with two right-docked chat surfaces on screen (ADR-024),
 * the label is the only thing telling the researcher which one edits the chart.
 */
export type DockPanel = {
  id: string
  label: string
  /** A positive count renders a badge, visible even while another tab is active. */
  badge?: number | null
  content: ReactNode
}

const DEFAULT_LAYOUT: DockLayout = {
  left: { size: 400, open: true },
  right: { size: 340, open: true },
  bottom: { size: 300, open: true },
}

/** Bounds keep a dragged dock from swallowing the figure or vanishing entirely. */
const LIMITS: Record<DockSide, { min: number; max: number }> = {
  left: { min: 260, max: 720 },
  right: { min: 280, max: 560 },
  bottom: { min: 160, max: 640 },
}

const clamp = (side: DockSide, n: number) =>
  Math.round(Math.min(LIMITS[side].max, Math.max(LIMITS[side].min, n)))

function isLayout(value: unknown): value is DockLayout {
  if (!value || typeof value !== "object") return false
  return (["left", "right", "bottom"] as const).every((side) => {
    const dock = (value as Record<string, unknown>)[side]
    return (
      !!dock &&
      typeof dock === "object" &&
      typeof (dock as DockConfig).open === "boolean" &&
      Number.isFinite((dock as DockConfig).size)
    )
  })
}

/**
 * Persisted dock state.
 *
 * The first render always uses the defaults and the stored layout is applied in
 * an effect. Reading localStorage during render would make the server and client
 * markup disagree and React would discard the tree.
 */
export function useDockLayout(storageKey: string) {
  const [layout, setLayout] = useState<DockLayout>(DEFAULT_LAYOUT)
  // Which panel is active in a tabbed dock (e.g. "settings" | "ask"). Persisted
  // alongside size/open so a researcher's tab choice survives a reload the same
  // way the rest of the dock geometry does. `null` until a consumer sets one;
  // which panel that resolves to when unset or stale is the tabbed Dock's call,
  // not this hook's — it doesn't know the panel list.
  const [activePanelId, setActivePanelId] = useState<string | null>(null)
  const loaded = useRef(false)

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey)
      if (raw) {
        const parsed: unknown = JSON.parse(raw)
        if (isLayout(parsed)) {
          setLayout({
            left: { ...parsed.left, size: clamp("left", parsed.left.size) },
            right: { ...parsed.right, size: clamp("right", parsed.right.size) },
            bottom: { ...parsed.bottom, size: clamp("bottom", parsed.bottom.size) },
          })
          const storedActivePanelId = (parsed as { activePanelId?: unknown }).activePanelId
          if (typeof storedActivePanelId === "string") {
            setActivePanelId(storedActivePanelId)
          }
        }
      }
    } catch {
      // A corrupt or unavailable store is not worth failing the workspace over.
    }
    loaded.current = true
  }, [storageKey])

  useEffect(() => {
    if (!loaded.current) return
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ ...layout, activePanelId }))
    } catch {
      // Private mode and quota errors are non-fatal: the session still works.
    }
  }, [layout, activePanelId, storageKey])

  const toggle = useCallback((side: DockSide) => {
    setLayout((l) => ({ ...l, [side]: { ...l[side], open: !l[side].open } }))
  }, [])

  const setOpen = useCallback((side: DockSide, open: boolean) => {
    setLayout((l) => ({ ...l, [side]: { ...l[side], open } }))
  }, [])

  const resize = useCallback((side: DockSide, size: number) => {
    setLayout((l) => ({ ...l, [side]: { ...l[side], size: clamp(side, size) } }))
  }, [])

  return { layout, toggle, setOpen, resize, activePanelId, setActivePanelId }
}

/**
 * Drag handle between a dock and the canvas.
 *
 * Keyboard-operable on purpose: a splitter that only responds to a mouse is a
 * control a keyboard user cannot reach, and the ARIA separator role expects
 * arrow keys to work.
 */
function ResizeHandle({
  side,
  size,
  onResize,
  label,
}: {
  side: DockSide
  size: number
  onResize: (size: number) => void
  label: string
}) {
  const [dragging, setDragging] = useState(false)
  // Where the drag began, and how big the panel was then. Sizes are applied as
  // a delta from that origin rather than from a viewport edge: the workspace
  // sits inside the app sidebar and its own padding, so `clientX` is offset
  // from the panel's real width by however much chrome precedes it, and using
  // it directly makes the panel jump on the first pointer move.
  const origin = useRef({ pointer: 0, size: 0 })
  const vertical = side !== "bottom"

  useEffect(() => {
    if (!dragging) return
    const onMove = (e: PointerEvent) => {
      e.preventDefault()
      const { pointer, size: from } = origin.current
      if (side === "left") onResize(from + (e.clientX - pointer))
      else if (side === "right") onResize(from - (e.clientX - pointer))
      else onResize(from - (e.clientY - pointer))
    }
    const stop = () => setDragging(false)
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", stop)
    // Without this the pointer picks up text selection across the whole app
    // while dragging, which looks broken even though the drag works.
    const prev = document.body.style.userSelect
    document.body.style.userSelect = "none"
    document.body.style.cursor = vertical ? "col-resize" : "row-resize"
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", stop)
      document.body.style.userSelect = prev
      document.body.style.cursor = ""
    }
  }, [dragging, side, onResize, vertical])

  const step = (delta: number) => onResize(size + delta)

  return (
    <div
      role="separator"
      aria-orientation={vertical ? "vertical" : "horizontal"}
      aria-label={label}
      aria-valuenow={size}
      aria-valuemin={LIMITS[side].min}
      aria-valuemax={LIMITS[side].max}
      tabIndex={0}
      onPointerDown={(e) => {
        e.preventDefault()
        origin.current = { pointer: vertical ? e.clientX : e.clientY, size }
        setDragging(true)
      }}
      onKeyDown={(e) => {
        const big = e.shiftKey ? 48 : 16
        if (vertical && e.key === "ArrowLeft") step(side === "left" ? -big : big)
        else if (vertical && e.key === "ArrowRight") step(side === "left" ? big : -big)
        else if (!vertical && e.key === "ArrowUp") step(big)
        else if (!vertical && e.key === "ArrowDown") step(-big)
        else return
        e.preventDefault()
      }}
      className={cn(
        "group relative z-10 shrink-0 touch-none",
        vertical ? "w-1.5 cursor-col-resize" : "h-1.5 cursor-row-resize",
        "focus-visible:outline-none"
      )}
    >
      <span
        className={cn(
          "absolute rounded-full transition-colors duration-150",
          vertical
            ? "inset-y-2 left-1/2 w-[3px] -translate-x-1/2"
            : "inset-x-2 top-1/2 h-[3px] -translate-y-1/2",
          dragging
            ? "bg-[var(--n9-accent)]"
            : "bg-transparent group-hover:bg-border group-focus-visible:bg-[var(--n9-accent)]"
        )}
      />
    </div>
  )
}

/**
 * The tab strip for a dock holding more than one panel. Follows the WAI-ARIA
 * tabs pattern: roving tabindex, and Left/Right/Home/End move focus *and*
 * selection together (automatic activation) — there is no separate "activate"
 * step to discover with two tabs.
 *
 * A per-tab badge renders regardless of which tab is active, because ADR-024's
 * rule carried over from the collapsed console bar is that a pending plan must
 * never be hidden by which tab happens to be open.
 */
function DockTabStrip({
  panels,
  activeId,
  onChange,
  label,
}: {
  panels: DockPanel[]
  activeId: string
  onChange: (id: string) => void
  label: string
}) {
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  const move = (id: string) => {
    onChange(id)
    tabRefs.current[id]?.focus()
  }

  const onKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number
    switch (e.key) {
      case "ArrowLeft":
        nextIndex = (index - 1 + panels.length) % panels.length
        break
      case "ArrowRight":
        nextIndex = (index + 1) % panels.length
        break
      case "Home":
        nextIndex = 0
        break
      case "End":
        nextIndex = panels.length - 1
        break
      default:
        return
    }
    e.preventDefault()
    move(panels[nextIndex].id)
  }

  return (
    <div role="tablist" aria-label={label} className="flex min-w-0 items-center gap-1">
      {panels.map((panel, index) => {
        const selected = panel.id === activeId
        const badgeCount =
          typeof panel.badge === "number" && panel.badge > 0 ? panel.badge : null
        return (
          <button
            key={panel.id}
            ref={(el) => {
              tabRefs.current[panel.id] = el
            }}
            type="button"
            role="tab"
            id={`dock-tab-${panel.id}`}
            aria-selected={selected}
            aria-controls={`dock-panel-${panel.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => move(panel.id)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={cn(
              "relative flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[13px] font-medium transition-colors",
              selected
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {panel.label}
            {badgeCount !== null && (
              <span
                aria-label={`${badgeCount} pending`}
                className="inline-flex min-w-[16px] items-center justify-center rounded-full bg-[var(--n9-accent)] px-1 text-[10px] font-semibold leading-4 text-white"
              >
                {badgeCount}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/**
 * One dock. Renders its own header with the collapse control, and animates its
 * extent rather than unmounting, so the panel's scroll position and any live
 * editor inside it survive being closed and reopened.
 *
 * `panels` is additive: when omitted the dock behaves exactly as before
 * (a static title, `children` as the body). When two or more panels are
 * supplied, the title is replaced by a tab strip and the body renders the
 * active panel's `content`. A single-entry `panels` array intentionally skips
 * the tab strip — one tab has nothing to switch to — and falls back to the
 * plain-title rendering.
 */
export function Dock({
  side,
  open,
  size,
  onToggle,
  onResize,
  title,
  icon,
  actions,
  children,
  className,
  bodyClassName,
  panels,
  activePanelId,
  onActivePanelChange,
}: {
  side: DockSide
  open: boolean
  size: number
  onToggle: () => void
  onResize: (size: number) => void
  title: string
  icon?: ReactNode
  actions?: ReactNode
  children?: ReactNode
  className?: string
  bodyClassName?: string
  panels?: DockPanel[]
  activePanelId?: string
  onActivePanelChange?: (id: string) => void
}) {
  const reduce = useReducedMotion()
  const vertical = side !== "bottom"
  // The house spring, so a dock opening feels like every other panel in the
  // product rather than like a different component library.
  const transition = reduce ? { duration: 0.12 } : PANEL_SPRING

  const CollapseIcon =
    side === "left" ? CaretLeft : side === "right" ? CaretRight : CaretDown

  // Two or more panels get a tab strip; zero or one behaves like the classic API.
  const showTabs = !!panels && panels.length > 1
  const activePanel =
    panels && panels.length > 0
      ? (panels.find((p) => p.id === activePanelId) ?? panels[0])
      : null
  const handleActivePanelChange = (id: string) => onActivePanelChange?.(id)

  // A dock with tabs but no change handler is a controlled-without-onChange
  // trap: move() below still shifts DOM focus to the clicked/arrow-selected
  // tab, but aria-selected and the rendered panel never follow, because
  // activePanel derives solely from the activePanelId prop. Warn loudly in
  // dev instead of leaving that half-broken state silent.
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" && showTabs && !onActivePanelChange) {
      console.error(
        `Dock: "${title}" renders a tab strip (${panels?.length ?? 0} panels) but received no ` +
          "onActivePanelChange. Selecting a tab will move focus without changing the active panel. " +
          "Pass onActivePanelChange, or omit panels/activePanelId to use the single-panel API."
      )
    }
  }, [showTabs, onActivePanelChange, title, panels?.length])

  return (
    <>
      {side === "right" && open && (
        <ResizeHandle
          side={side}
          size={size}
          onResize={onResize}
          label={`Resize ${title.toLowerCase()} panel`}
        />
      )}

      <motion.section
        aria-label={title}
        initial={false}
        animate={
          vertical
            ? { width: open ? size : 0, opacity: open ? 1 : 0 }
            : { height: open ? size : 0, opacity: open ? 1 : 0 }
        }
        transition={transition}
        className={cn(
          "relative min-h-0 shrink-0 overflow-hidden",
          !open && "pointer-events-none",
          className
        )}
      >
        <div
          style={vertical ? { width: size } : { height: size }}
          className={cn(
            "flex h-full flex-col overflow-hidden rounded-2xl border border-border/50 bg-card",
            vertical ? "min-w-0" : "w-full"
          )}
        >
          <header className="flex items-center gap-2 border-b border-border/40 px-4 py-2.5">
            {icon}
            {showTabs && panels ? (
              <DockTabStrip
                panels={panels}
                activeId={activePanel?.id ?? panels[0].id}
                onChange={handleActivePanelChange}
                label={title}
              />
            ) : (
              <h2 className="text-[13px] font-medium text-muted-foreground">{title}</h2>
            )}
            <div className="ml-auto flex items-center gap-1.5">
              {actions}
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onToggle}
                aria-label={`Hide ${title.toLowerCase()}`}
                title={`Hide ${title.toLowerCase()}`}
                className="text-muted-foreground/60"
              >
                <CollapseIcon className="size-3.5" />
              </Button>
            </div>
          </header>
          <div
            className={cn("min-h-0 flex-1 overflow-auto", bodyClassName)}
            {...(showTabs && activePanel
              ? {
                  role: "tabpanel",
                  id: `dock-panel-${activePanel.id}`,
                  "aria-labelledby": `dock-tab-${activePanel.id}`,
                }
              : {})}
          >
            {panels && panels.length > 0 ? activePanel?.content : children}
          </div>
        </div>
      </motion.section>

      {side !== "right" && open && (
        <ResizeHandle
          side={side}
          size={size}
          onResize={onResize}
          label={`Resize ${title.toLowerCase()} panel`}
        />
      )}
    </>
  )
}

/**
 * The reopen control for a closed dock.
 *
 * Deliberately a labelled button rather than a bare chevron. A closed panel
 * whose only trace is an arrow is a panel most people never find again, and the
 * statistics dock in particular has to be obviously retrievable: the numbers
 * are the point of the page.
 */
export function DockTab({
  side,
  label,
  icon,
  onOpen,
}: {
  side: DockSide
  label: string
  icon?: ReactNode
  onOpen: () => void
}) {
  const vertical = side !== "bottom"
  const OpenIcon = side === "left" ? CaretRight : side === "right" ? CaretLeft : CaretUp
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Show ${label.toLowerCase()}`}
      title={`Show ${label.toLowerCase()}`}
      className={cn(
        "group flex shrink-0 items-center gap-1.5 rounded-lg border border-border/50 bg-card text-[12.5px] font-medium text-muted-foreground transition-colors hover:border-border hover:text-foreground",
        vertical ? "flex-col self-start px-1.5 py-3" : "self-center px-3 py-1.5"
      )}
    >
      <OpenIcon className="size-3.5 opacity-60 transition-opacity group-hover:opacity-100" />
      {icon}
      <span className={cn(vertical && "[writing-mode:vertical-rl] rotate-180 tracking-wide")}>
        {label}
      </span>
    </button>
  )
}
