"use client"

import { useEffect, useReducer, useRef, useState } from "react"
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
import { unaryScientific, type AngleUnit, type UnarySciOp } from "@/lib/lab-calculations/numeric-scientific"
import { latexDecimal } from "@/lib/lab-calculations/latex-format"
import { roundToSigFigs } from "@/lib/lab-calculations/units"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
    { id: "sin", label: "sin", tip: "Sine" },
    { id: "cos", label: "cos", tip: "Cosine" },
  ],
  [
    { id: "tan", label: "tan", tip: "Tangent" },
    { id: "exp", label: "eˣ", tip: "e to the power x" },
    { id: "exp10", label: "10ˣ", tip: "10 to the power x" },
    { id: "abs", label: "|x|", tip: "Absolute value" },
  ],
  [
    { id: "asin", label: "sin⁻¹", tip: "Arcsine" },
    { id: "acos", label: "cos⁻¹", tip: "Arccosine" },
    { id: "atan", label: "tan⁻¹", tip: "Arctangent" },
    { id: "cbrt", label: "∛", tip: "Cube root" },
  ],
]

const TRIG_OPS: ReadonlySet<UnarySciOp> = new Set(["sin", "cos", "tan", "asin", "acos", "atan"])

/** Lab-relevant constants; display strings stay parseFloat-safe. */
const CONSTANTS: { symbol: string; name: string; display: string; detail: string }[] = [
  { symbol: "π", name: "Pi", display: "3.14159265358979", detail: "3.14159…" },
  { symbol: "e", name: "Euler's number", display: "2.71828182845905", detail: "2.71828…" },
  { symbol: "Nₐ", name: "Avogadro constant", display: "6.02214076e23", detail: "6.022 × 10²³ mol⁻¹" },
  { symbol: "R", name: "Gas constant", display: "8.314462618", detail: "8.314 J·mol⁻¹·K⁻¹" },
  { symbol: "kB", name: "Boltzmann constant", display: "1.380649e-23", detail: "1.381 × 10⁻²³ J·K⁻¹" },
  { symbol: "F", name: "Faraday constant", display: "96485.33212", detail: "96 485 C·mol⁻¹" },
  { symbol: "h", name: "Planck constant", display: "6.62607015e-34", detail: "6.626 × 10⁻³⁴ J·s" },
  { symbol: "c", name: "Speed of light", display: "299792458", detail: "2.998 × 10⁸ m·s⁻¹" },
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
  const [angleUnit, setAngleUnit] = useState<AngleUnit>("rad")
  const [memory, setMemory] = useState<number | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    rootRef.current?.focus()
  }, [])

  useEffect(() => {
    emitKeypadResult(state, scientific, onResultChange)
  }, [state, scientific, onResultChange])

  const send = (a: KeypadAction) => dispatch(a)

  const unaryPress = (op: UnarySciOp, label: string) => {
    const r = unaryScientific(op, parseFloat(state.display), { angleUnit })
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

  const currentEntry = () => {
    const v = parseFloat(state.display)
    return Number.isFinite(v) ? v : null
  }

  const memoryAdd = (sign: 1 | -1) => {
    const v = currentEntry()
    if (v === null) return
    setMemory((m) => (m ?? 0) + sign * v)
  }

  const memoryRecall = () => {
    if (memory === null) return
    send({ type: "setValue", display: formatKeypadNumber(memory), pressLabel: "MR (memory recall)" })
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
    if (k === "%") {
      e.preventDefault()
      send({ type: "percent" })
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

  // Tactile key grammar: soft radius, quiet depth, spring-quick press scale.
  const keyBase =
    "h-10 min-w-0 rounded-lg text-sm font-medium tabular-nums transition-all duration-100 active:scale-[0.94] active:duration-75"
  const digitKey = cn(keyBase, "bg-background/70 shadow-xs hover:bg-background dark:bg-muted/40 dark:hover:bg-muted/60")
  const utilKey = cn(keyBase)
  const opKey = cn(
    keyBase,
    "bg-primary/10 text-primary hover:bg-primary/15 dark:bg-primary/15 dark:hover:bg-primary/25"
  )
  const sciKey =
    "h-8 min-w-0 rounded-lg px-1 text-micro font-medium tabular-nums transition-all duration-100 active:scale-[0.94] active:duration-75"
  const memKey =
    "h-6 min-w-0 rounded-md px-1.5 font-mono text-2xs font-medium text-muted-foreground transition-all duration-100 hover:bg-muted/60 hover:text-foreground active:scale-[0.94] disabled:opacity-40 disabled:pointer-events-none"

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
        {/* Display */}
        <div
          className={cn(
            "mb-2 flex min-h-[3.75rem] flex-col items-stretch justify-end gap-0.5 rounded-xl border border-border/70 bg-gradient-to-b from-muted/50 to-muted/20 px-3 py-2 shadow-[inset_0_1px_3px_rgba(0,0,0,0.05)]",
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
            {getRunningExpression(state) || " "}
          </span>
          <span className="max-w-full truncate text-right font-mono text-2xl font-medium tabular-nums tracking-tight">
            {state.display}
          </span>
        </div>

        {/* Memory row, MC / MR / M− / M+ with a live indicator */}
        <div className="mb-2 flex items-center justify-between gap-1">
          <div
            className={cn(
              "flex h-5 items-center rounded-md px-1.5 font-mono text-2xs tabular-nums transition-opacity",
              memory !== null
                ? "bg-primary/10 text-primary opacity-100"
                : "text-transparent opacity-0"
            )}
            aria-hidden={memory === null}
            title={memory !== null ? `Memory: ${formatKeypadNumber(memory)}` : undefined}
          >
            M {memory !== null ? formatKeypadNumber(memory) : ""}
          </div>
          <div className="flex items-center gap-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className={memKey} disabled={memory === null} onClick={() => setMemory(null)}>
                  MC
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">Memory clear</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className={memKey} disabled={memory === null} onClick={memoryRecall}>
                  MR
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">Memory recall</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className={memKey} onClick={() => memoryAdd(-1)}>
                  M−
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">Subtract entry from memory</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className={memKey} onClick={() => memoryAdd(1)}>
                  M+
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">Add entry to memory</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {scientific && (
          <div className="mb-2 space-y-1 rounded-xl border border-border/50 bg-muted/15 p-1.5">
            {/* Constants + angle unit */}
            <div className="flex items-center justify-between gap-1 pb-0.5">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 rounded-lg px-2 font-mono text-xs text-muted-foreground hover:text-foreground"
                  >
                    π e Nₐ…
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-60">
                  <DropdownMenuLabel className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                    Constants
                  </DropdownMenuLabel>
                  {CONSTANTS.map((c) => (
                    <DropdownMenuItem
                      key={c.symbol}
                      className="cursor-pointer gap-2.5"
                      onSelect={() =>
                        send({ type: "setValue", display: c.display, pressLabel: `${c.symbol} (${c.name})` })
                      }
                    >
                      <span className="w-6 shrink-0 text-center font-mono text-sm text-primary">{c.symbol}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs">{c.name}</span>
                        <span className="block truncate font-mono text-2xs text-muted-foreground">{c.detail}</span>
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* RAD / DEG segmented toggle for trig */}
              <div className="flex items-center rounded-lg bg-muted/50 p-0.5" role="group" aria-label="Angle unit">
                {(["rad", "deg"] as const).map((u) => (
                  <button
                    key={u}
                    type="button"
                    aria-pressed={angleUnit === u}
                    onClick={() => setAngleUnit(u)}
                    className={cn(
                      "h-6 rounded-md px-2 font-mono text-2xs font-medium uppercase transition-all duration-150",
                      angleUnit === u
                        ? "bg-background text-foreground shadow-sm ring-1 ring-black/[0.04] dark:ring-white/[0.06]"
                        : "text-muted-foreground/70 hover:text-foreground"
                    )}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>

            {UNARY_ROWS.map((row, i) => (
              <div key={i} className="grid grid-cols-4 gap-1">
                {row.map((u) => (
                  <Tooltip key={u.id}>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="secondary"
                        aria-label={u.tip}
                        className={sciKey}
                        onClick={() => unaryPress(u.id, u.label)}
                      >
                        {u.label}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      {u.tip}
                      {TRIG_OPS.has(u.id) ? ` (${angleUnit === "deg" ? "degrees" : "radians"})` : ""}
                    </TooltipContent>
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
                    className={cn(sciKey, state.pendingOp === "pow" && "ring-1 ring-ring")}
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
                    className={cn(sciKey, state.pendingOp === "logBase" && "ring-1 ring-ring")}
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
              <Button type="button" variant="secondary" aria-label="All clear" className={utilKey} onClick={() => send({ type: "clear" })}>
                AC
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Clear (Esc)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="secondary" aria-label="Backspace" className={utilKey} onClick={() => send({ type: "backspace" })}>
                ⌫
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Backspace</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="secondary" aria-label="Percent" className={utilKey} onClick={() => send({ type: "percent" })}>
                %
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Divide entry by 100</TooltipContent>
          </Tooltip>
          <Button
            type="button"
            variant="secondary"
            aria-label="Divide"
            className={cn(opKey, state.pendingOp === "div" && "ring-1 ring-primary/40")}
            onClick={() => send({ type: "op", op: "div" })}
          >
            {OP_LABEL.div}
          </Button>

          {(["7", "8", "9"] as const).map((d) => (
            <Button key={d} type="button" variant="outline" className={digitKey} onClick={() => send({ type: "digit", digit: d })}>
              {d}
            </Button>
          ))}
          <Button
            type="button"
            variant="secondary"
            aria-label="Multiply"
            className={cn(opKey, state.pendingOp === "mul" && "ring-1 ring-primary/40")}
            onClick={() => send({ type: "op", op: "mul" })}
          >
            {OP_LABEL.mul}
          </Button>

          {(["4", "5", "6"] as const).map((d) => (
            <Button key={d} type="button" variant="outline" className={digitKey} onClick={() => send({ type: "digit", digit: d })}>
              {d}
            </Button>
          ))}
          <Button
            type="button"
            variant="secondary"
            aria-label="Subtract"
            className={cn(opKey, state.pendingOp === "sub" && "ring-1 ring-primary/40")}
            onClick={() => send({ type: "op", op: "sub" })}
          >
            {OP_LABEL.sub}
          </Button>

          {(["1", "2", "3"] as const).map((d) => (
            <Button key={d} type="button" variant="outline" className={digitKey} onClick={() => send({ type: "digit", digit: d })}>
              {d}
            </Button>
          ))}
          <Button
            type="button"
            variant="secondary"
            aria-label="Add"
            className={cn(opKey, state.pendingOp === "add" && "ring-1 ring-primary/40")}
            onClick={() => send({ type: "op", op: "add" })}
          >
            {OP_LABEL.add}
          </Button>

          <Button type="button" variant="secondary" aria-label="Toggle sign" className={utilKey} onClick={() => send({ type: "sign" })}>
            ±
          </Button>
          <Button type="button" variant="outline" className={digitKey} onClick={() => send({ type: "digit", digit: "0" })}>
            0
          </Button>
          <Button type="button" variant="outline" aria-label="Decimal point" className={digitKey} onClick={() => send({ type: "dot" })}>
            .
          </Button>
          <Button type="button" aria-label="Equals" className={cn(keyBase, "font-semibold shadow-sm")} onClick={() => send({ type: "equals" })}>
            =
          </Button>
        </div>
      </div>
    </TooltipProvider>
  )
}
