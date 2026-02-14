import { redirect } from 'next/navigation'
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { SetPageBreadcrumb } from "@/components/layout/breadcrumb-context"
import { FlaskConical, Calendar, User, FileText, ChevronDown, Plus } from 'lucide-react'
import { cn } from "@/lib/utils"
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ExperimentActions } from './experiment-actions'
import { ExperimentTabs } from './experiment-tabs'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LabNotesTab } from './lab-notes-tab'
import { HtmlContent } from '@/components/html-content'
import { DataFilesTab } from './data-files-tab'
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
  const initialTab = resolvedSearch.tab ?? "notes"
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
    <div className="flex flex-col gap-6 min-h-0 flex-1">
      <SetPageBreadcrumb
        segments={[
          { label: experiment.project, href: `/projects/${experiment.projectId}` },
          { label: experiment.name },
        ]}
      />
      {/* Header */}
      <div className="flex items-start justify-between shrink-0">
        <div className="space-y-1">
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            {experiment.name}
          </h1>
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





      <Tabs id="experiment-tabs" defaultValue={initialTab} className="flex flex-col gap-3 min-h-0 flex-1">
        <TabsList className="flex flex-wrap gap-1 bg-muted/10 p-1 rounded-md">
          <TabsTrigger
            value="overview"
            id="tab-trigger-overview"
            className="px-2.5 py-1.25 rounded-md text-[12px] font-medium text-muted-foreground data-[state=active]:bg-foreground data-[state=active]:text-background transition-colors"
          >
            Overview
          </TabsTrigger>
          <TabsTrigger
            value="protocol"
            id="tab-trigger-protocol"
            className="px-2.5 py-1.25 rounded-md text-[12px] font-medium text-muted-foreground data-[state=active]:bg-foreground data-[state=active]:text-background transition-colors"
          >
            Protocol & Assays
          </TabsTrigger>
          <TabsTrigger
            value="samples"
            id="tab-trigger-samples"
            className="px-2.5 py-1.25 rounded-md text-[12px] font-medium text-muted-foreground data-[state=active]:bg-foreground data-[state=active]:text-background transition-colors"
          >
            Samples
          </TabsTrigger>
          <TabsTrigger
            value="data"
            id="tab-trigger-data"
            className="px-2.5 py-1.25 rounded-md text-[12px] font-medium text-muted-foreground data-[state=active]:bg-foreground data-[state=active]:text-background transition-colors"
          >
            Data & Files
          </TabsTrigger>
          <TabsTrigger
            value="notes"
            id="tab-trigger-notes"
            className="px-2.5 py-1.25 rounded-md text-[12px] font-medium text-muted-foreground data-[state=active]:bg-foreground data-[state=active]:text-background transition-colors"
          >
            Lab Notes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" id="tab-content-overview" className="space-y-4">
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

        <TabsContent value="protocol" id="tab-content-protocol" className="space-y-4">
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

        <TabsContent value="samples" id="tab-content-samples" className="space-y-4">
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

        <TabsContent value="data" id="tab-content-data" className="space-y-4">
          <DataFilesTab experimentId={id} />
        </TabsContent>

        <TabsContent value="notes" id="tab-content-notes" className="flex flex-1 flex-col min-h-[60vh] mt-2 data-[state=active]:flex">
          <LabNotesTab experimentId={id} experimentName={experiment.name} projectName={experiment.project} projectId={experiment.projectId} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
