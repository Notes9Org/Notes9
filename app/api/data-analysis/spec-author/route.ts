import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth/current-user"
import { callCatalyst, CatalystUnavailableError } from "@/lib/catalyst-client"
import { parseSpec, type AnalysisSpec } from "@/lib/data-analysis/spec/analysis-spec"
import type { Table } from "@/lib/data-analysis/engine/resolver"
import { profileTable, offerableTests } from "@/lib/data-analysis/semantic/infer"
import {
  buildContextBundle,
  CLARIFICATION_WITHHELD,
  containsFabricatedStatistic,
  sanitiseRationale,
  screenRequest,
  SPEC_AUTHOR_SYSTEM_PROMPT,
  validateProposal,
  type ColumnProfile,
  type DataProfile,
} from "@/lib/data-analysis/ai/spec-author"

/**
 * The AI seam: the ONLY place the Data Analysis workspace touches Catalyst.
 *
 * Everything the deterministic path needs (spec → resolver → engine) works with
 * this route down; the workspace degrades to "no assistant" rather than to "no
 * analysis". So every failure here is a legible JSON body, never a throw.
 *
 * Three guarantees are enforced HERE, not in the UI and not in the prompt:
 *   1. no table → nothing is sent, HTTP 400;
 *   2. a screened-out request costs zero model calls;
 *   3. no PROSE the model invented a number into, and no test the data cannot
 *      support, reaches the client.
 *
 * And one affordance: a reply the gate mostly rejected gets ONE repair round
 * before the researcher sees it, so the seam answers with a plan rather than a
 * list of things it refused to do.
 */

export const maxDuration = 60

const CATALYST_PATH = "/analysis/spec-author"
/**
 * Under `maxDuration`, and shared by BOTH model calls: the first reply and the
 * repair round together still have to leave the route time to answer, so a hung
 * backend returns a message instead of a 504.
 */
const CATALYST_BUDGET_MS = 45_000
/** Below this there is not enough budget left for a repair round to land. */
const REPAIR_MIN_MS = 10_000

/* ── Wire types ────────────────────────────────────────────────────────────*/

interface SpecAuthorRequest {
  prompt?: unknown
  spec?: unknown
  table?: unknown
}

/** What Catalyst sends back. The proposal may be at the top level or wrapped. */
interface CatalystReply {
  proposal?: unknown
  rationale?: unknown
  mutations?: unknown
  clarificationNeeded?: unknown
}

/* ── Profiling: schema + summary statistics, never rows ────────────────────*/

function mapKind(type: string): ColumnProfile["kind"] {
  if (type === "numeric" || type === "categorical" || type === "datetime") return type
  // "identifier" and "empty" carry no analysable structure; treat as free text.
  return "text"
}

function numericSummary(values: (number | string | null)[]): ColumnProfile["summary"] {
  const nums = values
    .map((v) => (typeof v === "number" ? v : v === null || v === "" ? NaN : Number(v)))
    .filter((n) => Number.isFinite(n))
  if (nums.length === 0) return undefined
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length
  const variance =
    nums.length > 1 ? nums.reduce((a, b) => a + (b - mean) ** 2, 0) / (nums.length - 1) : 0
  return {
    n: nums.length,
    min: Math.min(...nums),
    max: Math.max(...nums),
    mean,
    sd: Math.sqrt(variance),
  }
}

/**
 * Reuses `profileTable`, the same profiler the semantic layer infers from, so
 * the assistant sees exactly the shape the app itself reasons about.
 */
function toDataProfile(spec: AnalysisSpec, table: Table): DataProfile {
  const profiles = profileTable(table)
  return {
    fileName: spec.dataset.fileName ?? "dataset",
    rowCount: table.rows.length,
    columns: profiles.map((p) => ({
      name: p.column,
      kind: mapKind(p.type),
      levels: p.type === "categorical" ? p.levels : undefined,
      missing: p.missing,
      summary:
        p.type === "numeric"
          ? numericSummary(table.rows.map((r) => r.values[p.column] ?? null))
          : undefined,
    })),
  }
}

/* ── The repair ask ────────────────────────────────────────────────────────*/

/**
 * The only thing the first reply lacked was the gate's verdict on it. So the
 * repair prompt is the original request plus the model's own rejected mutations
 * and the reason each was refused, nothing else: the bundle already carries the
 * contract and the legal test set, and repeating them would not be new
 * information.
 */
function repairPrompt(prompt: string, rejected: { mutation: unknown; reason: string }[]): string {
  const list = rejected
    .map((r, i) => `${i + 1}. ${JSON.stringify(r.mutation)}\n   Rejected because: ${r.reason}`)
    .join("\n")
  return `${prompt}

Your previous reply to this request was rejected and never reached the researcher. These mutations did not survive validation:
${list}

Answer the request again. Use only mutation kinds and fields listed under "contract" in the bundle, and only tests listed as legal under "offerableTests". Do not repeat a rejected mutation. If nothing legal satisfies the request, leave mutations empty, set clarificationNeeded, and ask one specific question instead.`
}

