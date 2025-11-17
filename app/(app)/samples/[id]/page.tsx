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
import { ArrowLeft, TestTube, Calendar, MapPin, Thermometer, Package } from 'lucide-react'
import Link from 'next/link'
import { SampleActions } from './sample-actions'

export default async function SampleDetailPage({
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

  // Fetch sample details with relations
  const { data: sample, error } = await supabase
    .from("samples")
    .select(`
      *,
      experiment:experiments(
        id,
        name,
        project:projects(id, name)
      ),
      created_by_profile:profiles!samples_created_by_fkey(
        first_name,
        last_name,
        email
      )
    `)
    .eq("id", id)
    .single()

  if (error || !sample) {
    notFound()
  }

  const getStatusColor = (status: string) => {
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

  const formatDate = (date: string | null) => {
    if (!date) return "—"
    return new Date(date).toLocaleDateString()
  }

  return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/samples">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-3xl font-bold tracking-tight text-foreground">
                  {sample.sample_code}
                </h1>
                <Badge variant={getStatusColor(sample.status)}>
                  {sample.status}
                </Badge>
              </div>
              <p className="text-muted-foreground">
                {sample.sample_type}
                {sample.experiment && (
                  <>
                    {" · "}
                    <Link
                      href={`/experiments/${sample.experiment.id}`}
                      className="hover:text-primary hover:underline"
                    >
                      {sample.experiment.name}
                    </Link>
                  </>
                )}
              </p>
            </div>
          </div>
          <SampleActions sample={sample} />
        </div>

        {/* Quick Info Cards */}
        <div className="grid gap-3 md:grid-cols-4">
          <Card className="py-2">
            <CardHeader className="pb-1 pt-2 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Storage Location
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-2">
              <div className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">
                  {sample.storage_location || "Not specified"}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="py-2">
            <CardHeader className="pb-1 pt-2 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Storage Condition
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-2">
              <div className="flex items-center gap-2">
                <Thermometer className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">
                  {sample.storage_condition || "Not specified"}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="py-2">
            <CardHeader className="pb-1 pt-2 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Quantity
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-2">
              <div className="flex items-center gap-2">
                <Package className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">
                  {sample.quantity ? `${sample.quantity} ${sample.quantity_unit}` : "Not specified"}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="py-2">
            <CardHeader className="pb-1 pt-2 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Collection Date
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-2">
              <div className="flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">
                  {formatDate(sample.collection_date)}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="qc">Quality Control</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-foreground">Sample Information</CardTitle>
                <CardDescription>Detailed information about this sample</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {sample.description && (
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Description</h3>
                    <p className="text-sm text-foreground">{sample.description}</p>
                  </div>
                )}

                <Separator />

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Sample Code</h3>
                    <p className="text-sm text-foreground font-mono">{sample.sample_code}</p>
                  </div>

                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Sample Type</h3>
                    <Badge variant="outline">{sample.sample_type}</Badge>
                  </div>

                  {sample.source && (
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground mb-1">Source</h3>
                      <p className="text-sm text-foreground">{sample.source}</p>
                    </div>
                  )}

                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Status</h3>
                    <Badge variant={getStatusColor(sample.status)}>{sample.status}</Badge>
                  </div>
                </div>

                <Separator />

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Created By</h3>
                    <p className="text-sm text-foreground">
                      {sample.created_by_profile?.first_name} {sample.created_by_profile?.last_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {sample.created_by_profile?.email}
                    </p>
                  </div>

                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Created At</h3>
                    <p className="text-sm text-foreground">
                      {new Date(sample.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>

                {sample.experiment && (
                  <>
                    <Separator />
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground mb-2">
                        Associated Experiment
                      </h3>
                      <Link href={`/experiments/${sample.experiment.id}`}>
                        <Card className="hover:border-primary transition-colors cursor-pointer">
                          <CardContent className="pt-4">
                            <p className="font-medium text-foreground">{sample.experiment.name}</p>
                            {sample.experiment.project && (
                              <p className="text-xs text-muted-foreground">
                                Project: {sample.experiment.project.name}
                              </p>
                            )}
                          </CardContent>
                        </Card>
                      </Link>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-foreground">Transfer History</CardTitle>
                <CardDescription>Sample location and status changes</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>From</TableHead>
                      <TableHead>To</TableHead>
                      <TableHead>By</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        No transfer history available
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="qc" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-foreground">Quality Control Records</CardTitle>
                <CardDescription>QC checks and validation results</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>QC Type</TableHead>
                      <TableHead>Result</TableHead>
                      <TableHead>Measured Value</TableHead>
                      <TableHead>Expected Value</TableHead>
                      <TableHead>Performed By</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No QC records available
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    )
}

