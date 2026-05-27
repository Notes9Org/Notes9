import { Suspense } from "react"
import { redirect } from "next/navigation"
import { PapersPageInner } from "./papers-page-inner"
import { CatalystSectionHero } from "@/components/catalyst/catalyst-section-hero"
import { createClient } from "@/lib/supabase/server"

export default async function PapersPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect("/auth/login")
  }

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

  return (
    <div className="space-y-6">
      <CatalystSectionHero size="sm" scope="writing" />
      <Suspense
        fallback={
          <div className="text-sm text-muted-foreground">
            Loading writing workspace…
          </div>
        }
      >
        <PapersPageInner projects={safeProjects} />
      </Suspense>
    </div>
  )
}
