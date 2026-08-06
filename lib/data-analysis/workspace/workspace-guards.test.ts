import { describe, expect, it } from "vitest"

import type { ComputeOutcome } from "@/lib/data-analysis/engine/client"
import type { EngineResult } from "@/lib/data-analysis/engine/contract"
import {
  emptyGate,
  engineDisplayAfter,
  gateForReopen,
  gateRun,
  gateStep,
  governedOverlay,
  governedPipeline,
  movedShapeIndex,
  readAnalysisBundle,
  railFromConfig,
  reopenFromSpec,
} from "@/lib/data-analysis/workspace/workspace-guards"
import {
  recomputeSignature,
  specFromChartState,
  type ChartState,
} from "@/lib/data-analysis/workspace/chart-state-spec"
import { applyOverlay } from "@/lib/data-analysis/workspace/spec-prompt"
import { buildDataSnapshot } from "@/lib/data-analysis/workspace/saved-analysis-session"
import { bracketMoveFromRelayout } from "@/lib/data-analysis/render/plotly-adapter"
import { parseSpec, type AnalysisSpec } from "@/lib/data-analysis/spec/analysis-spec"
import type { AppliedMutation } from "@/lib/data-analysis/spec/mutations"
import type { Table } from "@/lib/data-analysis/engine/resolver"

const FILE = "viability.xlsx"

const table: Table = {
  columns: ["group", "time", "value"],
  rows: [
    { rowId: "row-2", values: { group: "Control", time: "0h", value: 10 } },
    { rowId: "row-3", values: { group: "Control", time: "24h", value: 12 } },
    { rowId: "row-4", values: { group: "Treated", time: "0h", value: 18 } },
    { rowId: "row-5", values: { group: "Treated", time: "24h", value: 21 } },
    { rowId: "row-6", values: { group: "Control", time: "0h", value: 11 } },
    { rowId: "row-7", values: { group: "Treated", time: "24h", value: 20 } },
  ],
}

/** The rail exactly as `buildConfig` serialises it into a revision. */
const railConfig: Record<string, unknown> = {
  chartType: "bar",
  xKey: "group",
  yKeys: ["value"],
  title: "Viability",
  xLabel: "Group",
  yLabel: "Value",
  paletteName: "nature",
  errorMode: "sem",
  filters: [],
  transforms: [],
  exclusions: [],
  aiOverlay: [],
}

const railDerived = () =>
  specFromChartState(railConfig as unknown as ChartState, table, { fileName: FILE })

/**
 * The derivation `data-analysis-workspace.tsx` performs on every render, run
 * against a reopen's own output.
 *
 * A configuration does NOT become the rail. The shell holds the rail in React
 * state — the previous analysis's, on a reopen — and `applyConfig` writes over
 * it only what it accepts, per field. Casting the configuration straight into a
 * `ChartState`, as this did, modelled a shell that accepts everything, so every
 * `reopenFromSpec` assertion below was measured against a model sharing the
 * guards' blind spot exactly: a mirror cannot catch the thing it reflects. The
 * numeric axis bounds were being dropped by the real shell and asserted as
 * restored here.
 *
 * So the acceptance comes from `railFromConfig`, the one definition `applyConfig`
 * itself now uses. That is not the guard agreeing with itself: `railFromConfig`
 * is not `reopenFromSpec`'s private helper, it is the shell's, and importing it
 * is what makes the model and the shell unable to diverge. The seam this still
 * cannot reach is `applyConfig`'s setter wiring — a field `railFromConfig`
 * accepts and the component forgets to push into state — and there is no
 * component-test harness in this repo that could.
 */
function whatTheWorkspaceWouldShow(
  config: Record<string, unknown>,
  /** What the rail is already holding. On a reopen: the previous analysis. */
  previousRail: Record<string, unknown> = railConfig
): AnalysisSpec | null {
  // One try around the whole derivation, exactly as the `derivedSpec` useMemo
  // has it: null here means the same thing it means there — no figure, no
  // engine, no analysis.
  try {
    const accepted = railFromConfig(config)
    const rail = { ...previousRail, ...accepted.rail } as unknown as ChartState
    const fromRail = specFromChartState(rail, table, { fileName: FILE })
    // The overlay the shell keeps is the GOVERNED one (`setAiOverlay`), not the
    // raw field, so an entry that fails its schema is dropped here too.
    const overlay: AppliedMutation[] = accepted.overlay
    if (overlay.length === 0) return fromRail
    const overlaid = parseSpec(applyOverlay(fromRail, overlay))
    return overlaid.ok ? overlaid.spec : fromRail
  } catch {
    return null
  }
}

