import { describe, it, expect, beforeAll } from "vitest"
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import { parseSpec, type AnalysisSpec } from "@/lib/data-analysis/spec/analysis-spec"
import { resolvePayload, type Table } from "@/lib/data-analysis/engine/resolver"
import { generatePythonScript, pythonScriptFileName } from "./python"

/**
 * The only test of a code generator that means anything is one that RUNS what
 * it generated. A script that reads correctly and disagrees with the app by a
 * digit is worse than no script, because it is the reviewer's reproduction that
 * gets believed.
 *
 * So each case here does the whole round trip:
 *
 *   raw CSV  ──TS resolver──> payload ──notes9_engine.run()──> reference numbers
 *      │
 *      └──generated script (own pipeline + the same engine)──> printed numbers
 *
 * and asserts the two agree. The left arm is what the app does; the right arm
 * is what a reviewer with the file and the script gets.
 *
 * Python is required for this and there is no R here: `Rscript` is not
 * installed in this environment, so an R exporter could not be verified by
 * execution and none was shipped.
 */

const REPO = path.resolve(__dirname, "../../..")
const ENGINE_PY = path.join(REPO, "public/data-analysis-engine/notes9_engine.py")
const PYTHON =
  process.env.NOTES9_TEST_PYTHON ??
  "/private/tmp/claude-501/-Users-ramanareddy-Desktop/f4ce7dc8-d38f-4d6b-8210-7b964cc7c2d3/scratchpad/engvenv/bin/python"

const havePython = existsSync(PYTHON)
const describeIf = havePython ? describe : describe.skip

let work: string
let engineSource: string

beforeAll(() => {
  work = mkdtempSync(path.join(tmpdir(), "n9-codegen-"))
  engineSource = readFileSync(ENGINE_PY, "utf8")
})

/* ── fixtures ───────────────────────────────────────────────────────────────*/

function spec(analysis: Record<string, unknown>, extra: Record<string, unknown> = {}): AnalysisSpec {
  const parsed = parseSpec({
    schemaVersion: 1,
    dataset: {
      fileId: null,
      fileName: "bench.csv",
      sheet: null,
      versionHash: "fnv1a64:deadbeefcafe",
      rowCount: 0,
      columnCount: 0,
      ...(extra.dataset as object | undefined),
    },
    design: { source: "inferred" },
    analysis,
    figure: { kind: "bar-scatter-error", x: {}, y: {} },
    export: {},
    ...extra,
  })
  if (!parsed.ok) throw new Error("fixture invalid: " + JSON.stringify(parsed.issues.slice(0, 2)))
  return parsed.spec
}

/**
 * Write a CSV and return the `Table` the app's reader would produce from it.
 * Row 1 is the header, so data starts on sheet row 2 and `rowId` is `row-N`,
 * exactly the addressing the generated script relies on.
 */
function csvTable(name: string, columns: string[], rows: (string | number)[][]): {
  file: string
  table: Table
} {
  const file = path.join(work, name)
  writeFileSync(file, [columns, ...rows].map((r) => r.join(",")).join("\n") + "\n", "utf8")
  return {
    file,
    table: {
      columns,
      rows: rows.map((cells, i) => ({
        rowId: `row-${i + 2}`,
        values: Object.fromEntries(columns.map((c, j) => [c, cells[j] ?? null])),
      })),
    },
  }
}

/* ── the two arms ───────────────────────────────────────────────────────────*/

/** What the app computes: the TS resolver's payload through the real engine. */
function engineReference(s: AnalysisSpec, table: Table): Record<string, unknown> {
  const outcome = resolvePayload(s, table)
  if (!outcome.ok) throw new Error("resolver blocked: " + JSON.stringify(outcome))
  const payloadFile = path.join(work, `payload-${Math.random().toString(36).slice(2)}.json`)
  writeFileSync(
    payloadFile,
    JSON.stringify({ ...outcome.payload, warnings: outcome.warnings }),
    "utf8"
  )
  const driver = path.join(work, "run-engine.py")
  writeFileSync(
    driver,
    [
      "import json, sys",
      `sys.path.insert(0, ${JSON.stringify(path.dirname(ENGINE_PY))})`,
      "import notes9_engine",
      "print(json.dumps(notes9_engine.run(json.load(open(sys.argv[1]))), default=str))",
    ].join("\n"),
    "utf8"
  )
  return JSON.parse(execFileSync(PYTHON, [driver, payloadFile], { encoding: "utf8" }))
}

/** What a reviewer gets: the generated script, run against the raw file. */
function scriptResult(
  s: AnalysisSpec,
  table: Table,
  file: string
): { json: Record<string, unknown>; report: string; script: string } {
  const script = generatePythonScript({
    spec: s,
    table,
    engineSource,
    generatedAt: "2026-01-01T00:00:00.000Z",
  })
  const scriptFile = path.join(work, `script-${Math.random().toString(36).slice(2)}.py`)
  writeFileSync(scriptFile, script, "utf8")
  const json = JSON.parse(
    execFileSync(PYTHON, [scriptFile, file, "--json"], { encoding: "utf8" })
  )
  const report = execFileSync(PYTHON, [scriptFile, file], { encoding: "utf8" })
  return { json, report, script }
}

