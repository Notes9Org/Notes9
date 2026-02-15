import { redirect } from 'next/navigation'
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus } from 'lucide-react'
import Link from 'next/link'
import { ProjectsPageContent } from './project-list'
import { SetPageBreadcrumb } from "@/components/layout/breadcrumb-context"

export default async function ProjectsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect("/auth/login")
  }

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

  return (
      <div className="space-y-6">
        <SetPageBreadcrumb segments={[]} />
        {projects && projects.length > 0 ? (
          <ProjectsPageContent projects={projects} />
        ) : (
          <>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-muted-foreground">
              Manage your research initiatives and experiments
            </p>
            <Button asChild size="icon" variant="ghost" className="shrink-0 size-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" aria-label="New project">
              <Link href="/projects/new">
                <Plus className="size-4" />
              </Link>
            </Button>
          </div>
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <p className="text-muted-foreground mb-4">No projects yet</p>
              <Button asChild>
                <Link href="/projects/new">
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Project
                </Link>
              </Button>
            </CardContent>
          </Card>
          </>
        )}
      </div>
    )
}