/** Every leaf path at which `actual` differs from `want`, computed independently. */
function pathsDiffering(actual: unknown, want: unknown, at = ""): string[] {
  if (JSON.stringify(actual) === JSON.stringify(want)) return []
  const rec = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null && !Array.isArray(v)
  if (!rec(actual) || !rec(want)) return [at || "spec"]
  return [...new Set([...Object.keys(actual), ...Object.keys(want)])].flatMap((key) =>
    pathsDiffering(actual[key], want[key], at ? `${at}.${key}` : key)
  )
}

/* ── 1. Reopening: the stored spec is the source of truth ──────────────────*/

describe("reopenFromSpec — rail + overlay reproduces the STORED spec (§3A.3 rule 3)", () => {
  /**
   * A revision whose analysis uses a second factor and median imputation: two
   * of the fields the ChartState round trip has no control for at all.
   */
  const twoWaySpec = (): AnalysisSpec => {
    const base = railDerived()
    return {
      ...base,
      analysis: {
        ...base.analysis,
        test: "anova-two-way",
        secondFactorColumn: "time",
        missingValues: "median-impute",
      },
    }
  }

  it("the rail on its own really does lose those fields", () => {
    // The premise, stated once and only as a premise: if the rail ever grows
    // controls for these the residue below becomes empty, and the invariant
    // still holds, so nothing here would have to change.
    const rebuilt = railDerived()
    expect(rebuilt.analysis.secondFactorColumn).toBeNull()
    expect(rebuilt.analysis.missingValues).toBe("listwise")
    expect(recomputeSignature(twoWaySpec())).not.toBe(recomputeSignature(rebuilt))
  })

  it("reopens a two-way/median-impute revision that stored NO overlay, faithfully", () => {
    // The defect: reopening rebuilt the spec FROM the rail, handed back
    // {anova-two-way, null, listwise}, and the adopt check measured that
    // rebuild against ITSELF, so the drift was invisible. The engine adopted,
    // revision N's two-way p-value went on screen beside a one-way spec, and
    // `commitSave` wrote the pair into append-only `analysis_revisions`.
    const stored = twoWaySpec()
    const reopen = reopenFromSpec(stored, railConfig, table, FILE)

    const onScreen = whatTheWorkspaceWouldShow(reopen.config)
    expect(onScreen).toEqual(stored)
    expect(reopen.unrestored).toEqual([])
    // And so the parked signature IS the derivation's without anything having
    // been reconciled: it is the stored spec's, measured on the stored spec.
    expect(reopen.signature).toBe(recomputeSignature(stored))
    expect(recomputeSignature(onScreen!)).toBe(reopen.signature)
  })

  it("holds the same on the null-config path, where the whole rail comes from the spec", () => {
    const stored = twoWaySpec()
    const reopen = reopenFromSpec(stored, null, table, FILE)
    expect(whatTheWorkspaceWouldShow(reopen.config)).toEqual(stored)
    expect(reopen.unrestored).toEqual([])
  })

  /**
   * The axis bounds, on the null-config path, stated as their own case.
   *
   * `chartStateFromSpec` returns `figure.x.min/max/tickCount` and
   * `figure.y.min/max` as NUMBERS; the rail holds them as strings, and
   * `applyConfig` accepted `typeof === "string"` only. So a reopen from a spec
   * that pinned its axes kept the PREVIOUS analysis's bounds — and `unrestored`
   * came back EMPTY, because `reopenFromSpec` measured its own fidelity against
   * a spread rather than against what the shell accepts. Every other case here
   * is blind to it: `railConfig` sets no bounds, so the specs derived from it
   * hold null on all five and losing them changes nothing.
   *
   * The lost bounds are the small half. The reported fidelity is the large one,
   * which is why the assertion is on the VALUES rather than on `unrestored`
   * naming them: a reopen that surfaced the loss would be honest, but this one
   * must not lose them at all.
   */
  it("restores axis bounds the spec pins, on the null-config path", () => {
    const base = railDerived()
    const stored: AnalysisSpec = {
      ...base,
      figure: {
        ...base.figure,
        x: { ...base.figure.x, min: 0, max: 30, tickCount: 6 },
        y: { ...base.figure.y, min: 5, max: 25 },
      },
    }
    // The premise: the rail this reopens over is a different analysis's, and it
    // pins nothing. Whatever arrives has to come from the stored spec.
    expect(railDerived().figure.x.min).toBeNull()

    const reopen = reopenFromSpec(stored, null, table, FILE)
    const onScreen = whatTheWorkspaceWouldShow(reopen.config)

    expect(onScreen?.figure.x).toEqual(stored.figure.x)
    expect(onScreen?.figure.y).toEqual(stored.figure.y)
    expect(reopen.unrestored).toEqual([])
  })

  it("clears a subtitle and units the stored spec does not have", () => {
    const base = railDerived()
    // The premise, and the whole reason this is retraction-adjacent rather than
    // cosmetic: the rail being reopened over belongs to a DIFFERENT analysis and
    // carries its wording. A stored spec that is silent about a subtitle is not
    // consenting to inherit that one.
    const previousRail = {
      subtitle: "Plate 3, 24h",
      xUnit: "nM",
      yUnit: "% viability",
    }
    const stored: AnalysisSpec = {
      ...base,
      figure: {
        ...base.figure,
        subtitle: null,
        x: { ...base.figure.x, unit: null },
        y: { ...base.figure.y, unit: null },
      },
    }

    const reopen = reopenFromSpec(stored, null, table, FILE)
    const onScreen = whatTheWorkspaceWouldShow(reopen.config, previousRail)

    expect(onScreen?.figure.subtitle).toBeNull()
    expect(onScreen?.figure.x.unit).toBeNull()
    expect(onScreen?.figure.y.unit).toBeNull()
    // And it must not claim it restored something it dropped instead.
    expect(reopen.unrestored).toEqual([])
  })

  /**
   * The same defect where the fix cannot be "restore it": a rail key the shell
   * has no control for AT ALL.
   *
   * `chartStateFromSpec` returns `figure.width`/`height`; `buildConfig` never
   * writes them, so `railFromConfig` does not accept them and `applyConfig`
   * cannot set them. An AI-set `figure.setDimensions` therefore reopens at the
   * schema's 720×520 whatever the revision stored — and while the spec-derived
   * half of the rail was spread in RAW, `unrestored` was measured against a rail
   * holding 960 and came back EMPTY, so the engine adopted and `commitSave` was
   * free to write the shrunk figure back as a faithful reopen.
   *
   * The rule this file exists for is that a reopen never claims fidelity it does
   * not have, not that every field survives. So the assertion is that the loss
   * is NAMED.
   */
  it("names a figure dimension the rail cannot hold rather than claiming it", () => {
    const base = railDerived()
    const stored: AnalysisSpec = {
      ...base,
      figure: { ...base.figure, width: 960, height: 640 },
    }
    const reopen = reopenFromSpec(stored, null, table, FILE)

    // The premise: the shell genuinely cannot show 960 — there is no control.
    expect(whatTheWorkspaceWouldShow(reopen.config)?.figure.width).toBe(base.figure.width)
    expect(reopen.unrestored).toEqual(["figure.width", "figure.height"])
  })

  /**
   * A reopen is a SWAP, and the rail it lands on belongs to the analysis being
   * LEFT: `openRevision` calls `swapConfig(reopen.config)`, which is
   * `applyConfig`, which writes over the live rail per field. So a rail key
   * absent from `reopen.config` is not a default — it is whatever the previous
   * analysis put there, still on screen.
   *
   * `chartStateFromSpec` omits `title`/`xLabel`/`yLabel`/`xKey` when the spec
   * holds null, deliberately: it is also the AI-mutation path, where a silent
   * field means "leave the researcher's own value alone". Right for an edit,
   * wrong for a swap — a revision stored with no title reopened with the
   * PREVIOUS figure's title above it.
   *
   * This is the case the whole `previousRail` half of the model exists for, and
   * the only kind the old mirror could not express: casting the configuration
   * into a `ChartState` makes an absent key a schema default, which is exactly
   * the answer that hides this.
   */
  it("leaves nothing of the PREVIOUS analysis standing where the stored spec is silent", () => {
    const base = railDerived()
    const stored: AnalysisSpec = {
      ...base,
      figure: { ...base.figure, title: null, x: { ...base.figure.x, label: null } },
    }
    // The analysis being left: same sheet, its own labelling.
    const previous = { ...railConfig, title: "Somebody else's figure", xLabel: "Elsewhere" }
    const reopen = reopenFromSpec(stored, null, table, FILE)
    const onScreen = whatTheWorkspaceWouldShow(reopen.config, previous)

    expect(onScreen?.figure.title).toBeNull()
    expect(onScreen?.figure.x.label).toBeNull()
    // And the standing rule: whatever did not survive is named, never dropped.
    const differing = pathsDiffering(onScreen, stored).filter((p) => !p.startsWith("dataset"))
    expect(reopen.unrestored).toEqual(differing)
  })

  /**
   * The invariant, over every kind of stored spec this workspace writes:
   * deriving the rail and its overlay then re-deriving must reproduce the
   * stored spec — and a field that cannot survive must be NAMED, never dropped.
   */
  const storedSpecs: Array<[string, () => AnalysisSpec]> = [
    ["a plain one-way analysis", railDerived],
    ["two factors and median imputation", twoWaySpec],
    [
      "a nonlinear fit",
      () => {
        const base = railDerived()
        return {
          ...base,
          analysis: {
            ...base.analysis,
            test: "nonlinear-regression" as const,
            nonlinear: {
              model: "4pl" as const,
              weighting: "1/Y" as const,
              sharedParameters: ["top"],
              constraints: { bottom: { min: 0, max: null } },
              confidenceBands: true,
              interpolate: true,
            },
          },
        }
      },
    ],
    [
      "a figure the rail cannot restate: an annotation, a moved bracket, excluded points",
      () => {
        const base = railDerived()
        return {
          ...base,
          figure: {
            ...base.figure,
            showExcludedPoints: true,
            annotations: [
              {
                id: "ann-1",
                kind: "text" as const,
                text: "n = 3",
                x: 1,
                y: 20,
                fontSize: 10,
                colour: "#112233",
              },
            ],
            brackets: [
              {
                id: "Control__Treated",
                fromGroup: "Control",
                toGroup: "Treated",
                offsetY: 4,
                derived: false,
                display: "stars" as const,
              },
            ],
          },
        }
      },
    ],
    [
      "a random seed, which no mutation can carry",
      () => {
        const base = railDerived()
        return { ...base, analysis: { ...base.analysis, randomSeed: 7 } }
      },
    ],
  ]

  it.each(storedSpecs)("round trips %s, or names what it could not", (_label, build) => {
    const stored = build()
    const reopen = reopenFromSpec(stored, railConfig, table, FILE)
    const onScreen = whatTheWorkspaceWouldShow(reopen.config)
    expect(onScreen).not.toBeNull()

    // Every difference between what the workspace will show and what was stored
    // is declared. Nothing silently dropped — silence is the only thing that
    // made the p-value defect invisible.
    const differing = pathsDiffering(onScreen, stored).filter((p) => !p.startsWith("dataset"))
    expect(reopen.unrestored).toEqual(differing)

    // The parked signature is the STORED spec's, never the rail's rebuild.
    expect(reopen.signature).toBe(recomputeSignature(stored))

    // And the retraction-class property, stated directly: the workspace adopts
    // the stored RESULT exactly when the derivation's signature meets the
    // parked one, so wherever it does, everything that result depends on must
    // already agree. The old check compared the lossy rebuild with itself,
    // which is why {anova-two-way, null, listwise} could be adopted beside a
    // two-way p-value.
    if (recomputeSignature(onScreen!) === reopen.signature) {
      expect(onScreen!.analysis).toEqual(stored.analysis)
      expect(onScreen!.filters).toEqual(stored.filters)
      expect(onScreen!.transforms).toEqual(stored.transforms)
      expect(onScreen!.exclusions).toEqual(stored.exclusions)
      expect(onScreen!.figure.errorBars).toEqual(stored.figure.errorBars)
    }
  })

  it("names randomSeed rather than pretending to have restored it", () => {
    // The one field with no mutation behind it. Surfacing it is the contract;
    // silence would be the same defect one field over.
    const base = railDerived()
    const reopen = reopenFromSpec(
      { ...base, analysis: { ...base.analysis, randomSeed: 7 } },
      railConfig,
      table,
      FILE
    )
    expect(reopen.unrestored).toContain("analysis.randomSeed")
  })

  it("keeps a stored overlay AND adds the residue, rather than replaying only the overlay", () => {
    // Faithful by construction, not by luck. Before, a revision whose
    // configuration happened to carry an overlay reopened correctly and every
    // revision written before that change set did not — that asymmetry was the
    // tell.
    const base = railDerived()
    const stored: AnalysisSpec = {
      ...base,
      figure: { ...base.figure, caption: "Mean ± SEM, n = 3." },
      analysis: { ...base.analysis, test: "anova-two-way", secondFactorColumn: "time" },
    }
    const config = {
      ...railConfig,
      aiOverlay: [
        {
          mutation: { kind: "figure.setCaption", value: "Mean ± SEM, n = 3." },
          origin: "ai",
          at: "2026-01-01T00:00:00.000Z",
          description: "Caption set",
        },
      ],
    }
    const reopen = reopenFromSpec(stored, config, table, FILE)
    expect(whatTheWorkspaceWouldShow(reopen.config)).toEqual(stored)
    const kinds = (reopen.config.aiOverlay as AppliedMutation[]).map((e) => e.mutation.kind)
    expect(kinds).toContain("figure.setCaption")
    expect(kinds).toContain("analysis.setColumns")
  })

  it("does not let the residue overrule a guard the rail keeps on purpose", () => {
    // A response column the sheet no longer has. Restoring it through the
    // overlay would use the reopen to walk around a check that exists for a
    // reason, so it surfaces as drift instead.
    const base = railDerived()
    const stored: AnalysisSpec = {
      ...base,
      analysis: { ...base.analysis, responseColumns: ["absorbance"] },
    }
    const reopen = reopenFromSpec(stored, railConfig, table, FILE)
    expect(reopen.unrestored).toContain("analysis.responseColumns")
    expect(reopen.signature).toBe(recomputeSignature(stored))
  })
})

