import { describe, it, expect, vi, beforeEach } from "vitest"
import { ENGINE_VERSION, type EngineResult } from "@/lib/data-analysis/engine/contract"
import type { AnalysisSpec } from "@/lib/data-analysis/spec/analysis-spec"
import type { AnalysisRevision } from "@/lib/data-analysis/saved-analysis"
// Static import is safe: vi.mock is hoisted above the import block, so the stub
// is installed before saved-analysis.ts evaluates its supabase import.
import {
  autosaveDraft,
  buildDataSnapshot,
  freezeOnce,
  readDataSnapshot,
  readWorkspaceConfig,
  rerunRevision,
  saveRevision,
} from "./saved-analysis-session"

/**
 * §3A.3 rules 1, 3, 4 and 5, at the seam where the workspace meets the store.
 *
 * The database enforces append-only revisions (no INSERT/UPDATE/DELETE policy on
 * analysis_revisions, 105_saved_analyses.sql). These tests cover the half the
 * database cannot: that the client ROUTES each save to the append-only path
 * rather than reaching for a mutation, that a re-run leaves the revision it came
 * from byte-identical, and that a second freeze is refused rather than reported
 * as a success.
 */

/* ── Supabase recorder ─────────────────────────────────────────────────────*/

type RpcCall = { fn: string; args: Record<string, unknown> }
/** Any write that did NOT go through an RPC, i.e. straight at a table. */
type TableWrite = {
  table: string
  op: "insert" | "update" | "delete" | "select"
  columns?: string
}

let rpcCalls: RpcCall[] = []
let tableWrites: TableWrite[] = []
let revisionSeq = 3
/** What the previous revision row holds in conversation_thread. */
let storedThread: unknown[] | undefined

function rowFor(fn: string, args: Record<string, unknown>) {
  if (fn === "freeze_analysis_revision") {
    return { ...revisionRow(2), id: args.p_revision_id, is_frozen: true, frozen_at: "2026-08-04T00:00:00Z" }
  }
  return {
    ...revisionRow(++revisionSeq),
    analysis_id: args.p_analysis_id,
    spec: args.p_spec,
    data_snapshot: args.p_data_snapshot,
    forked_from_revision_id: args.p_forked_from ?? null,
    change_summary: args.p_change_summary ?? null,
  }
}

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }) },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args })
      return { data: rowFor(fn, args), error: null }
    },
    from: (table: string) => ({
      update: () => {
        tableWrites.push({ table, op: "update" })
        return { eq: async () => ({ error: null }) }
      },
      insert: () => {
        tableWrites.push({ table, op: "insert" })
        return { select: () => ({ single: async () => ({ data: {}, error: null }) }) }
      },
      delete: () => {
        tableWrites.push({ table, op: "delete" })
        return { eq: async () => ({ error: null }) }
      },
      // Added for `rerunIntoNewRevision`'s fallback read of the previous
      // revision's conversation thread. `storedThread` is what that row holds.
      select: (columns: string) => {
        tableWrites.push({ table, op: "select", columns })
        return {
          eq: () => ({
            maybeSingle: async () => ({
              data: storedThread === undefined ? null : { conversation_thread: storedThread },
              error: null,
            }),
          }),
        }
      },
    }),
  }),
}))

/* ── Fixtures ──────────────────────────────────────────────────────────────*/

function revisionRow(no: number) {
  return {
    id: `rev-${no}`,
    analysis_id: "an-1",
    revision_no: no,
    name: null,
    change_summary: null,
    spec: {},
    spec_hash: "spec-hash",
    data_snapshot: null,
    data_version_hash: "sha256:v1",
    results: null,
    engine_version: ENGINE_VERSION,
    conversation_thread: [],
    is_frozen: false,
    frozen_at: null,
    forked_from_revision_id: null,
    author_id: "user-1",
    created_at: "2026-08-01T00:00:00Z",
  }
}

function revision(patch: Partial<AnalysisRevision> = {}): AnalysisRevision {
  return {
    id: "rev-2",
    analysisId: "an-1",
    revisionNo: 2,
    name: "Figure 2B as submitted",
    changeSummary: null,
    spec: { schemaVersion: 1 },
    specHash: "spec-hash",
    dataVersionHash: "sha256:v1",
    dataSnapshot: null,
    results: null,
    engineVersion: ENGINE_VERSION,
    conversationThread: [],
    isFrozen: false,
    frozenAt: null,
    isPinned: false,
    forkedFromRevisionId: null,
    authorId: "user-1",
    createdAt: "2026-08-01T00:00:00Z",
    ...patch,
  }
}

