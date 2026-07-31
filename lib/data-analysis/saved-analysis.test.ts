import { describe, it, expect, vi, beforeEach } from "vitest"
import { ENGINE_VERSION } from "@/lib/data-analysis/engine/contract"
// A static import is safe despite the mock below: vi.mock is hoisted above the
// import block, so the stub is installed before this module is evaluated.
import { openRevision, buildPortableBundle } from "./saved-analysis"

/**
 * The reopen path (§3A.3 rule 3) is the highest-consequence code in the saved
 * analysis: getting it wrong means a published p-value can change underneath
 * its author. These tests drive it against a stubbed Supabase client so the
 * decision logic is verified without a database.
 */

const revisionRow = {
  id: "rev-1",
  analysis_id: "an-1",
  revision_no: 3,
  name: "Figure 2B as submitted",
  change_summary: null,
  spec: {
    schemaVersion: 1,
    dataset: {
      fileId: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
      fileName: "viability_48h.xlsx",
      sheet: null,
      versionHash: "sha256:v2",
      rowCount: 24,
      columnCount: 3,
    },
    roles: [],
    design: { source: "inferred" },
    filters: [],
    exclusions: [],
    transforms: [],
    analysis: { test: "anova-one-way" },
    figure: { kind: "bar-scatter-error", x: {}, y: {} },
    export: {},
  },
  spec_hash: "spec-hash-1",
  data_snapshot: { rows: [] },
  data_version_hash: "sha256:v2",
  results: { engineVersion: ENGINE_VERSION, test: { pValue: 0.0123 } },
  engine_version: ENGINE_VERSION,
  conversation_thread: [],
  is_frozen: true,
  frozen_at: "2026-08-12T10:00:00Z",
  forked_from_revision_id: null,
  author_id: "user-1",
  created_at: "2026-08-12T10:00:00Z",
}

let currentRow: Record<string, unknown> = revisionRow
let currentError: { message: string } | null = null

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: currentError ? null : currentRow, error: currentError }),
        }),
      }),
    }),
  }),
}))

beforeEach(() => {
  currentRow = { ...revisionRow }
  currentError = null
})

describe("openRevision (§3A.3 rule 3: never silently recompute)", () => {
  it("returns the STORED result untouched when nothing has moved", async () => {
    const verdict = await openRevision("rev-1", "sha256:v2")
    expect(verdict.state).toBe("clean")
    if (verdict.state !== "clean") return
    // The number on screen must be the number that was published.
    expect((verdict.results as { test: { pValue: number } }).test.pValue).toBe(0.0123)
  })

  it("flags source-file drift and offers a choice rather than recomputing", async () => {
    const verdict = await openRevision("rev-1", "sha256:v3")
    expect(verdict.state).toBe("drifted")
    if (verdict.state !== "drifted") return
    expect(verdict.dataChanged).toBe(true)
    expect(verdict.engineChanged).toBe(false)
    // Still hands back the stored result — the choice is the user's.
    expect(verdict.results).not.toBeNull()
    expect(verdict.message).toContain("source file has changed")
    expect(verdict.message).toContain("Keep the stored result, or re-run")
  })

  it("flags an engine upgrade, naming both versions", async () => {
    currentRow = { ...revisionRow, engine_version: "notes9-stats 0.9.0 (pyodide 0.28.3)" }
    const verdict = await openRevision("rev-1", "sha256:v2")
    expect(verdict.state).toBe("drifted")
    if (verdict.state !== "drifted") return
    expect(verdict.engineChanged).toBe(true)
    expect(verdict.storedEngineVersion).toBe("notes9-stats 0.9.0 (pyodide 0.28.3)")
    expect(verdict.currentEngineVersion).toBe(ENGINE_VERSION)
    expect(verdict.message).toContain("0.9.0")
  })

  it("opens from the snapshot when the source file is gone, and says so", async () => {
    // §3A.6: a deleted source is a stated, explicit state — not a failure.
    const verdict = await openRevision("rev-1", null)
    expect(verdict.state).toBe("detached")
    if (verdict.state !== "detached") return
    expect(verdict.results).not.toBeNull()
    expect(verdict.message).toContain("detached from its source")
  })

  it("forward-migrates an older spec rather than failing to open", async () => {
    const { schemaVersion: _drop, ...rest } = revisionRow.spec as Record<string, unknown>
    currentRow = { ...revisionRow, spec: rest }
    const verdict = await openRevision("rev-1", "sha256:v2")
    // §3A.6: never fail to open.
    expect(verdict.state).toBe("clean")
  })

  it("reports unreadable rather than throwing when the row is missing", async () => {
    currentError = { message: "not found" }
    const verdict = await openRevision("rev-missing", "sha256:v2")
    expect(verdict.state).toBe("unreadable")
  })
})

describe("buildPortableBundle (§3A.3 rule 6: the analysis must be able to leave)", () => {
  it("carries spec, results, snapshot and provenance under a documented schema", () => {
    const bundle = buildPortableBundle(
      {
        id: "an-1",
        experimentId: "exp-1",
        projectId: "proj-1",
        name: "Viability 48h",
        draftSpec: {},
        sourceDataFileId: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
        workspaceState: {},
        currentRevisionNo: 3,
        updatedAt: "2026-08-12T10:00:00Z",
      },
      {
        id: "rev-1",
        analysisId: "an-1",
        revisionNo: 3,
        name: "Figure 2B as submitted",
        changeSummary: null,
        spec: revisionRow.spec,
        specHash: "spec-hash-1",
        dataVersionHash: "sha256:v2",
        dataSnapshot: { rows: [] },
        results: null,
        engineVersion: ENGINE_VERSION,
        conversationThread: [],
        isFrozen: true,
        frozenAt: "2026-08-12T10:00:00Z",
        forkedFromRevisionId: null,
        authorId: "user-1",
        createdAt: "2026-08-12T10:00:00Z",
      }
    )

    expect(bundle.schema).toBe("notes9.analysis-bundle")
    expect(bundle.spec).toBeTruthy()
    expect(bundle.dataSnapshot).toBeTruthy()
    // Provenance travels with it, or the bundle is just a file.
    expect(bundle.provenance.engineVersion).toBe(ENGINE_VERSION)
    expect(bundle.provenance.dataVersionHash).toBe("sha256:v2")
    expect(bundle.provenance.frozen).toBe(true)
  })
})
