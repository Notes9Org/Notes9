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
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 320px))' }}>
          {projects.map((project) => (
            <Card key={project.id} className="hover:border-primary transition-colors flex flex-col">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-lg text-foreground line-clamp-2 flex-1">
                    {project.name}
                  </CardTitle>
                  <Badge
                    variant={
                      project.status === "active"
                        ? "default"
                        : project.status === "completed"
                          ? "secondary"
                          : "outline"
                    }
                    className="shrink-0"
                  >
                    {project.status}
                  </Badge>
                </div>
                {project.description && (
                  <CardDescription className="line-clamp-2">
                    {project.description}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="space-y-4 flex-1 flex flex-col">
                <div className="space-y-3 flex-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Users className="h-4 w-4" />
                      <span>{project.project_members?.length || 0} members</span>
                    </div>
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <TrendingUp className="h-4 w-4" />
                      <span>{project.experiments?.length || 0} experiments</span>
                    </div>
                  </div>
                  {project.start_date && (
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      <span>Started: {formatDate(project.start_date)}</span>
                    </div>
                  )}
                  {project.priority && (
                    <Badge
                      variant={
                        project.priority === "critical" || project.priority === "high"
                          ? "destructive"
                          : "outline"
                      }
                    >
                      {project.priority} priority
                    </Badge>
                  )}
                </div>
                <Button variant="outline" size="sm" className="w-full mt-auto" asChild>
                  <Link href={`/projects/${project.id}`}>
                    <Eye className="h-4 w-4 mr-2" />
                    View Project
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
                        >
                          {project.status}
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
                          >
                            {project.priority}
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

