import { redirect, notFound } from 'next/navigation'
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ArrowLeft, Microscope, MapPin, Calendar, AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import { EquipmentActions } from './equipment-actions'

export default async function EquipmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect("/auth/login")
  }

  // Fetch equipment details
  const { data: equipment, error } = await supabase
    .from("equipment")
    .select("*")
    .eq("id", id)
    .single()

  if (error || !equipment) {
    notFound()
  }

  // Fetch usage history
  const { data: usageHistory } = await supabase
    .from("equipment_usage")
    .select(`
      *,
      user:profiles!equipment_usage_user_id_fkey(first_name, last_name, email),
      experiment:experiments(id, name)
    `)
    .eq("equipment_id", id)
    .order("start_time", { ascending: false })
    .limit(20)

  // Fetch maintenance records
  const { data: maintenanceRecords } = await supabase
    .from("equipment_maintenance")
    .select(`
      *,
      performed_by_user:profiles!equipment_maintenance_performed_by_fkey(first_name, last_name, email)
    `)
    .eq("equipment_id", id)
    .order("maintenance_date", { ascending: false })

  // Calculate days until next maintenance
  const daysUntilMaintenance = equipment.next_maintenance_date
    ? Math.ceil(
        (new Date(equipment.next_maintenance_date).getTime() - new Date().getTime()) /
          (1000 * 60 * 60 * 24)
      )
    : null

  const formatDate = (date: string | null) => {
    if (!date) return "—"
    return new Date(date).toLocaleDateString()
  }

  const formatDateTime = (datetime: string | null) => {
    if (!datetime) return "—"
    return new Date(datetime).toLocaleString()
  }

  return (
      <div className="space-y-4 md:space-y-6">
        {/* Header: stacked on mobile, row on desktop */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <Button variant="ghost" size="icon" asChild className="shrink-0">
              <Link href="/equipment">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
                  {equipment.name}
                </h1>
                <Badge
                  variant={
                    equipment.status === "available"
                      ? "default"
                      : equipment.status === "in_use"
                      ? "secondary"
                      : equipment.status === "maintenance"
                      ? "outline"
                      : "destructive"
                  }
                >
                  {equipment.status.replace("_", " ")}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {equipment.equipment_code} • {equipment.category || "Uncategorized"}
              </p>
            </div>
          </div>
          <EquipmentActions equipment={equipment} />
        </div>

        {/* Quick Info Cards */}
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-4">
          <Card className="py-2">
            <CardHeader className="pb-1 pt-2 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Location
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-2">
              <div className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">
                  {equipment.location || "Not specified"}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="py-2">
            <CardHeader className="pb-1 pt-2 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Manufacturer
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-2">
              <div className="flex items-center gap-2">
                <Microscope className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">
                  {equipment.manufacturer || "—"}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="py-2">
            <CardHeader className="pb-1 pt-2 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Next Maintenance
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-2">
              <div className="flex items-center gap-2">
                {daysUntilMaintenance !== null && daysUntilMaintenance < 30 ? (
                  <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                ) : (
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <span className="text-sm font-medium text-foreground">
                  {formatDate(equipment.next_maintenance_date)}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="py-2">
            <CardHeader className="pb-1 pt-2 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Purchase Date
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-2">
              <div className="flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">
                  {formatDate(equipment.purchase_date)}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Maintenance Alert */}
        {daysUntilMaintenance !== null && daysUntilMaintenance < 30 && (
          <Card className="border-warning bg-warning/5">
            <CardContent className="flex items-center gap-3 py-3">
              <AlertTriangle className="h-5 w-5 text-warning" />
              <div>
                <p className="font-medium text-foreground">Maintenance Due Soon</p>
                <p className="text-sm text-muted-foreground">
                  Next maintenance is due in {daysUntilMaintenance} days
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Main Content Tabs */}
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="usage">Usage History</TabsTrigger>
            <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-foreground">Equipment Details</CardTitle>
                <CardDescription>Technical specifications and information</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Equipment Code</h3>
                    <p className="text-sm text-foreground font-mono">{equipment.equipment_code}</p>
                  </div>

                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Category</h3>
                    <Badge variant="secondary">{equipment.category || "Uncategorized"}</Badge>
                  </div>

                  {equipment.model && (
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground mb-1">Model</h3>
                      <p className="text-sm text-foreground">{equipment.model}</p>
                    </div>
                  )}

                  {equipment.manufacturer && (
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground mb-1">Manufacturer</h3>
                      <p className="text-sm text-foreground">{equipment.manufacturer}</p>
                    </div>
                  )}

                  {equipment.serial_number && (
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground mb-1">Serial Number</h3>
                      <p className="text-sm text-foreground font-mono">{equipment.serial_number}</p>
                    </div>
                  )}

                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Status</h3>
                    <Badge
                      variant={
                        equipment.status === "available"
                          ? "default"
                          : equipment.status === "in_use"
                          ? "secondary"
                          : "outline"
                      }
                    >
                      {equipment.status.replace("_", " ")}
                    </Badge>
                  </div>

                  {equipment.location && (
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground mb-1">Location</h3>
                      <p className="text-sm text-foreground">{equipment.location}</p>
                    </div>
                  )}

                  {equipment.purchase_date && (
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground mb-1">Purchase Date</h3>
                      <p className="text-sm text-foreground">{formatDate(equipment.purchase_date)}</p>
                    </div>
                  )}
                </div>

                {equipment.notes && (
                  <>
                    <Separator />
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground mb-1">Notes</h3>
                      <p className="text-sm text-foreground whitespace-pre-wrap">{equipment.notes}</p>
                    </div>
                  </>
                )}

                <Separator />

                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <h3 className="text-muted-foreground mb-1">Created At</h3>
                    <p className="text-foreground">{formatDateTime(equipment.created_at)}</p>
                  </div>
                  <div>
                    <h3 className="text-muted-foreground mb-1">Last Updated</h3>
                    <p className="text-foreground">{formatDateTime(equipment.updated_at)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="usage" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-foreground">Usage History</CardTitle>
                <CardDescription>Recent equipment usage records</CardDescription>
              </CardHeader>
              <CardContent>
                {usageHistory && usageHistory.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Experiment</TableHead>
                        <TableHead>Start Time</TableHead>
                        <TableHead>End Time</TableHead>
                        <TableHead>Purpose</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {usageHistory.map((usage: any) => (
                        <TableRow key={usage.id}>
                          <TableCell className="font-medium text-foreground">
                            {usage.user?.first_name} {usage.user?.last_name}
                          </TableCell>
                          <TableCell>
                            {usage.experiment ? (
                              <Link
                                href={`/experiments/${usage.experiment.id}`}
                                className="text-primary hover:underline"
                              >
                                {usage.experiment.name}
                              </Link>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatDateTime(usage.start_time)}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatDateTime(usage.end_time)}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {usage.purpose || "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No usage records available
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="maintenance" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-foreground">Maintenance Records</CardTitle>
                <CardDescription>Equipment maintenance and calibration history</CardDescription>
              </CardHeader>
              <CardContent>
                {maintenanceRecords && maintenanceRecords.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Performed By</TableHead>
                        <TableHead>Next Due</TableHead>
                        <TableHead className="text-right">Cost</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {maintenanceRecords.map((record: any) => (
                        <TableRow key={record.id}>
                          <TableCell className="font-medium text-foreground">
                            {formatDate(record.maintenance_date)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{record.maintenance_type}</Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {record.description}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {record.performed_by_user
                              ? `${record.performed_by_user.first_name} ${record.performed_by_user.last_name}`
                              : "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatDate(record.next_maintenance_date)}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {record.cost ? `$${parseFloat(record.cost).toFixed(2)}` : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No maintenance records available
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    )
}
