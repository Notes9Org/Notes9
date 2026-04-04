import { redirect } from 'next/navigation'
import { createClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { Plus } from 'lucide-react'
import Link from 'next/link'
import { LiteratureTabs } from '@/components/literature-reviews/literature-tabs'
import type { StagingLiteratureRow } from "@/components/literature-reviews/staging-tab"
import { UploadLiteraturePdfDialog } from "@/components/literature-reviews/upload-literature-pdf-dialog"
import { resolveInitialProjectIdParam } from "@/lib/url-project-param"
import { SetPageBreadcrumb } from "@/components/layout/breadcrumb-context"

export default async function LiteratureReviewsPage({
  searchParams,
}: {
  searchParams?: Promise<{ project?: string }>
}) {
  const sp = searchParams ? await searchParams : {}
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect("/auth/login")
  }

  // Fetch literature reviews with related data
  const { data: literatureReviews } = await supabase
    .from("literature_reviews")
    .select(`
      *,
      project:projects(id, name),
      experiment:experiments(id, name),
      created_by_profile:profiles!literature_reviews_created_by_fkey(first_name, last_name)
    `)
    .order("created_at", { ascending: false })

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single()

  const organizationId = profile?.organization_id

  const { data: projects = [] } = organizationId
    ? await supabase
        .from("projects")
        .select("id, name")
        .eq("organization_id", organizationId)
        .order("name")
    : { data: [] as { id: string; name: string }[] }
  const safeProjects = projects ?? []

  const projectIds = safeProjects.map((project) => project.id)
  const { data: experiments = [] } =
    organizationId && projectIds.length > 0
      ? await supabase
          .from("experiments")
          .select("id, name, project_id")
          .in("project_id", projectIds)
          .order("name")
      : { data: [] as { id: string; name: string; project_id: string }[] }
  const safeExperiments = experiments ?? []

  const initialProjectId = resolveInitialProjectIdParam(
    sp.project,
    safeProjects.map((p) => p.id)
  )
  const scopedProject = initialProjectId
    ? safeProjects.find((p) => p.id === initialProjectId)
    : null

  return (
    <div className="space-y-4 md:space-y-6">
      {scopedProject ? (
        <SetPageBreadcrumb
          segments={[
            { label: scopedProject.name, href: `/projects/${scopedProject.id}` },
            { label: "Literature" },
          ]}
        />
      ) : (
        <SetPageBreadcrumb segments={[]} />
      )}
      {/* Header: stacked on mobile */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">Literature Reviews</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Search papers and manage your reference library
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <UploadLiteraturePdfDialog
            literatureReviews={(literatureReviews ?? []) as any}
            projects={safeProjects}
            experiments={safeExperiments}
          />
          <Button asChild className="w-full sm:w-auto">
            <Link
              href={
                initialProjectId
                  ? `/literature-reviews/new?project=${initialProjectId}`
                  : "/literature-reviews/new"
              }
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Reference
            </Link>
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <LiteratureTabs
        literatureReviews={literatureReviews}
        stagedLiterature={
          (literatureReviews ?? []).filter(
            (row: { catalog_placement?: string | null }) => row.catalog_placement === "staging"
          ) as StagingLiteratureRow[]
        }
        projects={safeProjects}
        experiments={safeExperiments}
        initialProjectId={initialProjectId}
      />
    </div>
  )
}
