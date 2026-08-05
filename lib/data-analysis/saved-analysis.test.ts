import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  ENGINE_VERSION,
  computeCacheKey,
  type EngineResult,
} from "@/lib/data-analysis/engine/contract"
import { parseSpec, type AnalysisSpec } from "@/lib/data-analysis/spec/analysis-spec"
// A static import is safe despite the mock below: vi.mock is hoisted above the
// import block, so the stub is installed before this module is evaluated.
import { commitRevision, openRevision, buildPortableBundle } from "./saved-analysis"

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
  // A stored result carries the hash of the spec that produced it — `specHash`
  // is required on `EngineResult` and stamped by `computeAnalysis`. The fixture
  // has to carry it too, or it stands for a row the engine cannot write.
  results: { engineVersion: ENGINE_VERSION, specHash: "spec-hash-1", test: { pValue: 0.0123 } },
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
/** What `commitRevision` actually handed the RPC on the last call. */
let lastRpcArgs: Record<string, unknown> | null = null

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: currentError ? null : currentRow, error: currentError }),
        }),
      }),
    }),
    rpc: async (_name: string, args: Record<string, unknown>) => {
      lastRpcArgs = args
      // The RPC returns the row it wrote, so the stub echoes the arguments back
      // through the same column names `toRevision` reads. A caller that checks
      // what was stored (`commitSave` does) must see what the RPC saw.
      return {
        data: {
          ...revisionRow,
          spec: args.p_spec,
          spec_hash: args.p_spec_hash,
          results: args.p_results,
          engine_version: args.p_engine_version,
        },
        error: null,
      }
    },
  }),
}))

