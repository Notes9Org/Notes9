"use client"

/**
 * Free-text and arrow annotations, by hand.
 *
 * T0.28: these render and are fully promptable — `figure.addAnnotation`,
 * `figure.updateAnnotation` and `figure.removeAnnotation` are typed, applied
 * and drawn by the Plotly adapter — and there was no control anywhere that
 * emitted one. A researcher could ask for an arrow and could not draw one.
 *
 * Every edit leaves the same typed mutation an assistant patch would, on the
 * same history, through the parent's `applySpecMutation`. Nothing here holds
 * figure state of its own; the spec is the record (Law 1).
 *
 * ponytail: placement is numeric (data coordinates), not drag-on-canvas.
 * Dragging needs a hit-tested overlay on the Plotly surface and is a change of
 * its own; the numbers are the honest control that reaches the same spec field,
 * and a drag can set the same two numbers later.
 */

import { useId, useState } from "react"

import type { Annotation } from "@/lib/data-analysis/spec/analysis-spec"
import type { SpecMutation } from "@/lib/data-analysis/spec/mutations"

/**
 * Annotation ids are the spec's own identity for the thing, capped at 64 chars
 * by the schema. `crypto.randomUUID` is not universally available (older
 * Safari, and it is undefined on insecure origins), so this feature-detects
 * rather than throwing at the moment the researcher clicks "Add".
 */
export function annotationId(prefix: string): string {
  const c = typeof globalThis !== "undefined" ? globalThis.crypto : undefined
  const unique = c && typeof c.randomUUID === "function" ? c.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  return `${prefix}-${unique}`.slice(0, 64)
}

/** A new text note, placed at the origin of the data the researcher can see. */
export function newTextAnnotation(x: number, y: number): Annotation {
  return { kind: "text", id: annotationId("text"), x, y, text: "Note", fontSize: 12, colour: "#000000" }
}

/** A new arrow, drawn as a short segment the researcher then aims. */
export function newArrowAnnotation(x: number, y: number): Annotation {
  return { kind: "arrow", id: annotationId("arrow"), x1: x, y1: y, x2: x + 1, y2: y + 1, colour: "#000000" }
}

function NumberField({
  label,
  value,
  onCommit,
}: {
  label: string
  value: number
  onCommit: (v: number) => void
}) {
  const id = useId()
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <label htmlFor={id} className="flex flex-1 items-center gap-1 text-[10px] text-muted-foreground">
      {label}
      <input
        id={id}
        type="number"
        className="h-7 w-full min-w-0 rounded-md border border-border bg-background px-1.5 text-xs text-foreground"
        value={draft ?? String(value)}
        onChange={(e) => {
          setDraft(e.target.value)
          const n = Number(e.target.value)
          // Only a number reaches the spec. A half-typed "-" or "" stays in the
          // draft rather than writing NaN into the figure.
          if (e.target.value.trim() !== "" && Number.isFinite(n)) onCommit(n)
        }}
        onBlur={() => setDraft(null)}
      />
    </label>
  )
}

export function AnnotationsPanel({
  annotations,
  /** Where a new annotation lands: the middle of the plotted data. */
  origin,
  onMutate,
}: {
  annotations: Annotation[]
  origin: { x: number; y: number }
  onMutate: (mutation: SpecMutation) => void
}) {
  const update = (id: string, patch: Partial<Annotation>) => onMutate({ kind: "figure.updateAnnotation", id, patch })

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button
          type="button"
          className="h-8 flex-1 rounded-md border border-border text-xs hover:bg-muted/50"
          onClick={() => onMutate({ kind: "figure.addAnnotation", annotation: newTextAnnotation(origin.x, origin.y) })}
        >
          Add text
        </button>
        <button
          type="button"
          className="h-8 flex-1 rounded-md border border-border text-xs hover:bg-muted/50"
          onClick={() => onMutate({ kind: "figure.addAnnotation", annotation: newArrowAnnotation(origin.x, origin.y) })}
        >
          Add arrow
        </button>
      </div>

      {annotations.length === 0 && (
        <p className="py-1 text-[11px] text-muted-foreground">No annotations on this figure yet.</p>
      )}

      {annotations.map((a) => (
        <div key={a.id} className="space-y-1 rounded-md border border-border p-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{a.kind}</span>
            <button
              type="button"
              className="text-[11px] text-destructive hover:underline"
              onClick={() => onMutate({ kind: "figure.removeAnnotation", id: a.id })}
            >
              Remove
            </button>
          </div>

          {a.kind === "text" && (
            <>
              <input
                aria-label="Annotation text"
                className="h-7 w-full rounded-md border border-border bg-background px-1.5 text-xs"
                value={a.text}
                onChange={(e) => update(a.id, { text: e.target.value })}
              />
              <div className="flex gap-2">
                <NumberField label="x" value={a.x} onCommit={(x) => update(a.id, { x })} />
                <NumberField label="y" value={a.y} onCommit={(y) => update(a.id, { y })} />
              </div>
            </>
          )}

          {a.kind === "arrow" && (
            <>
              <div className="flex gap-2">
                <NumberField label="from x" value={a.x1} onCommit={(x1) => update(a.id, { x1 })} />
                <NumberField label="from y" value={a.y1} onCommit={(y1) => update(a.id, { y1 })} />
              </div>
              <div className="flex gap-2">
                <NumberField label="to x" value={a.x2} onCommit={(x2) => update(a.id, { x2 })} />
                <NumberField label="to y" value={a.y2} onCommit={(y2) => update(a.id, { y2 })} />
              </div>
            </>
          )}

          {a.kind !== "shape" && (
            <label className="flex items-center gap-2 text-[10px] text-muted-foreground">
              Colour
              <input
                type="color"
                aria-label="Annotation colour"
                className="h-6 w-10 rounded border border-border bg-background"
                value={a.colour}
                onChange={(e) => update(a.id, { colour: e.target.value })}
              />
              <span className="font-mono text-foreground/70">{a.colour}</span>
            </label>
          )}
        </div>
      ))}
    </div>
  )
}
