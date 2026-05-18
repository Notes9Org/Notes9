import { useEffect, useRef, useState, useCallback } from 'react'

export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error'

interface UseAutoSaveOptions {
  onSave: (content: string, ...args: any[]) => Promise<void>
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
  const retryTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined)
  const paramsRef = useRef<[string, ...any[]]>([''])
  const isSavingRef = useRef<boolean>(false)
  const unmountedRef = useRef<boolean>(false)

  const save = useCallback(async (content: string, ...args: any[]) => {
    if (isSavingRef.current || unmountedRef.current) {
      // If already saving or unmounted, skip
      return
    }

    try {
      isSavingRef.current = true
      setStatus('saving')
      await onSave(content, ...args)
      if (unmountedRef.current) return
      setStatus('saved')
      setLastSaved(new Date())
    } catch (error) {
      if (unmountedRef.current) return
      console.error('Auto-save error:', error)
      setStatus('error')
      // Retry after 5 seconds on error, but only if still mounted
      retryTimeoutRef.current = setTimeout(() => {
        if (!unmountedRef.current && paramsRef.current) {
          save(...paramsRef.current)
        }
      }, 5000)
    } finally {
      isSavingRef.current = false
    }
  }, [onSave])

  const debouncedSave = useCallback((content: string, ...args: any[]) => {
    if (!enabled) return

    paramsRef.current = [content, ...args]
    setStatus('unsaved')

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    // Set new timeout
    timeoutRef.current = setTimeout(() => {
      save(content, ...args)
    }, delay)
  }, [enabled, delay, save])

  const forceSave = useCallback(async () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    if (paramsRef.current) {
      await save(...paramsRef.current)
    }
  }, [save])

  /** Clear pending debounced save without persisting (e.g. after reverting draft). */
  const cancelPendingSave = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = undefined
    }
  }, [])

  /** Call after discard when editor matches last persisted content. */
  const markSynced = useCallback(() => {
    setStatus('saved')
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      unmountedRef.current = true
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current)
      }
    }
  }, [])

  return {
    status,
    lastSaved,
    debouncedSave,
    forceSave,
    cancelPendingSave,
    markSynced,
  }
}

