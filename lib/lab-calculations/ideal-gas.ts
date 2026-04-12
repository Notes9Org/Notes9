import { calcError, calcOk, type CalculationResult } from "./types"
import { isPositiveFinite, roundToSigFigs } from "./units"
import { latexDecimal } from "./latex-format"

/** Ideal gas constant: L·atm/(mol·K) */
export const R_L_ATM = 0.082057

export type IdealGasUnknown = "P" | "V" | "n" | "T"

/**
 * PV = nRT with P in atm, V in L, n in mol, T in K, R = 0.082057 L·atm/(mol·K).
 * Provide exactly three of P, V, n, T; the fourth is solved.
 */
export function idealGasSolve(params: {
  P?: number
  V?: number
  n?: number
  T?: number
  unknown: IdealGasUnknown
}): CalculationResult {
  const { P, V, n, T, unknown } = params
  const known = { P, V, n, T }
  const keys: IdealGasUnknown[] = ["P", "V", "n", "T"]
  const missing = keys.filter((k) => known[k as keyof typeof known] === undefined || known[k as keyof typeof known] === null)
  const defined = keys.filter((k) => known[k as keyof typeof known] !== undefined && known[k as keyof typeof known] !== null)

  if (missing.length !== 1 || defined.length !== 3) {
    return calcError("Provide exactly three of P (atm), V (L), n (mol), T (K).")
  }
  if (missing[0] !== unknown) {
    return calcError("The empty field must match the selected unknown.")
  }

  const p = P
  const v = V
  const nmol = n
  const t = T

  const check = (name: string, x: number | undefined) => x === undefined || isPositiveFinite(x)
  if (!check("P", p) || !check("V", v) || !check("n", nmol) || !check("T", t)) {
    return calcError("Entered P, V, n, T must be positive where given.")
  }

  const R = R_L_ATM
  let result: number
  let label: string
  let unit: string
  let formulaLine: string
  let latexFormula: string

  switch (unknown) {
    case "P": {
      if (!isPositiveFinite(v!) || !isPositiveFinite(nmol!) || !isPositiveFinite(t!)) {
        return calcError("Invalid inputs for P.")
      }
      result = (nmol! * R * t!) / v!
      label = "P (pressure)"
      unit = "atm"
      formulaLine = `P = nRT/V = (${nmol} mol)(${R} L·atm/(mol·K))(${t} K) / ${v} L = ${roundToSigFigs(result, 4)} atm`
      latexFormula = `P=\\frac{nRT}{V}=\\frac{${latexDecimal(nmol!)}\\times${latexDecimal(R)}\\times${latexDecimal(t!)}}{${latexDecimal(v!)}}=${latexDecimal(roundToSigFigs(result, 4))}\\,\\text{atm}`
      break
    }
    case "V": {
      if (!isPositiveFinite(p!) || !isPositiveFinite(nmol!) || !isPositiveFinite(t!)) {
        return calcError("Invalid inputs for V.")
      }
      result = (nmol! * R * t!) / p!
      label = "V (volume)"
      unit = "L"
      formulaLine = `V = nRT/P = (${nmol} mol)(${R})(${t} K) / ${p} atm = ${roundToSigFigs(result, 4)} L`
      latexFormula = `V=\\frac{nRT}{P}=${latexDecimal(roundToSigFigs(result, 4))}\\,\\text{L}`
      break
    }
    case "n": {
      if (!isPositiveFinite(p!) || !isPositiveFinite(v!) || !isPositiveFinite(t!)) {
        return calcError("Invalid inputs for n.")
      }
      result = (p! * v!) / (R * t!)
      label = "n (amount)"
      unit = "mol"
      formulaLine = `n = PV/(RT) = (${p} atm)(${v} L) / ((${R})(${t} K)) = ${roundToSigFigs(result, 4)} mol`
      latexFormula = `n=\\frac{PV}{RT}=${latexDecimal(roundToSigFigs(result, 4))}\\,\\text{mol}`
      break
    }
    case "T": {
      if (!isPositiveFinite(p!) || !isPositiveFinite(v!) || !isPositiveFinite(nmol!)) {
        return calcError("Invalid inputs for T.")
      }
      result = (p! * v!) / (nmol! * R)
      label = "T (temperature)"
      unit = "K"
      formulaLine = `T = PV/(nR) = (${p} atm)(${v} L) / ((${nmol} mol)(${R})) = ${roundToSigFigs(result, 4)} K`
      latexFormula = `T=\\frac{PV}{nR}=${latexDecimal(roundToSigFigs(result, 4))}\\,\\text{K}`
      break
    }
    default:
      return calcError("Unknown variable.")
  }

  return calcOk({
    value: roundToSigFigs(result, 4),
    unit,
    label,
    formulaLine,
    latexFormula,
    warnings: ["R = 0.082057 L·atm/(mol·K); use atm, L, mol, K."],
  })
}
