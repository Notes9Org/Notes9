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
        "group relative flex items-center justify-center bg-transparent hover:bg-border/50 transition-colors cursor-col-resize",
        position === 'left' ? "w-1 -mr-0.5" : "w-1 -ml-0.5",
        isResizing && "bg-border",
        className
      )}
      onMouseDown={onMouseDown}
    >
      {/* Visual indicator */}
      <div 
        className={cn(
          "absolute inset-y-0 w-0.5 bg-border/30 group-hover:bg-border/70 transition-colors",
          isResizing && "bg-border",
          position === 'left' ? "right-0" : "left-0"
        )}
      />
      
      {/* Invisible wider hit area for easier grabbing */}
      <div className="absolute inset-y-0 w-2 -translate-x-1/2" />
    </div>
  )
}