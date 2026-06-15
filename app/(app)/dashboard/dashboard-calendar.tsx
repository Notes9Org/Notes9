"use client"

import { useEffect, useMemo, useRef, useState, useTransition, type KeyboardEvent } from "react"
import { ChevronLeft, ChevronRight, Clock, Pencil, Plus, Trash2, X } from "lucide-react"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"
import {
  createCalendarEvent,
  deleteCalendarEvent,
  listCalendarEventsForDay,
  setCalendarEventDone,
  updateCalendarEvent,
  type CalendarEvent,
  type EventTone,
} from "@/lib/calendar-events"

type Row = {
  id: string
  user_id: string
  project_id: string | null
  experiment_id: string | null
  title: string
  meta: string | null
  start_at: string
  end_at: string | null
  tone: "ink" | "leaf" | "accent" | "warning"
  done: boolean
  created_at: string
  updated_at: string
}

const HOURS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23] as const
const HOUR_HEIGHT = 56 // px per row, must match the inline style

function isSameLocalDay(iso: string, ref: Date): boolean {
  const d = new Date(iso)
  return (
    d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate()
  )
}

/** Sunday-anchored start of the week containing `d`. */
function startOfWeek(d: Date): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  out.setDate(out.getDate() - out.getDay())
  return out
}

/** Sunday-anchored start of the calendar-month grid containing `d`. */
function startOfMonthGrid(d: Date): Date {
  const firstOfMonth = new Date(d.getFullYear(), d.getMonth(), 1)
  return startOfWeek(firstOfMonth)
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d)
  out.setDate(out.getDate() + n)
  return out
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const

