import { calcError, calcOk, type CalculationResult } from "./types"
import { latexDecimal } from "./latex-format"
import {
  isPositiveFinite,
  molesToMol,
  roundToSigFigs,
  volumeToLiters,
  type MoleUnit,
  type VolumeUnit,
} from "./units"

/**
 * Molarity M = n / V with n in mol and V in L → mol/L.
 */
export function molarityFromMolesVolume(
  moles: number,
  moleUnit: MoleUnit,
  volume: number,
  volumeUnit: VolumeUnit
): CalculationResult {
  if (!isPositiveFinite(moles)) {
    return calcError("Amount must be a positive number.")
  }
  if (!isPositiveFinite(volume)) {
    return calcError("Volume must be a positive number.")
  }

  const nMol = molesToMol(moles, moleUnit)
  const vL = volumeToLiters(volume, volumeUnit)
  const M = nMol / vL
  const value = roundToSigFigs(M, 4)

  return calcOk({
    value,
    unit: "mol/L",
    label: "Molarity",
    formulaLine: `M = ${nMol} mol / ${vL} L = ${value} mol/L`,
    latexFormula: `\\mathrm{M}=\\frac{${latexDecimal(nMol)}\\,\\mathrm{mol}}{${latexDecimal(vL)}\\,\\mathrm{L}}=${latexDecimal(value)}\\,\\mathrm{mol}\\cdot\\mathrm{L}^{-1}`,
    warnings: [],
  })
}
