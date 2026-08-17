import { describe, it, expect, beforeEach, vi } from "vitest"
import type { AnalysisAssistantTurn, AnalysisPlan, AnalysisUserTurn } from "@/lib/data-analysis/ai/analysis-thread"
import { approvalBlockedReason, canApprovePlan, fromStoredThread } from "@/lib/data-analysis/ai/analysis-thread"

/**
 * Slice 01: intent persisted as provenance (ADR-013, ADR-023) and a "not
 * saved" signal on a failed turn append, both keyed to the thread with no
 * schema migration.
 *
 * A minimal fluent fake of the supabase-js chain the store actually calls:
 * `.from(table).<op>(...).eq(...).single()`, awaited at any point in the
 * chain. State lives in the two in-memory maps below, reset per test.
 */

type SessionRow = { id: string; metadata: Record<string, unknown>; updatedAt: string }
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
let clock: number

function freshId(prefix: string): string {
  nextId += 1
  return `${prefix}-${nextId}`
}

/** Deterministic, strictly increasing `updated_at` stand-in. */
function tick(): string {
  clock += 1
  return new Date(2024, 0, 1, 0, 0, clock).toISOString()
}

/**
 * Faithful to `@supabase/postgrest-js`: every filter value is coerced through
 * a template literal (`` `eq.${value}` ``) before it becomes a query param.
 * For a scalar that is an exact, lossless round trip. For a plain object
 * `${value}` is always the literal string "[object Object]" -- content-blind,
 * so an object-valued filter can never distinguish one object from another
 * and must never be treated as matching here, no matter what the row holds.
 * This is what made the pre-fix `writeAnalysisIntent`'s `.eq("metadata", …)`
 * a silent no-op in production while an earlier, kinder version of this fake
 * (a `JSON.stringify` deep-equality check) reported it working.
 */
function matchesFilter(filterVal: unknown, rowVal: unknown): boolean {
  if (filterVal !== null && typeof filterVal === "object") return false
  return `${filterVal}` === `${rowVal}`
}

class FakeChain implements PromiseLike<{ data: unknown; error: unknown }> {
  private filters: { col: string; val: unknown }[] = []
  private wantSingle = false

  constructor(
    private table: "chat_sessions" | "chat_messages",
    private op: "insert" | "insert-select" | "upsert" | "update" | "update-select" | "select",
    private payload?: Record<string, unknown>,
  ) {}

  select(_cols?: string) {
    if (this.op === "insert") this.op = "insert-select"
    if (this.op === "update") this.op = "update-select"
    return this
  }
  eq(col: string, val: unknown) {
    this.filters.push({ col, val })
    return this
  }
  is(col: string, val: unknown) {
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
      sessions.set(id, {
        id,
        metadata: (this.payload?.metadata as Record<string, unknown>) ?? {},
        updatedAt: tick(),
      })
      return { data: { id }, error: null }
    }
    if (this.op === "update" || this.op === "update-select") {
      const empty = this.op === "update-select" ? [] : null
      const row = this.findSession()
      if (!row) return { data: empty, error: null }
      // Compare-and-set: every filter other than `id` on this chain is a WHERE
      // condition the caller built from a value it just read, checked the same
      // way Postgrest checks it -- see `matchesFilter`. If the row has moved
      // since, this matches zero rows instead of overwriting it.
      const conditionFilters = this.filters.filter((f) => f.col !== "id")
      const rowValue = (col: string): unknown =>
        col === "updated_at" ? row.updatedAt : (row as unknown as Record<string, unknown>)[col]
      if (!conditionFilters.every((f) => matchesFilter(f.val, rowValue(f.col)))) {
        return { data: empty, error: null }
      }
      if (this.payload && "metadata" in this.payload) {
        row.metadata = this.payload.metadata as Record<string, unknown>
      }
      if (this.payload && "updated_at" in this.payload) {
        row.updatedAt = this.payload.updated_at as string
      }
      return { data: this.op === "update-select" ? [{ id: row.id }] : null, error: null }
    }
    if (this.op === "select") {
      const row = this.findSession()
      if (!row) return { data: null, error: { message: "no rows" } }
      // Snapshot before any hook runs — the hook simulates a concurrent
      // writer landing right after this caller's read, so the caller must
      // keep the values it actually read, not whatever the row holds now.
      const snapshot = { metadata: row.metadata, updatedAt: row.updatedAt }
      onSessionSelect?.(row)
      return { data: { metadata: snapshot.metadata, updated_at: snapshot.updatedAt }, error: null }
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
    const exec = async () => {
      // A conditioned write (CAS) is the point a real race resolves at. A
      // gate parked here — released explicitly by a test — lets one caller's
      // write be suspended mid-flight while another caller's full
      // read-modify-write runs to completion, the interleaving a chain that
      // resolves synchronously in one microtask could never produce.
      if (
        this.table === "chat_sessions" &&
        (this.op === "update" || this.op === "update-select") &&
        this.filters.some((f) => f.col === "updated_at") &&
        nextSessionWriteGate
      ) {
        const gate = nextSessionWriteGate
        nextSessionWriteGate = null
        onGatedWrite?.()
        onGatedWrite = null
        await gate
      }
      return this.run()
    }
    return exec().then(onfulfilled, onrejected)
  }
}

