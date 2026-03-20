import { redirect } from 'next/navigation'
import { createClient } from "@/lib/supabase/server"
import { ProtocolsPageContent, ProtocolsEmptyState } from './protocols-page-content'

export default async function ProtocolsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect("/auth/login")
  }

  const { data: protocols } = await supabase
    .from("protocols")
    .select(`
      *,
      experiment_protocols(count)
    `)
    .eq("is_active", true)
    .order("name")

  return (
    <div className="space-y-6">
      {protocols && protocols.length > 0 ? (
        <ProtocolsPageContent protocols={protocols} />
      ) : (
        <ProtocolsEmptyState />
      )}
    </div>
  )
}
