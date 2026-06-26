"use client"

import { useCallback, useRef } from "react"
import { cn } from "@/lib/utils"

const DPI = 96 // CSS px per inch

export type RulerOrientation = "horizontal" | "vertical"

export type EditorRulerProps = {
  orientation?: RulerOrientation
  /** Total length of the ruler in px (page width for horizontal, page height for vertical). */
  lengthPx: number
  /** Margin at the start (left / top) in px. */
  marginStartPx: number
  /** Margin at the end (right / bottom) in px. */
  marginEndPx: number
  /** Called live while dragging. Keys map to the active orientation (left/right or top/bottom). */
  onChange: (next: { start?: number; end?: number }) => void
  /**
   * When set (vertical ruler), the scale + margin zones repeat every `repeatEveryPx`
   * down the ruler so each page shows its own measurements.
   */
  repeatEveryPx?: number
  className?: string
}

/**
 * Word-style ruler (horizontal or vertical). Shows inch ticks and two draggable
 * margin markers; the shaded zones at each end represent the current margins. A
 * vertical ruler can repeat its scale once per page.
 */
export function EditorRuler({
  orientation = "horizontal",
  lengthPx,
  marginStartPx,
  marginEndPx,
  onChange,
  repeatEveryPx,
  className,
}: EditorRulerProps) {
  const isH = orientation === "horizontal"
  const dragRef = useRef<{ side: "start" | "end"; startPos: number; startMargin: number } | null>(null)

  const onPointerDown = useCallback(
    (side: "start" | "end") => (e: React.PointerEvent) => {
      e.preventDefault()
      ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
      dragRef.current = {
        side,
        startPos: isH ? e.clientX : e.clientY,
        startMargin: side === "start" ? marginStartPx : marginEndPx,
      }
    },
    [isH, marginStartPx, marginEndPx],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current
      if (!drag) return
      const cur = isH ? e.clientX : e.clientY
      const delta = cur - drag.startPos
      const raw = drag.side === "start" ? drag.startMargin + delta : drag.startMargin - delta
      const span = isH ? lengthPx : repeatEveryPx ?? lengthPx
      const otherMargin = drag.side === "start" ? marginEndPx : marginStartPx
      const maxMargin = span - otherMargin - DPI * 1.2
      const clamped = Math.max(DPI * 0.25, Math.min(maxMargin, raw))
      onChange(drag.side === "start" ? { start: Math.round(clamped) } : { end: Math.round(clamped) })
    },
    [isH, lengthPx, repeatEveryPx, marginStartPx, marginEndPx, onChange],
  )

  const endDrag = useCallback(() => {
    dragRef.current = null
  }, [])

  // For a repeating vertical ruler, each page renders its own 0..N scale.
  const pageLen = isH ? lengthPx : repeatEveryPx ?? lengthPx
  const pageCount = isH ? 1 : Math.max(1, Math.ceil(lengthPx / pageLen))
  const inchesPerPage = Math.ceil(pageLen / DPI)

  const handleBase =
    "absolute z-10 h-3 w-3 rounded-sm border border-border bg-primary shadow-sm -translate-x-1/2 -translate-y-1/2"

  const renderPage = (pageIndex: number) => {
    const base = pageIndex * pageLen // offset of this page along the ruler
    const ticks: React.ReactNode[] = []
    for (let i = 0; i <= inchesPerPage; i++) {
      const at = base + i * DPI
      if (at > lengthPx) break
      ticks.push(
        isH ? (
          <div key={`t-${pageIndex}-${i}`} className="absolute top-0 bottom-0" style={{ left: at }}>
            <div className="absolute top-0 h-2 w-px bg-border" />
            {i > 0 && i < inchesPerPage ? (
              <span className="absolute top-2.5 -translate-x-1/2 text-[9px] tabular-nums">{i}</span>
            ) : null}
          </div>
        ) : (
          <div key={`t-${pageIndex}-${i}`} className="absolute left-0 right-0" style={{ top: at }}>
            <div className="absolute left-0 w-2 h-px bg-border" />
            {i > 0 && i < inchesPerPage ? (
              <span className="absolute left-2.5 -translate-y-1/2 text-[9px] tabular-nums">{i}</span>
            ) : null}
          </div>
        ),
      )
    }
    return (
      <div key={`page-${pageIndex}`}>
        {/* page boundary line (vertical ruler only, after the first page) */}
        {!isH && pageIndex > 0 ? (
          <div className="absolute left-0 right-0 border-t border-dashed border-border" style={{ top: base }} />
        ) : null}
        {/* margin shading for this page */}
        <div
          className="absolute bg-muted/70"
          style={
            isH
              ? { insetBlock: 0, left: base, width: marginStartPx }
              : { insetInline: 0, top: base, height: marginStartPx }
          }
          aria-hidden
        />
        <div
          className="absolute bg-muted/70"
          style={
            isH
              ? { insetBlock: 0, left: base + pageLen - marginEndPx, width: marginEndPx }
              : { insetInline: 0, top: base + pageLen - marginEndPx, height: marginEndPx }
          }
          aria-hidden
        />
        {ticks}
        {/* draggable handles only on the first page (they set the margins for all pages) */}
        {pageIndex === 0 ? (
          <>
            <button
              type="button"
              aria-label={isH ? "Left margin" : "Top margin"}
              title={isH ? "Drag to set left margin" : "Drag to set top margin"}
              onPointerDown={onPointerDown("start")}
              className={cn(handleBase, isH ? "top-1/2 cursor-ew-resize" : "left-1/2 cursor-ns-resize")}
              style={isH ? { left: marginStartPx } : { top: marginStartPx }}
            />
            <button
              type="button"
              aria-label={isH ? "Right margin" : "Bottom margin"}
              title={isH ? "Drag to set right margin" : "Drag to set bottom margin"}
              onPointerDown={onPointerDown("end")}
              className={cn(handleBase, isH ? "top-1/2 cursor-ew-resize" : "left-1/2 cursor-ns-resize")}
              style={isH ? { left: pageLen - marginEndPx } : { top: pageLen - marginEndPx }}
            />
          </>
        ) : null}
      </div>
    )
  }

  return (
    <div
      className={cn("select-none", className)}
      style={isH ? { width: lengthPx } : { height: lengthPx }}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div
        className={cn(
          "relative rounded-sm border border-border/70 bg-card text-muted-foreground",
          isH ? "h-6" : "w-6",
        )}
        style={isH ? { width: lengthPx } : { height: lengthPx }}
      >
        {Array.from({ length: pageCount }, (_, p) => renderPage(p))}
      </div>
    </div>
  )
}
