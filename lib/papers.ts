import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Single writer for `papers` row mutations from Next.js/browser call sites.
 *
 * NOTE: `collaboration-server/src/database.ts` (a separate Node process
 * backing the realtime editor) also writes `papers.content` directly via
 * PostgREST, out-of-process from this app. That is intentional and out of
 * scope here — client-side autosave (`updatePaperContent`) is disabled
 * whenever a collaboration session is connected (see
 * `paper-workspace.tsx`'s `enabled: !loading && !!paper &&
 * !collaborationConnected`), so the two writers never race.
 */

/** Client autosave of the document body. */
export async function updatePaperContent(supabase: SupabaseClient, paperId: string, content: string) {
  return supabase
    .from("papers")
    .update({ content, updated_at: new Date().toISOString() })
    .eq("id", paperId)
}

export interface UpdatePaperMetaFields {
  title?: string
  status?: string
}

/**
 * Partial metadata update, merging the title-commit-on-blur path
 * (paper-workspace.tsx) and the status quick action (paper-actions.tsx).
 * Omitted fields are left untouched — only `updated_at` is always set.
 */
export async function updatePaperMeta(
  supabase: SupabaseClient,
  paperId: string,
  fields: UpdatePaperMetaFields,
) {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (fields.title !== undefined) payload.title = fields.title
  if (fields.status !== undefined) payload.status = fields.status
  return supabase.from("papers").update(payload).eq("id", paperId)
}

export interface CreatePaperInput {
  title: string
  projectId?: string | null
  createdBy: string
}

export async function createPaper(supabase: SupabaseClient, input: CreatePaperInput) {
  return supabase
    .from("papers")
    .insert({
      title: input.title,
      content: "",
      status: "draft",
      project_id: input.projectId ?? null,
      created_by: input.createdBy,
    })
    .select("id")
    .single()
}

/** Accepts a single id (paper-detail-client.tsx) or a batch (paper-list.tsx bulk delete). */
export async function deletePaper(supabase: SupabaseClient, paperIdOrIds: string | string[]) {
  const query = supabase.from("papers").delete()
  return Array.isArray(paperIdOrIds) ? query.in("id", paperIdOrIds) : query.eq("id", paperIdOrIds)
}
