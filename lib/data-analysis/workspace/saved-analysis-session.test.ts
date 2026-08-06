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
type TableWrite = { table: string; op: "insert" | "update" | "delete" }

let rpcCalls: RpcCall[] = []
let tableWrites: TableWrite[] = []
let revisionSeq = 3

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
    // Nothing was written AT analysis_revisions. A single update here would be
    // a published number changing underneath its author.
    expect(tableWrites.filter((w) => w.table === "analysis_revisions")).toEqual([])
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
