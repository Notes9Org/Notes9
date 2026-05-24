import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { ResearchMapView } from "@/components/research-map/research-map-view"

export default async function ResearchMapPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect("/auth/login")
  }

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
