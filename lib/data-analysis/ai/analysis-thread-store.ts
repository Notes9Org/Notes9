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
  parseStoredPlan,
  type AnalysisIntent,
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
 *
 * Returns whether the write actually landed. `appendAnalysisTurn` below throws
 * this away to stay fire-and-forget for existing callers; `appendAnalysisTurnReporting`
 * is the same write for a caller that needs to show a "not saved" marker
 * instead of losing the failure silently.
 */
async function appendAnalysisTurnInner(
  sessionId: string,
  turn: AnalysisTurn,
): Promise<boolean> {
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

    const { error: msgError } = await supabase
      .from("chat_messages")
      .upsert(
        { id, session_id: sessionId, role: turn.role, content: turn.content, metadata },
        { onConflict: "id", ignoreDuplicates: true },
      )
    if (msgError) return false
    const { error: sessionError } = await supabase
      .from("chat_sessions")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", sessionId)
    // The turn itself landed even if the session's updated_at touch failed —
    // that failure is not provenance loss, so it does not flip the result.
    void sessionError
    return true
  } catch {
    return false
  }
}

/**
 * Fire-and-forget append. See the module header: a failed transcript write
 * must not cost the researcher the answer they already have on screen, so
 * this never rejects and never reports back.
 */
export async function appendAnalysisTurn(
  sessionId: string,
  turn: AnalysisTurn,
): Promise<void> {
  await appendAnalysisTurnInner(sessionId, turn)
}

/**
 * Same write as `appendAnalysisTurn`, but tells its caller whether it landed.
 * The visible turn is never lost either way — this exists so a caller that
 * wants to surface "not saved" on the turn can, without changing the
 * fire-and-forget default every existing caller relies on.
 */
export async function appendAnalysisTurnReporting(
  sessionId: string,
  turn: AnalysisTurn,
): Promise<boolean> {
  return appendAnalysisTurnInner(sessionId, turn)
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
          plan: parseStoredPlan(meta.plan),
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

/**
 * Intent (ADR-023), stored on the thread itself — `chat_sessions.metadata`,
 * beside `analysisId`/`sourceDataFileId`, which already ride there (ADR-013:
 * no new table). One current intent per thread, keyed to the thread rather
 * than to a turn, since "what the researcher wants" is a property of the
 * conversation, not of the message that most recently stated it.
 */
export async function writeAnalysisIntent(
  sessionId: string,
  intent: AnalysisIntent,
): Promise<boolean> {
  const supabase = createClient()
  // Optimistic concurrency: this is a read-modify-write on a shared column, and
  // two callers can race it (two tabs, a retry, a double-click). The update is
  // conditioned on the exact `metadata` value just read — `.eq`/`.is` on the
  // pre-write value — so a caller that loses the race updates zero rows instead
  // of silently clobbering the other write. A few attempts let a genuine race
  // resolve itself; a caller that still can't land after that gets `false`
  // rather than a write disappearing with no signal.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { data, error: readError } = await supabase
        .from("chat_sessions")
        .select("metadata")
        .eq("id", sessionId)
        .single()
      if (readError) return false
      const before = (data?.metadata as Record<string, unknown> | null) ?? null
      const metadata = { ...(before ?? {}), intent }
      const conditioned =
        before === null
          ? supabase.from("chat_sessions").update({ metadata }).eq("id", sessionId).is("metadata", null)
          : supabase.from("chat_sessions").update({ metadata }).eq("id", sessionId).eq("metadata", before)
      const { data: written, error } = await conditioned.select("id")
      if (error) return false
      if (Array.isArray(written) && written.length > 0) return true
      // Zero rows matched: someone else wrote `metadata` between our read and
      // our write. Retry against the fresh value instead of giving up.
    } catch {
      return false
    }
  }
  return false
}

/**
 * Read the thread's current intent back. `undefined` means none was ever
 * recorded — including every thread written before intent existed, since
 * `metadata.intent` simply is not a key on those rows. Never coerced to an
 * empty string: an absent intent and a stated-but-empty one must not read
 * the same to a caller deciding whether to show "not recorded".
 */
export async function readAnalysisIntent(sessionId: string): Promise<AnalysisIntent | undefined> {
  try {
    const supabase = createClient()
    const { data, error } = await supabase
      .from("chat_sessions")
      .select("metadata")
      .eq("id", sessionId)
      .single()
    if (error || !data) return undefined
    const meta = (data.metadata as Record<string, unknown> | null) ?? {}
    const raw = meta.intent
    if (!raw || typeof raw !== "object") return undefined
    const candidate = raw as Record<string, unknown>
    if (typeof candidate.text !== "string" || typeof candidate.statedAt !== "string") return undefined
    return {
      text: candidate.text,
      statedAt: candidate.statedAt,
      appliedToDatasetId:
        typeof candidate.appliedToDatasetId === "string" ? candidate.appliedToDatasetId : null,
    }
  } catch {
    return undefined
  }
}
