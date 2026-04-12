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
import { idealGasSolve, type IdealGasUnknown } from "@/lib/lab-calculations/ideal-gas"

import { formatResultForNote, type CalculatorResultCallback } from "../calc-types"

const LABEL: Record<IdealGasUnknown, string> = {
  P: "P (atm)",
  V: "V (L)",
  n: "n (mol)",
  T: "T (K)",
}

export function IdealGasPanel({ onResultChange }: { onResultChange: CalculatorResultCallback }) {
  const [unknown, setUnknown] = useState<IdealGasUnknown>("V")
  const [p, setP] = useState("1")
  const [v, setV] = useState("")
  const [n, setN] = useState("1")
  const [t, setT] = useState("273")

  useEffect(() => {
    const parseOpt = (s: string, u: IdealGasUnknown): number | undefined => {
      if (unknown === u) return undefined
      const x = parseFloat(s)
      return Number.isFinite(x) ? x : undefined
    }

    const pP = parseOpt(p, "P")
    const pV = parseOpt(v, "V")
    const pN = parseOpt(n, "n")
    const pT = parseOpt(t, "T")

    const count = [pP, pV, pN, pT].filter((x) => x !== undefined).length
    if (count !== 3) {
      onResultChange({ text: null, latex: null, error: null })
      return
    }

    const r = idealGasSolve({
      P: pP,
      V: pV,
      n: pN,
      T: pT,
      unknown,
    })
    if (!r.ok) {
      onResultChange({ text: null, latex: null, error: r.error })
      return
    }
    onResultChange({ text: formatResultForNote(r), latex: r.latexFormula, error: null })
  }, [p, v, n, t, unknown, onResultChange])

  const field = (key: IdealGasUnknown, value: string, set: (s: string) => void) => {
    const isUn = unknown === key
    return (
      <div className="grid gap-1.5">
        <Label className={`text-xs ${isUn ? "text-primary" : ""}`}>{LABEL[key]}</Label>
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
            const next = v as IdealGasUnknown
            setUnknown(next)
            if (next === "P") setP("")
            if (next === "V") setV("")
            if (next === "n") setN("")
            if (next === "T") setT("")
          }}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="z-[280]">
            <SelectItem value="P">P — pressure (atm)</SelectItem>
            <SelectItem value="V">V — volume (L)</SelectItem>
            <SelectItem value="n">n — amount (mol)</SelectItem>
            <SelectItem value="T">T — temperature (K)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <p className="text-[10px] leading-snug text-muted-foreground">
        PV = nRT, R = 0.082057 L·atm/(mol·K). Leave one field empty.
      </p>
      {field("P", p, setP)}
      {field("V", v, setV)}
      {field("n", n, setN)}
      {field("T", t, setT)}
    </div>
  )
}
