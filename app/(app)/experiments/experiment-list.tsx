"use client"

import { useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { FlaskConical, Calendar, User, Eye, Grid3x3, List } from 'lucide-react'
import { HtmlContentTruncated } from '@/components/html-content'

// Format date consistently to avoid hydration mismatch between server/client locales
const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr)
  // Use ISO format parts for consistency: YYYY-MM-DD
  return date.toISOString().split('T')[0]
}

interface Experiment {
  id: string
  name: string
  description: string | null
  status: string
  start_date: string | null
  completion_date: string | null
  created_at: string
  project: {
    name: string
  } | null
  assigned_to: {
    first_name: string
    last_name: string
  } | null
}

interface ExperimentListProps {
  experiments: Experiment[]
}

export function ExperimentList({ experiments }: ExperimentListProps) {
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid")

  // Helper function to get shorter status text for better display
  const getStatusDisplay = (status: string) => {
    const statusMap: Record<string, string> = {
      'in_progress': 'In Progress',
      'completed': 'Completed',
      'planning': 'Planning',
      'planned': 'Planned',
      'data_ready': 'Data Ready',
      'on_hold': 'On Hold',
      'cancelled': 'Cancelled'
    }
    return statusMap[status] || status.replace('_', ' ')
  }

  if (!experiments || experiments.length === 0) {
    return null
  }

  return (
    <>
      {/* View Toggle */}
      <div className="flex justify-end mb-4">
        <div className="inline-flex rounded-lg border p-1">
          <Button
            variant={viewMode === "grid" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setViewMode("grid")}
            className="gap-2"
          >
            <Grid3x3 className="h-4 w-4" />
            Grid
          </Button>
          <Button
            variant={viewMode === "table" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setViewMode("table")}
            className="gap-2"
          >
            <List className="h-4 w-4" />
            Table
          </Button>
        </div>
      </div>

      {/* Grid View - Use auto-fill with fixed card sizes to prevent expansion */}
      {viewMode === "grid" && (
        <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(280px,1fr))]">
          {experiments.map((experiment) => (
            <Card key={experiment.id} className="hover:border-primary transition-colors flex flex-col min-w-0 overflow-hidden">
              <CardHeader className="pb-3 min-w-0">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <FlaskConical className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1 overflow-hidden">
                    <CardTitle className="text-base text-foreground leading-tight min-w-0 overflow-hidden text-ellipsis" style={{
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      wordBreak: 'break-all',
                      overflowWrap: 'break-word'
                    }}>
                      {experiment.name}
                    </CardTitle>
                    {experiment.project && (
                      <CardDescription className="text-xs min-w-0 overflow-hidden text-ellipsis" style={{
                        wordBreak: 'break-all',
                        overflowWrap: 'break-word'
                      }}>
                        {experiment.project.name}
                      </CardDescription>
                    )}
                  </div>
                </div>
                {/* Status badge moved to separate row for better spacing */}
                <div className="flex items-center justify-between pt-2 gap-2 min-w-0">
                  <Badge
                    variant={
                      experiment.status === "in_progress"
                        ? "default"
                        : experiment.status === "completed"
                          ? "secondary"
                          : "outline"
                    }
                    className="text-xs font-medium whitespace-nowrap shrink-0 max-w-full overflow-hidden text-ellipsis"
                  >
                    {getStatusDisplay(experiment.status)}
                  </Badge>
                  {experiment.start_date && (
                    <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0 overflow-hidden text-ellipsis max-w-20">
                      {new Date(experiment.start_date).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3 flex-1 flex flex-col pt-0 min-w-0">
                <div className="space-y-2 flex-1 min-w-0">
                  {experiment.assigned_to && (
                    <div className="flex items-center gap-1 text-sm text-muted-foreground min-w-0 overflow-hidden">
                      <User className="h-3 w-3 shrink-0" />
                      <span className="truncate text-ellipsis overflow-hidden">
                        {experiment.assigned_to.first_name} {experiment.assigned_to.last_name}
                      </span>
                    </div>
                  )}
                  <HtmlContentTruncated
                    content={experiment.description}
                    className="text-sm text-muted-foreground min-w-0 overflow-hidden text-ellipsis"
                    style={{
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      wordBreak: 'break-all',
                      overflowWrap: 'break-word'
                    } as React.CSSProperties}
                  />
                </div>
                <Button variant="outline" size="sm" className="w-full mt-auto shrink-0" asChild>
                  <Link href={`/experiments/${experiment.id}`}>
                    <Eye className="h-4 w-4 mr-2" />
                    <span className="truncate">View Details</span>
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Table View */}
      {viewMode === "table" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-foreground">All Experiments</CardTitle>
            <CardDescription>Complete list of experimental procedures</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative w-full overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[250px]">Experiment</TableHead>
                    <TableHead className="min-w-[180px]">Project</TableHead>
                    <TableHead className="min-w-[100px]">Status</TableHead>
                    <TableHead className="min-w-[150px]">Assigned To</TableHead>
                    <TableHead className="min-w-[120px]">Start Date</TableHead>
                    <TableHead className="min-w-[120px]">Completion</TableHead>
                    <TableHead className="text-right min-w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {experiments.map((experiment) => (
                    <TableRow key={experiment.id}>
                      <TableCell className="font-medium text-foreground">
                        <div className="flex items-center gap-2">
                          <FlaskConical className="h-4 w-4 text-primary shrink-0" />
                          <div className="max-w-[280px]">
                            <div className="font-semibold truncate">{experiment.name}</div>
                            <HtmlContentTruncated
                              content={experiment.description}
                              className="text-sm text-muted-foreground truncate"
                            />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {experiment.project ? experiment.project.name : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            experiment.status === "in_progress"
                              ? "default"
                              : experiment.status === "completed"
                                ? "secondary"
                                : "outline"
                          }
                          className="whitespace-nowrap"
                        >
                          {getStatusDisplay(experiment.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {experiment.assigned_to
                          ? `${experiment.assigned_to.first_name} ${experiment.assigned_to.last_name}`
                          : "Unassigned"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {experiment.start_date
                          ? formatDate(experiment.start_date)
                          : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {experiment.completion_date
                          ? formatDate(experiment.completion_date)
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/experiments/${experiment.id}`}>
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  )
}
