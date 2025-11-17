import { redirect } from 'next/navigation'
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { TestTube, Plus, Search, Package } from 'lucide-react'
import Link from 'next/link'

export default async function SamplesPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect("/auth/login")
  }

  // Fetch samples
  const { data: samples } = await supabase
    .from("samples")
    .select(`
      *,
      experiment:experiments(name, project:projects(name))
    `)
    .order("created_at", { ascending: false })
    .limit(100)

  const statusCount = {
    available: samples?.filter((s) => s.status === "available").length || 0,
    in_use: samples?.filter((s) => s.status === "in_use").length || 0,
    depleted: samples?.filter((s) => s.status === "depleted").length || 0,
    disposed: samples?.filter((s) => s.status === "disposed").length || 0,
  }

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "available":
        return "default"
      case "in_use":
        return "secondary"
      case "depleted":
        return "outline"
      case "disposed":
        return "outline"
      default:
        return "outline"
    }
  }

  return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Sample Inventory</h1>
            <p className="text-muted-foreground mt-1">
              Track and manage laboratory samples
            </p>
          </div>
          <Button asChild>
            <Link href="/samples/new">
              <Plus className="h-4 w-4 mr-2" />
              Add Sample
            </Link>
          </Button>
        </div>

        {/* Status Overview */}
        <div className="grid gap-4 md:grid-cols-4">
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
                Depleted
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-warning">{statusCount.depleted}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Disposed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-muted-foreground">{statusCount.disposed}</div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search samples by code or type..." className="pl-9 text-foreground" />
        </div>

        {/* Samples Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-foreground">All Samples</CardTitle>
            <CardDescription>
              Recently added and updated samples
            </CardDescription>
          </CardHeader>
          <CardContent>
            {samples && samples.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[120px]">Sample Code</TableHead>
                    <TableHead className="w-[100px]">Type</TableHead>
                    <TableHead className="w-[200px]">Experiment</TableHead>
                    <TableHead className="w-[100px]">Quantity</TableHead>
                    <TableHead className="w-[150px]">Location</TableHead>
                    <TableHead className="w-[120px]">Condition</TableHead>
                    <TableHead className="w-[100px]">Status</TableHead>
                    <TableHead className="w-[80px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {samples.map((sample: any) => (
                    <TableRow key={sample.id}>
                      <TableCell className="font-medium text-foreground">
                        {sample.sample_code}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{sample.sample_type}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {sample.experiment ? (
                          <Link
                            href={`/experiments/${sample.experiment_id}`}
                            className="hover:text-primary hover:underline"
                          >
                            {sample.experiment.name}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-foreground">
                        {sample.quantity ? (
                          <>
                            {sample.quantity} {sample.quantity_unit}
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-foreground">
                        {sample.storage_location || (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {sample.storage_condition || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusVariant(sample.status)}>
                          {sample.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/samples/${sample.id}`}>View</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="flex flex-col items-center justify-center py-12">
                <Package className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-4">No samples recorded</p>
                <Button asChild>
                  <Link href="/samples/new">
                    <Plus className="h-4 w-4 mr-2" />
                    Add First Sample
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
}
