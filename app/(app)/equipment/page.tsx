import { redirect } from 'next/navigation'
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Microscope, Plus } from 'lucide-react'
import Link from 'next/link'
import { EquipmentList } from './equipment-list'

export default async function EquipmentPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect("/auth/login")
  }

  // Fetch equipment
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
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Laboratory Equipment</h1>
            <p className="text-muted-foreground mt-1">
              Manage and track laboratory instruments and equipment
            </p>
          </div>
          <Button asChild>
            <Link href="/equipment/new">
              <Plus className="h-4 w-4 mr-2" />
              Add Equipment
            </Link>
          </Button>
        </div>

        {/* Status Overview */}
        <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Available
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-success">{statusCount.available}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                In Use
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{statusCount.in_use}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Maintenance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-warning">{statusCount.maintenance}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Offline
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{statusCount.offline}</div>
            </CardContent>
          </Card>
        </div>

        {/* Equipment List */}
        {equipment && equipment.length > 0 ? (
          <EquipmentList equipment={equipment} />
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Microscope className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">No equipment registered</p>
              <Button asChild>
                <Link href="/equipment/new">
                  <Plus className="h-4 w-4 mr-2" />
                  Add First Equipment
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    )
}
