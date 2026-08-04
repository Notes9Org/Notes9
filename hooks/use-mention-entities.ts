"use client"

import { useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"

export interface MentionProtocol {
  id: string
  name: string
  version?: string | null
}

export interface MentionSample {
  id: string
  name: string
  sample_code?: string | null
}

/**
 * Org-wide @-mention candidates (protocols + samples) for editor surfaces that
 * have no experiment context of their own (reports, papers). Lab notes and
 * protocol design keep their scoped lists; RLS scopes these to the user's org.
 */
export function useMentionEntities() {
  const supabase = useMemo(() => createClient(), [])
  const [protocols, setProtocols] = useState<MentionProtocol[]>([])
  const [samples, setSamples] = useState<MentionSample[]>([])

  useEffect(() => {
    let cancelled = false
    const fetchEntities = async () => {
      // Samples have no `name` column, sample_code is the display label
      // everywhere in the UI, so it doubles as the mention name here.
      const [protocolsRes, samplesRes] = await Promise.all([
        supabase.from("protocols").select("id, name, version").order("name"),
        supabase.from("samples").select("id, sample_code, sample_type").order("sample_code"),
      ])
      if (cancelled) return
      if (protocolsRes.error) {
        console.error("Error fetching protocols for mentions:", protocolsRes.error.message)
      } else {
        setProtocols(protocolsRes.data ?? [])
      }
      if (samplesRes.error) {
        console.error("Error fetching samples for mentions:", samplesRes.error.message)
      } else {
        setSamples(
          ((samplesRes.data ?? []) as { id: string; sample_code: string | null; sample_type: string | null }[]).map(
            (s) => ({
              id: s.id,
              name: s.sample_code || s.sample_type || "Sample",
              sample_code: s.sample_code,
            }),
          ),
        )
      }
    }
    fetchEntities()
    return () => {
      cancelled = true
    }
  }, [supabase])

  return { protocols, samples }
}
