import { createClient } from "@/lib/supabase/server"
import { requireUser } from "@/lib/auth/current-user"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty"
import { FlaskConical, Plus } from 'lucide-react'
import Link from 'next/link'
import { ExperimentsPageContent } from './experiment-list'
import { SetPageBreadcrumb } from "@/components/layout/breadcrumb-context"
import { resolveInitialProjectIdParam } from "@/lib/url-project-param"
import { CatalystSectionHero } from "@/components/catalyst/catalyst-section-hero"

export default async function ExperimentsPage({
  searchParams,
}: {
  searchParams?: Promise<{ project?: string }>
}) {
  const user = await requireUser()
  const supabase = await createClient()
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

  let projectContext: { id: string; name: string } | null = null
  if (projectParam) {
    const { data: proj } = await supabase
      .from("projects")
      .select("id, name")
      .eq("id", projectParam)
      .single()
    if (proj) projectContext = { id: proj.id, name: proj.name }
  }

  // Fetch experiments
  const { data: experiments } = await supabase
    .from("experiments")
    .select(`
      *,
      project:projects(id, name),
      assigned_to:profiles!experiments_assigned_to_fkey(first_name, last_name)
    `)
    .order("created_at", { ascending: false })

  return (
      <div className="space-y-6">
        {projectContext ? (
          <SetPageBreadcrumb
            segments={[
              { label: projectContext.name, href: `/projects/${projectContext.id}` },
              { label: "Experiments" },
            ]}
          />
        ) : (
          <SetPageBreadcrumb segments={[]} />
        )}

        <CatalystSectionHero size="sm" scope="experiments" />

        {experiments && experiments.length > 0 ? (
          <ExperimentsPageContent
            experiments={experiments}
            projectContext={projectContext}
            linkProjectId={projectContext?.id ?? null}
          />
        ) : (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-muted-foreground">
                Manage and track all experimental procedures
              </p>
              <div className="flex items-center gap-2">
                <Button id="tour-create-experiment" asChild size="sm" className="gap-2">
                  <Link
                    href={
                      projectContext
                        ? `/experiments/new?project=${projectContext.id}`
                        : "/experiments/new"
                    }
                  >
                    <Plus className="size-4" />
                    New experiment
                  </Link>
                </Button>
              </div>
            </div>
            <Empty className="border border-dashed">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FlaskConical aria-hidden />
                </EmptyMedia>
                <EmptyTitle>No experiments yet</EmptyTitle>
                <EmptyDescription>
                  {projectContext
                    ? `Run your first experiment in ${projectContext.name} — link protocols, capture samples, and write lab notes from one place.`
                    : "An experiment is where you record what you ran, link the protocol and samples used, and capture lab notes alongside the results."}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button id="tour-create-experiment-empty" asChild>
                  <Link
                    href={
                      projectContext
                        ? `/experiments/new?project=${projectContext.id}`
                        : "/experiments/new"
                    }
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    New experiment
                  </Link>
                </Button>
              </EmptyContent>
            </Empty>
          </>
        )}
      </div>
    )
}
