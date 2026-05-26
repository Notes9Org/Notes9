import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

export default async function ProjectDataRedirect({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; experiment?: string }>
}) {
  const { project: projectId, experiment: experimentId } = await searchParams
  const supabase = await createClient()

  if (!projectId && !experimentId) {
    redirect("/dashboard")
  }

  if (experimentId) {
    const qs = new URLSearchParams({ tab: "data" })
    if (projectId) qs.set("project", projectId)
    qs.set("experiment", experimentId)
    redirect(`/experiments/${experimentId}?${qs.toString()}`)
  }

  if (!projectId) {
    redirect("/dashboard")
  }

  const { data: experiment } = await supabase
    .from("experiments")
    .select("id")
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .single()

  if (experiment) {
    redirect(
      `/experiments/${experiment.id}?project=${projectId}&experiment=${experiment.id}&tab=data`,
    )
  } else {
    redirect(`/experiments?project=${projectId}`)
  }
}
