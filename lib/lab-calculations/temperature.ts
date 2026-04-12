import { calcError, calcOk, type CalculationResult } from "./types"
import { roundToSigFigs } from "./units"
import { latexDecimal } from "./latex-format"

export type TempInputUnit = "C" | "F" | "K"

function cFromF(f: number): number {
  return ((f - 32) * 5) / 9
}

function fFromC(c: number): number {
  return (c * 9) / 5 + 32
}

function kFromC(c: number): number {
  return c + 273.15
}

function cFromK(k: number): number {
  return k - 273.15
}

/** Convert one temperature to all three scales; primary value is kelvin. */
export function temperatureTriple(value: number, unit: TempInputUnit): CalculationResult {
  if (!Number.isFinite(value)) {
    return calcError("Enter a valid number.")
  }

  let c: number
  if (unit === "C") {
    c = value
  } else if (unit === "F") {
    c = cFromF(value)
  } else {
    c = cFromK(value)
  }

  const f = fFromC(c)
  const k = kFromC(c)

  return calcOk({
    value: roundToSigFigs(k, 4),
    unit: "K",
    label: "Temperature",
    formulaLine: `${roundToSigFigs(c, 4)} °C = ${roundToSigFigs(f, 4)} °F = ${roundToSigFigs(k, 4)} K`,
    latexFormula: `T=${latexDecimal(roundToSigFigs(k, 4))}\\,\\text{K}=${latexDecimal(roundToSigFigs(c, 4))}\\,\\text{°C}=${latexDecimal(roundToSigFigs(f, 4))}\\,\\text{°F}`,
    warnings: [],
  })
}