beforeEach(() => {
  currentRow = { ...revisionRow }
  currentError = null
  lastRpcArgs = null
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
    // Still hands back the stored result, the choice is the user's.
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
    // §3A.6: a deleted source is a stated, explicit state, not a failure.
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

/* ── The bind between a spec and the result stored beside it ───────────────*/

function baseSpec(): AnalysisSpec {
  const parsed = parseSpec({
    schemaVersion: 1,
    dataset: {
      fileId: null,
      fileName: "plate.xlsx",
      sheet: null,
      versionHash: "sha256:v1",
      rowCount: 4,
      columnCount: 2,
    },
    design: { source: "inferred" },
    analysis: { test: "t-unpaired", alpha: 0.05 },
    figure: { kind: "bar-scatter-error", x: {}, y: {} },
    export: {},
  })
  if (!parsed.ok) throw new Error("fixture spec does not parse")
  return parsed.spec
}

/** An engine result stamped for whichever spec hash it is told. */
const resultFor = (specHash: string): EngineResult => ({
  engineVersion: "notes9-stats 1.1.0 (pyodide 0.28.3)",
  dataVersionHash: "sha256:v1",
  specHash,
  computedAt: "2026-08-12T10:00:00Z",
  durationMs: 12,
  descriptives: [],
  test: {
    test: "Unpaired t test",
    statistic: 3.1,
    df: 6,
    pValue: 0.0123,
    effectSizes: [],
    assumptions: [],
    pairwise: [],
    terms: [],
    groupSizes: {},
    reportSentence: "t(6) = 3.10, p = 0.0123",
  },
  curveFit: null,
  survival: null,
  exclusionImpact: null,
  plotData: [],
  warnings: [],
  testRan: "t-unpaired",
  error: null,
})

describe("commitRevision binds the result to the spec it was computed from", () => {
  it("stores a result whose spec hash IS this spec's", async () => {
    const spec = baseSpec()
    const { specHash } = await computeCacheKey(spec)
    const results = resultFor(specHash)

    const revision = await commitRevision({
      analysisId: "analysis-1",
      spec,
      results,
      dataSnapshot: {},
    })

    // Stated as its own case so a fix that simply nulls every result cannot
    // pass: the ordinary save must still carry its numbers, and the engine
    // version stamped must be the RESULT's, not the current build's.
    expect(lastRpcArgs?.p_results).toBe(results)
    expect(lastRpcArgs?.p_engine_version).toBe("notes9-stats 1.1.0 (pyodide 0.28.3)")
    expect(revision.results).toBe(results)
  })

  it("refuses to store a result the spec being saved did not produce", async () => {
    const spec = baseSpec()
    // Exactly the workspace's failure window: `derivedSpec` moved to alpha 0.01
    // and `engineResult` is still the 0.05 answer, 700ms plus a Pyodide round
    // trip behind it.
    const stale = resultFor((await computeCacheKey(spec)).specHash)
    const moved: AnalysisSpec = { ...spec, analysis: { ...spec.analysis, alpha: 0.01 } }
    expect((await computeCacheKey(moved)).specHash).not.toBe(stale.specHash)

    const revision = await commitRevision({
      analysisId: "analysis-1",
      spec: moved,
      results: stale,
      dataSnapshot: {},
    })

    expect(lastRpcArgs?.p_spec_hash).toBe((await computeCacheKey(moved)).specHash)
    expect(lastRpcArgs?.p_results).toBeNull()
    // The engine version must fall back too, or the row claims a build that
    // never ran this spec.
    expect(lastRpcArgs?.p_engine_version).toBe(ENGINE_VERSION)
    expect(revision.results).toBeNull()
  })
})

describe("openRevision checks the stored result against the stored spec", () => {
  it("withholds a result whose spec hash is not the revision's, and says so", async () => {
    currentRow = {
      ...revisionRow,
      spec_hash: "spec-hash-1",
      results: { ...resultFor("a-completely-different-spec"), engineVersion: ENGINE_VERSION },
    }

    const verdict = await openRevision("rev-1", "sha256:v2")

    // Engine and data both match, so the ONLY thing that can move this off
    // "clean" is the spec-hash comparison the reopen used to make against
    // itself.
    expect(verdict.state).toBe("drifted")
    if (verdict.state !== "drifted") return
    expect(verdict.results).toBeNull()
    expect(verdict.message).toContain("different version of this analysis")
    expect(verdict.engineChanged).toBe(false)
    expect(verdict.dataChanged).toBe(false)
  })

  it("still opens clean, WITH its numbers, when the two agree", async () => {
    currentRow = {
      ...revisionRow,
      spec_hash: "spec-hash-1",
      results: { ...resultFor("spec-hash-1"), engineVersion: ENGINE_VERSION },
    }

    const verdict = await openRevision("rev-1", "sha256:v2")

    expect(verdict.state).toBe("clean")
    if (verdict.state !== "clean") return
    expect(verdict.results?.test?.pValue).toBe(0.0123)
  })

  it("withholds a stored result that carries no spec hash at all", async () => {
    // A row from before the result stamped one. `results?.specHash ?? specHash`
    // reads that as "unchanged" and hands the numbers over; the claim is simply
    // unprovable, and on this path unprovable is drift.
    const { specHash: _dropped, ...noHash } = resultFor("irrelevant")
    currentRow = {
      ...revisionRow,
      spec_hash: "spec-hash-1",
      results: { ...noHash, engineVersion: ENGINE_VERSION },
    }

    const verdict = await openRevision("rev-1", "sha256:v2")

    expect(verdict.state).toBe("drifted")
    if (verdict.state !== "drifted") return
    expect(verdict.results).toBeNull()
  })

  it("withholds it on the detached path too, which has no integrity check", async () => {
    currentRow = {
      ...revisionRow,
      spec_hash: "spec-hash-1",
      results: { ...resultFor("a-completely-different-spec"), engineVersion: ENGINE_VERSION },
    }

    const verdict = await openRevision("rev-1", null)

    expect(verdict.state).toBe("detached")
    if (verdict.state !== "detached") return
    expect(verdict.results).toBeNull()
  })
})
