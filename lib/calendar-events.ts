import { z } from "zod"
import { createClient } from "@/lib/supabase/client"

const EventTone = z.enum(["ink", "leaf", "accent", "warning"])
export type EventTone = z.infer<typeof EventTone>

const Uuid = z.string().uuid()

export const CalendarEventCreateInput = z
  .object({
    title: z.string().min(1).max(255),
    meta: z.string().max(255).optional(),
    startAt: z.string().datetime(),
    endAt: z.string().datetime().optional(),
    tone: EventTone.default("ink"),
    projectId: Uuid.nullable().optional(),
    experimentId: Uuid.nullable().optional(),
  })
  .refine((d) => !d.endAt || d.endAt >= d.startAt, {
    message: "endAt must be >= startAt",
    path: ["endAt"],
  })
export type CalendarEventCreateInput = z.infer<typeof CalendarEventCreateInput>

export const CalendarEventUpdateInput = z.object({
  id: Uuid,
  title: z.string().min(1).max(255).optional(),
  meta: z.string().max(255).nullable().optional(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().nullable().optional(),
  tone: EventTone.optional(),
  done: z.boolean().optional(),
})

export type CalendarEvent = {
  id: string
  userId: string
  projectId: string | null
  experimentId: string | null
  title: string
  meta: string | null
  startAt: string
  endAt: string | null
  tone: EventTone
  done: boolean
  createdAt: string
  updatedAt: string
}

type Row = {
  id: string
  user_id: string
  project_id: string | null
  experiment_id: string | null
  title: string
  meta: string | null
  start_at: string
  end_at: string | null
  tone: EventTone
  done: boolean
  created_at: string
  updated_at: string
}

function fromRow(r: Row): CalendarEvent {
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

async function authedClient() {
  const supabase = createClient()
  // Use getSession() instead of getUser() — local cookie/storage read, no
  // /auth/v1/user round-trip. RLS still enforces authorization server-side
  // via the JWT cookie that PostgREST receives on every query.
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) throw new Error("Not authenticated")
  return { supabase, userId: session.user.id }
}

export async function listCalendarEventsForDay(opts: {
  dayStartISO: string
  dayEndISO: string
  projectId?: string | null
}): Promise<CalendarEvent[]> {
  z.string().datetime().parse(opts.dayStartISO)
  z.string().datetime().parse(opts.dayEndISO)
  const { supabase, userId } = await authedClient()
  let q = supabase
    .from("calendar_events")
    .select("*")
    .eq("user_id", userId)
    .gte("start_at", opts.dayStartISO)
    .lt("start_at", opts.dayEndISO)
    .order("start_at", { ascending: true })
  if (opts.projectId !== undefined) {
    q = opts.projectId === null ? q.is("project_id", null) : q.eq("project_id", opts.projectId)
  }
  const { data, error } = await q
  if (error) throw error
  return (data ?? []).map((r: Row) => fromRow(r))
}

export async function createCalendarEvent(raw: unknown): Promise<CalendarEvent> {
  const input = CalendarEventCreateInput.parse(raw)
  const { supabase, userId } = await authedClient()
  const { data, error } = await supabase
    .from("calendar_events")
    .insert({
      user_id: userId,
      project_id: input.projectId ?? null,
      experiment_id: input.experimentId ?? null,
      title: input.title,
      meta: input.meta ?? null,
      start_at: input.startAt,
      end_at: input.endAt ?? null,
      tone: input.tone,
    })
    .select("*")
    .single()
  if (error || !data) throw error ?? new Error("Insert failed")
  return fromRow(data as Row)
}

export async function updateCalendarEvent(raw: unknown): Promise<CalendarEvent> {
  const input = CalendarEventUpdateInput.parse(raw)
  const { supabase, userId } = await authedClient()
  const patch: Record<string, unknown> = {}
  if (input.title !== undefined) patch.title = input.title
  if (input.meta !== undefined) patch.meta = input.meta
  if (input.startAt !== undefined) patch.start_at = input.startAt
  if (input.endAt !== undefined) patch.end_at = input.endAt
  if (input.tone !== undefined) patch.tone = input.tone
  if (input.done !== undefined) patch.done = input.done
  const { data, error } = await supabase
    .from("calendar_events")
    .update(patch)
    .eq("id", input.id)
    .eq("user_id", userId)
    .select("*")
    .single()
  if (error || !data) throw error ?? new Error("Update failed")
  return fromRow(data as Row)
}

/**
 * Set the calendar event's `done` to a specific desired value. The caller
 * passes the value it just optimistically flipped to in the UI — single round-
 * trip, race-free under two-tab toggle storms.
 */
export async function setCalendarEventDone(id: string, done: boolean): Promise<CalendarEvent> {
  const validId = Uuid.parse(id)
  const { supabase, userId } = await authedClient()
  const { data, error } = await supabase
    .from("calendar_events")
    .update({ done })
    .eq("id", validId)
    .eq("user_id", userId)
    .select("*")
    .single()
  if (error || !data) throw error ?? new Error("Toggle failed")
  return fromRow(data as Row)
}

export async function deleteCalendarEvent(id: string): Promise<void> {
  const validId = Uuid.parse(id)
  const { supabase, userId } = await authedClient()
  const { error } = await supabase
    .from("calendar_events")
    .delete()
    .eq("id", validId)
    .eq("user_id", userId)
  if (error) throw error
}
