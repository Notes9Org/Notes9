"use client"

import { useCallback, useEffect, useRef, useState } from 'react'

interface UseResizableOptions {
  initialWidth: number
  minWidth: number
  maxWidth: number
  direction?: 'left' | 'right' // 'left' = normal behavior, 'right' = inverted for right sidebar
  onResize?: (width: number) => void
  /** When set, the chosen width is saved to and restored from localStorage so
   * it persists across sessions and navigations. */
  persistKey?: string
}

export function useResizable({
  initialWidth,
  minWidth,
  maxWidth,
  direction = 'left',
  onResize,
  persistKey
}: UseResizableOptions) {
  const [width, setWidth] = useState(initialWidth)
  // Only persist once the user has actually dragged the handle — otherwise the
  // default would be written to storage on first mount and permanently mask any
  // future change to `initialWidth`.
  const userResizedRef = useRef(false)

  // Restore a persisted width after mount (kept out of the initial state to
  // avoid an SSR/client hydration mismatch on the inline width style).
  useEffect(() => {
    if (!persistKey || typeof window === 'undefined') return
    const saved = window.localStorage.getItem(persistKey)
    if (saved == null) return
    const n = parseInt(saved, 10)
    if (Number.isFinite(n)) setWidth(Math.min(Math.max(n, minWidth), maxWidth))
  }, [persistKey, minWidth, maxWidth])

  // Persist the width on change — but only after a real user resize.
  useEffect(() => {
    if (!persistKey || typeof window === 'undefined' || !userResizedRef.current) return
    window.localStorage.setItem(persistKey, String(width))
  }, [persistKey, width])
  const [isResizing, setIsResizing] = useState(false)
  const startXRef = useRef(0)
  const startWidthRef = useRef(0)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    userResizedRef.current = true
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