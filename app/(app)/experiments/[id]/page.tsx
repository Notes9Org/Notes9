import { redirect } from 'next/navigation'
import { createClient } from "@/lib/supabase/server"
import { AppLayout } from "@/components/layout/app-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { FlaskConical, Calendar, User, FileText } from 'lucide-react'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { LabNotesTab } from './lab-notes-tab'
import { DataFilesTab } from './data-files-tab'
import { ExperimentActions } from './experiment-actions'
import { StatusUpdateButtons } from './status-update-buttons'

export default async function ExperimentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect("/auth/login")
  }

  // Fetch experiment data
  const { data: experimentData, error: experimentError } = await supabase
    .from("experiments")
    .select(`
      *,
      project:projects(id, name),
      assigned_to_user:profiles!experiments_assigned_to_fkey(id, first_name, last_name),
      created_by_user:profiles!experiments_created_by_fkey(id, first_name, last_name)
    `)
    .eq("id", id)
    .single()

  if (experimentError || !experimentData) {
    notFound()
  }

  // Fetch all projects for dropdown
  const { data: projects } = await supabase
    .from("projects")
    .select("id, name")
    .order("name")

  // Fetch all users for assignment dropdown
  const { data: users } = await supabase
    .from("profiles")
    .select("id, first_name, last_name")
    .order("first_name")

  // Use real data with fallback to dummy data for display
  const experiment = {
    id: experimentData.id,
    name: experimentData.name,
    status: experimentData.status,
    description: experimentData.description,
    hypothesis: experimentData.hypothesis,
    project: experimentData.project?.name || "Unknown Project",
    projectId: experimentData.project_id,
    startDate: experimentData.start_date,
    completionDate: experimentData.completion_date,
    researcher: experimentData.assigned_to_user 
      ? `${experimentData.assigned_to_user.first_name} ${experimentData.assigned_to_user.last_name}` 
      : "Unassigned",
    protocol: "Standard Protocol", // TODO: Link to actual protocol
    progress: 65, // TODO: Calculate from actual data
    assays: [
      { name: "Cell Viability Assay", status: "completed", results: "95% viability" },
      { name: "IC50 Determination", status: "in_progress", results: "Pending" },
      { name: "Western Blot Analysis", status: "planned", results: "Not started" },
    ],
    samples: [
      { id: "S001", name: "Compound A-47", quantity: "250μg", location: "Freezer B-12" },
      { id: "S002", name: "Compound B-23", quantity: "180μg", location: "Freezer B-12" },
      { id: "S003", name: "Control Sample", quantity: "500μg", location: "Freezer A-05" },
    ],
    equipment: [
      { name: "LC-MS/MS System", status: "reserved", duration: "4 hours" },
      { name: "Plate Reader", status: "available", duration: "2 hours" },
    ],
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Breadcrumb */}
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/dashboard">Dashboard</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/projects">Projects</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href={`/projects/${experiment.projectId}`}>{experiment.project}</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/experiments">Experiments</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{experiment.name}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold tracking-tight text-foreground">
                {experiment.name}
              </h1>
              <Badge variant={
                experiment.status === "in_progress" ? "default" :
                experiment.status === "completed" ? "secondary" :
                "outline"
              }>
                {experiment.status.replace("_", " ")}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              Part of <Link href={`/projects/${experiment.projectId}`} className="text-primary hover:underline">{experiment.project}</Link>
            </p>
          </div>
          <div className="flex gap-2">
            <ExperimentActions 
              experiment={{
                id: experimentData.id,
                name: experimentData.name,
                description: experimentData.description,
                hypothesis: experimentData.hypothesis,
                status: experimentData.status,
                start_date: experimentData.start_date,
                completion_date: experimentData.completion_date,
                project_id: experimentData.project_id,
                assigned_to: experimentData.assigned_to,
              }}
              projects={projects || []}
              users={users || []}
            />
            <StatusUpdateButtons experimentId={experimentData.id} currentStatus={experimentData.status} />
          </div>
        </div>

        {/* Overview Cards - Compact Status */}
        <div className="grid gap-3 md:grid-cols-4">
          <Card className="py-2">
            <CardHeader className="pb-1 pt-2 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Researcher
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-2">
              <div className="flex items-center gap-2">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">{experiment.researcher}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="py-2">
            <CardHeader className="pb-1 pt-2 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Start Date
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-2">
              <div className="flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">{experiment.startDate}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="py-2">
            <CardHeader className="pb-1 pt-2 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Protocol
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-2">
              <div className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground truncate">{experiment.protocol}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="py-2">
            <CardHeader className="pb-1 pt-2 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Progress
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-2">
              <div className="flex items-center gap-2">
                <FlaskConical className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">{experiment.progress}%</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="protocol">Protocol & Assays</TabsTrigger>
            <TabsTrigger value="samples">Samples</TabsTrigger>
            <TabsTrigger value="data">Data & Files</TabsTrigger>
            <TabsTrigger value="notes">Lab Notes</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-foreground">Experiment Description</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-foreground">{experiment.description}</p>
              </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-foreground">Equipment Reserved</CardTitle>
                  <CardDescription>Laboratory equipment for this experiment</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {experiment.equipment.map((eq, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground">{eq.name}</p>
                        <p className="text-xs text-muted-foreground">{eq.duration}</p>
                      </div>
                      <Badge variant={eq.status === "reserved" ? "secondary" : "outline"}>
                        {eq.status}
                      </Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-foreground">Timeline</CardTitle>
                  <CardDescription>Experiment schedule</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Start Date</p>
                    <p className="text-sm text-foreground">{experiment.startDate}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Expected End</p>
                    <p className="text-sm text-foreground">{experiment.completionDate || "Not set"}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Duration</p>
                    <p className="text-sm text-foreground">15 days</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="protocol" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-foreground">Protocol Details</CardTitle>
                <CardDescription>{experiment.protocol}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" size="sm">
                  <FileText className="h-4 w-4 mr-2" />
                  View Full Protocol
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-foreground">Assays</CardTitle>
                <CardDescription>Planned and completed assays</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {experiment.assays.map((assay, i) => (
                  <div key={i} className="flex items-center justify-between p-3 border border-border rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-foreground">{assay.name}</p>
                      <p className="text-xs text-muted-foreground">Results: {assay.results}</p>
                    </div>
                    <Badge variant={
                      assay.status === "completed" ? "secondary" :
                      assay.status === "in_progress" ? "default" :
                      "outline"
                    }>
                      {assay.status.replace("_", " ")}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="samples" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-foreground">Sample Inventory</CardTitle>
                <CardDescription>Samples used in this experiment</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {experiment.samples.map((sample) => (
                    <div key={sample.id} className="flex items-center justify-between p-3 border border-border rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-foreground">{sample.name}</p>
                        <p className="text-xs text-muted-foreground">ID: {sample.id} | Location: {sample.location}</p>
                      </div>
                      <span className="text-sm font-medium text-foreground">{sample.quantity}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="data" className="space-y-4">
            <DataFilesTab experimentId={id} />
          </TabsContent>

          <TabsContent value="notes" className="space-y-4">
            <LabNotesTab experimentId={id} />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  )
}
