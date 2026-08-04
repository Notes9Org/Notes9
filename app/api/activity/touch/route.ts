import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth/current-user"

// Beacon endpoint for the recency half of the focus signal (context backend, Slice 3).
// Upsert-last into recently_touched: one row per (user, entity), RLS owner-only.
// Fire-and-forget from the client (navigator.sendBeacon), always answers fast,
// never surfaces errors to the UI.

const ENTITY_TYPES = new Set([
  "project",
  "experiment",
  "lab_note",
  "protocol",
  "literature_review",
  "sample",
  "paper",
  "report",
  "data_file",
])

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ ok: false }, { status: 401 })

    const body = await req.json().catch(() => null)
    const entityType = body?.entity_type
    const entityId = body?.entity_id
    const action = body?.action === "edit" ? "edit" : "view"

    if (!ENTITY_TYPES.has(entityType) || !UUID_RE.test(String(entityId ?? ""))) {
      return NextResponse.json({ ok: false }, { status: 400 })
    }

    const supabase = await createClient()
    // RLS enforces user_id = auth.uid(); upsert refreshes touched_at.
    await supabase.from("recently_touched").upsert(
      {
        user_id: user.id,
        entity_type: entityType,
        entity_id: entityId,
        action,
        touched_at: new Date().toISOString(),
      },
      { onConflict: "user_id,entity_type,entity_id" },
    )
    return NextResponse.json({ ok: true })
  } catch {
    // Beacon semantics: never let activity tracking produce user-visible errors.
    return NextResponse.json({ ok: false }, { status: 200 })
  }
}
