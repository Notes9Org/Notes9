import { calcError, calcOk, type CalculationResult } from "./types"
import { latexDecimal } from "./latex-format"
import {
  gramsToMass,
  isPositiveFinite,
  massToGrams,
  molesToMol,
  roundToSigFigs,
  type MassUnit,
  type MoleUnit,
} from "./units"

/**
 * Moles from mass: n = m / MW (m in g, MW in g/mol).
 */
export function molesFromMass(
  mass: number,
  massUnit: MassUnit,
  molecularWeightGPerMol: number
): CalculationResult {
  if (!isPositiveFinite(mass)) {
    return calcError("Mass must be a positive number.")
  }
  if (!isPositiveFinite(molecularWeightGPerMol)) {
    return calcError("Molecular weight must be a positive number (g/mol).")
  }

  const g = massToGrams(mass, massUnit)
  const nMol = g / molecularWeightGPerMol
  const value = roundToSigFigs(nMol, 4)

  return calcOk({
    value,
    unit: "mol",
    label: "Amount (moles)",
    formulaLine: `n = ${g} g / ${molecularWeightGPerMol} g/mol = ${value} mol`,
    latexFormula: `n=\\frac{${latexDecimal(g)}\\,\\text{g}}{${latexDecimal(molecularWeightGPerMol)}\\,\\text{g/mol}}=${latexDecimal(value)}\\,\\text{mol}`,
    warnings: [],
  })
}

/**
 * Mass from moles: m = n × MW (MW in g/mol, result in g by default; can display in mg).
 */
export function massFromMoles(
  moles: number,
  moleUnit: MoleUnit,
  molecularWeightGPerMol: number,
  outMassUnit: MassUnit = "g"
): CalculationResult {
  if (!isPositiveFinite(moles)) {
    return calcError("Amount must be a positive number.")
  }
  if (!isPositiveFinite(molecularWeightGPerMol)) {
    return calcError("Molecular weight must be a positive number (g/mol).")
  }

  const nMol = molesToMol(moles, moleUnit)
  const g = nMol * molecularWeightGPerMol
  const value = roundToSigFigs(gramsToMass(g, outMassUnit), 4)
  const unitLatex = outMassUnit === "g" ? "\\text{g}" : "\\text{mg}"

  return calcOk({
    value,
    unit: outMassUnit,
    label: "Mass",
    formulaLine: `m = ${nMol} mol × ${molecularWeightGPerMol} g/mol = ${roundToSigFigs(g, 4)} g → ${value} ${outMassUnit}`,
    latexFormula: `m=${latexDecimal(nMol)}\\,\\text{mol}\\times${latexDecimal(molecularWeightGPerMol)}\\,\\text{g/mol}=${latexDecimal(value)}\\,${unitLatex}`,
    warnings: [],
  })
}
