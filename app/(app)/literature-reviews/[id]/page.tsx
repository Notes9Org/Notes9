import { redirect, notFound } from 'next/navigation'
import { createClient } from "@/lib/supabase/server"
import { SetPageBreadcrumb } from "@/components/layout/breadcrumb-context"
import { LiteratureDetailView } from '@/components/literature-reviews/literature-detail-view'
import { resolveInitialProjectIdParam } from "@/lib/url-project-param"

export default async function LiteratureReviewDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ tab?: string; project?: string }>
}) {
  const { id } = await params
  const resolvedSearch = searchParams ? await searchParams : {}
  const initialTab =
    resolvedSearch.tab === "pdf" ||
    resolvedSearch.tab === "citation" ||
    resolvedSearch.tab === "linked"
      ? resolvedSearch.tab
      : "overview"
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect("/auth/login")
  }

  // Fetch literature review details
  const { data: literature, error } = await supabase
    .from("literature_reviews")
    .select(`
      *,
      created_by_profile:profiles!literature_reviews_created_by_fkey(
        first_name,
        last_name,
        email
      ),
      project:projects(id, name),
      experiment:experiments(id, name)
    `)
    .eq("id", id)
    .single()

  if (error || !literature) {
    notFound()
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single()
  const { data: orgProjects = [] } = profile?.organization_id
    ? await supabase.from("projects").select("id").eq("organization_id", profile.organization_id)
    : { data: [] as { id: string }[] }
  const allowedProjectIds = (orgProjects ?? []).map((p) => p.id)
  const projectFromUrl = resolveInitialProjectIdParam(
    resolvedSearch.project,
    allowedProjectIds
  )
  const literatureProjectId =
    (literature as { project_id?: string | null }).project_id ?? literature.project?.id ?? null
  const titleShort =
    literature.title.length > 50 ? `${literature.title.substring(0, 50)}...` : literature.title

  let breadcrumbSegments: { label: string; href?: string }[] = [
    { label: "Literature", href: "/literature-reviews" },
    { label: titleShort },
  ]
  if (
    projectFromUrl &&
    literatureProjectId === projectFromUrl
  ) {
    const { data: projRow } = await supabase
      .from("projects")
      .select("id, name")
      .eq("id", projectFromUrl)
      .single()
    if (projRow) {
      breadcrumbSegments = [
        { label: projRow.name, href: `/projects/${projRow.id}` },
        {
          label: "Literature",
          href: `/literature-reviews?project=${projRow.id}`,
        },
        { label: titleShort },
      ]
    }
  }

  return (
    <div className="space-y-6">
      <SetPageBreadcrumb segments={breadcrumbSegments} />
      {/* Literature Detail */}
      <LiteratureDetailView
        literature={literature}
        showBreadcrumb={false}
        showActions={true}
        initialTab={initialTab}
      />
    </div>
  )
}
