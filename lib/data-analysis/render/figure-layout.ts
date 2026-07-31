/**
 * Multi-panel figure layouts.
 *
 * A published figure is almost never one chart. It is Figure 2 with panels A,
 * B and C, and those panels routinely come from different experiments — the
 * dose-response from one plate, the timecourse from another, the survival curve
 * from a third. So a layout composes PANELS, each bound to its own analysis
 * pipeline, rather than trying to squeeze several datasets into one chart.
 *
 * The panels are laid out with CSS grid and each one renders its own Plotly
 * figure, rather than using Plotly's own subplot support. That is a deliberate
 * choice with real consequences:
 *
 *   - each panel keeps its own axes, legend, chart kind and error-bar setting,
 *     which subplots would force into one shared layout;
 *   - each panel keeps its own hit-testing, so clicking a mark in panel B still
 *     resolves to a row in panel B's sheet — the data-to-figure link in §2 Tier
 *     0 would otherwise break the moment a figure had two panels;
 *   - a panel can be recomputed on its own, because it is its own spec.
 *
 * The cost is that exporting is a composition step rather than a single call,
 * which `composeLayoutPng` handles.
 */

import type { AnalysisSpec } from "@/lib/data-analysis/spec/analysis-spec"

export interface FigurePanel {
  id: string
  /** The pipeline whose figure this panel draws. Null while unassigned. */
  pipelineId: string | null
  /** Columns and rows this panel occupies in the grid. */
  colSpan: number
  rowSpan: number
  /** Overrides the automatic letter when a journal demands a specific one. */
  labelOverride: string | null
}

export type PanelLabelStyle = "upper" | "lower" | "numeric" | "none"

export interface FigureLayout {
  id: string
  name: string
  columns: number
  panels: FigurePanel[]
  labelStyle: PanelLabelStyle
  /** Gap between panels, in px. */
  gap: number
  /** Export width in px; height follows from the grid. */
  exportWidth: number
  /** Shared title above the whole figure, e.g. "Figure 2". */
  title: string
}

/* ── Presets ───────────────────────────────────────────────────────────────*/

export interface LayoutPreset {
  id: string
  label: string
  /** Rendered in the picker as a miniature of the grid. */
  columns: number
  spans: { colSpan: number; rowSpan: number }[]
  note: string
}

/**
 * The arrangements journals actually print.
 *
 * Deliberately a short list. An arbitrary grid builder is more powerful and
 * much worse to use: a figure has to fit a column or a page width, and almost
 * every real figure is one of these.
 */
export const LAYOUT_PRESETS: LayoutPreset[] = [
  { id: "single", label: "Single", columns: 1, spans: [{ colSpan: 1, rowSpan: 1 }], note: "One panel, full width." },
  {
    id: "side-by-side",
    label: "Two across",
    columns: 2,
    spans: [
      { colSpan: 1, rowSpan: 1 },
      { colSpan: 1, rowSpan: 1 },
    ],
    note: "A and B side by side; the usual two-column figure.",
  },
  {
    id: "stacked",
    label: "Two stacked",
    columns: 1,
    spans: [
      { colSpan: 1, rowSpan: 1 },
      { colSpan: 1, rowSpan: 1 },
    ],
    note: "A above B, sharing the x range by eye.",
  },
  {
    id: "quad",
    label: "Two by two",
    columns: 2,
    spans: [
      { colSpan: 1, rowSpan: 1 },
      { colSpan: 1, rowSpan: 1 },
      { colSpan: 1, rowSpan: 1 },
      { colSpan: 1, rowSpan: 1 },
    ],
    note: "Four panels, the standard full-page figure.",
  },
  {
    id: "three-across",
    label: "Three across",
    columns: 3,
    spans: [
      { colSpan: 1, rowSpan: 1 },
      { colSpan: 1, rowSpan: 1 },
      { colSpan: 1, rowSpan: 1 },
    ],
    note: "Three narrow panels in a row.",
  },
  {
    id: "hero-top",
    label: "Wide over two",
    columns: 2,
    spans: [
      { colSpan: 2, rowSpan: 1 },
      { colSpan: 1, rowSpan: 1 },
      { colSpan: 1, rowSpan: 1 },
    ],
    note: "A spans the width; B and C sit beneath it.",
  },
  {
    id: "hero-left",
    label: "Tall beside two",
    columns: 2,
    spans: [
      { colSpan: 1, rowSpan: 2 },
      { colSpan: 1, rowSpan: 1 },
      { colSpan: 1, rowSpan: 1 },
    ],
    note: "A runs full height on the left; B and C stack on the right.",
  },
  {
    id: "six",
    label: "Three by two",
    columns: 3,
    spans: Array.from({ length: 6 }, () => ({ colSpan: 1, rowSpan: 1 })),
    note: "Six panels for a supplementary figure.",
  },
]

let panelSeq = 0
/** Ids are only unique within a session; layouts are persisted by value. */
function panelId(): string {
  panelSeq += 1
  return `panel-${panelSeq}`
}

export function layoutFromPreset(preset: LayoutPreset, name = "Figure 1"): FigureLayout {
  return {
    id: preset.id,
    name,
    columns: preset.columns,
    panels: preset.spans.map((span) => ({
      id: panelId(),
      pipelineId: null,
      colSpan: span.colSpan,
      rowSpan: span.rowSpan,
      labelOverride: null,
    })),
    labelStyle: "upper",
    gap: 16,
    exportWidth: 1600,
    title: "",
  }
}

/* ── Labels ────────────────────────────────────────────────────────────────*/

