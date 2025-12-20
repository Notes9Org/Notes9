"use client"

import { useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { FlaskConical, Calendar, User, Eye, Grid3x3, List } from 'lucide-react'

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

      {/* Grid View */}
      {viewMode === "grid" && (
        <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {experiments.map((experiment) => (
            <Card key={experiment.id} className="hover:border-primary transition-colors flex flex-col">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <FlaskConical className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-base text-foreground line-clamp-2">
                        {experiment.name}
                      </CardTitle>
                      {experiment.project && (
                        <CardDescription className="truncate text-xs">
                          {experiment.project.name}
                        </CardDescription>
                      )}
                    </div>
                  </div>
                  <Badge
                    variant={
                      experiment.status === "in_progress"
                        ? "default"
                        : experiment.status === "completed"
                          ? "secondary"
                          : "outline"
                    }
                    className="shrink-0"
                  >
                    {(experiment.status || "unknown").replace("_", " ")}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 flex-1 flex flex-col">
                <div className="space-y-2 flex-1">
                  {experiment.assigned_to && (
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <User className="h-3 w-3" />
                      <span className="truncate">
                        {experiment.assigned_to.first_name} {experiment.assigned_to.last_name}
                      </span>
                    </div>
                  )}
                  {experiment.start_date && (
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      <span>Started: {new Date(experiment.start_date).toLocaleDateString()}</span>
                    </div>
                  )}
                  {experiment.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {experiment.description}
                    </p>
                  )}
                </div>
                <Button variant="outline" size="sm" className="w-full mt-auto" asChild>
                  <Link href={`/experiments/${experiment.id}`}>
                    <Eye className="h-4 w-4 mr-2" />
                    View Details
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
                            {experiment.description && (
                              <div className="text-sm text-muted-foreground truncate">
                                {experiment.description}
                              </div>
                            )}
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
                        >
                          {(experiment.status || "unknown").replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {experiment.assigned_to
                          ? `${experiment.assigned_to.first_name} ${experiment.assigned_to.last_name}`
                          : "Unassigned"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {experiment.start_date
                          ? new Date(experiment.start_date).toLocaleDateString()
                          : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {experiment.completion_date
                          ? new Date(experiment.completion_date).toLocaleDateString()
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

