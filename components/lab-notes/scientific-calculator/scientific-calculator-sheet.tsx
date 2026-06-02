"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { Editor } from "@tiptap/react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip"
import { useToast } from "@/hooks/use-toast"
import {
  Calculator,
  Copy,
  CornerDownLeft,
  FlaskConical,
  Hash,
  History,
  Sigma,
  Thermometer,
  TestTubes,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { CalcHistoryEntry, CalculatorModeId, CalculatorResultUpdate } from "./calc-types"
import { MolarityPanel } from "./modes/molarity-panel"
import { MolesFromMassPanel } from "./modes/moles-from-mass-panel"
import { MassFromMolesPanel } from "./modes/mass-from-moles-panel"
import { DilutionPanel } from "./modes/dilution-panel"
import { NumericCalculatorPanel } from "./modes/numeric-calculator-panel"
import { MolarityMassVolPanel } from "./modes/molarity-mass-vol-panel"
import { StockDilutionPanel } from "./modes/stock-dilution-panel"
import { HhBufferPanel } from "./modes/hh-buffer-panel"
import { IdealGasPanel } from "./modes/ideal-gas-panel"
import { BeerLambertPanel } from "./modes/beer-lambert-panel"
import { PhIonPanel } from "./modes/ph-ion-panel"
import { TemperaturePanel } from "./modes/temperature-panel"
import { useCalcHistory, CalcHistoryPanel } from "./calc-history"

// ---------------------------------------------------------------------------
// Mode catalogue with icons
// ---------------------------------------------------------------------------
type ModeGroup = {
  label: string
  icon: typeof Calculator
  modes: { id: CalculatorModeId; label: string; shortLabel: string; glyph: string; hint: string }[]
}

const MODE_GROUPS: ModeGroup[] = [
  {
    label: "Numbers",
    icon: Hash,
    modes: [
      {
        id: "numericKeypad",
        label: "Number keypad",
        shortLabel: "Basic",
        glyph: "0–9",
        hint: "Digits, + − × ÷, =",
      },
      {
        id: "numericSci",
        label: "Scientific (log, trig, powers)",
        shortLabel: "Scientific",
        glyph: "fx",
        hint: "log, trig, powers",
      },
    ],
  },
  {
    label: "Solutions",
    icon: FlaskConical,
    modes: [
      { id: "molarity", label: "Molarity (n, V)", shortLabel: "Molarity", glyph: "M", hint: "M = n / V" },
      {
        id: "molarityMassVol",
        label: "Molarity (mass, FW, V)",
        shortLabel: "Molarity (mass)",
        glyph: "M·m",
        hint: "M = m/(MW·V)",
      },
      { id: "molesFromMass", label: "Moles from mass", shortLabel: "Moles→Mass", glyph: "n", hint: "n = m / MW" },
      { id: "massFromMoles", label: "Mass from moles", shortLabel: "Mass→Moles", glyph: "m", hint: "m = n × MW" },
      { id: "dilution", label: "Dilution C₁V₁ = C₂V₂", shortLabel: "Dilution", glyph: "C₁V₁", hint: "C₁V₁ = C₂V₂" },
      {
        id: "stockDilution",
        label: "Stock → working volume",
        shortLabel: "Stock dilution",
        glyph: "V₁→V₂",
        hint: "V_stock from C, V_final",
      },
    ],
  },
  {
    label: "pH & Spectroscopy",
    icon: TestTubes,
    modes: [
      {
        id: "hhBuffer",
        label: "Henderson–Hasselbalch",
        shortLabel: "H–H Buffer",
        glyph: "pKa",
        hint: "pH = pKa + log([A⁻]/[HA])",
      },
      { id: "phIon", label: "pH → ions (25 °C)", shortLabel: "pH → ions", glyph: "pH", hint: "pOH, [H⁺], [OH⁻]" },
      { id: "beerLambert", label: "Beer–Lambert (A = εlc)", shortLabel: "Beer–Lambert", glyph: "A", hint: "A = εlc" },
    ],
  },
  {
    label: "Physical",
    icon: Thermometer,
    modes: [
      { id: "idealGas", label: "Ideal gas PV = nRT", shortLabel: "Ideal gas", glyph: "PV", hint: "PV = nRT" },
      { id: "temperature", label: "Temperature convert", shortLabel: "Temperature", glyph: "°", hint: "°C, °F, K" },
    ],
  },
]

const ALL_MODES = MODE_GROUPS.flatMap((g) => g.modes.map((m) => ({ ...m, group: g })))

function findMode(id: CalculatorModeId) {
  return ALL_MODES.find((m) => m.id === id) ?? ALL_MODES[0]
}

/**
 * Narrow an arbitrary value to a known CalculatorModeId, or null if it isn't
 * one of the registered modes. The mode <select> only ever emits valid ids, but
 * this guards against an unexpected value silently selecting an unrenderable
 * mode (which would render nothing via the activePanel switch default).
 */
function validateMode(id: unknown): CalculatorModeId | null {
  return ALL_MODES.some((m) => m.id === id) ? (id as CalculatorModeId) : null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function insertInlineMathIfAvailable(editor: Editor, latex: string): boolean {
  try {
    const chain = editor.chain().focus() as {
      insertInlineMath?: (opts: { latex: string }) => { run: () => boolean }
    }
    if (typeof chain.insertInlineMath !== "function") return false
    return chain.insertInlineMath({ latex }).run()
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function ScientificCalculatorSheet({
  open,
  onOpenChange,
  getEditor,
  presentation = "overlay",
  onSaveToHistory,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Resolves TipTap editor for insert-at-cursor (ref-safe). */
  getEditor: () => Editor | null
  /** `overlay` covers only the editor region (parent must be `relative`). `sheet` uses the app-level right sheet. */
  presentation?: "sheet" | "overlay"
  /** Called when a calculation is inserted — caller can persist to content_diffs. */
  onSaveToHistory?: (resultText: string) => void
}) {
  const { toast } = useToast()
  const [mode, setMode] = useState<CalculatorModeId>("numericKeypad")
  const [resultText, setResultText] = useState<string | null>(null)
  const [resultLatex, setResultLatex] = useState<string | null>(null)
  const [resultError, setResultError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<"calc" | "history">("calc")

  const { entries: historyEntries, addEntry: addHistoryEntry, clearHistory } = useCalcHistory()

  const onResultChange = useCallback((u: CalculatorResultUpdate) => {
    setResultText(u.text)
    setResultLatex(u.latex)
    setResultError(u.error)
  }, [])

  useEffect(() => {
    if (!open || presentation !== "overlay") return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onOpenChange, presentation])

  const modeMeta = findMode(mode)

  const handleCopy = async (text?: string) => {
    const t = text ?? resultText
    if (!t) return
    try {
      await navigator.clipboard.writeText(t)
      toast({ title: "Copied", description: "Result copied to clipboard." })
    } catch {
      toast({
        title: "Copy failed",
        description: "Clipboard access was denied.",
        variant: "destructive",
      })
    }
  }

  const handleInsertResult = useCallback(
    (text: string, latex: string | null) => {
      const editor = getEditor()
      if (!editor) return

      // Save to history (in-calculator + optionally to content_diffs)
      addHistoryEntry(mode, modeMeta.label, text, latex)
      onSaveToHistory?.(text)

      const ltx = latex?.trim()
      if (ltx && insertInlineMathIfAvailable(editor, ltx)) {
        toast({
          title: "Inserted",
          description: "Formula inserted as inline math at the cursor.",
        })
        return
      }
      const html = `<p>${escapeHtml(text).split("\n").join("<br />")}</p>`
      editor.chain().focus().insertContent(html).run()
      toast({
        title: "Inserted",
        description: ltx
          ? "Inserted as plain text — inline math failed for this formula."
          : "Result added to your note at the cursor.",
      })
    },
    [getEditor, mode, modeMeta.label, addHistoryEntry, onSaveToHistory, toast],
  )

  const handleInsert = () => {
    if (!resultText) return
    handleInsertResult(resultText, resultLatex)
  }

  const handleHistoryInsert = (entry: CalcHistoryEntry) => {
    const editor = getEditor()
    if (!editor) return
    const ltx = entry.latex?.trim()
    if (ltx && insertInlineMathIfAvailable(editor, ltx)) {
      toast({ title: "Inserted", description: "Re-inserted from history as inline math." })
      return
    }
    const html = `<p>${escapeHtml(entry.resultText).split("\n").join("<br />")}</p>`
    editor.chain().focus().insertContent(html).run()
    toast({ title: "Inserted", description: "Re-inserted from history at the cursor." })
  }

  // ---------------------------------------------------------------------------
  // Mode selector (left rail) — icon/glyph column with tooltips
  // ---------------------------------------------------------------------------
  const modeSelector = (
    <TooltipProvider delayDuration={150}>
      <div className="flex min-h-0 shrink-0 flex-col overflow-hidden">
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col items-center gap-1 px-1.5 py-2">
            {MODE_GROUPS.map((group, gi) => {
              const Icon = group.icon
              const isGroupActive = group.modes.some((m) => m.id === mode)
              return (
                <div key={group.label} className="flex w-full flex-col items-center gap-0.5">
                  {gi > 0 && <div className="my-1 h-px w-6 bg-border/50" />}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex h-5 w-full items-center justify-center">
                        <Icon
                          className={cn(
                            "size-3.5 shrink-0",
                            isGroupActive ? "text-foreground" : "text-muted-foreground/50",
                          )}
                          aria-hidden
                        />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="right">{group.label}</TooltipContent>
                  </Tooltip>
                  {group.modes.map((m) => {
                    const isActive = m.id === mode
                    return (
                      <Tooltip key={m.id}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-label={m.label}
                            onClick={() => {
                              setMode(m.id)
                              setResultText(null)
                              setResultLatex(null)
                              setResultError(null)
                              setActiveTab("calc")
                            }}
                            className={cn(
                              "flex h-8 w-full min-w-0 items-center justify-center rounded-md px-1 font-mono text-2xs leading-none tabular-nums transition-all",
                              isActive
                                ? "bg-primary/10 text-primary font-semibold shadow-sm ring-1 ring-primary/20"
                                : "text-muted-foreground/80 hover:bg-muted/60 hover:text-foreground",
                            )}
                          >
                            <span className="truncate">{m.glyph}</span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-[15rem]">
                          <div className="font-medium">{m.label}</div>
                          {m.hint && (
                            <div className="mt-0.5 text-2xs opacity-80">{m.hint}</div>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </ScrollArea>
      </div>
    </TooltipProvider>
  )

  // ---------------------------------------------------------------------------
  // Active calculator panel
  // ---------------------------------------------------------------------------
  const activePanel = useMemo(() => {
    switch (mode) {
      case "numericKeypad":
        return <NumericCalculatorPanel scientific={false} onResultChange={onResultChange} />
      case "numericSci":
        return <NumericCalculatorPanel scientific onResultChange={onResultChange} />
      case "molarity":
        return <MolarityPanel onResultChange={onResultChange} />
      case "molarityMassVol":
        return <MolarityMassVolPanel onResultChange={onResultChange} />
      case "molesFromMass":
        return <MolesFromMassPanel onResultChange={onResultChange} />
      case "massFromMoles":
        return <MassFromMolesPanel onResultChange={onResultChange} />
      case "dilution":
        return <DilutionPanel onResultChange={onResultChange} />
      case "stockDilution":
        return <StockDilutionPanel onResultChange={onResultChange} />
      case "hhBuffer":
        return <HhBufferPanel onResultChange={onResultChange} />
      case "idealGas":
        return <IdealGasPanel onResultChange={onResultChange} />
      case "beerLambert":
        return <BeerLambertPanel onResultChange={onResultChange} />
      case "phIon":
        return <PhIonPanel onResultChange={onResultChange} />
      case "temperature":
        return <TemperaturePanel onResultChange={onResultChange} />
      default:
        return null
    }
  }, [mode, onResultChange])

  // ---------------------------------------------------------------------------
  // Result card — symbol-led, no "Result" label
  // ---------------------------------------------------------------------------
  const resultCard = (
    <TooltipProvider delayDuration={150}>
      <div
        className={cn(
          "rounded-lg border p-2.5 transition-all duration-300",
          resultError
            ? "border-destructive/40 bg-destructive/5"
            : resultText
              ? "border-primary/30 bg-primary/[0.03] shadow-sm"
              : "border-dashed border-border/60 bg-muted/10",
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-start gap-2">
            <span
              className={cn(
                "mt-0.5 font-mono text-base leading-none",
                resultError
                  ? "text-destructive"
                  : resultText
                    ? "text-primary"
                    : "text-muted-foreground/40",
              )}
              aria-hidden
            >
              =
            </span>
            <div className="min-w-0 flex-1">
              {resultError && <p className="text-xs text-destructive">{resultError}</p>}
              {!resultError && resultText && (
                <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-snug text-foreground">
                  {resultText}
                </pre>
              )}
              {!resultError && !resultText && (
                <p className="text-2xs text-muted-foreground/50">…</p>
              )}
            </div>
          </div>
          {resultText && !resultError && (
            <div className="flex shrink-0 items-center gap-0.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Copy result"
                    className="h-6 w-6 text-muted-foreground hover:text-foreground"
                    onClick={() => handleCopy()}
                  >
                    <Copy className="size-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Copy</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Insert at cursor"
                    className="h-6 w-6 text-muted-foreground hover:text-foreground"
                    disabled={!getEditor()}
                    onClick={handleInsert}
                  >
                    <CornerDownLeft className="size-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Insert at cursor</TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  )

  // ---------------------------------------------------------------------------
  // Main body (Calc + History tabs)
  // ---------------------------------------------------------------------------
  const body = (
    <TooltipProvider delayDuration={150}>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as "calc" | "history")}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-border/40 px-2">
            <TabsList className="h-9 bg-transparent p-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <TabsTrigger
                    value="calc"
                    aria-label="Calculator"
                    className="relative h-9 w-9 rounded-none border-b-2 border-transparent p-0 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                  >
                    <Calculator className="size-4" />
                  </TabsTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom">Calculator</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <TabsTrigger
                    value="history"
                    aria-label="History"
                    className="relative h-9 w-9 rounded-none border-b-2 border-transparent p-0 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                  >
                    <History className="size-4" />
                    {historyEntries.length > 0 && (
                      <span className="absolute right-0.5 top-1 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-medium tabular-nums text-primary-foreground">
                        {historyEntries.length}
                      </span>
                    )}
                  </TabsTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom">History ({historyEntries.length})</TooltipContent>
              </Tooltip>
            </TabsList>
          </div>

          <TabsContent value="calc" className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
            <div className="flex min-h-0 flex-1 flex-row">
              {/* Left rail — icon/glyph column */}
              <div className="hidden w-12 shrink-0 border-r border-border/40 bg-muted/10 sm:flex sm:flex-col">
                {modeSelector}
              </div>

              {/* Right — form + result */}
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                {/* Mobile: mode dropdown instead of rail */}
                <div className="flex shrink-0 items-center gap-2 border-b border-border/40 px-3 py-2 sm:hidden">
                  <select
                    value={mode}
                    onChange={(e) => {
                      const next = validateMode(e.target.value)
                      if (!next) return
                      setMode(next)
                      setResultText(null)
                      setResultLatex(null)
                      setResultError(null)
                    }}
                    className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs"
                  >
                    {MODE_GROUPS.map((group) => (
                      <optgroup key={group.label} label={group.label}>
                        {group.modes.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>

                {/* Mode header — formula only, theme typography */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="flex w-full shrink-0 items-center border-b border-border/30 px-3 py-1.5 text-left hover:bg-muted/20"
                      aria-label={modeMeta.label}
                    >
                      <span className="truncate text-sm font-medium text-foreground">
                        {modeMeta.hint || modeMeta.label}
                      </span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[18rem]">
                    <div className="font-medium">{modeMeta.label}</div>
                    {modeMeta.hint && (
                      <div className="mt-0.5 text-2xs opacity-80">{modeMeta.hint}</div>
                    )}
                  </TooltipContent>
                </Tooltip>

                <ScrollArea className="min-h-0 flex-1">
                  <div className="space-y-3 px-3 py-3">
                    {activePanel}
                    {resultCard}
                  </div>
                </ScrollArea>

                {/* Bottom action bar */}
                <div className="shrink-0 border-t border-border/50 bg-muted/10 px-2 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-7 gap-1.5 px-2.5 text-xs"
                      disabled={!resultText}
                      onClick={() => handleCopy()}
                    >
                      <Copy className="size-3" />
                      Copy
                    </Button>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          size="sm"
                          className="h-7 gap-1.5 px-2.5 text-xs"
                          disabled={!resultText || !getEditor()}
                          onClick={handleInsert}
                        >
                          <CornerDownLeft className="size-3" />
                          Insert at cursor
                        </Button>
                      </TooltipTrigger>
                      {!getEditor() && (
                        <TooltipContent side="top">Editor not ready</TooltipContent>
                      )}
                    </Tooltip>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="history" className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
            <CalcHistoryPanel
              entries={historyEntries}
              onClear={clearHistory}
              onInsert={handleHistoryInsert}
              onCopy={(text) => handleCopy(text)}
            />
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  )

  // ---------------------------------------------------------------------------
  // Header
  // ---------------------------------------------------------------------------
  const headerSheet = (
    <SheetHeader className="shrink-0 border-b border-border/60 bg-gradient-to-r from-slate-50 to-slate-100 px-3 py-2 text-left dark:from-slate-900 dark:to-slate-800">
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10">
          <Sigma className="size-3.5 text-primary" aria-hidden />
        </div>
        <SheetTitle className="text-sm">Calculator</SheetTitle>
        <SheetDescription className="sr-only">
          Lab formulas, logs/trig, and unit conversions
        </SheetDescription>
      </div>
    </SheetHeader>
  )

  const headerOverlay = (
    <TooltipProvider delayDuration={150}>
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/50 bg-gradient-to-r from-slate-50 to-slate-100 px-2 py-1.5 text-left dark:from-slate-900 dark:to-slate-800">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10">
            <Sigma className="size-3.5 text-primary" aria-hidden />
          </div>
          <h2 id="scientific-calculator-title" className="text-sm font-semibold tracking-tight">
            Calculator
          </h2>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={() => onOpenChange(false)}
              aria-label="Close calculator"
            >
              <X className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Close (Esc)</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  )

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  if (presentation === "sheet") {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
          {headerSheet}
          {body}
        </SheetContent>
      </Sheet>
    )
  }

  if (!open) return null

  const overlayTop = "top-14"

  return (
    <div
      className={cn(
        "pointer-events-auto absolute bottom-0 left-0 right-0 z-[260] flex items-stretch justify-end overflow-hidden p-2 sm:p-3",
        overlayTop,
      )}
      role="dialog"
      aria-modal="true"
      aria-labelledby="scientific-calculator-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default border-0 bg-background/40 backdrop-blur-[2px]"
        aria-label="Dismiss calculator"
        onClick={() => onOpenChange(false)}
      />
      <div
        className={cn(
          "relative z-[1] flex h-full min-h-0 w-full max-w-xl flex-col overflow-hidden rounded-xl border border-border/80 bg-card/98",
          "shadow-[0_12px_40px_-12px_rgba(0,0,0,0.28),0_4px_14px_-4px_rgba(0,0,0,0.12)] ring-1 ring-black/[0.06]",
        )}
      >
        {headerOverlay}
        {body}
      </div>
    </div>
  )
}
