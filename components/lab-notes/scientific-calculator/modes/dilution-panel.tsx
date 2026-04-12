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
import { solveDilution, type DilutionUnknown } from "@/lib/lab-calculations"
import type { ConcUnit, VolumeUnit } from "@/lib/lab-calculations/units"
import { formatResultForNote, type CalculatorResultCallback } from "../calc-types"

const UNKNOWN_LABEL: Record<DilutionUnknown, string> = {
  C1: "C1 (stock conc.)",
  V1: "V1 (stock volume)",
  C2: "C2 (final conc.)",
  V2: "V2 (final volume)",
}

export function DilutionPanel({
  onResultChange,
}: {
  onResultChange: CalculatorResultCallback
}) {
  const [unknown, setUnknown] = useState<DilutionUnknown>("V2")
  const [c1, setC1] = useState("1")
  const [v1, setV1] = useState("1")
  const [c2, setC2] = useState("0.5")
  const [v2, setV2] = useState("")
  const [concUnit, setConcUnit] = useState<ConcUnit>("M")
  const [volUnit, setVolUnit] = useState<VolumeUnit>("mL")

  useEffect(() => {
    const parseOpt = (s: string, isUnknown: boolean): number | undefined => {
      if (isUnknown) return undefined
      const x = parseFloat(s)
      return Number.isFinite(x) ? x : undefined
    }

    const uC1 = unknown === "C1"
    const uV1 = unknown === "V1"
    const uC2 = unknown === "C2"
    const uV2 = unknown === "V2"

    const pC1 = parseOpt(c1, uC1)
    const pV1 = parseOpt(v1, uV1)
    const pC2 = parseOpt(c2, uC2)
    const pV2 = parseOpt(v2, uV2)

    const count =
      (pC1 !== undefined ? 1 : 0) +
      (pV1 !== undefined ? 1 : 0) +
      (pC2 !== undefined ? 1 : 0) +
      (pV2 !== undefined ? 1 : 0)
    if (count !== 3) {
      onResultChange({ text: null, latex: null, error: null })
      return
    }

    const r = solveDilution({
      C1: pC1,
      V1: pV1,
      C2: pC2,
      V2: pV2,
      concUnit,
      volUnit,
      unknown,
    })
    if (!r.ok) {
      onResultChange({ text: null, latex: null, error: r.error })
      return
    }
    onResultChange({ text: formatResultForNote(r), latex: r.latexFormula, error: null })
  }, [c1, v1, c2, v2, unknown, concUnit, volUnit, onResultChange])

  const field = (key: DilutionUnknown, value: string, set: (s: string) => void) => {
    const isUn = unknown === key
    return (
      <div className="grid gap-1.5">
        <Label className={`text-xs ${isUn ? "text-primary" : ""}`}>{UNKNOWN_LABEL[key]}</Label>
        <Input
          type="number"
          step="any"
          min={0}
          value={value}
          onChange={(e) => set(e.target.value)}
          disabled={isUn}
          placeholder={isUn ? "Solved" : ""}
          className={`h-8 text-sm ${isUn ? "bg-muted/50" : ""}`}
        />
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="grid gap-1.5">
        <Label className="text-xs">Solve for</Label>
        <Select
          value={unknown}
          onValueChange={(v) => {
            const next = v as DilutionUnknown
            setUnknown(next)
            if (next === "C1") setC1("")
            if (next === "V1") setV1("")
            if (next === "C2") setC2("")
            if (next === "V2") setV2("")
          }}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="z-[280]">
            <SelectItem value="C1">C1 — initial concentration</SelectItem>
            <SelectItem value="V1">V1 — initial volume</SelectItem>
            <SelectItem value="C2">C2 — final concentration</SelectItem>
            <SelectItem value="V2">V2 — final volume</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-1.5">
          <Label className="text-[10px] text-muted-foreground">Conc. unit</Label>
          <Select value={concUnit} onValueChange={(v) => setConcUnit(v as ConcUnit)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-[280]">
              <SelectItem value="M">M (mol/L)</SelectItem>
              <SelectItem value="mM">mM</SelectItem>
              <SelectItem value="µM">µM</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-[10px] text-muted-foreground">Vol. unit</Label>
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
      <p className="text-[10px] leading-snug text-muted-foreground">
        C1×V1 = C2×V2. Leave the solved field empty.
      </p>
      {field("C1", c1, setC1)}
      {field("V1", v1, setV1)}
      {field("C2", c2, setC2)}
      {field("V2", v2, setV2)}
    </div>
  )
}
