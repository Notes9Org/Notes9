"use client"

import * as React from "react"
import { ArrowUUpLeft, ArrowUUpRight } from "@phosphor-icons/react/ssr"
import type { PlotRelayoutEvent, PlotRestyleEvent } from "plotly.js"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { AnalysisSpec, FigureSpec, Results } from "@/types/analysis"

import { FigureJsonPanel } from "./figure-json-panel"
import { FormatPanel } from "./format-panel"
import { PlotlyFigure } from "./plotly-figure"
import { useFigureSpec, type FigurePatchOp } from "./use-figure-spec"

const JSON_DIRTY_REASON =
  "Editing raw JSON — formatting controls resume when the editor loses focus."

/**
 * Plotly reports edits with flat, dotted keys (`xaxis.range[0]`,
 * `marker.color`). Convert one to the JSON pointer the store addresses by.
 */
export function plotlyKeyToPointer(key: string, prefix: string): string {
  const segments = key
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .map((segment) => segment.replace(/~/g, "~0").replace(/\//g, "~1"))
  return `${prefix}${segments.join("/")}`
}

function relayoutOps(event: PlotRelayoutEvent): FigurePatchOp[] {
  return Object.entries(event).map(([key, value]) => ({
    op: "replace",
    path: plotlyKeyToPointer(key, "/layout/"),
    value,
  }))
}

function restyleOps(event: PlotRestyleEvent): FigurePatchOp[] {
  const [update, traceIndices] = event
  const indices = traceIndices?.length ? traceIndices : [0]
  return Object.entries(update).flatMap(([key, value]) =>
    indices.map((traceIndex, position) => ({
      op: "replace" as const,
      path: plotlyKeyToPointer(key, `/data/${traceIndex}/`),
      // ponytail: Plotly's restyle convention is one array entry per affected
      // trace, cycling if short. A trace property whose own value is an array
      // (per-point `marker.color`) would be misread here — switch on the key if
      // that ever ships.
      value: Array.isArray(value) ? value[position % value.length] : value,
    })),
  )
}

/**
 * An empty seed so the store always holds a real `FigureSpec`, even before the
 * analysis has produced one. `data: []` is what the canvas reads as "nothing to
 * plot yet".
 */
const EMPTY_FIGURE: FigureSpec = {
  data: [],
  layout: {},
  config: {},
  meta: {
    template: "",
    test_name: "",
    error_bar: "none",
    n_per_group: {},
    palette: [],
    alpha: 0.05,
    width_mm: 85,
    font_pt: 7,
  },
}

export interface AnalysisWorkspaceProps {
  /**
   * The figure to render and edit (`analyses.figure_spec`). Optional so the
   * page can mount the workspace before the run finishes; the canvas shows an
   * empty state until it arrives, and a later value re-seeds the store.
   */
  figureSpec?: FigureSpec | null
  /**
   * Alias for `figureSpec`. Both names exist only because the page and this
   * component were built in parallel — collapse to one once the page settles.
   */
  initialSpec?: FigureSpec | null
  /** The analysis being viewed — used for the canvas empty state. */
  spec?: AnalysisSpec
  /** Statistical output; `null` until the run completes. */
  results?: Results | null
  /** Results / plan rail. `children` is accepted as an alias. */
  leftPanel?: React.ReactNode
  children?: React.ReactNode
  /** Source-data table, rendered in the drawer under the canvas. */
  dataDrawer?: React.ReactNode
  /** Fired on every committed figure edit — persistence lives in the page. */
  onFigureSpecChange?: (spec: FigureSpec) => void
  className?: string
}

/**
 * Three-zone figure workspace: results rail, live canvas (+ data drawer), and a
 * right panel that toggles between the Format controls and the raw JSON.
 *
 * Both right-hand panels stay MOUNTED and are hidden with `hidden` rather than
 * unmounted: it keeps CodeMirror's document and the Format scroll position
 * alive across toggles, and it is what lets the Format panel be *disabled*
 * (per spec) rather than merely absent while the JSON editor holds the spec.
 */
export function AnalysisWorkspace({
  figureSpec: figureSpecProp,
  initialSpec,
  spec: analysisSpec,
  results,
  leftPanel,
  children,
  dataDrawer,
  onFigureSpecChange,
  className,
}: AnalysisWorkspaceProps) {
  const figureSpec = figureSpecProp ?? initialSpec ?? null
  const store = useFigureSpec(figureSpec ?? EMPTY_FIGURE)
  const { spec, dispatch, editingSource, setEditingSource, undo, redo, canUndo, canRedo } = store
  const [panel, setPanel] = React.useState<"format" | "json">("format")

  const jsonDirty = editingSource === "json"
  const hasFigure = spec.data.length > 0

  // `useReducer` only reads its seed once, so a figure that arrives after mount
  // (the run finished, or the page refetched) has to be pushed in.
  const seedRef = React.useRef(figureSpec)
  React.useEffect(() => {
    if (figureSpec && figureSpec !== seedRef.current) {
      seedRef.current = figureSpec
      dispatch({ type: "REPLACE_SPEC", spec: figureSpec })
    }
  }, [figureSpec, dispatch])

  const onChangeRef = React.useRef(onFigureSpecChange)
  onChangeRef.current = onFigureSpecChange
  const firstSpecRef = React.useRef(spec)
  React.useEffect(() => {
    if (spec !== firstSpecRef.current) onChangeRef.current?.(spec)
  }, [spec])

  const handleRelayout = React.useCallback(
    (event: PlotRelayoutEvent) => {
      const ops = relayoutOps(event)
      if (ops.length > 0) dispatch({ type: "APPLY_PATCH", ops })
    },
    [dispatch],
  )

  const handleRestyle = React.useCallback(
    (event: PlotRestyleEvent) => {
      const ops = restyleOps(event)
      if (ops.length > 0) dispatch({ type: "APPLY_PATCH", ops })
    },
    [dispatch],
  )

  const handleJsonCommit = React.useCallback(
    (next: FigureSpec) => dispatch({ type: "REPLACE_SPEC", spec: next }),
    [dispatch],
  )

  const handleJsonFocus = React.useCallback(
    (focused: boolean) => setEditingSource(focused ? "json" : null),
    [setEditingSource],
  )

  return (
    // The drawer sits BELOW the three columns, not inside the canvas column —
    // it describes the whole figure, so it spans the whole width.
    <div className={cn("flex min-h-0 flex-col gap-4", className)}>
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)_minmax(18rem,24rem)]">
        <aside className="min-w-0 overflow-y-auto">{leftPanel ?? children}</aside>

      <main className="flex min-h-0 min-w-0 flex-col gap-4">
        <div className="flex min-h-64 flex-1 items-center justify-center rounded-xl border border-[color:var(--glass-border)] bg-[color:var(--glass-bg)] p-3">
          {hasFigure ? (
            <PlotlyFigure
              spec={spec}
              onRelayout={handleRelayout}
              onRestyle={handleRestyle}
              className="h-full"
            />
          ) : (
            <p className="max-w-sm text-center text-sm text-muted-foreground">
              {results
                ? "This analysis has results but no figure yet."
                : `Run ${analysisSpec?.analysis_type ?? "the analysis"} to generate a figure.`}
            </p>
          )}
        </div>
      </main>

      <aside className="flex min-h-0 min-w-0 flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          {/* Mirrors ViewModeToggle so every segmented switch in the app looks alike. */}
          <div className="n9-grain inline-flex gap-1 rounded-xl border border-[color:var(--glass-border)] bg-[color:var(--glass-bg)] p-1 backdrop-blur-md">
            <Button
              variant={panel === "format" ? "default" : "ghost"}
              size="sm"
              onClick={() => setPanel("format")}
              aria-pressed={panel === "format"}
            >
              Format
            </Button>
            <Button
              variant={panel === "json" ? "default" : "ghost"}
              size="sm"
              onClick={() => setPanel("json")}
              aria-pressed={panel === "json"}
            >
              JSON
            </Button>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={undo}
              disabled={!canUndo}
              aria-label="Undo figure change"
            >
              <ArrowUUpLeft className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={redo}
              disabled={!canRedo}
              aria-label="Redo figure change"
            >
              <ArrowUUpRight className="size-4" />
            </Button>
          </div>
        </div>

        <div className={cn("min-h-0 flex-1 overflow-y-auto", panel !== "format" && "hidden")}>
          <FormatPanel
            spec={spec}
            dispatch={dispatch}
            disabled={jsonDirty}
            disabledReason={JSON_DIRTY_REASON}
          />
        </div>
        <div className={cn("min-h-0 flex-1", panel !== "json" && "hidden")}>
          <FigureJsonPanel
            spec={spec}
            onCommit={handleJsonCommit}
            focused={jsonDirty}
            onFocusChange={handleJsonFocus}
            className="h-full"
          />
        </div>
      </aside>
      </div>

      {dataDrawer && <div className="min-w-0 shrink-0 overflow-x-auto">{dataDrawer}</div>}
    </div>
  )
}
