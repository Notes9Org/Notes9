import { calcError, calcOk, type CalculationResult } from "./types"
import { isPositiveFinite, roundToSigFigs } from "./units"
import { latexDecimal } from "./latex-format"

/** Henderson–Hasselbalch: pH = pKa + log10([A⁻]/[HA]). Ratio is [conjugate base]/[acid]. */
export function hendersonHasselbalch(pKa: number, ratioBaseOverAcid: number): CalculationResult {
  if (!Number.isFinite(pKa)) return calcError("pKa must be a finite number.")
  if (!isPositiveFinite(ratioBaseOverAcid)) {
    return calcError("Ratio [A⁻]/[HA] must be a positive number.")
  }
  const pH = pKa + Math.log10(ratioBaseOverAcid)
  const value = roundToSigFigs(pH, 4)
  return calcOk({
    value,
    unit: "",
    label: "pH",
    formulaLine: `pH = pKa + log₁₀([A⁻]/[HA]) = ${pKa} + log₁₀(${ratioBaseOverAcid}) = ${value}`,
    latexFormula: `\\mathrm{pH}=\\mathrm{p}K_{\\mathrm{a}}+\\log_{10}\\left(${latexDecimal(ratioBaseOverAcid)}\\right)=${latexDecimal(pKa)}+\\log_{10}\\left(${latexDecimal(ratioBaseOverAcid)}\\right)=${latexDecimal(value)}`,
    warnings: [],
  })
}
