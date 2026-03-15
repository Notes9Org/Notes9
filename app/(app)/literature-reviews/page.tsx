import { redirect } from 'next/navigation'
import { createClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { Plus } from 'lucide-react'
import Link from 'next/link'
import { LiteratureTabs } from '@/components/literature-reviews/literature-tabs'

export default async function LiteratureReviewsPage() {
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

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header: stacked on mobile */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">Literature Reviews</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Search papers and manage your reference library
          </p>
        </div>
        <Button asChild className="w-full sm:w-auto">
          <Link href="/literature-reviews/new">
            <Plus className="h-4 w-4 mr-2" />
            Add Reference
          </Link>
        </Button>
      </div>

      {/* Tabs */}
      <LiteratureTabs literatureReviews={literatureReviews} />
    </div>
  )
}
