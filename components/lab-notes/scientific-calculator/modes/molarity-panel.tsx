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
import { molarityFromMolesVolume } from "@/lib/lab-calculations"
import type { MoleUnit, VolumeUnit } from "@/lib/lab-calculations/units"
import { formatResultForNote, type CalculatorResultCallback } from "../calc-types"

export function MolarityPanel({
  onResultChange,
}: {
  onResultChange: CalculatorResultCallback
}) {
  const [moles, setMoles] = useState("0.1")
  const [vol, setVol] = useState("1")
  const [moleUnit, setMoleUnit] = useState<MoleUnit>("mmol")
  const [volUnit, setVolUnit] = useState<VolumeUnit>("mL")

  useEffect(() => {
    const n = parseFloat(moles)
    const v = parseFloat(vol)
    const nOk = Number.isFinite(n) && n > 0
    const vOk = Number.isFinite(v) && v > 0
    if (!nOk || !vOk) {
      onResultChange({ text: null, latex: null, error: null })
      return
    }
    const r = molarityFromMolesVolume(n, moleUnit, v, volUnit)
    if (!r.ok) {
      onResultChange({ text: null, latex: null, error: r.error })
      return
    }
    onResultChange({ text: formatResultForNote(r), latex: r.latexFormula, error: null })
  }, [moles, vol, moleUnit, volUnit, onResultChange])

  return (
    <div className="space-y-2">
      <div className="grid gap-1.5">
        <Label htmlFor="calc-moles" className="text-xs">
          Amount (n)
        </Label>
        <div className="flex gap-2">
          <Input
            id="calc-moles"
            type="number"
            step="any"
            min={0}
            value={moles}
            onChange={(e) => setMoles(e.target.value)}
            className="h-8 min-w-0 flex-1 text-sm"
          />
          <Select value={moleUnit} onValueChange={(v) => setMoleUnit(v as MoleUnit)}>
            <SelectTrigger className="h-8 w-[92px] shrink-0 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-[280]">
              <SelectItem value="mol">mol</SelectItem>
              <SelectItem value="mmol">mmol</SelectItem>
              <SelectItem value="µmol">µmol</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="calc-vol" className="text-xs">
          Volume (V)
        </Label>
        <div className="flex gap-2">
          <Input
            id="calc-vol"
            type="number"
            step="any"
            min={0}
            value={vol}
            onChange={(e) => setVol(e.target.value)}
            className="h-8 min-w-0 flex-1 text-sm"
          />
          <Select value={volUnit} onValueChange={(v) => setVolUnit(v as VolumeUnit)}>
            <SelectTrigger className="h-8 w-[92px] shrink-0 text-xs">
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
    </div>
  )
}
