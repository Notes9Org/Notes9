import { Suspense } from "react"
import { createClient } from "@/lib/supabase/server"
import { requireUser } from "@/lib/auth/current-user"
import { ProtocolsPageContent, type ProtocolsProjectContext, type Protocol } from "./protocols-page-content"
import { resolveInitialProjectIdParam } from "@/lib/url-project-param"
import { loadProjectWorkspaceProtocols } from "@/lib/project-workspace-protocols"
import { CatalystSectionHero } from "@/components/catalyst/catalyst-section-hero"

export default async function ProtocolsPage({
  searchParams,
}: {
  searchParams?: Promise<{ project?: string; selectForDesign?: string }>
}) {
  const user = await requireUser()
  const supabase = await createClient()
  // `profile` and the protocols list are independent — fan out in parallel.
  // `orgProjects` still has to wait for `profile.organization_id` below.
  const [profileRes, protocolsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single(),
    supabase
      .from("protocols")
      .select(`
        *,
        experiment_protocols(count)
      `)
      .eq("is_active", true)
      .order("name"),
  ])
  const profile = profileRes.data
  const protocols = protocolsRes.data

  const orgId = profile?.organization_id
  const { data: orgProjects = [] } = orgId
    ? await supabase.from("projects").select("id").eq("organization_id", orgId)
    : { data: [] as { id: string }[] }
  const orgProjectIds = (orgProjects ?? []).map((p) => p.id)
  const sp = searchParams ? await searchParams : {}
  const projectParam = resolveInitialProjectIdParam(sp.project, orgProjectIds)

  // Kick off the protocol context-enrichment query now: it depends only on the
  // protocols list (already resolved above), so it can run concurrently with the
  // project-context resolution below instead of waiting in a serial chain.
  // Kept as a separate query (not folded into the main list select) so that on
  // DBs without migration 030 the list still loads and only enrichment degrades.
  const enrichmentPromise =
    protocols && protocols.length > 0
      ? supabase
          .from("protocols")
          .select("id, project:projects(id, name), experiment:experiments(id, name)")
          .in("id", protocols.map((p) => p.id))
      : Promise.resolve({ data: null as unknown })

  let projectContext: ProtocolsProjectContext | null = null
  if (projectParam) {
    // `proj` and `exps` both depend only on projectParam — fan out in parallel.
    const [projRes, expsRes] = await Promise.all([
      supabase.from("projects").select("id, name").eq("id", projectParam).single(),
      supabase.from("experiments").select("id").eq("project_id", projectParam),
    ])
    const proj = projRes.data
    if (proj) {
      const expIds = (expsRes.data ?? []).map((e) => e.id)
      const workspaceProtocols = await loadProjectWorkspaceProtocols(supabase, proj.id, expIds)
      const protocolIds = workspaceProtocols.map((p) => p.id)
      projectContext = { id: proj.id, name: proj.name, protocolIds }
    }
  }

  // Attempt to enrich with project/experiment context (requires migration 030).
  // If the columns don't exist yet the enrichment silently fails and protocols
  // are displayed without context chips.
  let enrichedProtocols: Protocol[] = (protocols ?? []) as Protocol[]
  if (protocols && protocols.length > 0) {
    try {
      // Resolve the enrichment query started earlier (ran concurrently with the
      // project-context resolution above).
      const { data: ctx } = await enrichmentPromise
      if (ctx) {
        // Supabase types the embedded relations as arrays; the original query
        // returns at most one row per relation, so we read them as single
        // objects (matching prior behavior). Cast through `unknown` to bridge.
        type CtxRow = {
          id: string
          project?: Protocol["project"]
          experiment?: Protocol["experiment"]
        }
        const ctxRows = ctx as unknown as CtxRow[]
        const ctxMap = new Map(ctxRows.map((r) => [r.id, r] as const))
        enrichedProtocols = (protocols as Protocol[]).map((p) => ({
          ...p,
          project: ctxMap.get(p.id)?.project ?? null,
          experiment: ctxMap.get(p.id)?.experiment ?? null,
        }))
      }
    } catch (err) {
      // migration not yet applied — show protocols without context
      console.error("protocols_enrichment_failed", err)
    }
  }

  return (
    <div className="space-y-6">
      <CatalystSectionHero size="sm" scope="protocols" shrinkOnScroll />

      <Suspense
        fallback={
          <div className="space-y-4 animate-pulse">
            <div className="h-9 w-64 rounded-md bg-muted" />
            <div className="h-40 rounded-lg bg-muted" />
          </div>
        }
      >
        <ProtocolsPageContent protocols={enrichedProtocols} projectContext={projectContext} />
      </Suspense>
    </div>
  )
}
