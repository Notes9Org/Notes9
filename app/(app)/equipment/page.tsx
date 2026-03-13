import { redirect } from 'next/navigation'
import { createClient } from "@/lib/supabase/server"
import { EquipmentPageContent, EquipmentEmptyState } from './equipment-page-content'

export default async function EquipmentPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect("/auth/login")
  }

  const { data: equipment } = await supabase
    .from("equipment")
    .select("*")
    .order("name")

  const statusCount = {
    available: equipment?.filter((e) => e.status === "available").length || 0,
    in_use: equipment?.filter((e) => e.status === "in_use").length || 0,
    maintenance: equipment?.filter((e) => e.status === "maintenance").length || 0,
    offline: equipment?.filter((e) => e.status === "offline").length || 0,
  }

  return (
    <div className="space-y-6">
      {equipment && equipment.length > 0 ? (
        <EquipmentPageContent equipment={equipment} statusCount={statusCount} />
      ) : (
        <EquipmentEmptyState />
      )}
    </div>
  )
}
