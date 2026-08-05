/**
 * /api/data-analysis/spec-author, the AI seam contract.
 *
 * These tests exist to fail loudly if a guarantee breaks, so they assert the
 * three things the route is FOR rather than its happy path:
 *   i.   PROSE carrying a statistic is withheld — and a typed mutation payload
 *        is not prose, so the numbers a spec is made of survive;
 *   ii.  a request with no resolved table is refused at the ROUTE with 400;
 *   iii. a proposed test the data cannot support never reaches the client.
 * Plus the privacy claim: raw rows never appear in the outbound payload.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}))

const currentUser = vi.fn(async (): Promise<{ id: string } | null> => ({ id: "user-1" }))
vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: () => currentUser(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getSession: async () => ({ data: { session: { access_token: "token-1" } } }),
    },
  })),
}))

import { POST } from "./route"
import { parseSpec, type AnalysisSpec } from "@/lib/data-analysis/spec/analysis-spec"
import type { Table } from "@/lib/data-analysis/engine/resolver"
// The far end of the interlock. Asserting the route's field alone would only
// restate the route; asserting the button the field controls is the guarantee.
import { canExecuteProposal } from "@/lib/data-analysis/workspace/spec-prompt"

/* ── Fixtures ──────────────────────────────────────────────────────────────*/

function spec(): AnalysisSpec {
  const parsed = parseSpec({
    schemaVersion: 1,
    dataset: {
      fileId: null,
      fileName: "plate.xlsx",
      sheet: null,
      versionHash: "sha256:abcd1234",
      rowCount: 8,
      columnCount: 2,
    },
    design: { source: "project-record", paired: false },
    analysis: { test: "t-unpaired", groupColumn: "treatment", responseColumns: ["viability"] },
    figure: { kind: "bar-scatter-error", x: {}, y: {} },
    export: {},
  })
  if (!parsed.ok) throw new Error("fixture spec invalid")
  return parsed.spec
}

/** Neither the min nor the max, so it can only leak by being sent verbatim. */
const SECRET_VALUE = 87.531

function table(): Table {
  const rows = [
    ["control", 91.2],
    ["control", 88.4],
    ["control", SECRET_VALUE],
    ["control", 90.1],
    ["treated", 62.3],
    ["treated", 58.9],
    ["treated", 61.4],
    ["treated", 59.8],
  ] as const
  return {
    columns: ["treatment", "viability"],
    rows: rows.map(([treatment, viability], i) => ({
      rowId: `row-${i + 1}`,
      values: { treatment, viability },
    })),
  }
}

function request(body: unknown) {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0]
}

/** Catalyst answers with `proposal`; the fetch is mocked, never the network. */
let fetchMock: ReturnType<typeof vi.fn>

function replyWith(proposal: unknown) {
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ proposal }),
  } as unknown as Response)
}

/** One reply per model call, in order, so a repair round can answer differently. */
function replyInTurn(...proposals: unknown[]) {
  for (const proposal of proposals) {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ proposal }),
    } as unknown as Response)
  }
}

/** The prompt as it crossed the seam on the nth (0-based) model call. */
function promptSent(call: number): string {
  const [, init] = fetchMock.mock.calls[call] as [string, RequestInit]
  return JSON.parse(String(init.body)).prompt as string
}

