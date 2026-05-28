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
  accent: string
  modes: { id: CalculatorModeId; label: string; shortLabel: string; hint: string }[]
}

const MODE_GROUPS: ModeGroup[] = [
  {
    label: "Numbers",
    icon: Hash,
    accent: "text-blue-500",
    modes: [
      {
        id: "numericKeypad",
        label: "Number keypad",
        shortLabel: "Basic",
        hint: "Digits, + − × ÷, = — like a handheld calculator",
      },
      {
        id: "numericSci",
        label: "Scientific (log, trig, powers)",
        shortLabel: "Scientific",
        hint: "Keypad + scientific keys — log, trig, powers",
      },
    ],
  },
  {
    label: "Solutions",
    icon: FlaskConical,
    accent: "text-emerald-500",
    modes: [
      { id: "molarity", label: "Molarity (n, V)", shortLabel: "Molarity", hint: "M = n / V" },
      {
        id: "molarityMassVol",
        label: "Molarity (mass, FW, V)",
        shortLabel: "Molarity (mass)",
        hint: "Dissolve solid: M = m/(MW·V)",
      },
      { id: "molesFromMass", label: "Moles from mass", shortLabel: "Moles→Mass", hint: "n = m / MW" },
      { id: "massFromMoles", label: "Mass from moles", shortLabel: "Mass→Moles", hint: "m = n × MW" },
      { id: "dilution", label: "Dilution C₁V₁ = C₂V₂", shortLabel: "Dilution", hint: "Solve one unknown" },
      {
        id: "stockDilution",
        label: "Stock → working volume",
        shortLabel: "Stock dilution",
        hint: "V_stock from C_stock, C_final, V_final",
      },
    ],
  },
  {
    label: "pH & Spectroscopy",
    icon: TestTubes,
    accent: "text-purple-500",
    modes: [
      {
        id: "hhBuffer",
        label: "Henderson–Hasselbalch",
        shortLabel: "H–H Buffer",
        hint: "pH = pKa + log([A⁻]/[HA])",
      },
      { id: "phIon", label: "pH → ions (25 °C)", shortLabel: "pH → ions", hint: "pOH, [H⁺], [OH⁻]" },
      { id: "beerLambert", label: "Beer–Lambert (A = εlc)", shortLabel: "Beer–Lambert", hint: "Solve one unknown" },
    ],
  },
  {
    label: "Physical",
    icon: Thermometer,
    accent: "text-orange-500",
    modes: [
      { id: "idealGas", label: "Ideal gas PV = nRT", shortLabel: "Ideal gas", hint: "atm, L, mol, K" },
      { id: "temperature", label: "Temperature convert", shortLabel: "Temperature", hint: "°C, °F, K" },
    ],
  },
]

const ALL_MODES = MODE_GROUPS.flatMap((g) => g.modes.map((m) => ({ ...m, group: g })))

function findMode(id: CalculatorModeId) {
  return ALL_MODES.find((m) => m.id === id) ?? ALL_MODES[0]
}

