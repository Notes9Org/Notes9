"use client"

import { useState, useCallback } from "react"
import { diffWords } from "diff"
import { createClient } from "@/lib/supabase/client"
import { buildStoredSegments } from "@/lib/content-diff-segments"
import {
  computeStructuralHints,
  mergeStructureHintsWithContext,
} from "@/lib/content-diff-structure"
import type { ContentDiff, ContentDiffStructureHints } from "@/lib/db/schema"

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function buildSummary(prevText: string, nextText: string): string {
  const parts = diffWords(prevText, nextText)
  const added = parts
    .filter((p) => p.added)
    .map((p) => p.value.trim())
    .join(" ")
  if (added.length > 0) return added.slice(0, 120)
  const removed = parts
    .filter((p) => p.removed)
    .map((p) => p.value.trim())
    .join(" ")
  return removed ? `Removed: ${removed.slice(0, 110)}` : "Content updated"
}

export interface RecordDiffInput {
  recordType: "protocol" | "lab_note"
  recordId: string
  previousContent: string
  newContent: string
  /** Protocol / note display name — fills or prefixes structure hints when HTML trails are sparse. */
  documentTitle?: string | null
}

export function useContentDiffs(
  recordType: "protocol" | "lab_note",
  recordId: string | null | undefined
) {
  const [diffs, setDiffs] = useState<ContentDiff[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadDiffs = useCallback(async () => {
    if (!recordId) return
    setLoading(true)
    setError(null)
    try {
      const supabase = createClient()
      const { data, error: err } = await supabase
        .from("content_diffs")
        .select("*, user:profiles(first_name, last_name, email)")
        .eq("record_type", recordType)
        .eq("record_id", recordId)
        .order("created_at", { ascending: false })
        .limit(50)
      if (err) throw err
      setDiffs((data as ContentDiff[]) ?? [])
    } catch (e: unknown) {
      console.error("[useContentDiffs] loadDiffs error:", e)
      setError("Failed to load change history")
    } finally {
      setLoading(false)
    }
  }, [recordId, recordType])

  const recordDiff = useCallback(
    async (input: RecordDiffInput): Promise<void> => {
      const {
        recordType: rt,
        recordId: rid,
        previousContent,
        newContent,
        documentTitle,
      } = input
      if (!rid || previousContent === newContent) return

      const prevText = stripHtml(previousContent)
      const nextText = stripHtml(newContent)
      if (prevText === nextText) return

      const parts = diffWords(prevText, nextText)
      let wordsAdded = 0
      let wordsRemoved = 0
      for (const part of parts) {
        const wc = countWords(part.value)
        if (part.added) wordsAdded += wc
        if (part.removed) wordsRemoved += wc
      }

      const summary = buildSummary(prevText, nextText)
      let structureHints: ContentDiffStructureHints = { document_title: null, sections: [] }
      try {
        structureHints = computeStructuralHints(previousContent, newContent, parts)
      } catch (e) {
        console.warn("[useContentDiffs] computeStructuralHints failed (saving diff without hints):", e)
      }

      structureHints = mergeStructureHintsWithContext(structureHints, {
        documentTitle,
      })

      try {
        const supabase = createClient()
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) return

        const { error: err } = await supabase.from("content_diffs").insert({
          record_type: rt,
          record_id: rid,
          user_id: user.id,
          change_summary: summary,
          diff_segments: buildStoredSegments(prevText, nextText),
          structure_hints: structureHints,
          words_added: wordsAdded,
          words_removed: wordsRemoved,
        })
        if (err) {
          console.warn("[useContentDiffs] recordDiff insert error:", err)
          return
        }
        await loadDiffs()
      } catch (e) {
        console.warn("[useContentDiffs] recordDiff error:", e)
      }
    },
    [loadDiffs]
  )

  return { diffs, loading, error, loadDiffs, recordDiff }
}
