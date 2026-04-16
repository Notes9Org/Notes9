"use client"

import type { ReactNode } from "react"

import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

/** Sentinel value for “no filter” (must not collide with real UUIDs). */
export const FILTER_ALL = "all"

export type ResourceFilterOption = { value: string; label: string }

type ResourceListFilterProps = {
  label: string
  value: string
  onValueChange: (v: string) => void
  options: ResourceFilterOption[]
  allLabel: string
  className?: string
  triggerClassName?: string
}

export function ResourceListFilter({
  label,
  value,
  onValueChange,
  options,
  allLabel,
  className,
  triggerClassName,
}: ResourceListFilterProps) {
  return (
    <div className={cn("flex min-w-0 max-w-full flex-col gap-1.5", className)}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className={cn("h-9", triggerClassName)} aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={FILTER_ALL}>{allLabel}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export function ResourceFilterRow({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 flex flex-col gap-3 border-b border-border/60 pb-4 sm:flex-row sm:flex-wrap sm:items-end">
      {children}
    </div>
  )
}
