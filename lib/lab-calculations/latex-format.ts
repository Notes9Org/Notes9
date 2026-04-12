/**
 * Format numbers and unit fragments for KaTeX inline math (TipTap Mathematics).
 * Avoids raw JS scientific notation ("e-7") in LaTeX strings, ambiguous nested \mathrm groups,
 * and uses \\frac / \\text patterns that parse reliably in inline mode.
 */

import type { ConcUnit, VolumeUnit } from "./units"

/** Plain decimal for already-scaled numbers (no `e` from JS). */
function decimalString(n: number): string {
  if (!Number.isFinite(n)) return "0"
  if (n === 0) return "0"
  const s = n.toFixed(14).replace(/\.?0+$/, "")
  return s === "-0" ? "0" : s
}

/**
 * Numeric value safe to embed in LaTeX math.
 * Very small/large magnitudes use `a\times10^{b}` (KaTeX-safe).
 */
export function latexDecimal(n: number): string {
  if (!Number.isFinite(n)) return "0"
  if (n === 0) return "0"
  const ax = Math.abs(n)
  if (ax < 1e-6 || ax >= 1e7) {
    const sign = n < 0 ? "-" : ""
    const exp = Math.floor(Math.log10(ax))
    const mant = ax / 10 ** exp
    return `${sign}${decimalString(mant)}\\times10^{${exp}}`
  }
  return decimalString(n)
}

/** Concentration unit for LaTeX (inline-math safe). */
export function latexConcUnitFragment(u: ConcUnit): string {
  if (u === "M") return "\\text{M}"
  if (u === "mM") return "\\text{mM}"
  return "\\mu\\text{M}"
}

/** Volume unit for LaTeX. */
export function latexVolUnitFragment(u: VolumeUnit): string {
  if (u === "L") return "\\text{L}"
  if (u === "mL") return "\\text{mL}"
  return "\\mu\\text{L}"
}
