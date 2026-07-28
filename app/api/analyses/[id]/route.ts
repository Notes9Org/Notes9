import { NextResponse } from "next/server"

import { ANALYSIS_COLUMNS, requireSession } from "../_shared"

type Ctx = { params: Promise<{ id: string }> }

/**
 * Fields a client may write. Everything else — `user_id`, `code`, `results`,
 * provenance — is the server's. `figure_spec` has its own autosave route.
 */
const PATCHABLE = new Set(["title", "analysis_spec", "status"])

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const s = await requireSession()
    if ("error" in s) return s.error

    const { data, error } = await s.supabase
      .from("analyses")
      .select(ANALYSIS_COLUMNS)
      .eq("id", id)
      .eq("user_id", s.userId)
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ analysis: data })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to load analysis"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const s = await requireSession()
    if ("error" in s) return s.error

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const patch = body as Record<string, unknown>
    const rejected = Object.keys(patch).filter((k) => !PATCHABLE.has(k))
    if (rejected.length > 0) {
      return NextResponse.json(
        { error: `Fields not updatable: ${rejected.join(", ")}` },
        { status: 400 }
      )
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 })
    }

    const { data, error } = await s.supabase
      .from("analyses")
      .update(patch)
      .eq("id", id)
      .eq("user_id", s.userId)
      .select(ANALYSIS_COLUMNS)
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ analysis: data })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to update analysis"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const s = await requireSession()
    if ("error" in s) return s.error

    const { data, error } = await s.supabase
      .from("analyses")
      .delete()
      .eq("id", id)
      .eq("user_id", s.userId)
      .select("id")
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Delete failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