/**
 * Interleaving hooks for the concurrency tests below. Both are reset per test.
 *
 * `onSessionSelect` fires synchronously right after a `chat_sessions` read is
 * snapshotted, so a test can simulate another writer landing in the gap
 * between "we read this" and "we're about to write conditioned on it".
 *
 * `nextSessionWriteGate` / `onGatedWrite` suspend the *next* conditioned
 * `chat_sessions` write until a test releases it, so a test can park one
 * caller mid-write while a second caller's full call runs and completes.
 */
let onSessionSelect: ((row: SessionRow) => void) | null
let nextSessionWriteGate: Promise<void> | null
let onGatedWrite: (() => void) | null

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
  clock = 0
  onSessionSelect = null
  nextSessionWriteGate = null
  onGatedWrite = null
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
    sessions.set(id, { id, metadata: { analysisId: "a1", sourceDataFileId: null }, updatedAt: tick() })
    const intent = await readAnalysisIntent(id)
    expect(intent).toBeUndefined()
  })
})

describe("writeAnalysisIntent concurrency (optimistic concurrency, HIGH finding 1)", () => {
  it("a write staled by a concurrent writer retries instead of clobbering it", async () => {
    const threadId = await createAnalysisThread({ title: "t", analysisId: "a1", sourceDataFileId: null })
    const row = sessions.get(threadId!)!
    row.metadata = { analysisId: "a1", sourceDataFileId: null }

    // Suspend the *next* conditioned write so we can let a second caller's
    // full read-modify-write land in the gap — the race two tabs / a retry /
    // a double-click produce, which a chain that resolves in one microtask
    // can never reproduce on its own.
    let releaseA: () => void = () => {}
    nextSessionWriteGate = new Promise<void>((resolve) => {
      releaseA = resolve
    })
    let gatedSignal!: () => void
    const reachedGate = new Promise<void>((resolve) => {
      gatedSignal = resolve
    })
    onGatedWrite = () => gatedSignal()

    const callA = writeAnalysisIntent(threadId!, {
      text: "from tab A",
      statedAt: "2026-08-16T00:00:00.000Z",
      appliedToDatasetId: null,
    })
    // callA has read the pre-B metadata and is now parked before its
    // conditioned write.
    await reachedGate

    // A second, unrelated writer lands fully while A is parked — simulating
    // the other tab as well as an unrelated field (`sourceDataFileId`)
    // changing underneath A, which finding 1 calls out by name.
    const okB = await writeAnalysisIntent(threadId!, {
      text: "from tab B",
      statedAt: "2026-08-16T00:00:00.000Z",
      appliedToDatasetId: null,
    })
    expect(okB).toBe(true)
    row.metadata = { ...row.metadata, sourceDataFileId: "df-1" }

    // Release A: its first conditioned write is now stale (row moved twice
    // since its read) and must not silently overwrite what landed.
    releaseA()
    const okA = await callA
    expect(okA).toBe(true) // retried against the fresh value and landed

    // Nothing was silently lost: B's unrelated field survives, and A's own
    // write is the one now on the intent key.
    expect(row.metadata.sourceDataFileId).toBe("df-1")
    const finalIntent = await readAnalysisIntent(threadId!)
    expect(finalIntent?.text).toBe("from tab A")
  })

  it("surfaces a conflict instead of hanging or lying when the row never settles", async () => {
    const threadId = await createAnalysisThread({ title: "t", analysisId: "a1", sourceDataFileId: null })
    let reads = 0
    onSessionSelect = (row) => {
      reads += 1
      // Someone else writes to the row on every single read this caller
      // makes -- and, like every real writer of this row, bumps `updated_at`
      // when it does -- so the conditional write can never match. This must
      // give up and report false, not retry forever or report success on a
      // lost write.
      row.metadata = { ...row.metadata, churn: reads }
      row.updatedAt = tick()
    }
    const ok = await writeAnalysisIntent(threadId!, {
      text: "never lands",
      statedAt: "2026-08-16T00:00:00.000Z",
      appliedToDatasetId: null,
    })
    expect(ok).toBe(false)
    expect(reads).toBeGreaterThan(1) // it did retry, it did not just give up on the first attempt
  })
})

