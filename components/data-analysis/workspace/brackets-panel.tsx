"use client"

/**
 * Significance brackets, by hand.
 *
 * T0.27 gave `SignificanceBracket` its style fields — colour, line width, label
 * size, cap length, hidden — and the Plotly adapter reads all of them, and
 * nothing anywhere could emit one: `figure.moveBracket` was the ONLY bracket
 * mutation in the system, and it carries a position and nothing else. So a
 * bracket could be described as restyled and never actually be restyled. This
 * panel is the hand control, and `figure.setBracketStyle` is the mutation it
 * emits — the same typed, described, undoable edit an assistant patch would
 * leave, through the parent's `applySpecMutation` (Law 1: the spec is the
 * record, this holds no figure state of its own).
 *
 * The rows are the SIGNIFICANT COMPARISONS from the post-hoc result, not
 * `spec.figure.brackets`. That is the same asymmetry the renderer works in:
 * brackets are derived per recompute and the spec stores a sparse override for
 * only the ones a researcher has touched, so listing the spec would show an
 * empty panel over a figure full of brackets.
 */

import { useId } from "react"

import type { EngineResult } from "@/lib/data-analysis/engine/contract"
import type { SignificanceBracket } from "@/lib/data-analysis/spec/analysis-spec"
import { bracketId } from "@/lib/data-analysis/spec/analysis-spec"
import type { BracketStylePatch, SpecMutation } from "@/lib/data-analysis/spec/mutations"

/** The default the adapter falls back to, shown so the control is not blank. */
const DEFAULT_COLOUR = "#444444"

function NumberRow({
  label,
  value,
  placeholder,
  min,
  max,
  step,
  onCommit,
}: {
  label: string
  value: number | null | undefined
  placeholder: string
  min: number
  max: number
  step: number
  onCommit: (v: number | null) => void
}) {
  const id = useId()
  return (
    <label htmlFor={id} className="flex flex-1 items-center gap-1 text-[10px] text-muted-foreground">
      {label}
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        className="h-7 w-full min-w-0 rounded-md border border-border bg-background px-1.5 text-xs text-foreground"
        value={value ?? ""}
        onChange={(e) => {
          const raw = e.target.value.trim()
          // Emptying the box clears the override back to the figure default
          // rather than writing NaN: absence is a meaningful value here.
          if (raw === "") return onCommit(null)
          const n = Number(raw)
          if (Number.isFinite(n) && n >= min && n <= max) onCommit(n)
        }}
      />
    </label>
  )
}

export function BracketsPanel({
  result,
  brackets,
  onMutate,
}: {
  result: EngineResult | null
  /** The sparse override rows the spec actually holds. */
  brackets: SignificanceBracket[]
  onMutate: (mutation: SpecMutation) => void
}) {
  const pairs = (result?.test?.pairwise ?? []).filter((p) => p.significant)

  if (pairs.length === 0) {
    return (
      <p className="py-1 text-[11px] text-muted-foreground">
        No significant comparisons to bracket yet.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {pairs.map((pair) => {
        const id = bracketId(pair.groupA, pair.groupB)
        // Matched the way the renderer matches it: by id, or by the pair a
        // hand-authored bracket names.
        const custom = brackets.find(
          (b) => b.id === id || (b.fromGroup === pair.groupA && b.toGroup === pair.groupB)
        )
        // Restyle the row that already exists, so an edit made after a drag
        // lands on the dragged bracket instead of creating a second one.
        const target = custom?.id ?? id
        const set = (patch: BracketStylePatch) =>
          onMutate({ kind: "figure.setBracketStyle", id: target, patch })

        return (
          <div key={id} className="space-y-1.5 rounded-md border border-border p-2">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[11px] text-foreground">
                {pair.groupA} vs {pair.groupB}
              </span>
              <label className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
                <input
                  type="checkbox"
                  aria-label={`Hide bracket for ${pair.groupA} vs ${pair.groupB}`}
                  checked={custom?.hidden === true}
                  onChange={(e) => set({ hidden: e.target.checked })}
                />
                Hide
              </label>
            </div>

            <label className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
              Label
              <select
                aria-label="Bracket label"
                className="h-7 rounded-md border border-border bg-background px-1 text-xs text-foreground"
                value={custom?.display ?? "stars"}
                onChange={(e) =>
                  set({ display: e.target.value as SignificanceBracket["display"] })
                }
              >
                <option value="stars">Stars</option>
                <option value="p-value">p value</option>
                <option value="both">Both</option>
              </select>
            </label>

            <label className="flex items-center gap-2 text-[10px] text-muted-foreground">
              Colour
              <input
                type="color"
                aria-label="Bracket colour"
                className="h-6 w-10 rounded border border-border bg-background"
                value={custom?.colour ?? DEFAULT_COLOUR}
                onChange={(e) => set({ colour: e.target.value })}
              />
              {custom?.colour && (
                <button
                  type="button"
                  className="text-[11px] text-muted-foreground hover:text-foreground"
                  onClick={() => set({ colour: null })}
                >
                  reset
                </button>
              )}
            </label>

            <div className="flex gap-2">
              <NumberRow
                label="width"
                value={custom?.lineWidth}
                placeholder="1"
                min={0.25}
                max={10}
                step={0.25}
                onCommit={(lineWidth) => set({ lineWidth })}
              />
              <NumberRow
                label="label px"
                value={custom?.fontSize}
                placeholder="auto"
                min={6}
                max={36}
                step={1}
                onCommit={(fontSize) => set({ fontSize })}
              />
              <NumberRow
                label="caps px"
                value={custom?.capLength}
                placeholder="0"
                min={0}
                max={40}
                step={1}
                onCommit={(capLength) => set({ capLength })}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
