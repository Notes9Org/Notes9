import { redirect } from 'next/navigation'
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus } from 'lucide-react'
import Link from 'next/link'
import { ExperimentsPageContent } from './experiment-list'
import { SetPageBreadcrumb } from "@/components/layout/breadcrumb-context"

export default async function ExperimentsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect("/auth/login")
  }

  // Fetch experiments
  const { data: experiments } = await supabase
    .from("experiments")
    .select(`
      *,
      project:projects(name),
      assigned_to:profiles!experiments_assigned_to_fkey(first_name, last_name)
    `)
    .order("created_at", { ascending: false })

  return (
      <div className="space-y-6">
        <SetPageBreadcrumb segments={[]} />
        {experiments && experiments.length > 0 ? (
          <ExperimentsPageContent experiments={experiments} />
        ) : (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-muted-foreground">
                Manage and track all experimental procedures
              </p>
              <Button asChild size="icon" variant="ghost" className="shrink-0 size-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" aria-label="New experiment">
                <Link href="/experiments/new">
                  <Plus className="size-4" />
                </Link>
              </Button>
            </div>
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <p className="text-muted-foreground mb-4">No experiments yet</p>
                <Button asChild>
                  <Link href="/experiments/new">
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
