import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth/current-user"
import { callCatalyst, CatalystHttpError, CatalystUnavailableError } from "@/lib/catalyst-client"
import { parseSpec, type AnalysisSpec } from "@/lib/data-analysis/spec/analysis-spec"
import type { Table } from "@/lib/data-analysis/engine/resolver"
import { profileTable, offerableTests } from "@/lib/data-analysis/semantic/infer"
import {
  buildContextBundle,
  CLARIFICATION_WITHHELD,
  containsFabricatedStatistic,
  sanitiseRationale,
  screenRequest,
  SPEC_AUTHOR_PROMPT_MAX_CHARS,
  SPEC_AUTHOR_SYSTEM_PROMPT,
  trimHistory,
  validateProposal,
  type ColumnProfile,
  type DataProfile,
  type SpecAuthorTurn,
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
 *
 * Two more guarantees, added for ADR-004: an over-long prompt is rejected
 * before it ever reaches Catalyst (`SPEC_AUTHOR_PROMPT_MAX_CHARS`, mirroring
 * pydantic's own bound there, so this side of the seam finally knows the other
 * side's contract), and a 4xx Catalyst raises for a malformed request is
 * reported as `bad-request`, not replayed to the researcher as "the assistant
 * is unreachable" — that wording stays reserved for an actual outage (5xx,
 * timeout, or transport failure), where retrying is the correct advice.
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
  /** Optional by contract — the client deployed before this existed sends neither. */
  history?: unknown
  recentEdits?: unknown
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
/**
 * Rebuild the prompt for the one repair round, bounded to `budget` characters
 * (the caller passes `SPEC_AUTHOR_PROMPT_MAX_CHARS`, Catalyst's own bound).
 *
 * The prompt echoes the original request in full, and a rejected mutation can
 * carry an `annotation` or `patch` payload of real size (see
 * `lib/data-analysis/spec/mutation-schema.ts`); with up to 40 of those, the
 * unbounded version of this function could and did produce a prompt bigger
 * than Catalyst would accept, which turned the repair round itself into
 * exactly the malformed request this file's other guard exists to catch
 * (ADR-004).
 *
 * Rejections are included MOST-RECENTLY-REJECTED FIRST: the tail of `rejected`
 * is the gate's verdict on the model's own last attempt, so it is the most
 * useful context to keep when not everything fits. Whatever is left out is
 * named by count ("…and N more were rejected."), never silently dropped, so
 * the repair round is never told a rejection list shorter than the real one
 * without being told it is short.
 *
 * Returns `null` when not even ONE rejection fits inside `budget` alongside
 * the fixed scaffold and the (already-bounded) original prompt. A repair
 * prompt with no rejection detail at all would be worse than no repair round:
 * the caller skips the second Catalyst call entirely rather than spend it on
 * a prompt with nothing for the model to act on.
 */
function repairPrompt(
  prompt: string,
  rejected: { mutation: unknown; reason: string }[],
  budget: number
): string | null {
  const header = `${prompt}

Your previous reply to this request was rejected and never reached the researcher. These mutations did not survive validation:
`
  const footer = `

Answer the request again. Use only mutation kinds and fields listed under "contract" in the bundle, and only tests listed as legal under "offerableTests". Do not repeat a rejected mutation. If nothing legal satisfies the request, leave mutations empty, set clarificationNeeded, and ask one specific question instead.`

  const mostRecentFirst = [...rejected].reverse()

  // Try the whole list first (no elision note needed), then progressively
  // drop the oldest entries until what remains, plus a truthful count of what
  // was dropped, fits. Rejections top out at 40 (`SpecPatchProposal`), so this
  // is at most 40 string builds, trivial next to the network round trip.
  for (let k = mostRecentFirst.length; k >= 1; k--) {
    const list = mostRecentFirst
      .slice(0, k)
      .map((r, i) => `${i + 1}. ${JSON.stringify(r.mutation)}\n   Rejected because: ${r.reason}`)
      .join("\n")
    const elided = mostRecentFirst.length - k
    const body = elided > 0 ? `${list}\n…and ${elided} more were rejected.` : list
    if (header.length + body.length + footer.length <= budget) {
      return `${header}${body}${footer}`
    }
  }
  return null
}

/**
 * Turn a 4xx `CatalystHttpError` into a message that names what was wrong,
 * rather than "bad request" on its own. Catalyst is FastAPI/pydantic, whose
 * 422 body is `{"detail": [{"loc": [...], "msg": "..."}]}`; the field name is
 * the last segment of `loc` that isn't the literal `"body"`. Any other 4xx
 * body shape falls back to a generic message rather than throwing here, a
 * malformed error body must not itself become an unhandled exception.
 */
function describeCatalystRejection(err: CatalystHttpError): string {
  const detail = (err.body as { detail?: unknown } | null | undefined)?.detail
  const first = Array.isArray(detail) ? (detail[0] as { loc?: unknown; msg?: unknown }) : undefined
  const loc = Array.isArray(first?.loc) ? first.loc : []
  const field = [...loc].reverse().find((seg) => seg !== "body")
  if (typeof field === "string" && typeof first?.msg === "string") {
    return `The assistant rejected the request: ${field} ${first.msg}.`
  }
  return `The assistant rejected this request as malformed (HTTP ${err.status}).`
}

/* ── Route ─────────────────────────────────────────────────────────────────*/

/**
 * Keep the turns that are actually turns and drop the rest. Deliberately lenient:
 * this is a transcript the client replays, not a trust boundary that decides
 * anything. The trust boundary is `spec` and `table`, which are parsed strictly
 * below. A single malformed row must not 400 the researcher's question.
 *
 * Content is clamped per turn as well as in aggregate, so one enormous turn
 * cannot eat the whole budget and starve every other turn out of the window.
 */
function sanitiseHistory(raw: unknown): SpecAuthorTurn[] {
  if (!Array.isArray(raw)) return []
  const out: SpecAuthorTurn[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const { role, content } = item as { role?: unknown; content?: unknown }
    if (role !== "user" && role !== "assistant") continue
    if (typeof content !== "string" || content.trim().length === 0) continue
    out.push({ role, content: content.slice(0, SPEC_AUTHOR_PROMPT_MAX_CHARS) })
  }
  return out
}

/** Same leniency, and the same reason. Bounded to the last 10 the bundle keeps. */
function sanitiseRecentEdits(raw: unknown): { description: string; origin: "user" | "ai" }[] {
  if (!Array.isArray(raw)) return []
  const out: { description: string; origin: "user" | "ai" }[] = []
  for (const item of raw.slice(-10)) {
    if (!item || typeof item !== "object") continue
    const { description, origin } = item as { description?: unknown; origin?: unknown }
    if (typeof description !== "string" || description.trim().length === 0) continue
    if (origin !== "user" && origin !== "ai") continue
    out.push({ description: description.slice(0, 400), origin })
  }
  return out
}

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
    // Catalyst's own pydantic model 422s past this length before any handler
    // code runs there; checking it here first turns that into a message the
    // researcher can act on instead of a round trip that fails identically on
    // every retry (ADR-004). Inclusive: exactly the limit is legal.
    if (prompt.length > SPEC_AUTHOR_PROMPT_MAX_CHARS) {
      return NextResponse.json(
        {
          outcome: "bad-request",
          reason: `That request is too long. Shorten it to ${SPEC_AUTHOR_PROMPT_MAX_CHARS} characters or fewer.`,
        },
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

    // (b2) The conversation, if the caller sent one. Optional by contract: a
    // client that omits it — including the one deployed before this field
    // existed — behaves exactly as it did. Unrecognised turns are dropped rather
    // than 400'd, because a malformed transcript must never cost the researcher
    // the question they just asked.
    const history = sanitiseHistory(body.history)
    const trimmed = trimHistory(history)
    const recentEdits = sanitiseRecentEdits(body.recentEdits)

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
    // by construction; raw rows never leave this process — that holds for the
    // conversation too, which is prose the client already had.
    //
    // `history` and `recentEdits` now have a producer (the analysis composer);
    // `project` and `result` still do not, and are left unpopulated rather than
    // invented here — that would be a new data source, not a bundle fix.
    const bundle = buildContextBundle({
      prompt,
      spec,
      profile: toDataProfile(spec, table),
      history: trimmed.turns,
      recentEdits,
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

    /**
     * PROGRESS STREAMS; THE PATCH DOES NOT.
     *
     * Everything above this line still answers with plain JSON and a status
     * code — auth, parse, length, and the screen all resolve before a byte is
     * committed, so those outcomes are unchanged for every caller.
     *
     * From here the route can take 45 seconds across two model calls, and the
     * researcher was previously shown one static word for all of it. What is
     * streamed is PHASES. The patch itself arrives whole, in a single terminal
     * event, because it is a validated spec mutation set and not prose:
     * mutations that fail validation are rejected and repaired (§3.2 Law 2,
     * §3.3 L7), so streaming them token by token would render a plan the repair
     * round is about to discard.
     *
     * Five of the seven phases are this route's own work, so nothing here
     * depends on Catalyst learning to stream.
     */
    const encoder = new TextEncoder()
    const t0 = Date.now()

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let closed = false
        const send = (event: Record<string, unknown>) => {
          if (closed) return
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        }
        const phase = (
          name: string,
          status: "start" | "done" | "warn",
          detail?: string,
        ) => send({ type: "phase", phase: name, status, detail: detail ?? null, ms: Date.now() - t0 })
        const finish = (payload: Record<string, unknown>) => {
          send({ type: "result", ...payload })
          closed = true
          controller.close()
        }

        try {
          phase("screen", "done")
          phase(
            "context",
            "done",
            `${table.rows.length} rows, ${table.columns.length} columns`,
          )

          phase("model", "start")
          let reply: CatalystReply
          try {
            reply = await ask(prompt)
          } catch (err) {
            // Same discrimination as before: a 4xx is our malformed request,
            // anything else is an outage. Both were status codes; once the
            // stream is open they can only be terminal events, so the client
            // reads `outcome` from the payload rather than from `res.status`.
            if (err instanceof CatalystHttpError && err.status >= 400 && err.status < 500) {
              console.error("[spec-author] catalyst rejected the request:", err)
              phase("model", "warn", "rejected the request")
              finish({ outcome: "bad-request", reason: describeCatalystRejection(err) })
              return
            }
            const reason =
              err instanceof CatalystUnavailableError
                ? "The analysis assistant is not configured on this deployment. Everything else still works, the spec you edit by hand is computed the same way."
                : "The analysis assistant is unreachable right now. Your analysis is unaffected; try the request again shortly."
            console.error("[spec-author] catalyst call failed:", err)
            phase("model", "warn", "unreachable")
            finish({ outcome: "unavailable", reason })
            return
          }
          phase("model", "done")

          let patch = review(reply?.proposal ?? reply)
          phase(
            "validate",
            patch.rejected.length > 0 ? "warn" : "done",
            patch.rejected.length > 0
              ? `${patch.rejected.length} of ${patch.rejected.length + patch.mutations.length} rejected`
              : `${patch.mutations.length} accepted`,
          )

          const asksAQuestion = (p: { clarificationNeeded: string | null }) =>
            p.clarificationNeeded !== null && p.clarificationNeeded !== CLARIFICATION_WITHHELD

          if (
            !asksAQuestion(patch) &&
            patch.rejected.length > patch.mutations.length &&
            deadline - Date.now() > REPAIR_MIN_MS
          ) {
            const retryPrompt = repairPrompt(prompt, patch.rejected, SPEC_AUTHOR_PROMPT_MAX_CHARS)
            if (retryPrompt === null) {
              console.error("[spec-author] repair round skipped: no rejection fit the prompt budget")
            } else {
              // Shown, not hidden. "2 mutations rejected, repairing" looks like
              // a defect and is the opposite: it is the guarantee working, out
              // loud, at the moment it matters.
              phase("repair", "start")
              try {
                const retry = await ask(retryPrompt)
                const repaired = review(retry?.proposal ?? retry)
                const recovered =
                  repaired.mutations.length > patch.mutations.length ||
                  (patch.mutations.length === 0 && asksAQuestion(repaired))
                if (recovered) patch = repaired
                phase("repair", "done", recovered ? "recovered" : "no improvement")
              } catch (err) {
                console.error("[spec-author] repair round failed:", err)
                phase("repair", "warn", "failed; keeping the first answer")
              }
            }
          }

          phase("apply", "done")
          finish(trimmed.dropped > 0 ? { ...patch, historyDropped: trimmed.dropped } : patch)
        } catch (err) {
          console.error("[spec-author] stream failed:", err)
          finish({
            outcome: "unavailable",
            reason: "The analysis assistant failed unexpectedly. Your analysis is unaffected.",
          })
        }
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        // Proxies that buffer defeat the entire point of streaming phases.
        "X-Accel-Buffering": "no",
      },
    })
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
