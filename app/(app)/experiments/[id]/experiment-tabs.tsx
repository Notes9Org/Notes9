'use client'

import { useId, useState, useEffect } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus } from 'lucide-react'
import { HtmlContent } from '@/components/html-content'
import { LabNotesTab } from './lab-notes-tab'
import { DataFilesTab } from './data-files-tab'
import { LinkProtocolDialog } from './link-protocol-dialog'
import { ProtocolCard } from './protocol-card'
import Link from 'next/link'

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
    protocols: any[]
    samples: any[]
  }
  initialTab: string
}

export function ExperimentTabs({ experiment, initialTab }: ExperimentTabsProps) {
  const [mounted, setMounted] = useState(false)
  const baseId = useId()

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <div className="min-h-[400px]" /> // Fallback with similar height to avoid jump
  }

  return (
    <Tabs id={`experiment-tabs-${baseId}`} defaultValue={initialTab} className="flex flex-col gap-3 min-h-0 flex-1">
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
            <CardContent className="py-8">
              <p className="text-center text-sm text-muted-foreground">
                No protocols linked yet. Link a protocol to get started.
              </p>
            </CardContent>
          </Card>
        )}
      </TabsContent>

      <TabsContent value="samples" id="tab-content-samples" className="space-y-4">
        {experiment.samples && experiment.samples.length > 0 ? (
          <div className="space-y-2">
            {experiment.samples.map((sample: any) => (
              <Card key={sample.id}>
                <CardHeader>
                  <CardTitle className="text-sm">{sample.name}</CardTitle>
                </CardHeader>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-8">
              <p className="text-center text-sm text-muted-foreground">
                No samples yet
              </p>
            </CardContent>
          </Card>
        )}
      </TabsContent>

      <TabsContent value="data" id="tab-content-data" className="flex flex-col gap-3 min-h-0 flex-1">
        <DataFilesTab experimentId={experiment.id} />
      </TabsContent>

      <TabsContent value="notes" id="tab-content-notes" className="flex flex-col gap-3 min-h-0 flex-1">
        <LabNotesTab experimentId={experiment.id} experimentName={experiment.name} projectName={experiment.project} projectId={experiment.projectId} />
      </TabsContent>
    </Tabs>
  )
}
