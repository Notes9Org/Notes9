"use client"

import { Fragment, useEffect, useRef, useState, type MutableRefObject } from "react"
import { createPortal } from "react-dom"
import { exportChartImage, type ExportFormat } from "@/lib/data-analysis/chart-export"

export type PlotlyEdits = { title?: string; xLabel?: string; yLabel?: string }
export type ChartExportFn = (opts: {
  format: ExportFormat
  dpi: number
  filename: string
  /** Raster only: leave the page showing through the figure. */
  transparent?: boolean
  /** CMYK is written for TIFF only, and is an uncalibrated separation. */
  colourSpace?: "rgb" | "cmyk"
  /** Exact output size in px; without it the on-screen size is scaled by DPI. */
  width?: number | null
  height?: number | null
}) => Promise<void>
export type ChartElement = "title" | "xaxis" | "yaxis" | "series" | "legend" | "annotation"
export type ChartMenuItem = {
  label: string
  onClick: () => void
  /** Heading shown above this item, when it starts a new run. Keeps one long
   *  submenu legible without splitting it into several top-level entries. */
  section?: string
  /** Renders a tick, so the menu shows the current value rather than only offering others. */
  checked?: boolean
  hint?: string
}
export type ChartMenuGroup = { label: string; items: ChartMenuItem[] }

/**
 * SSR-safe Plotly wrapper. Plotly.js touches `window`, so it's dynamically
 * imported on the client only.
 *
 * The default mode bar is hidden — chart controls (zoom, reset, download) and
 * an "Edit ▸" submenu live in a custom right-click menu instead, so the canvas
 * stays clean and element editing routes to the modern inspector via
 * `onEditElement` rather than Plotly's overlay editors. `onEdit` still bridges
 * direct title/axis text edits back to the settings inputs.
 */
