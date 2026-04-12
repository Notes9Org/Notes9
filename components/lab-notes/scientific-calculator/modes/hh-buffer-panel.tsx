"use client"

import { useEffect, useState } from "react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { hendersonHasselbalch } from "@/lib/lab-calculations/hh-buffer"
import { formatResultForNote, type CalculatorResultCallback } from "../calc-types"

export function HhBufferPanel({ onResultChange }: { onResultChange: CalculatorResultCallback }) {
  const [pKa, setPKa] = useState("4.76")
  const [ratio, setRatio] = useState("1")

  useEffect(() => {
    const pk = parseFloat(pKa)
    const r = parseFloat(ratio)
    if (!Number.isFinite(pk) || !Number.isFinite(r)) {
      onResultChange({ text: null, latex: null, error: null })
      return
    }
    const out = hendersonHasselbalch(pk, r)
    if (!out.ok) {
      onResultChange({ text: null, latex: null, error: out.error })
      return
    }
    onResultChange({ text: formatResultForNote(out), latex: out.latexFormula, error: null })
  }, [pKa, ratio, onResultChange])

  return (
    <div className="space-y-2">
      <div className="grid gap-1.5">
        <Label htmlFor="calc-pka" className="text-xs">
          pKₐ (acid)
        </Label>
        <Input id="calc-pka" type="number" step="any" value={pKa} onChange={(e) => setPKa(e.target.value)} className="h-8 text-sm" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="calc-ratio" className="text-xs">
          [A⁻] / [HA]
        </Label>
        <Input
          id="calc-ratio"
          type="number"
          step="any"
          min={0}
          value={ratio}
          onChange={(e) => setRatio(e.target.value)}
          className="h-8 text-sm"
        />
      </div>
      <p className="text-[10px] text-muted-foreground">Henderson–Hasselbalch: pH = pKₐ + log₁₀([A⁻]/[HA]).</p>
    </div>
  )
}