/* ── 1c. No attempt may leave the previous result standing ─────────────────*/

describe("engineDisplayAfter — a finished attempt names BOTH fields", () => {
  const result = { specHash: "h", test: { pValue: 0.01 } } as unknown as EngineResult

  it("shows what an ok attempt computed, and says nothing", () => {
    // Stated first so a fix that simply returns null everywhere cannot pass.
    expect(engineDisplayAfter({ ok: true, result })).toEqual({ result, note: null })
  })

  it("clears the shown result when the engine THREW", () => {
    // The defect: the shell's catch set the note and left `engineResult` alone,
    // so the previous spec's numbers stayed on screen at full confidence and a
    // save taken in that state wrote them beside a spec that never produced
    // them, into an append-only table.
    expect(engineDisplayAfter({ threw: new Error("Pyodide worker died") })).toEqual({
      result: null,
      note: "Pyodide worker died",
    })
    // A throw that is not an Error still has to clear it.
    expect(engineDisplayAfter({ threw: "boom" })).toEqual({ result: null, note: "boom" })
  })

  it("clears it for a blocked spec and for a clarification too", () => {
    expect(
      engineDisplayAfter({
        ok: false,
        blocked: [{ message: "Needs two groups." }, { message: "Needs numbers." }],
      } as ComputeOutcome)
    ).toEqual({ result: null, note: "Needs two groups. Needs numbers." })
    expect(
      engineDisplayAfter({
        ok: false,
        question: { question: "Which column is time?" },
      } as ComputeOutcome)
    ).toEqual({ result: null, note: "Which column is time?" })
  })

  it("does NOT unwrap an engine-side failure: that is a finished analysis", () => {
    // `EngineError` travels inside a successful result on purpose — the
    // descriptives are real and the UI renders "the test failed" beside them.
    // Treating it as an attempt failure would throw away numbers that are valid.
    const withError = { ...result, error: { code: "test-failed" } } as unknown as EngineResult
    expect(engineDisplayAfter({ ok: true, result: withError }).result).toBe(withError)
  })
})

