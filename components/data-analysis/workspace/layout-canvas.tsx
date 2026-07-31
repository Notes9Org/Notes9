"use client"

/**
 * The multi-panel figure canvas.
 *
 * Each panel renders its own figure from its own pipeline, positioned by the
 * layout's resolved grid. That keeps every panel independently interactive:
 * clicking a mark in panel B still resolves to a row in panel B's sheet, which
 * a single shared Plotly subplot grid could not do.
 *
 * Export composes the panels rather than screenshotting the page. Each Plotly
 * figure is asked for its own PNG at the export scale and drawn onto one canvas
 * at its grid position, with the panel letters painted on top. The result is
 * the figure at publication resolution rather than at whatever size the
 * browser window happened to be.
 */

import { useCallback, useRef, useState } from "react"
import { motion, useReducedMotion } from "framer-motion"
import {
  DownloadSimple,
  Plus,
  Trash,
  CaretLeft,
  CaretRight,
  ArrowSquareOut,
  WarningCircle,
} from "@phosphor-icons/react/ssr"

import { cn } from "@/lib/utils"
import type { AnalysisPipeline } from "@/lib/data-analysis/workspace/pipelines"
import {
  addPanel,
  assignPanel,
  draftLayoutCaption,
  layoutRowCount,
  movePanel,
  placePanels,
  removePanel,
  setPanelSpan,
  type FigureLayout,
} from "@/lib/data-analysis/render/figure-layout"
import { writeTiff } from "@/lib/data-analysis/chart-export"
import { ExportMenu } from "@/components/data-analysis/export-menu"
import type { ChartExportFn } from "@/components/data-analysis/plotly-chart"
import { FigureCanvas } from "./figure-canvas"
import { EASE_OUT, Reveal } from "./motion"

