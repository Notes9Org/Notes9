import { NextResponse } from "next/server"

import { createServiceRoleClient } from "@/lib/supabase-service-role"
import { USER_STORAGE_BUCKET, createPublishedLabNoteStoragePath } from "@/lib/user-storage-bucket"

/**
 * Public JSON for a published lab note (no auth).
 * Reads from bucket `user` at `{created_by}/lab-notes/public/{noteId}.json` using the service role.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: noteId } = await context.params
    if (!noteId || !/^[0-9a-fA-F-]{36}$/.test(noteId)) {
      return NextResponse.json({ error: "Invalid note id" }, { status: 400 })
    }

    const admin = createServiceRoleClient()

    const { data: note, error: noteErr } = await admin
      .from("lab_notes")
      .select("id, created_by")
      .eq("id", noteId)
      .maybeSingle()

    if (noteErr || !note?.created_by) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const path = createPublishedLabNoteStoragePath(String(note.created_by), noteId)
    const { data: blob, error: dlErr } = await admin.storage.from(USER_STORAGE_BUCKET).download(path)

    if (dlErr || !blob) {
      return NextResponse.json({ error: "This note has not been published or does not exist." }, { status: 404 })
    }

    const text = await blob.text()
    let json: unknown
    try {
      json = JSON.parse(text) as unknown
    } catch {
      return NextResponse.json({ error: "Invalid published note payload" }, { status: 502 })
    }

    return NextResponse.json(json, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=60, s-maxage=120",
      },
    })
  } catch (e) {
    console.error("[api/share/note]", e)
    if (e instanceof Error && e.message.includes("SUPABASE_SERVICE_ROLE_KEY")) {
      return NextResponse.json({ error: "Server misconfiguration" }, { status: 503 })
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
