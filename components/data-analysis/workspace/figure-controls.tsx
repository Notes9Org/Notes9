"use client"

/**
 * Two controls the AI could already reach and a hand could not.
 *
 * T0.25 — jitter. `SeriesStyle.jitter` is in the schema, `figure.setSeriesStyle`
 *   carries it and the Plotly adapter draws it, but jitter has no home on
 *   `ChartState`, so the rail's own series inspector could not hold it and
 *   nothing offered it. It rides the overlay instead: `splitApprovedMutations`
 *   keeps a mutation the rail cannot express and replays it on every
 *   derivation, which is the same road a dragged significance bracket takes.
 *
 * T0.25 — aspect ratio. Absent on BOTH paths: no control, and no mutation an
 *   assistant could send either, because "aspect is derived, not stored twice"
 *   (`FigureSpec.width`/`height`). So this is a control over the two numbers
 *   that are stored, emitting the `figure.setDimensions` the spec already has.
 *   No new spec field, and a ratio typed by an assistant as a width and a
 *   height lands in exactly the same place.
 *
 * Both emit mutations and hold nothing, for the reason the rail refactor
 * exists: a control that moves the picture and leaves no mutation cannot be
 * undone and cannot be defended against a later patch.
 */

import { useId } from "react"

import type { SpecMutation } from "@/lib/data-analysis/spec/mutations"

/**
 * Named ratios, plus the escape hatch.
 *
 * 4:3 and 3:2 are the print-figure shapes; 16:9 is the slide; 1:1 is what a
 * correlation matrix or a heatmap wants so the cells come out square.
 */
export const ASPECT_RATIOS: { id: string; label: string; ratio: number }[] = [
  { id: "16:9", label: "16:9", ratio: 16 / 9 },
  { id: "3:2", label: "3:2", ratio: 3 / 2 },
  { id: "4:3", label: "4:3", ratio: 4 / 3 },
  { id: "1:1", label: "1:1", ratio: 1 },
  { id: "3:4", label: "3:4 (portrait)", ratio: 3 / 4 },
]

/** The schema's own bounds on `FigureSpec.width`/`height`. */
const MIN_PX = 120
const MAX_PX = 4000

const clamp = (n: number) => Math.min(MAX_PX, Math.max(MIN_PX, Math.round(n)))

/**
 * Which named ratio a width and height are, or null for anything else.
 *
 * Compared with a tolerance because the dimensions are integers: 720x405 is
 * 16:9 to any reader, and 1.7778 !== 1.7777... to a computer.
 */
export function matchAspect(width: number, height: number): string | null {
  if (!(height > 0)) return null
  const actual = width / height
  const hit = ASPECT_RATIOS.find((r) => Math.abs(r.ratio - actual) < 0.01)
  return hit ? hit.id : null
}

/**
 * The dimensions a chosen ratio implies.
 *
 * The longer edge is held and the shorter one moves, so picking a ratio never
 * silently grows a figure past the size someone chose for it — and the result
 * is clamped into the schema's range rather than producing a spec that will not
 * parse.
 */
export function dimensionsForAspect(width: number, height: number, ratio: number): { width: number; height: number } {
  return ratio >= 1
    ? { width: clamp(width), height: clamp(width / ratio) }
    : { width: clamp(height * ratio), height: clamp(height) }
}

export function AspectRatioField({
  width,
  height,
  onMutate,
}: {
  width: number
  height: number
  onMutate: (mutation: SpecMutation) => void
}) {
  const id = useId()
  const current = matchAspect(width, height)
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-[11px] text-muted-foreground">
        Aspect ratio
      </label>
      <div className="flex items-center gap-2">
        <select
          id={id}
          className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs"
          value={current ?? "custom"}
          onChange={(e) => {
            const hit = ASPECT_RATIOS.find((r) => r.id === e.target.value)
            if (!hit) return
            onMutate({ kind: "figure.setDimensions", ...dimensionsForAspect(width, height, hit.ratio) })
          }}
        >
          {current === null && <option value="custom">Custom</option>}
          {ASPECT_RATIOS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
        {/* The numbers in words, not just a shape: this is the figure that gets
            exported, and "16:9" alone does not say how big. */}
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
          {Math.round(width)}&times;{Math.round(height)} px
        </span>
      </div>
      {/* Said out loud because the preview on this page autosizes to its
          container: these are the dimensions the EXPORT and the figure panel
          use, which is where a journal's aspect ratio actually matters. */}
      <p className="text-[10px] text-muted-foreground">Shape of the exported figure.</p>
    </div>
  )
}

/**
 * Point spread for one series.
 *
 * The spec stores jitter as a fraction of the category width; 0 is off, and the
 * renderer treats anything above 0 as a horizontal spread on overlaid points.
 */
export function JitterField({
  seriesKey,
  value,
  onMutate,
}: {
  seriesKey: string
  value: number
  onMutate: (mutation: SpecMutation) => void
}) {
  const id = useId()
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="w-24 shrink-0 text-[11px] text-muted-foreground">
        Point jitter
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={0.5}
        step={0.05}
        value={value}
        className="h-1 min-w-0 flex-1 accent-[var(--n9-accent,#965034)]"
        onChange={(e) =>
          onMutate({ kind: "figure.setSeriesStyle", seriesKey, patch: { jitter: Number(e.target.value) } })
        }
      />
      <span className="w-8 shrink-0 text-right font-mono text-[11px] text-muted-foreground">{value.toFixed(2)}</span>
    </div>
  )
}
