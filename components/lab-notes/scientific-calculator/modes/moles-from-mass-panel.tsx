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
import { molesFromMass } from "@/lib/lab-calculations"
import { resolveMolecularWeightInput } from "@/lib/lab-calculations/molecular-weight-data"
import type { MassUnit } from "@/lib/lab-calculations/units"
import { MolecularWeightField } from "../molecular-weight-field"
import { formatResultForNote, type CalculatorResultCallback } from "../calc-types"

export function MolesFromMassPanel({
  onResultChange,
}: {
  onResultChange: CalculatorResultCallback
}) {
  const [mass, setMass] = useState("1")
  const [mw, setMw] = useState("100")
  const [massUnit, setMassUnit] = useState<MassUnit>("g")

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
    if (!Number.isFinite(m) || m <= 0) {
      onResultChange({ text: null, latex: null, error: null })
      return
    }
    const r = molesFromMass(m, massUnit, w)
    if (!r.ok) {
      onResultChange({ text: null, latex: null, error: r.error })
      return
    }
    onResultChange({ text: formatResultForNote(r), latex: r.latexFormula, error: null })
  }, [mass, mw, massUnit, mwRes, onResultChange])

  return (
    <div className="space-y-2">
      <div className="grid gap-1.5">
        <Label htmlFor="calc-mass" className="text-xs">
          Mass (m)
        </Label>
        <div className="flex gap-2">
          <Input
            id="calc-mass"
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
        id="calc-moles-mw"
        datalistId="calc-moles-mw-dl"
        label="MW (g/mol)"
        value={mw}
        onChange={setMw}
        resolved={mwRes}
        className="h-8 text-sm"
      />
    </div>
  )
}
