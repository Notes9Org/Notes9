/** Successful numeric result from a lab calculation (SI or display-ready). */
export type CalculationSuccess = {
  ok: true
  /** Primary numeric result */
  value: number
  /** Unit string for display, e.g. "mol/L", "mol", "g" */
  unit: string
  /** Short label, e.g. "Molarity" */
  label: string
  /** Human-readable substitution, e.g. "M = 0.05 mol / 0.1 L" */
  formulaLine: string
  /** KaTeX-safe inline LaTeX for the worked calculation (TipTap inline math). */
  latexFormula: string
  /** Non-blocking notes (e.g. rounding) */
  warnings: string[]
}

export type CalculationFailure = {
  ok: false
  error: string
}

export type CalculationResult = CalculationSuccess | CalculationFailure

export function calcError(message: string): CalculationFailure {
  return { ok: false, error: message }
}

export function calcOk(
  partial: Omit<CalculationSuccess, "ok" | "warnings"> & { warnings?: string[] }
): CalculationSuccess {
  return {
    ok: true,
    warnings: partial.warnings ?? [],
    value: partial.value,
    unit: partial.unit,
    label: partial.label,
    formulaLine: partial.formulaLine,
    latexFormula: partial.latexFormula,
  }
}