export function PlotlyChart({
  data,
  layout,
  className,
  onEdit,
  onEditElement,
  extraGroups = [],
  exportApiRef,
  renderApiRef,
}: {
  data: Record<string, unknown>[]
  layout: Record<string, unknown>
  className?: string
  onEdit?: (edits: PlotlyEdits) => void
  onEditElement?: (el: ChartElement, detail?: { series?: string }) => void
  extraGroups?: ChartMenuGroup[]
  exportApiRef?: MutableRefObject<ChartExportFn | null>
  /** Exposes a PNG data-URL getter (for saving the chart into the library). */
  renderApiRef?: MutableRefObject<(() => Promise<string | null>) | null>
}) {
  const ref = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const plotlyRef = useRef<any>(null)
  const onEditRef = useRef(onEdit)
  onEditRef.current = onEdit
  const onEditElementRef = useRef(onEditElement)
  onEditElementRef.current = onEditElement
  const boundRef = useRef(false)
  const lastClickRef = useRef(0)
  const [ready, setReady] = useState(false)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [openSub, setOpenSub] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const el = ref.current
    if (!el) return
    ;(async () => {
      if (!plotlyRef.current) {
        const mod = await import("plotly.js-dist-min")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        plotlyRef.current = (mod as any).default ?? mod
      }
      if (cancelled || !el) return
      plotlyRef.current.react(el, data, layout, {
        editable: true,
        responsive: true,
        displayModeBar: false, // controls moved to the custom right-click menu
      })
      if (exportApiRef) {
        exportApiRef.current = (o) => exportChartImage(plotlyRef.current, el, o)
      }
      if (renderApiRef) {
        renderApiRef.current = async () => {
          try {
            return await plotlyRef.current.toImage(el, { format: "png", scale: 2 })
          } catch {
            return null
          }
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const gd = el as any
      if (!boundRef.current && typeof gd.on === "function") {
        boundRef.current = true
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        gd.on("plotly_relayout", (e: any) => {
          if (!e || !onEditRef.current) return
          const edits: PlotlyEdits = {}
          if (typeof e["title.text"] === "string") edits.title = e["title.text"]
          if (typeof e["xaxis.title.text"] === "string") edits.xLabel = e["xaxis.title.text"]
          if (typeof e["yaxis.title.text"] === "string") edits.yLabel = e["yaxis.title.text"]
          if (Object.keys(edits).length) onEditRef.current(edits)
        })
        gd.on("plotly_afterplot", () => setReady(true))
        // Double-click a data point/series → open its inspector (Plotly's own
        // editable already handles double-click on title / axis / legend /
        // annotation text in place; this extends it to the plotted data).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        gd.on("plotly_click", (e: any) => {
          const now = Date.now()
          const isDouble = now - lastClickRef.current < 350
          lastClickRef.current = now
          if (isDouble && e?.points?.[0] && onEditElementRef.current) {
            const name = e.points[0].data?.name
            onEditElementRef.current("series", { series: typeof name === "string" ? name : undefined })
          }
        })
      }
      requestAnimationFrame(() => setReady(true))
    })()
    return () => {
      cancelled = true
    }
  }, [data, layout])

  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === "undefined") return
    let raf = 0
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        if (plotlyRef.current && el) {
          try {
            plotlyRef.current.Plots.resize(el)
          } catch {
            /* ignore */
          }
        }
      })
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [])

  useEffect(() => {
    const el = ref.current
    return () => {
      if (exportApiRef) exportApiRef.current = null
      if (renderApiRef) renderApiRef.current = null
      if (el && plotlyRef.current) {
        try {
          plotlyRef.current.purge(el)
        } catch {
          /* ignore */
        }
      }
    }
  }, [exportApiRef])

  // Close the context menu on any outside interaction / escape.
  useEffect(() => {
    if (!menu) return
    const close = () => {
      setMenu(null)
      setOpenSub(null)
    }
    // Close on a press OUTSIDE the menu (ref containment is robust across the
    // portal boundary, unlike relying on event bubbling / stopPropagation).
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current || !menuRef.current.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close()
    }
    window.addEventListener("mousedown", onDown)
    window.addEventListener("scroll", close, true)
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("mousedown", onDown)
      window.removeEventListener("scroll", close, true)
      window.removeEventListener("keydown", onKey)
    }
  }, [menu])

  /* ── chart controls (formerly the modebar) ──────────────────────────────── */
  const zoomBy = (factor: number) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gd = ref.current as any
    const fl = gd?._fullLayout
    if (!fl || !plotlyRef.current) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const upd: Record<string, any> = {}
    for (const axKey of ["xaxis", "yaxis"]) {
      const ax = fl[axKey]
      if (!ax || !Array.isArray(ax.range) || typeof ax.range[0] !== "number") continue
      const [a, b] = ax.range as [number, number]
      const c = (a + b) / 2
      const half = ((b - a) / 2) * factor
      upd[`${axKey}.range`] = [c - half, c + half]
    }
    if (Object.keys(upd).length) plotlyRef.current.relayout(gd, upd)
  }
  const autoscale = () => {
    const gd = ref.current
    if (gd && plotlyRef.current) plotlyRef.current.relayout(gd, { "xaxis.autorange": true, "yaxis.autorange": true })
  }
  const download = (format: ExportFormat) => {
    const gd = ref.current
    if (gd && plotlyRef.current) void exportChartImage(plotlyRef.current, gd, { format, dpi: 300, filename: "notes9-chart" })
  }

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setOpenSub(null)
    // Viewport coordinates: the menu renders in a portal on <body> so it's never
    // clipped by the chart card's overflow-hidden. Clamp to stay on-screen.
    const mw = 210
    const mh = 360
    const x = Math.min(e.clientX, window.innerWidth - mw - 8)
    const y = Math.min(e.clientY, window.innerHeight - mh - 8)
    setMenu({ x: Math.max(8, x), y: Math.max(8, y) })
  }

  const EDIT_ITEMS: { el: ChartElement; label: string }[] = [
    { el: "title", label: "Title" },
    { el: "xaxis", label: "X axis" },
    { el: "yaxis", label: "Y axis" },
    { el: "series", label: "Series" },
    { el: "legend", label: "Legend" },
    { el: "annotation", label: "Annotation" },
  ]

  return (
    <div ref={wrapRef} className={className} style={{ position: "relative", width: "100%", height: "100%" }} onContextMenu={onContextMenu}>
      <div ref={ref} style={{ width: "100%", height: "100%", opacity: ready ? 1 : 0, transition: "opacity 250ms ease" }} />

      {menu && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-[200] max-h-[80vh] min-w-[200px] overflow-y-auto rounded-xl border border-border bg-popover/95 p-1 text-sm shadow-2xl backdrop-blur-md"
            style={{ left: menu.x, top: menu.y }}
            onContextMenu={(e) => e.preventDefault()}
          >
            {extraGroups.map((g) => (
              <SubMenu key={g.label} label={g.label} open={openSub === g.label} onToggle={() => setOpenSub((s) => (s === g.label ? null : g.label))}>
                {g.items.map((it, i) => (
                  <Fragment key={it.label}>
                    {it.section && it.section !== g.items[i - 1]?.section && (
                      <div className="px-2.5 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                        {it.section}
                      </div>
                    )}
                    <MenuItem onClick={() => { it.onClick(); setMenu(null); setOpenSub(null) }}>
                      <span className="flex w-full items-center gap-2">
                        <span className="w-3 shrink-0 text-[var(--n9-accent,#965034)]">{it.checked ? "✓" : ""}</span>
                        {/* The selected item is bold as well as ticked: a tick
                            is easy to miss in a long list, weight is not. */}
                        <span
                          className={
                            "flex-1 truncate" +
                            (it.checked ? " font-semibold text-[var(--n9-accent,#965034)]" : "")
                          }
                        >
                          {it.label}
                        </span>
                        {it.hint && <span className="shrink-0 text-[10px] text-muted-foreground/70">{it.hint}</span>}
                      </span>
                    </MenuItem>
                  </Fragment>
                ))}
              </SubMenu>
            ))}
            {extraGroups.length > 0 && <Divider />}
            <MenuItem onClick={() => { zoomBy(0.7); setMenu(null) }}>Zoom in</MenuItem>
            <MenuItem onClick={() => { zoomBy(1 / 0.7); setMenu(null) }}>Zoom out</MenuItem>
            <MenuItem onClick={() => { autoscale(); setMenu(null) }}>Reset / autoscale</MenuItem>
            <Divider />
            <SubMenu label="Edit element" open={openSub === "edit"} onToggle={() => setOpenSub((s) => (s === "edit" ? null : "edit"))}>
              {EDIT_ITEMS.map((it) => (
                <MenuItem key={it.el} onClick={() => { onEditElement?.(it.el); setMenu(null); setOpenSub(null) }}>{it.label}</MenuItem>
              ))}
            </SubMenu>
            <Divider />
            <MenuItem onClick={() => { download("png"); setMenu(null) }}>Download PNG</MenuItem>
            <MenuItem onClick={() => { download("svg"); setMenu(null) }}>Download SVG</MenuItem>
          </div>,
          document.body,
        )}
    </div>
  )
}

function MenuItem({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="block w-full rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-muted">
      {children}
    </button>
  )
}
function SubMenu({ label, open, onToggle, children }: { label: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <>
      <button onClick={onToggle} className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-muted">
        <span>{label}</span>
        <span className={open ? "rotate-90 transition-transform" : "transition-transform"}>›</span>
      </button>
      {open && <div className="ml-2 border-l border-border pl-1">{children}</div>}
    </>
  )
}
function Divider() {
  return <div className="my-1 h-px bg-border" />
}
