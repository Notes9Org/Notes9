import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth/current-user"

const MISSING_TABLE = /does not exist|schema|relation .* does not exist/i

/** List the caller's saved data-analysis templates. */
export async function GET() {
  try {
    const supabase = await createClient()
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data, error } = await supabase
      .from("data_analysis_templates")
      .select("id, name, description, config, phase, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })

    if (error) {
      if (MISSING_TABLE.test(error.message ?? "")) {
        return NextResponse.json({ error: "Migration not applied", templates: [] }, { status: 503 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ templates: data ?? [] })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to list templates" }, { status: 500 })
  }
}

/** Save a new template for the caller. */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    let body: { name?: unknown; description?: unknown; config?: unknown; phase?: unknown }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
    }
    const name = typeof body.name === "string" ? body.name.trim() : ""
    if (!name) return NextResponse.json({ error: "name required" }, { status: 400 })

    const { data, error } = await supabase
      .from("data_analysis_templates")
      .insert({
        user_id: user.id,
        name,
        description: typeof body.description === "string" ? body.description : null,
        config: body.config && typeof body.config === "object" ? body.config : {},
        phase: typeof body.phase === "string" ? body.phase : null,
      })
      .select("id, name, description, config, phase, created_at")
      .single()

    if (error) {
      if (MISSING_TABLE.test(error.message ?? "")) {
        return NextResponse.json({ error: "Migration not applied" }, { status: 503 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ template: data })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to save template" }, { status: 500 })
  }
}
