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
import { ArrowLeft, FileText, Calendar, Package, CheckCircle } from 'lucide-react'
import Link from 'next/link'
import { ProtocolActions } from './protocol-actions'

export default async function ProtocolDetailPage({
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

  // Fetch protocol details with usage count
  const { data: protocol, error } = await supabase
    .from("protocols")
    .select(`
      *,
      created_by_profile:profiles!protocols_created_by_fkey(
        first_name,
        last_name,
        email
      ),
      experiment_protocols(
        experiment:experiments(
          id,
          name,
          status,
          project:projects(id, name)
        )
      )
    `)
    .eq("id", id)
    .single()

  if (error || !protocol) {
    notFound()
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
              <Link href="/protocols">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-3xl font-bold tracking-tight text-foreground">
                  {protocol.name}
                </h1>
                <Badge variant="outline">v{protocol.version}</Badge>
                {protocol.is_active ? (
                  <Badge variant="default" className="gap-1">
                    <CheckCircle className="h-3 w-3" />
                    Active
                  </Badge>
                ) : (
                  <Badge variant="outline">Inactive</Badge>
                )}
              </div>
              <p className="text-muted-foreground">
                {protocol.category || "General Protocol"}
              </p>
            </div>
          </div>
          <ProtocolActions protocol={protocol} />
        </div>

        {/* Quick Info Cards */}
        <div className="grid gap-3 md:grid-cols-4">
          <Card className="py-2">
            <CardHeader className="pb-1 pt-2 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Version
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-2">
              <div className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">
                  {protocol.version}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="py-2">
            <CardHeader className="pb-1 pt-2 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Category
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-2">
              <div className="flex items-center gap-2">
                <Package className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">
                  {protocol.category || "Not specified"}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="py-2">
            <CardHeader className="pb-1 pt-2 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Last Updated
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-2">
              <div className="flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">
                  {formatDate(protocol.updated_at)}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="py-2">
            <CardHeader className="pb-1 pt-2 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Used In
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-2">
              <div className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">
                  {protocol.experiment_protocols?.length || 0} experiments
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="content" className="space-y-4">
          <TabsList>
            <TabsTrigger value="content">Protocol Content</TabsTrigger>
            <TabsTrigger value="usage">Usage</TabsTrigger>
            <TabsTrigger value="info">Details</TabsTrigger>
          </TabsList>

          <TabsContent value="content" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-foreground">Standard Operating Procedure</CardTitle>
                <CardDescription>
                  {protocol.description || "No description provided"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div 
                  className="prose prose-invert max-w-none text-foreground"
                  dangerouslySetInnerHTML={{ __html: protocol.content }}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="usage" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-foreground">Experiments Using This Protocol</CardTitle>
                <CardDescription>
                  Experiments that reference this SOP
                </CardDescription>
              </CardHeader>
              <CardContent>
                {protocol.experiment_protocols && protocol.experiment_protocols.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Experiment Name</TableHead>
                        <TableHead>Project</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {protocol.experiment_protocols.map((ep: any) => (
                        <TableRow key={ep.experiment.id}>
                          <TableCell className="font-medium text-foreground">
                            {ep.experiment.name}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {ep.experiment.project?.name || "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{ep.experiment.status}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" asChild>
                              <Link href={`/experiments/${ep.experiment.id}`}>
                                View
                              </Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No experiments are currently using this protocol
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="info" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-foreground">Protocol Information</CardTitle>
                <CardDescription>Metadata and version details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Protocol Name</h3>
                    <p className="text-sm text-foreground">{protocol.name}</p>
                  </div>

                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Version</h3>
                    <Badge variant="outline">{protocol.version}</Badge>
                  </div>

                  {protocol.category && (
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground mb-1">Category</h3>
                      <Badge variant="secondary">{protocol.category}</Badge>
                    </div>
                  )}

                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Status</h3>
                    <Badge variant={protocol.is_active ? "default" : "outline"}>
                      {protocol.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </div>

                <Separator />

                {protocol.description && (
                  <>
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground mb-1">Description</h3>
                      <p className="text-sm text-foreground">{protocol.description}</p>
                    </div>
                    <Separator />
                  </>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Created By</h3>
                    <p className="text-sm text-foreground">
                      {protocol.created_by_profile?.first_name} {protocol.created_by_profile?.last_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {protocol.created_by_profile?.email}
                    </p>
                  </div>

                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Created At</h3>
                    <p className="text-sm text-foreground">
                      {new Date(protocol.created_at).toLocaleString()}
                    </p>
                  </div>

                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Last Updated</h3>
                    <p className="text-sm text-foreground">
                      {new Date(protocol.updated_at).toLocaleString()}
                    </p>
                  </div>

                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Usage Count</h3>
                    <p className="text-sm text-foreground">
                      {protocol.experiment_protocols?.length || 0} experiments
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    )
}