/* ── 1b. The adopt exemption belongs to the reopen ─────────────────────────*/

describe("gateStep — the stored result may be adopted once, not for the session", () => {
  /**
   * The recompute effect's whole loop, as `data-analysis-workspace.tsx` runs
   * it: measure, keep the gate the step returns, and — only if it said to run —
   * let the debounce fire and record the run.
   */
  const arriveAt = (gate: ReturnType<typeof emptyGate>, signature: string) => {
    const step = gateStep(gate, signature)
    if (!step.run) return { gate: step.gate, ran: false }
    return { gate: gateRun(signature), ran: true }
  }

  it("RUNS when an edit is undone back to the reopened signature", () => {
    // The defect: the exemption was a ref pinned for the session and never
    // cleared. Reopen a revision, turn alpha from 0.05 to 0.01 (which
    // recomputes), then press Undo — the signature returned to the adopted one,
    // the effect returned early, and the 0.01 p-value and its CI stayed on
    // screen under a rail reading 0.05. Any round-trippable edit reproduced it.
    let gate = gateForReopen("sig-alpha-0.05")

    const reopen = arriveAt(gate, "sig-alpha-0.05")
    expect(reopen.ran).toBe(false) // the reopen itself: adopt the stored result
    gate = reopen.gate

    const edited = arriveAt(gate, "sig-alpha-0.01")
    expect(edited.ran).toBe(true)
    gate = edited.gate

    const undone = arriveAt(gate, "sig-alpha-0.05")
    expect(undone.ran).toBe(true) // ← the fix: no second free pass
  })

  it("spends the exemption on the reopen itself, so none is left to pay out later", () => {
    // Stated on the gate rather than on an outcome, because the outcome above
    // is also protected by `gateRun` building a fresh gate. This is the
    // exemption's own lifetime: used once, by the reopen it belongs to.
    const parked = gateForReopen("sig-reopen")
    expect(parked.adopt).toBe("sig-reopen")
    const used = gateStep(parked, "sig-reopen")
    expect(used.run).toBe(false)
    expect(used.gate.adopt).toBeNull()
  })

  it("adopts the reopened signature, then runs for anything else", () => {
    const first = gateStep(gateForReopen("sig-reopen"), "sig-reopen")
    expect(first.run).toBe(false)
    expect(gateStep(first.gate, "sig-alpha-0.01").run).toBe(true)
  })

  it("does not re-run the signature the engine has already settled at", () => {
    // The debounce fires on renders that did not change the spec; a Pyodide
    // round trip for each would be a round trip for nothing.
    const gate = gateRun("sig-a")
    expect(gateStep(gate, "sig-a").run).toBe(false)
    expect(gateStep(gate, "sig-b").run).toBe(true)
  })

  it("runs for everything when nothing was reopened", () => {
    expect(gateStep(emptyGate(), "sig-a").run).toBe(true)
  })
})

