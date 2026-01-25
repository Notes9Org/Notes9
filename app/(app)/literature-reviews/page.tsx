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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Literature Reviews</h1>
          <p className="text-muted-foreground mt-1">
            Search papers and manage your reference library
          </p>
        </div>
        <Button asChild>
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
