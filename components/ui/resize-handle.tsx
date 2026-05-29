"use client"

import { cn } from "@/lib/utils"

interface ResizeHandleProps {
  onMouseDown: (e: React.MouseEvent) => void
  isResizing: boolean
  position: 'left' | 'right'
  className?: string
}

export function ResizeHandle({ 
  onMouseDown, 
  isResizing, 
  position,
  className 
}: ResizeHandleProps) {
  return (
    <div
      className={cn(
        "group relative w-px shrink-0 self-stretch cursor-col-resize bg-border/45 transition-colors hover:bg-border/80",
        isResizing && "bg-border",
        className
      )}
      onMouseDown={onMouseDown}
    >
      {/* Wider hit area without affecting flex layout (no sub-pixel gap). */}
      <div
        className="absolute inset-y-0 -left-1.5 -right-1.5 z-10"
        aria-hidden
      />
    </div>
  )
}