/* ── 2. Opening a file ─────────────────────────────────────────────────────*/

describe("readAnalysisBundle — a .n9a the product wrote must reopen", () => {
  const snapshotConfig = { ...railConfig, title: "From a revision" }
  const workbook = { name: "wb", sheets: {} } as never

  it("reads a revision export (buildPortableBundle), whose sheet lives in dataSnapshot", () => {
    const bundle = {
      schema: "notes9.analysis-bundle",
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      analysis: { id: "an-1", name: "Viability", revisionNo: 3 },
      spec: railDerived(),
      results: null,
      dataSnapshot: buildDataSnapshot(table, workbook, snapshotConfig),
      provenance: {},
      conversationThread: [],
    }
    const read = readAnalysisBundle(bundle)
    // The old importer looked only for `parsed.workbook`/`parsed.config`, found
    // neither, loaded nothing, and still reported success.
    expect(read).not.toBeNull()
    expect(read?.config).toEqual(snapshotConfig)
    expect(read?.workbook).toBe(workbook)
  })

  it("reads the workspace's own {workbook, config} export", () => {
    const read = readAnalysisBundle({ kind: "notes9-analysis", workbook, config: railConfig })
    expect(read?.config).toEqual(railConfig)
    expect(read?.workbook).toBe(workbook)
  })

  it("refuses a configuration with no sheet, which would land on whatever is open", () => {
    // What exporting with no sheet loaded writes. It used to import as a
    // success: the configuration was applied over the sheet already on screen,
    // rebinding its series and re-testing it under another analysis's settings,
    // and the toast said "Opened".
    expect(readAnalysisBundle({ kind: "notes9-analysis", workbook: null, config: railConfig })).toBeNull()
    expect(readAnalysisBundle({ config: railConfig })).toBeNull()
  })

  it("returns null for a file it cannot load, so the caller cannot claim success", () => {
    expect(readAnalysisBundle({ hello: "world" })).toBeNull()
    expect(readAnalysisBundle(null)).toBeNull()
    expect(readAnalysisBundle([1, 2, 3])).toBeNull()
    // A bundle whose snapshot is missing or unreadable is not openable either.
    expect(readAnalysisBundle({ schema: "notes9.analysis-bundle", dataSnapshot: null })).toBeNull()
  })
})

