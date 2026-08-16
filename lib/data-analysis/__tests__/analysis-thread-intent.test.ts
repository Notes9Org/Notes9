import { describe, it, expect, beforeEach, vi } from "vitest"
import type { AnalysisAssistantTurn, AnalysisUserTurn } from "@/lib/data-analysis/ai/analysis-thread"
import { fromStoredThread } from "@/lib/data-analysis/ai/analysis-thread"

/**
 * Slice 01: intent persisted as provenance (ADR-013, ADR-023) and a "not
 * saved" signal on a failed turn append, both keyed to the thread with no
 * schema migration.
 *
 * A minimal fluent fake of the supabase-js chain the store actually calls:
 * `.from(table).<op>(...).eq(...).single()`, awaited at any point in the
 * chain. State lives in the two in-memory maps below, reset per test.
 */

type SessionRow = { id: string; metadata: Record<string, unknown> }
type MessageRow = {
  id: string
  session_id: string
  role: string
  content: string
  metadata: Record<string, unknown>
  created_at: string
}

let sessions: Map<string, SessionRow>
let messages: Map<string, MessageRow>
let failUpsert: boolean
let nextId: number

function freshId(prefix: string): string {
  nextId += 1
  return `${prefix}-${nextId}`
}

class FakeChain implements PromiseLike<{ data: unknown; error: unknown }> {
  private filters: { col: string; val: unknown }[] = []
  private wantSingle = false

  constructor(
    private table: "chat_sessions" | "chat_messages",
    private op: "insert" | "insert-select" | "upsert" | "update" | "select",
    private payload?: Record<string, unknown>,
  ) {}

  select(_cols?: string) {
    if (this.op === "insert") this.op = "insert-select"
    return this
  }
  eq(col: string, val: unknown) {
    this.filters.push({ col, val })
    return this
  }
  order(_col: string, _opts?: { ascending: boolean }) {
    return this
  }
  single() {
    this.wantSingle = true
    return this
  }

  private run(): { data: unknown; error: unknown } {
    if (this.table === "chat_sessions") return this.runSessions()
    return this.runMessages()
  }

  private findSession(): SessionRow | undefined {
    const idFilter = this.filters.find((f) => f.col === "id")
    return idFilter ? sessions.get(String(idFilter.val)) : undefined
  }

  private runSessions(): { data: unknown; error: unknown } {
    if (this.op === "insert-select" || this.op === "insert") {
      const id = freshId("session")
      sessions.set(id, { id, metadata: (this.payload?.metadata as Record<string, unknown>) ?? {} })
      return { data: { id }, error: null }
    }
    if (this.op === "update") {
      const row = this.findSession()
      if (!row) return { data: null, error: { message: "not found" } }
      if (this.payload && "metadata" in this.payload) {
        row.metadata = this.payload.metadata as Record<string, unknown>
      }
      return { data: null, error: null }
    }
    if (this.op === "select") {
      const row = this.findSession()
      if (!row) return { data: null, error: { message: "no rows" } }
      return { data: { metadata: row.metadata }, error: null }
    }
    return { data: null, error: { message: "unsupported op" } }
  }

  private runMessages(): { data: unknown; error: unknown } {
    if (this.op === "upsert") {
      if (failUpsert) return { data: null, error: { message: "simulated write failure" } }
      const row = this.payload as unknown as MessageRow
      messages.set(row.id, { ...row, created_at: new Date().toISOString() })
      return { data: null, error: null }
    }
    if (this.op === "update") {
      const idFilter = this.filters.find((f) => f.col === "id")
      const row = idFilter ? messages.get(String(idFilter.val)) : undefined
      if (!row) return { data: null, error: { message: "not found" } }
      if (this.payload && "metadata" in this.payload) {
        row.metadata = this.payload.metadata as Record<string, unknown>
      }
      return { data: null, error: null }
    }
    if (this.op === "select") {
      const sessionFilter = this.filters.find((f) => f.col === "session_id")
      const rows = [...messages.values()]
        .filter((m) => !sessionFilter || m.session_id === sessionFilter.val)
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
      return { data: rows, error: null }
    }
    return { data: null, error: { message: "unsupported op" } }
  }

  then<TResult1 = { data: unknown; error: unknown }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const result = this.wantSingle ? this.run() : this.run()
    return Promise.resolve(result).then(onfulfilled, onrejected)
  }
}

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }) },
    from: (table: "chat_sessions" | "chat_messages") => ({
      insert: (row: Record<string, unknown>) => new FakeChain(table, "insert", row),
      upsert: (row: Record<string, unknown>, _opts?: unknown) => new FakeChain(table, "upsert", row),
      update: (patch: Record<string, unknown>) => new FakeChain(table, "update", patch),
      select: (_cols?: string) => new FakeChain(table, "select"),
    }),
  }),
}))

// Static import is safe: vi.mock above is hoisted, so the module under test
// sees the stub the first time it resolves `@/lib/supabase/client`.
import {
  createAnalysisThread,
  appendAnalysisTurn,
  appendAnalysisTurnReporting,
  updateAnalysisTurnPlan,
  loadAnalysisThread,
  writeAnalysisIntent,
  readAnalysisIntent,
} from "@/lib/data-analysis/ai/analysis-thread-store"

