import { useEffect, useRef, useState, useCallback } from 'react'

export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error'

interface UseAutoSaveOptions {
  onSave: (content: string) => Promise<void>
  delay?: number // milliseconds to wait before saving
  enabled?: boolean
}

export function useAutoSave({
  onSave,
  delay = 2000, // 2 seconds default delay
  enabled = true,
}: UseAutoSaveOptions) {
  const [status, setStatus] = useState<SaveStatus>('saved')
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined)
  const contentRef = useRef<string>('')
  const isSavingRef = useRef<boolean>(false)

  const save = useCallback(async (content: string) => {
    if (isSavingRef.current) {
      // If already saving, schedule another save after this one completes
      return
    }

    try {
      isSavingRef.current = true
      setStatus('saving')
      await onSave(content)
      setStatus('saved')
      setLastSaved(new Date())
    } catch (error) {
      console.error('Auto-save error:', error)
      setStatus('error')
      // Retry after 5 seconds on error
      setTimeout(() => {
        if (contentRef.current) {
          save(contentRef.current)
        }
      }, 5000)
    } finally {
      isSavingRef.current = false
    }
  }, [onSave])

  const debouncedSave = useCallback((content: string) => {
    if (!enabled) return

    contentRef.current = content
    setStatus('unsaved')

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    // Set new timeout
    timeoutRef.current = setTimeout(() => {
      save(content)
    }, delay)
  }, [enabled, delay, save])

  const forceSave = useCallback(async () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    if (contentRef.current) {
      await save(contentRef.current)
    }
  }, [save])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  return {
    status,
    lastSaved,
    debouncedSave,
    forceSave,
  }
}

