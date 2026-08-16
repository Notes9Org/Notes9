import { afterEach, describe, it, expect, vi } from "vitest"
import { parseSpec, type AnalysisSpec } from "@/lib/data-analysis/spec/analysis-spec"
import { ENGINE_TIMEOUT_MS, computeAnalysis, disposeEngine } from "./client"
import type { EnginePayload, Table } from "./resolver"

/**
 * §6.7's with/without-exclusions comparison, which is the only thing that makes
 * §8.1's refusal of "drop points until it is significant" an answer rather than
 * a dead end. What is pinned here is that the client actually runs the analysis
 * twice against different data when a caller asks for the comparison, and that
 * it does NOT otherwise, because a second Pyodide compute is a real cost.
 */

/** The one value the fake engine treats as an outlier. */
const OUTLIER = 99

/**
 * A second wild value, weaker than OUTLIER: it moves p without crossing alpha.
 * It exists so a run that wrongly restores EVERY excluded point is telling
 * apart from one that restores only the point under consideration.
 */
const CONTAMINANT = 50

const computed: EnginePayload[] = []

/**
 * Stands in for Pyodide. It does not do statistics; it does the one thing the
 * client depends on, which is to return a different p-value for different data.
 * Scipy's job is asserted against the validation corpus, not here.
 */
class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null

  postMessage(request: { id: string; type: string; payload?: EnginePayload }) {
    if (request.type !== "compute" || !request.payload) return
    const payload = request.payload
    computed.push(payload)
    const values =
      payload.shape === "groups" ? Object.values(payload.groups).flat() : []
    // The outlier is what moves p across alpha, so the two runs can only differ
    // if the client really stripped the exclusions for the second one.
    const carriesOutlier = values.includes(OUTLIER)
    // Significant on both sides, so restoring THIS point alone flips nothing.
    const carriesContaminant = values.includes(CONTAMINANT)
    const pValue = carriesOutlier ? 0.21 : carriesContaminant ? 0.03 : 0.012
    const statistic = carriesOutlier ? 1.4 : carriesContaminant ? 3.1 : 4.2
    queueMicrotask(() => {
      this.onmessage?.({
        data: {
          id: request.id,
          type: "result",
          result: {
            descriptives: [],
            test: {
              test: "Welch's t test",
              statistic,
              df: 6,
              pValue,
              effectSizes: [],
              assumptions: [],
              pairwise: [],
              terms: [],
              groupSizes: {},
              reportSentence: "",
            },
            testRan: "t-welch",
            warnings: [],
            durationMs: 7,
          },
        },
      } as MessageEvent)
    })
  }

  terminate() {}
}

function spec(extra: Record<string, unknown> = {}): AnalysisSpec {
  const parsed = parseSpec({
    schemaVersion: 1,
    dataset: {
      fileId: null,
      fileName: "viability.xlsx",
      sheet: null,
      versionHash: "sha256:aaaa1111",
      rowCount: 9,
      columnCount: 2,
    },
    design: { source: "inferred" },
    analysis: { test: "t-welch", groupColumn: "arm", responseColumns: ["value"] },
    figure: { kind: "bar-scatter-error", x: {}, y: {} },
    export: {},
    ...extra,
  })
  if (!parsed.ok) throw new Error("fixture invalid: " + JSON.stringify(parsed.issues.slice(0, 2)))
  return parsed.spec
}

/** Four control points, four treated, plus one wild treated reading (r9). */
const table: Table = {
  columns: ["arm", "value"],
  rows: [
    { rowId: "r1", values: { arm: "Ctrl", value: 10 } },
    { rowId: "r2", values: { arm: "Ctrl", value: 11 } },
    { rowId: "r3", values: { arm: "Ctrl", value: 12 } },
    { rowId: "r4", values: { arm: "Ctrl", value: 13 } },
    { rowId: "r5", values: { arm: "Drug", value: 20 } },
    { rowId: "r6", values: { arm: "Drug", value: 21 } },
    { rowId: "r7", values: { arm: "Drug", value: 22 } },
    { rowId: "r8", values: { arm: "Drug", value: 23 } },
    { rowId: "r9", values: { arm: "Drug", value: OUTLIER } },
  ],
}

