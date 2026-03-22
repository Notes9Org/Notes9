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
      <h1 className="sr-only">Research map</h1>
      <ResearchMapView />
    </div>
  )
}
