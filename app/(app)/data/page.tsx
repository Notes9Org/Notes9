import { redirect } from "next/navigation"

/**
 * The standalone Data files page has been folded into the unified /data-analysis
 * page (Analysis | Data files toggle). Redirect here, preserving any
 * ?project=/?experiment= context so deep links keep working.
 */
export default async function DataFilesRedirect({
  searchParams,
}: {
  searchParams?: Promise<{ project?: string; experiment?: string }>
}) {
  const params = (await searchParams) ?? {}
  const qs = new URLSearchParams()
  if (params.project) qs.set("project", params.project)
  if (params.experiment) qs.set("experiment", params.experiment)
  const query = qs.toString()
  redirect(`/data-analysis${query ? `?${query}` : ""}`)
}