function userTurn(content: string): AnalysisUserTurn {
  return {
    v: 1,
    id: `turn-${content}`,
    role: "user",
    content,
    dataFileId: null,
    specHash: "spec-1",
    createdAt: new Date().toISOString(),
  }
}

function assistantTurn(): AnalysisAssistantTurn {
  return {
    v: 1,
    id: "turn-assistant-1",
    role: "assistant",
    content: "Proposing a scatter plot.",
    plan: {
      steps: ["Set x to time", "Set y to OD600"],
      mutations: [],
      rejected: [],
      clarificationNeeded: null,
      status: "proposed",
    },
    specHashAtProposal: "spec-1",
    createdAt: new Date().toISOString(),
  }
}

beforeEach(() => {
  sessions = new Map()
  messages = new Map()
  failUpsert = false
  nextId = 0
})

describe("intent persistence (ADR-013, ADR-023)", () => {
  it("round-trips: write then read returns the same intent", async () => {
    const threadId = await createAnalysisThread({ title: "t", analysisId: "a1", sourceDataFileId: null })
    expect(threadId).not.toBeNull()

    const ok = await writeAnalysisIntent(threadId!, {
      text: "Compare growth rate across strains",
      statedAt: "2026-08-16T00:00:00.000Z",
      appliedToDatasetId: null,
    })
    expect(ok).toBe(true)

    const back = await readAnalysisIntent(threadId!)
    expect(back).toEqual({
      text: "Compare growth rate across strains",
      statedAt: "2026-08-16T00:00:00.000Z",
      appliedToDatasetId: null,
    })
  })

  it("reading a thread with no recorded intent returns undefined, never an empty string", async () => {
    const threadId = await createAnalysisThread({ title: "t", analysisId: "a1", sourceDataFileId: null })
    const back = await readAnalysisIntent(threadId!)
    expect(back).toBeUndefined()
    expect(back).not.toBe("")
  })

  it("intent persists beside plan/approve provenance: AC-9 round trip after reload", async () => {
    const threadId = await createAnalysisThread({ title: "t", analysisId: "a1", sourceDataFileId: null })
    await writeAnalysisIntent(threadId!, {
      text: "Find the IC50",
      statedAt: "2026-08-16T00:00:00.000Z",
      appliedToDatasetId: "dataset-1",
    })

    await appendAnalysisTurn(threadId!, userTurn("what does the data show"))
    const assistant = assistantTurn()
    await appendAnalysisTurn(threadId!, assistant)
    const approved: AnalysisAssistantTurn = { ...assistant, plan: { ...assistant.plan!, status: "approved" } }
    await updateAnalysisTurnPlan(threadId!, approved)

    const reloadedIntent = await readAnalysisIntent(threadId!)
    const reloadedTurns = await loadAnalysisThread(threadId!)
    const reloadedAssistant = reloadedTurns.find((t) => t.role === "assistant") as AnalysisAssistantTurn | undefined

    expect(reloadedIntent?.text).toBe("Find the IC50")
    expect(reloadedIntent?.appliedToDatasetId).toBe("dataset-1")
    expect(reloadedAssistant?.plan?.status).toBe("approved")
  })
})

describe("appendAnalysisTurnReporting (partial failure: turn created, append fails)", () => {
  it("reports failure to its caller instead of resolving silently", async () => {
    const threadId = await createAnalysisThread({ title: "t", analysisId: "a1", sourceDataFileId: null })
    failUpsert = true
    const ok = await appendAnalysisTurnReporting(threadId!, userTurn("will not save"))
    expect(ok).toBe(false)
  })

  it("appendAnalysisTurn stays fire-and-forget and never rejects even on the same failure", async () => {
    const threadId = await createAnalysisThread({ title: "t", analysisId: "a1", sourceDataFileId: null })
    failUpsert = true
    await expect(appendAnalysisTurn(threadId!, userTurn("still visible on screen"))).resolves.toBeUndefined()
  })

  it("succeeds and reports true once the write is not failing", async () => {
    const threadId = await createAnalysisThread({ title: "t", analysisId: "a1", sourceDataFileId: null })
    const ok = await appendAnalysisTurnReporting(threadId!, userTurn("saves fine"))
    expect(ok).toBe(true)
  })
})

describe("version skew: threads written before per-analysis ownership / before intent existed", () => {
  it("fromStoredThread reads an old-shape stored turn (no intent key anywhere) without dropping it", () => {
    const oldShapeRow = [
      {
        v: 1,
        id: "old-1",
        role: "user",
        content: "an old question",
        dataFileId: null,
        specHash: "h1",
        createdAt: "2025-01-01T00:00:00.000Z",
      },
    ]
    const turns = fromStoredThread(oldShapeRow)
    expect(turns).toHaveLength(1)
    expect(turns[0].role).toBe("user")
    expect(turns[0].content).toBe("an old question")
  })

  it("a session whose metadata predates the intent key reads back as undefined, not throwing", async () => {
    const id = freshId("session")
    sessions.set(id, { id, metadata: { analysisId: "a1", sourceDataFileId: null } })
    const intent = await readAnalysisIntent(id)
    expect(intent).toBeUndefined()
  })
})
