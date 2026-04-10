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
import { ArrowLeft, CheckCircle } from 'lucide-react'
import Link from 'next/link'
import { ProtocolActions } from './protocol-actions'
import { ProtocolEditor } from './protocol-editor'
import { resolveInitialProjectIdParam } from "@/lib/url-project-param"
import { SetPageBreadcrumb } from "@/components/layout/breadcrumb-context"

export default async function ProtocolDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ project?: string; design?: string }>
}) {
  const { id } = await params
  const resolvedSearch = searchParams ? await searchParams : {}
  const defaultDesignMode = resolvedSearch.design === "1"
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect("/auth/login")
  }

  const { data: profileForProject } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single()
  const { data: orgProjectsForParam = [] } = profileForProject?.organization_id
    ? await supabase.from("projects").select("id").eq("organization_id", profileForProject.organization_id)
    : { data: [] as { id: string }[] }
  const allowedProjectIdsForParam = (orgProjectsForParam ?? []).map((p) => p.id)
  const projectFromUrl = resolveInitialProjectIdParam(
    resolvedSearch.project,
    allowedProjectIdsForParam
  )
  const protocolsBackHref = projectFromUrl
    ? `/protocols?project=${projectFromUrl}`
    : "/protocols"

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

  // Enrich with project/experiment context (requires migration 030).
  if (protocol) {
    try {
      const { data: ctx } = await supabase
        .from("protocols")
        .select("id, project:projects(id, name), experiment:experiments(id, name)")
        .eq("id", id)
        .single()
      if (ctx) {
        (protocol as any).project = (ctx as any).project ?? null
        ;(protocol as any).experiment = (ctx as any).experiment ?? null
      }
    } catch {
      (protocol as any).project = null
      ;(protocol as any).experiment = null
    }
  }

  if (error || !protocol) {
    notFound()
  }

  let projectContextBanner: { id: string; name: string } | null = null
  if (projectFromUrl) {
    const { data: bannerProj } = await supabase
      .from("projects")
      .select("id, name")
      .eq("id", projectFromUrl)
      .single()
    if (bannerProj) projectContextBanner = bannerProj
  }

  const protocolBreadcrumbSegments =
    projectContextBanner && projectFromUrl
      ? [
          {
            label: projectContextBanner.name,
            href: `/projects/${projectContextBanner.id}`,
          },
          { label: "Protocols", href: protocolsBackHref },
          { label: protocol.name },
        ]
      : [
          { label: "Protocols", href: "/protocols" },
          { label: protocol.name },
        ]

  // ─── Design mode: full-height layout without tabs/cards ──────────────────
  if (defaultDesignMode) {
    return (
      <div className="flex flex-col min-h-0 h-full -m-3 sm:-m-4 md:-m-6 overflow-hidden">
        <SetPageBreadcrumb segments={protocolBreadcrumbSegments} />
        {/* Minimal header */}
        <div className="flex items-center gap-2 px-3 sm:px-4 py-2 border-b shrink-0 bg-background/90 backdrop-blur-sm">
          <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" asChild>
            <Link href={protocolsBackHref} aria-label="Back to protocols">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
            <h1 className="font-semibold text-foreground truncate">{protocol.name}</h1>
            <Badge variant="outline" className="shrink-0">v{protocol.version}</Badge>
            {protocol.is_active ? (
              <Badge variant="default" className="gap-1 shrink-0">
                <CheckCircle className="h-3 w-3" />
                Active
              </Badge>
            ) : (
              <Badge variant="outline" className="shrink-0">Inactive</Badge>
            )}
          </div>
          <div className="shrink-0">
            <ProtocolActions protocol={protocol} />
          </div>
        </div>
        {/* Full-height editor area */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <ProtocolEditor protocol={protocol} defaultDesignMode={true} />
        </div>
      </div>
    )
  }

  // ─── Standard layout ──────────────────────────────────────────────────────
  return (
      <div className="space-y-4 md:space-y-6">
        <SetPageBreadcrumb segments={protocolBreadcrumbSegments} />
        {/* Header: stacked on mobile, row on desktop */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <Button variant="ghost" size="icon" asChild className="shrink-0">
              <Link href={protocolsBackHref} aria-label="Back to protocols">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div className="min-w-0 space-y-1">
              {projectContextBanner ? (
                <p className="text-xs text-muted-foreground">
                  <span className="text-foreground/80">Project:</span>{" "}
                  <Link
                    href={`/projects/${projectContextBanner.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {projectContextBanner.name}
                  </Link>
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
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
              <p className="text-sm text-muted-foreground">
                {protocol.category || "General Protocol"}
              </p>
            </div>
          </div>
          <ProtocolActions protocol={protocol} />
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="content" className="space-y-4">
          <TabsList>
            <TabsTrigger value="content">Protocol Content</TabsTrigger>
            <TabsTrigger value="usage">Usage</TabsTrigger>
            <TabsTrigger value="info">Details</TabsTrigger>
          </TabsList>

          <TabsContent value="content" className="space-y-4">
            <ProtocolEditor protocol={protocol} defaultDesignMode={false} />
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
                              <Link
                                href={
                                  ep.experiment.project?.id
                                    ? `/experiments/${ep.experiment.id}?project=${ep.experiment.project.id}`
                                    : `/experiments/${ep.experiment.id}`
                                }
                              >
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