function findGroup(id: CalculatorModeId) {
  return MODE_GROUPS.find((g) => g.modes.some((m) => m.id === id)) ?? MODE_GROUPS[0]
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
  const modeGroup = findGroup(mode)

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
  // Mode selector (left rail)
  // ---------------------------------------------------------------------------
  const modeSelector = (
    <div className="flex min-h-0 shrink-0 flex-col overflow-hidden">
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-1 p-2">
          {MODE_GROUPS.map((group) => {
            const Icon = group.icon
            const isGroupActive = group.modes.some((m) => m.id === mode)
            return (
              <div key={group.label}>
                <div className="flex items-center gap-1.5 px-1.5 py-1">
                  <Icon className={cn("size-3.5 shrink-0", isGroupActive ? group.accent : "text-muted-foreground/60")} />
                  <span className="text-3xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                    {group.label}
                  </span>
                </div>
                {group.modes.map((m) => {
                  const isActive = m.id === mode
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setMode(m.id)
                        setResultText(null)
                        setResultLatex(null)
                        setResultError(null)
                        setActiveTab("calc")
                      }}
                      className={cn(
                        "flex w-full items-center rounded-md px-2 py-1.5 text-left text-xs transition-all",
                        isActive
                          ? "bg-primary/10 text-primary font-medium shadow-sm ring-1 ring-primary/20"
                          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                      )}
                    >
                      <span className="truncate">{m.shortLabel}</span>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </ScrollArea>
    </div>
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
  // Result card
  // ---------------------------------------------------------------------------
  const resultCard = (
    <div
      className={cn(
        "rounded-lg border p-3 transition-all duration-300",
        resultError
          ? "border-destructive/40 bg-destructive/5"
          : resultText
            ? "border-primary/30 bg-primary/[0.03] shadow-sm"
            : "border-border/60 bg-muted/20",
      )}
    >
      <div className="flex items-center justify-between">
        <p
          className={cn(
            "text-2xs font-semibold uppercase tracking-wider",
            resultError ? "text-destructive" : resultText ? "text-primary/70" : "text-muted-foreground/60",
          )}
        >
          Result
        </p>
        {resultText && !resultError && (
          <div className="flex items-center gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              onClick={() => handleCopy()}
              title="Copy"
            >
              <Copy className="size-3" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              disabled={!getEditor()}
              onClick={handleInsert}
              title="Insert at cursor"
            >
              <CornerDownLeft className="size-3" />
            </Button>
          </div>
        )}
      </div>
      {resultError && <p className="mt-1 text-xs text-destructive">{resultError}</p>}
      {!resultError && resultText && (
        <pre className="mt-1.5 whitespace-pre-wrap break-words font-mono text-xs leading-snug text-foreground">
          {resultText}
        </pre>
      )}
      {!resultError && !resultText && (
        <p className="mt-1 text-2xs text-muted-foreground/60">
          {mode === "numericKeypad" || mode === "numericSci"
            ? "Use the keypad — result appears here."
            : "Enter values above."}
        </p>
      )}
    </div>
  )

  // ---------------------------------------------------------------------------
  // Main body (Calc + History tabs)
  // ---------------------------------------------------------------------------
  const body = (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as "calc" | "history")}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border/40 px-3">
          <TabsList className="h-9 bg-transparent p-0">
            <TabsTrigger
              value="calc"
              className="relative h-9 rounded-none border-b-2 border-transparent px-3 text-xs font-medium data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              <Calculator className="mr-1.5 size-3.5" />
              Calculator
            </TabsTrigger>
            <TabsTrigger
              value="history"
              className="relative h-9 rounded-none border-b-2 border-transparent px-3 text-xs font-medium data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              <History className="mr-1.5 size-3.5" />
              History
              {historyEntries.length > 0 && (
                <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-muted px-1 text-3xs font-medium tabular-nums text-muted-foreground">
                  {historyEntries.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="calc" className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
          <div className="flex min-h-0 flex-1 flex-row">
            {/* Left rail — mode selector */}
            <div className="hidden w-[9.5rem] shrink-0 border-r border-border/40 sm:flex sm:flex-col">
              {modeSelector}
            </div>

            {/* Right — form + result */}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              {/* Mobile: mode dropdown instead of rail */}
              <div className="flex shrink-0 items-center gap-2 border-b border-border/40 px-3 py-2 sm:hidden">
                <select
                  value={mode}
                  onChange={(e) => {
                    setMode(e.target.value as CalculatorModeId)
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

              {/* Mode header */}
              <div className="shrink-0 border-b border-border/30 px-3 py-2">
                <div className="flex items-center gap-2">
                  <modeGroup.icon className={cn("size-4 shrink-0", modeGroup.accent)} />
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-foreground">{modeMeta.label}</h3>
                    <p className="text-2xs text-muted-foreground">{modeMeta.hint}</p>
                  </div>
                </div>
              </div>

              <ScrollArea className="min-h-0 flex-1">
                <div className="space-y-3 px-3 py-3">
                  {activePanel}
                  {resultCard}
                </div>
              </ScrollArea>

              {/* Bottom action bar */}
              <div className="shrink-0 border-t border-border/50 bg-muted/10 px-3 py-2">
                <div className="flex flex-wrap items-center gap-1.5">
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
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 gap-1.5 px-2.5 text-xs"
                    disabled={!resultText || !getEditor()}
                    onClick={handleInsert}
                    title={!getEditor() ? "Editor not ready" : undefined}
                  >
                    <CornerDownLeft className="size-3" />
                    Insert at cursor
                  </Button>
                </div>
                <p className="mt-1 text-3xs leading-snug text-muted-foreground/60">
                  Insert adds inline math (LaTeX). Verify safety-critical amounts independently.
                </p>
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
  )

  // ---------------------------------------------------------------------------
  // Header
  // ---------------------------------------------------------------------------
  const headerSheet = (
    <SheetHeader className="shrink-0 border-b border-border/60 bg-gradient-to-r from-slate-50 to-slate-100 px-3 py-2.5 text-left dark:from-slate-900 dark:to-slate-800">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
          <Sigma className="size-4 text-primary" aria-hidden />
        </div>
        <div>
          <SheetTitle className="text-sm">Scientific Calculator</SheetTitle>
          <SheetDescription className="text-2xs leading-snug">
            Lab formulas, logs/trig, and unit conversions
          </SheetDescription>
        </div>
      </div>
    </SheetHeader>
  )

  const headerOverlay = (
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/50 bg-gradient-to-r from-slate-50 to-slate-100 px-3 py-2 text-left dark:from-slate-900 dark:to-slate-800">
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
          <Sigma className="size-4 text-primary" aria-hidden />
        </div>
        <div className="min-w-0">
          <h2 id="scientific-calculator-title" className="text-sm font-semibold tracking-tight">
            Calculator
          </h2>
          <p className="text-2xs leading-snug text-muted-foreground">
            Lab math & scientific number tools
          </p>
        </div>
      </div>
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
    </div>
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
