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
import { beerLambertSolve, type BeerLambertUnknown } from "@/lib/lab-calculations/beer-lambert"
import { formatResultForNote, type CalculatorResultCallback } from "../calc-types"

const LABEL: Record<BeerLambertUnknown, string> = {
  A: "A (absorbance)",
  epsilon: "ε (L/(mol·cm))",
  l: "l (cm)",
  c: "c (mol/L)",
}

export function BeerLambertPanel({ onResultChange }: { onResultChange: CalculatorResultCallback }) {
  const [unknown, setUnknown] = useState<BeerLambertUnknown>("c")
  const [A, setA] = useState("0.5")
  const [epsilon, setEpsilon] = useState("1000")
  const [l, setL] = useState("1")
  const [c, setC] = useState("")

  useEffect(() => {
    const parseOpt = (s: string, u: BeerLambertUnknown): number | undefined => {
      if (unknown === u) return undefined
      const x = parseFloat(s)
      return Number.isFinite(x) ? x : undefined
    }

    const pA = parseOpt(A, "A")
    const pE = parseOpt(epsilon, "epsilon")
    const pL = parseOpt(l, "l")
    const pC = parseOpt(c, "c")

    const count = [pA, pE, pL, pC].filter((x) => x !== undefined).length
    if (count !== 3) {
      onResultChange({ text: null, latex: null, error: null })
      return
    }

    const r = beerLambertSolve({
      A: pA,
      epsilon: pE,
      l: pL,
      c: pC,
      unknown,
    })
    if (!r.ok) {
      onResultChange({ text: null, latex: null, error: r.error })
      return
    }
    onResultChange({ text: formatResultForNote(r), latex: r.latexFormula, error: null })
  }, [A, epsilon, l, c, unknown, onResultChange])

  const field = (key: BeerLambertUnknown, value: string, set: (s: string) => void) => {
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
            const next = v as BeerLambertUnknown
            setUnknown(next)
            if (next === "A") setA("")
            if (next === "epsilon") setEpsilon("")
            if (next === "l") setL("")
            if (next === "c") setC("")
          }}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="z-[280]">
            <SelectItem value="A">A — absorbance</SelectItem>
            <SelectItem value="epsilon">ε — molar absorptivity</SelectItem>
            <SelectItem value="l">l — path length (cm)</SelectItem>
            <SelectItem value="c">c — concentration (M)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <p className="text-[10px] text-muted-foreground">A = ε l c. Leave one unknown blank.</p>
      {field("A", A, setA)}
      {field("epsilon", epsilon, setEpsilon)}
      {field("l", l, setL)}
      {field("c", c, setC)}
    </div>
  )
}
