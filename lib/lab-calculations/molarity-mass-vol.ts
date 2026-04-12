import { calcError, calcOk, type CalculationResult } from "./types"
import {
  isPositiveFinite,
  massToGrams,
  roundToSigFigs,
  volumeToLiters,
  type MassUnit,
  type VolumeUnit,
} from "./units"
import { latexDecimal } from "./latex-format"

/** Molarity from solid mass (g), formula weight (g/mol), and solution volume. M = (m/MW)/V. */
export function molarityFromMassVolume(
  mass: number,
  massUnit: MassUnit,
  molecularWeightGPerMol: number,
  volume: number,
  volumeUnit: VolumeUnit
): CalculationResult {
  if (!isPositiveFinite(mass)) return calcError("Mass must be a positive number.")
  if (!isPositiveFinite(molecularWeightGPerMol)) {
    return calcError("Formula weight (g/mol) must be positive.")
  }
  if (!isPositiveFinite(volume)) return calcError("Volume must be a positive number.")

  const g = massToGrams(mass, massUnit)
  const vL = volumeToLiters(volume, volumeUnit)
  const nMol = g / molecularWeightGPerMol
  const M = nMol / vL
  const value = roundToSigFigs(M, 4)

  return calcOk({
    value,
    unit: "mol/L",
    label: "Molarity (from mass & volume)",
    formulaLine: `M = (m/MW)/V = (${g} g / ${molecularWeightGPerMol} g/mol) / ${vL} L = ${value} mol/L`,
    latexFormula: `\\mathrm{M}=\\frac{${latexDecimal(nMol)}\\,\\text{mol}}{${latexDecimal(vL)}\\,\\text{L}}=${latexDecimal(value)}\\,\\mathrm{mol}\\cdot\\mathrm{L}^{-1}`,
    warnings: [],
  })
}