const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"

/**
 * The letter a panel carries.
 *
 * Position-derived, so inserting a panel relabels everything after it, which is
 * what a reader expects: panel C is always the third panel. An explicit
 * override wins, for the journal that asks for "A", "B", "B'".
 */
export function panelLabel(layout: FigureLayout, index: number): string {
  const panel = layout.panels[index]
  if (panel?.labelOverride) return panel.labelOverride
  switch (layout.labelStyle) {
    case "none":
      return ""
    case "numeric":
      return String(index + 1)
    case "lower":
      return (UPPER[index % 26] ?? "?").toLowerCase()
    case "upper":
    default:
      return UPPER[index % 26] ?? "?"
  }
}

/* ── Grid maths ────────────────────────────────────────────────────────────*/

export interface PanelPlacement {
  panel: FigurePanel
  index: number
  label: string
  /** 1-based CSS grid lines. */
  column: number
  row: number
}

/**
 * Where each panel actually lands.
 *
 * Resolved rather than left to CSS auto-placement so the export can draw the
 * same arrangement onto a canvas, and so a panel that cannot fit the declared
 * column count is caught here instead of silently wrapping in the browser and
 * differing from the exported file.
 */
export function placePanels(layout: FigureLayout): PanelPlacement[] {
  const columns = Math.max(1, layout.columns)
  const occupied: boolean[][] = []
  const at = (row: number, col: number) => occupied[row]?.[col] ?? false
  const mark = (row: number, col: number) => {
    if (!occupied[row]) occupied[row] = []
    occupied[row][col] = true
  }

  const out: PanelPlacement[] = []
  for (const [index, panel] of layout.panels.entries()) {
    const colSpan = Math.max(1, Math.min(columns, panel.colSpan))
    const rowSpan = Math.max(1, panel.rowSpan)
    let placed = false
    for (let row = 0; row < layout.panels.length * 2 + 2 && !placed; row++) {
      for (let col = 0; col + colSpan <= columns && !placed; col++) {
        let free = true
        for (let r = row; r < row + rowSpan && free; r++) {
          for (let c = col; c < col + colSpan && free; c++) {
            if (at(r, c)) free = false
          }
        }
        if (!free) continue
        for (let r = row; r < row + rowSpan; r++) {
          for (let c = col; c < col + colSpan; c++) mark(r, c)
        }
        out.push({
          panel,
          index,
          label: panelLabel(layout, index),
          column: col + 1,
          row: row + 1,
        })
        placed = true
      }
    }
  }
  return out
}

/** Rows the grid needs, derived from the placement rather than assumed. */
export function layoutRowCount(layout: FigureLayout): number {
  const placements = placePanels(layout)
  return placements.reduce(
    (max, p) => Math.max(max, p.row + Math.max(1, p.panel.rowSpan) - 1),
    1
  )
}

/* ── Mutations ─────────────────────────────────────────────────────────────*/

export function assignPanel(
  layout: FigureLayout,
  panelId: string,
  pipelineId: string | null
): FigureLayout {
  return {
    ...layout,
    panels: layout.panels.map((p) => (p.id === panelId ? { ...p, pipelineId } : p)),
  }
}

export function addPanel(layout: FigureLayout): FigureLayout {
  return {
    ...layout,
    panels: [
      ...layout.panels,
      { id: panelId(), pipelineId: null, colSpan: 1, rowSpan: 1, labelOverride: null },
    ],
  }
}

export function removePanel(layout: FigureLayout, id: string): FigureLayout {
  // Never leave a layout with nothing in it; an empty canvas has no affordance
  // to add the first panel back.
  if (layout.panels.length <= 1) return layout
  return { ...layout, panels: layout.panels.filter((p) => p.id !== id) }
}

export function movePanel(layout: FigureLayout, id: string, delta: number): FigureLayout {
  const from = layout.panels.findIndex((p) => p.id === id)
  if (from === -1) return layout
  const to = Math.max(0, Math.min(layout.panels.length - 1, from + delta))
  if (from === to) return layout
  const panels = [...layout.panels]
  const [moved] = panels.splice(from, 1)
  panels.splice(to, 0, moved)
  return { ...layout, panels }
}

export function setPanelSpan(
  layout: FigureLayout,
  id: string,
  span: { colSpan?: number; rowSpan?: number }
): FigureLayout {
  return {
    ...layout,
    panels: layout.panels.map((p) =>
      p.id === id
        ? {
            ...p,
            colSpan: Math.max(1, Math.min(layout.columns, span.colSpan ?? p.colSpan)),
            rowSpan: Math.max(1, Math.min(4, span.rowSpan ?? p.rowSpan)),
          }
        : p
    ),
  }
}

/**
 * A caption naming what each panel shows.
 *
 * Built from the panels' own specs so the caption cannot describe a figure
 * other than the one drawn. It is a starting point for the author, not a
 * finished legend — which is why it names the source rather than interpreting
 * the result.
 */
export function draftLayoutCaption(
  layout: FigureLayout,
  specs: Record<string, { spec: AnalysisSpec; name: string }>
): string {
  const parts: string[] = []
  for (const placement of placePanels(layout)) {
    const bound = placement.panel.pipelineId ? specs[placement.panel.pipelineId] : null
    if (!bound) continue
    const title = bound.spec.figure.title || bound.name
    parts.push(placement.label ? `(${placement.label}) ${title}.` : `${title}.`)
  }
  if (parts.length === 0) return ""
  const prefix = layout.title ? `${layout.title}. ` : ""
  return prefix + parts.join(" ")
}
