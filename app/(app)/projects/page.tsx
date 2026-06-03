import { createClient } from "@/lib/supabase/server"
import { requireUser } from "@/lib/auth/current-user"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus, FlaskConical, ClipboardList, NotebookPen, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { ProjectsPageContent } from './project-list'
import { SetPageBreadcrumb } from "@/components/layout/breadcrumb-context"
import { CatalystSectionHero } from "@/components/catalyst/catalyst-section-hero"

export default async function ProjectsPage() {
  const user = await requireUser()
  const supabase = await createClient()
  // Fetch projects with member and experiment counts
  const { data: projectsRaw } = await supabase
    .from("projects")
    .select(`
      *,
      created_by:profiles!projects_created_by_fkey(first_name, last_name),
      no_of_members:project_members(count),
      no_of_experiments:experiments(count)
    `)
    .order("created_at", { ascending: false })

  // Transform the data to extract counts as simple numbers
  const projects = projectsRaw?.map(project => ({
    ...project,
    no_of_members: project.no_of_members?.[0]?.count || 0,
    no_of_experiments: project.no_of_experiments?.[0]?.count || 0,
  }))

  const greetingName =
    (user.user_metadata?.first_name as string | undefined) ||
    (user.user_metadata?.full_name as string | undefined)?.split(" ")[0] ||
    user.email?.split("@")[0] ||
    "Researcher"

  return (
    <div className="flex flex-col gap-6 md:gap-8 pb-8">
      <SetPageBreadcrumb segments={[]} />

      <CatalystSectionHero size="sm" scope="lab" shrinkOnScroll />

      {projects && projects.length > 0 ? (
        <ProjectsPageContent projects={projects} />
      ) : (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-muted-foreground">
              Manage your research initiatives and experiments
            </p>
            <Button id="tour-create-project" asChild size="icon" variant="ghost" className="shrink-0 size-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" aria-label="New project">
              <Link href="/projects/new">
                <Plus className="size-4" />
              </Link>
            </Button>
          </div>
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 px-6 text-center">
              <p className="text-sm text-muted-foreground max-w-xl mb-6">
                Projects organize your experiments, lab notes, protocols, samples, and reports into a single research effort.
              </p>
              <Button asChild id="tour-create-project" size="lg">
                <Link href="/projects/new">
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Project
                </Link>
              </Button>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-8 w-full max-w-2xl text-left">
                <div className="flex items-start gap-3 rounded-md border border-border/60 bg-card/60 p-3">
                  <FlaskConical className="size-4 mt-0.5 text-muted-foreground shrink-0" aria-hidden />
                  <p className="text-xs text-muted-foreground">Run experiments with attached protocols and samples.</p>
                </div>
                <div className="flex items-start gap-3 rounded-md border border-border/60 bg-card/60 p-3">
                  <NotebookPen className="size-4 mt-0.5 text-muted-foreground shrink-0" aria-hidden />
                  <p className="text-xs text-muted-foreground">Capture lab notes that link back to the experiment.</p>
                </div>
                <div className="flex items-start gap-3 rounded-md border border-border/60 bg-card/60 p-3">
                  <ClipboardList className="size-4 mt-0.5 text-muted-foreground shrink-0" aria-hidden />
                  <p className="text-xs text-muted-foreground">Reuse protocols across experiments and version them as they evolve.</p>
                </div>
                <div className="flex items-start gap-3 rounded-md border border-border/60 bg-card/60 p-3">
                  <Sparkles className="size-4 mt-0.5 text-muted-foreground shrink-0" aria-hidden />
                  <p className="text-xs text-muted-foreground">Generate AI reports from your data files and lab notes.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