const excludeOutlier = [
  {
    rowId: "r9",
    reasonKind: "instrument-error" as const,
    reasonText: "plate reader saturated",
    method: null,
    excludedBy: "u1",
    excludedAt: new Date("2026-08-03T09:00:00Z").toISOString(),
  },
]

// jsdom has no Worker, so the client gets the fake above instead of Pyodide.
Reflect.set(globalThis, "Worker", FakeWorker)

afterEach(() => {
  computed.length = 0
  // Drops the worker AND the result cache, so each case computes for itself.
  disposeEngine()
})

/** Narrow to the only shape a two-group test resolves to. */
function groupsOf(payload: EnginePayload): Record<string, number[]> {
  if (payload.shape !== "groups") throw new Error(`expected a groups payload, got ${payload.shape}`)
  return payload.groups
}

/** Only the caller that renders the comparison pays for it. */
const wantImpact = { withExclusionImpact: true } as const

describe("exclusion impact (§6.7 / §8.1)", () => {
  it("reports both sides and the significance flip when a point is excluded", async () => {
    const outcome = await computeAnalysis(spec({ exclusions: excludeOutlier }), table, wantImpact)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    // Two computes, and the second one is the one that saw the excluded point.
    expect(computed).toHaveLength(2)
    expect(groupsOf(computed[0]).Drug).toEqual([20, 21, 22, 23])
    expect(groupsOf(computed[1]).Drug).toEqual([20, 21, 22, 23, OUTLIER])

    const impact = outcome.result.exclusionImpact
    expect(impact).not.toBeNull()
    expect(impact?.excludedCount).toBe(1)
    expect(impact?.withExclusions).toEqual({ pValue: 0.012, statistic: 4.2 })
    expect(impact?.withoutExclusions).toEqual({ pValue: 0.21, statistic: 1.4 })
    // 0.012 < 0.05 ≤ 0.21: putting the point back loses the result.
    expect(impact?.changesSignificance).toBe(true)

    // Additive. The primary result still reports the analysis as specified.
    expect(outcome.result.test?.pValue).toBe(0.012)
  })

  it("reads the flip against the spec's alpha, not a hardcoded 0.05", async () => {
    // At alpha = 0.001 neither side is significant, so nothing flipped, even
    // though the p-values moved by a factor of 17.
    const outcome = await computeAnalysis(
      spec({
        analysis: {
          test: "t-welch",
          groupColumn: "arm",
          responseColumns: ["value"],
          alpha: 0.001,
        },
        exclusions: excludeOutlier,
      }),
      table,
      wantImpact
    )
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.result.exclusionImpact?.changesSignificance).toBe(false)
    expect(outcome.result.exclusionImpact?.withoutExclusions.pValue).toBe(0.21)
  })

  it("costs exactly one compute and reports null when nothing is excluded", async () => {
    const outcome = await computeAnalysis(spec(), table, wantImpact)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    // The common case must not pay for a comparison with nothing on either side.
    expect(computed).toHaveLength(1)
    expect(outcome.result.exclusionImpact).toBeNull()
  })

  it("costs exactly one compute when an exclusion matched no row", async () => {
    // The spec asks to exclude a row the snapshot does not contain, so both runs
    // would see identical data and the second one would buy nothing.
    const outcome = await computeAnalysis(
      spec({ exclusions: [{ ...excludeOutlier[0], rowId: "does-not-exist" }] }),
      table,
      wantImpact
    )
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(computed).toHaveLength(1)
    expect(outcome.result.exclusionImpact).toBeNull()
  })

  it("attributes the delta to the point being weighed, not to every exclusion", async () => {
    // The screen this feeds says "Effect of this exclusion" and "Removing this
    // point changes whether the result is significant". On an analysis that
    // ALREADY carries an exclusion, a baseline of "no exclusions at all" makes
    // both sentences false: it hands the previewed point the earlier
    // exclusion's effect too. Here r9 (the outlier) is the pre-existing
    // exclusion that owns the flip, and r10 is the point being previewed.
    const withContaminant: Table = {
      ...table,
      rows: [...table.rows, { rowId: "r10", values: { arm: "Drug", value: CONTAMINANT } }],
    }
    const outcome = await computeAnalysis(
      spec({
        // `data.excludeRow` appends, so the previewed point is last.
        exclusions: [excludeOutlier[0], { ...excludeOutlier[0], rowId: "r10" }],
      }),
      withContaminant,
      wantImpact
    )
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    const impact = outcome.result.exclusionImpact
    // The flip belongs to r9, which nobody is being asked about. Claiming it
    // for r10 is the wrong cause named on the one screen §8.1 built to be
    // trusted, so it must read false.
    expect(impact?.changesSignificance).toBe(false)
    // Restoring r10 alone: 0.012 → 0.03, still significant at alpha = 0.05.
    expect(impact?.withExclusions.pValue).toBe(0.012)
    expect(impact?.withoutExclusions.pValue).toBe(0.03)

    // The comparison run lifts ONLY r10. r9 stays excluded on both sides.
    expect(computed).toHaveLength(2)
    expect(groupsOf(computed[0]).Drug).toEqual([20, 21, 22, 23])
    expect(groupsOf(computed[1]).Drug).toEqual([20, 21, 22, 23, CONTAMINANT])
  })

  it("does not run the comparison for a recompute that nobody asked to see it", async () => {
    // The workspace's debounced recompute runs on every settled spec edit with
    // `force: true`, and renders no with/without pair. A spec that carries
    // exclusions must therefore still cost ONE round trip, not two: the second
    // Pyodide compute was pure latency, since nothing read the answer.
    const withExclusions = spec({ exclusions: excludeOutlier })
    const outcome = await computeAnalysis(withExclusions, table, { force: true })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(computed).toHaveLength(1)
    expect(groupsOf(computed[0]).Drug).toEqual([20, 21, 22, 23])
    expect(outcome.result.exclusionImpact).toBeNull()

    // And the null above must not be cached as the comparison's answer: the
    // preview asking for it afterwards still gets both sides.
    const preview = await computeAnalysis(withExclusions, table, wantImpact)
    expect(preview.ok).toBe(true)
    if (!preview.ok) return
    expect(preview.result.exclusionImpact?.withoutExclusions.pValue).toBe(0.21)
  })
})

