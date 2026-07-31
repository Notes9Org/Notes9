"use client"

/**
 * The analysis tab strip.
 *
 * Mirrors the literature reader's tabs on purpose: same pill indicator, same
 * hover-to-reveal close control, same scrolling behaviour. Two surfaces that
 * both mean "several things open at once" should not need to be learned twice.
 *
 * A tab shows a dot when its result is stale — the spec or the data moved and
 * the engine has not caught up. Without it, switching to a tab shows numbers
 * that describe a spec the user has already edited, which is the quietest way
 * for a stale p-value to be read as current.
 */

import { useEffect, useRef, useState } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { Plus, X, CopySimple, GridFour, PencilSimple } from "@phosphor-icons/react/ssr"

import { cn } from "@/lib/utils"
import type { AnalysisPipeline } from "@/lib/data-analysis/workspace/pipelines"
import { EASE_OUT } from "./motion"

const INDICATOR_SPRING = { type: "spring", stiffness: 500, damping: 40, mass: 0.7 } as const

function TabPill() {
  const reduce = useReducedMotion()
  if (reduce) {
    return (
      <span className="pointer-events-none absolute inset-0 rounded-md border border-border/50 bg-background shadow-sm" />
    )
  }
  return (
    <motion.span
      layoutId="analysis-pipeline-pill"
      className="pointer-events-none absolute inset-0 rounded-md border border-border/50 bg-background shadow-sm"
      transition={INDICATOR_SPRING}
    />
  )
}

export function PipelineTabs({
  pipelines,
  activeId,
  layoutActive,
  onActivate,
  onOpenLayout,
  onNew,
  onClose,
  onDuplicate,
  onRename,
  className,
}: {
  pipelines: AnalysisPipeline[]
  activeId: string | null
  /** True when the figure-layout view is showing instead of a single analysis. */
  layoutActive?: boolean
  onActivate: (id: string) => void
  onOpenLayout?: () => void
  onNew: () => void
  onClose: (id: string) => void
  onDuplicate: (id: string) => void
  onRename: (id: string, name: string) => void
  className?: string
}) {
  const reduce = useReducedMotion()
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const stripRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Keep the selected tab in view when it is activated from elsewhere — a
  // figure panel's "open this analysis", say.
  useEffect(() => {
    if (!activeId || !stripRef.current) return
    const el = stripRef.current.querySelector<HTMLElement>(`[data-tab="${CSS.escape(activeId)}"]`)
    el?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest", inline: "nearest" })
  }, [activeId, reduce])

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  const commit = () => {
    if (editing) onRename(editing, draft)
    setEditing(null)
  }

  return (
    <div className={cn("flex items-stretch gap-1 rounded-lg bg-muted/25 p-1", className)}>
      <div
        ref={stripRef}
        role="tablist"
        aria-label="Open analyses"
        className="no-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto scroll-smooth"
      >
        {pipelines.map((p) => {
          const active = !layoutActive && p.id === activeId
          return (
            <div
              key={p.id}
              data-tab={p.id}
              className="group relative flex shrink-0 items-center"
            >
              <button
                role="tab"
                aria-selected={active}
                onClick={() => onActivate(p.id)}
                onDoubleClick={() => {
                  setEditing(p.id)
                  setDraft(p.name)
                }}
                title={`${p.name}${p.stale ? " — not yet computed for the current spec" : ""}`}
                className={cn(
                  "relative flex max-w-[220px] items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] transition-colors",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {active && <TabPill />}
                <span className="relative z-[1] flex items-center gap-1.5">
                  {p.stale && (
                    <span
                      aria-hidden
                      title="Not yet computed for the current spec"
                      className="size-1.5 shrink-0 rounded-full bg-amber-500"
                    />
                  )}
                  {editing === p.id ? (
                    <input
                      ref={inputRef}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onBlur={commit}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commit()
                        if (e.key === "Escape") setEditing(null)
                        e.stopPropagation()
                      }}
                      onClick={(e) => e.stopPropagation()}
                      aria-label="Analysis name"
                      className="w-[140px] rounded-sm bg-background px-1 text-[13px] outline-none ring-1 ring-[var(--n9-accent)]/40"
                    />
                  ) : (
                    <span className="truncate font-medium">{p.name}</span>
                  )}
                </span>
              </button>

              {/* Not a nested <button>: this sits inside the tab's button, and
                  nesting one is invalid HTML that React will refuse to hydrate. */}
              <span
                role="button"
                tabIndex={0}
                aria-label={`Close ${p.name}`}
                title="Close analysis"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  onClose(p.id)
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    e.stopPropagation()
                    onClose(p.id)
                  }
                }}
                className="absolute right-1 z-[2] cursor-pointer rounded p-0.5 text-muted-foreground/60 opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus:opacity-100 group-hover:opacity-100"
              >
                <X className="size-3" />
              </span>
            </div>
          )
        })}
      </div>

      <div className="flex shrink-0 items-center gap-0.5 border-l border-border/50 pl-1">
        {activeId && (
          <>
            <IconButton
              label="Rename this analysis"
              onClick={() => {
                const current = pipelines.find((p) => p.id === activeId)
                if (!current) return
                setEditing(current.id)
                setDraft(current.name)
              }}
            >
              <PencilSimple className="size-3.5" />
            </IconButton>
            <IconButton label="Duplicate this analysis" onClick={() => onDuplicate(activeId)}>
              <CopySimple className="size-3.5" />
            </IconButton>
          </>
        )}
        <IconButton label="New analysis" onClick={onNew}>
          <Plus className="size-3.5" />
        </IconButton>
        {onOpenLayout && (
          <button
            type="button"
            onClick={onOpenLayout}
            aria-pressed={layoutActive}
            title="Compose a multi-panel figure from these analyses"
            className={cn(
              "relative ml-0.5 flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12.5px] font-medium transition-colors",
              layoutActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {layoutActive && <TabPill />}
            <span className="relative z-[1] flex items-center gap-1.5">
              <GridFour className="size-3.5" weight={layoutActive ? "fill" : "regular"} />
              Figure layout
            </span>
          </button>
        )}
      </div>
    </div>
  )
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  const reduce = useReducedMotion()
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      whileTap={reduce ? undefined : { scale: 0.92 }}
      transition={{ duration: 0.12, ease: EASE_OUT }}
      className="rounded-md p-1.5 text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
    >
      {children}
    </motion.button>
  )
}
