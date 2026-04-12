import type { CalculationSuccess } from "@/lib/lab-calculations"

export type CalculatorModeId =
  | "numericKeypad"
  | "numericSci"
  | "molarity"
  | "molarityMassVol"
  | "molesFromMass"
  | "massFromMoles"
  | "dilution"
  | "stockDilution"
  | "hhBuffer"
  | "idealGas"
  | "beerLambert"
  | "phIon"
  | "temperature"

/** Emitted by mode panels when inputs or computed result change. */
export type CalculatorResultUpdate = {
  text: string | null
  latex: string | null
  error: string | null
}

export type CalculatorResultCallback = (update: CalculatorResultUpdate) => void

export function formatResultForNote(r: CalculationSuccess): string {
  const u = r.unit.trim()
  const warn =
    r.warnings.length > 0 ? `\n\nNote: ${r.warnings.join(" ")}` : ""
  return `${r.label}: ${r.value}${u ? ` ${u}` : ""}\n${r.formulaLine}${warn}`
}

/** Numeric keypad / scientific: show the worked calculation before the labeled result. */
export function formatNumericCalculatorNote(r: CalculationSuccess): string {
  const u = r.unit.trim()
  const warn =
    r.warnings.length > 0 ? `\n\nNote: ${r.warnings.join(" ")}` : ""
  return `${r.formulaLine}\n\n${r.label}: ${r.value}${u ? ` ${u}` : ""}${warn}`
}
