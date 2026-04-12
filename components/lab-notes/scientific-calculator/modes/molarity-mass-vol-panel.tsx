"use client"

import { useEffect, useMemo, useState } from "react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { molarityFromMassVolume } from "@/lib/lab-calculations/molarity-mass-vol"
import { resolveMolecularWeightInput } from "@/lib/lab-calculations/molecular-weight-data"
import type { MassUnit, VolumeUnit } from "@/lib/lab-calculations/units"
import { MolecularWeightField } from "../molecular-weight-field"
import { formatResultForNote, type CalculatorResultCallback } from "../calc-types"

export function MolarityMassVolPanel({ onResultChange }: { onResultChange: CalculatorResultCallback }) {
  const [mass, setMass] = useState("0.5")
  const [mw, setMw] = useState("100")
  const [vol, setVol] = useState("100")
  const [massUnit, setMassUnit] = useState<MassUnit>("g")
  const [volUnit, setVolUnit] = useState<VolumeUnit>("mL")

  const mwRes = useMemo(() => resolveMolecularWeightInput(mw), [mw])

  useEffect(() => {
    if (mwRes.ok === "empty") {
      onResultChange({ text: null, latex: null, error: null })
      return
    }
    if (mwRes.ok === false) {
      onResultChange({ text: null, latex: null, error: mwRes.message })
      return
    }
    const w = mwRes.mw
    const m = parseFloat(mass)
    const v = parseFloat(vol)
    if (!Number.isFinite(m) || !Number.isFinite(v)) {
      onResultChange({ text: null, latex: null, error: null })
      return
    }
    const r = molarityFromMassVolume(m, massUnit, w, v, volUnit)
    if (!r.ok) {
      onResultChange({ text: null, latex: null, error: r.error })
      return
    }
    onResultChange({ text: formatResultForNote(r), latex: r.latexFormula, error: null })
  }, [mass, mw, vol, massUnit, volUnit, mwRes, onResultChange])

  return (
    <div className="space-y-2">
      <div className="grid gap-1.5">
        <Label htmlFor="calc-mmv-m" className="text-xs">
          Mass of solute
        </Label>
        <div className="flex gap-2">
          <Input
            id="calc-mmv-m"
            type="number"
            step="any"
            min={0}
            value={mass}
            onChange={(e) => setMass(e.target.value)}
            className="h-8 min-w-0 flex-1 text-sm"
          />
          <Select value={massUnit} onValueChange={(v) => setMassUnit(v as MassUnit)}>
            <SelectTrigger className="h-8 w-[92px] shrink-0 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-[280]">
              <SelectItem value="g">g</SelectItem>
              <SelectItem value="mg">mg</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <MolecularWeightField
        id="calc-mmv-mw"
        datalistId="calc-mmv-mw-dl"
        label="Formula weight (g/mol)"
        value={mw}
        onChange={setMw}
        resolved={mwRes}
        className="h-8 text-sm"
      />
      <div className="grid gap-1.5">
        <Label htmlFor="calc-mmv-v" className="text-xs">
          Solution volume
        </Label>
        <div className="flex gap-2">
          <Input
            id="calc-mmv-v"
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
