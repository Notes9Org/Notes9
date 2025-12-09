import { redirect } from 'next/navigation'
import { createClient } from "@/lib/supabase/server"
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
import { FlaskConical, Calendar, User, FileText, ChevronDown } from 'lucide-react'
import { cn } from "@/lib/utils"
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { LabNotesTab } from './lab-notes-tab'
import { DataFilesTab } from './data-files-tab'
import { ExperimentActions } from './experiment-actions'
import { StatusUpdateButtons } from './status-update-buttons'

type SearchParams = { tab?: string; noteId?: string }

export default async function ExperimentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<SearchParams>
}) {
  const { id } = await params
  const resolvedSearch = searchParams ? await searchParams : {}
  const initialTab = resolvedSearch.tab || (resolvedSearch.noteId ? "notes" : "overview")
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

        {/* Slim pills with toggleable details (matched to tab styling) */}
        <div className="grid gap-2 md:grid-cols-4">
          <details className="group rounded-md border border-border bg-muted/10">
            <summary className="flex items-center justify-between px-3 py-2 cursor-pointer text-[12px] font-medium text-muted-foreground hover:bg-muted/20 rounded-md">
              <span className="flex items-center gap-2">
                <User className="h-3 w-3 text-muted-foreground" />
                Researcher
              </span>
              <ChevronDown className="h-3 w-3 text-muted-foreground transition-transform duration-150 group-open:rotate-180" />
            </summary>
            <div className="px-3 pb-2 pt-1 text-[13px] text-foreground truncate">
              {experiment.researcher}
              </div>
          </details>

          <details className="group rounded-md border border-border bg-muted/10">
            <summary className="flex items-center justify-between px-3 py-2 cursor-pointer text-[12px] font-medium text-muted-foreground hover:bg-muted/20 rounded-md">
              <span className="flex items-center gap-2">
                <Calendar className="h-3 w-3 text-muted-foreground" />
                Start Date
              </span>
              <ChevronDown className="h-3 w-3 text-muted-foreground transition-transform duration-150 group-open:rotate-180" />
            </summary>
            <div className="px-3 pb-2 pt-1 text-[13px] text-foreground truncate">
              {experiment.startDate || "Not set"}
              </div>
          </details>

          <details className="group rounded-md border border-border bg-muted/10">
            <summary className="flex items-center justify-between px-3 py-2 cursor-pointer text-[12px] font-medium text-muted-foreground hover:bg-muted/20 rounded-md">
              <span className="flex items-center gap-2">
                <FileText className="h-3 w-3 text-muted-foreground" />
                Protocol
              </span>
              <ChevronDown className="h-3 w-3 text-muted-foreground transition-transform duration-150 group-open:rotate-180" />
            </summary>
            <div className="px-3 pb-2 pt-1 text-[13px] text-foreground truncate">
              {experiment.protocol}
              </div>
          </details>

          <details className="group rounded-md border border-border bg-muted/10">
            <summary className="flex items-center justify-between px-3 py-2 cursor-pointer text-[12px] font-medium text-muted-foreground hover:bg-muted/20 rounded-md">
              <span className="flex items-center gap-2">
                <FlaskConical className="h-3 w-3 text-muted-foreground" />
                Progress
              </span>
              <ChevronDown className="h-3 w-3 text-muted-foreground transition-transform duration-150 group-open:rotate-180" />
            </summary>
            <div className="px-3 pb-2 pt-1 text-[13px] text-foreground">
              {experiment.progress}%
              </div>
          </details>
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue={initialTab} className="space-y-3">
          <TabsList className="flex flex-wrap gap-1 bg-muted/10 p-1 rounded-md">
            <TabsTrigger
              value="overview"
              className="px-2.5 py-1.25 rounded-md text-[12px] font-medium text-muted-foreground data-[state=active]:bg-foreground data-[state=active]:text-background transition-colors"
            >
              Overview
            </TabsTrigger>
            <TabsTrigger
              value="protocol"
              className="px-2.5 py-1.25 rounded-md text-[12px] font-medium text-muted-foreground data-[state=active]:bg-foreground data-[state=active]:text-background transition-colors"
            >
              Protocol & Assays
            </TabsTrigger>
            <TabsTrigger
              value="samples"
              className="px-2.5 py-1.25 rounded-md text-[12px] font-medium text-muted-foreground data-[state=active]:bg-foreground data-[state=active]:text-background transition-colors"
            >
              Samples
            </TabsTrigger>
            <TabsTrigger
              value="data"
              className="px-2.5 py-1.25 rounded-md text-[12px] font-medium text-muted-foreground data-[state=active]:bg-foreground data-[state=active]:text-background transition-colors"
            >
              Data & Files
            </TabsTrigger>
            <TabsTrigger
              value="notes"
              className="px-2.5 py-1.25 rounded-md text-[12px] font-medium text-muted-foreground data-[state=active]:bg-foreground data-[state=active]:text-background transition-colors"
            >
              Lab Notes
            </TabsTrigger>
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
    )
}
