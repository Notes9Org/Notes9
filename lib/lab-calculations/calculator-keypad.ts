import { roundToSigFigs } from "./units"

export type KeypadBinaryOp = "add" | "sub" | "mul" | "div" | "pow" | "logBase"

export type KeypadState = {
  display: string
  accumulator: number | null
  pendingOp: KeypadBinaryOp | null
  /** After operator or equals, next digit replaces the display. */
  replaceEntry: boolean
  hasError: boolean
  /** Last completed calculation line, e.g. "5 + 3 = 8" (shown in result area). */
  lastTape: string | null
  /** LaTeX for last unary / binary result (insert as math). */
  lastLatex: string | null
  /** Short lines describing keys pressed (newest at end), for the result panel. */
  pressLog: string[]
}

export type KeypadAction =
  | { type: "digit"; digit: string }
  | { type: "dot" }
  | { type: "op"; op: KeypadBinaryOp }
  | { type: "equals" }
  | { type: "clear" }
  | { type: "backspace" }
  | { type: "sign" }
  /** Unary scientific fn applied in UI; carries formatted display + formula + LaTeX. */
  | { type: "setComputed"; display: string; lastTape: string; latex: string; pressLabel: string }
  /** Invalid domain (e.g. log of negative). */
  | { type: "mathError" }

const MAX_ENTRY_LEN = 16
const MAX_PRESS_LOG = 36

function pushPress(log: string[] | undefined, line: string): string[] {
  return [...(log ?? []), line].slice(-MAX_PRESS_LOG)
}

export function initialKeypadState(): KeypadState {
  return {
    display: "0",
    accumulator: null,
    pendingOp: null,
    replaceEntry: false,
    hasError: false,
    lastTape: null,
    lastLatex: null,
    pressLog: [],
  }
}

function opPressCaption(op: KeypadBinaryOp): string {
  switch (op) {
    case "add":
      return "+ (add)"
    case "sub":
      return "− (subtract)"
    case "mul":
      return "× (multiply)"
    case "div":
      return "÷ (divide)"
    case "pow":
      return "xʸ (power)"
    case "logBase":
      return "log_x(y) (log with base)"
    default:
      return String(op)
  }
}

/** Human-readable description of the current expression (what is being built). */
export function getKeypadWorkingSummary(state: KeypadState, scientificMode = false): string {
  if (state.hasError) return "—"
  const raw = state.display
  if (state.accumulator !== null && state.pendingOp !== null) {
    const fa = formatKeypadNumber(state.accumulator)
    if (state.pendingOp === "logBase") {
      if (state.replaceEntry) {
        return `Log base ${fa} — enter the argument next, then =`
      }
      return `log(${raw}) ÷ log(${fa})   (meaning: log base ${fa} of ${raw})`
    }
    if (state.pendingOp === "pow") {
      if (state.replaceEntry) {
        return `${fa} ^ …   (enter exponent, then =)`
      }
      return `${fa} ^ ${raw}`
    }
    const sym =
      state.pendingOp === "add"
        ? "+"
        : state.pendingOp === "sub"
          ? "−"
          : state.pendingOp === "mul"
            ? "×"
            : "÷"
    if (state.replaceEntry) {
      return `${fa} ${sym} …   (enter next number)`
    }
    return `${fa} ${sym} ${raw}`
  }
  if (raw === "0" && state.lastTape === null && state.pressLog.length === 0) {
    return scientificMode
      ? "Start by entering digits, or use a scientific key above."
      : "Start by entering digits and operators."
  }
  return `Current entry: ${raw}`
}

function applyBinary(a: number, op: KeypadBinaryOp, b: number): number {
  switch (op) {
    case "add":
      return a + b
    case "sub":
      return a - b
    case "mul":
      return a * b
    case "div":
      return a / b
    case "pow":
      return a ** b
    case "logBase":
      if (a <= 0 || a === 1) return NaN
      if (b <= 0) return NaN
      return Math.log(b) / Math.log(a)
    default:
      return NaN
  }
}

function tapeBinaryLabel(op: KeypadBinaryOp, a: number, b: number): string {
  const fa = formatKeypadNumber(a)
  const fb = formatKeypadNumber(b)
  switch (op) {
    case "add":
      return `${fa} + ${fb}`
    case "sub":
      return `${fa} − ${fb}`
    case "mul":
      return `${fa} × ${fb}`
    case "div":
      return `${fa} ÷ ${fb}`
    case "pow":
      return `${fa} ^ ${fb}`
    case "logBase":
      return `log(${fb}) / log(${fa})`
    default:
      return `${fa} ? ${fb}`
  }
}

export function formatKeypadNumber(n: number): string {
  if (!Number.isFinite(n)) return "Error"
  const rounded = roundToSigFigs(n, 14)
  if (Math.abs(rounded) >= 1e16 || (Math.abs(rounded) < 1e-12 && rounded !== 0)) {
    return rounded.toExponential(8)
  }
  const s = String(rounded)
  return s
}

function entryLength(display: string): number {
  return display.replace(/^-/, "").replace(".", "").length
}

function normalizeDigitAppend(display: string, digit: string, replaceEntry: boolean): string {
  if (replaceEntry) {
    if (digit === "0") return "0"
    return digit
  }
  if (display === "-0" && digit !== "0") return `-${digit}`
  if (display === "0" && digit !== "0") return digit
  if (display === "0" || display === "-0") {
    return digit === "0" ? display : display.startsWith("-") ? `-${digit}` : digit
  }
  if (entryLength(display) >= MAX_ENTRY_LEN) return display
  return display + digit
}

