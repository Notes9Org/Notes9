import { Suspense } from "react"
import { PapersPageInner } from "./papers-page-inner"
import { CatalystSectionHero } from "@/components/catalyst/catalyst-section-hero"
import { createClient } from "@/lib/supabase/server"

import { requireUser } from "@/lib/auth/current-user"
export default async function PapersPage() {
  const user = await requireUser()
  const supabase = await createClient()
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
      <CatalystSectionHero size="sm" scope="writing" shrinkOnScroll />
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
