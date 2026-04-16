import type { SupabaseClient } from "@supabase/supabase-js"

/** Resolve organization UUID for an experiment (for org-scoped storage paths). */
export async function fetchOrganizationIdForExperiment(
  supabase: SupabaseClient,
  experimentId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("experiments")
    .select("projects(organization_id)")
    .eq("id", experimentId)
    .maybeSingle()

  if (error || !data) return null

  const raw = (data as { projects: unknown }).projects
  if (!raw) return null
  const row = Array.isArray(raw) ? raw[0] : raw
  if (!row || typeof row !== "object" || !("organization_id" in row)) return null
  const orgId = (row as { organization_id: string }).organization_id
  return orgId ?? null
}
