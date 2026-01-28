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
import { FlaskConical, Calendar, User, FileText, ChevronDown, Plus } from 'lucide-react'
import { cn } from "@/lib/utils"
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { LabNotesTab } from './lab-notes-tab'
import { DataFilesTab } from './data-files-tab'
import { ExperimentActions } from './experiment-actions'
import { HtmlContent } from '@/components/html-content'
import { LinkProtocolDialog } from './link-protocol-dialog'
import { ProtocolCard } from './protocol-card'

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

  // Fetch experiment data with linked protocols
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

  // Fetch linked protocols for this experiment
  const { data: linkedProtocols } = await supabase
    .from("experiment_protocols")
    .select(`
      id,
      added_at,
      protocol:protocols(
        id,
        name,
        description,
        version,
        created_at
      )
    `)
    .eq("experiment_id", id)
    .order("added_at", { ascending: false })

  // Fetch samples linked to this experiment
  const { data: experimentSamples } = await supabase
    .from("samples")
    .select("*")
    .eq("experiment_id", id)
    .order("created_at", { ascending: false })

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
    progress: experimentData.progress || 0,
    protocols: linkedProtocols || [],
    samples: experimentSamples || [],
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
              <HtmlContent content={experiment.description} />
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-foreground">Equipment Reserved</CardTitle>
                <CardDescription>Laboratory equipment for this experiment</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground mb-4">No equipment reservations yet</p>
                  <Button variant="outline" size="sm" disabled>
                    <Plus className="h-4 w-4 mr-2" />
                    Reserve Equipment
                  </Button>
                </div>
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
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Linked Protocols</h3>
              <p className="text-sm text-muted-foreground">
                Protocols provide detailed procedures and methods for this experiment
              </p>
            </div>
            <LinkProtocolDialog
              experimentId={experiment.id}
              linkedProtocolIds={experiment.protocols.map((p: any) => p.protocol.id)}
            />
          </div>

          {experiment.protocols && experiment.protocols.length > 0 ? (
            <div className="space-y-4">
              {experiment.protocols.map((protocolLink: any) => (
                <ProtocolCard key={protocolLink.id} protocolLink={protocolLink} />
              ))}
            </div>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-foreground">No Protocols Linked</CardTitle>
                <CardDescription>
                  Link existing protocols to this experiment to provide detailed procedures and methods.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <LinkProtocolDialog
                  experimentId={experiment.id}
                  linkedProtocolIds={[]}
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="samples" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-foreground">Sample Inventory</CardTitle>
              <CardDescription>Samples used in this experiment</CardDescription>
            </CardHeader>
            <CardContent>
              {experiment.samples && experiment.samples.length > 0 ? (
                <div className="space-y-3">
                  {experiment.samples.map((sample: any) => (
                    <div key={sample.id} className="flex items-center justify-between p-3 border border-border rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-foreground">{sample.sample_type}</p>
                        <p className="text-xs text-muted-foreground">
                          ID: {sample.id.slice(0, 8)} | Location: {sample.storage_location || "Not specified"}
                        </p>
                        {sample.description && (
                          <p className="text-xs text-muted-foreground mt-1">{sample.description}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-medium text-foreground">
                          {sample.quantity || "N/A"} {sample.unit || ""}
                        </span>
                        <p className="text-xs text-muted-foreground">
                          {new Date(sample.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground mb-4">No samples linked to this experiment</p>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/samples/new?experiment=${experiment.id}`}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Sample
                    </Link>
                  </Button>
                </div>
              )}
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
