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

const UNARY_ROWS: { id: UnarySciOp; label: string }[][] = [
  [
    { id: "log10", label: "log" },
    { id: "ln", label: "ln" },
    { id: "log2", label: "log₂" },
    { id: "sqrt", label: "√" },
  ],
  [
    { id: "sq", label: "x²" },
    { id: "inv", label: "1/x" },
    { id: "sin", label: "sin" },
    { id: "cos", label: "cos" },
  ],
  [
    { id: "tan", label: "tan" },
    { id: "exp", label: "eˣ" },
    { id: "exp10", label: "10ˣ" },
    { id: "abs", label: "|x|" },
  ],
  [
    { id: "asin", label: "arcsin" },
    { id: "acos", label: "arccos" },
    { id: "atan", label: "arctan" },
    { id: "cbrt", label: "∛" },
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
      onResultChange({ text: null, latex: null, error: r.error })
      dispatch({ type: "mathError" })
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
  const sciBtn = "h-8 min-w-0 rounded-md px-1 text-[11px] font-medium tabular-nums"

  return (
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
          "mb-2 flex min-h-[2.5rem] items-center justify-end rounded-md border border-border/80 bg-muted/40 px-2 py-1.5",
          state.hasError && "border-destructive/50 bg-destructive/10"
        )}
      >
        <span className="max-w-full truncate font-mono text-lg tabular-nums tracking-tight">
          {state.display}
        </span>
      </div>

      {scientific && (
        <div className="mb-2 space-y-1 rounded-md border border-border/50 bg-muted/15 p-1.5">
          <p className="px-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
            Scientific (applies to value on screen)
          </p>
          {UNARY_ROWS.map((row, i) => (
            <div key={i} className="grid grid-cols-4 gap-1">
              {row.map((u) => (
                <Button
                  key={u.id}
                  type="button"
                  variant="secondary"
                  className={sciBtn}
                  onClick={() => unaryPress(u.id, u.label)}
                >
                  {u.label}
                </Button>
              ))}
            </div>
          ))}
          <div className="grid grid-cols-2 gap-1 pt-0.5">
            <Button
              type="button"
              variant="outline"
              className={cn(sciBtn, state.pendingOp === "pow" && "ring-1 ring-ring")}
              onClick={() => send({ type: "op", op: "pow" })}
            >
              xʸ — then exponent, =
            </Button>
            <Button
              type="button"
              variant="outline"
              className={cn(sciBtn, state.pendingOp === "logBase" && "ring-1 ring-ring")}
              onClick={() => send({ type: "op", op: "logBase" })}
            >
              log_x(y) — base, then arg, =
            </Button>
          </div>
          <p className="px-0.5 text-[9px] leading-snug text-muted-foreground">
            Trig uses radians. For xʸ and log_x(y), use like + − × ÷: enter base, tap op, enter second number, =.
          </p>
        </div>
      )}

      <div className="grid grid-cols-4 gap-1">
        <Button type="button" variant="secondary" className={keyBtn} onClick={() => send({ type: "clear" })}>
          AC
        </Button>
        <Button type="button" variant="secondary" className={keyBtn} onClick={() => send({ type: "backspace" })}>
          ⌫
        </Button>
        <Button type="button" variant="secondary" className={keyBtn} onClick={() => send({ type: "sign" })}>
          ±
        </Button>
        <Button
          type="button"
          variant="secondary"
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
          className={cn(keyBtn, state.pendingOp === "add" && "ring-1 ring-ring")}
          onClick={() => send({ type: "op", op: "add" })}
        >
          {OP_LABEL.add}
        </Button>

        <Button type="button" variant="outline" className={cn(keyBtn, "col-span-2")} onClick={() => send({ type: "digit", digit: "0" })}>
          0
        </Button>
        <Button type="button" variant="outline" className={keyBtn} onClick={() => send({ type: "dot" })}>
          .
        </Button>
        <Button type="button" className={keyBtn} onClick={() => send({ type: "equals" })}>
          =
        </Button>
      </div>

      <p className="mt-2 text-[10px] leading-snug text-muted-foreground">
        Keyboard: digits, + − * /, Enter or =, Esc clears, Backspace.
        {scientific ? " Scientific buttons apply to the current display value." : ""}
      </p>
    </div>
  )
}
