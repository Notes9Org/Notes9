import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'

interface UseAutoSaveOptions {
  noteId?: string
  experimentId: string
  debounceMs?: number
  onSaveSuccess?: () => void
  onSaveError?: (error: Error) => void
}

export function useAutoSave({
  noteId,
  experimentId,
  debounceMs = 2000,
  onSaveSuccess,
  onSaveError,
}: UseAutoSaveOptions) {
  const { toast } = useToast()
  const supabase = createClient()
  const timeoutRef = useRef<NodeJS.Timeout>()
  const isSavingRef = useRef(false)

  const saveToDatabase = async (editorJSON: any, editorHTML: string) => {
    if (isSavingRef.current) return
    
    try {
      isSavingRef.current = true
      
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const noteData = {
        editor_data: editorJSON,
        content: editorHTML, // Also save HTML for backward compatibility
        editor_version: '2.0.0',
        last_edited_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      if (noteId) {
        // Update existing note
        const { error } = await supabase
          .from('lab_notes')
          .update(noteData)
          .eq('id', noteId)
          .eq('created_by', user.id) // Security: only update own notes

        if (error) throw error
        
        toast({
          title: 'Saved',
          duration: 1000,
        })
        
        onSaveSuccess?.()
      }
    } catch (error: any) {
      console.error('Auto-save error:', error)
      toast({
        title: 'Save failed',
        description: error.message,
        variant: 'destructive',
      })
      onSaveError?.(error)
    } finally {
      isSavingRef.current = false
    }
  }

  const debouncedSave = (editorJSON: any, editorHTML: string) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    timeoutRef.current = setTimeout(() => {
      saveToDatabase(editorJSON, editorHTML)
    }, debounceMs)
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  return {
    save: debouncedSave,
    saveNow: saveToDatabase,
  }
}