const table = {
  columns: ["dose", "response"],
  rows: [{ rowId: "row-2", values: { dose: 1, response: 0.4 } }],
}

const spec = {
  schemaVersion: 1,
  dataset: {
    fileId: null,
    fileName: "viability_48h.xlsx",
    sheet: null,
    versionHash: "sha256:v1",
    rowCount: 1,
    columnCount: 2,
  },
  roles: [],
  design: { source: "inferred" },
  filters: [],
  exclusions: [],
  transforms: [],
  analysis: { test: "anova-one-way" },
  figure: { kind: "bar-scatter-error", x: {}, y: {} },
  export: {},
} as unknown as AnalysisSpec

const engineResult = {
  engineVersion: ENGINE_VERSION,
  dataVersionHash: "sha256:v2",
  specHash: "spec-hash-2",
} as unknown as EngineResult

beforeEach(() => {
  rpcCalls = []
  tableWrites = []
  storedThread = undefined
  revisionSeq = 3
})

/* ── Rule 4: the analysis survives a reload without a file download ─────────*/

describe("the stored snapshot (§3A.3 rule 4)", () => {
  it("round-trips the rows, the sheet and the rail it was saved with", () => {
    const workbook = { name: "viability_48h.xlsx", sheets: {} } as never
    const config = { chartType: "bar", xKey: "dose", yKeys: ["response"] }
    const read = readDataSnapshot(buildDataSnapshot(table, workbook, config))
    expect(read).not.toBeNull()
    // The rows the engine computed against, byte for byte: this is what makes
    // reopening instant and detachment survivable.
    expect(read!.table).toEqual(table)
    expect(read!.workbook).toEqual(workbook)
    // Revision-scoped, so reopening revision 2 does not draw it with the
    // working draft's figure.
    expect(read!.config).toEqual(config)
  })

  it("returns null for a foreign or damaged payload instead of throwing", () => {
    // The `.n9a` export bundle, a plausible thing to find in this column.
    expect(readDataSnapshot({ kind: "notes9-analysis", version: 1, workbook: {} })).toBeNull()
    expect(readDataSnapshot({ schema: "notes9.analysis-snapshot", version: 1 })).toBeNull()
    expect(readDataSnapshot(null)).toBeNull()
    expect(readDataSnapshot("{}")).toBeNull()
  })

  it("reads the rail configuration back out of workspace_state", () => {
    expect(readWorkspaceConfig({ config: { chartType: "bar" } })).toEqual({ chartType: "bar" })
    expect(readWorkspaceConfig({ config: "not an object" })).toBeNull()
    expect(readWorkspaceConfig({})).toBeNull()
  })
})

/* ── Rule 1: autosave writes a draft, never a revision ──────────────────────*/

describe("autosave (§3A.3 rule 1)", () => {
  it("updates the analysis draft and cuts no revision", async () => {
    await autosaveDraft("an-1", spec, { chartType: "bar" })
    expect(tableWrites).toEqual([{ table: "analyses", op: "update" }])
    expect(rpcCalls).toHaveLength(0)
  })
})

/* ── Rule 3: a re-run appends and never mutates ─────────────────────────────*/

describe("re-run after the source changed (§3A.3 rule 3)", () => {
  it("creates a NEW revision and leaves the old one byte-identical", async () => {
    const previous = revision({ id: "rev-2", revisionNo: 2 })
    const before = JSON.stringify(previous)

    const next = await rerunRevision({
      analysisId: "an-1",
      spec,
      results: engineResult,
      table,
      workbook: null,
      config: { chartType: "bar" },
      previousRevisionId: previous.id,
    })

    // Appended through the SECURITY DEFINER function that allocates the next
    // revision number — the only path with an INSERT on analysis_revisions.
    expect(rpcCalls.map((c) => c.fn)).toEqual(["commit_analysis_revision"])
    expect(next.id).not.toBe(previous.id)
    expect(next.revisionNo).toBeGreaterThan(previous.revisionNo)
    // Lineage recorded, so the re-run is walkable back to what it replaced.
    expect(rpcCalls[0].args.p_forked_from).toBe("rev-2")
    // Nothing was WRITTEN at analysis_revisions. A single update here would be
    // a published number changing underneath its author. Reads are fine and
    // expected — the re-run reads the parent's conversation thread to carry it
    // forward — so this filters on mutation, which is what the rule is about.
    expect(
      tableWrites.filter((w) => w.table === "analysis_revisions" && w.op !== "select")
    ).toEqual([])
    expect(JSON.stringify(previous)).toBe(before)
  })
})

