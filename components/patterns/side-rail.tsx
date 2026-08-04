"use client"

import * as React from "react"
import { motion } from "framer-motion"
import { MagnifyingGlass as Search } from "@phosphor-icons/react/ssr"
import { MotionItem, MotionList } from "@/components/literature-reviews/motion"
import { cn } from "@/lib/utils"

/**
 * SideRail, the shared "floating glass rail" pattern, extracted from the
 * Catalyst full-page chat-history sidebar (components/layout/right-sidebar.tsx,
 * expanded-history aside). Every docked list rail (lab notes, protocols,
 * papers, reports, …) composes these parts so the whole platform shares one
 * look: a rounded-2xl glass panel floating inside the workspace, a width
 * animation that clips (not reflows) on open/close, and the same list-row
 * grammar (hover fill, active accent pill, staggered entrance, shimmer
 * skeletons).
 *
 * Anatomy:
 *   <SideRail open={open}>            ← animated aside + glass panel (desktop)
 *     <SideRailHeader label="Notes">…actions…</SideRailHeader>
 *     <SideRailSearch … />            ← optional
 *     <SideRailBody>
 *       <SideRailList>
 *         <SideRailRow active onSelect={…} icon={…} actions={<kebab/>}>
 *           Title
 *         </SideRailRow>
 *       </SideRailList>
 *     </SideRailBody>
 *   </SideRail>
 *
 * Inside a mobile <Sheet>, skip SideRail and use SideRailPanel (or just the
 * header/list parts) directly.
 */

/** Default rail width, matches the Catalyst history rail (14rem outer → 13rem panel). */
export const SIDE_RAIL_WIDTH = 224

interface SideRailProps extends React.HTMLAttributes<HTMLElement> {
  /** Rail visibility, width animates to 0 when closed; content stays mounted and clips. */
  open: boolean
  /** Outer width in px (the glass panel floats inside with an 8px inset). */
  width?: number
  /** Extra classes on the inner glass panel (rarely needed). */
  panelClassName?: string
  children: React.ReactNode
}

export const SideRail = React.forwardRef<HTMLElement, SideRailProps>(function SideRail(
  { open, width = SIDE_RAIL_WIDTH, className, panelClassName, children, style, ...rest },
  ref,
) {
  return (
    <aside
      ref={ref}
      className={cn(
        "relative flex min-h-0 shrink-0 flex-col self-stretch overflow-hidden bg-transparent",
        className,
      )}
      style={{
        width: open ? width : 0,
        minWidth: 0,
        transition: "width 0.5s cubic-bezier(0.22, 1, 0.36, 1)",
        ...style,
      }}
      aria-hidden={!open}
      {...rest}
    >
      {/* Fixed-width inner content so the rail is clipped (not reflowed) while
          the aside collapses to 0, the same slide the Catalyst rail has. */}
      <div className="flex h-full min-h-0 flex-col" style={{ width }}>
        <SideRailPanel className={panelClassName}>{children}</SideRailPanel>
      </div>
    </aside>
  )
})

/** The floating glass card itself, reusable standalone (e.g. inside a Sheet). */
export function SideRailPanel({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "n9-grain m-2 flex h-[calc(100%-1rem)] min-h-0 flex-col gap-1 rounded-2xl border border-[color:var(--glass-border)] bg-sidebar/80 p-2 backdrop-blur-md",
        "shadow-[0_10px_34px_-18px_rgba(20,14,8,0.4)] dark:bg-sidebar/60 dark:shadow-[0_12px_38px_-16px_rgba(0,0,0,0.6)]",
        className,
      )}
    >
      {children}
    </div>
  )
}

/** Compact header row: uppercase tracked label + right-aligned ghost icon actions (size-7). */
export function SideRailHeader({
  label,
  className,
  children,
}: {
  label: React.ReactNode
  className?: string
  children?: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "flex h-8 shrink-0 items-center gap-1 rounded-md px-1 text-xs font-medium text-sidebar-foreground/70",
        className,
      )}
    >
      <span className="flex-1 truncate text-[0.7rem] font-semibold uppercase tracking-wider">{label}</span>
      {children}
    </div>
  )
}

/** Glass search input matching the Catalyst rail's "Search chats…" field.
 *  Stays compact at rest; swells subtly (spring scale + soft accent ring)
 *  while the user is actually typing a query. */
export function SideRailSearch({
  value,
  onChange,
  placeholder = "Search…",
  "aria-label": ariaLabel,
  className,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  "aria-label"?: string
  className?: string
}) {
  const typing = value.length > 0
  return (
    <div className={cn("shrink-0 px-0.5 pb-1", className)}>
      <motion.div
        className="relative"
        animate={{ scale: typing ? 1.03 : 1 }}
        transition={{ type: "spring", stiffness: 420, damping: 30 }}
      >
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-sidebar-foreground/45" />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label={ariaLabel ?? placeholder}
          className={cn(
            "h-8 w-full rounded-lg border border-[color:var(--glass-border)] bg-background/50 pl-8 pr-2 text-sm text-sidebar-foreground outline-none transition-shadow duration-200 placeholder:text-sidebar-foreground/40 focus:border-[color:color-mix(in_srgb,var(--n9-accent)_45%,var(--border))]",
            typing && "shadow-[0_0_0_3px_color-mix(in_srgb,var(--n9-accent)_12%,transparent)]",
          )}
        />
      </motion.div>
    </div>
  )
}

