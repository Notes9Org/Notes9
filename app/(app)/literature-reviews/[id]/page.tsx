import { redirect, notFound } from 'next/navigation'
import { createClient } from "@/lib/supabase/server"
import { SetPageBreadcrumb } from "@/components/layout/breadcrumb-context"
import { LiteratureDetailView } from '@/components/literature-reviews/literature-detail-view'

export default async function LiteratureReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
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

  return (
    <div className="space-y-6">
      <SetPageBreadcrumb
        segments={[
          { label: "Literature", href: "/literature-reviews" },
          { label: literature.title.length > 50 ? `${literature.title.substring(0, 50)}...` : literature.title },
        ]}
      />
      {/* Literature Detail */}
      <LiteratureDetailView literature={literature} showBreadcrumb={false} showActions={true} />
    </div>
  )
}
