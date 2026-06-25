'use client'

import { useEffect, useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { SlidersHorizontal, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  type AiResultFilters,
  type AiSortMode,
  type PaperType,
  PAPER_TYPE_LABELS,
  PAPER_TYPE_ORDER,
  DEFAULT_AI_FILTERS,
  countActiveFilters,
} from '@/lib/ai-search-filters'

const CITATION_PRESETS = [10, 50, 100, 500]

function toYear(v: string): number | null {
  const n = parseInt(v, 10)
  return Number.isFinite(n) && n >= 1800 && n <= 2100 ? n : null
}

/**
 * A free-typing year field. Holds its own raw text so partial input (e.g. "2",
 * "20", "202" on the way to "2024") is never wiped — only complete, in-range
 * years are committed to the filter. Normalizes on blur.
 */
function YearField({
  value,
  placeholder,
  onCommit,
}: {
  value: number | null
  placeholder: string
  onCommit: (year: number | null) => void
}) {
  const [text, setText] = useState(value != null ? String(value) : '')

  // Reflect external changes (e.g. "Clear") without clobbering active typing.
  useEffect(() => {
    setText((prev) => (toYear(prev) === value ? prev : value != null ? String(value) : ''))
  }, [value])

  return (
    <Input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      maxLength={4}
      placeholder={placeholder}
      className="h-8 tabular-nums"
      value={text}
      onChange={(e) => {
        const digits = e.target.value.replace(/[^0-9]/g, '').slice(0, 4)
        setText(digits)
        onCommit(toYear(digits))
      }}
      onBlur={() => {
        const y = toYear(text)
        setText(y != null ? String(y) : '')
        onCommit(y)
      }}
    />
  )
}

export function AiSearchFilters({
  value,
  onChange,
  triggerClassName,
  journals = [],
  yearHint = null,
}: {
  value: AiResultFilters
  onChange: (next: AiResultFilters) => void
  /** Override the trigger button sizing (e.g. compact `h-8` near results). */
  triggerClassName?: string
  /** Journal/Source options derived from the current result set. */
  journals?: string[]
  /** Min/max year present in the results — grounds the year-range placeholders. */
  yearHint?: { min: number; max: number } | null
}) {
  const active = countActiveFilters(value)
  const set = (patch: Partial<AiResultFilters>) => onChange({ ...value, ...patch })
  const toggleType = (t: PaperType) =>
    set({ types: value.types.includes(t) ? value.types.filter((x) => x !== t) : [...value.types, t] })
  const toggleJournal = (j: string) =>
    set({ journals: value.journals.includes(j) ? value.journals.filter((x) => x !== j) : [...value.journals, j] })

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn('h-11 gap-1.5', triggerClassName)}>
          <SlidersHorizontal className="size-4" />
          Filters
          {active > 0 && (
            <Badge variant="secondary" className="ml-0.5 h-5 min-w-5 justify-center rounded-full px-1 text-2xs tabular-nums">
              {active}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={8}
        collisionPadding={12}
        className="w-[20rem] max-w-[calc(100vw-1.5rem)] max-h-[min(70vh,32rem)] overflow-y-auto rounded-xl p-0 shadow-lg"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">Filters</span>
            {active > 0 && (
              <Badge variant="secondary" className="h-5 rounded-full px-1.5 text-2xs tabular-nums">
                {active} active
              </Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="-mr-2 h-7 gap-1 px-2 text-muted-foreground hover:text-foreground"
            onClick={() => onChange(DEFAULT_AI_FILTERS)}
            disabled={active === 0}
          >
            <X className="size-3.5" />
            Clear
          </Button>
        </div>

        <div className="space-y-4 p-4">
          {/* Sort */}
          <div className="grid grid-cols-[5rem_1fr] items-center gap-3">
            <Label className="text-xs text-muted-foreground">Sort by</Label>
            <Select value={value.sort} onValueChange={(v) => set({ sort: v as AiSortMode })}>
              <SelectTrigger size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="relevance">Most relevant</SelectItem>
                <SelectItem value="cited">Most cited</SelectItem>
                <SelectItem value="recent">Newest first</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Citations — typeable count + quick presets */}
          <div className="grid grid-cols-[5rem_1fr] items-start gap-3">
            <Label className="pt-1.5 text-xs text-muted-foreground">Citations</Label>
            <div className="space-y-1.5">
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                placeholder="Any (min count)"
                className="h-8"
                value={value.minCitations ?? ''}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10)
                  set({ minCitations: Number.isFinite(n) && n >= 0 ? n : null })
                }}
              />
              <div className="flex flex-wrap gap-1">
                {CITATION_PRESETS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => set({ minCitations: value.minCitations === n ? null : n })}
                    className={cn(
                      'rounded-full border px-2 py-0.5 text-2xs font-medium transition-colors',
                      value.minCitations === n
                        ? 'border-primary/40 bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    {n}+
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Year range */}
          <div className="grid grid-cols-[5rem_1fr] items-center gap-3">
            <Label className="text-xs text-muted-foreground">Year</Label>
            <div className="flex items-center gap-2">
              <YearField
                value={value.yearFrom}
                placeholder={yearHint ? String(yearHint.min) : 'From'}
                onCommit={(yearFrom) =>
                  set(
                    yearFrom != null && value.yearTo != null && yearFrom > value.yearTo
                      ? { yearFrom, yearTo: yearFrom }
                      : { yearFrom },
                  )
                }
              />
              <span className="text-muted-foreground">–</span>
              <YearField
                value={value.yearTo}
                placeholder={yearHint ? String(yearHint.max) : 'To'}
                onCommit={(yearTo) =>
                  set(
                    yearTo != null && value.yearFrom != null && yearTo < value.yearFrom
                      ? { yearTo, yearFrom: yearTo }
                      : { yearTo },
                  )
                }
              />
            </div>
          </div>

          <Separator />

          {/* Type of work — pill toggles */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Type of work</Label>
            <div className="flex flex-wrap gap-1.5">
              {PAPER_TYPE_ORDER.map((t) => {
                const selected = value.types.includes(t)
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleType(t)}
                    aria-pressed={selected}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                      selected
                        ? 'border-primary/40 bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    {PAPER_TYPE_LABELS[t]}
                  </button>
                )
              })}
            </div>
          </div>

          {journals.length > 0 && (
            <>
              <Separator />
              {/* Journal / Source — options derived from the current results */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Journal / source</Label>
                <div className="flex flex-wrap gap-1.5">
                  {journals.map((j) => {
                    const selected = value.journals.includes(j)
                    return (
                      <button
                        key={j}
                        type="button"
                        onClick={() => toggleJournal(j)}
                        aria-pressed={selected}
                        title={j}
                        className={cn(
                          'max-w-full truncate rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                          selected
                            ? 'border-primary/40 bg-primary/10 text-primary'
                            : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
                        )}
                      >
                        {j}
                      </button>
                    )
                  })}
                </div>
              </div>
            </>
          )}

          <Separator />

          {/* Open access */}
          <div className="flex items-center justify-between">
            <Label htmlFor="ai-oa" className="text-sm font-normal">
              Open access only
            </Label>
            <Switch
              id="ai-oa"
              checked={value.openAccessOnly}
              onCheckedChange={(c) => set({ openAccessOnly: c })}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