/**
 * Scrollable list region with the rail scroll pattern:
 * - no permanent scrollbar gutter, a thin ghost thumb fades in on hover/focus
 *   (`.n9-scrollbar-ghost`, globals.css)
 * - edge fades signal overflow: content melts into the panel at the bottom
 *   (and top, once scrolled) so "there's more" reads at a glance without chrome.
 */
export function SideRailBody({ className, children }: { className?: string; children: React.ReactNode }) {
  const scrollRef = React.useRef<HTMLDivElement>(null)
  // true = the edge is reached (no fade shown on that side)
  const [atTop, setAtTop] = React.useState(true)
  const [atBottom, setAtBottom] = React.useState(true)

  const updateEdges = React.useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setAtTop(el.scrollTop <= 2)
    setAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 2)
  }, [])

  React.useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    updateEdges()
    const ro = new ResizeObserver(updateEdges)
    ro.observe(el)
    const mo = new MutationObserver(updateEdges)
    mo.observe(el, { childList: true, subtree: true })
    return () => {
      ro.disconnect()
      mo.disconnect()
    }
  }, [updateEdges])

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={updateEdges}
        className={cn("n9-scrollbar-ghost h-full overflow-y-auto overflow-x-hidden", className)}
      >
        {children}
      </div>
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-6 rounded-t-lg bg-gradient-to-b from-[var(--sidebar)] to-transparent opacity-0 transition-opacity duration-200",
          !atTop && "opacity-90",
        )}
      />
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 h-8 rounded-b-lg bg-gradient-to-t from-[var(--sidebar)] to-transparent opacity-0 transition-opacity duration-200",
          !atBottom && "opacity-90",
        )}
      />
    </div>
  )
}

/** Staggered-entrance row list (MotionList honors reduced motion). */
export function SideRailList({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <MotionList className={cn("flex min-w-0 flex-col gap-0.5 pr-1", className)} role="list">
      {children}
    </MotionList>
  )
}

interface SideRailRowProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onSelect"> {
  active?: boolean
  /** Row activation, rendered as a keyboard-reachable button-like row. */
  onSelect?: () => void
  /** Optional leading identity icon (size-4). */
  icon?: React.ReactNode
  /** Hover-revealed trailing actions (kebab menu, delete, …), absolutely positioned. */
  actions?: React.ReactNode
  children: React.ReactNode
}

/**
 * One rail row, the exact interaction grammar of the Catalyst history rows:
 * hover = warm color-mix fill, press = scale 0.985, active = sidebar-accent
 * fill + 1×20px primary pill on the left edge, actions fade in on hover/focus.
 */
export function SideRailRow({ active, onSelect, icon, actions, title, className, children, ...rest }: SideRailRowProps) {
  return (
    <MotionItem className="group/row relative" role="listitem">
      <div
        role={onSelect ? "button" : undefined}
        tabIndex={onSelect ? 0 : undefined}
        onClick={onSelect}
        onKeyDown={
          onSelect
            ? (e: React.KeyboardEvent) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  onSelect()
                }
              }
            : undefined
        }
        title={title}
        {...rest}
        className={cn(
          "relative flex min-h-9 min-w-0 items-center gap-2 rounded-lg py-2 pl-3 text-left text-sm outline-none transition-all duration-150",
          "hover:bg-[color:color-mix(in_oklab,var(--background)_78%,var(--primary)_22%)] hover:text-sidebar-foreground active:scale-[0.985] motion-reduce:active:scale-100 dark:hover:bg-sidebar-accent dark:hover:text-sidebar-accent-foreground",
          "focus-visible:ring-2 focus-visible:ring-ring/50",
          actions ? "pr-9" : "pr-3",
          active &&
            "bg-sidebar-accent font-medium text-sidebar-accent-foreground before:absolute before:left-0.5 before:top-1/2 before:h-5 before:w-1 before:-translate-y-1/2 before:rounded-full before:bg-primary before:content-['']",
          className,
        )}
      >
        {icon && <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground [&_svg]:size-4">{icon}</span>}
        <span className="block min-w-0 flex-1 truncate">{children}</span>
      </div>
      {actions && (
        <span className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 transition-opacity focus-within:opacity-100 group-hover/row:opacity-100 [&:has([data-state=open])]:opacity-100">
          {actions}
        </span>
      )}
    </MotionItem>
  )
}

/** Shimmer loading rows, mirrors the Catalyst rail skeleton. */
export function SideRailSkeleton({ rows = 5, label = "Loading…" }: { rows?: number; label?: string }) {
  return (
    <div className="flex flex-col gap-0.5 pr-1" aria-hidden aria-label={label}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="grid min-h-9 grid-cols-[auto_1fr] items-center gap-2 rounded-md px-2 py-1.5">
          <div className="n9-skeleton-shimmer size-6 rounded" />
          <div className="n9-skeleton-shimmer h-3.5 w-full rounded" />
        </div>
      ))}
    </div>
  )
}

/** Quiet centered empty state. */
export function SideRailEmpty({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("px-2 py-6 text-center text-xs text-sidebar-foreground/70", className)}>{children}</div>
}
