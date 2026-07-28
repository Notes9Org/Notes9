import { NextResponse } from "next/server"

import { requireSession } from "../../_shared"

type Ctx = { params: Promise<{ id: string }> }

/**
 * PATCH /api/analyses/[id]/figure — persist `figure_spec` only.
 *
 * The debounced autosave target for the figure editor: it fires often, so it
 * writes one column and returns the id rather than the whole row.
 */
export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const s = await requireSession()
    if ("error" in s) return s.error

    const body = await request.json().catch(() => null)
    const figureSpec = (body as { figure_spec?: unknown } | null)?.figure_spec
    if (!figureSpec || typeof figureSpec !== "object" || Array.isArray(figureSpec)) {
      return NextResponse.json({ error: "figure_spec object is required" }, { status: 400 })
    }

    const { data, error } = await s.supabase
      .from("analyses")
      .update({ figure_spec: figureSpec })
      .eq("id", id)
      .eq("user_id", s.userId)
      .select("id, updated_at")
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ ok: true, updated_at: data.updated_at })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to save figure"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
