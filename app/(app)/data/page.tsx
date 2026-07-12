import { redirect } from "next/navigation"

export default async function ProjectDataRedirect({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; experiment?: string }>
}) {
  const { project: projectId, experiment: experimentId } = await searchParams

  if (experimentId) {
    const qs = new URLSearchParams({ tab: "data" })
    if (projectId) qs.set("project", projectId)
    qs.set("experiment", experimentId)
    redirect(`/experiments/${experimentId}?${qs.toString()}`)
  }

  // Data lives per-experiment. With no experiment explicitly selected, land on
  // the experiments list so the user picks one — never auto-open the most
  // recently updated experiment (it read as "my previous experiment reopened
  // itself" when clicking Data in the sidebar). `intent=data` makes the
  // experiments page explain the hop, so it doesn't look like a glitch.
  redirect(
    projectId
      ? `/experiments?project=${projectId}&intent=data`
      : "/experiments?intent=data",
  )
}