export function LayoutCanvas({
  layout,
  pipelines,
  onChange,
  onOpenPipeline,
  className,
}: {
  layout: FigureLayout
  pipelines: AnalysisPipeline[]
  onChange: (next: FigureLayout) => void
  /** Jump to a panel's analysis in the tab strip. */
  onOpenPipeline?: (pipelineId: string) => void
  className?: string
}) {
  const reduce = useReducedMotion()
  const gridRef = useRef<HTMLDivElement>(null)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const placements = placePanels(layout)
  const rows = layoutRowCount(layout)
  const byId = new Map(pipelines.map((p) => [p.id, p]))
  const caption = draftLayoutCaption(
    layout,
    Object.fromEntries(pipelines.map((p) => [p.id, { spec: p.spec, name: p.name }]))
  )

  /**
   * Compose and write the figure with the settings the export menu supplies.
   *
   * Width comes from the menu when it is given (a journal's column measure at
   * its DPI); otherwise the layout's own export width stands. The composer
   * handles the panel raster itself, so format and colour space are applied to
   * the composed canvas rather than to each panel.
   */
  const exportComposed = useCallback(
    async (opts: Parameters<ChartExportFn>[0]) => {
      setExporting(true)
      setExportError(null)
      try {
        await composeLayoutPng(
          { ...layout, exportWidth: opts.width ?? layout.exportWidth, title: layout.title },
          gridRef.current,
          {
            format: opts.format,
            dpi: opts.dpi,
            filename: opts.filename,
            transparent: opts.transparent,
            colourSpace: opts.colourSpace,
          }
        )
      } catch (err) {
        setExportError(err instanceof Error ? err.message : String(err))
      } finally {
        setExporting(false)
      }
    },
    [layout]
  )

  return (
    <div className={cn("flex min-h-0 flex-col gap-3", className)}>
      {/* Layout controls. Deliberately above the canvas rather than in the
          inspector: they change the shape of the figure, not the style of one
          panel, so they belong with the figure. */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={layout.title}
          onChange={(e) => onChange({ ...layout, title: e.target.value })}
          placeholder="Figure 1"
          aria-label="Figure title"
          className="h-8 w-40 rounded-md border border-border/70 bg-background px-2 text-[13px] outline-none transition-colors focus:border-[var(--n9-accent)]/50"
        />
        <label className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
          Columns
          <select
            value={layout.columns}
            onChange={(e) => onChange({ ...layout, columns: Number(e.target.value) })}
            className="h-8 rounded-md border border-border/70 bg-background px-2 text-[13px] outline-none"
          >
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
          Labels
          <select
            value={layout.labelStyle}
            onChange={(e) =>
              onChange({ ...layout, labelStyle: e.target.value as FigureLayout["labelStyle"] })
            }
            className="h-8 rounded-md border border-border/70 bg-background px-2 text-[13px] outline-none"
          >
            <option value="upper">A B C</option>
            <option value="lower">a b c</option>
            <option value="numeric">1 2 3</option>
            <option value="none">None</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => onChange(addPanel(layout))}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/70 px-2.5 text-[12.5px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Plus className="size-3.5" /> Add panel
        </button>
        {/* The same export menu the single figure uses. A composed figure is
            the one most likely to be the one submitted, so it needs the journal
            presets, the colour space and the exact dimensions at least as much. */}
        <div className="ml-auto">
          <ExportMenu
            variant="ghost"
            defaultName={layout.title || layout.name || "figure"}
            disabled={exporting}
            onExport={exportComposed}
          />
        </div>
      </div>

      {exportError && (
        <p className="flex items-center gap-1.5 text-[12.5px] text-amber-700 dark:text-amber-400">
          <WarningCircle className="size-3.5" weight="fill" />
          {exportError}
        </p>
      )}

      <div
        ref={gridRef}
        className="grid min-h-0 flex-1 auto-rows-fr"
        style={{
          gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, minmax(220px, 1fr))`,
          gap: layout.gap,
        }}
      >
        {placements.map((placement) => {
          const pipeline = placement.panel.pipelineId
            ? byId.get(placement.panel.pipelineId)
            : undefined
          return (
            <motion.section
              key={placement.panel.id}
              data-panel={placement.panel.id}
              aria-label={`Panel ${placement.label || placement.index + 1}`}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduce ? { duration: 0.12 } : { duration: 0.26, ease: EASE_OUT }}
              style={{
                gridColumn: `${placement.column} / span ${placement.panel.colSpan}`,
                gridRow: `${placement.row} / span ${placement.panel.rowSpan}`,
              }}
              className="group/panel relative flex min-h-0 flex-col overflow-hidden rounded-xl border border-border/50 bg-card"
            >
              {/* The panel letter. Absolutely positioned so it sits over the
                  figure exactly where a journal prints it. */}
              {placement.label && (
                <span
                  data-panel-label
                  className="pointer-events-none absolute left-3 top-2 z-[2] text-[15px] font-semibold text-foreground"
                >
                  {placement.label}
                </span>
              )}

              <div className="absolute right-2 top-2 z-[2] flex items-center gap-0.5 opacity-0 transition-opacity group-hover/panel:opacity-100 focus-within:opacity-100">
                <PanelButton
                  label="Move panel earlier"
                  onClick={() => onChange(movePanel(layout, placement.panel.id, -1))}
                >
                  <CaretLeft className="size-3" />
                </PanelButton>
                <PanelButton
                  label="Move panel later"
                  onClick={() => onChange(movePanel(layout, placement.panel.id, 1))}
                >
                  <CaretRight className="size-3" />
                </PanelButton>
                {pipeline && onOpenPipeline && (
                  <PanelButton
                    label="Open this analysis"
                    onClick={() => onOpenPipeline(pipeline.id)}
                  >
                    <ArrowSquareOut className="size-3" />
                  </PanelButton>
                )}
                <PanelButton
                  label="Remove panel"
                  onClick={() => onChange(removePanel(layout, placement.panel.id))}
                >
                  <Trash className="size-3" />
                </PanelButton>
              </div>

              <div className="flex min-h-0 flex-1 flex-col px-2 pb-2 pt-8">
                {pipeline?.result ? (
                  <FigureCanvas spec={pipeline.spec} result={pipeline.result} />
                ) : (
                  <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 bg-muted/20 p-4 text-center">
                    <p className="text-[12.5px] text-muted-foreground">
                      {pipeline
                        ? `"${pipeline.name}" has not been computed yet.`
                        : "Choose which analysis this panel shows."}
                    </p>
                    <select
                      value={placement.panel.pipelineId ?? ""}
                      onChange={(e) =>
                        onChange(
                          assignPanel(layout, placement.panel.id, e.target.value || null)
                        )
                      }
                      aria-label={`Analysis for panel ${placement.label || placement.index + 1}`}
                      className="h-8 rounded-md border border-border/70 bg-background px-2 text-[12.5px] outline-none"
                    >
                      <option value="">Not assigned</option>
                      {pipelines.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Source line: which analysis this panel draws, and the controls
                  to re-point or resize it. A panel whose source is unnamed is a
                  figure nobody can trace back to its data. */}
              {pipeline && (
                <div className="flex items-center gap-2 border-t border-border/40 px-3 py-1.5">
                  <select
                    value={placement.panel.pipelineId ?? ""}
                    onChange={(e) =>
                      onChange(assignPanel(layout, placement.panel.id, e.target.value || null))
                    }
                    aria-label={`Analysis for panel ${placement.label || placement.index + 1}`}
                    className="min-w-0 flex-1 truncate bg-transparent text-[11.5px] text-muted-foreground outline-none"
                  >
                    <option value="">Not assigned</option>
                    {pipelines.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground/70">
                    <SpanStepper
                      label="Width"
                      value={placement.panel.colSpan}
                      max={layout.columns}
                      onChange={(colSpan) =>
                        onChange(setPanelSpan(layout, placement.panel.id, { colSpan }))
                      }
                    />
                    <SpanStepper
                      label="Height"
                      value={placement.panel.rowSpan}
                      max={4}
                      onChange={(rowSpan) =>
                        onChange(setPanelSpan(layout, placement.panel.id, { rowSpan }))
                      }
                    />
                  </span>
                </div>
              )}
            </motion.section>
          )
        })}
      </div>

      {caption && (
        <Reveal className="rounded-xl border border-border/50 bg-card px-4 py-3">
          <p className="text-[12px] text-muted-foreground">Draft caption</p>
          <p className="mt-1 select-text text-[13.5px] leading-[1.7] text-foreground/85">
            {caption}
          </p>
        </Reveal>
      )}
    </div>
  )
}

function PanelButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="rounded bg-background/80 p-1 text-muted-foreground shadow-sm backdrop-blur-sm transition-colors hover:text-foreground"
    >
      {children}
    </button>
  )
}

function SpanStepper({
  label,
  value,
  max,
  onChange,
}: {
  label: string
  value: number
  max: number
  onChange: (value: number) => void
}) {
  return (
    <label className="inline-flex items-center gap-0.5" title={`${label} in grid cells`}>
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="bg-transparent text-[11px] outline-none"
      >
        {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
          <option key={n} value={n}>
            {label[0]}
            {n}
          </option>
        ))}
      </select>
    </label>
  )
}

/* ── Export ────────────────────────────────────────────────────────────────*/

interface PlotlyToImage {
  toImage: (
    el: HTMLElement,
    opts: { format: "png"; width: number; height: number; scale: number }
  ) => Promise<string>
}

/**
 * Draw every panel onto one canvas and download it.
 *
 * Each Plotly figure is re-rendered at the export size through `toImage` rather
 * than captured from the screen, so the exported figure is at publication
 * resolution instead of at whatever size the window happened to be. Panels are
 * placed using the layout's own resolved grid, which is why `placePanels` is a
 * pure function rather than left to CSS.
 */
export async function composeLayoutPng(
  layout: FigureLayout,
  gridEl: HTMLElement | null,
  options: {
    format?: "png" | "jpeg" | "tiff" | "svg"
    dpi?: number
    filename?: string
    transparent?: boolean
    colourSpace?: "rgb" | "cmyk"
  } = {}
): Promise<void> {
  const { format = "png", dpi = 300, transparent = false, colourSpace = "rgb" } = options
  if (format === "svg") {
    // A composed figure is a raster of several independent plots; there is no
    // single SVG to hand back without re-laying out every panel's vector
    // output, so say that rather than writing a PNG with an .svg name.
    throw new Error("Vector export is available per panel; the composed figure exports as a raster.")
  }
  if (!gridEl) throw new Error("The figure is not on screen yet.")
  const placements = placePanels(layout)
  const bound = placements.filter((p) => p.panel.pipelineId)
  if (bound.length === 0) throw new Error("Assign an analysis to at least one panel first.")

  const plotly = (await import("plotly.js-dist-min").then(
    (m) => (m as { default?: unknown }).default ?? m
  )) as PlotlyToImage

  const rows = layoutRowCount(layout)
  const gap = layout.gap
  const width = layout.exportWidth
  const cellW = (width - gap * (layout.columns - 1)) / layout.columns
  // Panels keep a 4:3 cell so a two-column figure is not letterboxed.
  const cellH = cellW * 0.75
  const titleH = layout.title ? 48 : 0
  const height = titleH + cellH * rows + gap * (rows - 1)

  const canvas = document.createElement("canvas")
  canvas.width = Math.round(width)
  canvas.height = Math.round(height)
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("This browser could not create the export canvas.")

  // White, not transparent: a transparent PNG dropped into a manuscript renders
  // black text on a black background in more than one word processor.
  if (!transparent) {
    // White, not transparent: a transparent PNG dropped into a manuscript
    // renders black text on a black background in more than one word processor.
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  if (layout.title) {
    ctx.fillStyle = "#111111"
    ctx.font = "600 26px ui-sans-serif, system-ui, sans-serif"
    ctx.textBaseline = "middle"
    ctx.fillText(layout.title, 0, titleH / 2)
  }

  for (const placement of placements) {
    if (!placement.panel.pipelineId) continue
    const host = gridEl.querySelector<HTMLElement>(
      `[data-panel="${CSS.escape(placement.panel.id)}"] .js-plotly-plot`
    )
    if (!host) continue

    const w = cellW * placement.panel.colSpan + gap * (placement.panel.colSpan - 1)
    const h = cellH * placement.panel.rowSpan + gap * (placement.panel.rowSpan - 1)
    const x = (placement.column - 1) * (cellW + gap)
    const y = titleH + (placement.row - 1) * (cellH + gap)

    const dataUrl = await plotly.toImage(host, {
      format: "png",
      width: Math.round(w),
      height: Math.round(h),
      scale: 2,
    })
    const image = await loadImage(dataUrl)
    ctx.drawImage(image, x, y, w, h)

    if (placement.label) {
      ctx.fillStyle = "#111111"
      ctx.font = "600 24px ui-sans-serif, system-ui, sans-serif"
      ctx.textBaseline = "top"
      ctx.fillText(placement.label, x + 8, y + 6)
    }
  }

  const name = (options.filename || layout.title || layout.name || "figure").replace(/[^\w-]+/g, "-")

  if (format === "tiff" || colourSpace === "cmyk") {
    // TIFF (and any CMYK request) goes through the shared encoder, so a
    // composed figure carries the same resolution tags and separation as a
    // single one.
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
    writeTiff(image, dpi, colourSpace === "cmyk", name)
    return
  }

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, format === "jpeg" ? "image/jpeg" : "image/png")
  )
  if (!blob) throw new Error("The composed figure could not be encoded.")
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `${name}.${format === "jpeg" ? "jpg" : "png"}`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("A panel image could not be read back."))
    img.src = src
  })
}
