import { redirect } from 'next/navigation'
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus, X } from 'lucide-react'
import Link from 'next/link'
import { ExperimentsPageContent } from './experiment-list'
import { SetPageBreadcrumb } from "@/components/layout/breadcrumb-context"
import { resolveInitialProjectIdParam } from "@/lib/url-project-param"

export default async function ExperimentsPage({
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
                {projectContext ? (
                  <Button asChild variant="outline" size="sm" className="gap-2">
                    <Link href="/experiments">
                      <X className="h-4 w-4" />
                      Remove project filter
                    </Link>
                  </Button>
                ) : null}
                <Button id="tour-create-experiment" asChild size="icon" variant="ghost" className="shrink-0 size-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" aria-label="New experiment">
                  <Link
                    href={
                      projectContext
                        ? `/experiments/new?project=${projectContext.id}`
                        : "/experiments/new"
                    }
                  >
                    <Plus className="size-4" />
                  </Link>
                </Button>
              </div>
            </div>
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <p className="text-muted-foreground mb-4">No experiments yet</p>
                <Button id="tour-create-experiment" asChild>
                  <Link
                    href={
                      projectContext
                        ? `/experiments/new?project=${projectContext.id}`
                        : "/experiments/new"
                    }
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Create First Experiment
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    )
}
