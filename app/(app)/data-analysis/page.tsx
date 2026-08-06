import { redirect } from "next/navigation"

/**
 * The analysis workspace is shelved for now.
 *
 * Its page lives on, unrouted, in `./data-analysis-page.tsx` — see the note
 * there for how to bring it back. Until then this route sends visitors (and
 * old bookmarks) to Data files, the half of the Data section that is shipping,
 * preserving any ?project=/?experiment= context so deep links still land in the
 * right place.
 */
export default async function DataAnalysisShelved({
  searchParams,
}: {
  searchParams?: Promise<{ project?: string; experiment?: string }>
}) {
  const params = (await searchParams) ?? {}
  const qs = new URLSearchParams()
  if (params.project) qs.set("project", params.project)
  if (params.experiment) qs.set("experiment", params.experiment)
  const query = qs.toString()
  redirect(`/data${query ? `?${query}` : ""}`)
}
