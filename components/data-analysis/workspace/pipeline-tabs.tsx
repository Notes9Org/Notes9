"use client"

/**
 * The analysis tab strip.
 *
 * Tabs sit ON a hairline rather than inside a grey tray, and the active one
 * paints over that rule so it reads as continuous with the panel beneath it.
 * That is the difference between a tab and a chip: a chip floats above the
 * work, a tab is the front edge of it.
 *
 * Each tab carries its index, because that is what the figure panels and the
 * draft caption call this analysis, the number is a reference, not decoration.
 *
 * A tab shows a dot when its result is stale: the spec or the data moved and
 * the engine has not caught up. Without it, switching to a tab shows numbers
 * that describe a spec the user has already edited, which is the quietest way
 * for a stale p-value to be read as current.
 */

import { useEffect, useRef, useState } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { Plus, X, CopySimple, GridFour, PencilSimple } from "@phosphor-icons/react/ssr"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import type { AnalysisPipeline } from "@/lib/data-analysis/workspace/pipelines"

const INDICATOR_SPRING = { type: "spring", stiffness: 500, damping: 40, mass: 0.7 } as const

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

  // Keep the selected tab in view when it is activated from elsewhere, a
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
    <div
      className={cn(
        // A rail on a hairline, not a tray. The old chip-in-a-grey-box reads as
        // a toolbar from a decade ago; sitting the tabs ON a rule is what every
        // modern editor does, and it lets the active tab feel attached to the
        // work below it rather than floating above it.
        "flex items-end gap-2 border-b border-border/60",
        className
      )}
    >
      <div
        ref={stripRef}
        role="tablist"
        aria-label="Open analyses"
        className="no-scrollbar -mb-px flex min-w-0 flex-1 items-end gap-1 overflow-x-auto scroll-smooth pb-0"
      >
        {pipelines.map((p, index) => {
          const active = !layoutActive && p.id === activeId
          const isEditing = editing === p.id
          return (
            <div
              key={p.id}
              data-tab={p.id}
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              onClick={() => onActivate(p.id)}
              onDoubleClick={() => {
                setEditing(p.id)
                setDraft(p.name)
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  onActivate(p.id)
                }
              }}
              title={`${p.name}${p.stale ? ", not yet computed for the current spec" : ""}`}
              className={cn(
                "group relative flex max-w-[240px] shrink-0 cursor-pointer items-center gap-2 rounded-t-lg border border-b-0 px-3 py-2 text-[13px] transition-colors",
                active
                  ? "border-border/60 bg-card text-foreground"
                  : "border-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              )}
            >
              {/* The active tab's underline is painted over the container rule,
                  which is what makes it read as one continuous surface with the
                  panel beneath rather than a chip sitting on top of it. */}
              {active && (
                <span className="absolute inset-x-0 -bottom-px h-px bg-card" aria-hidden />
              )}
              {!reduce && active && (
                <motion.span
                  layoutId="analysis-pipeline-accent"
                  className="absolute inset-x-2 top-0 h-[2px] rounded-full bg-[var(--n9-accent,#965034)]"
                  transition={INDICATOR_SPRING}
                />
              )}
              {reduce && active && (
                <span className="absolute inset-x-2 top-0 h-[2px] rounded-full bg-[var(--n9-accent,#965034)]" />
              )}

              {/* An index chip rather than an icon: it is what the figure
                  panels and the caption call this analysis. */}
              <span
                className={cn(
                  "grid size-[18px] shrink-0 place-items-center rounded-[5px] text-[10px] font-semibold tabular-nums transition-colors",
                  active
                    ? "bg-[var(--n9-accent,#965034)]/12 text-[var(--n9-accent,#965034)]"
                    : "bg-muted text-muted-foreground/70"
                )}
              >
                {index + 1}
              </span>

              {isEditing ? (
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
                  className="w-[150px] rounded-sm bg-background px-1 text-[13px] outline-none ring-1 ring-[var(--n9-accent,#965034)]/40"
                />
              ) : (
                <span className="truncate font-medium">{p.name}</span>
              )}

              {p.stale && !isEditing && (
                <span
                  aria-hidden
                  title="Not yet computed for the current spec"
                  className="size-1.5 shrink-0 rounded-full bg-amber-500"
                />
              )}

              {/* Inline, not overlaid. The close control used to sit absolutely
                  over the label, which cramped long names and made the tab a
                  minefield to click. */}
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
                className={cn(
                  "-mr-1 grid size-5 shrink-0 cursor-pointer place-items-center rounded transition-all",
                  "text-muted-foreground/50 opacity-0 hover:bg-muted hover:text-foreground focus:opacity-100 group-hover:opacity-100",
                  active && "opacity-60"
                )}
              >
                <X className="size-3" />
              </span>
            </div>
          )
        })}

        {/* New sits at the end of the strip, where a new tab actually appears. */}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onNew}
          aria-label="New analysis"
          title="New analysis"
          className="mb-1 shrink-0 text-muted-foreground/60"
        >
          <Plus className="size-3.5" />
        </Button>
      </div>

      <div className="mb-1 flex shrink-0 items-center gap-0.5">
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
        {onOpenLayout && (
          <button
            type="button"
            onClick={onOpenLayout}
            aria-pressed={layoutActive}
            title="Compose a multi-panel figure from these analyses"
            className={cn(
              "ml-1 flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12.5px] font-medium transition-colors",
              layoutActive
                ? "bg-[var(--n9-accent,#965034)]/12 text-[var(--n9-accent,#965034)]"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <GridFour className="size-3.5" weight={layoutActive ? "fill" : "regular"} />
            Figure layout
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
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="text-muted-foreground/70"
    >
      {children}
    </Button>
  )
}