beforeEach(() => {
  vi.stubEnv("CATALYST_URL", "https://catalyst.test")
  currentUser.mockResolvedValue({ id: "user-1" })
  fetchMock = vi.fn()
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/* ── Guarantee i: no model-authored statistic reaches the user ─────────────*/

describe("no number the model invented survives", () => {
  it("strips a fabricated statistic from the rationale", async () => {
    replyWith({
      rationale:
        "The groups differ clearly. The unpaired t-test gives p = 0.003, so I have set it.",
      mutations: [{ kind: "analysis.setTest", value: "t-unpaired" }],
      clarificationNeeded: null,
    })

    const res = await POST(request({ prompt: "compare the two groups", spec: spec(), table: table() }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.rationale).not.toMatch(/p\s*=\s*0?\.003/)
    expect(body.rationale).toContain("results panel")
  })

  // The prose detector used to be run over every string in every mutation
  // payload as well, which refused all of these. A number inside a TYPED payload
  // is a spec value: a threshold, a concentration in a title, a control level, a
  // dose, a timestamp. The schema types each one and the researcher approves the
  // patch before it runs, so there is nothing here for a prose gate to add and a
  // whole legitimate vocabulary for it to take away.
  it.each([
    ["a concentration in a title", { kind: "figure.setTitle", value: "Viability at 100 nM" }],
    ["a dose range in a title", { kind: "figure.setTitle", value: "Dose response 0.5-50 uM" }],
    [
      "a threshold in a filter",
      { kind: "data.setFilters", filters: [{ column: "viability", op: "gt", value: "0.5" }] },
    ],
    [
      "a control level written as a percentage",
      {
        kind: "data.addTransform",
        transform: {
          kind: "normaliseToControl",
          column: "viability",
          groupColumn: "treatment",
          controlLevel: "0.1% DMSO",
        },
      },
    ],
    [
      "dose levels as filter values",
      {
        kind: "data.setFilters",
        filters: [{ column: "treatment", op: "in", value: ["1200", "2400"] }],
      },
    ],
    [
      "an ISO timestamp in a filter",
      {
        kind: "data.setFilters",
        filters: [{ column: "measured_at", op: "gte", value: "2026-08-04T09:00:00.000Z" }],
      },
    ],
  ])("keeps %s", async (_label, mutation) => {
    replyWith({
      rationale: "Configuring the comparison.",
      mutations: [mutation],
      clarificationNeeded: null,
    })

    const res = await POST(request({ prompt: "set this up", spec: spec(), table: table() }))
    const body = await res.json()

    expect(body.rejected).toHaveLength(0)
    expect(body.mutations).toHaveLength(1)
  })

  it("withholds a clarifying question that carries a statistic, and Execute with it", async () => {
    // One VALID mutation, so `mutationCount > 0`: everything except the question
    // itself says Execute is fine. The question is the only thing withholding it.
    replyWith({
      rationale: "Checking the comparison.",
      mutations: [{ kind: "analysis.setTest", value: "t-unpaired" }],
      clarificationNeeded:
        "The control group is already significant at p = 0.002, do you still want the comparison added?",
    })

    const res = await POST(request({ prompt: "compare the groups", spec: spec(), table: table() }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.mutations).toHaveLength(1)
    // The number the model invented is not rendered anywhere the researcher
    // reads. (Only the reason strip is rendered from `rejected`, so the echoed
    // payload there is not a leak, the same shape a rejected mutation ships in.)
    expect(body.clarificationNeeded).not.toMatch(/p\s*=\s*0?\.002/)
    expect(body.rejected.map((r: { reason: string }) => r.reason).join(" ")).not.toMatch(
      /p\s*=\s*0?\.002/
    )
    // And Execute stays withheld. The model flagged this request as ambiguous;
    // refusing to show its wording must not be a quieter way of saying go ahead.
    expect(
      canExecuteProposal({
        mutationCount: body.mutations.length,
        clarificationNeeded: body.clarificationNeeded,
      })
    ).toBe(false)
    // Not silent, in either direction: the researcher is told a question was
    // refused and why, and the question box says one was held back.
    expect(body.rejected.some((r: { reason: string }) => /statistic/i.test(r.reason))).toBe(true)
    expect(body.clarificationNeeded).toMatch(/question/i)
  })
})

/* ── Guarantee ii: no table, no answer, enforced at the route ─────────────*/

describe("the no-table constraint lives at the route", () => {
  it("refuses with 400 when the table is missing", async () => {
    const res = await POST(request({ prompt: "run a t-test", spec: spec() }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.outcome).toBe("no-table")
    expect(body.reason).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("refuses with 400 when the table resolved to no rows", async () => {
    const res = await POST(
      request({ prompt: "run a t-test", spec: spec(), table: { columns: ["a"], rows: [] } })
    )
    expect(res.status).toBe(400)
    expect((await res.json()).outcome).toBe("no-table")
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

/* ── Guarantee iii: an unsupported test never reaches the client ───────────*/

describe("a test the data cannot support is rejected", () => {
  it("drops analysis.setTest when the kind is not offerable", async () => {
    replyWith({
      rationale: "Survival analysis will show the difference.",
      mutations: [
        { kind: "analysis.setTest", value: "kaplan-meier" },
        { kind: "analysis.setTest", value: "t-unpaired" },
      ],
      clarificationNeeded: null,
    })

    const res = await POST(request({ prompt: "compare the groups", spec: spec(), table: table() }))
    const body = await res.json()

    const kinds = body.mutations.map((m: { value: string }) => m.value)
    expect(kinds).not.toContain("kaplan-meier")
    expect(kinds).toContain("t-unpaired")
    expect(body.rejected.some((r: { reason: string }) => /kaplan-meier/.test(r.reason))).toBe(true)
  })
})

/* ── One repair round, and only one ─────────────────────────────────────────*/

describe("a patch the gate rejected gets one repair round", () => {
  it("re-asks with the reasons and returns the repaired patch", async () => {
    replyInTurn(
      {
        rationale: "Setting the comparison.",
        mutations: [{ kind: "analysis.setNonsense", value: "whatever" }],
        clarificationNeeded: null,
      },
      {
        rationale: "Using the unpaired t-test instead.",
        mutations: [{ kind: "analysis.setTest", value: "t-unpaired" }],
        clarificationNeeded: null,
      }
    )

    const res = await POST(request({ prompt: "compare the two groups", spec: spec(), table: table() }))
    const body = await res.json()

    // Exactly one repair, not a loop.
    expect(fetchMock).toHaveBeenCalledTimes(2)

    // The repair carried the original request AND what the gate refused.
    const repair = promptSent(1)
    expect(repair).toContain("compare the two groups")
    expect(repair).toContain("analysis.setNonsense")
    expect(repair).toMatch(/rejected/i)

    // The researcher sees one approved-pending plan, not a list of refusals.
    expect(res.status).toBe(200)
    expect(body.mutations).toHaveLength(1)
    expect(body.mutations[0].kind).toBe("analysis.setTest")
    expect(body.mutations[0].value).toBe("t-unpaired")
    expect(body.rejected).toHaveLength(0)
  })

  it("returns the rejections when the second reply fails too, and does not try a third time", async () => {
    replyInTurn(
      {
        rationale: "Survival analysis will show it.",
        mutations: [{ kind: "analysis.setTest", value: "kaplan-meier" }],
        clarificationNeeded: null,
      },
      {
        rationale: "Survival analysis, again.",
        mutations: [{ kind: "analysis.setTest", value: "kaplan-meier" }],
        clarificationNeeded: null,
      }
    )

    const res = await POST(request({ prompt: "compare the groups", spec: spec(), table: table() }))
    const body = await res.json()

    // A second failure is an answer, not another retry.
    expect(fetchMock).toHaveBeenCalledTimes(2)

    expect(res.status).toBe(200)
    expect(body.mutations).toHaveLength(0)
    // Not a silent empty patch: the researcher is told what was refused and why.
    expect(body.rejected.length).toBeGreaterThan(0)
    expect(body.rejected.some((r: { reason: string }) => /kaplan-meier/.test(r.reason))).toBe(true)
  })

  it("adopts a question from the repair round when nothing survived the first", async () => {
    replyInTurn(
      {
        rationale: "Setting the comparison.",
        mutations: [{ kind: "analysis.setNonsense", value: "whatever" }],
        clarificationNeeded: null,
      },
      {
        rationale: "I can't tell which comparison you mean.",
        mutations: [],
        clarificationNeeded: "Are the two groups the same subjects measured twice?",
      }
    )

    const res = await POST(request({ prompt: "compare the groups", spec: spec(), table: table() }))
    const body = await res.json()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    // The repair prompt asks for exactly this when nothing legal fits, so the
    // reply that obeys it must not be the one the route discards.
    expect(body.clarificationNeeded).toBe("Are the two groups the same subjects measured twice?")
    expect(body.mutations).toHaveLength(0)
  })

  it("keeps the first answer when the repair call itself fails", async () => {
    replyInTurn({
      rationale: "Setting the comparison.",
      mutations: [{ kind: "analysis.setNonsense", value: "whatever" }],
      clarificationNeeded: null,
    })
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"))

    const res = await POST(request({ prompt: "compare the groups", spec: spec(), table: table() }))
    const body = await res.json()

    // A failed repair is not a failed request; the route never 503s here.
    expect(res.status).toBe(200)
    expect(body.rejected.length).toBeGreaterThan(0)
  })

  it("does not re-ask when the model asked a question instead of acting", async () => {
    replyWith({
      rationale: "I need to know the response column.",
      mutations: [{ kind: "analysis.setNonsense", value: "whatever" }],
      clarificationNeeded: "Which column is the response?",
    })

    const res = await POST(request({ prompt: "what should I run?", spec: spec(), table: table() }))
    const body = await res.json()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(body.clarificationNeeded).toBe("Which column is the response?")
  })
})

/* ── The privacy claim: the model never sees the data ──────────────────────*/

describe("raw rows never cross the seam", () => {
  it("sends only the bundle and the prompt", async () => {
    replyWith({ rationale: "ok", mutations: [], clarificationNeeded: "Which column is the response?" })

    await POST(request({ prompt: "what should I run?", spec: spec(), table: table() }))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("https://catalyst.test/analysis/spec-author")

    const sent = String(init.body)
    // `system` is the static prompt, not context; bundle and prompt are the only
    // request-derived fields, and neither may carry a row.
    expect(Object.keys(JSON.parse(sent)).sort()).toEqual(["bundle", "prompt", "system"])
    // Row ids and cell values are the data. None of it may appear.
    expect(sent).not.toContain("row-1")
    expect(sent).not.toContain(String(SECRET_VALUE))
    expect(sent).not.toContain("rows")
  })
})

/* ── Screening and failure modes ───────────────────────────────────────────*/

describe("screened requests and unavailable backends", () => {
  it("returns the refusal and its alternative without spending a model call", async () => {
    const res = await POST(
      request({ prompt: "remove the outlier so it's significant", spec: spec(), table: table() })
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.outcome).toBe("refused")
    expect(body.alternative).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("fails closed and legibly when Catalyst is not configured", async () => {
    vi.stubEnv("CATALYST_URL", "")
    vi.stubEnv("CHAT_API_URL", "")

    const res = await POST(request({ prompt: "run a t-test", spec: spec(), table: table() }))
    const body = await res.json()

    expect(res.status).toBe(503)
    expect(body.outcome).toBe("unavailable")
    expect(body.reason).toMatch(/not configured/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("fails closed when Catalyst is unreachable", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"))

    const res = await POST(request({ prompt: "run a t-test", spec: spec(), table: table() }))
    const body = await res.json()

    expect(res.status).toBe(503)
    expect(body.outcome).toBe("unavailable")
  })

  it("401s when there is no user", async () => {
    currentUser.mockResolvedValue(null)
    const res = await POST(request({ prompt: "run a t-test", spec: spec(), table: table() }))
    expect(res.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
