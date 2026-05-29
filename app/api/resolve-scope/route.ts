import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth/current-user"
import { isLikelyUuid } from "@/lib/url-project-param"

const PATH_SCOPE_RE =
  /^\/(projects|experiments|lab-notes|protocols|samples|data|reports|equipment|papers|literature-reviews)\/([^/?#]+)/

const CACHE_HEADERS = { "Cache-Control": "private, max-age=300" }

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const path = searchParams.get("path")
  const fallback = searchParams.get("fallback")
  const experimentParam = searchParams.get("experiment")

  if (!path) {
    return NextResponse.json({ error: "No path provided" }, { status: 400 })
  }

  const match = path.match(PATH_SCOPE_RE)
  if (!match) {
    return NextResponse.json(
      { projectId: null, projectName: null, experimentId: null, experimentName: null },
      { headers: CACHE_HEADERS },
    )
  }

  const type = match[1]
  const id = match[2]

  // Require an authenticated session. Without this, anyone could resolve
  // project/experiment names from IDs (org-structure enumeration). RLS limits
  // *which* rows are returned, but the endpoint itself must not be anonymous.
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = await createClient()

  let projectId: string | null = null
  let projectName: string | null = null
  let experimentId: string | null = null
  let experimentName: string | null = null

  try {
    // Single round-trip to Postgres instead of 2–4 sequential queries.
    // The function runs as SECURITY INVOKER so RLS enforces the org boundary.
    const { data, error } = await supabase.rpc("resolve_entity_scope", {
      p_type: type,
      p_id: id,
    })

    if (!error && data && data.length > 0) {
      const row = data[0]
      projectId = row.project_id ?? null
      projectName = row.project_name ?? null
      experimentId = row.experiment_id ?? null
      experimentName = row.experiment_name ?? null
    }
  } catch (err) {
    console.error("Resolve scope RPC failed", err)
  }

  // If the path entity didn't carry an experiment but the client passed
  // ?experiment=<id>, supplement with that experiment's context.
  if (!experimentId && experimentParam && isLikelyUuid(experimentParam)) {
    try {
      const { data: exp } = await supabase
        .from("experiments")
        .select("name, project_id")
        .eq("id", experimentParam)
        .single()
      if (exp) {
        experimentId = experimentParam
        experimentName = exp.name ?? null
        if (!projectId) projectId = exp.project_id ?? null
      }
    } catch {
      // non-fatal
    }
  }

  // Fallback: if no project resolved from the entity, use the persisted ID
  // the client sent and look up its name.
  if (!projectId && fallback) {
    projectId = fallback
    if (!projectName) {
      try {
        const { data: proj } = await supabase
          .from("projects")
          .select("name")
          .eq("id", fallback)
          .single()
        projectName = proj?.name ?? null
      } catch {
        // non-fatal
      }
    }
  }

  return NextResponse.json(
    { projectId, projectName, experimentId, experimentName },
    { headers: CACHE_HEADERS },
  )
}
