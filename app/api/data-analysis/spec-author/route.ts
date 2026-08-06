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
 *   3. nothing the model invents a number into, and no test the data cannot
 *      support, reaches the client.
 */

export const maxDuration = 60

const CATALYST_PATH = "/analysis/spec-author"
/** Under `maxDuration`, so a hung backend returns a message instead of a 504. */
const CATALYST_TIMEOUT_MS = 45_000

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

/* ── Fabricated-number scan over the whole mutation, not just prose ────────*/

function stringsIn(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value)
  else if (Array.isArray(value)) for (const v of value) stringsIn(v, out)
  else if (value && typeof value === "object") for (const v of Object.values(value)) stringsIn(v, out)
  return out
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

    let reply: CatalystReply
    try {
      reply = await callCatalyst<
        { bundle: Record<string, unknown>; prompt: string; system: string },
        CatalystReply
      >(CATALYST_PATH, { bundle, prompt, system: SPEC_AUTHOR_SYSTEM_PROMPT }, accessToken, {
        timeoutMs: CATALYST_TIMEOUT_MS,
      })
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

    // (e) Validate → sanitise → drop. Order matters: an unparseable proposal has
    // no rationale worth sanitising.
    const raw = reply?.proposal ?? reply
    const validated = validateProposal(raw)
    const rejected = [...validated.rejected]

    const { text: rationale } = sanitiseRationale(validated.rationale)

    // A test the data cannot support is not a suggestion, it is a wrong answer
    // with a confident tone. Same `legalTests` the bundle told the model about.
    const allowedTests = new Set(legalTests.map((c) => c.test))

    const mutations = validated.mutations.filter((m) => {
      const record = m as unknown as Record<string, unknown>
      if (stringsIn(record).some(containsFabricatedStatistic)) {
        rejected.push({
          mutation: m,
          reason:
            "The mutation carried a statistic. Every number shown to the researcher comes from the engine.",
        })
        return false
      }
      if (record.kind === "analysis.setTest" && !allowedTests.has(record.value as never)) {
        rejected.push({
          mutation: m,
          reason: `"${String(record.value)}" is not a test this data supports.`,
        })
        return false
      }
      return true
    })

    return NextResponse.json({
      rationale,
      mutations,
      clarificationNeeded: validated.clarificationNeeded,
      rejected,
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