/** Every finite number in the result, keyed by its path, for an exact compare. */
function numbers(value: unknown, prefix = "", into: Record<string, number> = {}) {
  if (typeof value === "number" && Number.isFinite(value)) into[prefix] = value
  else if (Array.isArray(value)) value.forEach((v, i) => numbers(v, `${prefix}[${i}]`, into))
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // Wall-clock, not a statistic.
      if (k === "durationMs") continue
      numbers(v, prefix ? `${prefix}.${k}` : k, into)
    }
  }
  return into
}

function expectSameNumbers(script: unknown, engine: unknown) {
  const a = numbers(script)
  const b = numbers(engine)
  expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort())
  for (const key of Object.keys(b)) {
    expect.soft(a[key], key).toBeCloseTo(b[key], 10)
  }
}

/* ── cases ──────────────────────────────────────────────────────────────────*/

describeIf("generated Python reproduces the engine", () => {
  // Each case spawns Python two or three times; the default 5s is a stopwatch
  // on CPython start-up, not on the code under test.
  const RUNS_PYTHON = 120_000

  it("t-test: filters, a log10 transform, an exclusion and Welch", () => {
    const { file, table } = csvTable(
      "ttest.csv",
      ["plate", "treatment", "signal"],
      [
        ["P1", "Ctrl", 100],
        ["P1", "Ctrl", 118],
        ["P1", "Ctrl", 96],
        ["P1", "Ctrl", 1050], // excluded below
        ["P1", "Drug", 240],
        ["P1", "Drug", 262],
        ["P1", "Drug", 231],
        ["P1", "Drug", 255],
        ["P2", "Ctrl", 3],
        ["P2", "Drug", 4],
      ]
    )
    const s = spec(
      {
        test: "t-welch",
        responseColumns: ["signal"],
        groupColumn: "treatment",
        alpha: 0.05,
        tails: "two",
        missingValues: "listwise",
      },
      {
        filters: [{ column: "plate", op: "eq", value: "P1" }],
        transforms: [{ kind: "log10", column: "signal" }],
        exclusions: [
          {
            rowId: "row-5",
            reasonKind: "technical-failure",
            excludedBy: "tester",
            excludedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      }
    )

    const reference = engineReference(s, table)
    const { json, report } = scriptResult(s, table, file)

    expectSameNumbers(json, reference)
    expect(json.testRan).toBe("t-welch")
    expect((json.test as Record<string, unknown>).reportSentence).toBe(
      (reference.test as Record<string, unknown>).reportSentence
    )
    expect(report).toContain("Welch")
    // Sanity that the pipeline actually bit: the excluded row is the outlier
    // and the filter dropped plate P2, so n is 3 vs 4.
    expect((json.test as { groupSizes: Record<string, number> }).groupSizes).toEqual({
      Ctrl: 3,
      Drug: 4,
    })
  }, RUNS_PYTHON)

  it("one-way ANOVA with a Holm-Sidak post-hoc and a collapseReplicates step", () => {
    const rows: (string | number)[][] = []
    const means: Record<string, number> = { A: 10, B: 14, C: 21 }
    for (const g of ["A", "B", "C"]) {
      for (let subject = 1; subject <= 4; subject++) {
        for (let rep = 1; rep <= 2; rep++) {
          rows.push([g, `s${g}${subject}`, means[g] + subject + (rep === 1 ? 0.4 : -0.4)])
        }
      }
    }
    const { file, table } = csvTable("anova.csv", ["arm", "subject", "value"], rows)
    const s = spec(
      {
        test: "anova-one-way",
        responseColumns: ["value"],
        groupColumn: "arm",
        postHoc: "holm-sidak",
        alpha: 0.05,
        tails: "two",
      },
      {
        transforms: [{ kind: "collapseReplicates", by: ["arm", "subject"], statistic: "mean" }],
      }
    )

    const reference = engineReference(s, table)
    const { json, report } = scriptResult(s, table, file)

    expectSameNumbers(json, reference)
    const pairwise = (json.test as { pairwise: { correctionMethod: string }[] }).pairwise
    expect(pairwise).toHaveLength(3)
    expect(pairwise[0].correctionMethod).toBe("holm-sidak")
    expect(report).toContain("One-way ANOVA")
    // The collapse ran: 24 raw rows became 12 subject means, 4 per arm.
    expect((json.test as { groupSizes: Record<string, number> }).groupSizes).toEqual({
      A: 4,
      B: 4,
      C: 4,
    })
  }, RUNS_PYTHON)

  it("carries an FDR correction through to the engine unchanged", () => {
    const rows: (string | number)[][] = []
    const means: Record<string, number> = { A: 10, B: 10.4, C: 21 }
    for (const g of ["A", "B", "C"]) {
      for (let i = 0; i < 5; i++) rows.push([g, means[g] + (i % 3) * 0.6])
    }
    const { file, table } = csvTable("fdr.csv", ["arm", "value"], rows)
    const s = spec({
      test: "anova-one-way",
      responseColumns: ["value"],
      groupColumn: "arm",
      // The spec enum only just gained this; the pipeline passes `postHoc`
      // straight through, so a correction the engine grows is reachable from a
      // generated script the day it lands.
      postHoc: "benjamini-hochberg",
      alpha: 0.05,
      tails: "two",
    })

    const reference = engineReference(s, table)
    const { json } = scriptResult(s, table, file)

    expectSameNumbers(json, reference)
    const pairwise = (json.test as {
      pairwise: { correctionMethod: string; ciLow: number | null; significant: boolean }[]
    }).pairwise
    expect(pairwise.map((c) => c.correctionMethod)).toEqual([
      "benjamini-hochberg",
      "benjamini-hochberg",
      "benjamini-hochberg",
    ])
    // FCR intervals exist only over the selected set; an unselected row keeps
    // no interval, and the script reproduces that rather than back-filling one.
    for (const c of pairwise) {
      expect(c.ciLow === null).toBe(!c.significant)
    }
  }, RUNS_PYTHON)

  it("dose-response 4PL with 1/Y^2 weighting and a vehicle control row", () => {
    const bottom = 20
    const top = 1200
    const logEc50 = Math.log10(45)
    const hill = 1.1
    const rows: (string | number)[][] = [["vehicle", 0, bottom + 1.5]]
    const doses = [1, 3, 10, 30, 100, 300, 1000, 3000]
    doses.forEach((d, i) => {
      const y = bottom + (top - bottom) / (1 + Math.pow(10, (logEc50 - Math.log10(d)) * hill))
      rows.push([`d${i}`, d, Number((y + (i % 3) - 1).toFixed(3))])
    })
    const { file, table } = csvTable("dose.csv", ["well", "conc", "signal"], rows)
    const s = spec({
      test: "nonlinear-regression",
      responseColumns: ["conc", "signal"],
      alpha: 0.05,
      tails: "two",
      nonlinear: { model: "4pl", weighting: "1/Y^2", confidenceBands: true },
    })

    const reference = engineReference(s, table)
    const { json, report } = scriptResult(s, table, file)

    expectSameNumbers(json, reference)
    const fit = json.curveFit as { ec50: number; converged: boolean; rSquared: number }
    expect(fit.converged).toBe(true)
    expect(fit.ec50).toBeCloseTo(45, 0)
    expect(report).toContain("Curve fit: 4PL")
    // The zero-dose row has no position on a log axis; both arms say so.
    expect((json.warnings as string[]).join(" ")).toContain("concentration ≤ 0")
  }, RUNS_PYTHON)

  it("carries the version pins Law 4 requires, and stays valid Python", () => {
    const { file, table } = csvTable(
      "pins.csv",
      ["g", "v"],
      [["A", 1], ["A", 2], ["A", 3], ["B", 5], ["B", 6], ["B", 7]]
    )
    const s = spec({
      test: "t-unpaired",
      responseColumns: ["v"],
      groupColumn: "g",
      alpha: 0.05,
      tails: "two",
    })
    const { script } = scriptResult(s, table, file)

    expect(script).toContain("notes9-stats 1.2.0 (pyodide 0.28.3)")
    expect(script).toContain("pyodide    0.28.3")
    expect(script).toContain("numpy, scipy, pandas, statsmodels, patsy")
    // The engine travels whole, not as a re-derivation of each test.
    expect(script).toContain("def run_dose_response(p)")
    expect(script).toContain("def _post_hoc(names, arrays, method, alpha")
    // `from __future__` is lifted to the top exactly once.
    expect(script.match(/^from __future__ import annotations$/gm)).toHaveLength(1)
    expect(script.indexOf("from __future__")).toBeLessThan(script.indexOf('"""'))
  }, RUNS_PYTHON)

  it("falls back to inline rows when the ids no longer name sheet rows", () => {
    const { file, table } = csvTable("inline.csv", ["g", "v"], [["A", 1], ["A", 2], ["B", 5], ["B", 6]])
    const reshaped: Table = {
      columns: table.columns,
      rows: table.rows.map((r, i) => ({ ...r, rowId: `row-${i + 2}+row-${i + 20}` })),
    }
    const s = spec({
      test: "t-unpaired",
      responseColumns: ["v"],
      groupColumn: "g",
      alpha: 0.05,
      tails: "two",
    })
    const { json, script } = scriptResult(s, reshaped, file)

    expect(script).toContain("INLINE_ROWS = _json.loads")
    expect(script).toContain("could not be addressed back to the file")
    expect((json.test as { groupSizes: Record<string, number> }).groupSizes).toEqual({ A: 2, B: 2 })
  }, RUNS_PYTHON)
})

describe("file naming", () => {
  it("makes a safe filename from the analysis title", () => {
    expect(pythonScriptFileName("IL-6 dose response!")).toBe("IL-6-dose-response-reproduce.py")
    expect(pythonScriptFileName("")).toBe("analysis-reproduce.py")
  })
})
