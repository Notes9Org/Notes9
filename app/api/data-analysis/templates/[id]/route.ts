import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth/current-user"

// Next 16's generated route validator types `context.params` as
// `Promise<unknown>`; accept that and narrow via a cast.
type RouteParams = { params: Promise<unknown> }

/** Delete one of the caller's saved templates (RLS also enforces ownership). */
export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const { id } = (await params) as { id: string }
    const supabase = await createClient()
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { error } = await supabase.from("data_analysis_templates").delete().eq("id", id).eq("user_id", user.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to delete template" }, { status: 500 })
  }
}
