"use client"

import { useCallback, useEffect, useState, type ReactNode } from "react"
import type { CalcHistoryEntry, CalculatorModeId } from "./calc-types"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Copy, CornerDownLeft, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// localStorage persistence
// ---------------------------------------------------------------------------
const STORAGE_KEY = "notes9_calc_history"
const MAX_ENTRIES = 50

function loadHistory(): CalcHistoryEntry[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.slice(0, MAX_ENTRIES) as CalcHistoryEntry[]
  } catch (err) {
    console.warn("calc-history: failed to load history from localStorage", err)
    return []
  }
}

function persistHistory(entries: CalcHistoryEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)))
  } catch (err) {
    // Most likely a quota error (or storage disabled in private mode). The
    // in-memory history still works; we just couldn't persist it. Surface it
    // for observability instead of dropping silently.
    console.warn("calc-history: failed to persist history to localStorage", err)
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useCalcHistory() {
  const [entries, setEntries] = useState<CalcHistoryEntry[]>([])

  // Load on mount
  useEffect(() => {
    setEntries(loadHistory())
  }, [])

  const addEntry = useCallback(
    (mode: CalculatorModeId, modeLabel: string, resultText: string, latex: string | null) => {
      const entry: CalcHistoryEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: Date.now(),
        mode,
        modeLabel,
        resultText,
        latex,
      }
      setEntries((prev) => {
        const next = [entry, ...prev].slice(0, MAX_ENTRIES)
        persistHistory(next)
        return next
      })
      return entry
    },
    [],
  )

  const clearHistory = useCallback(() => {
    setEntries([])
    persistHistory([])
  }, [])

  const removeEntry = useCallback((id: string) => {
    setEntries((prev) => {
      const next = prev.filter((e) => e.id !== id)
      persistHistory(next)
      return next
    })
  }, [])

  return { entries, addEntry, clearHistory, removeEntry }
}

// ---------------------------------------------------------------------------
// Panel UI
// ---------------------------------------------------------------------------
function formatTimestamp(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const isYesterday = d.toDateString() === yesterday.toDateString()

  const time = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })
  if (isToday) return `Today ${time}`
  if (isYesterday) return `Yesterday ${time}`
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

/** Badge colours per mode group */
function modeBadgeClass(mode: CalculatorModeId): string {
  if (mode === "numericKeypad" || mode === "numericSci") return "bg-blue-500/15 text-blue-600 dark:text-blue-400"
  if (["molarity", "molarityMassVol", "molesFromMass", "massFromMoles", "dilution", "stockDilution"].includes(mode))
    return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
  if (["hhBuffer", "phIon", "beerLambert"].includes(mode)) return "bg-purple-500/15 text-purple-600 dark:text-purple-400"
  return "bg-orange-500/15 text-orange-600 dark:text-orange-400"
}

export function CalcHistoryPanel({
  entries,
  onClear,
  onInsert,
  onCopy,
}: {
  entries: CalcHistoryEntry[]
  onClear: () => void
  onInsert: (entry: CalcHistoryEntry) => void
  onCopy: (text: string) => void
}) {
  if (entries.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-8 text-center">
        <div className="rounded-full bg-muted/60 p-3">
          <CornerDownLeft className="size-5 text-muted-foreground/60" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">No calculations yet</p>
        <p className="text-xs text-muted-foreground/70">
          Results from calculations will appear here
        </p>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border/40 px-3 py-1.5">
        <span className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
          {entries.length} calculation{entries.length !== 1 ? "s" : ""}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 gap-1 px-2 text-2xs text-muted-foreground hover:text-destructive"
          onClick={onClear}
        >
          <Trash2 className="size-3" />
          Clear
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="divide-y divide-border/30">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="group relative px-3 py-2.5 transition-colors hover:bg-muted/30"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-3xs font-medium",
                        modeBadgeClass(entry.mode),
                      )}
                    >
                      {entry.modeLabel}
                    </span>
                    <span className="text-3xs text-muted-foreground/60">
                      {formatTimestamp(entry.timestamp)}
                    </span>
                  </div>
                  <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-xs leading-snug text-foreground/90">
                    {entry.resultText.length > 200
                      ? entry.resultText.slice(0, 200) + "…"
                      : entry.resultText}
                  </pre>
                </div>
                <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-foreground"
                    onClick={() => onCopy(entry.resultText)}
                    title="Copy result"
                  >
                    <Copy className="size-3" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-foreground"
                    onClick={() => onInsert(entry)}
                    title="Insert at cursor"
                  >
                    <CornerDownLeft className="size-3" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
