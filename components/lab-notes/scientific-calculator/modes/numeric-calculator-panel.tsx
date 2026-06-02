"use client"

import { useEffect, useReducer, useRef } from "react"
import { calcOk } from "@/lib/lab-calculations/types"
import {
  formatKeypadNumber,
  getKeypadWorkingSummary,
  initialKeypadState,
  keypadReducer,
  type KeypadAction,
  type KeypadBinaryOp,
  type KeypadState,
} from "@/lib/lab-calculations/calculator-keypad"
import { unaryScientific, type UnarySciOp } from "@/lib/lab-calculations/numeric-scientific"
import { latexDecimal } from "@/lib/lab-calculations/latex-format"
import { roundToSigFigs } from "@/lib/lab-calculations/units"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { formatNumericCalculatorNote, type CalculatorResultCallback } from "../calc-types"

const OP_LABEL: Record<KeypadBinaryOp, string> = {
  add: "+",
  sub: "−",
  mul: "×",
  div: "÷",
  pow: "xʸ",
  logBase: "log_x(y)",
}

const OP_SYMBOL: Record<KeypadBinaryOp, string> = {
  add: "+",
  sub: "−",
  mul: "×",
  div: "÷",
  pow: "^",
  logBase: "log",
}

/** Compact running expression for the typing bar, e.g. "12 + 34 ×" or last "12 + 34 = 46". */
function getRunningExpression(state: KeypadState): string {
  if (state.hasError) return "Error"
  const cur = state.display
  if (state.accumulator !== null && state.pendingOp !== null) {
    const fa = formatKeypadNumber(state.accumulator)
    const sym = OP_SYMBOL[state.pendingOp]
    if (state.pendingOp === "logBase") {
      return state.replaceEntry ? `logbase=${fa} →` : `log_${fa}(${cur})`
    }
    if (state.pendingOp === "pow") {
      return state.replaceEntry ? `${fa} ^ …` : `${fa} ^ ${cur}`
    }
    return state.replaceEntry ? `${fa} ${sym}` : `${fa} ${sym} ${cur}`
  }
  if (state.lastTape) return state.lastTape
  return ""
}

const UNARY_ROWS: { id: UnarySciOp; label: string; tip: string }[][] = [
  [
    { id: "log10", label: "log", tip: "log₁₀" },
    { id: "ln", label: "ln", tip: "Natural log" },
    { id: "log2", label: "log₂", tip: "Log base 2" },
    { id: "sqrt", label: "√", tip: "Square root" },
  ],
  [
    { id: "sq", label: "x²", tip: "Square" },
    { id: "inv", label: "1/x", tip: "Reciprocal" },
    { id: "sin", label: "sin", tip: "Sine (radians)" },
    { id: "cos", label: "cos", tip: "Cosine (radians)" },
  ],
  [
    { id: "tan", label: "tan", tip: "Tangent (radians)" },
    { id: "exp", label: "eˣ", tip: "e to the power x" },
    { id: "exp10", label: "10ˣ", tip: "10 to the power x" },
    { id: "abs", label: "|x|", tip: "Absolute value" },
  ],
  [
    { id: "asin", label: "sin⁻¹", tip: "Arcsine (radians)" },
    { id: "acos", label: "cos⁻¹", tip: "Arccosine (radians)" },
    { id: "atan", label: "tan⁻¹", tip: "Arctangent (radians)" },
    { id: "cbrt", label: "∛", tip: "Cube root" },
  ],
]

function emitKeypadResult(
  state: KeypadState,
  scientificMode: boolean,
  onResultChange: CalculatorResultCallback
) {
  if (state.hasError) {
    onResultChange({
      text: null,
      latex: null,
      error: "Can’t compute that (e.g. ÷0 or invalid input).",
    })
    return
  }
  const v = parseFloat(state.display)
  if (!Number.isFinite(v)) {
    onResultChange({ text: null, latex: null, error: null })
    return
  }
  const rounded = roundToSigFigs(v, 12)
  const latexOut = state.lastLatex?.trim() || latexDecimal(rounded)

  const working = `What you’re building:\n${getKeypadWorkingSummary(state, scientificMode)}`

  const finished =
    state.lastTape != null ? `Last completed calculation:\n${state.lastTape}` : null

  const formulaParts = [working, finished].filter(Boolean) as string[]
  const formulaLine = formulaParts.join("\n\n")

  const r = calcOk({
    value: rounded,
    unit: "",
    label: "Result",
    formulaLine,
    latexFormula: latexOut,
    warnings: [],
  })
  onResultChange({ text: formatNumericCalculatorNote(r), latex: latexOut, error: null })
}

