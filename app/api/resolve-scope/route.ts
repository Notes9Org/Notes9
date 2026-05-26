import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { isLikelyUuid } from "@/lib/url-project-param"

const PATH_SCOPE_RE =
  /^\/(projects|experiments|lab-notes|protocols|samples|data|reports|equipment|papers|literature-reviews)\/([^/?#]+)/

const TABLE_BY_PATH_TYPE: Record<string, string> = {
  protocols: "protocols",
  samples: "samples",
  data: "experiment_data",
  reports: "reports",
  equipment: "equipment",
  papers: "papers",
  "literature-reviews": "literature_reviews",
}

async function loadProjectName(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
): Promise<string | null> {
  const { data: proj } = await supabase
    .from("projects")
    .select("name")
    .eq("id", projectId)
    .single()
  return proj?.name ?? null
}

async function loadExperimentScope(
  supabase: Awaited<ReturnType<typeof createClient>>,
  experimentId: string,
): Promise<{ experimentName: string | null; projectId: string | null }> {
  const { data: exp } = await supabase
    .from("experiments")
    .select("name, project_id")
    .eq("id", experimentId)
    .single()
  return {
    experimentName: exp?.name ?? null,
    projectId: exp?.project_id ?? null,
  }
}

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
    return NextResponse.json({
      projectId: null,
      projectName: null,
      experimentId: null,
      experimentName: null,
    })
  }

  const type = match[1]
  const id = match[2]
  const supabase = await createClient()

  let projectId: string | null = null
  let projectName: string | null = null
  let experimentId: string | null = null
  let experimentName: string | null = null

  try {
    if (type === "projects") {
      projectId = id
    } else if (type === "experiments") {
      experimentId = id
      const scope = await loadExperimentScope(supabase, id)
      experimentName = scope.experimentName
      projectId = scope.projectId
    } else if (type === "lab-notes") {
      const { data: note } = await supabase
        .from("lab_notes")
        .select("experiment_id, project_id")
        .eq("id", id)
        .single()

      if (note?.experiment_id) {
        experimentId = note.experiment_id
        const scope = await loadExperimentScope(supabase, experimentId)
        experimentName = scope.experimentName
        projectId = scope.projectId
      } else if (note?.project_id) {
        projectId = note.project_id
      }
    } else {
      const tableName = TABLE_BY_PATH_TYPE[type]
      if (tableName) {
        const { data: row } = await supabase
          .from(tableName)
          .select("project_id, experiment_id")
          .eq("id", id)
          .single()

        if (row?.project_id) {
          projectId = row.project_id
        }
        if (row?.experiment_id) {
          experimentId = row.experiment_id
          const scope = await loadExperimentScope(supabase, experimentId)
          experimentName = scope.experimentName
          projectId = scope.projectId ?? projectId
        } else if (type === "samples") {
          const { data: sampleLink } = await supabase
            .from("sample_experiments")
            .select("experiment_id")
            .eq("sample_id", id)
            .order("linked_at", { ascending: false })
            .limit(1)
            .maybeSingle()
          if (sampleLink?.experiment_id) {
            experimentId = sampleLink.experiment_id
            const scope = await loadExperimentScope(supabase, experimentId)
            experimentName = scope.experimentName
            projectId = scope.projectId ?? projectId
          } else if (!projectId) {
            const { data: projectLink } = await supabase
              .from("sample_projects")
              .select("project_id")
              .eq("sample_id", id)
              .limit(1)
              .maybeSingle()
            if (projectLink?.project_id) {
              projectId = projectLink.project_id
            }
          }
        } else if (type === "protocols" && !experimentId) {
          const { data: usage } = await supabase
            .from("experiment_protocols")
            .select("experiment_id")
            .eq("protocol_id", id)
            .limit(1)
            .maybeSingle()
          if (usage?.experiment_id) {
            experimentId = usage.experiment_id
            const scope = await loadExperimentScope(supabase, experimentId)
            experimentName = scope.experimentName
            projectId = scope.projectId ?? projectId
          }
        }
      }
    }

    if (!experimentId && experimentParam && isLikelyUuid(experimentParam)) {
      experimentId = experimentParam
      const scope = await loadExperimentScope(supabase, experimentId)
      experimentName = scope.experimentName
      projectId = scope.projectId ?? projectId
    }

    if (!projectId && fallback) {
      projectId = fallback
    }

    if (projectId) {
      projectName = await loadProjectName(supabase, projectId)
    }
  } catch (err) {
    console.error("Resolve scope failed", err)
  }

  return NextResponse.json({
    projectId,
    projectName,
    experimentId,
    experimentName,
  })
}