/**
 * A worker that never answers.
 *
 * This is not the crash path, `worker.onerror` already rejects everything
 * pending for that. It is the silent one: Pyodide wedged mid-boot, a wheel
 * fetch hung open, a message dropped. Without a deadline the caller's promise
 * never settles, so the workspace's `finally { setEngineBusy(false) }` never
 * runs and the researcher is left with a spinner that no retry can clear,
 * because the spec is already marked attempted.
 */
class SilentWorker {
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  postMessage() {}
  terminate() {}
}

describe("unresponsive worker", () => {
  // Explicit timeout, well above the 5s default: this test winds a fake clock
  // forward across a two-minute deadline, and `advanceTimersByTimeAsync` yields
  // to the real event loop between fake-timer steps. Under full parallel test
  // load those real yields can individually take longer, which is wall-clock
  // contention, not a logic regression — it passes in isolation. Decoupling the
  // timeout from load keeps the assertion itself (a named rejection, not a
  // hang) unweakened.
  it("rejects with a named error instead of hanging forever", async () => {
    Reflect.set(globalThis, "Worker", SilentWorker)
    // The deadline is two minutes, so the clock has to be faked. Keep a handle
    // on the real one first: computing the spec hash is a WebCrypto round trip
    // that needs a genuine event-loop turn, and it happens before the request
    // (and therefore the deadline) exists.
    const realSetTimeout = globalThis.setTimeout
    vi.useFakeTimers()
    try {
      // Assert first, advance second: the rejection lands while the clock is
      // being wound forward, and a promise nobody is watching by then is an
      // unhandled rejection rather than a passing test.
      const settled = expect(computeAnalysis(spec(), table)).rejects.toThrow(/stopped responding/i)
      await new Promise((resolve) => realSetTimeout(resolve, 0))
      await vi.advanceTimersByTimeAsync(ENGINE_TIMEOUT_MS + 1)
      await settled
    } finally {
      vi.useRealTimers()
      Reflect.set(globalThis, "Worker", FakeWorker)
    }
  }, 30_000)
})