/* ── 3. Letting a configuration reach the spec ─────────────────────────────*/

describe("governedPipeline — §8.1 is enforced at the file boundary, not assumed", () => {
  const validExclusion = {
    rowId: "row-4",
    reasonKind: "technical-failure",
    reasonText: null,
    method: null,
    excludedBy: "someone@lab.org",
    excludedAt: new Date().toISOString(),
  }

  it("drops a statistical exclusion that names no method", () => {
    // A hand-edited .n9a used to put this straight into the live spec, the
    // engine, and the next revision written to Postgres.
    const governed = governedPipeline({
      exclusions: [
        validExclusion,
        { ...validExclusion, rowId: "row-5", reasonKind: "statistical-outlier" },
      ],
    })
    expect(governed.exclusions).toHaveLength(1)
    expect(governed.exclusions?.[0].rowId).toBe("row-4")
    expect(governed.dropped).toBe(1)
  })

  it("drops an 'other' exclusion with no free-text reason, and a malformed filter", () => {
    const governed = governedPipeline({
      exclusions: [{ ...validExclusion, reasonKind: "other", reasonText: "  " }],
      filters: [{ column: "group", op: "not-an-operator", value: 1 }],
    })
    expect(governed.exclusions).toEqual([])
    expect(governed.filters).toEqual([])
    expect(governed.dropped).toBe(2)
  })

  it("keeps silence distinct from emptiness, so a partial config clears nothing", () => {
    const governed = governedPipeline({})
    expect(governed.filters).toBeNull()
    expect(governed.transforms).toBeNull()
    expect(governed.exclusions).toBeNull()
  })

  it("clears the previous analysis's overlay when a configuration carries none", () => {
    expect(governedPipeline({}).overlay).toEqual([])
    expect(governedOverlay(undefined)).toEqual([])
    expect(governedOverlay([{ mutation: { kind: "figure.setTitle", value: "x" }, origin: "ai" }])).toHaveLength(1)
    expect(governedOverlay([{ mutation: null, origin: "ai" }, { nope: 1 }])).toEqual([])
  })

  it("drops only the overlay entry whose exclusion is ungoverned", () => {
    // The overlay carries mutations straight into the spec, so §8.1 is crossed
    // here too. Structure alone let a `statistical-outlier` with no method
    // through; `parseSpec` then refused the OVERLAID SPEC, the derivation fell
    // back to the rail's own, and every legitimate approved edit went with it,
    // silently. One bad entry drops itself, as one bad row filter does.
    const overlay = governedOverlay([
      { mutation: { kind: "figure.setTitle", value: "Kept" }, origin: "ai" },
      {
        mutation: {
          kind: "data.excludeRow",
          exclusion: { ...validExclusion, reasonKind: "statistical-outlier" },
        },
        origin: "ai",
      },
      { mutation: { kind: "data.excludeRow", exclusion: validExclusion }, origin: "user" },
    ])
    expect(overlay.map((entry) => entry.mutation.kind)).toEqual([
      "figure.setTitle",
      "data.excludeRow",
    ])
  })

  it("rejects a kind this build does not know, mid-list, without taking the figure down", () => {
    // `{kind:"figure.setNonsense"}` passed the old structural check, and its
    // POSITION is what made the difference: `applyMutation`'s switch returned
    // `undefined` for it, the NEXT entry in the reduce read `undefined.figure`
    // and threw, `derivedSpec`'s catch returned null, and the user got no
    // figure, no engine, no analysis and no message. The one arrangement that
    // degraded gracefully was the bad entry being the only one, so it goes in
    // the middle here.
    const raw = [
      { mutation: { kind: "figure.setTitle", value: "Before" }, origin: "ai" },
      { mutation: { kind: "figure.setNonsense", value: 1 }, origin: "ai" },
      { mutation: { kind: "figure.setCaption", value: "After" }, origin: "user" },
    ]
    const overlay = governedOverlay(raw)
    expect(overlay.map((e) => e.mutation.kind)).toEqual(["figure.setTitle", "figure.setCaption"])

    // And the derivation the workspace performs still produces a figure — the
    // entry AFTER the bad one included.
    const spec = whatTheWorkspaceWouldShow({ ...railConfig, aiOverlay: overlay })
    expect(spec).not.toBeNull()
    expect(spec!.figure.title).toBe("Before")
    expect(spec!.figure.caption).toBe("After")

    // Reported, not hidden: an approved edit this build cannot read is a loss
    // the user has to be told about, not a silent no-op.
    expect(governedPipeline({ aiOverlay: raw }).dropped).toBe(1)
  })

  it("an unknown kind that reached applyMutation anyway cannot return undefined", () => {
    // The second half of the same root fix. Even if something ever gets past
    // the schema, the switch's default returns the spec untouched instead of
    // handing the reduce a hole for the next entry to dereference.
    const bad = [
      { mutation: { kind: "figure.setTitle", value: "Before" }, origin: "user", at: "", description: "" },
      { mutation: { kind: "figure.setNonsense" }, origin: "user", at: "", description: "" },
      { mutation: { kind: "figure.setCaption", value: "After" }, origin: "user", at: "", description: "" },
    ] as unknown as AppliedMutation[]
    const out = applyOverlay(railDerived(), bad)
    expect(out.figure.title).toBe("Before")
    expect(out.figure.caption).toBe("After")
  })
})

