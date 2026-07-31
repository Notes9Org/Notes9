"use client"

import { useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  CaretDown,
  CheckCircle,
  CloudSlash,
  GitDiff,
  Lock,
  PushPin,
  Sparkle,
  User,
} from "@phosphor-icons/react/ssr"

import { cn } from "@/lib/utils"
import type { AppliedMutation } from "@/lib/data-analysis/spec/mutations"
import { Collapse, EASE_OUT } from "./motion"

/**
 * The workspace header (§10.7).
 *
 * "The analysis has a name, a revision number, and a visible save state at all
 * times. History is a readable list of what changed, not a list of timestamps."
 *
 * Both halves of that sentence are load-bearing. The save state is always
 * rendered — never a transient toast — because the anxiety it removes ("did that
 * save?") is precisely what Prism users live with. And the history list shows
 * `describeMutation` output, so a row reads "Error bars changed to SD" rather
 * than "14:32:07".
 */

export type SaveState = "idle" | "saving" | "saved" | "error"

function SaveIndicator({ state }: { state: SaveState }) {
  const reduce = useReducedMotion()
  const label =
    state === "saving" ? "Saving…" : state === "error" ? "Not saved" : state === "saved" ? "Saved" : "Draft"

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[12px]",
        state === "error" ? "text-destructive" : "text-muted-foreground"
      )}
      aria-live="polite"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={state}
          initial={reduce ? false : { opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.16, ease: EASE_OUT }}
          className="inline-flex items-center"
        >
          {state === "saving" && (
            <motion.span
              className="size-1.5 rounded-full bg-muted-foreground/60"
              animate={reduce ? undefined : { opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
            />
          )}
          {state === "saved" && <CheckCircle className="size-3.5 text-emerald-600" weight="fill" />}
          {state === "error" && <CloudSlash className="size-3.5" />}
          {state === "idle" && <span className="size-1.5 rounded-full bg-muted-foreground/40" />}
        </motion.span>
      </AnimatePresence>
      {label}
    </span>
  )
}

export function AnalysisHeader({
  name,
  onRename,
  revisionNo,
  isFrozen,
  saveState,
  history,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onSave,
  onFreeze,
  className,
}: {
  name: string
  onRename?: (name: string) => void
  revisionNo: number
  isFrozen?: boolean
  saveState: SaveState
  history: AppliedMutation[]
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onSave?: () => void
  onFreeze?: () => void
  className?: string
}) {
  const [showHistory, setShowHistory] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState(name)

  const commitName = () => {
    setEditing(false)
    const next = draftName.trim()
    if (next && next !== name) onRename?.(next)
    else setDraftName(name)
  }

  return (
    <div className={cn("bg-transparent", className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 pt-4">
        {/* Name — inline editable, as the document's other document surfaces are. */}
        {editing ? (
          <input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitName()
              if (e.key === "Escape") {
                setDraftName(name)
                setEditing(false)
              }
            }}
            aria-label="Analysis name"
            className="h-9 min-w-0 flex-1 rounded-lg border border-[var(--n9-accent)]/40 bg-background px-2.5 text-[17px] font-semibold tracking-tight outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => onRename && setEditing(true)}
            className={cn(
              "min-w-0 truncate text-[17px] font-semibold tracking-tight text-foreground",
              onRename && "rounded px-1 -mx-1 hover:bg-muted"
            )}
            title={onRename ? "Rename" : undefined}
          >
            {name}
          </button>
        )}

        <span className="inline-flex items-center gap-1.5 text-[12.5px] tabular-nums text-muted-foreground">
          v{revisionNo}
          {isFrozen && <Lock className="size-3 text-[var(--n9-accent)]" weight="fill" />}
        </span>

        <SaveIndicator state={saveState} />

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            aria-label="Undo"
            title="Undo"
            className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ArrowCounterClockwise className="size-4" />
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            aria-label="Redo"
            title="Redo"
            className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ArrowClockwise className="size-4" />
          </button>

          <span className="mx-1 h-4 w-px bg-border" />

          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            aria-expanded={showHistory}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <GitDiff className="size-3.5" />
            History
            <CaretDown
              className={cn("size-3 transition-transform duration-200", showHistory && "rotate-180")}
            />
          </button>

          {onFreeze && !isFrozen && (
            <button
              type="button"
              onClick={onFreeze}
              title="Freeze this revision: read-only, hashed, citable"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <PushPin className="size-3.5" />
              Freeze
            </button>
          )}

          {onSave && (
            <button
              type="button"
              onClick={onSave}
              className="inline-flex h-8 items-center rounded-lg bg-[var(--n9-accent)] px-3 text-[13px] font-medium text-white transition-colors hover:bg-[var(--n9-accent-hover)]"
            >
              Save revision
            </button>
          )}
        </div>
      </div>

      <Collapse open={showHistory}>
        <div className="max-h-72 overflow-y-auto px-4 py-3">
          {history.length === 0 ? (
            <p className="text-[12.5px] text-muted-foreground">
              No edits yet in this session.
            </p>
          ) : (
            <ol className="grid gap-1.5">
              {[...history].reverse().map((h, i) => (
                <motion.li
                  key={`${h.at}-${i}`}
                  initial={{ opacity: 0, y: -3 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, ease: EASE_OUT, delay: Math.min(i, 8) * 0.015 }}
                  className="flex items-start gap-2"
                >
                  {h.origin === "ai" ? (
                    <Sparkle className="mt-0.5 size-3 shrink-0 text-[var(--n9-accent)]" weight="fill" />
                  ) : (
                    <User className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0 flex-1 text-[12.5px] leading-snug text-foreground/85">
                    {h.description}
                  </span>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {new Date(h.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </motion.li>
              ))}
            </ol>
          )}
        </div>
      </Collapse>
    </div>
  )
}
