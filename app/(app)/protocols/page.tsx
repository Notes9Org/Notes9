import { redirect } from 'next/navigation'
import { createClient } from "@/lib/supabase/server"
import {
  ProtocolsPageContent,
  ProtocolsEmptyState,
  type ProtocolsProjectContext,
} from './protocols-page-content'
import { resolveInitialProjectIdParam } from "@/lib/url-project-param"
import { SetPageBreadcrumb } from "@/components/layout/breadcrumb-context"

export default async function ProtocolsPage({
  searchParams,
}: {
  searchParams?: Promise<{ project?: string }>
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect("/auth/login")
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single()

  const orgId = profile?.organization_id
  const { data: orgProjects = [] } = orgId
    ? await supabase.from("projects").select("id").eq("organization_id", orgId)
    : { data: [] as { id: string }[] }
  const orgProjectIds = (orgProjects ?? []).map((p) => p.id)
  const sp = searchParams ? await searchParams : {}
  const projectParam = resolveInitialProjectIdParam(sp.project, orgProjectIds)

  let projectContext: ProtocolsProjectContext | null = null
  if (projectParam) {
    const { data: proj } = await supabase
      .from("projects")
      .select("id, name")
      .eq("id", projectParam)
      .single()
    if (proj) {
      const { data: exps } = await supabase
        .from("experiments")
        .select("id")
        .eq("project_id", projectParam)
      const expIds = (exps ?? []).map((e) => e.id)
      let protocolIds: string[] = []
      if (expIds.length > 0) {
        const { data: links } = await supabase
          .from("experiment_protocols")
          .select("protocol_id")
          .in("experiment_id", expIds)
        protocolIds = [
          ...new Set(
            (links ?? [])
              .map((l) => l.protocol_id)
              .filter((x): x is string => Boolean(x))
          ),
        ]
      }
      projectContext = { id: proj.id, name: proj.name, protocolIds }
    }
  }

  const { data: protocols } = await supabase
    .from("protocols")
    .select(`
      *,
      experiment_protocols(count)
    `)
    .eq("is_active", true)
    .order("name")

  // Attempt to enrich with project/experiment context (requires migration 030).
  // If the columns don't exist yet the enrichment silently fails and protocols
  // are displayed without context chips.
  let enrichedProtocols: any[] = protocols ?? []
  if (protocols && protocols.length > 0) {
    try {
      const { data: ctx } = await supabase
        .from("protocols")
        .select("id, project:projects(id, name), experiment:experiments(id, name)")
        .in("id", protocols.map((p: any) => p.id))
      if (ctx) {
        const ctxMap = new Map((ctx as any[]).map((r) => [r.id, r]))
        enrichedProtocols = protocols.map((p: any) => ({
          ...p,
          project: ctxMap.get(p.id)?.project ?? null,
          experiment: ctxMap.get(p.id)?.experiment ?? null,
        }))
      }
    } catch {
      // migration not yet applied — show protocols without context
    }
  }

  return (
    <div className="space-y-6">
      {projectContext ? (
        <SetPageBreadcrumb
          segments={[
            { label: projectContext.name, href: `/projects/${projectContext.id}` },
            { label: "Protocols" },
          ]}
        />
      ) : (
        <SetPageBreadcrumb segments={[]} />
      )}
      {enrichedProtocols.length > 0 ? (
        <ProtocolsPageContent protocols={enrichedProtocols} projectContext={projectContext} />
      ) : (
        <ProtocolsEmptyState />
      )}
    </div>
  )
}