/* ── 4. Letting Plotly edit a shape ────────────────────────────────────────*/

describe("movedShapeIndex — a shape drag the figure cannot record", () => {
  it("names the shape a relayout moved", () => {
    expect(movedShapeIndex({ "shapes[0].y0": 12, "shapes[0].y1": 12 })).toBe(0)
    expect(movedShapeIndex({ "shapes[7].y0": 3 })).toBe(7)
  })

  it("sees exactly the drags the bracket mapping throws away", () => {
    // One bracket, so `shapes[1]` onward is a volcano threshold or a drawn
    // annotation. `bracketMoveFromRelayout` has nothing to map those onto and
    // returns null — which is why the drag moved on screen, dispatched nothing,
    // and only snapped back on some later redraw.
    const brackets = [{ id: "b1", baseY: 10, y: 10 }]
    const relayout = { "shapes[1].y0": 4, "shapes[1].y1": 4 }
    expect(bracketMoveFromRelayout(relayout, brackets)).toBeNull()
    expect(movedShapeIndex(relayout)).toBe(1)
    // And the bracket itself still maps, so putting the others back cannot
    // cost the feature the edit was enabled for.
    expect(bracketMoveFromRelayout({ "shapes[0].y0": 14 }, brackets)?.id).toBe("b1")
  })

  it("ignores every relayout that is not a shape move", () => {
    expect(movedShapeIndex({ "xaxis.range[0]": 1, "xaxis.range[1]": 9 })).toBeNull()
    expect(movedShapeIndex({ autosize: true })).toBeNull()
    expect(movedShapeIndex({})).toBeNull()
  })
})
