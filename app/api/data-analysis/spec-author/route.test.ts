/**
 * /api/data-analysis/spec-author, the AI seam contract.
 *
 * These tests exist to fail loudly if a guarantee breaks, so they assert the
 * three things the route is FOR rather than its happy path:
 *   i.   a rationale carrying a statistic is stripped, and a mutation carrying
 *        one is dropped;
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

  it("drops a mutation whose text carries a statistic, with a reason", async () => {
    replyWith({
      rationale: "Titling the figure for the comparison.",
      mutations: [
        { kind: "figure.setTitle", value: "Viability by treatment (p = 0.003)" },
        { kind: "figure.setSubtitle", value: "n = 8 wells" },
      ],
      clarificationNeeded: null,
    })

    const res = await POST(request({ prompt: "title the figure", spec: spec(), table: table() }))
    const body = await res.json()

    expect(body.mutations).toHaveLength(1)
    expect(body.mutations[0].kind).toBe("figure.setSubtitle")
    expect(body.rejected).toHaveLength(1)
    expect(body.rejected[0].mutation.value).toContain("p = 0.003")
    expect(body.rejected[0].reason).toMatch(/statistic/i)
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

/* ── The privacy claim: the model never sees the data ──────────────────────*/

describe("raw rows never cross the seam", () => {
  it("sends only the bundle and the prompt", async () => {
    replyWith({ rationale: "ok", mutations: [], clarificationNeeded: "Which column is the response?" })

    await POST(request({ prompt: "what should I run?", spec: spec(), table: table() }))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("https://catalyst.test/analysis/spec-author")

    const sent = String(init.body)
    expect(Object.keys(JSON.parse(sent)).sort()).toEqual(["bundle", "prompt"])
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
