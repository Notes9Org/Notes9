"use client"

import * as React from "react"
import type {
  Config,
  Data,
  Layout,
  PlotlyHTMLElement,
  PlotRelayoutEvent,
  PlotRestyleEvent,
} from "plotly.js"

import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import type { FigureSpec } from "@/types/analysis"

export interface PlotlyFigureProps {
  /** `null` while the analysis is still running / the spec hasn't loaded. */
  spec: FigureSpec | null
  /** Pan/zoom, axis-range and layout drags coming back off the canvas. */
  onRelayout?: (event: PlotRelayoutEvent) => void
  /** Trace-level edits (legend click, colour picks from the modebar). */
  onRestyle?: (event: PlotRestyleEvent) => void
  className?: string
}

/**
 * Thin Plotly host. Deliberately NOT `react-plotly.js`, that wrapper is barely
 * maintained and all it buys us is the ~40 lines below.
 *
 * The bundle is imported *inside* the effect so `plotly.min.js` (~3 MB) never
 * enters the shared chunk; the page is expected to additionally wrap this in
 * `next/dynamic({ ssr: false })` so it isn't pulled into the server graph.
 *
 * Updates go through `Plotly.react`, which diffs against the live figure and
 * mutates in place, that in-place diff is what makes Format-panel and JSON
 * edits feel instant instead of a full teardown/redraw per keystroke.
 */
export function PlotlyFigure({ spec, onRelayout, onRestyle, className }: PlotlyFigureProps) {
  const nodeRef = React.useRef<HTMLDivElement>(null)
  const plotlyRef = React.useRef<typeof import("plotly.js-dist-min").default | null>(null)
  const boundRef = React.useRef(false)
  const [ready, setReady] = React.useState(false)

  // Callbacks live in a ref so a new inline handler on the parent never forces
  // us to rebind Plotly's emitter (it has no per-listener removal).
  const handlersRef = React.useRef({ onRelayout, onRestyle })
  handlersRef.current = { onRelayout, onRestyle }

  React.useEffect(() => {
    const node = nodeRef.current
    if (!node || !spec) return

    let cancelled = false
    void (async () => {
      const Plotly = plotlyRef.current ?? (await import("plotly.js-dist-min")).default
      if (cancelled) return
      plotlyRef.current = Plotly

      await Plotly.react(
        node,
        spec.data as unknown as Data[],
        spec.layout as Partial<Layout>,
        spec.config as Partial<Config>,
      )
      if (cancelled) return
      setReady(true)

      // Bind once: `react()` keeps the same DOM node, so listeners survive
      // every subsequent update. Rebinding per spec change would stack them.
      if (!boundRef.current) {
        boundRef.current = true
        const el = node as unknown as PlotlyHTMLElement
        el.on("plotly_relayout", (event) => handlersRef.current.onRelayout?.(event))
        el.on("plotly_restyle", (event) => handlersRef.current.onRestyle?.(event))
      }
    })()

    return () => {
      cancelled = true
    }
  }, [spec])

  // Purge only on unmount, Plotly leaks its WebGL contexts and resize
  // listeners otherwise.
  React.useEffect(() => {
    const node = nodeRef.current
    return () => {
      if (node && plotlyRef.current) plotlyRef.current.purge(node)
      boundRef.current = false
    }
  }, [])

  return (
    <div className={cn("relative min-h-64 w-full", className)}>
      <div ref={nodeRef} className="h-full w-full" />
      {(!spec || !ready) && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Spinner className="size-4" />
          {spec ? "Rendering figure…" : "No figure yet"}
        </div>
      )}
    </div>
  )
}
