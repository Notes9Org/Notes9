import type { SupabaseClient } from "@supabase/supabase-js"

export interface CreateLabNoteInput {
  experimentId: string
  title: string
  content?: string
  noteType?: string
  createdBy: string
  /**
   * Seeds an uncommitted draft alongside the (usually empty) committed body.
   * Only the autosave-triggered "create on first keystroke" path
   * (lab-notes-tab.tsx's handleAutoSave) uses this.
   */
  draftContent?: string
  draftAuthorId?: string
}

/**
 * Single writer for creating a lab_notes row, absorbing the 4 inline
 * inserts (autosave's create-on-first-keystroke, handleSave's create
 * fallback, the "+ New Note" quick-add, and new-lab-note-dialog.tsx). They
 * differ only in which optional fields they populate — the shared
 * shape/defaults live here so they can't drift again. Always
 * `.select().single()`: a full row is a safe superset for the one caller
 * that previously selected only "id".
 */
export async function createLabNote(supabase: SupabaseClient, input: CreateLabNoteInput) {
  const payload: Record<string, unknown> = {
    experiment_id: input.experimentId,
    title: input.title,
    content: input.content ?? "",
    note_type: input.noteType ?? "general",
    created_by: input.createdBy,
  }
  if (input.draftContent !== undefined) {
    payload.draft_content = input.draftContent
    payload.draft_updated_at = new Date().toISOString()
    payload.draft_author_id = input.draftAuthorId
  }
  return supabase.from("lab_notes").insert(payload).select().single()
}

/**
 * Autosave = DRAFT only. Persists `draft_content` for an existing note so
 * nothing typed is ever lost, but never touches the committed `content`
 * column and records no audit history. Only an explicit Save
 * (`commitLabNote`) advances the official record.
 */
export async function saveDraft(
  supabase: SupabaseClient,
  noteId: string,
  content: string,
  authorId: string,
) {
  return supabase
    .from("lab_notes")
    .update({
      draft_content: content,
      draft_updated_at: new Date().toISOString(),
      draft_author_id: authorId,
    })
    .eq("id", noteId)
}

/**
 * Wraps the `commit_lab_note` RPC, which sets `app.force_version` so the DB
 * trigger `trg_write_document_version` writes a version even inside its
 * 3-minute throttle window, then promotes the draft into `content` and
 * clears the draft — all in one transaction. The trigger owns versioning;
 * callers must NOT also write `document_versions` directly.
 */
export async function commitLabNote(
  supabase: SupabaseClient,
  args: { id: string; content: string; title: string; noteType: string },
) {
  return supabase.rpc("commit_lab_note", {
    p_id: args.id,
    p_content: args.content,
    p_title: args.title,
    p_note_type: args.noteType,
    p_user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
  })
}

/** Clears an uncommitted draft, reverting the note to its committed body. */
export async function discardDraft(supabase: SupabaseClient, noteId: string) {
  return supabase
    .from("lab_notes")
    .update({ draft_content: null, draft_updated_at: null, draft_author_id: null })
    .eq("id", noteId)
}
