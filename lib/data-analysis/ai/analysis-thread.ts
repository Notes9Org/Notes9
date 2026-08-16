/**
 * The Data Analysis conversation.
 *
 * A thread is a list of turns about one dataset. An assistant turn may carry a
 * PLAN — the dry-run of the mutations the model proposed — which the researcher
 * approves or discards. Nothing here applies anything: this module is the shape
 * of the conversation and the rules about when a plan may still be acted on.
 * Applying is the workspace's job, through the same `commitEdits` path a hand
 * edit takes (ADR-014).
 *
 * Everything is pure and serialisable, because a turn is also a row in
 * `chat_messages` and a slot in `analysis_revisions.conversation_thread`.
 */

import type { SpecMutation } from "@/lib/data-analysis/spec/mutations"
import type { SpecAuthorTurn } from "@/lib/data-analysis/ai/spec-author"

/**
 * Wire version. Stored turns outlive the code that wrote them, and a turn whose
 * version we do not recognise is rendered as plain text with no Approve button —
 * never replay mutations from a shape you cannot validate.
 */
export const ANALYSIS_TURN_VERSION = 1

export type PlanStatus = "proposed" | "approved" | "discarded" | "stale"

export interface AnalysisPlan {
  /** `describeMutation()` output — the sentences the researcher is approving. */
  steps: string[]
  mutations: SpecMutation[]
  rejected: { reason: string }[]
  clarificationNeeded: string | null
  status: PlanStatus
}

export interface AnalysisUserTurn {
  v: number
  id: string
  role: "user"
  content: string
  /** Provenance only — the rows are sent inline; nothing dereferences this id. */
  dataFileId: string | null
  specHash: string
  createdAt: string
}

export interface AnalysisAssistantTurn {
  v: number
  id: string
  role: "assistant"
  /** The rationale, as prose. Empty for a failure turn, which uses `error`. */
  content: string
  plan: AnalysisPlan | null
  /** The spec the plan was computed against. */
  specHashAtProposal: string
  /** Set when the turn records a failure rather than an answer. */
  error?: string
  /** How many older turns the route left out when answering. */
  historyDropped?: number
  createdAt: string
}

export type AnalysisTurn = AnalysisUserTurn | AnalysisAssistantTurn

/**
 * What the researcher wants, stated in their own words. ADR-023: this may be
 * captured before a dataset exists — `appliedToDatasetId` is null until the
 * intent has actually been acted on against a chosen dataset, and stays null
 * for as long as it was only ever stated pre-data.
 */
export interface AnalysisIntent {
  text: string
  /** ISO timestamp. */
  statedAt: string
  appliedToDatasetId: string | null
}

/**
 * Who a reply belongs to (ADR-026, hardens ADR-012/013): captured at the
 * moment a request is issued and carried through to resolution, so delivery
 * routes by what asked, never by what happens to be mounted when the answer
 * comes back. This slice owns the type only — slice 05 owns the wiring that
 * checks it before delivering a reply.
 */
export interface RequestIdentity {
  analysisId: string
  threadId: string | null
  requestId: string
}

/**
 * Whether this turn came out of a version of the format we still understand.
 * The renderer degrades an unknown turn to plain text rather than hiding it —
 * a transcript with a hole in it is worse than one with an opaque entry.
 */
export function isReadableTurn(turn: AnalysisTurn): boolean {
  return turn.v === ANALYSIS_TURN_VERSION
}

/**
 * Can this plan still be acted on?
 *
 * Mirrors `canExecuteProposal` (workspace/spec-prompt.ts) — a clarifying question
 * or an empty proposal withholds the button — and adds the two conditions a
 * single-slot proposal never had to consider: a plan already decided, and a plan
 * computed against a spec that has since moved.
 */
export function canApprovePlan(turn: AnalysisAssistantTurn, currentSpecHash: string): boolean {
  const plan = turn.plan
  if (!plan) return false
  if (!isReadableTurn(turn)) return false
  if (plan.status !== "proposed") return false
  if (plan.clarificationNeeded) return false
  if (plan.mutations.length === 0) return false
  return turn.specHashAtProposal === currentSpecHash
}

/**
 * Why Approve is not offered, in the researcher's terms. Returning null means
 * it is offered. This exists so the UI never shows a disabled button with no
 * explanation — the most common way a gate reads as a bug.
 */
export function approvalBlockedReason(
  turn: AnalysisAssistantTurn,
  currentSpecHash: string,
): string | null {
  const plan = turn.plan
  if (!plan) return null
  if (!isReadableTurn(turn)) return "This turn was saved by a newer version and cannot be replayed."
  if (plan.status === "approved") return "Applied."
  if (plan.status === "discarded") return "Discarded."
  if (plan.status === "stale" || turn.specHashAtProposal !== currentSpecHash) {
    return "The analysis changed after this was proposed, so it can no longer be applied. Ask again."
  }
  if (plan.clarificationNeeded) return "Answer the question above first."
  if (plan.mutations.length === 0) return "Nothing to apply."
  return null
}

