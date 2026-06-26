import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { createClient } from "@/lib/supabase/server"
import { requireUser } from "@/lib/auth/current-user"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { PageHeading } from "@/components/ui/page-heading"
import { SetPageBreadcrumb } from "@/components/layout/breadcrumb-context"
import { ArrowLeft, Calendar, Dna, FlaskConical, Link2, MapPin, Package, ShieldAlert, Thermometer } from 'lucide-react'
import Link from 'next/link'
import { SampleActions } from './sample-actions'
import { SampleMolecularFilesTab, type SampleMolecularFile } from './sample-molecular-files-tab'
import { SampleTabs } from './sample-tabs'
import { SampleHistoryTab, type SampleTransfer } from './sample-history-tab'
import { SampleQcTab, type SampleQcRecord } from './sample-qc-tab'

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
        <CardTitle className="flex items-center gap-2 text-base text-foreground">
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
              className="block min-w-0 rounded-md border bg-muted/20 px-3 py-2 transition-colors hover:border-primary hover:bg-muted/40"
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

type SearchParams = { tab?: string }

export default async function SampleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<SearchParams>
}) {
  const { id } = await params
  const resolvedSearch = searchParams ? await searchParams : {}
  const initialTab = resolvedSearch.tab ?? "overview"
  const user = await requireUser()
  const supabase = await createClient()
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
    // Junction tables (sample_projects, sample_experiments, sample_lab_notes) may not
    // exist on older DB instances — retry without them. Preserve sample_files(*) so the
    // Molecular Files tab always gets its initial data.
    const fallback = await supabase
      .from("samples")
      .select(`
        *,
        sample_files(*),
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
    if (!fallback.error) {
      sample = fallback.data
      error = null
    } else {
      // sample_files table also missing — bare minimum query
      const bare = await supabase
        .from("samples")
        .select(`
          *,
          experiment:experiments(id, name, project:projects(id, name)),
          created_by_profile:profiles!samples_created_by_fkey(first_name, last_name, email)
        `)
        .eq("id", id)
        .single()
      sample = bare.data
      error = bare.error
    }
  }

  if (error || !sample) {
    notFound()
  }

  // Fetch transfers + QC records (tables may not exist yet on older databases).
  let transfers: SampleTransfer[] = []
  let qcRecords: SampleQcRecord[] = []
  try {
    const { data: transferRows } = await supabase
      .from("sample_transfers")
      .select(`
        *,
        performer:profiles!sample_transfers_performed_by_fkey(id, first_name, last_name)
      `)
      .eq("sample_id", id)
      .order("transferred_at", { ascending: false })
    transfers = (transferRows ?? []) as SampleTransfer[]
  } catch {
    transfers = []
  }
  try {
    const { data: qcRows } = await supabase
      .from("sample_qc_records")
      .select(`
        *,
        performer:profiles!sample_qc_records_performed_by_fkey(id, first_name, last_name)
      `)
      .eq("sample_id", id)
      .order("performed_at", { ascending: false })
    qcRecords = (qcRows ?? []) as SampleQcRecord[]
  } catch {
    qcRecords = []
  }

  // Edit-dialog context-picker options (all projects/experiments/lab notes) are
  // now loaded lazily inside EditSampleDialog when the dialog opens, instead of
  // on every detail page render — this was the bulk of the page's render latency.

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

  // Build deduped projects (id-keyed) so we can navigate to /projects/{id} reliably.
  const projectsMap = new Map<string, { id: string; name: string }>()
  for (const project of linkedProjects) {
    if (project?.id) projectsMap.set(project.id, { id: project.id, name: project.name })
  }
  for (const experiment of linkedExperiments) {
    const project = experiment?.project
    if (project?.id) projectsMap.set(project.id, { id: project.id, name: project.name })
  }
  if (sample.experiment?.project?.id) {
    projectsMap.set(sample.experiment.project.id, {
      id: sample.experiment.project.id,
      name: sample.experiment.project.name,
    })
  }
  const linkedProjectsList = Array.from(projectsMap.values())

  const sampleFiles = ((sample.sample_files ?? []) as SampleMolecularFile[]).sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  const breadcrumbProject = sample.experiment?.project ?? linkedProjectsList[0] ?? null
  const breadcrumbExperiment = sample.experiment ?? null

  // Route "back" to the experiment the sample belongs to (when known) instead of
  // always returning to the full samples list, so users land where they came from.
  const backHref = breadcrumbExperiment?.id
    ? `/experiments/${breadcrumbExperiment.id}`
    : "/samples"

  const breadcrumbSegments = [
    { label: "Samples", href: "/samples" },
    ...(breadcrumbProject
      ? [{ label: breadcrumbProject.name, href: `/projects/${breadcrumbProject.id}` }]
      : []),
    ...(breadcrumbExperiment
      ? [{ label: breadcrumbExperiment.name, href: `/experiments/${breadcrumbExperiment.id}` }]
      : []),
    { label: sample.sample_code },
  ]

  return (
    <div className="space-y-4 md:space-y-6">
      <SetPageBreadcrumb segments={breadcrumbSegments} />

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <Button variant="ghost" size="icon" asChild className="shrink-0">
            <Link href={backHref}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <PageHeading>
                {sample.sample_code}
              </PageHeading>
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
        <SampleActions
          sample={sample}
          linkedProjectIds={linkedProjectsList.map((p) => p.id).filter(Boolean) as string[]}
          linkedExperimentIds={linkedExperiments.map((e: any) => e.id).filter(Boolean) as string[]}
          linkedLabNoteIds={linkedNotes.map((n: any) => n.id).filter(Boolean) as string[]}
        />
      </div>

      {/* Quick info cards */}
      <div data-tour="sample-quickinfo" className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-4">
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

      <SampleTabs
        initialTab={initialTab}
        overview={
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
                      {(linkedExperiments.length > 0 ? linkedExperiments : [sample.experiment]).map(
                        (experiment: any) => (
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
                        )
                      )}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        }
        molecular={<SampleMolecularFilesTab sampleId={sample.id} initialFiles={sampleFiles} />}
        links={
          <div className="grid gap-4 lg:grid-cols-3">
            <LinkGroup
              title="Projects"
              icon={<Link2 className="h-4 w-4" />}
              rows={linkedProjectsList.map((project) => ({
                id: project.id,
                label: project.name,
                href: `/projects/${project.id}`,
              }))}
              empty="No linked projects"
            />
            <LinkGroup
              title="Experiments"
              icon={<FlaskConical className="h-4 w-4" />}
              rows={(linkedExperiments.length > 0
                ? linkedExperiments
                : sample.experiment
                ? [sample.experiment]
                : []
              ).map((experiment: any) => ({
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
                href: note.experiment_id
                  ? `/experiments/${note.experiment_id}?tab=notes&noteId=${note.id}`
                  : `/lab-notes/${note.id}`,
              }))}
              empty="No linked lab notes"
            />
          </div>
        }
        storage={
          <Card>
            <CardHeader>
              <CardTitle className="text-foreground">Storage & Inventory</CardTitle>
              <CardDescription>
                Physical location, quantity, concentration, and safety context
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Info label="Storage Location" value={sample.storage_location || "Not specified"} />
              <Info label="Storage Condition" value={sample.storage_condition || "Not specified"} />
              <Info label="Container Type" value={sample.container_type || "Not specified"} />
              <Info label="Box Position" value={sample.box_position || "Not specified"} />
              <Info
                label="Quantity"
                value={
                  sample.quantity ? `${sample.quantity} ${sample.quantity_unit || ""}` : "Not specified"
                }
              />
              <Info
                label="Concentration"
                value={
                  sample.concentration
                    ? `${sample.concentration} ${sample.concentration_unit || ""}`
                    : "Not specified"
                }
              />
              <Info label="Collection Date" value={formatDate(sample.collection_date)} />
              <Info label="Expiry Date" value={formatDate(sample.expiry_date)} />
              <Info
                label="Safety"
                value={
                  [sample.hazard_class, sample.biosafety_level].filter(Boolean).join(" · ") ||
                  "Not specified"
                }
                icon={<ShieldAlert className="h-4 w-4 text-muted-foreground" />}
              />
            </CardContent>
          </Card>
        }
        history={
          <SampleHistoryTab
            sampleId={sample.id}
            initialTransfers={transfers}
            currentLocation={sample.storage_location ?? null}
          />
        }
        qc={<SampleQcTab sampleId={sample.id} initialRecords={qcRecords} />}
      />
    </div>
  )
}
