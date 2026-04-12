"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  listMolecularWeightPrimaryNames,
  type ResolvedMwInput,
} from "@/lib/lab-calculations/molecular-weight-data"

const PRIMARY_NAMES = listMolecularWeightPrimaryNames()

type MolecularWeightFieldProps = {
  id: string
  datalistId: string
  label: string
  value: string
  onChange: (value: string) => void
  resolved: ResolvedMwInput
  className?: string
}

export function MolecularWeightField({
  id,
  datalistId,
  label,
  value,
  onChange,
  resolved,
  className,
}: MolecularWeightFieldProps) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        list={datalistId}
        placeholder="g/mol or name, e.g. NaCl"
        className={className ?? "h-8 text-sm"}
      />
      <datalist id={datalistId}>
        {PRIMARY_NAMES.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      {resolved.ok === true && resolved.source === "compound" && (
        <p className="text-[10px] text-muted-foreground">
          Using {resolved.compoundName}: {resolved.mw} g/mol
        </p>
      )}
    </div>
  )
}
