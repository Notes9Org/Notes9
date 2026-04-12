import { calcError, calcOk, type CalculationResult } from "./types"
import { roundToSigFigs } from "./units"
import { latexDecimal } from "./latex-format"

export type UnarySciOp =
  | "log10"
  | "ln"
  | "log2"
  | "sqrt"
  | "cbrt"
  | "exp"
  | "exp10"
  | "inv"
  | "abs"
  | "sq"
  | "sin"
  | "cos"
  | "tan"
  | "asin"
  | "acos"
  | "atan"

export type BinarySciOp = "add" | "sub" | "mul" | "div" | "pow" | "log"

function unaryResult(
  label: string,
  formulaLine: string,
  latexFormula: string,
  y: number
): CalculationResult {
  return calcOk({
    value: roundToSigFigs(y, 10),
    unit: "",
    label,
    formulaLine,
    latexFormula,
    warnings: [],
  })
}

export function unaryScientific(op: UnarySciOp, x: number): CalculationResult {
  if (!Number.isFinite(x)) return calcError("Enter a valid number.")

  const lx = latexDecimal(x)

  switch (op) {
    case "log10":
      if (x <= 0) return calcError("log₁₀ needs x > 0.")
      return unaryResult(
        "Result",
        `log₁₀(${x}) = ${roundToSigFigs(Math.log10(x), 10)}`,
        `\\log_{10}\\left(${lx}\\right)=${latexDecimal(roundToSigFigs(Math.log10(x), 10))}`,
        Math.log10(x)
      )
    case "ln":
      if (x <= 0) return calcError("ln needs x > 0.")
      return unaryResult(
        "Result",
        `ln(${x}) = ${roundToSigFigs(Math.log(x), 10)}`,
        `\\ln\\left(${lx}\\right)=${latexDecimal(roundToSigFigs(Math.log(x), 10))}`,
        Math.log(x)
      )
    case "log2":
      if (x <= 0) return calcError("log₂ needs x > 0.")
      return unaryResult(
        "Result",
        `log₂(${x}) = ${roundToSigFigs(Math.log2(x), 10)}`,
        `\\log_{2}\\left(${lx}\\right)=${latexDecimal(roundToSigFigs(Math.log2(x), 10))}`,
        Math.log2(x)
      )
    case "sqrt":
      if (x < 0) return calcError("√ needs x ≥ 0.")
      return unaryResult(
        "Result",
        `√(${x}) = ${roundToSigFigs(Math.sqrt(x), 10)}`,
        `\\sqrt{${lx}}=${latexDecimal(roundToSigFigs(Math.sqrt(x), 10))}`,
        Math.sqrt(x)
      )
    case "cbrt":
      return unaryResult(
        "Result",
        `∛(${x}) = ${roundToSigFigs(Math.cbrt(x), 10)}`,
        `\\sqrt[3]{${lx}}=${latexDecimal(roundToSigFigs(Math.cbrt(x), 10))}`,
        Math.cbrt(x)
      )
    case "exp":
      return unaryResult(
        "Result",
        `e^(${x}) = ${roundToSigFigs(Math.exp(x), 10)}`,
        `e^{${lx}}=${latexDecimal(roundToSigFigs(Math.exp(x), 10))}`,
        Math.exp(x)
      )
    case "exp10":
      return unaryResult(
        "Result",
        `10^(${x}) = ${roundToSigFigs(10 ** x, 10)}`,
        `10^{${lx}}=${latexDecimal(roundToSigFigs(10 ** x, 10))}`,
        10 ** x
      )
    case "inv":
      if (x === 0) return calcError("1/x: x cannot be 0.")
      return unaryResult(
        "Result",
        `1/(${x}) = ${roundToSigFigs(1 / x, 10)}`,
        `\\frac{1}{${lx}}=${latexDecimal(roundToSigFigs(1 / x, 10))}`,
        1 / x
      )
    case "abs":
      return unaryResult(
        "Result",
        `|${x}| = ${roundToSigFigs(Math.abs(x), 10)}`,
        `\\left|${lx}\\right|=${latexDecimal(roundToSigFigs(Math.abs(x), 10))}`,
        Math.abs(x)
      )
    case "sq":
      return unaryResult(
        "Result",
        `(${x})² = ${roundToSigFigs(x * x, 10)}`,
        `${lx}^{2}=${latexDecimal(roundToSigFigs(x * x, 10))}`,
        x * x
      )
    case "sin":
      return unaryResult(
        "Result",
        `sin(${x}) = ${roundToSigFigs(Math.sin(x), 10)} (x rad)`,
        `\\sin\\left(${lx}\\right)=${latexDecimal(roundToSigFigs(Math.sin(x), 10))}`,
        Math.sin(x)
      )
    case "cos":
      return unaryResult(
        "Result",
        `cos(${x}) = ${roundToSigFigs(Math.cos(x), 10)} (x rad)`,
        `\\cos\\left(${lx}\\right)=${latexDecimal(roundToSigFigs(Math.cos(x), 10))}`,
        Math.cos(x)
      )
    case "tan":
      return unaryResult(
        "Result",
        `tan(${x}) = ${roundToSigFigs(Math.tan(x), 10)} (x rad)`,
        `\\tan\\left(${lx}\\right)=${latexDecimal(roundToSigFigs(Math.tan(x), 10))}`,
        Math.tan(x)
      )
    case "asin":
      if (x < -1 || x > 1) return calcError("arcsin needs x in [−1, 1].")
      return unaryResult(
        "Result",
        `arcsin(${x}) = ${roundToSigFigs(Math.asin(x), 10)} rad`,
        `\\arcsin\\left(${lx}\\right)=${latexDecimal(roundToSigFigs(Math.asin(x), 10))}`,
        Math.asin(x)
      )
    case "acos":
      if (x < -1 || x > 1) return calcError("arccos needs x in [−1, 1].")
      return unaryResult(
        "Result",
        `arccos(${x}) = ${roundToSigFigs(Math.acos(x), 10)} rad`,
        `\\arccos\\left(${lx}\\right)=${latexDecimal(roundToSigFigs(Math.acos(x), 10))}`,
        Math.acos(x)
      )
    case "atan":
      return unaryResult(
        "Result",
        `arctan(${x}) = ${roundToSigFigs(Math.atan(x), 10)} rad`,
        `\\arctan\\left(${lx}\\right)=${latexDecimal(roundToSigFigs(Math.atan(x), 10))}`,
        Math.atan(x)
      )
    default:
      return calcError("Unknown operation.")
  }
}

