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
import { temperatureTriple, type TempInputUnit } from "@/lib/lab-calculations/temperature"
import { formatResultForNote, type CalculatorResultCallback } from "../calc-types"

export function TemperaturePanel({ onResultChange }: { onResultChange: CalculatorResultCallback }) {
  const [unit, setUnit] = useState<TempInputUnit>("C")
  const [val, setVal] = useState("25")

  useEffect(() => {
    const v = parseFloat(val)
    if (!Number.isFinite(v)) {
      onResultChange({ text: null, latex: null, error: null })
      return
    }
    const r = temperatureTriple(v, unit)
    if (!r.ok) {
      onResultChange({ text: null, latex: null, error: r.error })
      return
    }
    onResultChange({ text: formatResultForNote(r), latex: r.latexFormula, error: null })
  }, [val, unit, onResultChange])

  return (
    <div className="space-y-2">
      <div className="grid gap-1.5">
        <Label className="text-xs">Known unit</Label>
        <Select value={unit} onValueChange={(v) => setUnit(v as TempInputUnit)}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="z-[280]">
            <SelectItem value="C">°C</SelectItem>
            <SelectItem value="F">°F</SelectItem>
            <SelectItem value="K">K</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="calc-temp" className="text-xs">
          Temperature
        </Label>
        <Input
          id="calc-temp"
          type="number"
          step="any"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          className="h-8 text-sm"
        />
      </div>
    </div>
  )
}
