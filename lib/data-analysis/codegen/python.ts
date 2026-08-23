/**
 * Export reproducible code (§2 Tier 0).
 *
 * The requirement is a script that regenerates the analysis FROM THE RAW FILE,
 * not one that prints the answer the app already computed. So the generated
 * file replays the whole pipeline in order — read, filter, transform, exclude,
 * collapse replicates, apply the missing-value strategy, shape, test — and then
 * calls the engine.
 *
 * Two decisions keep it from drifting away from what actually ran:
 *
 *   1. The engine is EMBEDDED VERBATIM. `notes9_engine.py` is the file the
 *      worker executes; the script carries the same bytes rather than a
 *      hand-written re-derivation of each test, so a script cannot compute a
 *      statistic the app would not. Only `from __future__ import annotations`
 *      is lifted out of it, because that statement has to be the first one in
 *      a Python file and the generated header sits above it.
 *
 *   2. The header carries the version pins Law 4 requires — the Pyodide
 *      distribution (which pins CPython and every compiled wheel), the package
 *      set, and the `ENGINE_VERSION` stamped on the result being reproduced.
 *      A number is only reproducible against a named stack.
 *
 * The SHEET READ is recorded rather than re-derived. The app's header detector
 * skips preambles, folds two-row headers, reads unit rows and drops footnotes;
 * porting it would mean this script could disagree with the app the day the
 * detector changes. So the outcome of that read travels in the script — the
 * column names and the 1-based sheet rows the data occupied — and is applied to
 * the raw grid. The file is still the only source of values.
 */

import type { AnalysisSpec } from "@/lib/data-analysis/spec/analysis-spec"
import type { Table } from "@/lib/data-analysis/engine/resolver"
import {
  ENGINE_PACKAGES,
  ENGINE_VERSION,
  PYODIDE_VERSION,
} from "@/lib/data-analysis/engine/contract"
import { RUNTIME_PY } from "@/lib/data-analysis/codegen/runtime"

/** Where the worker loads the engine from, and where the generator reads it. */
export const ENGINE_SOURCE_URL = "/data-analysis-engine/notes9_engine.py"

export interface PythonCodegenInput {
  spec: AnalysisSpec
  /** The same snapshot table that was handed to `resolvePayload`. */
  table: Table
  /** `notes9_engine.py`, verbatim. Fetch it with `fetchEngineSource()`. */
  engineSource: string
  /** Stamp on the header. Defaults to now; pinned in tests for a stable diff. */
  generatedAt?: string
}

/**
 * Read the engine the worker runs. Browser-only; `fetch` of a same-origin
 * static asset, so there is no server round trip to a different build.
 */
export async function fetchEngineSource(fetchImpl?: typeof fetch): Promise<string> {
  const f = fetchImpl ?? (typeof fetch === "function" ? fetch : null)
  if (!f) throw new Error("No fetch available to read the engine source.")
  const res = await f(ENGINE_SOURCE_URL)
  if (!res.ok) throw new Error(`Could not read the engine source (${res.status}).`)
  return res.text()
}

/**
 * `from __future__` must be the first statement in a Python file. The generated
 * header sits above the engine, so the line is lifted here and re-emitted at
 * the top. Nothing else about the engine is touched.
 */
function liftFutureImport(engineSource: string): string {
  return engineSource.replace(/^from __future__ import annotations\n/m, "")
}

/** JSON is a Python `json.loads` argument, not a Python literal: `true` and
 *  `null` are not spellings Python knows. A raw triple-quoted string is safe
 *  because JSON can never contain three consecutive unescaped quotes. */
function pyJson(value: unknown): string {
  const text = JSON.stringify(value, null, 2)
  if (text.includes('"""')) throw new Error("Unencodable JSON in the generated script.")
  return `_json.loads(r"""\n${text}\n""")`
}

function pyStr(value: string | null): string {
  return value === null ? "None" : JSON.stringify(value)
}

/** Consecutive sheet rows collapse to a span, so a 20k-row sheet is two ints. */
function toSpans(numbers: number[]): [number, number][] {
  const spans: [number, number][] = []
  for (const n of numbers) {
    const last = spans[spans.length - 1]
    if (last && n === last[1] + 1) last[1] = n
    else spans.push([n, n])
  }
  return spans
}

const ROW_ID = /^row-(\d+)$/

/**
 * The rows, addressed back to the raw sheet where that is possible.
 *
 * A rowId stops naming a sheet row once a reshape has rewritten it
 * (`collapseReplicates` joins ids with `+`, `pivotLonger` extends them). Those
 * reshapes are transforms the script re-applies itself, so the ids it starts
 * from should be the pre-transform ones — but a spec saved against an already
 * reshaped table has no way back to the file. In that case the rows travel
 * inline and the header says so, rather than the script silently analysing the
 * wrong rows.
 */
