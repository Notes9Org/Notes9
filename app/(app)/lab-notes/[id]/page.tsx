import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

/**
 * Redirect route: /lab-notes/[id] → /experiments/[experimentId]?tab=notes&noteId=[id]
 *
 * AI citation links use this because GroundingResource only carries the lab
 * note id, not the parent experiment id.  This server component resolves the
 * relationship and redirects.  Any extra query params (e.g. `highlight=`) are
 * preserved.
 */
export default async function LabNoteRedirectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id } = await params
  const sp = await searchParams
  const supabase = await createClient()

  const { data } = await supabase
    .from("lab_notes")
    .select("experiment_id")
    .eq("id", id)
    .maybeSingle()

  if (!data?.experiment_id) {
    redirect("/experiments")
  }

  const qs = new URLSearchParams()
  qs.set("tab", "notes")
  qs.set("noteId", id)

  for (const [key, value] of Object.entries(sp)) {
    if (key === "tab" || key === "noteId") continue
    if (typeof value === "string") qs.set(key, value)
    else if (Array.isArray(value)) value.forEach((v) => qs.append(key, v))
  }

  redirect(`/experiments/${data.experiment_id}?${qs.toString()}`)
}
