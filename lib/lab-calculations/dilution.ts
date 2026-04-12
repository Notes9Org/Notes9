import { calcError, calcOk, type CalculationResult } from "./types"
import { latexConcUnitFragment, latexDecimal, latexVolUnitFragment } from "./latex-format"
import {
  concToMolar,
  isPositiveFinite,
  molarToConc,
  roundToSigFigs,
  volumeToLiters,
  litersToVolume,
  type ConcUnit,
  type VolumeUnit,
} from "./units"

export type DilutionUnknown = "C1" | "V1" | "C2" | "V2"

const UNK_LATEX: Record<DilutionUnknown, string> = {
  C1: "C_1",
  V1: "V_1",
  C2: "C_2",
  V2: "V_2",
}

/**
 * C1×V1 = C2×V2 (concentrations in consistent molar units, volumes in consistent volume units).
 * Exactly one of C1, V1, C2, V2 must be omitted (undefined) to solve for it.
 */
export function solveDilution(params: {
  C1?: number
  V1?: number
  C2?: number
  V2?: number
  concUnit: ConcUnit
  volUnit: VolumeUnit
  unknown: DilutionUnknown
}): CalculationResult {
  const { C1, V1, C2, V2, concUnit, volUnit, unknown } = params

  const known = { C1, V1, C2, V2 }
  const keys: DilutionUnknown[] = ["C1", "V1", "C2", "V2"]
  const missing = keys.filter((k) => known[k] === undefined || known[k] === null)
  const defined = keys.filter((k) => known[k] !== undefined && known[k] !== null)

  if (missing.length !== 1 || defined.length !== 3) {
    return calcError("Provide exactly three values; leave one blank to solve.")
  }
  if (missing[0] !== unknown) {
    return calcError("The empty field must match the selected unknown.")
  }

  const c1M = C1 !== undefined && C1 !== null ? concToMolar(C1, concUnit) : undefined
  const c2M = C2 !== undefined && C2 !== null ? concToMolar(C2, concUnit) : undefined
  const v1L = V1 !== undefined && V1 !== null ? volumeToLiters(V1, volUnit) : undefined
  const v2L = V2 !== undefined && V2 !== null ? volumeToLiters(V2, volUnit) : undefined

  const checkPositive = (name: string, v: number | undefined) => {
    if (v === undefined) return true
    return isPositiveFinite(v)
  }

  if (!checkPositive("C1", c1M) || !checkPositive("C2", c2M) || !checkPositive("V1", v1L) || !checkPositive("V2", v2L)) {
    return calcError("All entered concentrations and volumes must be positive.")
  }

  let resultMolar: number | undefined
  let resultVolL: number | undefined

  switch (unknown) {
    case "C1": {
      if (!isPositiveFinite(v1L!) || !isPositiveFinite(c2M!) || !isPositiveFinite(v2L!)) {
        return calcError("Invalid inputs for C1.")
      }
      resultMolar = (c2M! * v2L!) / v1L!
      break
    }
    case "V1": {
      if (!isPositiveFinite(c1M!) || !isPositiveFinite(c2M!) || !isPositiveFinite(v2L!)) {
        return calcError("Invalid inputs for V1.")
      }
      resultVolL = (c2M! * v2L!) / c1M!
      break
    }
    case "C2": {
      if (!isPositiveFinite(c1M!) || !isPositiveFinite(v1L!) || !isPositiveFinite(v2L!)) {
        return calcError("Invalid inputs for C2.")
      }
      resultMolar = (c1M! * v1L!) / v2L!
      break
    }
    case "V2": {
      if (!isPositiveFinite(c1M!) || !isPositiveFinite(v1L!) || !isPositiveFinite(c2M!)) {
        return calcError("Invalid inputs for V2.")
      }
      resultVolL = (c1M! * v1L!) / c2M!
      break
    }
    default:
      return calcError("Unknown variable.")
  }

  const uC = latexConcUnitFragment(concUnit)
  const uV = latexVolUnitFragment(volUnit)

  if (resultMolar !== undefined) {
    const c1Fin = unknown === "C1" ? resultMolar : c1M!
    const c2Fin = unknown === "C2" ? resultMolar : c2M!
    const v1Fin = v1L!
    const v2Fin = v2L!

    const C1d = roundToSigFigs(molarToConc(c1Fin, concUnit), 4)
    const C2d = roundToSigFigs(molarToConc(c2Fin, concUnit), 4)
    const V1d = roundToSigFigs(litersToVolume(v1Fin, volUnit), 4)
    const V2d = roundToSigFigs(litersToVolume(v2Fin, volUnit), 4)

    const value = unknown === "C1" ? C1d : C2d
    const sym = UNK_LATEX[unknown]
    const label = unknown === "C1" ? "C1 (initial concentration)" : "C2 (final concentration)"
    const mol1 = roundToSigFigs(c1Fin * v1Fin, 6)
    const mol2 = roundToSigFigs(c2Fin * v2Fin, 6)

    const formulaLine = [
      `C1 = ${C1d} ${concUnit},  C2 = ${C2d} ${concUnit},  V1 = ${V1d} ${volUnit},  V2 = ${V2d} ${volUnit}`,
      `Moles: C1·V1 = ${mol1} mol;  C2·V2 = ${mol2} mol (equal)`,
      `C1×V1 = C2×V2  →  ${unknown} = ${value} ${concUnit}`,
    ].join("\n")

    const latexFormula = [
      `C_1\\cdot V_1=C_2\\cdot V_2`,
      `C_1=${latexDecimal(C1d)}\\,${uC},\\;C_2=${latexDecimal(C2d)}\\,${uC},\\;V_1=${latexDecimal(V1d)}\\,${uV},\\;V_2=${latexDecimal(V2d)}\\,${uV}`,
      `n=${latexDecimal(mol1)}\\,\\text{mol}=${latexDecimal(mol2)}\\,\\text{mol}`,
      `${sym}=${latexDecimal(value)}\\,${uC}`,
    ].join(";\\;")

    return calcOk({
      value,
      unit: concUnit,
      label,
      formulaLine,
      latexFormula,
      warnings: [],
    })
  }

  const c1Fin = c1M!
  const c2Fin = c2M!
  const v1Fin = unknown === "V1" ? resultVolL! : v1L!
  const v2Fin = unknown === "V2" ? resultVolL! : v2L!

  const C1d = roundToSigFigs(molarToConc(c1Fin, concUnit), 4)
  const C2d = roundToSigFigs(molarToConc(c2Fin, concUnit), 4)
  const V1d = roundToSigFigs(litersToVolume(v1Fin, volUnit), 4)
  const V2d = roundToSigFigs(litersToVolume(v2Fin, volUnit), 4)

  const valueVol = unknown === "V1" ? V1d : V2d
  const sym = UNK_LATEX[unknown]

  const mol1 = roundToSigFigs(c1Fin * v1Fin, 6)
  const mol2 = roundToSigFigs(c2Fin * v2Fin, 6)

  const formulaLine = [
    `C1 = ${C1d} ${concUnit},  C2 = ${C2d} ${concUnit},  V1 = ${V1d} ${volUnit},  V2 = ${V2d} ${volUnit}`,
    `Moles: C1·V1 = ${mol1} mol;  C2·V2 = ${mol2} mol (equal)`,
    `C1×V1 = C2×V2  →  ${unknown} = ${valueVol} ${volUnit}`,
  ].join("\n")

  const latexFormula = [
    `C_1\\cdot V_1=C_2\\cdot V_2`,
    `C_1=${latexDecimal(C1d)}\\,${uC},\\;C_2=${latexDecimal(C2d)}\\,${uC},\\;V_1=${latexDecimal(V1d)}\\,${uV},\\;V_2=${latexDecimal(V2d)}\\,${uV}`,
    `n=${latexDecimal(mol1)}\\,\\text{mol}=${latexDecimal(mol2)}\\,\\text{mol}`,
    `${sym}=${latexDecimal(valueVol)}\\,${uV}`,
  ].join(";\\;")

  return calcOk({
    value: valueVol,
    unit: volUnit,
    label: unknown === "V1" ? "V1 (initial volume)" : "V2 (final volume)",
    formulaLine,
    latexFormula,
    warnings: [],
  })
}
