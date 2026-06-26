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
  className?: string
}

/**
 * Word-style ruler (horizontal or vertical). Shows inch ticks and two draggable
 * margin markers; the shaded zones at each end represent the current margins.
 */
export function EditorRuler({
  orientation = "horizontal",
  lengthPx,
  marginStartPx,
  marginEndPx,
  onChange,
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
      // End margin grows as the handle moves toward the start, so invert for it.
      const raw = drag.side === "start" ? drag.startMargin + delta : drag.startMargin - delta
      const otherMargin = drag.side === "start" ? marginEndPx : marginStartPx
      const maxMargin = lengthPx - otherMargin - DPI * 1.2
      const clamped = Math.max(DPI * 0.25, Math.min(maxMargin, raw))
      onChange(drag.side === "start" ? { start: Math.round(clamped) } : { end: Math.round(clamped) })
    },
    [isH, lengthPx, marginStartPx, marginEndPx, onChange],
  )

  const endDrag = useCallback(() => {
    dragRef.current = null
  }, [])

  const inches = Math.ceil(lengthPx / DPI)
  const ticks: number[] = []
  for (let i = 0; i <= inches; i++) ticks.push(i)

  const handleClass =
    "absolute z-10 h-3 w-3 cursor-ew-resize rounded-sm border border-border bg-primary shadow-sm"
  const handleClassV =
    "absolute z-10 h-3 w-3 cursor-ns-resize rounded-sm border border-border bg-primary shadow-sm"

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
        {/* Margin shading */}
        <div
          className="absolute bg-muted/70"
          style={
            isH
              ? { insetBlock: 0, left: 0, width: marginStartPx }
              : { insetInline: 0, top: 0, height: marginStartPx }
          }
          aria-hidden
        />
        <div
          className="absolute bg-muted/70"
          style={
            isH
              ? { insetBlock: 0, right: 0, width: marginEndPx }
              : { insetInline: 0, bottom: 0, height: marginEndPx }
          }
          aria-hidden
        />
        {/* Inch ticks + labels */}
        {ticks.map((i) =>
          isH ? (
            <div key={i} className="absolute top-0 bottom-0" style={{ left: i * DPI }}>
              <div className="absolute top-0 h-2 w-px bg-border" />
              {i > 0 && i < inches ? (
                <span className="absolute top-2.5 -translate-x-1/2 text-[9px] tabular-nums">{i}</span>
              ) : null}
              {i < inches ? <div className="absolute top-0 h-1 w-px bg-border/60" style={{ left: DPI / 2 }} /> : null}
            </div>
          ) : (
            <div key={i} className="absolute left-0 right-0" style={{ top: i * DPI }}>
              <div className="absolute left-0 w-2 h-px bg-border" />
              {i > 0 && i < inches ? (
                <span className="absolute left-2.5 -translate-y-1/2 text-[9px] tabular-nums">{i}</span>
              ) : null}
              {i < inches ? <div className="absolute left-0 w-1 h-px bg-border/60" style={{ top: DPI / 2 }} /> : null}
            </div>
          ),
        )}
        {/* Start margin handle */}
        <button
          type="button"
          aria-label={isH ? "Left margin" : "Top margin"}
          title={isH ? "Drag to set left margin" : "Drag to set top margin"}
          onPointerDown={onPointerDown("start")}
          className={cn(isH ? handleClass : handleClassV, isH ? "top-1/2 -translate-x-1/2 -translate-y-1/2" : "left-1/2 -translate-x-1/2 -translate-y-1/2")}
          style={isH ? { left: marginStartPx } : { top: marginStartPx }}
        />
        {/* End margin handle */}
        <button
          type="button"
          aria-label={isH ? "Right margin" : "Bottom margin"}
          title={isH ? "Drag to set right margin" : "Drag to set bottom margin"}
          onPointerDown={onPointerDown("end")}
          className={cn(isH ? handleClass : handleClassV, isH ? "top-1/2 -translate-x-1/2 -translate-y-1/2" : "left-1/2 -translate-x-1/2 -translate-y-1/2")}
          style={isH ? { left: lengthPx - marginEndPx } : { top: lengthPx - marginEndPx }}
        />
      </div>
    </div>
  )
}
