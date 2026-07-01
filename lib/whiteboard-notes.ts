import { z } from "zod"
import { createClient } from "@/lib/supabase/client"

const NoteKind = z.enum(["lemon", "mint", "cloud", "lilac", "coral", "paper", "ai"])
export type NoteKind = z.infer<typeof NoteKind>

const Uuid = z.string().uuid()

export const WhiteboardNoteCreateInput = z.object({
  kind: NoteKind.default("paper"),
  tag: z.string().max(64).optional(),
  body: z.string().max(4000).optional(),
  foot: z.string().max(256).optional(),
  x: z.number().int().min(0).default(24),
  y: z.number().int().min(0).default(24),
  isAi: z.boolean().default(false),
  projectId: Uuid.nullable().optional(),
})
export type WhiteboardNoteCreateInput = z.infer<typeof WhiteboardNoteCreateInput>

export const WhiteboardNoteUpdatePositionInput = z.object({
  id: Uuid,
  x: z.number().int().min(0),
  y: z.number().int().min(0),
})

export const WhiteboardNoteUpdateBodyInput = z.object({
  id: Uuid,
  body: z.string().max(4000),
})

export const WhiteboardNoteUpdateKindInput = z.object({
  id: Uuid,
  kind: NoteKind,
})

export const WhiteboardNoteUpdateTagInput = z.object({
  id: Uuid,
  tag: z.string().max(64).nullable(),
})

export type WhiteboardNote = {
  id: string
  userId: string
  projectId: string | null
  kind: NoteKind
  tag: string | null
  body: string
  foot: string | null
  x: number
  y: number
  isAi: boolean
  createdAt: string
  updatedAt: string
}

type Row = {
  id: string
  user_id: string
  project_id: string | null
  kind: NoteKind
  tag: string | null
  body: string
  foot: string | null
  x: number
  y: number
  is_ai: boolean
  created_at: string
  updated_at: string
}

function fromRow(r: Row): WhiteboardNote {
  return {
    id: r.id,
    userId: r.user_id,
    projectId: r.project_id,
    kind: r.kind,
    tag: r.tag,
    body: r.body,
    foot: r.foot,
    x: r.x,
    y: r.y,
    isAi: r.is_ai,
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

export async function listWhiteboardNotes(opts: { projectId: string | null }): Promise<WhiteboardNote[]> {
  const { supabase, userId } = await authedClient()
  let q = supabase
    .from("whiteboard_notes")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
  if (opts.projectId === null) {
    q = q.is("project_id", null)
  } else {
    q = q.eq("project_id", opts.projectId)
  }
  const { data, error } = await q
  if (error) throw error
  return (data ?? []).map((r: Row) => fromRow(r))
}

export async function createWhiteboardNote(raw: unknown): Promise<WhiteboardNote> {
  const input = WhiteboardNoteCreateInput.parse(raw)
  const { supabase, userId } = await authedClient()
  const { data, error } = await supabase
    .from("whiteboard_notes")
    .insert({
      user_id: userId,
      project_id: input.projectId ?? null,
      kind: input.kind,
      tag: input.tag ?? null,
      body: input.body ?? "",
      foot: input.foot ?? null,
      x: input.x,
      y: input.y,
      is_ai: input.isAi,
    })
    .select("*")
    .single()
  if (error || !data) throw error ?? new Error("Insert failed")
  return fromRow(data as Row)
}

export async function updateWhiteboardNotePosition(raw: unknown): Promise<void> {
  const input = WhiteboardNoteUpdatePositionInput.parse(raw)
  const { supabase, userId } = await authedClient()
  const { error } = await supabase
    .from("whiteboard_notes")
    .update({ x: input.x, y: input.y })
    .eq("id", input.id)
    .eq("user_id", userId)
  if (error) throw error
}

export async function updateWhiteboardNoteBody(raw: unknown): Promise<void> {
  const input = WhiteboardNoteUpdateBodyInput.parse(raw)
  const { supabase, userId } = await authedClient()
  const { error } = await supabase
    .from("whiteboard_notes")
    .update({ body: input.body })
    .eq("id", input.id)
    .eq("user_id", userId)
  if (error) throw error
}

export async function updateWhiteboardNoteKind(raw: unknown): Promise<void> {
  const input = WhiteboardNoteUpdateKindInput.parse(raw)
  const { supabase, userId } = await authedClient()
  const { error } = await supabase
    .from("whiteboard_notes")
    .update({ kind: input.kind })
    .eq("id", input.id)
    .eq("user_id", userId)
  if (error) throw error
}

export async function updateWhiteboardNoteTag(raw: unknown): Promise<void> {
  const input = WhiteboardNoteUpdateTagInput.parse(raw)
  const { supabase, userId } = await authedClient()
  const { error } = await supabase
    .from("whiteboard_notes")
    .update({ tag: input.tag })
    .eq("id", input.id)
    .eq("user_id", userId)
  if (error) throw error
}

export async function deleteWhiteboardNote(id: string): Promise<void> {
  const validId = Uuid.parse(id)
  const { supabase, userId } = await authedClient()
  const { error } = await supabase
    .from("whiteboard_notes")
    .delete()
    .eq("id", validId)
    .eq("user_id", userId)
  if (error) throw error
}

export async function clearWhiteboardNotes(opts: { projectId: string | null }): Promise<void> {
  const { supabase, userId } = await authedClient()
  let q = supabase.from("whiteboard_notes").delete().eq("user_id", userId)
  if (opts.projectId === null) {
    q = q.is("project_id", null)
  } else {
    q = q.eq("project_id", opts.projectId)
  }
  const { error } = await q
  if (error) throw error
}
