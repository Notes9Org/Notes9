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
import { ProtocolTableRow } from './protocol-table-row'
import { ExperimentStepsTab } from './experiment-steps-tab'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Checkbox } from "@/components/ui/checkbox"
import { useToast } from "@/hooks/use-toast"
import { createClient } from "@/lib/supabase/client"
import { Loader2, Trash2 } from "lucide-react"
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
  const router = useRouter()
  const { toast } = useToast()
  
  // States for bulk selection
  const [selectedProtocolIds, setSelectedProtocolIds] = useState<string[]>([])
  const [isUnlinkingProtocolsBulk, setIsUnlinkingProtocolsBulk] = useState(false)
  
  const [selectedSampleIds, setSelectedSampleIds] = useState<string[]>([])
  const [isUnlinkingSamplesBulk, setIsUnlinkingSamplesBulk] = useState(false)

  // Bulk actions for protocols
  const handleBulkUnlinkProtocols = async () => {
    if (selectedProtocolIds.length === 0) return
    setIsUnlinkingProtocolsBulk(true)
    
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from("experiment_protocols")
        .delete()
        .in("id", selectedProtocolIds)
      
      if (error) throw error

      toast({
        title: "Success",
        description: "Protocols unlinked successfully",
      })

      setSelectedProtocolIds([])
      router.refresh()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to unlink protocols",
        variant: "destructive",
      })
    } finally {
      setIsUnlinkingProtocolsBulk(false)
    }
  }

  const toggleSelectAllProtocols = (checked: boolean) => {
    if (checked) {
      setSelectedProtocolIds(experiment.protocols.map(p => p.id))
    } else {
      setSelectedProtocolIds([])
    }
  }

  const toggleSelectProtocol = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedProtocolIds(prev => [...prev, id])
    } else {
      setSelectedProtocolIds(prev => prev.filter(i => i !== id))
    }
  }

  // Bulk actions for samples
  const handleBulkRemoveSamples = async () => {
    if (selectedSampleIds.length === 0) return
    setIsUnlinkingSamplesBulk(true)
    
    try {
      const supabase = createClient()
      
      // Delete from experiment_samples join table
      const { error: joinError } = await supabase
        .from("experiment_samples")
        .delete()
        .eq("experiment_id", experiment.id)
        .in("sample_id", selectedSampleIds)
        
      if (joinError) throw joinError

      // Also set experiment_id = null for legacy samples
      const { error: legacyError } = await supabase
        .from("samples")
        .update({ experiment_id: null })
        .eq("experiment_id", experiment.id)
        .in("id", selectedSampleIds)

      if (legacyError) throw legacyError

      toast({
        title: "Success",
        description: "Samples removed from experiment successfully",
      })

      setSelectedSampleIds([])
      router.refresh()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to remove samples",
        variant: "destructive",
      })
    } finally {
      setIsUnlinkingSamplesBulk(false)
    }
  }

  const toggleSelectAllSamples = (checked: boolean) => {
    if (checked) {
      setSelectedSampleIds(experiment.samples.map(s => s.id))
    } else {
      setSelectedSampleIds([])
    }
  }

  const toggleSelectSample = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedSampleIds(prev => [...prev, id])
    } else {
      setSelectedSampleIds(prev => prev.filter(i => i !== id))
    }
  }

  const [tab, setTab] = useState(initialTab)
  const baseId = useId()
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
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            {selectedProtocolIds.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBulkUnlinkProtocols}
                disabled={isUnlinkingProtocolsBulk}
                className="bg-rose-50 text-rose-600 border border-rose-100 font-semibold hover:bg-rose-100 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-900/10 dark:hover:bg-rose-900/30 w-full sm:w-auto"
              >
                {isUnlinkingProtocolsBulk ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                Unlink Selected ({selectedProtocolIds.length})
              </Button>
            )}
            <LinkProtocolDialog
              experimentId={experiment.id}
              linkedProtocolIds={experiment.protocols.map((p) => normalizeProtocol(p.protocol).id)}
            />
          </div>
        </div>

        {experiment.protocols && experiment.protocols.length > 0 ? (
          <div className="rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[48px]">
                    <Checkbox 
                      checked={experiment.protocols.length > 0 && selectedProtocolIds.length === experiment.protocols.length ? true : selectedProtocolIds.length > 0 ? "indeterminate" : false}
                      onCheckedChange={toggleSelectAllProtocols}
                      aria-label="Select all protocols"
                    />
                  </TableHead>
                  <TableHead>Protocol Name</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Added Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {experiment.protocols.map((protocolLink) => (
                  <ProtocolTableRow 
                    key={protocolLink.id} 
                    protocolLink={protocolLink}
                    selected={selectedProtocolIds.includes(protocolLink.id)}
                    onSelect={(checked) => toggleSelectProtocol(protocolLink.id, checked)}
                  />
                ))}
              </TableBody>
            </Table>
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
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center shrink-0">
            {selectedSampleIds.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBulkRemoveSamples}
                disabled={isUnlinkingSamplesBulk}
                className="bg-rose-50 text-rose-600 border border-rose-100 font-semibold hover:bg-rose-100 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-900/10 dark:hover:bg-rose-900/30 w-full sm:w-auto"
              >
                {isUnlinkingSamplesBulk ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                Remove Selected ({selectedSampleIds.length})
              </Button>
            )}
            <Button asChild size="sm" variant="outline" className="w-full sm:w-auto">
              <Link href={`/samples/new?experiment=${experiment.id}`}>
                <Plus className="mr-2 h-4 w-4" />
                New sample for this experiment
              </Link>
            </Button>
          </div>
        </div>
        {experiment.samples && experiment.samples.length > 0 ? (
          <div className="rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[48px]">
                    <Checkbox 
                      checked={experiment.samples.length > 0 && selectedSampleIds.length === experiment.samples.length ? true : selectedSampleIds.length > 0 ? "indeterminate" : false}
                      onCheckedChange={toggleSelectAllSamples}
                      aria-label="Select all samples"
                    />
                  </TableHead>
                  <TableHead>Sample Name / Code</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {experiment.samples.map((sample) => (
                  <TableRow key={sample.id}>
                    <TableCell>
                      <Checkbox 
                        checked={selectedSampleIds.includes(sample.id)}
                        onCheckedChange={(checked) => toggleSelectSample(sample.id, checked === true)}
                        aria-label={`Select sample ${sample.sample_code ?? sample.name}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      {sample.sample_code ?? sample.name ?? "Sample"}
                    </TableCell>
                    <TableCell>{sample.sample_type}</TableCell>
                    <TableCell>
                      {sample.status ? sample.status.replace(/_/g, " ") : "—"}
                    </TableCell>
                    <TableCell>
                      {sample.storage_location || "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/samples/${sample.id}`}>View</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
          experiment={experiment}
        />
      </TabsContent>
    </Tabs>
  )
}
