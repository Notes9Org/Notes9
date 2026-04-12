"use client"

import { useEffect, useState } from "react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { volumeStockForTarget } from "@/lib/lab-calculations/stock-dilution"
import type { ConcUnit, VolumeUnit } from "@/lib/lab-calculations/units"
import { formatResultForNote, type CalculatorResultCallback } from "../calc-types"

export function StockDilutionPanel({ onResultChange }: { onResultChange: CalculatorResultCallback }) {
  const [cStock, setCStock] = useState("1")
  const [cFinal, setCFinal] = useState("0.1")
  const [vFinal, setVFinal] = useState("10")
  const [concUnit, setConcUnit] = useState<ConcUnit>("M")
  const [volUnit, setVolUnit] = useState<VolumeUnit>("mL")

  useEffect(() => {
    const cs = parseFloat(cStock)
    const cf = parseFloat(cFinal)
    const vf = parseFloat(vFinal)
    if (!Number.isFinite(cs) || !Number.isFinite(cf) || !Number.isFinite(vf)) {
      onResultChange({ text: null, latex: null, error: null })
      return
    }
    const r = volumeStockForTarget(cs, cf, vf, concUnit, volUnit)
    if (!r.ok) {
      onResultChange({ text: null, latex: null, error: r.error })
      return
    }
    onResultChange({ text: formatResultForNote(r), latex: r.latexFormula, error: null })
  }, [cStock, cFinal, vFinal, concUnit, volUnit, onResultChange])

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-1.5">
          <Label className="text-[10px] text-muted-foreground">Conc. unit</Label>
          <Select value={concUnit} onValueChange={(v) => setConcUnit(v as ConcUnit)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-[280]">
              <SelectItem value="M">M</SelectItem>
              <SelectItem value="mM">mM</SelectItem>
              <SelectItem value="µM">µM</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-[10px] text-muted-foreground">Final vol. unit</Label>
          <Select value={volUnit} onValueChange={(v) => setVolUnit(v as VolumeUnit)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-[280]">
              <SelectItem value="L">L</SelectItem>
              <SelectItem value="mL">mL</SelectItem>
              <SelectItem value="µL">µL</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label className="text-xs">C_stock</Label>
        <Input type="number" step="any" min={0} value={cStock} onChange={(e) => setCStock(e.target.value)} className="h-8 text-sm" />
      </div>
      <div className="grid gap-1.5">
        <Label className="text-xs">C_final (target)</Label>
        <Input type="number" step="any" min={0} value={cFinal} onChange={(e) => setCFinal(e.target.value)} className="h-8 text-sm" />
      </div>
      <div className="grid gap-1.5">
        <Label className="text-xs">V_final (total)</Label>
        <Input type="number" step="any" min={0} value={vFinal} onChange={(e) => setVFinal(e.target.value)} className="h-8 text-sm" />
      </div>
      <p className="text-[10px] text-muted-foreground">V_stock = V_final × (C_final/C_stock); diluent = V_final − V_stock.</p>
    </div>
  )
}