function addressRows(table: Table): { rowNumbers: number[] | null } {
  const numbers: number[] = []
  for (const r of table.rows) {
    const m = ROW_ID.exec(r.rowId)
    if (!m) return { rowNumbers: null }
    numbers.push(Number(m[1]))
  }
  return { rowNumbers: numbers }
}

export function generatePythonScript(input: PythonCodegenInput): string {
  const { spec, table, engineSource } = input
  const generatedAt = input.generatedAt ?? new Date().toISOString()
  const { rowNumbers } = addressRows(table)

  const sourceName = spec.dataset.fileName || "data.xlsx"
  const inline = rowNumbers === null

  const header = [
    "#!/usr/bin/env python3",
    "# ═══════════════════════════════════════════════════════════════════════════",
    "#  Notes9 — reproducible analysis",
    "#",
    `#  Dataset      ${sourceName}${spec.dataset.sheet ? `  (sheet ${spec.dataset.sheet})` : ""}`,
    `#  Data version ${spec.dataset.versionHash}`,
    `#  Rows x cols  ${spec.dataset.rowCount} x ${spec.dataset.columnCount}`,
    `#  Test         ${spec.analysis.test}`,
    `#  Generated    ${generatedAt}`,
    "#",
    "#  VERSION PINS — the numbers below belong to this stack and no other.",
    `#    engine     ${ENGINE_VERSION}`,
    `#    pyodide    ${PYODIDE_VERSION}   (pins CPython and every compiled wheel)`,
    `#    packages   ${ENGINE_PACKAGES.prebuilt.join(", ")}`,
    ENGINE_PACKAGES.micropip.length
      ? `#    micropip   ${ENGINE_PACKAGES.micropip.join(", ")}`
      : "#    micropip   (none)",
    "#",
    "#  Outside Pyodide, install the same package set and expect agreement to",
    "#  the precision those wheels give you:",
    `#    pip install ${ENGINE_PACKAGES.prebuilt.join(" ")} openpyxl`,
    "#",
    "#  Run:  python this_script.py [path/to/raw/file]      (add --json for the",
    "#        full result object instead of the printed report)",
    "#",
    "#  Everything below the ENGINE banner is notes9_engine.py exactly as the app",
    "#  runs it, so this script cannot compute a statistic the app would not.",
    "# ═══════════════════════════════════════════════════════════════════════════",
    "from __future__ import annotations",
    "",
    "import json as _json",
    "import math as _math",
    "",
    "import pandas as _pd",
    "",
  ].join("\n")

  const config = [
    "# ═══ what was analysed ══════════════════════════════════════════════════════",
    "# Point SOURCE_FILE at the raw file, or pass a path on the command line.",
    "",
    `SOURCE_FILE = ${pyStr(sourceName)}`,
    `SHEET = ${pyStr(spec.dataset.sheet)}`,
    `DATASET_NAME = ${pyStr(sourceName)}`,
    `SPEC_HASH = ${pyStr(spec.dataset.versionHash)}`,
    `ENGINE_VERSION = ${pyStr(ENGINE_VERSION)}`,
    "",
    "# The columns and the 1-based sheet rows the app's reader resolved.",
    `COLUMNS = ${pyJson(table.columns)}`,
    inline
      ? "ROW_SPANS = []"
      : `ROW_SPANS = ${pyJson(toSpans(rowNumbers))}   # inclusive, 1-based`,
    "ROW_NUMBERS = [n for a, b in ROW_SPANS for n in range(a, b + 1)]",
    inline
      ? [
          "",
          "# This spec was saved against a table whose row ids no longer name sheet",
          "# rows, so the rows could not be addressed back to the file and travel",
          "# with the script instead. Re-export from an un-reshaped sheet to get a",
          "# script that reads every value out of the file.",
          `INLINE_ROWS = ${pyJson(table.rows)}`,
        ].join("\n")
      : "INLINE_ROWS = None",
    "",
    "# The analysis spec, verbatim: filters, transforms IN ORDER, exclusions, the",
    "# missing-value strategy, and the test with its options and correction.",
    `SPEC = ${pyJson({
      dataset: spec.dataset,
      roles: spec.roles,
      design: spec.design,
      filters: spec.filters,
      exclusions: spec.exclusions,
      transforms: spec.transforms,
      analysis: spec.analysis,
    })}`,
    "",
  ].join("\n")

  const engine = [
    "",
    "# ═══ ENGINE ═════════════════════════════════════════════════════════════════",
    "# public/data-analysis-engine/notes9_engine.py, verbatim.",
    "",
    liftFutureImport(engineSource).trimEnd(),
    "",
  ].join("\n")

  return [header, config, engine, "", RUNTIME_PY].join("\n")
}

/** A filename for the download, derived from the analysis title. */
export function pythonScriptFileName(title: string): string {
  const stem = (title || "analysis").replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "")
  return `${stem || "analysis"}-reproduce.py`
}
