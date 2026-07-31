"use client"

/**
 * The live figure (L5).
 *
 * Plotly is loaded dynamically because it is large and cannot run during SSR;
 * until it arrives the canvas holds its space rather than collapsing, so the
 * workspace does not jump when the chart appears.
 *
 * Two things here are load-bearing beyond drawing:
 *
 *  - Every mark carries its source row id in `customdata`, which is what makes
 *    the data-figure link in §2 Tier 0 real: hovering a point identifies the
 *    row, clicking selects it in the sheet, and right-clicking opens the
 *    exclusion dialog for it. A figure whose points cannot be traced back to
 *    rows is a picture, and the first architectural law says this is a spec.
 *
 *  - Style changes re-layout in place via Plotly.react rather than tearing the
 *    plot down, which is what lets Law 5 hold visibly: a palette change is a
 *    frame, not a recompute.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowClockwise, ChartLine } from "@phosphor-icons/react/ssr"

import { cn } from "@/lib/utils"
import type { AnalysisSpec } from "@/lib/data-analysis/spec/analysis-spec"
import type { EngineResult } from "@/lib/data-analysis/engine/contract"
import { buildFigure } from "@/lib/data-analysis/render/plotly-adapter"

/** The slice of the Plotly API this component uses. */
interface PlotlyApi {
  react: (
    el: HTMLElement,
    data: Record<string, unknown>[],
    layout: Record<string, unknown>,
    config: Record<string, unknown>
  ) => Promise<unknown>
  purge: (el: HTMLElement) => void
  Plots: { resize: (el: HTMLElement) => void }
}

interface PlotlyEventPoint {
  customdata?: unknown
  pointIndex?: number
  curveNumber?: number
}

type PlotlyDiv = HTMLDivElement & {
  on?: (event: string, handler: (e: { points?: PlotlyEventPoint[] }) => void) => void
  removeAllListeners?: (event: string) => void
}

let plotlyPromise: Promise<PlotlyApi> | null = null

/** One shared import; every canvas in the session reuses the same module. */
function loadPlotly(): Promise<PlotlyApi> {
  if (!plotlyPromise) {
    plotlyPromise = import("plotly.js-dist-min").then(
      (m) => ((m as { default?: PlotlyApi }).default ?? m) as unknown as PlotlyApi
    )
  }
  return plotlyPromise
}

const CONFIG = {
  displaylogo: false,
  responsive: true,
  // The product has its own export path that stamps provenance onto the file,
  // so Plotly's bare camera button is removed rather than offering a second,
  // unlabelled way to get an image out.
  modeBarButtonsToRemove: ["toImage", "lasso2d", "select2d", "autoScale2d"],
  toImageButtonOptions: { format: "png", scale: 3 },
}

export function FigureCanvas({
  spec,
  result,
  onSelectRow,
  onExcludeRow,
  className,
}: {
  spec: AnalysisSpec
  result: EngineResult | null
  /** A mark was clicked. Used to reveal the row in the data pane. */
  onSelectRow?: (rowId: string) => void
  /** A mark was right-clicked. Opens the reasoned-exclusion dialog (§8.1). */
  onExcludeRow?: (rowId: string) => void
  className?: string
}) {
  const host = useRef<PlotlyDiv | null>(null)
  const api = useRef<PlotlyApi | null>(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [hovered, setHovered] = useState<string | null>(null)

  // Kept in refs so the draw effect does not re-run (and re-render Plotly) every
  // time a parent passes a fresh callback identity.
  const selectRef = useRef(onSelectRow)
  const excludeRef = useRef(onExcludeRow)
  selectRef.current = onSelectRow
  excludeRef.current = onExcludeRow

  const rowIdAt = (points?: PlotlyEventPoint[]): string | null => {
    const raw = points?.[0]?.customdata
    return typeof raw === "string" && raw.length > 0 ? raw : null
  }

  useEffect(() => {
    let cancelled = false
    loadPlotly().then(
      (p) => {
        if (cancelled) return
        api.current = p
        setReady(true)
      },
      () => {
        if (!cancelled) setFailed(true)
      }
    )
    return () => {
      cancelled = true
    }
  }, [])

  const hasData = Boolean(result && (result.plotData.length > 0 || result.curveFit))

  useEffect(() => {
    const el = host.current
    const plotly = api.current
    if (!ready || !el || !plotly || !hasData) return

    const figure = buildFigure(spec, result, { fill: true })
    let disposed = false

    plotly
      .react(el, figure.data, figure.layout, CONFIG)
      .then(() => {
        if (disposed) return
        el.removeAllListeners?.("plotly_click")
        el.removeAllListeners?.("plotly_hover")
        el.removeAllListeners?.("plotly_unhover")
        el.on?.("plotly_click", (e) => {
          const id = rowIdAt(e.points)
          if (id) selectRef.current?.(id)
        })
        el.on?.("plotly_hover", (e) => setHovered(rowIdAt(e.points)))
        el.on?.("plotly_unhover", () => setHovered(null))
      })
      .catch(() => {
        if (!disposed) setFailed(true)
      })

    return () => {
      disposed = true
    }
  }, [ready, spec, result, hasData])

  // Plotly sizes to its container at draw time, so a docked panel opening or a
  // drag-resize has to tell it to measure again or the chart keeps its old box.
  useEffect(() => {
    const el = host.current
    if (!ready || !el || !hasData) return
    const observer = new ResizeObserver(() => {
      if (api.current && el.isConnected) api.current.Plots.resize(el)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [ready, hasData])

  useEffect(() => {
    const el = host.current
    return () => {
      if (el && api.current) api.current.purge(el)
    }
  }, [])

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    if (!excludeRef.current) return
    // Plotly does not emit a right-click event, so the hovered point is the one
    // the menu applies to. Without a hovered point the browser menu is left
    // alone rather than being swallowed for nothing.
    setHovered((current) => {
      if (current) {
        e.preventDefault()
        excludeRef.current?.(current)
      }
      return current
    })
  }, [])

  if (failed) {
    return (
      <Placeholder className={className}>
        The chart library could not be loaded. Check your connection and reload.
      </Placeholder>
    )
  }

  if (!hasData) {
    return (
      <Placeholder className={className}>
        {result
          ? "This analysis produced no plottable rows yet."
          : "Choose a test and a chart type to draw the figure."}
      </Placeholder>
    )
  }

  return (
    <div className={cn("relative min-h-[300px] flex-1", className)}>
      <div
        ref={host}
        onContextMenu={onContextMenu}
        className="h-full w-full"
        aria-label={spec.figure.title || "Analysis figure"}
        role="img"
      />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 text-[13px] text-muted-foreground">
          <ArrowClockwise className="size-3.5 animate-spin" />
          Preparing the figure
        </div>
      )}
      {hovered && onExcludeRow && (
        <p className="pointer-events-none absolute bottom-1 right-2 text-[11px] text-muted-foreground/70">
          Right-click this point to exclude it
        </p>
      )}
    </div>
  )
}

function Placeholder({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex min-h-[300px] flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 bg-muted/20 px-6 text-center text-[13px] text-muted-foreground",
        className
      )}
    >
      <ChartLine className="size-5 opacity-40" />
      {children}
    </div>
  )
}
