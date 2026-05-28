import { createClient } from "@/lib/supabase/server"
import { requireUser } from "@/lib/auth/current-user"
import { ResearchMapView } from "@/components/research-map/research-map-view"

export default async function ResearchMapPage() {
  const user = await requireUser()
  const supabase = await createClient()
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col md:overflow-hidden">
      <div className="px-3 sm:px-4 md:px-6 pt-3 md:pt-4 pb-2">
        <h1 className="font-display text-lg md:text-xl font-semibold text-foreground">Research map</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          See how your projects, experiments, lab notes, and papers connect.
        </p>
      </div>
      <ResearchMapView />
    </div>
  )
}
