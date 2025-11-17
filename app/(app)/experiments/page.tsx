import { redirect } from 'next/navigation'
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus } from 'lucide-react'
import Link from 'next/link'
import { ExperimentList } from './experiment-list'

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
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Experiments</h1>
            <p className="text-muted-foreground mt-1">
              Manage and track all experimental procedures
            </p>
          </div>
          <Button asChild>
            <Link href="/experiments/new">
              <Plus className="h-4 w-4 mr-2" />
              New Experiment
            </Link>
          </Button>
        </div>

        {/* Experiments List with Grid/Table Toggle */}
        {experiments && experiments.length > 0 ? (
          <ExperimentList experiments={experiments} />
        ) : (
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
        )}
      </div>
    )
}
