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
import { massFromMoles } from "@/lib/lab-calculations"
import { resolveMolecularWeightInput } from "@/lib/lab-calculations/molecular-weight-data"
import type { MassUnit, MoleUnit } from "@/lib/lab-calculations/units"
import { MolecularWeightField } from "../molecular-weight-field"
import { formatResultForNote, type CalculatorResultCallback } from "../calc-types"

export function MassFromMolesPanel({
  onResultChange,
}: {
  onResultChange: CalculatorResultCallback
}) {
  const [moles, setMoles] = useState("0.01")
  const [mw, setMw] = useState("100")
  const [moleUnit, setMoleUnit] = useState<MoleUnit>("mol")
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
    const n = parseFloat(moles)
    if (!Number.isFinite(n) || n <= 0) {
      onResultChange({ text: null, latex: null, error: null })
      return
    }
    const r = massFromMoles(n, moleUnit, w, massUnit)
    if (!r.ok) {
      onResultChange({ text: null, latex: null, error: r.error })
      return
    }
    onResultChange({ text: formatResultForNote(r), latex: r.latexFormula, error: null })
  }, [moles, mw, moleUnit, massUnit, mwRes, onResultChange])

  return (
    <div className="space-y-2">
      <div className="grid gap-1.5">
        <Label htmlFor="calc-n" className="text-xs">
          Amount (n)
        </Label>
        <div className="flex gap-2">
          <Input
            id="calc-n"
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
      <MolecularWeightField
        id="calc-mfm-mw"
        datalistId="calc-mfm-mw-dl"
        label="MW (g/mol)"
        value={mw}
        onChange={setMw}
        resolved={mwRes}
        className="h-8 text-sm"
      />
      <div className="grid gap-1.5">
        <Label className="text-xs">Mass unit</Label>
        <Select value={massUnit} onValueChange={(v) => setMassUnit(v as MassUnit)}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="z-[280]">
            <SelectItem value="g">g</SelectItem>
            <SelectItem value="mg">mg</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
