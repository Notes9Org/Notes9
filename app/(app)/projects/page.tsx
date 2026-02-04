import { redirect } from 'next/navigation'
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus } from 'lucide-react'
import Link from 'next/link'
import { ProjectList } from './project-list'

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
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
            <p className="text-muted-foreground mt-1">
              Manage your research initiatives and experiments
            </p>
          </div>
          <Button asChild>
            <Link href="/projects/new">
              <Plus className="h-4 w-4 mr-2" />
              New Project
            </Link>
          </Button>
        </div>

        {/* Projects List with Grid/Table Toggle */}
        {projects && projects.length > 0 ? (
          <ProjectList projects={projects} />
        ) : (
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
        )}
      </div>
    )
}
