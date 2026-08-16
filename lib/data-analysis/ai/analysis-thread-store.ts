/**
 * Persistence for the Data Analysis conversation.
 *
 * Threads are `chat_sessions` rows with `kind = 'data_analysis'` and turns are
 * `chat_messages` rows (ADR-013). No new table: the columns, the RLS and the
 * idempotent write already exist, and Literature set the precedent that a
 * separate AI surface gets its own `kind` rather than its own schema.
 *
 * Every function here is best-effort by design. A transcript is a record of
 * work, not the work — if the thread cannot be written, the researcher still
 * gets their answer and their figure. The one thing this module must never do
 * is throw into the analysis path.
 */

import { createClient } from "@/lib/supabase/client"
import {
  ANALYSIS_TURN_VERSION,
  type AnalysisTurn,
} from "@/lib/data-analysis/ai/analysis-thread"

export const DATA_ANALYSIS_SESSION_KIND = "data_analysis"

/**
 * Deterministic message id, the same technique `hooks/use-chat-sessions.ts`
 * uses: two browser tabs replaying the same turn upsert onto one row instead of
 * duplicating it. Bucketed to the minute so a genuine repeat of the same
 * question later is still its own turn.
 */
async function messageId(sessionId: string, turn: AnalysisTurn): Promise<string> {
  const minute = turn.createdAt.slice(0, 16)
  const seed = `${sessionId}|${turn.role}|${turn.content}|${minute}`
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed))
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
  // Shape the digest into a uuid so it fits the column's type.
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `8${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-")
}

/** Create the thread for an analysis. Returns null if it could not be created. */
export async function createAnalysisThread(input: {
  title: string
  analysisId: string | null
  sourceDataFileId: string | null
}): Promise<string | null> {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return null

    const { data, error } = await supabase
      .from("chat_sessions")
      .insert({
        user_id: user.id,
        title: input.title.slice(0, 200),
        kind: DATA_ANALYSIS_SESSION_KIND,
        protocol_id: null,
        metadata: {
          analysisId: input.analysisId,
          sourceDataFileId: input.sourceDataFileId,
        },
      })
      .select("id")
      .single()

    if (error || !data) return null
    return data.id as string
  } catch {
    return null
  }
}

/**
 * Append one turn. Idempotent: the same turn written twice lands once.
 *
 * `metadata` carries the plan, which is what lets a reopened conversation still
 * show what was proposed and whether it was applied.
 */
export async function appendAnalysisTurn(
  sessionId: string,
  turn: AnalysisTurn,
): Promise<void> {
  try {
    const supabase = createClient()
    const id = await messageId(sessionId, turn)
    const metadata =
      turn.role === "user"
        ? { v: turn.v, dataFileId: turn.dataFileId, specHash: turn.specHash }
        : {
            v: turn.v,
            plan: turn.plan,
            specHashAtProposal: turn.specHashAtProposal,
            ...(turn.error ? { error: turn.error } : {}),
            ...(turn.historyDropped ? { historyDropped: turn.historyDropped } : {}),
          }

    await supabase
      .from("chat_messages")
      .upsert(
        { id, session_id: sessionId, role: turn.role, content: turn.content, metadata },
        { onConflict: "id", ignoreDuplicates: true },
      )
    await supabase
      .from("chat_sessions")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", sessionId)
  } catch {
    // Swallowed on purpose: see the module header. A failed transcript write
    // must not cost the researcher the answer they already have on screen.
  }
}

/**
 * Update a turn that has already been written — the only case is a plan whose
 * status changed from `proposed` to `approved` or `discarded`.
 */
export async function updateAnalysisTurnPlan(
  sessionId: string,
  turn: AnalysisTurn,
): Promise<void> {
  if (turn.role !== "assistant") return
  try {
    const supabase = createClient()
    const id = await messageId(sessionId, turn)
    await supabase
      .from("chat_messages")
      .update({
        metadata: {
          v: turn.v,
          plan: turn.plan,
          specHashAtProposal: turn.specHashAtProposal,
          ...(turn.error ? { error: turn.error } : {}),
        },
      })
      .eq("id", id)
      .eq("session_id", sessionId)
  } catch {
    // Same reason as above. The spec is the truth; this row is the record.
  }
}

/**
 * Read a thread back. Rows whose metadata is not a shape we recognise come back
 * with a version the renderer will refuse to act on, rather than being dropped —
 * a transcript with a hole in it is worse than one with an opaque entry.
 */
export async function loadAnalysisThread(sessionId: string): Promise<AnalysisTurn[]> {
  try {
    const supabase = createClient()
    const { data, error } = await supabase
      .from("chat_messages")
      .select("id, role, content, metadata, created_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true })
    if (error || !data) return []

    const turns: AnalysisTurn[] = []
    for (const row of data) {
      const meta = (row.metadata ?? {}) as Record<string, unknown>
      const v = typeof meta.v === "number" ? meta.v : ANALYSIS_TURN_VERSION + 1
      if (row.role === "user") {
        turns.push({
          v,
          id: row.id as string,
          role: "user",
          content: (row.content as string) ?? "",
          dataFileId: (meta.dataFileId as string | null) ?? null,
          specHash: (meta.specHash as string) ?? "",
          createdAt: row.created_at as string,
        })
      } else if (row.role === "assistant") {
        turns.push({
          v,
          id: row.id as string,
          role: "assistant",
          content: (row.content as string) ?? "",
          plan: (meta.plan as AnalysisTurn extends { plan: infer P } ? P : never) ?? null,
          // Deliberately not the live token: a plan read back from storage was
          // computed in another session and can never be approvable now.
          specHashAtProposal: (meta.specHashAtProposal as string) ?? "",
          ...(typeof meta.error === "string" ? { error: meta.error } : {}),
          createdAt: row.created_at as string,
        })
      }
    }
    return turns
  } catch {
    return []
  }
}