export function binaryScientific(op: BinarySciOp, a: number, b: number): CalculationResult {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return calcError("Enter valid numbers.")

  const la = latexDecimal(a)
  const lb = latexDecimal(b)
  let y: number
  let formulaLine: string
  let latexFormula: string

  switch (op) {
    case "add":
      y = a + b
      formulaLine = `${a} + ${b} = ${roundToSigFigs(y, 10)}`
      latexFormula = `${la}+${lb}=${latexDecimal(roundToSigFigs(y, 10))}`
      break
    case "sub":
      y = a - b
      formulaLine = `${a} − ${b} = ${roundToSigFigs(y, 10)}`
      latexFormula = `${la}-${lb}=${latexDecimal(roundToSigFigs(y, 10))}`
      break
    case "mul":
      y = a * b
      formulaLine = `${a} × ${b} = ${roundToSigFigs(y, 10)}`
      latexFormula = `${la}\\times${lb}=${latexDecimal(roundToSigFigs(y, 10))}`
      break
    case "div":
      if (b === 0) return calcError("Division by zero.")
      y = a / b
      formulaLine = `${a} / ${b} = ${roundToSigFigs(y, 10)}`
      latexFormula = `\\frac{${la}}{${lb}}=${latexDecimal(roundToSigFigs(y, 10))}`
      break
    case "pow":
      y = a ** b
      formulaLine = `${a} ^ ${b} = ${roundToSigFigs(y, 10)}`
      latexFormula = `${la}^{${lb}}=${latexDecimal(roundToSigFigs(y, 10))}`
      break
    case "log":
      if (a <= 0 || a === 1) return calcError("Log base a: base must be > 0 and ≠ 1.")
      if (b <= 0) return calcError("Log base a: argument must be > 0.")
      y = Math.log(b) / Math.log(a)
      formulaLine = `log_${a}(${b}) = ${roundToSigFigs(y, 10)}`
      latexFormula = `\\log_{${la}}\\left(${lb}\\right)=${latexDecimal(roundToSigFigs(y, 10))}`
      break
    default:
      return calcError("Unknown operation.")
  }

  return calcOk({
    value: roundToSigFigs(y, 10),
    unit: "",
    label: "Result",
    formulaLine,
    latexFormula,
    warnings: [],
  })
}
