"use client"

import { useEffect, useState } from "react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { aqueousIonFromPh } from "@/lib/lab-calculations/ph-ion"
import { formatResultForNote, type CalculatorResultCallback } from "../calc-types"

export function PhIonPanel({ onResultChange }: { onResultChange: CalculatorResultCallback }) {
  const [pH, setPh] = useState("7")

  useEffect(() => {
    const v = parseFloat(pH)
    if (!Number.isFinite(v)) {
      onResultChange({ text: null, latex: null, error: null })
      return
    }
    const r = aqueousIonFromPh(v)
    if (!r.ok) {
      onResultChange({ text: null, latex: null, error: r.error })
      return
    }
    onResultChange({ text: formatResultForNote(r), latex: r.latexFormula, error: null })
  }, [pH, onResultChange])

  return (
    <div className="space-y-2">
      <div className="grid gap-1.5">
        <Label htmlFor="calc-ph" className="text-xs">
          pH (25 °C)
        </Label>
        <Input
          id="calc-ph"
          type="number"
          step="any"
          min={0}
          max={14}
          value={pH}
          onChange={(e) => setPh(e.target.value)}
          className="h-8 text-sm"
        />
      </div>
      <p className="text-[10px] text-muted-foreground">Shows pOH, [H⁺], [OH⁻] at 25 °C.</p>
    </div>
  )
}
