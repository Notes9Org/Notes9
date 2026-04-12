import { calcError, calcOk, type CalculationResult } from "./types"
import { isPositiveFinite, roundToSigFigs } from "./units"
import { latexDecimal } from "./latex-format"

export type BeerLambertUnknown = "A" | "epsilon" | "l" | "c"

/** A = ε l c (A absorbance, ε L/(mol·cm), l cm, c mol/L). Solve one unknown from three knowns. */
export function beerLambertSolve(params: {
  A?: number
  epsilon?: number
  l?: number
  c?: number
  unknown: BeerLambertUnknown
}): CalculationResult {
  const { A, epsilon, l, c, unknown } = params
  const known = { A, epsilon, l, c }
  const keys: BeerLambertUnknown[] = ["A", "epsilon", "l", "c"]
  const missing = keys.filter((k) => known[k] === undefined || known[k] === null)
  const defined = keys.filter((k) => known[k] !== undefined && known[k] !== null)

  if (missing.length !== 1 || defined.length !== 3) {
    return calcError("Provide exactly three of A, ε (L/(mol·cm)), l (cm), c (mol/L).")
  }
  if (missing[0] !== unknown) {
    return calcError("The empty field must match the selected unknown.")
  }

  const pos = (x: number | undefined) => x === undefined || isPositiveFinite(x)
  const nonNeg = (x: number | undefined) => x === undefined || (Number.isFinite(x) && x >= 0)
  if (!nonNeg(A) || !pos(epsilon) || !pos(l) || !pos(c)) {
    return calcError("Known values: A ≥ 0; ε, l, c > 0 where given.")
  }

  let result: number
  let label: string
  let unit: string
  let formulaLine: string
  let latexFormula: string

  switch (unknown) {
    case "A": {
      if (!isPositiveFinite(epsilon!) || !isPositiveFinite(l!) || !isPositiveFinite(c!)) {
        return calcError("Invalid inputs for A.")
      }
      result = epsilon! * l! * c!
      label = "A (absorbance)"
      unit = ""
      formulaLine = `A = ε l c = (${epsilon})(${l})(${c}) = ${roundToSigFigs(result, 4)}`
      latexFormula = `A=\\varepsilon \\ell c=${latexDecimal(epsilon!)}\\times${latexDecimal(l!)}\\times${latexDecimal(c!)}=${latexDecimal(roundToSigFigs(result, 4))}`
      break
    }
    case "epsilon": {
      if (!isPositiveFinite(A!) || !isPositiveFinite(l!) || !isPositiveFinite(c!)) {
        return calcError("Invalid inputs for ε.")
      }
      result = A! / (l! * c!)
      label = "ε (molar absorptivity)"
      unit = "L/(mol·cm)"
      formulaLine = `ε = A/(l c) = ${A} / (${l} × ${c}) = ${roundToSigFigs(result, 4)} L/(mol·cm)`
      latexFormula = `\\varepsilon=\\frac{A}{\\ell c}=${latexDecimal(roundToSigFigs(result, 4))}\\,\\text{L/(mol·cm)}`
      break
    }
    case "l": {
      if (!isPositiveFinite(A!) || !isPositiveFinite(epsilon!) || !isPositiveFinite(c!)) {
        return calcError("Invalid inputs for l.")
      }
      result = A! / (epsilon! * c!)
      label = "l (path length)"
      unit = "cm"
      formulaLine = `l = A/(ε c) = ${roundToSigFigs(result, 4)} cm`
      latexFormula = `\\ell=\\frac{A}{\\varepsilon c}=${latexDecimal(roundToSigFigs(result, 4))}\\,\\text{cm}`
      break
    }
    case "c": {
      if (!isPositiveFinite(A!) || !isPositiveFinite(epsilon!) || !isPositiveFinite(l!)) {
        return calcError("Invalid inputs for c.")
      }
      result = A! / (epsilon! * l!)
      label = "c (concentration)"
      unit = "mol/L"
      formulaLine = `c = A/(ε l) = ${roundToSigFigs(result, 4)} mol/L`
      latexFormula = `c=\\frac{A}{\\varepsilon \\ell}=${latexDecimal(roundToSigFigs(result, 4))}\\,\\mathrm{mol}\\cdot\\mathrm{L}^{-1}`
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
    warnings: [],
  })
}