function keypadReducerImpl(state: KeypadState, action: KeypadAction): KeypadState {
  if (state.hasError) {
    if (action.type === "clear" || action.type === "backspace") {
      return initialKeypadState()
    }
    if (action.type === "digit" || action.type === "dot" || action.type === "sign") {
      return keypadReducerImpl(initialKeypadState(), action)
    }
    return initialKeypadState()
  }

  switch (action.type) {
    case "clear":
      return initialKeypadState()

    case "backspace": {
      if (state.replaceEntry) return state
      const log = pushPress(state.pressLog, "⌫ Backspace")
      if (state.display.length <= 1 || (state.display.startsWith("-") && state.display.length === 2)) {
        return { ...state, display: "0", pressLog: log }
      }
      return { ...state, display: state.display.slice(0, -1), pressLog: log }
    }

    case "sign": {
      const log = pushPress(state.pressLog, "± (change sign)")
      if (state.replaceEntry) {
        return { ...state, display: "-0", replaceEntry: false, pressLog: log }
      }
      if (state.display === "0") return { ...state, display: "-0", pressLog: log }
      if (state.display === "-0") return { ...state, display: "0", pressLog: log }
      if (state.display.startsWith("-")) {
        return { ...state, display: state.display.slice(1), pressLog: log }
      }
      return { ...state, display: `-${state.display}`, pressLog: log }
    }

    case "dot": {
      let next = state.display
      let replace = state.replaceEntry
      if (replace) {
        next = "0."
        replace = false
      } else if (!next.includes(".")) {
        if (entryLength(next) >= MAX_ENTRY_LEN) return state
        next = next + "."
      } else {
        return state
      }
      return {
        ...state,
        display: next,
        replaceEntry: replace,
        pressLog: pushPress(state.pressLog, ". (decimal point)"),
      }
    }

    case "digit": {
      const d = action.digit
      if (!/^[0-9]$/.test(d)) return state
      const next = normalizeDigitAppend(state.display, d, state.replaceEntry)
      return {
        ...state,
        display: next,
        replaceEntry: false,
        hasError: false,
        pressLog: pushPress(state.pressLog, `Number key “${d}” → entry ${next}`),
      }
    }

    case "op": {
      const input = parseFloat(state.display)
      const logOp = pushPress(state.pressLog, `Operation: ${opPressCaption(action.op)}`)
      if (!Number.isFinite(input)) {
        return { ...initialKeypadState(), display: "Error", hasError: true, pressLog: pushPress(logOp, "✗ Invalid number") }
      }

      let acc = state.accumulator
      let nextDisplay = state.display
      let nextTape = state.lastTape
      const nextReplace = true

      if (acc !== null && state.pendingOp !== null && !state.replaceEntry) {
        if (state.pendingOp === "div" && input === 0) {
          return {
            ...initialKeypadState(),
            display: "Error",
            hasError: true,
            pressLog: pushPress(logOp, "✗ Division by zero"),
          }
        }
        const result = applyBinary(acc, state.pendingOp, input)
        if (!Number.isFinite(result)) {
          return { ...initialKeypadState(), display: "Error", hasError: true, pressLog: pushPress(logOp, "✗ Invalid result") }
        }
        nextDisplay = formatKeypadNumber(result)
        nextTape = `${tapeBinaryLabel(state.pendingOp, acc, input)} = ${formatKeypadNumber(result)}`
        acc = result
      } else if (acc === null) {
        acc = input
      }

      return {
        ...state,
        display: nextDisplay,
        accumulator: acc,
        pendingOp: action.op,
        replaceEntry: nextReplace,
        hasError: false,
        lastTape: nextTape,
        lastLatex: null,
        pressLog: logOp,
      }
    }

    case "equals": {
      if (state.pendingOp === null || state.accumulator === null) {
        return { ...state, replaceEntry: true }
      }
      const logEq = pushPress(state.pressLog, "= (equals / calculate)")
      const right = parseFloat(state.display)
      if (!Number.isFinite(right)) {
        return { ...initialKeypadState(), display: "Error", hasError: true, pressLog: pushPress(logEq, "✗ Invalid number") }
      }
      if (state.pendingOp === "div" && right === 0) {
        return { ...initialKeypadState(), display: "Error", hasError: true, pressLog: pushPress(logEq, "✗ Division by zero") }
      }
      const result = applyBinary(state.accumulator, state.pendingOp, right)
      if (!Number.isFinite(result)) {
        return { ...initialKeypadState(), display: "Error", hasError: true, pressLog: pushPress(logEq, "✗ Invalid result") }
      }
      const tape = `${tapeBinaryLabel(state.pendingOp, state.accumulator, right)} = ${formatKeypadNumber(result)}`
      return {
        display: formatKeypadNumber(result),
        accumulator: null,
        pendingOp: null,
        replaceEntry: true,
        hasError: false,
        lastTape: tape,
        lastLatex: null,
        pressLog: logEq,
      }
    }

    case "setComputed": {
      return {
        ...state,
        display: action.display,
        lastTape: action.lastTape,
        lastLatex: action.latex,
        accumulator: null,
        pendingOp: null,
        replaceEntry: true,
        hasError: false,
        pressLog: pushPress(state.pressLog, `Scientific: ${action.pressLabel}`),
      }
    }

    case "mathError": {
      return {
        ...initialKeypadState(),
        display: "Error",
        hasError: true,
        pressLog: pushPress(state.pressLog, "✗ Scientific: invalid for this value"),
      }
    }

    default:
      return state
  }
}

export function keypadReducer(state: KeypadState, action: KeypadAction): KeypadState {
  return keypadReducerImpl(state, action)
}
