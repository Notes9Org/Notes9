import { chartStateFromSpec, type ChartState } from "@/lib/data-analysis/workspace/chart-state-spec"
import type { SpecPatchOutcome } from "@/lib/data-analysis/ai/spec-author-client"
import type { AnalysisSpec } from "@/lib/data-analysis/spec/analysis-spec"
import type { Table } from "@/lib/data-analysis/engine/resolver"

/**
 * The pure pieces behind the workspace's natural-language prompt: what a
 * proposed spec means for the rail's controls, what every reply that is not a
 * patch says to the user, and whether a computed-but-not-yet-approved proposal
 * (P3) may be executed.
 *
 * They live here rather than in the workspace component because neither needs
 * React and all are worth reading — and testing — on their own.
 */

/** Axis limits and the tick count are text in the rail and numbers in the spec. */
const RAIL_NUMERIC_TEXT = new Set<keyof ChartState>(["xMin", "xMax", "yMin", "yMax", "nticks"])
/** Absent is the empty string in the rail, not `undefined`. */
const RAIL_TEXT = new Set<keyof ChartState>(["subtitle", "xUnit", "yUnit"])

/**
 * The rail edits a spec change implies — only the fields that actually moved.
 *
 * The round trip is lossy in small ways (the rail's font is a CSS stack where
 * the spec names one of three; limits are text on one side and numbers on the
 * other), so writing the whole derived state back would overwrite settings the
 * patch never touched with a re-derived approximation of themselves. Comparing
 * the spec before against the spec after keeps the write down to what changed.
 */
export function railEditsFromSpec(
  before: AnalysisSpec,
  after: AnalysisSpec,
  table: Table
): Record<string, unknown> {
  const from = chartStateFromSpec(before, table)
  const to = chartStateFromSpec(after, table)
  const edits: Record<string, unknown> = {}
  for (const key of Object.keys(to) as (keyof ChartState)[]) {
    const next = to[key]
    // Structural compare, because the fields include objects (`seriesStyles`)
    // and arrays (`yKeys`) as well as scalars.
    if (JSON.stringify(next) === JSON.stringify(from[key])) continue
    edits[key] = RAIL_NUMERIC_TEXT.has(key)
      ? next === null || next === undefined
        ? ""
        : String(next)
      : RAIL_TEXT.has(key)
        ? (next ?? "")
        : next
  }
  return edits
}

/**
 * The plain sentence for every reply that is not a patch.
 *
 * All of them in one place, so a variant cannot quietly fall through to
 * silence. `aborted` returns nothing on purpose: a superseded request is not
 * news, and telling the user their own second question cancelled the first
 * would read as a failure.
 */
export function aiNotice(outcome: SpecPatchOutcome): { title: string; body: string } | null {
  switch (outcome.outcome) {
    case "patch":
    case "aborted":
      return null
    case "refused":
      return {
        title: "Not that change",
        body:
          [outcome.reason, outcome.alternative].filter(Boolean).join(" ") ||
          "That request was declined.",
      }
    case "no-table":
      return {
        title: "Nothing to change yet",
        body: outcome.reason || "Import or type some data first, then describe the change.",
      }
    case "bad-request":
      return {
        title: "That request didn't get through",
        body: outcome.reason || "Try describing the change a little differently.",
      }
    case "unauthorized":
      return {
        title: "Sign in again to use the assistant",
        body: outcome.reason || "Your session expired. Nothing in this workspace was affected.",
      }
    case "unavailable":
      // The one message that has to say what still works, because this is the
      // case where the whole deterministic product is intact and unattended.
      return {
        title: "The assistant is off right now",
        body: `${outcome.reason ? `${outcome.reason} ` : ""}Every control here still works — the chart, the engine and the statistics are unaffected.`,
      }
    case "error":
      return { title: "The assistant didn't answer", body: outcome.reason }
  }
}

/**
 * P3 — propose then execute. Execute is offered only for a proposal that would
 * actually do something and is not itself a question: a `clarificationNeeded`
 * reply is the assistant asking whether it understood, and a button offering
 * to act on a guess it just admitted might be wrong would undercut the ask.
 */
export function canExecuteProposal(
  proposal: { mutationCount: number; clarificationNeeded: string | null } | null
): boolean {
  if (!proposal) return false
  if (proposal.clarificationNeeded) return false
  return proposal.mutationCount > 0
}