function toCalendarEvent(r: Row): CalendarEvent {
  return {
    id: r.id,
    userId: r.user_id,
    projectId: r.project_id,
    experimentId: r.experiment_id,
    title: r.title,
    meta: r.meta,
    startAt: r.start_at,
    endAt: r.end_at,
    tone: r.tone,
    done: r.done,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

function decimalHourOf(iso: string): number {
  const d = new Date(iso)
  return d.getHours() + d.getMinutes() / 60
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
}

const TONE_COLOR: Record<CalendarEvent["tone"], string> = {
  ink: "var(--foreground)",
  leaf: "#5e7a4a",
  accent: "var(--n9-accent)",
  warning: "#c0563f",
}

const TONE_OPTIONS: { value: EventTone; label: string }[] = [
  { value: "ink", label: "Ink" },
  { value: "leaf", label: "Sage" },
  { value: "accent", label: "Accent" },
  { value: "warning", label: "Warn" },
]

const DURATION_OPTIONS = [
  { value: 30, label: "30 min" },
  { value: 60, label: "1 hr" },
  { value: 90, label: "1.5 hr" },
  { value: 120, label: "2 hr" },
] as const

/** "10:30" formatter from an ISO string, in the user's local zone. */
function toLocalTimeInput(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

/** Build an ISO string for "today @ HH:MM" using the reference Date for the day. */
function localTimeToIso(timeStr: string, ref: Date): string {
  const [h, m] = timeStr.split(":").map((n) => parseInt(n, 10))
  const d = new Date(ref)
  d.setHours(Number.isFinite(h) ? h : 9, Number.isFinite(m) ? m : 0, 0, 0)
  return d.toISOString()
}

export function DashboardCalendar({
  initialEvents,
  embedded = false,
}: {
  initialEvents: Row[]
  embedded?: boolean
}) {
  const [events, setEvents] = useState<CalendarEvent[]>(() =>
    initialEvents.map(toCalendarEvent)
  )
  const [now, setNow] = useState<number | null>(null)
  const [today, setToday] = useState<Date | null>(null)
  /** The visible day — defaults to today on mount, but the user can navigate
      with the ← Today → controls. Drives event filtering and the new-event
      default date. */
  const [viewDay, setViewDay] = useState<Date | null>(null)
  /** When viewDay isn't today, fetch its events client-side (the server
      initial-fetch only brackets ±36h around "now"). */
  const [loadingDay, setLoadingDay] = useState(false)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState("")
  /** Apple-Calendar-style in-place create. When the user double-clicks an
      empty slot, a Popover anchored to that slot opens with title + start +
      duration + tone fields. Null means "no quick-add open." */
  const [quickAdd, setQuickAdd] = useState<{
    day: Date
    hour: number
    minute: number
    title: string
    durationMin: number
    tone: EventTone
  } | null>(null)
  /** Day / Week / Month — drives the layout below the controls strip. */
  const [view, setView] = useState<"day" | "week" | "month">("day")
  /** New-event composer controls: tone + duration. Defaults match the previous
      hard-coded behavior (ink, 30-min) so existing users see no surprise. */
  const [draftTone, setDraftTone] = useState<EventTone>("ink")
  const [draftDurationMin, setDraftDurationMin] = useState<number>(30)
  /** Inline edit popover. `editingId` keys the popover to a specific card; the
      draft fields are seeded from that event when it opens. */
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState("")
  const [editStart, setEditStart] = useState("")
  const [editEnd, setEditEnd] = useState("")
  const [editTone, setEditTone] = useState<EventTone>("ink")
  /** AlertDialog for delete confirms — silent hover-X delete was destructive
      and reversible only by manual recreation. */
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const initialScrollDone = useRef(false)

  useEffect(() => {
    function tick() {
      const d = new Date()
      setNow(d.getHours() + d.getMinutes() / 60)
      // Lift "today" into state so SSR can't fix a stale calendar reference
      // across midnight; tick (every 30s) is plenty granular for a date roll.
      setToday((prev) => {
        if (
          prev &&
          prev.getFullYear() === d.getFullYear() &&
          prev.getMonth() === d.getMonth() &&
          prev.getDate() === d.getDate()
        ) {
          return prev
        }
        return d
      })
      setViewDay((prev) => prev ?? d)
    }
    tick()
    const id = setInterval(tick, 30_000)
    return () => clearInterval(id)
  }, [])

  // Compute the visible date range based on view + viewDay so week/month
  // views can fetch (and filter) the right window.
  const visibleRange = useMemo(() => {
    if (!viewDay) return null
    if (view === "day") {
      const s = new Date(viewDay)
      s.setHours(0, 0, 0, 0)
      const e = new Date(viewDay)
      e.setHours(23, 59, 59, 999)
      return { start: s, end: e }
    }
    if (view === "week") {
      const s = startOfWeek(viewDay)
      const e = addDays(s, 7)
      e.setMilliseconds(-1)
      return { start: s, end: e }
    }
    // month
    const s = startOfMonthGrid(viewDay)
    const e = addDays(s, 42)
    e.setMilliseconds(-1)
    return { start: s, end: e }
  }, [view, viewDay])

  // When the visible range moves off the server's initial ±36h, refetch.
  useEffect(() => {
    if (!visibleRange) return
    const { start, end } = visibleRange
    // Skip the refetch if the entire range is already inside ±36h of "now".
    const nowMs = Date.now()
    const windowMs = 36 * 60 * 60 * 1000
    if (
      Math.abs(start.getTime() - nowMs) < windowMs &&
      Math.abs(end.getTime() - nowMs) < windowMs
    ) {
      return
    }

    let cancelled = false
    setLoadingDay(true)
    listCalendarEventsForDay({
      dayStartISO: start.toISOString(),
      dayEndISO: end.toISOString(),
    })
      .then((rows) => {
        if (cancelled) return
        // Replace events that fall in the visible range with the freshly
        // fetched ones; keep events outside (so day-by-day nav still has
        // prior fetches cached).
        setEvents((prev) => [
          ...prev.filter(
            (e) =>
              new Date(e.startAt).getTime() < start.getTime() ||
              new Date(e.startAt).getTime() > end.getTime(),
          ),
          ...rows,
        ])
      })
      .catch(() => {
        // Swallow — the visible range will show empty if the fetch fails.
      })
      .finally(() => {
        if (!cancelled) setLoadingDay(false)
      })
    return () => {
      cancelled = true
    }
  }, [visibleRange])

  // The server's ±36h window is intentionally wide so users in any timezone
  // get their local day's events; narrow to the VIEWED day client-side.
  const todayEvents = useMemo(
    () =>
      viewDay ? events.filter((e) => isSameLocalDay(e.startAt, viewDay)) : events,
    [events, viewDay],
  )

  const isViewingToday = useMemo(
    () => !!(viewDay && today && isSameLocalDay(viewDay.toISOString(), today)),
    [viewDay, today],
  )

  const viewDayLabel = useMemo(() => {
    if (!viewDay) return ""
    return viewDay.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    })
  }, [viewDay])

  function shiftViewDay(delta: number) {
    setViewDay((curr) => {
      const base = curr ?? new Date()
      const next = new Date(base)
      next.setDate(next.getDate() + delta)
      next.setHours(0, 0, 0, 0)
      return next
    })
  }

  function jumpToToday() {
    setViewDay(new Date())
  }

  // Events that fall on today but outside the rendered 08:00–19:00 window —
  // surface a small counter so users don't think their early/late events
  // silently vanished.
  const offWindow = useMemo(() => {
    let earlier = 0
    let later = 0
    for (const e of todayEvents) {
      const h = decimalHourOf(e.startAt)
      if (h < HOURS[0]) earlier += 1
      else if (h > HOURS[HOURS.length - 1] + 1) later += 1
    }
    return { earlier, later }
  }, [todayEvents])

  const nowOffset = useMemo(() => {
    if (now === null) return null
    if (now < HOURS[0] || now > HOURS[HOURS.length - 1] + 1) return null
    return (now - HOURS[0]) * HOUR_HEIGHT
  }, [now])

  useEffect(() => {
    if (nowOffset !== null && !initialScrollDone.current && scrollContainerRef.current) {
      initialScrollDone.current = true
      scrollContainerRef.current.scrollTo({
        top: Math.max(0, nowOffset - 60),
        behavior: "auto"
      })
    }
  }, [nowOffset])

  function addEvent() {
    const title = draft.trim()
    if (!title) {
      setAdding(false)
      return
    }
    // Anchor to the viewed day so a user navigating to "tomorrow" creates
    // events on that day, not today.
    const base = viewDay ? new Date(viewDay) : new Date()
    if (viewDay && !isSameLocalDay(viewDay.toISOString(), new Date())) {
      // For non-today views, default to 9am on that day.
      base.setHours(9, 0, 0, 0)
    } else {
      // Today: round to the NEXT 30-minute slot (never the past).
      const now = new Date()
      base.setFullYear(now.getFullYear(), now.getMonth(), now.getDate())
      base.setHours(now.getHours(), now.getMinutes(), 0, 0)
      const mins = base.getMinutes()
      if (mins === 0) {
        base.setSeconds(0, 0)
      } else if (mins <= 30) {
        base.setMinutes(30, 0, 0)
      } else {
        base.setHours(base.getHours() + 1, 0, 0, 0)
      }
    }
    const endAt = new Date(base.getTime() + draftDurationMin * 60 * 1000)
    const toneOnSubmit = draftTone
    startTransition(() => {
      createCalendarEvent({
        title,
        startAt: base.toISOString(),
        endAt: endAt.toISOString(),
        tone: toneOnSubmit,
      })
        .then((created) => {
          setEvents((prev) => [...prev, created])
          setDraft("")
          setDraftTone("ink")
          setDraftDurationMin(30)
          setAdding(false)
        })
        .catch(() => {
          // Keep draft so the user can retry — surface visible state only.
          setAdding(false)
        })
    })
  }

  /** Open the in-place quick-add Popover anchored at a specific day + hour.
      Day defaults to the currently-viewed day; hour comes from the row the
      user double-clicked. */
  function openQuickAdd(day: Date, hour: number) {
    setQuickAdd({
      day,
      hour,
      minute: 0,
      title: "",
      durationMin: 30,
      tone: "ink",
    })
  }

  /** Persist the quick-add draft as a real event. Called on Enter / Save. */
  function commitQuickAdd() {
    if (!quickAdd) return
    const title = quickAdd.title.trim()
    if (!title) {
      setQuickAdd(null)
      return
    }
    const start = new Date(quickAdd.day)
    start.setHours(quickAdd.hour, quickAdd.minute, 0, 0)
    const end = new Date(start.getTime() + quickAdd.durationMin * 60 * 1000)
    const toneOnSubmit = quickAdd.tone
    setQuickAdd(null)
    startTransition(() => {
      createCalendarEvent({
        title,
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        tone: toneOnSubmit,
      })
        .then((created) => {
          setEvents((prev) => [...prev, created])
        })
        .catch(() => {
          // Swallow — event isn't optimistically inserted so nothing to roll back.
        })
    })
  }

  function toggle(id: string) {
    const target = events.find((e) => e.id === id)
    if (!target) return
    const next = !target.done
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, done: next } : e)))
    startTransition(() => {
      setCalendarEventDone(id, next).catch(() => {
        // Revert optimistic flip on error.
        setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, done: !next } : e)))
      })
    })
  }

  function remove(id: string) {
    const prev = events
    setEvents((curr) => curr.filter((e) => e.id !== id))
    startTransition(() => {
      deleteCalendarEvent(id).catch(() => setEvents(prev))
    })
  }

  function openEdit(evt: CalendarEvent) {
    setEditingId(evt.id)
    setEditTitle(evt.title)
    setEditStart(toLocalTimeInput(evt.startAt))
    setEditEnd(toLocalTimeInput(evt.endAt))
    setEditTone(evt.tone)
  }

  function closeEdit() {
    setEditingId(null)
  }

  function saveEdit() {
    const id = editingId
    if (!id) return
    const target = events.find((e) => e.id === id)
    if (!target) {
      closeEdit()
      return
    }
    const refDay = new Date(target.startAt)
    const newStart = editStart ? localTimeToIso(editStart, refDay) : target.startAt
    const newEnd = editEnd ? localTimeToIso(editEnd, refDay) : null
    // Cheap client-side guard so a user can't ship endAt <= startAt past zod.
    if (newEnd && new Date(newEnd).getTime() <= new Date(newStart).getTime()) {
      return
    }
    const trimmedTitle = editTitle.trim()
    if (!trimmedTitle) return
    const optimistic: CalendarEvent = {
      ...target,
      title: trimmedTitle,
      startAt: newStart,
      endAt: newEnd,
      tone: editTone,
    }
    setEvents((prev) => prev.map((e) => (e.id === id ? optimistic : e)))
    closeEdit()
    startTransition(() => {
      updateCalendarEvent({
        id,
        title: trimmedTitle,
        startAt: newStart,
        endAt: newEnd,
        tone: editTone,
      }).catch(() => {
        // Roll back on failure so the visible state matches the server.
        setEvents((prev) => prev.map((e) => (e.id === id ? target : e)))
      })
    })
  }

  // Standalone (card) mode keeps a "Today" header; embedded mode drops it since
  // the parent Tabs already labels this surface as "Schedule".
  const cardHeader = !embedded ? (
    <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
      <div className="flex items-center gap-2 text-foreground">
        <Clock size={14} aria-hidden className="text-muted-foreground" />
        <h2 className="font-display text-[14px] font-semibold">Today</h2>
      </div>
      <button
        type="button"
        onClick={() => setAdding((v) => !v)}
        aria-label="Add calendar event"
        className="inline-flex items-center justify-center size-7 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors active:scale-[0.96]"
      >
        <Plus size={14} aria-hidden />
      </button>
    </header>
  ) : null

  const panel = (
    <>
      {cardHeader}

      {adding && (
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border bg-muted/40">
          <input
            autoFocus
            type="text"
            placeholder="New event title"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addEvent()
              if (e.key === "Escape") {
                setAdding(false)
                setDraft("")
              }
            }}
            className="flex-1 min-w-[120px] bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
          />
          {/* Tone swatches: same visual vocabulary as the per-event dot so the
              chosen color previews exactly how the new event will render. */}
          <div className="flex items-center gap-1">
            {TONE_OPTIONS.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setDraftTone(t.value)}
                aria-label={`Tone ${t.label}`}
                aria-pressed={draftTone === t.value}
                title={t.label}
                className={cn(
                  "size-4 rounded-full border border-foreground/15 transition-transform",
                  draftTone === t.value && "ring-2 ring-ring ring-offset-1 ring-offset-card scale-110",
                )}
                style={{ background: TONE_COLOR[t.value] }}
              />
            ))}
          </div>
          <select
            value={draftDurationMin}
            onChange={(e) => setDraftDurationMin(parseInt(e.target.value, 10))}
            aria-label="Duration"
            className="rounded-md border border-border bg-background px-1.5 py-1 text-[11px] font-mono uppercase tracking-wider text-muted-foreground"
          >
            {DURATION_OPTIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={addEvent}
            className="rounded-md bg-foreground px-2.5 py-1 text-[12px] font-medium text-background hover:bg-foreground/90 active:scale-[0.97] transition-transform"
          >
            Add
          </button>
        </div>
      )}

      <div className="relative min-h-0 flex-1 overflow-auto px-3 py-2" ref={scrollContainerRef}>
        {/* Sticky overlay strip: day navigation + off-window counter + add
            button. Lives in the scroll container so the column stays narrow,
            but uses position:sticky so the controls don't disappear when the
            timeline below scrolls. */}
        <div className="sticky top-0 z-20 -mx-3 -mt-2 mb-1 flex items-center justify-between gap-2 bg-card/95 px-3 py-1.5 backdrop-blur-sm">
          <div className="flex items-center gap-1.5 min-w-0">
            <button
              type="button"
              onClick={() => shiftViewDay(-1)}
              aria-label="Previous day"
              className="inline-flex items-center justify-center size-6 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <ChevronLeft size={14} aria-hidden />
            </button>
            <button
              type="button"
              onClick={jumpToToday}
              disabled={isViewingToday}
              className={cn(
                "rounded-md px-2 py-0.5 text-[11px] font-mono uppercase tracking-wider transition-colors",
                isViewingToday
                  ? "text-foreground/50 cursor-default"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {isViewingToday ? "Today" : `${viewDayLabel} · ↩ today`}
            </button>
            <button
              type="button"
              onClick={() => shiftViewDay(1)}
              aria-label="Next day"
              className="inline-flex items-center justify-center size-6 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <ChevronRight size={14} aria-hidden />
            </button>
            {loadingDay && (
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70 ml-1">
                loading…
              </span>
            )}
          </div>
          <Tabs value={view} onValueChange={(v) => setView(v as "day" | "week" | "month")}>
            <TabsList className="h-6 bg-muted/60 p-0.5">
              <TabsTrigger value="day" className="h-5 px-2 text-[10px] font-mono uppercase tracking-wider">
                Day
              </TabsTrigger>
              <TabsTrigger value="week" className="h-5 px-2 text-[10px] font-mono uppercase tracking-wider">
                Week
              </TabsTrigger>
              <TabsTrigger value="month" className="h-5 px-2 text-[10px] font-mono uppercase tracking-wider">
                Month
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-2">
            {view === "day" && (offWindow.earlier > 0 || offWindow.later > 0) && (
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                {[
                  offWindow.earlier > 0 ? `${offWindow.earlier} before 8a` : null,
                  offWindow.later > 0 ? `${offWindow.later} after 7p` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            )}
            {embedded && !adding && (
              <button
                type="button"
                onClick={() => setAdding(true)}
                aria-label="Add calendar event"
                className="inline-flex items-center justify-center size-7 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors active:scale-[0.96]"
              >
                <Plus size={14} aria-hidden />
              </button>
            )}
          </div>
        </div>
        {view === "week" && (
          <WeekView
            viewDay={viewDay}
            events={events}
            onPickDay={(d) => {
              setView("day")
              setViewDay(d)
            }}
            onDoubleClickSlot={(d, h) => {
              setViewDay(d)
              openQuickAdd(d, h)
            }}
          />
        )}
        {view === "month" && (
          <MonthView
            viewDay={viewDay}
            events={events}
            onPickDay={(d) => {
              setView("day")
              setViewDay(d)
            }}
          />
        )}
        {view === "day" && (
          <div className="relative" style={{ minHeight: HOURS.length * HOUR_HEIGHT }}>
            {HOURS.map((h, i) => (
              <div
                key={h}
                className="absolute left-0 right-0 grid grid-cols-[44px_1fr]"
                style={{ top: i * HOUR_HEIGHT, height: HOUR_HEIGHT }}
              >
                <span className="pr-2 text-right text-[10px] font-mono tabular-nums uppercase tracking-wider text-muted-foreground/70">
                  {h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`}
                </span>
                {/* Double-click an empty hour row to spawn the in-place quick-add
                    Popover at that hour (Apple-Calendar style). */}
                <Popover
                  open={quickAdd?.hour === h && !!viewDay && isSameLocalDay(quickAdd.day.toISOString(), viewDay)}
                  onOpenChange={(open) => {
                    if (!open) setQuickAdd(null)
                  }}
                >
                  <PopoverAnchor asChild>
                    <div
                      className="border-t border-dashed border-border/80 cursor-pointer hover:bg-muted/30 transition-colors"
                      onDoubleClick={(e) => {
                        if ((e.target as HTMLElement).closest("button, a, input")) return
                        openQuickAdd(viewDay ?? new Date(), h)
                      }}
                      title="Double-click to add"
                    />
                  </PopoverAnchor>
                  {quickAdd?.hour === h && (
                    <PopoverContent
                      className="w-[280px] p-3 space-y-2.5"
                      align="start"
                      sideOffset={4}
                      onOpenAutoFocus={(e) => {
                        // Let the title input claim focus instead of the popover container.
                        e.preventDefault()
                      }}
                      onCloseAutoFocus={(e) => {
                        // Otherwise Radix restores focus to the anchor (the
                        // hour-row div) and, since that div isn't focusable,
                        // browsers can fall through to the next focusable
                        // element above — the sidebar search input.
                        e.preventDefault()
                      }}
                    >
                      <input
                        autoFocus
                        type="text"
                        placeholder={`New event · ${h === 0 ? "12:00 AM" : h < 12 ? `${h}:00 AM` : h === 12 ? "12:00 PM" : `${h - 12}:00 PM`}`}
                        value={quickAdd.title}
                        onChange={(e) =>
                          setQuickAdd((curr) => (curr ? { ...curr, title: e.target.value } : curr))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault()
                            commitQuickAdd()
                          }
                          if (e.key === "Escape") setQuickAdd(null)
                        }}
                        className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-[13px] outline-none focus:ring-2 focus:ring-ring"
                      />
                      <div className="flex items-center gap-1.5">
                        {TONE_OPTIONS.map((t) => (
                          <button
                            key={t.value}
                            type="button"
                            onClick={() =>
                              setQuickAdd((curr) => (curr ? { ...curr, tone: t.value } : curr))
                            }
                            aria-pressed={quickAdd.tone === t.value}
                            aria-label={`Tone ${t.label}`}
                            title={t.label}
                            className={cn(
                              "size-4 rounded-full border border-foreground/15 transition-transform",
                              quickAdd.tone === t.value && "ring-2 ring-ring ring-offset-1 ring-offset-popover scale-110",
                            )}
                            style={{ background: TONE_COLOR[t.value] }}
                          />
                        ))}
                        <span className="flex-1" />
                        <select
                          value={quickAdd.minute}
                          onChange={(e) =>
                            setQuickAdd((curr) =>
                              curr ? { ...curr, minute: parseInt(e.target.value, 10) } : curr,
                            )
                          }
                          aria-label="Start minute"
                          className="rounded-md border border-border bg-background px-1.5 py-1 text-[11px] font-mono uppercase tracking-wider text-muted-foreground"
                        >
                          {Array.from({ length: 12 }, (_, i) => i * 5).map((m) => (
                            <option key={m} value={m}>
                              {`:${String(m).padStart(2, "0")}`}
                            </option>
                          ))}
                        </select>
                        <select
                          value={quickAdd.durationMin}
                          onChange={(e) =>
                            setQuickAdd((curr) =>
                              curr ? { ...curr, durationMin: parseInt(e.target.value, 10) } : curr,
                            )
                          }
                          aria-label="Duration"
                          className="rounded-md border border-border bg-background px-1.5 py-1 text-[11px] font-mono uppercase tracking-wider text-muted-foreground"
                        >
                          {DURATION_OPTIONS.map((d) => (
                            <option key={d.value} value={d.value}>
                              {d.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-center justify-end gap-1 pt-0.5">
                        <button
                          type="button"
                          onClick={() => setQuickAdd(null)}
                          className="rounded-md px-2 py-1 text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={commitQuickAdd}
                          className="rounded-md bg-foreground px-2.5 py-1 text-[12px] font-medium text-background hover:bg-foreground/90 active:scale-[0.97] transition-transform"
                        >
                          Add
                        </button>
                      </div>
                    </PopoverContent>
                  )}
                </Popover>
              </div>
            ))}

            {nowOffset !== null && (
              <div
                aria-hidden
                className="pointer-events-none absolute left-[44px] right-0 z-10 flex items-center"
                style={{ top: nowOffset }}
              >
                <span className="size-2 -translate-x-1 rounded-full bg-primary" />
                <span className="h-px flex-1 bg-primary/45" />
                <span className="ml-1 rounded-sm bg-primary/90 px-1.5 py-px text-[9px] font-mono uppercase tracking-wider text-primary-foreground">
                  Now
                </span>
              </div>
            )}

            {todayEvents.map((evt) => {
              const startH = decimalHourOf(evt.startAt)
              if (startH < HOURS[0] || startH > HOURS[HOURS.length - 1] + 1) return null
              const top = (startH - HOURS[0]) * HOUR_HEIGHT + 4
              // Duration-driven height when endAt is set, else fall back to a
              // single 30-min slot so old (no-end) rows still look correct.
              const endH = evt.endAt ? decimalHourOf(evt.endAt) : startH + 0.5
              const visualEndH = Math.min(endH, HOURS[HOURS.length - 1] + 1)
              const heightPx = Math.max(28, (visualEndH - startH) * HOUR_HEIGHT - 6)
              const color = TONE_COLOR[evt.tone]
              const isEditing = editingId === evt.id
              return (
                <Popover
                  key={evt.id}
                  open={isEditing}
                  onOpenChange={(open) => {
                    if (!open) closeEdit()
                  }}
                >
                  <PopoverAnchor asChild>
                    <div
                      className="group absolute left-[52px] right-2 rounded-md border border-border bg-background px-2 py-1.5 transition-colors hover:bg-muted/30"
                      style={{
                        top,
                        height: heightPx,
                        borderLeftWidth: 3,
                        borderLeftColor: color,
                      }}
                    >
                      <div className="flex h-full items-start justify-between gap-1">
                        <button
                          type="button"
                          onClick={() => toggle(evt.id)}
                          aria-label={`Mark "${evt.title}" as ${evt.done ? "incomplete" : "done"}`}
                          className={cn(
                            "flex-1 min-w-0 text-left text-[12.5px] font-medium",
                            evt.done ? "text-muted-foreground line-through" : "text-foreground",
                          )}
                        >
                          <span className="block truncate">{evt.title}</span>
                          <span className="block text-[10px] font-mono uppercase tracking-wider text-muted-foreground mt-0.5">
                            {formatTime(evt.startAt)}
                            {evt.endAt ? ` · ${formatTime(evt.endAt)}` : ""}
                          </span>
                        </button>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            aria-label="Edit event"
                            onClick={() => openEdit(evt)}
                            className="text-muted-foreground hover:text-foreground p-0.5"
                          >
                            <Pencil size={12} aria-hidden />
                          </button>
                          <button
                            type="button"
                            aria-label="Delete event"
                            onClick={() => setConfirmDeleteId(evt.id)}
                            className="text-muted-foreground hover:text-foreground p-0.5"
                          >
                            <X size={12} aria-hidden />
                          </button>
                        </div>
                      </div>
                    </div>
                  </PopoverAnchor>
                  <PopoverContent
                    className="w-[300px] p-3 space-y-3"
                    align="start"
                    sideOffset={6}
                    onOpenAutoFocus={(e) => {
                      // Let the title input claim focus rather than the
                      // popover's container — same pattern todo-panel uses.
                      e.preventDefault()
                    }}
                    onCloseAutoFocus={(e) => e.preventDefault()}
                  >
                    <input
                      autoFocus
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      placeholder="Event title"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault()
                          saveEdit()
                        }
                        if (e.key === "Escape") closeEdit()
                      }}
                      className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-[13px] outline-none focus:ring-2 focus:ring-ring"
                    />
                    <div className="flex items-center gap-2">
                      <label className="flex-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                        Start
                        <input
                          type="time"
                          value={editStart}
                          onChange={(e) => setEditStart(e.target.value)}
                          className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1 text-[12px] text-foreground outline-none focus:ring-2 focus:ring-ring"
                        />
                      </label>
                      <label className="flex-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                        End
                        <input
                          type="time"
                          value={editEnd}
                          onChange={(e) => setEditEnd(e.target.value)}
                          className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1 text-[12px] text-foreground outline-none focus:ring-2 focus:ring-ring"
                        />
                      </label>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {TONE_OPTIONS.map((t) => (
                        <button
                          key={t.value}
                          type="button"
                          onClick={() => setEditTone(t.value)}
                          aria-pressed={editTone === t.value}
                          aria-label={`Tone ${t.label}`}
                          title={t.label}
                          className={cn(
                            "size-5 rounded-full border border-foreground/15",
                            editTone === t.value && "ring-2 ring-ring ring-offset-2 ring-offset-popover",
                          )}
                          style={{ background: TONE_COLOR[t.value] }}
                        />
                      ))}
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          closeEdit()
                          setConfirmDeleteId(evt.id)
                        }}
                        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                      >
                        <Trash2 size={12} aria-hidden />
                        Delete
                      </button>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={closeEdit}
                          className="rounded-md px-2 py-1 text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={saveEdit}
                          className="rounded-md bg-foreground px-2.5 py-1 text-[12px] font-medium text-background hover:bg-foreground/90 active:scale-[0.97] transition-transform"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              )
            })}
          </div>
        )}
      </div>

      <AlertDialog
        open={confirmDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteId(null)
        }}
      >
        <AlertDialogContent onCloseAutoFocus={(e) => e.preventDefault()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete event?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDeleteId
                ? `"${events.find((e) => e.id === confirmDeleteId)?.title ?? ""}" will be removed from today's schedule.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (confirmDeleteId) {
                  remove(confirmDeleteId)
                  setConfirmDeleteId(null)
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )

  if (embedded) {
    return <div className="flex min-h-0 flex-1 flex-col">{panel}</div>
  }

  return (
    <article className="h-full min-h-[480px] rounded-[calc(var(--radius)+4px)] border border-border bg-card flex flex-col overflow-hidden">
      {panel}
    </article>
  )
}

function EmptyCalendar({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center gap-2 py-10">
      <Clock size={20} aria-hidden className="text-muted-foreground/70" />
      <p className="text-[13px] text-foreground">No events today.</p>
      <p className="text-[12px] text-muted-foreground max-w-[260px]">Add a milestone or deadline to plan your work.</p>
      <button
        type="button"
        onClick={onAdd}
        className="text-[12px] text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4"
      >
        Add an event
      </button>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * Week view — 7 columns × hour rows. Each column shows that day's events;
 * double-clicking a cell opens the in-place quick-add Popover on the parent.
 * ──────────────────────────────────────────────────────────────────────── */
function WeekView({
  viewDay,
  events,
  onPickDay,
  onDoubleClickSlot,
}: {
  viewDay: Date | null
  events: CalendarEvent[]
  onPickDay: (d: Date) => void
  onDoubleClickSlot: (d: Date, hour: number) => void
}) {
  if (!viewDay) return null
  const weekStart = startOfWeek(viewDay)
  const today = new Date()
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  return (
    <div className="relative">
      {/* Day-of-week header strip */}
      <div className="grid grid-cols-[36px_repeat(7,1fr)] border-b border-border">
        <div />
        {days.map((d) => {
          const isToday = isSameLocalDay(d.toISOString(), today)
          return (
            <button
              key={d.toISOString()}
              type="button"
              onClick={() => onPickDay(d)}
              className={cn(
                "flex flex-col items-center gap-0.5 py-1.5 text-[10px] font-mono uppercase tracking-wider transition-colors",
                isToday
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span>{DAY_LABELS[d.getDay()]}</span>
              <span
                className={cn(
                  "font-semibold text-[12px]",
                  isToday && "rounded-full bg-foreground text-background px-1.5",
                )}
              >
                {d.getDate()}
              </span>
            </button>
          )
        })}
      </div>
      {/* Hour grid */}
      <div className="relative" style={{ minHeight: HOURS.length * HOUR_HEIGHT }}>
        {HOURS.map((h, i) => (
          <div
            key={h}
            className="absolute left-0 right-0 grid grid-cols-[36px_repeat(7,1fr)]"
            style={{ top: i * HOUR_HEIGHT, height: HOUR_HEIGHT }}
          >
            <span className="pr-2 text-right text-[10px] font-mono tabular-nums uppercase tracking-wider text-muted-foreground/70">
              {h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`}
            </span>
            {days.map((d) => (
              <div
                key={d.toISOString()}
                className="border-t border-l border-dashed border-border/60 cursor-pointer hover:bg-muted/30 transition-colors"
                onDoubleClick={() => onDoubleClickSlot(d, h)}
                title="Double-click to add"
              />
            ))}
          </div>
        ))}
        {/* Event blocks per day-column */}
        {events.map((evt) => {
          const startDate = new Date(evt.startAt)
          const dayIndex = days.findIndex((d) => isSameLocalDay(evt.startAt, d))
          if (dayIndex < 0) return null
          const startH = startDate.getHours() + startDate.getMinutes() / 60
          if (startH < HOURS[0] || startH > HOURS[HOURS.length - 1] + 1) return null
          const endH = evt.endAt
            ? (() => {
                const e = new Date(evt.endAt)
                return e.getHours() + e.getMinutes() / 60
              })()
            : startH + 0.5
          const visualEndH = Math.min(endH, HOURS[HOURS.length - 1] + 1)
          const top = (startH - HOURS[0]) * HOUR_HEIGHT + 2
          const height = Math.max(20, (visualEndH - startH) * HOUR_HEIGHT - 4)
          const color = TONE_COLOR[evt.tone]
          // 36px label column + (dayIndex × column width). Use CSS calc so the
          // chip stretches with the parent grid.
          const left = `calc(36px + ${(dayIndex / 7) * 100}% - ${(36 / 7) * dayIndex}px)`
          const width = `calc(${(1 / 7) * 100}% - ${36 / 7}px - 4px)`
          return (
            <div
              key={evt.id}
              className="absolute rounded-sm border border-border bg-background px-1 py-0.5 text-[10px] font-medium pointer-events-none overflow-hidden"
              style={{
                top,
                left,
                width,
                height,
                borderLeftWidth: 2,
                borderLeftColor: color,
              }}
            >
              <span className="block truncate text-foreground">{evt.title}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * Month view — 6×7 grid. Each cell: date number + up to 3 event chips.
 * Click a cell to jump to day view on that date.
 * ──────────────────────────────────────────────────────────────────────── */
function MonthView({
  viewDay,
  events,
  onPickDay,
}: {
  viewDay: Date | null
  events: CalendarEvent[]
  onPickDay: (d: Date) => void
}) {
  if (!viewDay) return null
  const gridStart = startOfMonthGrid(viewDay)
  const today = new Date()
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
  // Bucket events by ISO date (YYYY-MM-DD) for O(1) per-cell lookup.
  const byDay = new Map<string, CalendarEvent[]>()
  for (const e of events) {
    const d = new Date(e.startAt)
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    const arr = byDay.get(key) ?? []
    arr.push(e)
    byDay.set(key, arr)
  }
  return (
    <div className="grid grid-cols-7 gap-px bg-border rounded-md overflow-hidden">
      {DAY_LABELS.map((l) => (
        <div
          key={l}
          className="bg-card text-center py-1.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground"
        >
          {l}
        </div>
      ))}
      {cells.map((d) => {
        const inMonth = d.getMonth() === viewDay.getMonth()
        const isToday = isSameLocalDay(d.toISOString(), today)
        const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
        const dayEvents = byDay.get(key) ?? []
        return (
          <button
            key={d.toISOString()}
            type="button"
            onClick={() => onPickDay(d)}
            className={cn(
              "bg-card text-left min-h-[68px] p-1.5 hover:bg-muted/40 transition-colors flex flex-col gap-0.5",
              !inMonth && "opacity-50",
            )}
          >
            <span
              className={cn(
                "text-[11px] font-mono tabular-nums",
                isToday
                  ? "self-start rounded-full bg-foreground text-background px-1.5"
                  : "text-foreground/80",
              )}
            >
              {d.getDate()}
            </span>
            <div className="flex flex-col gap-0.5 mt-0.5">
              {dayEvents.slice(0, 3).map((evt) => (
                <div
                  key={evt.id}
                  className="flex items-center gap-1 text-[10px] truncate"
                >
                  <span
                    aria-hidden
                    className="size-1.5 rounded-full shrink-0"
                    style={{ background: TONE_COLOR[evt.tone] }}
                  />
                  <span className="truncate text-foreground/80">{evt.title}</span>
                </div>
              ))}
              {dayEvents.length > 3 && (
                <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
                  +{dayEvents.length - 3} more
                </span>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}
