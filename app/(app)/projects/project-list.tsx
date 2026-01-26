"use client"

import { useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Users, Calendar, TrendingUp, Eye, Grid3x3, List } from 'lucide-react'

// Format date consistently to avoid hydration mismatch between server/client locales
const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr)
  // Use ISO format parts for consistency: YYYY-MM-DD
  return date.toISOString().split('T')[0]
}

interface Project {
  id: string
  name: string
  description: string | null
  status: string
  priority: string | null
  start_date: string | null
  end_date: string | null
  created_at: string
  project_members: any[]
  experiments: any[]
  created_by: {
    first_name: string
    last_name: string
  } | null
}

interface ProjectListProps {
  projects: Project[]
}

export function ProjectList({ projects }: ProjectListProps) {
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid")

  // Helper function to get better status display
  const getStatusDisplay = (status: string) => {
    const statusMap: Record<string, string> = {
      'active': 'Active',
      'completed': 'Completed',
      'planning': 'Planning',
      'on_hold': 'On Hold',
      'cancelled': 'Cancelled',
      'archived': 'Archived'
    }
    return statusMap[status] || status.replace('_', ' ')
  }

  // Helper function for priority display
  const getPriorityDisplay = (priority: string) => {
    const priorityMap: Record<string, string> = {
      'critical': 'Critical',
      'high': 'High',
      'medium': 'Medium',
      'low': 'Low'
    }
    return priorityMap[priority] || priority
  }

  if (!projects || projects.length === 0) {
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
          {projects.map((project) => (
            <Card key={project.id} className="hover:border-primary transition-colors flex flex-col min-w-0 overflow-hidden">
              <CardHeader className="pb-3 min-w-0">
                <div className="space-y-2 min-w-0">
                  <CardTitle className="text-lg text-foreground leading-tight min-w-0 overflow-hidden text-ellipsis" style={{
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    wordBreak: 'break-all',
                    overflowWrap: 'break-word'
                  }}>
                    {project.name}
                  </CardTitle>
                  {project.description && (
                    <CardDescription className="text-sm min-w-0 overflow-hidden text-ellipsis" style={{
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      wordBreak: 'break-all',
                      overflowWrap: 'break-word'
                    }}>
                      {project.description}
                    </CardDescription>
                  )}
                </div>
                {/* Status and priority badges in separate row */}
                <div className="flex items-center justify-between pt-2 gap-2 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap min-w-0 overflow-hidden">
                    <Badge
                      variant={
                        project.status === "active"
                          ? "default"
                          : project.status === "completed"
                            ? "secondary"
                            : "outline"
                      }
                      className="text-xs font-medium whitespace-nowrap shrink-0 max-w-full overflow-hidden text-ellipsis"
                    >
                      {getStatusDisplay(project.status)}
                    </Badge>
                    {project.priority && (
                      <Badge
                        variant={
                          project.priority === "critical" || project.priority === "high"
                            ? "destructive"
                            : "outline"
                        }
                        className="text-xs font-medium whitespace-nowrap shrink-0 max-w-full overflow-hidden text-ellipsis"
                      >
                        {getPriorityDisplay(project.priority)}
                      </Badge>
                    )}
                  </div>
                  {project.start_date && (
                    <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0 overflow-hidden text-ellipsis max-w-[80px]">
                      {new Date(project.start_date).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4 flex-1 flex flex-col pt-0 min-w-0">
                <div className="space-y-3 flex-1 min-w-0">
                  <div className="flex items-center justify-between text-sm gap-2 min-w-0">
                    <div className="flex items-center gap-1 text-muted-foreground min-w-0 overflow-hidden">
                      <Users className="h-4 w-4 shrink-0" />
                      <span className="truncate text-ellipsis overflow-hidden">{project.project_members?.length || 0} members</span>
                    </div>
                    <div className="flex items-center gap-1 text-muted-foreground min-w-0 overflow-hidden">
                      <TrendingUp className="h-4 w-4 shrink-0" />
                      <span className="truncate text-ellipsis overflow-hidden">{project.experiments?.length || 0} experiments</span>
                    </div>
                  </div>
                  {project.created_by && (
                    <div className="flex items-center gap-1 text-sm text-muted-foreground min-w-0 overflow-hidden">
                      <span className="text-xs shrink-0">Lead:</span>
                      <span className="truncate text-ellipsis overflow-hidden">
                        {project.created_by.first_name} {project.created_by.last_name}
                      </span>
                    </div>
                  )}
                </div>
                <Button variant="outline" size="sm" className="w-full mt-auto shrink-0" asChild>
                  <Link href={`/projects/${project.id}`}>
                    <Eye className="h-4 w-4 mr-2" />
                    <span className="truncate">View Project</span>
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
            <CardTitle className="text-foreground">All Projects</CardTitle>
            <CardDescription>Complete list of research projects</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative w-full overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[250px]">Project Name</TableHead>
                    <TableHead className="min-w-[100px]">Status</TableHead>
                    <TableHead className="min-w-[100px]">Priority</TableHead>
                    <TableHead className="min-w-[100px]">Team</TableHead>
                    <TableHead className="min-w-[120px]">Experiments</TableHead>
                    <TableHead className="min-w-[140px]">Start Date</TableHead>
                    <TableHead className="min-w-[180px]">Lead</TableHead>
                    <TableHead className="text-right min-w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projects.map((project) => (
                    <TableRow key={project.id}>
                      <TableCell className="font-medium text-foreground">
                        <div className="max-w-[300px]">
                          <div className="font-semibold truncate">{project.name}</div>
                          {project.description && (
                            <div className="text-sm text-muted-foreground truncate">
                              {project.description}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            project.status === "active"
                              ? "default"
                              : project.status === "completed"
                                ? "secondary"
                                : "outline"
                          }
                          className="whitespace-nowrap"
                        >
                          {getStatusDisplay(project.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {project.priority ? (
                          <Badge
                            variant={
                              project.priority === "critical" || project.priority === "high"
                                ? "destructive"
                                : "outline"
                            }
                            className="whitespace-nowrap"
                          >
                            {getPriorityDisplay(project.priority)}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          <span>{project.project_members?.length || 0}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <TrendingUp className="h-4 w-4 text-muted-foreground" />
                          <span>{project.experiments?.length || 0}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {project.start_date
                          ? formatDate(project.start_date)
                          : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {project.created_by
                          ? `${project.created_by.first_name} ${project.created_by.last_name}`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/projects/${project.id}`}>
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