/**
 * Mark every still-open plan stale once the spec has moved on.
 *
 * Called after any commit that did not come from approving that plan. Without
 * it, a transcript keeps offering Approve on plans computed against a figure
 * that no longer exists, and approving one silently replays it against the new
 * spec — a wrong answer wearing a confident label.
 */
export function markStalePlans(turns: AnalysisTurn[], currentSpecHash: string): AnalysisTurn[] {
  let changed = false
  const next = turns.map((turn) => {
    if (turn.role !== "assistant" || !turn.plan) return turn
    if (turn.plan.status !== "proposed") return turn
    if (turn.specHashAtProposal === currentSpecHash) return turn
    changed = true
    return { ...turn, plan: { ...turn.plan, status: "stale" as const } }
  })
  // Identity is preserved when nothing moved, so this is safe to call on every
  // spec change without re-rendering the whole transcript.
  return changed ? next : turns
}

/** Settle one plan. One-way: only a `proposed` plan can be decided. */
export function setPlanStatus(
  turns: AnalysisTurn[],
  turnId: string,
  status: Exclude<PlanStatus, "proposed">,
): AnalysisTurn[] {
  return turns.map((turn) => {
    if (turn.id !== turnId || turn.role !== "assistant" || !turn.plan) return turn
    if (turn.plan.status !== "proposed") return turn
    return { ...turn, plan: { ...turn.plan, status } }
  })
}

/**
 * The conversation as the route wants it: prose only, oldest first.
 *
 * Plans are flattened into their steps so a follow-up like "undo that" has
 * something to refer to, and decided plans say what happened to them — an
 * assistant that cannot tell an applied plan from a discarded one will happily
 * propose the discarded one again. Failure turns are omitted: "the request timed
 * out" is not context, it is noise.
 */
export function toHistory(turns: AnalysisTurn[]): SpecAuthorTurn[] {
  const out: SpecAuthorTurn[] = []
  for (const turn of turns) {
    if (!isReadableTurn(turn)) continue
    if (turn.role === "user") {
      out.push({ role: "user", content: turn.content })
      continue
    }
    if (turn.error) continue
    const parts: string[] = []
    if (turn.content.trim()) parts.push(turn.content.trim())
    if (turn.plan) {
      if (turn.plan.steps.length > 0) {
        parts.push(`Proposed: ${turn.plan.steps.join("; ")}`)
      }
      if (turn.plan.status === "approved") parts.push("(the researcher applied this)")
      if (turn.plan.status === "discarded") parts.push("(the researcher discarded this)")
      if (turn.plan.status === "stale") parts.push("(superseded by a later change)")
      if (turn.plan.clarificationNeeded) parts.push(`Asked: ${turn.plan.clarificationNeeded}`)
    }
    if (parts.length === 0) continue
    out.push({ role: "assistant", content: parts.join(" ") })
  }
  return out
}

/**
 * Read a transcript back out of a saved revision.
 *
 * Lenient about content and strict about acting on it: anything that is not a
 * recognisable turn is skipped, and a turn whose version we do not know keeps
 * its version so the renderer refuses to offer Approve on it. Reopened plans are
 * never approvable anyway — `specHashAtProposal` came from another session — so
 * this is a record, not a resumable queue of pending work.
 */
export function fromStoredThread(raw: unknown): AnalysisTurn[] {
  if (!Array.isArray(raw)) return []
  const out: AnalysisTurn[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const t = item as Record<string, unknown>
    if (t.role !== "user" && t.role !== "assistant") continue
    if (typeof t.id !== "string" || typeof t.content !== "string") continue
    const v = typeof t.v === "number" ? t.v : ANALYSIS_TURN_VERSION + 1
    const createdAt = typeof t.createdAt === "string" ? t.createdAt : ""
    if (t.role === "user") {
      out.push({
        v,
        id: t.id,
        role: "user",
        content: t.content,
        dataFileId: typeof t.dataFileId === "string" ? t.dataFileId : null,
        specHash: typeof t.specHash === "string" ? t.specHash : "",
        createdAt,
      })
    } else {
      out.push({
        v,
        id: t.id,
        role: "assistant",
        content: t.content,
        plan: (t.plan as AnalysisPlan | null) ?? null,
        specHashAtProposal:
          typeof t.specHashAtProposal === "string" ? t.specHashAtProposal : "",
        ...(typeof t.error === "string" ? { error: t.error } : {}),
        createdAt,
      })
    }
  }
  return out
}

/**
 * The transcript as it is snapshotted into `analysis_revisions.conversation_thread`.
 * Stored whole and verbatim: a figure without its reasoning is just a picture,
 * and this is the copy that has to still make sense in eighteen months.
 */
export function toStoredThread(turns: AnalysisTurn[]): unknown[] {
  return turns.filter(isReadableTurn)
}
