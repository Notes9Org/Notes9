'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { LiteratureDetailView } from './literature-detail-view'
import { Loader2 } from 'lucide-react'
import { createClient } from "@/lib/supabase/client"

interface LiteratureDetailModalProps {
  literatureId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function LiteratureDetailModal({ literatureId, open, onOpenChange }: LiteratureDetailModalProps) {
  const [literature, setLiterature] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open && literatureId) {
      fetchLiterature()
    } else {
      // Reset state when modal closes
      setLiterature(null)
      setError(null)
    }
  }, [open, literatureId])

  const fetchLiterature = async () => {
    if (!literatureId) return

    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("literature_reviews")
        .select(`
          *,
          created_by_profile:profiles!literature_reviews_created_by_fkey(
            first_name,
            last_name,
            email
          ),
          project:projects(id, name),
          experiment:experiments(id, name)
        `)
        .eq("id", literatureId)
        .single()

      if (error) {
        setError('Failed to load literature details')
        console.error('Error fetching literature:', error)
      } else {
        setLiterature(data)
      }
    } catch (err) {
      setError('Failed to load literature details')
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-7xl max-h-[90vh] overflow-y-auto pt-12">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center py-12">
            <p className="text-destructive">{error}</p>
          </div>
        )}

        {literature && !loading && (
          <LiteratureDetailView 
            literature={literature} 
            showBreadcrumb={false}
            showActions={true}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
