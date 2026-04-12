/**
 * Unit conversions for lab calculations. Internal storage uses SI base where possible:
 * amount: mol, volume: L, mass: g, concentration: mol/L.
 */

/** Round to `sigFigs` significant figures (minimum 1). */
export function roundToSigFigs(value: number, sigFigs: number = 4): number {
  if (!Number.isFinite(value) || value === 0) return value
  const n = Math.max(1, Math.min(15, Math.floor(sigFigs)))
  const sign = value < 0 ? -1 : 1
  const x = Math.abs(value)
  const magnitude = Math.floor(Math.log10(x))
  const scale = 10 ** (n - 1 - magnitude)
  return sign * Math.round(x * scale) / scale
}

export type MoleUnit = "mol" | "mmol" | "µmol"
export type VolumeUnit = "L" | "mL" | "µL"
export type MassUnit = "g" | "mg"
/** Concentration as mol/L equivalents */
export type ConcUnit = "M" | "mM" | "µM"

export function molesToMol(amount: number, unit: MoleUnit): number {
  switch (unit) {
    case "mol":
      return amount
    case "mmol":
      return amount * 1e-3
    case "µmol":
      return amount * 1e-6
    default:
      return amount
  }
}

export function molToMoles(amountMol: number, unit: MoleUnit): number {
  switch (unit) {
    case "mol":
      return amountMol
    case "mmol":
      return amountMol * 1e3
    case "µmol":
      return amountMol * 1e6
    default:
      return amountMol
  }
}

export function volumeToLiters(v: number, unit: VolumeUnit): number {
  switch (unit) {
    case "L":
      return v
    case "mL":
      return v * 1e-3
    case "µL":
      return v * 1e-6
    default:
      return v
  }
}

export function litersToVolume(l: number, unit: VolumeUnit): number {
  switch (unit) {
    case "L":
      return l
    case "mL":
      return l * 1e3
    case "µL":
      return l * 1e6
    default:
      return l
  }
}

export function massToGrams(m: number, unit: MassUnit): number {
  switch (unit) {
    case "g":
      return m
    case "mg":
      return m * 1e-3
    default:
      return m
  }
}

export function gramsToMass(g: number, unit: MassUnit): number {
  switch (unit) {
    case "g":
      return g
    case "mg":
      return g * 1e3
    default:
      return g
  }
}

/** Concentration → mol/L */
export function concToMolar(c: number, unit: ConcUnit): number {
  switch (unit) {
    case "M":
      return c
    case "mM":
      return c * 1e-3
    case "µM":
      return c * 1e-6
    default:
      return c
  }
}

/** mol/L → display concentration */
export function molarToConc(molPerL: number, unit: ConcUnit): number {
  switch (unit) {
    case "M":
      return molPerL
    case "mM":
      return molPerL * 1e3
    case "µM":
      return molPerL * 1e6
    default:
      return molPerL
  }
}

export function isPositiveFinite(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0
}

export function isNonNegativeFinite(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= 0
}
