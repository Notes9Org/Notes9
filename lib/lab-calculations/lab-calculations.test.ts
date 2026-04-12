import { describe, expect, it } from "vitest"
import { latexDecimal } from "./latex-format"
import { keypadReducer, initialKeypadState } from "./calculator-keypad"
import { resolveMolecularWeightInput } from "./molecular-weight-data"
import { molarityFromMolesVolume } from "./molarity"
import { molesFromMass, massFromMoles } from "./moles-mass"
import { solveDilution } from "./dilution"

describe("latexDecimal", () => {
  it("formats plain decimals without e notation", () => {
    expect(latexDecimal(0.5)).toBe("0.5")
    expect(latexDecimal(1)).toBe("1")
  })

  it("uses times-ten form for tiny magnitudes (no JS scientific notation)", () => {
    const s = latexDecimal(2e-8)
    expect(s).toContain("\\times10^{")
    expect(s).not.toMatch(/[0-9]e[-+]?[0-9]/i)
  })
})

describe("molarityFromMolesVolume", () => {
  it("computes 1 M for 1 mol in 1 L", () => {
    const r = molarityFromMolesVolume(1, "mol", 1, "L")
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value).toBeCloseTo(1, 5)
      expect(r.latexFormula).toContain("\\frac{")
      expect(r.latexFormula).toContain("\\mathrm{mol}\\cdot\\mathrm{L}^{-1}")
      expect(r.latexFormula).not.toMatch(/[0-9]e[-+]?[0-9]/i)
    }
  })

  it("computes 0.001 M for 1 mmol in 1 L", () => {
    const r = molarityFromMolesVolume(1, "mmol", 1, "L")
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBeCloseTo(0.001, 6)
  })

  it("rejects zero volume", () => {
    const r = molarityFromMolesVolume(1, "mol", 0, "L")
    expect(r.ok).toBe(false)
  })
})

describe("molesFromMass", () => {
  it("computes 1 mol for 18 g water (MW 18)", () => {
    const r = molesFromMass(18, "g", 18)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBeCloseTo(1, 5)
  })

  it("rejects negative mass", () => {
    const r = molesFromMass(-1, "g", 18)
    expect(r.ok).toBe(false)
  })
})

describe("massFromMoles", () => {
  it("computes 18 g for 1 mol × 18 g/mol", () => {
    const r = massFromMoles(1, "mol", 18, "g")
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBeCloseTo(18, 5)
  })
})

describe("solveDilution", () => {
  it("solves V2 from C1,V1,C2", () => {
    const r = solveDilution({
      C1: 1,
      V1: 1,
      C2: 0.5,
      concUnit: "M",
      volUnit: "L",
      unknown: "V2",
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBeCloseTo(2, 5)
  })

  it("solves C2 from C1,V1,V2", () => {
    const r = solveDilution({
      C1: 2,
      V1: 1,
      V2: 2,
      concUnit: "M",
      volUnit: "L",
      unknown: "C2",
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBeCloseTo(1, 5)
  })

  it("rejects when not exactly three inputs", () => {
    const r = solveDilution({
      C1: 1,
      V1: 1,
      C2: 1,
      V2: 1,
      concUnit: "M",
      volUnit: "L",
      unknown: "C1",
    })
    expect(r.ok).toBe(false)
  })
})

describe("resolveMolecularWeightInput", () => {
  it("returns empty for blank input", () => {
    expect(resolveMolecularWeightInput("")).toEqual({ ok: "empty" })
    expect(resolveMolecularWeightInput("  ")).toEqual({ ok: "empty" })
  })

  it("parses positive numeric MW", () => {
    const r = resolveMolecularWeightInput("58.44")
    expect(r).toEqual({ ok: true, mw: 58.44, source: "numeric" })
  })

  it("resolves compound by name or alias", () => {
    const r1 = resolveMolecularWeightInput("NaCl")
    expect(r1.ok).toBe(true)
    if (r1.ok) {
      expect(r1.source).toBe("compound")
      expect(r1.mw).toBeCloseTo(58.44, 4)
      expect(r1.compoundName).toBe("Sodium chloride")
    }
    const r2 = resolveMolecularWeightInput("nacl")
    expect(r2.ok).toBe(true)
    if (r2.ok) expect(r2.mw).toBeCloseTo(58.44, 4)
  })

  it("rejects unknown strings", () => {
    const r = resolveMolecularWeightInput("notachemical")
    expect(r.ok).toBe(false)
  })
})

function pressDigits(s: string, state = initialKeypadState()) {
  let st = state
  for (const ch of s) {
    if (ch >= "0" && ch <= "9") st = keypadReducer(st, { type: "digit", digit: ch })
    else if (ch === ".") st = keypadReducer(st, { type: "dot" })
    else if (ch === "+") st = keypadReducer(st, { type: "op", op: "add" })
    else if (ch === "-") st = keypadReducer(st, { type: "op", op: "sub" })
    else if (ch === "*") st = keypadReducer(st, { type: "op", op: "mul" })
    else if (ch === "/") st = keypadReducer(st, { type: "op", op: "div" })
    else if (ch === "=") st = keypadReducer(st, { type: "equals" })
  }
  return st
}

describe("keypadReducer", () => {
  it("chains 2 + 3 = 5", () => {
    const st = pressDigits("2+3=")
    expect(st.display).toMatch(/^5(\.|$)/)
    expect(st.hasError).toBe(false)
    expect(st.lastTape).toContain("2")
    expect(st.lastTape).toContain("3")
    expect(st.lastTape).toContain("5")
  })

  it("computes 6 / 2 = 3", () => {
    const st = pressDigits("6/2=")
    expect(parseFloat(st.display)).toBeCloseTo(3, 8)
  })

  it("errors on division by zero", () => {
    const st = pressDigits("5/0=")
    expect(st.hasError).toBe(true)
    expect(st.display).toBe("Error")
  })

  it("clears error with AC", () => {
    let st = pressDigits("1/0=")
    expect(st.hasError).toBe(true)
    st = keypadReducer(st, { type: "clear" })
    expect(st).toEqual(initialKeypadState())
  })
})
