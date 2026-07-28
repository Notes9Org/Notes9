import { NextResponse } from "next/server"

import { callCatalyst } from "@/lib/catalyst-client"
import type { FigureSpec, Results } from "@/types/analysis"
import { ANALYSIS_COLUMNS, catalystErrorResponse, requireSession } from "./_shared"

/** GET /api/analyses?experiment_id=&project_id= — the caller's analyses, newest first. */
export async function GET(request: Request) {
  try {
    const s = await requireSession()
    if ("error" in s) return s.error

    const { searchParams } = new URL(request.url)
    const experimentId = searchParams.get("experiment_id")
    const projectId = searchParams.get("project_id")

    let query = s.supabase
      .from("analyses")
      .select(ANALYSIS_COLUMNS)
      .eq("user_id", s.userId)
      .order("created_at", { ascending: false })

    if (experimentId) query = query.eq("experiment_id", experimentId)
    if (projectId) query = query.eq("project_id", projectId)

    const { data, error } = await query
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ analyses: data ?? [] })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to list analyses"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * POST /api/analyses — run a spec on the catalyst backend and store the result.
 *
 * ponytail: one row is written, after the run succeeds. The `running`/`failed`
 * statuses exist for a future async runner; a failed synchronous run returns
 * the error instead of persisting a dead row.
 */
export async function POST(request: Request) {
  try {
    const s = await requireSession()
    if ("error" in s) return s.error
    if (!s.token) {
      return NextResponse.json({ error: "No active session token available." }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const { experiment_id, project_id, title, analysis_spec, source_data_id, data } =
      body as Record<string, unknown>

    if (typeof experiment_id !== "string" || !experiment_id) {
      return NextResponse.json({ error: "experiment_id is required" }, { status: 400 })
    }
    if (!analysis_spec || typeof analysis_spec !== "object") {
      return NextResponse.json({ error: "analysis_spec is required" }, { status: 400 })
    }
    if (data === undefined) {
      return NextResponse.json({ error: "data is required" }, { status: 400 })
    }

    const spec = analysis_spec as Record<string, unknown>

    let run: { results: Results; figure_spec: FigureSpec }
    try {
      run = await callCatalyst<
        { analysis_spec: unknown; data: unknown },
        { results: Results; figure_spec: FigureSpec }
      >("/analysis/run", { analysis_spec, data }, s.token)
    } catch (e: unknown) {
      const mapped = catalystErrorResponse(e)
      if (mapped) return mapped
      throw e
    }

    const { data: row, error } = await s.supabase
      .from("analyses")
      .insert({
        user_id: s.userId,
        experiment_id,
        project_id: typeof project_id === "string" ? project_id : null,
        title: typeof title === "string" && title.trim() ? title.trim() : undefined,
        table_type: spec.table_type,
        analysis_type: spec.analysis_type,
        runtime: spec.runtime ?? "python",
        analysis_spec,
        source_data_id: typeof source_data_id === "string" ? source_data_id : null,
        source_ref: spec.source ?? {},
        results: run.results,
        figure_spec: run.figure_spec,
        status: "ready",
      })
      .select(ANALYSIS_COLUMNS)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ analysis: row }, { status: 201 })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to create analysis"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