/* ── Route ─────────────────────────────────────────────────────────────────*/

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    let body: SpecAuthorRequest
    try {
      body = (await req.json()) as SpecAuthorRequest
    } catch {
      return NextResponse.json(
        { outcome: "bad-request", reason: "Request body was not valid JSON." },
        { status: 400 }
      )
    }

    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : ""
    if (!prompt) {
      return NextResponse.json(
        { outcome: "bad-request", reason: "A prompt is required." },
        { status: 400 }
      )
    }

    // (b) HARD CONSTRAINT. Without a resolved table there is no data profile, so
    // any answer would be the model reasoning about nothing. Enforced at the
    // route because the UI is not the only caller.
    const table = body.table as Table | undefined
    if (
      !table ||
      !Array.isArray(table.columns) ||
      table.columns.length === 0 ||
      !Array.isArray(table.rows) ||
      table.rows.length === 0
    ) {
      return NextResponse.json(
        {
          outcome: "no-table",
          reason:
            "Select a data range first. The assistant configures an analysis of a specific table and will not answer without one.",
        },
        { status: 400 }
      )
    }

    const parsed = parseSpec(body.spec)
    if (!parsed.ok) {
      return NextResponse.json(
        { outcome: "bad-request", reason: "The analysis spec did not parse." },
        { status: 400 }
      )
    }
    const spec = parsed.spec

    // (c) Screened requests never reach the model, a refusal that still costs a
    // model call is a refusal the caller can afford to retry in a loop.
    const screen = screenRequest(prompt)
    if (!screen.allowed) {
      return NextResponse.json({
        outcome: "refused",
        reason: screen.response,
        alternative: screen.alternative ?? "",
      })
    }

    const supabase = await createClient()
    const accessToken = (await supabase.auth.getSession()).data.session?.access_token
    if (!accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Computed once, used twice: to tell the model which tests are legal for
    // this data shape, and, after the reply comes back, to enforce it. Same
    // whitelist the UI's test menu uses, so the model can't see a wider set
    // than the researcher would.
    const legalTests = offerableTests(spec, table)

    // (d) Only the bundle crosses the seam. `buildContextBundle` is profile-only
    // by construction; raw rows never leave this process.
    //
    // `project`, `recentEdits`, and `result` are left unpopulated: this route
    // has no producer for a notes9 project record, an edit-history feed, or a
    // live engine result at this call site (confirmed against
    // spec-author-client.ts, whose wire contract is just { prompt, spec, table
    // }), inventing one here would be a new data source, not a bundle fix.
    const bundle = buildContextBundle({
      prompt,
      spec,
      profile: toDataProfile(spec, table),
      offerableTests: legalTests,
    })

    // One budget, drawn down by however many calls this request makes, so the
    // repair round can never push the route past `maxDuration`.
    const deadline = Date.now() + CATALYST_BUDGET_MS
    const ask = (text: string) =>
      callCatalyst<
        { bundle: Record<string, unknown>; prompt: string; system: string },
        CatalystReply
      >(CATALYST_PATH, { bundle, prompt: text, system: SPEC_AUTHOR_SYSTEM_PROMPT }, accessToken, {
        timeoutMs: Math.max(0, deadline - Date.now()),
      })

    let reply: CatalystReply
    try {
      reply = await ask(prompt)
    } catch (err) {
      // (f) Fail CLOSED and legibly. Unset env, timeout and HTTP error all land
      // here; the workspace keeps computing without the assistant.
      const reason =
        err instanceof CatalystUnavailableError
          ? "The analysis assistant is not configured on this deployment. Everything else still works, the spec you edit by hand is computed the same way."
          : "The analysis assistant is unreachable right now. Your analysis is unaffected; try the request again shortly."
      console.error("[spec-author] catalyst call failed:", err)
      return NextResponse.json({ outcome: "unavailable", reason }, { status: 503 })
    }

    // A test the data cannot support is not a suggestion, it is a wrong answer
    // with a confident tone. Same `legalTests` the bundle told the model about.
    const allowedTests = new Set(legalTests.map((c) => c.test))

    // (e) Validate → sanitise → drop. Order matters: an unparseable proposal has
    // no rationale worth sanitising. Run once per model reply, so the repair
    // round is held to exactly the same gate as the first.
    const review = (raw: unknown) => {
      const validated = validateProposal(raw)
      const rejected = [...validated.rejected]
      // `containsFabricatedStatistic` is a PROSE detector and is applied to prose
      // only, the rationale and the question below. It used to be run over every
      // string in every mutation payload too, which was a category error: inside
      // a typed payload a decimal is a threshold, a control level or an ISO
      // timestamp, not a claimed measurement. It refused `figure.setTitle
      // "Viability at 100 nM"`, a filter at 0.5, a `normaliseToControl` on "0.1%
      // DMSO" and every `.000Z` timestamp, while still admitting "the EC50 is 42
      // nM" in the prose it was written for — blocking the legitimate and
      // admitting the fabricated, worse on both axes than no gate at all.
      //
      // Payloads have their own, stronger gate: `SpecMutationSchema` types every
      // field, `offerableTests` bounds the one below that chooses a test, and the
      // researcher reads the whole patch before pressing Execute.
      //
      // ponytail: the known ceiling is an invented number written into a
      // free-text payload field, a subtitle of "p = 0.03". Catching that needs an
      // engine result to attribute numbers against, which this call site has no
      // producer for.
      const mutations = validated.mutations.filter((m) => {
        const record = m as unknown as Record<string, unknown>
        if (record.kind === "analysis.setTest" && !allowedTests.has(record.value as never)) {
          rejected.push({
            mutation: m,
            reason: `"${String(record.value)}" is not a test this data supports.`,
          })
          return false
        }
        return true
      })

      // The question is held to the same gate as the rationale, but REPLACED
      // whole rather than stripped: it is a prompt the researcher has to answer,
      // and half a question in the question box is worse than none.
      //
      // Replaced, not nulled. `clarificationNeeded` is also the P3 interlock
      // (spec-prompt.ts `canExecuteProposal`), so nulling it here handed the
      // researcher an Execute button for the one proposal the model had just
      // flagged as ambiguous — the guard three lines above disarming the guard
      // three lines below. Withholding must be strictly safer than not
      // withholding, so the stand-in keeps Execute withheld and says why.
      // The rejection is still recorded, and the repair round below still gets
      // to ask for the question again without the number.
      let clarificationNeeded = validated.clarificationNeeded
      if (clarificationNeeded && containsFabricatedStatistic(clarificationNeeded)) {
        rejected.push({
          mutation: { clarificationNeeded },
          reason:
            "The clarifying question carried a statistic. Every number shown to the researcher comes from the engine.",
        })
        clarificationNeeded = CLARIFICATION_WITHHELD
      }

      return {
        rationale: sanitiseRationale(validated.rationale).text,
        mutations,
        clarificationNeeded,
        rejected,
      }
    }

    let patch = review(reply?.proposal ?? reply)

    /**
     * A question the researcher can actually answer. The stand-in for a withheld
     * one is not: it blocks Execute, which is its job, but it carries none of
     * what the model wanted to ask, so a round that recovers only that has
     * recovered nothing and a round that could recover the real question is
     * still worth spending.
     */
    const asksAQuestion = (p: { clarificationNeeded: string | null }) =>
      p.clarificationNeeded !== null && p.clarificationNeeded !== CLARIFICATION_WITHHELD

    // (g) ONE repair round, before the response is returned, so the researcher
    // still sees a single plan and still has to approve it. Nothing is applied
    // here either way.
    //
    // The trigger is "more of the plan was dropped than survived": a rejection
    // list is the model's patch coming back unusable, and rendering it as "left
    // out of the change" hands the researcher something they cannot act on. A
    // model that asked a question instead of acting is not failing, so it is
    // left alone.
    //
    // A second failure is an answer, not another retry.
    if (
      !asksAQuestion(patch) &&
      patch.rejected.length > patch.mutations.length &&
      deadline - Date.now() > REPAIR_MIN_MS
    ) {
      try {
        const retry = await ask(repairPrompt(prompt, patch.rejected))
        const repaired = review(retry?.proposal ?? retry)
        // Only adopt a repair that actually recovered something. A worse second
        // reply must not throw away a partially good first one.
        //
        // A question counts as recovery when nothing at all survived the first
        // round: the repair prompt asks for one in exactly that case, and a
        // specific question the researcher can answer beats a list of refusals
        // they cannot act on. Without this the model doing what it was told is
        // the one reply the route throws away.
        const recovered =
          repaired.mutations.length > patch.mutations.length ||
          (patch.mutations.length === 0 && asksAQuestion(repaired))
        if (recovered) patch = repaired
      } catch (err) {
        // The first answer still stands; a failed repair is not a failed request.
        console.error("[spec-author] repair round failed:", err)
      }
    }

    return NextResponse.json(patch)
  } catch (error) {
    console.error("[spec-author] unexpected failure:", error)
    return NextResponse.json(
      {
        outcome: "unavailable",
        reason: "The analysis assistant failed unexpectedly. Your analysis is unaffected.",
      },
      { status: 503 }
    )
  }
}
