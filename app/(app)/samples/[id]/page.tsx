import { redirect, notFound } from 'next/navigation'
import type { ReactNode } from 'react'
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
import { ArrowLeft, Calendar, Dna, FlaskConical, Link2, MapPin, Package, ShieldAlert, Thermometer } from 'lucide-react'
import Link from 'next/link'
import { SampleActions } from './sample-actions'
import { SampleMolecularFilesTab, type SampleMolecularFile } from './sample-molecular-files-tab'

function Info({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-md border bg-muted/20 p-3">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</h3>
      <div className="mt-1 flex min-w-0 items-center gap-2">
        {icon}
        <p className="min-w-0 break-words text-sm text-foreground">{value || "Not specified"}</p>
      </div>
    </div>
  )
}

function LinkGroup({
  title,
  icon,
  rows,
  empty,
}: {
  title: string
  icon: ReactNode
  rows: { id: string; label: string; detail?: string | null; href: string }[]
  empty: string
}) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length > 0 ? (
          rows.map((row) => (
            <Link
              key={row.id}
              href={row.href}
              className="block min-w-0 rounded-md border px-3 py-2 transition-colors hover:border-primary hover:bg-muted/40"
            >
              <span className="block truncate text-sm font-medium text-foreground">{row.label}</span>
              {row.detail ? <span className="block truncate text-xs text-muted-foreground">{row.detail}</span> : null}
            </Link>
          ))
        ) : (
          <p className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
            {empty}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

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
  let { data: sample, error } = await supabase
    .from("samples")
    .select(`
      *,
      sample_files(*),
      sample_projects(
        project:projects(id, name)
      ),
      sample_experiments(
        experiment:experiments(
          id,
          name,
          project_id,
          project:projects(id, name)
        )
      ),
      sample_lab_notes(
        lab_note:lab_notes(id, title, experiment_id)
      ),
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

  if (error) {
    const fallback = await supabase
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
    sample = fallback.data
    error = fallback.error
  }

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

  const linkedExperiments = sample.sample_experiments?.map((link: any) => link.experiment).filter(Boolean) ?? []
  const linkedProjects = sample.sample_projects?.map((link: any) => link.project).filter(Boolean) ?? []
  const linkedNotes = sample.sample_lab_notes?.map((link: any) => link.lab_note).filter(Boolean) ?? []
  const projectNames = Array.from(
    new Set([
      ...linkedProjects.map((project: any) => project.name),
      ...linkedExperiments.map((experiment: any) => experiment.project?.name).filter(Boolean),
      sample.experiment?.project?.name,
    ].filter(Boolean))
  )
  const sampleFiles = ((sample.sample_files ?? []) as SampleMolecularFile[]).sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  return (
      <div className="space-y-4 md:space-y-6">
        {/* Header: stacked on mobile, row on desktop */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <Button variant="ghost" size="icon" asChild className="shrink-0">
              <Link href="/samples">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
                  {sample.sample_code}
                </h1>
                <Badge variant={getStatusColor(sample.status)}>
                  {sample.status}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
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
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-4">
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
          <TabsList className="flex h-auto flex-wrap justify-start">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="molecular">Molecular Files</TabsTrigger>
            <TabsTrigger value="links">Links</TabsTrigger>
            <TabsTrigger value="storage">Storage</TabsTrigger>
            <TabsTrigger value="history">History/QC</TabsTrigger>
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

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                  {sample.barcode && <Info label="Barcode" value={sample.barcode} />}
                  {sample.external_id && <Info label="External ID" value={sample.external_id} />}
                  {sample.organism && <Info label="Organism" value={sample.organism} />}
                  {sample.strain && <Info label="Strain" value={sample.strain} />}
                  {sample.genotype && <Info label="Genotype" value={sample.genotype} />}
                  {sample.supplier && <Info label="Supplier" value={sample.supplier} />}
                  {sample.catalog_number && <Info label="Catalog Number" value={sample.catalog_number} />}
                  {sample.lot_number && <Info label="Lot Number" value={sample.lot_number} />}
                  {sample.purity && <Info label="Purity" value={sample.purity} />}
                  {sample.hazard_class && <Info label="Hazard Class" value={sample.hazard_class} />}
                  {sample.biosafety_level && <Info label="Biosafety Level" value={sample.biosafety_level} />}
                </div>

                <Separator />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

                {(linkedExperiments.length > 0 || sample.experiment) && (
                  <>
                    <Separator />
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground mb-2">
                        Associated Experiments
                      </h3>
                      <div className="grid gap-3 md:grid-cols-2">
                        {(linkedExperiments.length > 0 ? linkedExperiments : [sample.experiment]).map((experiment: any) => (
                          <Link key={experiment.id} href={`/experiments/${experiment.id}`}>
                            <Card className="hover:border-primary transition-colors cursor-pointer">
                              <CardContent className="pt-4">
                                <p className="font-medium text-foreground">{experiment.name}</p>
                                {experiment.project && (
                                  <p className="text-xs text-muted-foreground">
                                    Project: {experiment.project.name}
                                  </p>
                                )}
                              </CardContent>
                            </Card>
                          </Link>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="molecular" className="space-y-4">
            <SampleMolecularFilesTab sampleId={sample.id} initialFiles={sampleFiles} />
          </TabsContent>

          <TabsContent value="links" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-3">
              <LinkGroup
                title="Projects"
                icon={<Link2 className="h-4 w-4" />}
                rows={projectNames.map((name) => ({ id: name, label: name, href: "/projects" }))}
                empty="No linked projects"
              />
              <LinkGroup
                title="Experiments"
                icon={<FlaskConical className="h-4 w-4" />}
                rows={(linkedExperiments.length > 0 ? linkedExperiments : sample.experiment ? [sample.experiment] : []).map((experiment: any) => ({
                  id: experiment.id,
                  label: experiment.name,
                  detail: experiment.project?.name,
                  href: `/experiments/${experiment.id}`,
                }))}
                empty="No linked experiments"
              />
              <LinkGroup
                title="Lab Notes"
                icon={<Dna className="h-4 w-4" />}
                rows={linkedNotes.map((note: any) => ({
                  id: note.id,
                  label: note.title,
                  href: note.experiment_id ? `/experiments/${note.experiment_id}?tab=notes&noteId=${note.id}` : `/lab-notes/${note.id}`,
                }))}
                empty="No linked lab notes"
              />
            </div>
          </TabsContent>

          <TabsContent value="storage" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-foreground">Storage & Inventory</CardTitle>
                <CardDescription>Physical location, quantity, concentration, and safety context</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Info label="Storage Location" value={sample.storage_location || "Not specified"} />
                <Info label="Storage Condition" value={sample.storage_condition || "Not specified"} />
                <Info label="Container Type" value={sample.container_type || "Not specified"} />
                <Info label="Box Position" value={sample.box_position || "Not specified"} />
                <Info label="Quantity" value={sample.quantity ? `${sample.quantity} ${sample.quantity_unit || ""}` : "Not specified"} />
                <Info label="Concentration" value={sample.concentration ? `${sample.concentration} ${sample.concentration_unit || ""}` : "Not specified"} />
                <Info label="Collection Date" value={formatDate(sample.collection_date)} />
                <Info label="Expiry Date" value={formatDate(sample.expiry_date)} />
                <Info label="Safety" value={[sample.hazard_class, sample.biosafety_level].filter(Boolean).join(" · ") || "Not specified"} icon={<ShieldAlert className="h-4 w-4 text-muted-foreground" />} />
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
