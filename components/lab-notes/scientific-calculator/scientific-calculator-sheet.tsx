"use client"

import { useCallback, useEffect, useState } from "react"
import type { Editor } from "@tiptap/react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useToast } from "@/hooks/use-toast"
import { Copy, Sigma, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { CalculatorModeId, CalculatorResultUpdate } from "./calc-types"
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

const MODE_GROUPS: {
  label: string
  modes: { id: CalculatorModeId; label: string; hint: string }[]
}[] = [
  {
    label: "Numbers",
    modes: [
      {
        id: "numericKeypad",
        label: "Number keypad",
        hint: "Digits, + − × ÷, = — like a handheld calculator",
      },
      {
        id: "numericSci",
        label: "Scientific (log, trig, powers)",
        hint: "Same keypad as basic, plus scientific keys — result shows the full calculation",
      },
    ],
  },
  {
    label: "Solutions & stoichiometry",
    modes: [
      { id: "molarity", label: "Molarity (n, V)", hint: "M = n / V" },
      {
        id: "molarityMassVol",
        label: "Molarity (mass, FW, V)",
        hint: "Dissolve solid: M = m/(MW·V)",
      },
      { id: "molesFromMass", label: "Moles from mass", hint: "n = m / MW" },
      { id: "massFromMoles", label: "Mass from moles", hint: "m = n × MW" },
      { id: "dilution", label: "Dilution C₁V₁ = C₂V₂", hint: "Solve one unknown" },
      {
        id: "stockDilution",
        label: "Stock → working volume",
        hint: "V_stock from C_stock, C_final, V_final",
      },
    ],
  },
  {
    label: "pH & spectroscopy",
    modes: [
      {
        id: "hhBuffer",
        label: "Henderson–Hasselbalch",
        hint: "pH = pKa + log([A⁻]/[HA])",
      },
      { id: "phIon", label: "pH → ions (25 °C)", hint: "pOH, [H⁺], [OH⁻]" },
      { id: "beerLambert", label: "Beer–Lambert (A = εlc)", hint: "Solve one unknown" },
    ],
  },
  {
    label: "Physical",
    modes: [
      { id: "idealGas", label: "Ideal gas PV = nRT", hint: "atm, L, mol, K" },
      { id: "temperature", label: "Temperature convert", hint: "°C, °F, K" },
    ],
  },
]

const ALL_MODES = MODE_GROUPS.flatMap((g) => g.modes)

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

export function ScientificCalculatorSheet({
  open,
  onOpenChange,
  getEditor,
  presentation = "overlay",
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Resolves TipTap editor for insert-at-cursor (ref-safe). */
  getEditor: () => Editor | null
  /** `overlay` covers only the editor region (parent must be `relative`). `sheet` uses the app-level right sheet. */
  presentation?: "sheet" | "overlay"
}) {
  const { toast } = useToast()
  const [mode, setMode] = useState<CalculatorModeId>("numericKeypad")
  const [resultText, setResultText] = useState<string | null>(null)
  const [resultLatex, setResultLatex] = useState<string | null>(null)
  const [resultError, setResultError] = useState<string | null>(null)

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

  const handleCopy = async () => {
    if (!resultText) return
    try {
      await navigator.clipboard.writeText(resultText)
      toast({ title: "Copied", description: "Result copied to clipboard." })
    } catch {
      toast({
        title: "Copy failed",
        description: "Clipboard access was denied.",
        variant: "destructive",
      })
    }
  }

  const handleInsert = () => {
    const editor = getEditor()
    if (!resultText || !editor) return
    const latex = resultLatex?.trim()
    if (latex && insertInlineMathIfAvailable(editor, latex)) {
      toast({
        title: "Inserted",
        description: "Formula inserted as inline math at the cursor.",
      })
      onOpenChange(false)
      return
    }
    const html = `<p>${escapeHtml(resultText).split("\n").join("<br />")}</p>`
    editor.chain().focus().insertContent(html).run()
    toast({
      title: "Inserted",
      description: latex
        ? "Inserted as plain text — inline math failed for this formula; you can paste into Sigma → Inline equation to adjust."
        : "Result added to your note at the cursor.",
    })
    onOpenChange(false)
  }

  const modeMeta = ALL_MODES.find((m) => m.id === mode)

  const headerSheet = (
    <SheetHeader className="shrink-0 border-b border-border/60 px-3 py-2.5 text-left">
      <div className="flex items-center gap-2">
        <Sigma className="size-4 text-muted-foreground" aria-hidden />
        <SheetTitle className="text-sm">Scientific calculator</SheetTitle>
      </div>
      <SheetDescription className="text-[11px] leading-snug">
        Lab formulas, logs/trig, and unit conversions. Verification only.
      </SheetDescription>
    </SheetHeader>
  )

  const headerOverlay = (
    <div className="flex shrink-0 items-start justify-between gap-2 border-b border-border/50 bg-muted/20 px-3 py-2.5 text-left">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <Sigma className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <h2 id="scientific-calculator-title" className="text-sm font-semibold tracking-tight">
            Calculator
          </h2>
        </div>
        <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
          Lab math and scientific number tools — verification only.
        </p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
        onClick={() => onOpenChange(false)}
        aria-label="Close calculator"
      >
        <X className="size-4" />
      </Button>
    </div>
  )

  const body = (
    <>
      <ScrollArea className="min-h-0 flex-1">
        <div
          className={cn(
            "space-y-2",
            presentation === "overlay" ? "px-3 py-3" : "space-y-4 px-4 py-4"
          )}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="calc-mode" className="text-xs">
              Calculation
            </Label>
            <Select
              value={mode}
              onValueChange={(v) => {
                setMode(v as CalculatorModeId)
                setResultText(null)
                setResultLatex(null)
                setResultError(null)
              }}
            >
              <SelectTrigger id="calc-mode" className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[280] max-h-[min(70vh,28rem)]">
                {MODE_GROUPS.map((group) => (
                  <SelectGroup key={group.label}>
                    <SelectLabel className="text-[10px] text-muted-foreground">{group.label}</SelectLabel>
                    {group.modes.map((o) => (
                      <SelectItem key={o.id} value={o.id} className="text-xs">
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            {modeMeta && (
              <p className="text-[10px] text-muted-foreground">{modeMeta.hint}</p>
            )}
          </div>

          {mode === "numericKeypad" && <NumericCalculatorPanel scientific={false} onResultChange={onResultChange} />}
          {mode === "numericSci" && <NumericCalculatorPanel scientific onResultChange={onResultChange} />}
          {mode === "molarity" && <MolarityPanel onResultChange={onResultChange} />}
          {mode === "molarityMassVol" && <MolarityMassVolPanel onResultChange={onResultChange} />}
          {mode === "molesFromMass" && <MolesFromMassPanel onResultChange={onResultChange} />}
          {mode === "massFromMoles" && <MassFromMolesPanel onResultChange={onResultChange} />}
          {mode === "dilution" && <DilutionPanel onResultChange={onResultChange} />}
          {mode === "stockDilution" && <StockDilutionPanel onResultChange={onResultChange} />}
          {mode === "hhBuffer" && <HhBufferPanel onResultChange={onResultChange} />}
          {mode === "idealGas" && <IdealGasPanel onResultChange={onResultChange} />}
          {mode === "beerLambert" && <BeerLambertPanel onResultChange={onResultChange} />}
          {mode === "phIon" && <PhIonPanel onResultChange={onResultChange} />}
          {mode === "temperature" && <TemperaturePanel onResultChange={onResultChange} />}

          <div
            className={cn(
              "rounded-md border p-2 text-xs shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)]",
              resultError ? "border-destructive/40 bg-destructive/5" : "border-border/70 bg-muted/25"
            )}
          >
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Result
            </p>
            {resultError && <p className="mt-0.5 text-[11px] text-destructive">{resultError}</p>}
            {!resultError && resultText && (
              <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[11px] leading-snug text-foreground">
                {resultText}
              </pre>
            )}
            {!resultError && !resultText && (
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {mode === "numericKeypad" || mode === "numericSci"
                  ? "Use the keypad above — the calculation and result appear here."
                  : "Enter valid positive numbers."}
              </p>
            )}
          </div>
        </div>
      </ScrollArea>

      <div
        className={cn(
          "shrink-0 space-y-2 border-t border-border/60 bg-background/95",
          presentation === "overlay" ? "px-3 py-2" : "space-y-3 px-4 py-3"
        )}
      >
        <div className="flex flex-wrap gap-1.5">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            disabled={!resultText}
            onClick={handleCopy}
          >
            <Copy className="size-3" />
            Copy
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            disabled={!resultText || !getEditor()}
            onClick={handleInsert}
            title={!getEditor() ? "Editor not ready" : undefined}
          >
            Insert at cursor
          </Button>
        </div>
        <p className="text-[9px] leading-snug text-muted-foreground">
          Insert adds an inline math node (LaTeX). Verify safety-critical amounts independently.
        </p>
      </div>
    </>
  )

  if (presentation === "sheet") {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
          {headerSheet}
          {body}
        </SheetContent>
      </Sheet>
    )
  }

  if (!open) return null

  /** Sits below the Tiptap formatting toolbar (shrink-0 row ~48–56px + border). */
  const overlayTop = "top-14"

  return (
    <div
      className={cn(
        "pointer-events-auto absolute bottom-0 left-0 right-0 z-[260] flex items-stretch justify-end overflow-hidden p-2 sm:p-3",
        overlayTop
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
          "relative z-[1] flex h-full min-h-0 w-full max-w-md flex-col overflow-hidden rounded-xl border border-border/80 bg-card/98",
          "shadow-[0_12px_40px_-12px_rgba(0,0,0,0.28),0_4px_14px_-4px_rgba(0,0,0,0.12)] ring-1 ring-black/[0.06]"
        )}
      >
        {headerOverlay}
        {body}
      </div>
    </div>
  )
}