/* ── Rule 5: freeze, and the fork that replaces editing it ──────────────────*/

describe("freeze (§3A.3 rule 5)", () => {
  it("refuses a second freeze rather than reporting a no-op as success", async () => {
    const frozen = await freezeOnce(revision())
    expect(frozen.isFrozen).toBe(true)
    expect(rpcCalls.map((c) => c.fn)).toEqual(["freeze_analysis_revision"])

    await expect(freezeOnce(frozen)).rejects.toThrow(/already frozen/i)
    // The refusal is local: no second call reaches the database.
    expect(rpcCalls).toHaveLength(1)
  })

  it("forks instead of modifying when the open revision is frozen", async () => {
    const frozen = revision({ id: "rev-2", revisionNo: 2, isFrozen: true })

    await saveRevision({
      analysisId: "an-1",
      spec,
      results: null,
      table,
      workbook: null,
      config: { chartType: "bar" },
      openRevision: frozen,
    })

    expect(rpcCalls.map((c) => c.fn)).toEqual(["commit_analysis_revision"])
    expect(rpcCalls[0].args.p_forked_from).toBe("rev-2")
    expect(String(rpcCalls[0].args.p_change_summary)).toMatch(/forked from frozen revision 2/i)
    expect(tableWrites.filter((w) => w.table === "analysis_revisions")).toEqual([])
  })

  it("does not claim a parent for an ordinary sequential save", async () => {
    await saveRevision({
      analysisId: "an-1",
      spec,
      results: null,
      table,
      workbook: null,
      config: { chartType: "bar" },
      openRevision: revision({ isFrozen: false }),
      changeSummary: "Switched to Welch's t-test",
    })

    expect(rpcCalls[0].args.p_forked_from).toBeNull()
    expect(rpcCalls[0].args.p_change_summary).toBe("Switched to Welch's t-test")
    // The snapshot travels with the revision (rule 4), not just the spec.
    expect(readDataSnapshot(rpcCalls[0].args.p_data_snapshot)?.table).toEqual(table)
  })
})

/* ── Rule 3, the half that was losing the record ───────────────────────────*/

/**
 * "Re-run into a new revision" was dropping Catalyst's thread.
 *
 * `rerunRevision` -> `rerunIntoNewRevision` omitted `conversationThread`, so
 * `commitRevision` defaulted it to `[]`. Reopen r4, hit drift, click the
 * button, and r5 — now the CURRENT revision — carried none of the reasoning
 * that produced the figure. On the most reproducibility-sensitive path in the
 * product, "a figure without its reasoning is just a picture" (§3A.2) was being
 * made true by the one button whose job is to preserve the record.
 */
