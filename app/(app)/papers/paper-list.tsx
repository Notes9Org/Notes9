"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useMediaQuery } from "@/hooks/use-media-query"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { FileText, Calendar, Grid3x3, List, Eye } from "lucide-react"

export interface PaperListItem {
  id: string
  title: string
  status: string
  updated_at: string
  created_at: string
  project?: { id: string; name: string } | null
  created_by_profile?: { first_name: string; last_name: string } | null
}

function statusColor(status: string) {
  switch (status) {
    case "draft":
      return "outline"
    case "in_review":
      return "default"
    case "published":
      return "success" as const
    default:
      return "outline"
  }
}

type PaperListProps = {
  papers: PaperListItem[]
  /** When set, opening a paper switches the parent tab instead of navigating. */
  onSelectPaper?: (paper: PaperListItem) => void
  viewMode?: "grid" | "table"
  setViewMode?: (mode: "grid" | "table") => void
  hideToolbar?: boolean
}

export function PaperList({
  papers,
  onSelectPaper,
  viewMode: controlledView,
  setViewMode: setControlledView,
  hideToolbar,
}: PaperListProps) {
  const isMobile = useMediaQuery("(max-width: 768px)")
  const [internalView, setInternalView] = useState<"grid" | "table">("grid")
  const viewMode = controlledView ?? internalView
  const setViewMode = setControlledView ?? setInternalView
  const effectiveViewMode = isMobile ? "grid" : viewMode

  useEffect(() => {
    if (isMobile) setViewMode("grid")
  }, [isMobile, setViewMode])

  if (papers.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <FileText className="mb-4 h-12 w-12 text-muted-foreground/50" />
          <h3 className="mb-1 text-lg font-medium">No papers yet</h3>
          <p className="text-sm text-muted-foreground">
            Create your first research paper to get started.
          </p>
        </CardContent>
      </Card>
    )
  }

  const openPaper = (paper: PaperListItem) => {
    onSelectPaper?.(paper)
  }

  function PaperGridCard({ paper }: { paper: PaperListItem }) {
    const card = (
      <Card className="flex h-full min-w-0 flex-col overflow-hidden transition-colors hover:border-primary">
        <CardHeader className="min-w-0 pb-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1 space-y-1 overflow-hidden">
              <CardTitle
                className="line-clamp-2 min-w-0 text-base leading-tight text-foreground"
                title={paper.title}
              >
                {paper.title}
              </CardTitle>
              {paper.project && (
                <CardDescription className="line-clamp-1 text-xs">{paper.project.name}</CardDescription>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 pt-2">
            <Badge variant={statusColor(paper.status)} className="shrink-0 text-xs">
              {paper.status?.replace("_", " ")}
            </Badge>
            <span className="truncate text-xs text-muted-foreground">
              {new Date(paper.updated_at).toLocaleDateString()}
            </span>
          </div>
        </CardHeader>
        <CardContent className="flex min-w-0 flex-1 flex-col gap-2 pt-0">
          {paper.created_by_profile && (
            <p className="text-xs text-muted-foreground">
              {paper.created_by_profile.first_name} {paper.created_by_profile.last_name}
            </p>
          )}
          {onSelectPaper ? (
            <div className="mt-auto flex w-full shrink-0 items-center justify-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-xs font-medium text-foreground">
              <Eye className="h-3.5 w-3.5" />
              Open in editor
            </div>
          ) : (
            <div className="mt-auto flex items-center gap-1 text-xs text-muted-foreground">
              <Eye className="h-3.5 w-3.5" />
              Open full page
            </div>
          )}
        </CardContent>
      </Card>
    )

    if (onSelectPaper) {
      return (
        <button type="button" className="block min-w-0 text-left" onClick={() => openPaper(paper)}>
          {card}
        </button>
      )
    }

    return (
      <Link href={`/papers/${paper.id}`} className="block min-w-0">
        {card}
      </Link>
    )
  }

  return (
    <>
      {!hideToolbar && (
        <div className="mb-4 flex justify-end">
          <div className="inline-flex gap-1 rounded-lg border p-1">
            <Button
              variant={effectiveViewMode === "grid" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("grid")}
              className="gap-2"
            >
              <Grid3x3 className="h-4 w-4" />
              Grid
            </Button>
            <Button
              variant={isMobile ? "ghost" : effectiveViewMode === "table" ? "default" : "ghost"}
              size="sm"
              onClick={() => !isMobile && setViewMode("table")}
              className="gap-2"
              disabled={isMobile}
              aria-disabled={isMobile}
            >
              <List className="h-4 w-4" />
              Table
            </Button>
          </div>
        </div>
      )}

      {effectiveViewMode === "grid" && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
          {papers.map((paper) => (
            <PaperGridCard key={paper.id} paper={paper} />
          ))}
        </div>
      )}

      {effectiveViewMode === "table" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-foreground">All papers</CardTitle>
            <CardDescription>Your writing documents</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative w-full overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[200px]">Title</TableHead>
                    <TableHead className="min-w-[100px]">Status</TableHead>
                    <TableHead className="min-w-[140px]">Project</TableHead>
                    <TableHead className="min-w-[120px]">Updated</TableHead>
                    <TableHead className="text-right min-w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {papers.map((paper) => (
                    <TableRow
                      key={paper.id}
                      className={onSelectPaper ? "cursor-pointer" : undefined}
                      onClick={() => onSelectPaper && openPaper(paper)}
                    >
                      <TableCell className="font-medium text-foreground">
                        <div className="flex max-w-[320px] items-center gap-2">
                          <FileText className="h-4 w-4 shrink-0 text-primary" />
                          <span className="truncate">{paper.title}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusColor(paper.status)}>{paper.status?.replace("_", " ")}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {paper.project?.name ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(paper.updated_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {onSelectPaper ? (
                          <Button
                            size="sm"
                            variant="outline"
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              openPaper(paper)
                            }}
                          >
                            Open
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" asChild>
                            <Link href={`/papers/${paper.id}`}>Open</Link>
                          </Button>
                        )}
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