describe("malformed persisted plan (HIGH findings 2-5): validated at the storage boundary", () => {
  function assistantRow(plan: unknown) {
    return {
      v: 1,
      id: "turn-malformed",
      role: "assistant",
      content: "Proposing something.",
      plan,
      specHashAtProposal: "spec-1",
      createdAt: "2026-08-16T00:00:00.000Z",
    }
  }

  it("fromStoredThread: missing mutations degrades the plan to null, keeps the turn, does not throw", () => {
    const turns = fromStoredThread([
      assistantRow({ steps: ["a step"], rejected: [], clarificationNeeded: null, status: "proposed" }),
    ])
    expect(turns).toHaveLength(1)
    expect(turns[0].role).toBe("assistant")
    expect((turns[0] as AnalysisAssistantTurn).plan).toBeNull()
  })

  it("fromStoredThread: mutations present but not an array degrades the plan to null, does not throw", () => {
    const turns = fromStoredThread([
      assistantRow({
        steps: ["a step"],
        mutations: "not-an-array",
        rejected: [],
        clarificationNeeded: null,
        status: "proposed",
      }),
    ])
    expect((turns[0] as AnalysisAssistantTurn).plan).toBeNull()
  })

  it("fromStoredThread: plan is not an object degrades to null, does not throw", () => {
    const turns = fromStoredThread([assistantRow("not-an-object")])
    expect((turns[0] as AnalysisAssistantTurn).plan).toBeNull()
    const turnsNumber = fromStoredThread([assistantRow(42)])
    expect((turnsNumber[0] as AnalysisAssistantTurn).plan).toBeNull()
  })

  it("loadAnalysisThread: a malformed plan on a real row degrades to null instead of throwing", async () => {
    const threadId = await createAnalysisThread({ title: "t", analysisId: "a1", sourceDataFileId: null })
    messages.set("msg-malformed", {
      id: "msg-malformed",
      session_id: threadId!,
      role: "assistant",
      content: "Proposing something.",
      metadata: {
        v: 1,
        plan: { steps: [], rejected: [], clarificationNeeded: null, status: "proposed" }, // no mutations
        specHashAtProposal: "spec-1",
      },
      created_at: "2026-08-16T00:00:00.000Z",
    })
    const turns = await loadAnalysisThread(threadId!)
    const assistant = turns.find((t) => t.role === "assistant") as AnalysisAssistantTurn | undefined
    expect(assistant).toBeDefined()
    expect(assistant?.plan).toBeNull()
  })

  it("canApprovePlan and approvalBlockedReason never throw on a malformed plan and withhold Approve", () => {
    const badPlan = {
      steps: ["a step"],
      rejected: [],
      clarificationNeeded: null,
      status: "proposed",
      // mutations deliberately absent — the shape findings 4/5 warn about
      // reaching the approval gate directly, bypassing the storage boundary.
    } as unknown as AnalysisPlan
    const turn: AnalysisAssistantTurn = {
      v: 1,
      id: "turn-bad-plan",
      role: "assistant",
      content: "Proposing something.",
      plan: badPlan,
      specHashAtProposal: "spec-1",
      createdAt: "2026-08-16T00:00:00.000Z",
    }
    expect(() => canApprovePlan(turn, "spec-1")).not.toThrow()
    expect(canApprovePlan(turn, "spec-1")).toBe(false)
    expect(() => approvalBlockedReason(turn, "spec-1")).not.toThrow()
    expect(approvalBlockedReason(turn, "spec-1")).toBe("Nothing to apply.")
  })

  it("a non-string step is dropped, not left to reach the renderer", () => {
    const turns = fromStoredThread([
      assistantRow({
        mutations: [{ kind: "figure.setGridlines", value: true }],
        steps: ["a real step", { not: "a string" }, "another real step"],
        rejected: [],
        clarificationNeeded: null,
        status: "proposed",
      }),
    ])
    const plan = (turns[0] as AnalysisAssistantTurn).plan
    expect(plan).not.toBeNull()
    expect(plan?.steps).toEqual(["a real step", "another real step"])
  })

  it("a null rejected entry is dropped, not left to reach .reason", () => {
    const turns = fromStoredThread([
      assistantRow({
        mutations: [{ kind: "figure.setGridlines", value: true }],
        steps: [],
        rejected: [{ reason: "kept" }, null, { notReason: "dropped" }],
        clarificationNeeded: null,
        status: "proposed",
      }),
    ])
    const plan = (turns[0] as AnalysisAssistantTurn).plan
    expect(plan).not.toBeNull()
    expect(plan?.rejected).toEqual([{ reason: "kept" }])
  })

  it("a mutation missing a required field is dropped, withholding Approve when it was the only one", () => {
    const turns = fromStoredThread([
      assistantRow({
        // Finding 2's exact example: `data.excludeRow` with no `exclusion`.
        mutations: [{ kind: "data.excludeRow" }],
        steps: [],
        rejected: [],
        clarificationNeeded: null,
        status: "proposed",
      }),
    ])
    const turn = turns[0] as AnalysisAssistantTurn
    expect(turn.plan).not.toBeNull()
    expect(turn.plan?.mutations).toEqual([])
    expect(() => canApprovePlan(turn, "spec-1")).not.toThrow()
    expect(canApprovePlan(turn, "spec-1")).toBe(false)
    expect(approvalBlockedReason(turn, "spec-1")).toBe("Nothing to apply.")
  })

  it("a valid mutation survives alongside a dropped invalid one", () => {
    const turns = fromStoredThread([
      assistantRow({
        mutations: [{ kind: "data.excludeRow" }, { kind: "figure.setGridlines", value: true }],
        steps: [],
        rejected: [],
        clarificationNeeded: null,
        status: "proposed",
      }),
    ])
    const plan = (turns[0] as AnalysisAssistantTurn).plan
    expect(plan?.mutations).toEqual([{ kind: "figure.setGridlines", value: true }])
  })
})
