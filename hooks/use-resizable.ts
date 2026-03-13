"use client"

import { useCallback, useEffect, useRef, useState } from 'react'

interface UseResizableOptions {
  initialWidth: number
  minWidth: number
  maxWidth: number
  direction?: 'left' | 'right' // 'left' = normal behavior, 'right' = inverted for right sidebar
  onResize?: (width: number) => void
}

export function useResizable({
  initialWidth,
  minWidth,
  maxWidth,
  direction = 'left',
  onResize
}: UseResizableOptions) {
  const [width, setWidth] = useState(initialWidth)
  const [isResizing, setIsResizing] = useState(false)
  const startXRef = useRef(0)
  const startWidthRef = useRef(0)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
    startXRef.current = e.clientX
    startWidthRef.current = width
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [width])

  const rafRef = useRef<number | null>(null)
  const pendingWidthRef = useRef<number | null>(null)

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const deltaX = e.clientX - startXRef.current
    // For right sidebar, invert the delta so dragging left increases width
    const adjustedDelta = direction === 'right' ? -deltaX : deltaX
    const newWidth = Math.min(
      Math.max(startWidthRef.current + adjustedDelta, minWidth),
      maxWidth
    )
    pendingWidthRef.current = newWidth

    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        if (pendingWidthRef.current !== null) {
          setWidth(pendingWidthRef.current)
          onResize?.(pendingWidthRef.current)
        }
      })
    }
  }, [minWidth, maxWidth, direction, onResize])

  const handleMouseUp = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      if (pendingWidthRef.current !== null) {
        setWidth(pendingWidthRef.current)
        onResize?.(pendingWidthRef.current)
      }
    }
    setIsResizing(false)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }, [onResize])

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove, { passive: true })
      document.addEventListener('mouseup', handleMouseUp)

      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current)
          rafRef.current = null
        }
      }
    }
  }, [isResizing, handleMouseMove, handleMouseUp])

  return {
    width,
    isResizing,
    handleMouseDown,
    setWidth
  }
}