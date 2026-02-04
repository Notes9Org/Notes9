"use client"

/**
 * Hook to prevent space key from closing dropdown menus when typing in inputs.
 * Returns a keyboard event handler that stops space key propagation when
 * the user is typing in editable elements (input, textarea, contenteditable).
 * 
 * Usage:
 * ```tsx
 * const handleKeyDown = usePreventSpaceMenuClose()
 * <DialogContent onKeyDown={handleKeyDown}>...</DialogContent>
 * ```
 */
export function usePreventSpaceMenuClose() {
  return (e: React.KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Spacebar') {
      const target = e.target as HTMLElement
      // Use matches() API for cleaner selector checking
      if (target.matches('input, textarea, [contenteditable="true"]')) {
        e.stopPropagation()
      }
    }
  }
}
