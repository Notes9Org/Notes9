import { calcError, calcOk, type CalculationResult } from "./types"
import {
  concToMolar,
  isPositiveFinite,
  litersToVolume,
  roundToSigFigs,
  volumeToLiters,
  type ConcUnit,
} from "./units"
import { latexConcUnitFragment, latexDecimal, latexVolUnitFragment } from "./latex-format"
import type { VolumeUnit } from "./units"

/**
 * Dilute stock to target: C_stock * V_stock = C_final * V_final (same concentration units).
 * Given C_stock, C_final, and desired final volume V_final, find volume of stock V_stock to add (then diluent = V_final − V_stock).
 */
export function volumeStockForTarget(
  cStock: number,
  cFinal: number,
  vFinal: number,
  concUnit: ConcUnit,
  volUnit: VolumeUnit
): CalculationResult {
  if (!isPositiveFinite(cStock) || !isPositiveFinite(cFinal) || !isPositiveFinite(vFinal)) {
    return calcError("C_stock, C_final, and V_final must be positive.")
  }
  if (cFinal > cStock) {
    return calcError("Final concentration cannot exceed stock concentration (cannot concentrate by dilution).")
  }

  const cS = concToMolar(cStock, concUnit)
  const cF = concToMolar(cFinal, concUnit)
  const vFL = volumeToLiters(vFinal, volUnit)

  const vStockL = (cF * vFL) / cS
  const diluentL = vFL - vStockL

  const vStockDisplay = litersToVolume(vStockL, volUnit)
  const diluentDisplay = litersToVolume(diluentL, volUnit)

  const vs = roundToSigFigs(vStockDisplay, 4)
  const vd = roundToSigFigs(diluentDisplay, 4)
  const vf = roundToSigFigs(vFinal, 4)

  return calcOk({
    value: vs,
    unit: volUnit,
    label: "V_stock to pipette",
    formulaLine: `V_stock = V_final × (C_final/C_stock) = ${vf} ${volUnit} × (${cFinal}/${cStock}) = ${vs} ${volUnit}\nDiluent ≈ ${vd} ${volUnit} (to reach ${vf} ${volUnit} total).`,
    latexFormula: `V_{\\mathrm{stock}}=\\frac{C_{\\mathrm{f}}}{C_{\\mathrm{stock}}}V_{\\mathrm{f}}=${latexDecimal(vs)}\\,${latexVolUnitFragment(volUnit)}`,
    warnings: ["Assumes volumes are additive; mix stock then bring to mark."],
  })
}