export function NumericCalculatorPanel({
  scientific,
  onResultChange,
}: {
  scientific: boolean
  onResultChange: CalculatorResultCallback
}) {
  const [state, dispatch] = useReducer(keypadReducer, null, initialKeypadState)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    rootRef.current?.focus()
  }, [])

  useEffect(() => {
    emitKeypadResult(state, scientific, onResultChange)
  }, [state, scientific, onResultChange])

  const send = (a: KeypadAction) => dispatch(a)

  const unaryPress = (op: UnarySciOp, label: string) => {
    const r = unaryScientific(op, parseFloat(state.display))
    if (!r.ok) {
      // Update reducer state first so any re-render triggered by the parent's
      // onResultChange observes the error state rather than stale values.
      dispatch({ type: "mathError" })
      onResultChange({ text: null, latex: null, error: r.error })
      return
    }
    dispatch({
      type: "setComputed",
      display: formatKeypadNumber(r.value),
      lastTape: r.formulaLine,
      latex: r.latexFormula,
      pressLabel: label,
    })
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    const k = e.key
    const numpadD = /^Numpad(\d)$/.exec(k)
    if (numpadD) {
      e.preventDefault()
      send({ type: "digit", digit: numpadD[1]! })
      return
    }
    if (k === "NumpadDecimal") {
      e.preventDefault()
      send({ type: "dot" })
      return
    }
    if (k === "NumpadAdd") {
      e.preventDefault()
      send({ type: "op", op: "add" })
      return
    }
    if (k === "NumpadSubtract") {
      e.preventDefault()
      send({ type: "op", op: "sub" })
      return
    }
    if (k === "NumpadMultiply") {
      e.preventDefault()
      send({ type: "op", op: "mul" })
      return
    }
    if (k === "NumpadDivide") {
      e.preventDefault()
      send({ type: "op", op: "div" })
      return
    }
    if (k === "NumpadEnter") {
      e.preventDefault()
      send({ type: "equals" })
      return
    }
    if (k >= "0" && k <= "9") {
      e.preventDefault()
      send({ type: "digit", digit: k })
      return
    }
    if (k === "." || k === ",") {
      e.preventDefault()
      send({ type: "dot" })
      return
    }
    if (k === "+") {
      e.preventDefault()
      send({ type: "op", op: "add" })
      return
    }
    if (k === "=") {
      e.preventDefault()
      send({ type: "equals" })
      return
    }
    if (k === "-") {
      e.preventDefault()
      send({ type: "op", op: "sub" })
      return
    }
    if (k === "*") {
      e.preventDefault()
      send({ type: "op", op: "mul" })
      return
    }
    if (k === "/") {
      e.preventDefault()
      send({ type: "op", op: "div" })
      return
    }
    if (k === "Enter") {
      e.preventDefault()
      send({ type: "equals" })
      return
    }
    if (k === "Backspace") {
      e.preventDefault()
      send({ type: "backspace" })
      return
    }
    if (k === "Escape") {
      e.preventDefault()
      send({ type: "clear" })
      return
    }
  }

  const keyBtn = "h-9 min-w-0 rounded-md text-sm font-medium tabular-nums"
  const sciBtn = "h-8 min-w-0 rounded-md px-1 text-micro font-medium tabular-nums"

  return (
    <TooltipProvider delayDuration={200}>
      <div
        ref={rootRef}
        tabIndex={0}
        role="application"
        aria-label={scientific ? "Scientific calculator keypad" : "Number calculator keypad"}
        className="outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        onKeyDown={onKeyDown}
      >
        <div
          className={cn(
            "mb-2 flex min-h-[3.25rem] flex-col items-stretch justify-end gap-0.5 rounded-md border border-border/80 bg-muted/40 px-2 py-1.5",
            state.hasError && "border-destructive/50 bg-destructive/10"
          )}
          aria-live="polite"
        >
          <span
            className={cn(
              "min-h-[0.875rem] truncate text-right font-mono text-2xs leading-tight tabular-nums",
              state.hasError ? "text-destructive/70" : "text-muted-foreground/70"
            )}
            aria-label="Current expression"
          >
            {getRunningExpression(state) || " "}
          </span>
          <span className="max-w-full truncate text-right font-mono text-lg tabular-nums tracking-tight">
            {state.display}
          </span>
        </div>

        {scientific && (
          <div className="mb-2 space-y-1 rounded-md border border-border/50 bg-muted/15 p-1.5">
            {UNARY_ROWS.map((row, i) => (
              <div key={i} className="grid grid-cols-4 gap-1">
                {row.map((u) => (
                  <Tooltip key={u.id}>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="secondary"
                        aria-label={u.tip}
                        className={sciBtn}
                        onClick={() => unaryPress(u.id, u.label)}
                      >
                        {u.label}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">{u.tip}</TooltipContent>
                  </Tooltip>
                ))}
              </div>
            ))}
            <div className="grid grid-cols-2 gap-1 pt-0.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    aria-label="x to the power y"
                    className={cn(sciBtn, state.pendingOp === "pow" && "ring-1 ring-ring")}
                    onClick={() => send({ type: "op", op: "pow" })}
                  >
                    xʸ
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Power: enter base, tap xʸ, enter exponent, =</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    aria-label="log base x of y"
                    className={cn(sciBtn, state.pendingOp === "logBase" && "ring-1 ring-ring")}
                    onClick={() => send({ type: "op", op: "logBase" })}
                  >
                    logₓy
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Log: enter base, tap logₓy, enter arg, =</TooltipContent>
              </Tooltip>
            </div>
          </div>
        )}

        <div className="grid grid-cols-4 gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="secondary" aria-label="All clear" className={keyBtn} onClick={() => send({ type: "clear" })}>
                AC
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Clear (Esc)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="secondary" aria-label="Backspace" className={keyBtn} onClick={() => send({ type: "backspace" })}>
                ⌫
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Backspace</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="secondary" aria-label="Toggle sign" className={keyBtn} onClick={() => send({ type: "sign" })}>
                ±
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Toggle sign</TooltipContent>
          </Tooltip>
          <Button
            type="button"
            variant="secondary"
            aria-label="Divide"
            className={cn(keyBtn, state.pendingOp === "div" && "ring-1 ring-ring")}
            onClick={() => send({ type: "op", op: "div" })}
          >
            {OP_LABEL.div}
          </Button>

          {(["7", "8", "9"] as const).map((d) => (
            <Button key={d} type="button" variant="outline" className={keyBtn} onClick={() => send({ type: "digit", digit: d })}>
              {d}
            </Button>
          ))}
          <Button
            type="button"
            variant="secondary"
            aria-label="Multiply"
            className={cn(keyBtn, state.pendingOp === "mul" && "ring-1 ring-ring")}
            onClick={() => send({ type: "op", op: "mul" })}
          >
            {OP_LABEL.mul}
          </Button>

          {(["4", "5", "6"] as const).map((d) => (
            <Button key={d} type="button" variant="outline" className={keyBtn} onClick={() => send({ type: "digit", digit: d })}>
              {d}
            </Button>
          ))}
          <Button
            type="button"
            variant="secondary"
            aria-label="Subtract"
            className={cn(keyBtn, state.pendingOp === "sub" && "ring-1 ring-ring")}
            onClick={() => send({ type: "op", op: "sub" })}
          >
            {OP_LABEL.sub}
          </Button>

          {(["1", "2", "3"] as const).map((d) => (
            <Button key={d} type="button" variant="outline" className={keyBtn} onClick={() => send({ type: "digit", digit: d })}>
              {d}
            </Button>
          ))}
          <Button
            type="button"
            variant="secondary"
            aria-label="Add"
            className={cn(keyBtn, state.pendingOp === "add" && "ring-1 ring-ring")}
            onClick={() => send({ type: "op", op: "add" })}
          >
            {OP_LABEL.add}
          </Button>

          <Button type="button" variant="outline" className={cn(keyBtn, "col-span-2")} onClick={() => send({ type: "digit", digit: "0" })}>
            0
          </Button>
          <Button type="button" variant="outline" aria-label="Decimal point" className={keyBtn} onClick={() => send({ type: "dot" })}>
            .
          </Button>
          <Button type="button" aria-label="Equals" className={keyBtn} onClick={() => send({ type: "equals" })}>
            =
          </Button>
        </div>
      </div>
    </TooltipProvider>
  )
}
