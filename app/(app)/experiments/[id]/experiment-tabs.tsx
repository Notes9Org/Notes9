'use client'

import { useId, useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus } from 'lucide-react'
import { HtmlContent } from '@/components/html-content'
import { LabNotesTab } from './lab-notes-tab'
import { DataFilesTab } from './data-files-tab'
import { LinkProtocolDialog } from './link-protocol-dialog'
import { ProtocolCard } from './protocol-card'
import { ExperimentStepsTab } from './experiment-steps-tab'
import Link from 'next/link'

interface ProtocolRef {
  id: string
  name: string
  description?: string | null
  version?: string | null
  [key: string]: unknown
}

interface ProtocolLink {
  id: string
  added_at?: string | null
  protocol: ProtocolRef | ProtocolRef[]
}

interface ExperimentSample {
  id: string
  sample_code?: string | null
  name?: string | null
  sample_type?: string | null
  status?: string | null
  storage_location?: string | null
  created_at?: string | null
  [key: string]: unknown
}

function normalizeProtocol(p: ProtocolRef | ProtocolRef[]): ProtocolRef {
  return Array.isArray(p) ? p[0] : p
}

interface ExperimentTabsProps {
  experiment: {
    id: string
    name: string
    description: string
    hypothesis: string
    startDate: string
    completionDate: string | null
    project: string
    projectId: string
    protocols: ProtocolLink[]
    samples: ExperimentSample[]
  }
  initialTab: string
  /** Breadcrumb link for the experiment segment (e.g. includes `?project=` when scoped). */
  experimentPageHref?: string
}

function formatDuration(startDate: string | null | undefined, endDate: string | null | undefined): string {
  if (!startDate) return "Not set"
  const start = new Date(startDate)
  if (Number.isNaN(start.getTime())) return "Not set"
  const end = endDate ? new Date(endDate) : new Date()
  if (Number.isNaN(end.getTime())) return "Not set"
  const days = Math.max(0, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)))
  return `${days} day${days === 1 ? "" : "s"}`
}

export function ExperimentTabs({ experiment, initialTab, experimentPageHref }: ExperimentTabsProps) {
  const [tab, setTab] = useState(initialTab)
  const baseId = useId()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    setTab(initialTab)
  }, [initialTab])

  const handleTabChange = useCallback((next: string) => {
    setTab(next)
    const params = new URLSearchParams(searchParams?.toString() ?? '')
    params.set('tab', next)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }, [router, pathname, searchParams])

  return (
    <Tabs
      id={`experiment-tabs-${baseId}`}
      value={tab}
      onValueChange={handleTabChange}
      className="flex min-h-0 flex-1 flex-col gap-4"
    >
      <TabsList>
        <TabsTrigger
          value="overview"
          id="tab-trigger-overview"
        >
          Overview
        </TabsTrigger>
        <TabsTrigger
          value="steps"
          id="tab-trigger-steps"
        >
          Steps
        </TabsTrigger>
        <TabsTrigger
          value="protocol"
          id="tab-trigger-protocol"
        >
          Protocol & Assays
        </TabsTrigger>
        <TabsTrigger
          value="samples"
          id="tab-trigger-samples"
        >
          Samples
        </TabsTrigger>
        <TabsTrigger
          value="data"
          id="tab-trigger-data"
        >
          Data & Files
        </TabsTrigger>
        <TabsTrigger
          value="notes"
          id="tab-trigger-notes"
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

        <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle className="text-foreground">Equipment Reserved</CardTitle>
                <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                  Coming soon
                </span>
              </div>
              <CardDescription>Laboratory equipment for this experiment</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground">
                  Reserve instruments and track equipment usage per experiment. We&apos;re building this next.
                </p>
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
                <p className="text-sm text-foreground">{formatDuration(experiment.startDate, experiment.completionDate)}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="steps" id="tab-content-steps" className="space-y-4">
        <ExperimentStepsTab experimentId={experiment.id} />
      </TabsContent>

      <TabsContent value="protocol" id="tab-content-protocol" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-semibold md:text-lg">Linked Protocols</h3>
            <p className="text-sm text-muted-foreground">
              Protocols provide detailed procedures and methods for this experiment
            </p>
          </div>
          <div className="w-full sm:w-auto">
            <LinkProtocolDialog
              experimentId={experiment.id}
              linkedProtocolIds={experiment.protocols.map((p) => normalizeProtocol(p.protocol).id)}
            />
          </div>
        </div>

        {experiment.protocols && experiment.protocols.length > 0 ? (
          <div className="space-y-4">
            {experiment.protocols.map((protocolLink) => (
              <ProtocolCard key={protocolLink.id} protocolLink={protocolLink} />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-8">
              <p className="text-center text-sm text-muted-foreground">
                No protocols linked yet. Link a protocol to get started.
              </p>
            </CardContent>
          </Card>
        )}
      </TabsContent>

      <TabsContent value="samples" id="tab-content-samples" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Samples linked to this experiment ({experiment.samples?.length ?? 0})
          </p>
          <Button asChild size="sm" variant="outline" className="w-full sm:w-auto shrink-0">
            <Link href={`/samples/new?experiment=${experiment.id}`}>
              <Plus className="mr-2 h-4 w-4" />
              New sample for this experiment
            </Link>
          </Button>
        </div>
        {experiment.samples && experiment.samples.length > 0 ? (
          <div className="space-y-2">
            {experiment.samples.map((sample) => (
              <Card key={sample.id}>
                <CardHeader className="py-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <CardTitle className="text-base font-semibold">
                        {sample.sample_code ?? sample.name ?? "Sample"}
                      </CardTitle>
                      <CardDescription className="text-xs sm:text-sm">
                        {sample.sample_type}
                        {sample.status ? ` · ${sample.status.replace(/_/g, " ")}` : ""}
                        {sample.storage_location ? ` · ${sample.storage_location}` : ""}
                      </CardDescription>
                    </div>
                    <Button asChild variant="secondary" size="sm" className="shrink-0">
                      <Link href={`/samples/${sample.id}`}>View</Link>
                    </Button>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-8">
              <p className="text-center text-sm text-muted-foreground">
                No samples linked yet. Create one with the button above, or choose this experiment when adding a sample from the Samples page.
              </p>
            </CardContent>
          </Card>
        )}
      </TabsContent>

      <TabsContent value="data" id="tab-content-data" className="flex flex-col gap-3 min-h-0 flex-1">
        <DataFilesTab experimentId={experiment.id} />
      </TabsContent>

      <TabsContent
        value="notes"
        id="tab-content-notes"
        className="mt-0 flex min-h-0 flex-1 flex-col gap-3 overflow-hidden focus-visible:outline-none"
      >
        <LabNotesTab
          experimentId={experiment.id}
          experimentName={experiment.name}
          projectName={experiment.project}
          projectId={experiment.projectId}
          experimentPageHref={experimentPageHref}
        />
      </TabsContent>
    </Tabs>
  )
}
