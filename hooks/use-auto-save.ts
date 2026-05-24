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
  // null = no pending payload. Cleared by cancelPendingSave so a stale draft
  // from a previously-edited record can't be replayed against a new record
  // via forceSave or the error-retry path.
  const paramsRef = useRef<[string, ...any[]] | null>(null)
  const isSavingRef = useRef<boolean>(false)
  const unmountedRef = useRef<boolean>(false)
  // Always invoke the *latest* onSave so consumers can keep `useCallback([])`
  // on their input handlers (preserving TiptapEditor memoization) without
  // capturing a stale closure over things like formData.title. Without this
  // pattern, the first-render `onSave` was being called forever and reading
  // an empty title — silently bailing out and falsely flipping status to
  // "saved" while the server was never touched.
  const onSaveRef = useRef(onSave)
  useEffect(() => {
    onSaveRef.current = onSave
  }, [onSave])

  const save = useCallback(async (content: string, ...args: any[]) => {
    if (isSavingRef.current || unmountedRef.current) {
      // If already saving or unmounted, skip
      return
    }

    try {
      isSavingRef.current = true
      setStatus('saving')
      await onSaveRef.current(content, ...args)
      if (unmountedRef.current) return
      setStatus('saved')
      setLastSaved(new Date())
    } catch (error) {
      if (unmountedRef.current) return
      console.error('Auto-save error:', error)
      setStatus('error')
      // Retry after 5 seconds on error, but only if still mounted AND the
      // payload hasn't been cancelled (e.g. user switched records).
      retryTimeoutRef.current = setTimeout(() => {
        const params = paramsRef.current
        if (!unmountedRef.current && params) {
          save(...params)
        }
      }, 5000)
    } finally {
      isSavingRef.current = false
    }
  }, [])

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
      timeoutRef.current = undefined
    }
    const params = paramsRef.current
    if (params) {
      await save(...params)
    }
  }, [save])

  /**
   * Clear pending debounced save without persisting. Also drops paramsRef so a
   * later forceSave (or the 5s error-retry) can't replay this draft against a
   * different record — relevant when the user switches lab notes or protocols
   * with an in-flight debounce.
   */
  const cancelPendingSave = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = undefined
    }
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current)
      retryTimeoutRef.current = undefined
    }
    paramsRef.current = null
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