describe("re-run carries the Catalyst thread (§3A.2)", () => {
  const rerunArgs = {
    analysisId: "an-1",
    spec,
    table,
    workbook: null,
    config: { chartType: "bar" },
    results: engineResult,
    previousRevisionId: "rev-2",
  }

  it("passes a live thread straight through", async () => {
    const thread = [{ role: "user", text: "drop the outlier" }]
    await rerunRevision({ ...rerunArgs, conversationThread: thread })

    expect(rpcCalls).toHaveLength(1)
    expect(rpcCalls[0].args.p_conversation).toEqual(thread)
  })

  it("falls back to the thread stored on the revision being re-run", async () => {
    // The fix is in `rerunIntoNewRevision` rather than at the call site, so a
    // caller with no live thread in hand still carries the reasoning forward.
    storedThread = [{ role: "assistant", text: "Welch's t-test, unequal variance" }]
    await rerunRevision(rerunArgs)

    expect(rpcCalls[0].args.p_conversation).toEqual(storedThread)
    // Read from the revision it is re-running, not from anywhere else.
    expect(tableWrites).toContainEqual({
      table: "analysis_revisions",
      op: "select",
      columns: "conversation_thread",
    })
  })

  it("never writes an empty thread when the parent had one", async () => {
    // The regression, stated as the thing that must not happen again.
    storedThread = [{ role: "user", text: "why is this significant?" }]
    await rerunRevision(rerunArgs)
    expect(rpcCalls[0].args.p_conversation).not.toEqual([])
  })

  it("saves the re-run anyway when the parent's thread cannot be read", async () => {
    // Losing the thread is bad; refusing to save numbers the researcher already
    // has on screen would be worse.
    storedThread = undefined
    await expect(rerunRevision(rerunArgs)).resolves.toBeDefined()
    expect(rpcCalls[0].args.p_conversation).toEqual([])
  })

  it("still appends rather than mutating", async () => {
    storedThread = [{ role: "user", text: "again" }]
    await rerunRevision(rerunArgs)
    expect(rpcCalls.map((c) => c.fn)).toEqual(["commit_analysis_revision"])
    expect(rpcCalls[0].args.p_forked_from).toBe("rev-2")
    expect(tableWrites.some((w) => w.op === "update" || w.op === "delete")).toBe(false)
  })
})

/* ── L8: the provenance card has to survive a reload ───────────────────────*/

describe("the edit audit log is persisted with the revision (L8)", () => {
  const auditLog = [
    {
      applied: [
        {
          kind: "data.excludeRow",
          description: "Excluded row 5",
          origin: "user" as const,
          at: "2026-08-04T10:00:00.000Z",
        },
      ],
      reverted: false,
    },
    {
      applied: [
        {
          kind: "figure.setPalette",
          description: "Palette set to viridis",
          origin: "ai" as const,
          at: "2026-08-04T10:05:00.000Z",
        },
      ],
      reverted: true,
    },
  ] as never

  it("round-trips through the snapshot, reverted flags intact", () => {
    const read = readDataSnapshot(
      buildDataSnapshot(table, null, { chartType: "bar" }, auditLog)
    )
    expect(read!.version).toBe(2)
    expect(read!.auditLog).toHaveLength(2)
    // The undone edit is still there. That is the whole requirement.
    expect(read!.auditLog[1].reverted).toBe(true)
  })

  it("is written into the revision that saveRevision cuts", async () => {
    await saveRevision({
      analysisId: "an-1",
      spec,
      table,
      workbook: null,
      config: { chartType: "bar" },
      results: null,
      auditLog,
    })
    const snapshot = rpcCalls[0].args.p_data_snapshot as { auditLog: unknown[] }
    expect(snapshot.auditLog).toHaveLength(2)
  })

  it("travels across a re-run too", async () => {
    await rerunRevision({
      analysisId: "an-1",
      spec,
      table,
      workbook: null,
      config: { chartType: "bar" },
      results: engineResult,
      previousRevisionId: "rev-2",
      auditLog,
    })
    const snapshot = rpcCalls[0].args.p_data_snapshot as { auditLog: unknown[] }
    expect(snapshot.auditLog).toHaveLength(2)
  })

  it("reads a v1 snapshot as an empty log rather than throwing", () => {
    // Revisions saved before the log existed must still open. An empty log
    // means "not recorded", which is not the same claim as "no edits".
    const v1 = {
      schema: "notes9.analysis-snapshot",
      version: 1,
      table,
      workbook: null,
      config: null,
    }
    const read = readDataSnapshot(v1)
    expect(read).not.toBeNull()
    expect(read!.auditLog).toEqual([])
  })

  it("discards a malformed log entry instead of crashing the reopen", () => {
    const damaged = {
      schema: "notes9.analysis-snapshot",
      version: 2,
      table,
      workbook: null,
      config: null,
      auditLog: [null, "nonsense", { applied: [] }, { noApplied: true }],
    }
    expect(readDataSnapshot(damaged)!.auditLog).toHaveLength(1)
  })

  it("defaults to an empty log for a caller that has not adopted it", async () => {
    await saveRevision({
      analysisId: "an-1",
      spec,
      table,
      workbook: null,
      config: { chartType: "bar" },
      results: null,
    })
    const snapshot = rpcCalls[0].args.p_data_snapshot as { auditLog: unknown[] }
    expect(snapshot.auditLog).toEqual([])
  })
})
