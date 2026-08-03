import type { AnalysisSpec } from "@/lib/data-analysis/spec/analysis-spec"
import type { SpecMutation } from "@/lib/data-analysis/spec/mutations"
import type { Table } from "@/lib/data-analysis/engine/resolver"

/**
 * The client half of the AI seam: one POST to `/api/data-analysis/spec-author`.
 *
 * The route already promises never to throw — every failure arrives as a legible
 * JSON body. This module extends that promise across the network, where the
 * route cannot: a dropped connection, a proxy's HTML 502, an aborted request are
 * all typed outcomes here, so the workspace has exactly one thing to handle
 * (a union) rather than two (a union plus exceptions).
 *
 * It does NOT apply the mutations. Applying is `applyAiPatch`'s job, because the
 * sticky-edit rule (L6) needs the UI's history, which this module has no view of.
 */

const ENDPOINT = "/api/data-analysis/spec-author"

/**
 * Every reply the route can produce, plus the two only the network can.
 *
 * `patch` is the success case. The route sends it WITHOUT an `outcome` field —
 * the discriminant is added here so the caller switches on one field for all
 * cases instead of testing `"outcome" in reply`.
 */
export type SpecPatchOutcome =
  | {
      outcome: "patch"
      rationale: string
      mutations: SpecMutation[]
      clarificationNeeded: string | null
      /** Mutations the route dropped, with the reason; worth showing, not hiding. */
      rejected: { mutation: unknown; reason: string }[]
    }
  /** A guardrail screened the request. `alternative` is the honest thing to do instead. */
  | { outcome: "refused"; reason: string; alternative: string }
  | { outcome: "no-table"; reason: string }
  | { outcome: "bad-request"; reason: string }
  | { outcome: "unauthorized"; reason: string }
  /** Catalyst is unset, timed out, or errored. The deterministic path is unaffected. */
  | { outcome: "unavailable"; reason: string }
  /** Transport failed or the body was not the JSON the route promises. */
  | { outcome: "error"; reason: string }
  /** The caller cancelled. Distinct from `error` so a superseded request stays silent. */
  | { outcome: "aborted" }

export interface SpecPatchRequest {
  prompt: string
  spec: AnalysisSpec
  table: Table
  signal?: AbortSignal
}

/**
 * An abort surfaces as a DOMException in the browser and an Error in Node, so
 * the name is the only portable signal; `signal.aborted` covers the rest.
 */
function isAbort(err: unknown, signal?: AbortSignal): boolean {
  return signal?.aborted === true || (err instanceof Error && err.name === "AbortError")
}

const asString = (v: unknown): string => (typeof v === "string" ? v : "")

export async function requestSpecPatch(input: SpecPatchRequest): Promise<SpecPatchOutcome> {
  const { prompt, spec, table, signal } = input

  let res: Response
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, spec, table }),
      signal,
    })
  } catch (err) {
    if (isAbort(err, signal)) return { outcome: "aborted" }
    return {
      outcome: "error",
      reason: "Could not reach the analysis assistant. Your analysis is unaffected.",
    }
  }

  // A gateway or crash can answer with HTML the route never wrote. Parsing has
  // to be allowed to fail without taking the caller down with it.
  let body: unknown
  try {
    body = await res.json()
  } catch (err) {
    if (isAbort(err, signal)) return { outcome: "aborted" }
    return {
      outcome: "error",
      reason: `The analysis assistant returned an unreadable response (HTTP ${res.status}).`,
    }
  }

  const reply = (body ?? {}) as Record<string, unknown>

  // 401 is the one failure the route reports as `error`, not `outcome`.
  if (res.status === 401) {
    return { outcome: "unauthorized", reason: asString(reply.error) || "Unauthorized" }
  }

  switch (reply.outcome) {
    case "refused":
      return {
        outcome: "refused",
        reason: asString(reply.reason),
        alternative: asString(reply.alternative),
      }
    case "no-table":
      return { outcome: "no-table", reason: asString(reply.reason) }
    case "bad-request":
      return { outcome: "bad-request", reason: asString(reply.reason) }
    case "unavailable":
      return { outcome: "unavailable", reason: asString(reply.reason) }
  }

  if (!res.ok) {
    return {
      outcome: "error",
      reason: `The analysis assistant failed (HTTP ${res.status}).`,
    }
  }

  // Mutation shapes are not re-validated here — `validateProposal` on the route
  // is the single gate, and a second, weaker copy of it would only disagree.
  return {
    outcome: "patch",
    rationale: asString(reply.rationale),
    mutations: Array.isArray(reply.mutations) ? (reply.mutations as SpecMutation[]) : [],
    clarificationNeeded:
      typeof reply.clarificationNeeded === "string" ? reply.clarificationNeeded : null,
    rejected: Array.isArray(reply.rejected)
      ? (reply.rejected as { mutation: unknown; reason: string }[])
      : [],
  }
}
