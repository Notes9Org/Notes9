"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { createClient } from "@/lib/supabase/client"

export interface DocumentVersionAuthor {
  first_name?: string | null
  last_name?: string | null
  email?: string | null
}

export interface DocumentVersion {
  id: string
  record_type: "lab_note" | "protocol"
  record_id: string
  version_no: number
  action: "create" | "update" | "delete" | "restore"
  content: string | null
  content_hash: string
  prev_hash: string | null
  row_hash: string
  title: string | null
  note_type: string | null
  protocol_version: string | null
  change_summary: string | null
  words_added: number
  words_removed: number
  author_id: string
  author_email: string | null
  created_at: string
  author?: DocumentVersionAuthor | DocumentVersionAuthor[] | null
}

/**
 * Read + restore immutable lab-note versions (document_versions). Versions are
 * created server-side by the `trg_write_document_version` trigger on every
 * committed content change; this hook never writes document_versions directly
 * (the table is append-only and client-read-only).
 */
export function useDocumentVersions(
  recordType: "lab_note" | "protocol",
  recordId: string | null | undefined,
) {
  const [versions, setVersions] = useState<DocumentVersion[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null)
  const getSupabase = () => {
    if (!supabaseRef.current) supabaseRef.current = createClient()
    return supabaseRef.current
  }

  // Drop cached versions when the tracked record changes so note B never briefly
  // shows note A's history.
  useEffect(() => {
    setVersions([])
    setError(null)
    setLoading(false)
  }, [recordId, recordType])

  const loadVersions = useCallback(async () => {
    if (!recordId) return
    setLoading(true)
    setError(null)
    try {
      const supabase = getSupabase()
      const { data, error: err } = await supabase
        .from("document_versions")
        .select("*, author:profiles(first_name, last_name, email)")
        .eq("record_type", recordType)
        .eq("record_id", recordId)
        .order("version_no", { ascending: false })
        .limit(200)
      if (err) throw err
      setVersions((data as DocumentVersion[]) ?? [])
    } catch (e: unknown) {
      console.error("[useDocumentVersions] loadVersions error:", e)
      setError("Failed to load version history")
    } finally {
      setLoading(false)
    }
  }, [recordId, recordType])

  /**
   * Restore a prior version by writing its content back onto the note. The
   * `trg_write_document_version` trigger records this as a new version row
   * automatically. Returns true on success.
   */
  const restoreVersion = useCallback(
    async (version: DocumentVersion): Promise<boolean> => {
      if (!recordId || recordType !== "lab_note") return false
      try {
        const supabase = getSupabase()
        // commit_lab_note forces a fresh version (bypassing the trigger throttle)
        // so the restore is always recorded as its own immutable version.
        const { error: err } = await supabase.rpc("commit_lab_note", {
          p_id: recordId,
          p_content: version.content ?? "",
          p_user_agent:
            typeof navigator !== "undefined" ? navigator.userAgent : null,
        })
        if (err) throw err
        await loadVersions()
        return true
      } catch (e: unknown) {
        console.error("[useDocumentVersions] restoreVersion error:", e)
        setError("Failed to restore version")
        return false
      }
    },
    [recordId, recordType, loadVersions],
  )

  return { versions, loading, error, loadVersions, restoreVersion, setError }
}

export function versionAuthorName(v: DocumentVersion): string {
  const a = Array.isArray(v.author) ? v.author[0] : v.author
  const name = [a?.first_name, a?.last_name].filter(Boolean).join(" ").trim()
  return name || a?.email || v.author_email || "Unknown"
}
