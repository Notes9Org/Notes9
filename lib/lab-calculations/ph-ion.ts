import { calcError, calcOk, type CalculationResult } from "./types"
import { isPositiveFinite, roundToSigFigs } from "./units"
import { latexDecimal } from "./latex-format"

const KW_25C = 1e-14

/** From pH at 25 °C: pOH, [H⁺], [OH⁻] in mol/L. */
export function aqueousIonFromPh(pH: number): CalculationResult {
  if (!Number.isFinite(pH) || pH < 0 || pH > 14) {
    return calcError("pH should be between 0 and 14 (approx.).")
  }
  const pOH = 14 - pH
  const h = 10 ** -pH
  const oh = KW_25C / h
  const value = roundToSigFigs(pOH, 4)
  return calcOk({
    value,
    unit: "",
    label: "pOH (25 °C)",
    formulaLine: `pOH = 14 − pH = ${value}\n[H⁺] = ${roundToSigFigs(h, 4)} mol/L\n[OH⁻] = ${roundToSigFigs(oh, 4)} mol/L`,
    latexFormula: `\\mathrm{pOH}=14-${latexDecimal(pH)}=${latexDecimal(value)};\\;[\\mathrm{H}^+]=${latexDecimal(roundToSigFigs(h, 4))}\\,\\text{M};\\;[\\mathrm{OH}^-]=${latexDecimal(roundToSigFigs(oh, 4))}\\,\\text{M}`,
    warnings: ["Assumes 25 °C and pKw = 14."],
  })
}
