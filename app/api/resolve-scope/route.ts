import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const path = searchParams.get("path")
  const fallback = searchParams.get("fallback")
  if (!path) return NextResponse.json({ error: "No path provided" }, { status: 400 })

  const match = path.match(/^\/(projects|experiments|lab-notes|protocols|samples|data|reports|equipment|papers|literature-reviews)\/([^/?#]+)/)
  if (!match) return NextResponse.json({ projectId: null, projectName: null, experimentId: null, experimentName: null })

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
      const { data } = await supabase.from("experiments").select("name, project_id").eq("id", id).single()
      if (data) {
        experimentName = data.name
        projectId = data.project_id
      }
    } else if (type === "lab-notes") {
      const { data: note } = await supabase.from("lab_notes").select("experiment_id, project_id").eq("id", id).single()
      if (note) {
        if (note.experiment_id) {
          experimentId = note.experiment_id
          const { data: exp } = await supabase.from("experiments").select("name, project_id").eq("id", experimentId).single()
          if (exp) {
            experimentName = exp.name
            projectId = exp.project_id
          }
        } else if (note.project_id) {
          projectId = note.project_id
        }
      }
    } else {
      const tableName = type === "data" ? "experiment_data" : type.replace("-", "_")
      // Check if table has project_id
      const { data: row, error: projErr } = await supabase.from(tableName).select("project_id").eq("id", id).single()
      if (row?.project_id) {
        projectId = row.project_id
      } else {
        // Fallback to check experiment_id (e.g. for samples)
        const { data: rowExp, error: expErr } = await supabase.from(tableName).select("experiment_id").eq("id", id).single()
        if (rowExp?.experiment_id) {
          experimentId = rowExp.experiment_id
          const { data: exp } = await supabase.from("experiments").select("name, project_id").eq("id", experimentId).single()
          if (exp) {
            experimentName = exp.name
            projectId = exp.project_id
          }
        }
      }
    }

    if (!projectId && fallback) {
      // Fallback to the query parameter if the path didn't yield a project
      projectId = fallback
    }

    if (projectId) {
      const { data: proj } = await supabase.from("projects").select("name").eq("id", projectId).single()
      if (proj) projectName = proj.name
    }
  } catch (err) {
    console.error("Resolve scope failed", err)
  }

  console.log("RESOLVE SCOPE:", { path, type, id, projectId, projectName, experimentId, experimentName })
  return NextResponse.json({ projectId, projectName, experimentId, experimentName })
}
