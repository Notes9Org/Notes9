import { NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: profile } = await supabase.from("profiles").select("organization_id").eq("id", user.id).single()
    if (!profile?.organization_id) {
      return NextResponse.json({ templates: [] })
    }

    const { data, error } = await supabase
      .from("protocol_document_templates")
      .select("id, name, source_filename, mime_type, extracted, created_at, updated_at")
      .eq("organization_id", profile.organization_id)
      .order("name")

    if (error) {
      if (/does not exist|schema/i.test(error.message ?? "")) {
        return NextResponse.json(
          { error: "Migration not applied", templates: [] },
          { status: 503 }
        )
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ templates: data ?? [] })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to list templates"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
