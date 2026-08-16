/**
 * The tri-state gate that replaces the single `aiReady` boolean (ADR-023).
 *
 * `aiReady` used to be `derivedSpec !== null && specTable.rows.length > 0` —
 * one condition guarding both "can the researcher say anything to the AI" and
 * "can a plan be proposed". `snapshotToTable` reading only the first sheet and
 * treating row 0 as the header verbatim meant a file with data on sheet 2, or a
 * title preamble above the header, silently produced zero rows, and the single
 * gate went permanently dead with a placeholder ("Attach a data file to
 * start.") shown while the file was plainly on screen — R1 in
 * ARCHITECTURE.md.
 *
 * ADR-023 (amends ADR-015): intent may be stated before data; statistics and
 * plans may not. So the gate splits: `canCapture` — mounted, nothing else
 * required — and `canPropose`, which keeps ADR-015's original guarantee that a
 * plan can never be approved against data the researcher did not choose.
 *
 * `reason` is always derived from the inputs, never a literal. A hardcoded
 * string is the exact defect ADR-015 produced, and it lied the moment the
 * underlying condition it described stopped matching the string.
 */

export type AiGate = {
  /** True whenever an analysis is mounted — intent capture needs nothing else. */
  canCapture: boolean
  /** Requires a dataset, a derivable spec, and at least one row. */
  canPropose: boolean
  /** Which gate is blocking, in the researcher's terms. Null iff `canPropose`. */
  reason: string | null
}

export function deriveAiGate(input: {
  datasetPresent: boolean
  derivedSpecPresent: boolean
  rowCount: number
  /** From `snapshotToTable`. Set means the table is empty because parsing
   *  failed, not because the data genuinely has no rows — the two must read
   *  differently or a parse failure is indistinguishable from an empty file. */
  parseError: string | null
}): AiGate {
  const { datasetPresent, derivedSpecPresent, rowCount, parseError } = input
  const canPropose = datasetPresent && derivedSpecPresent && rowCount > 0

  let reason: string | null = null
  if (!canPropose) {
    if (!datasetPresent) {
      reason = "Attach a data file before asking the AI to propose a chart or test."
    } else if (parseError) {
      reason = `The data could not be read, so nothing can be proposed: ${parseError}`
    } else if (!derivedSpecPresent) {
      reason = "No analysis could be derived from this data yet."
    } else {
      reason = "This table has 0 rows, so there is nothing to propose against."
    }
  }

  // canCapture is unconditional here on purpose: this function is only ever
  // called for a mounted analysis, and intent capture (ADR-023) needs nothing
  // beyond that — not a dataset, not a spec, not a successful parse.
  return { canCapture: true, canPropose, reason }
}
