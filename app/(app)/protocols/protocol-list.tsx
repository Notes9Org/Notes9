"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useMediaQuery } from "@/hooks/use-media-query"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { FileText, Calendar, ArrowUpRight, Grid3x3, List, Pencil, FolderOpen, FlaskConical } from "lucide-react"
import Link from "next/link"
import type { Protocol } from "./protocols-page-content"

interface ProtocolListProps {
  protocols: Protocol[]
  viewMode?: "grid" | "table"
  setViewMode?: (mode: "grid" | "table") => void
  hideToolbar?: boolean
  /** Preserve project hierarchy on protocol detail links (`?project=`). */
  linkProjectId?: string | null
}

function protocolDetailHref(protocolId: string, linkProjectId?: string | null) {
  if (linkProjectId) return `/protocols/${protocolId}?project=${linkProjectId}`
  return `/protocols/${protocolId}`
}

function protocolDesignHref(protocolId: string, linkProjectId?: string | null) {
  if (linkProjectId) return `/protocols/${protocolId}?project=${linkProjectId}&design=1`
  return `/protocols/${protocolId}?design=1`
}

export function ProtocolList({
  protocols,
  viewMode: controlledView,
  setViewMode: setControlledView,
  hideToolbar,
  linkProjectId = null,
}: ProtocolListProps) {
  const isMobile = useMediaQuery("(max-width: 768px)")
  const [internalView, setInternalView] = useState<"grid" | "table">("table")
  const viewMode = controlledView ?? internalView
  const setViewMode = setControlledView ?? setInternalView
  const effectiveViewMode = isMobile ? "grid" : viewMode

  useEffect(() => {
    if (isMobile) setViewMode("grid")
  }, [isMobile, setViewMode])

  if (!protocols || protocols.length === 0) {
    return null
  }

  const getUsageCount = (p: Protocol) => {
    const arr = p.experiment_protocols
    if (!arr || !Array.isArray(arr) || arr.length === 0) return 0
    const first = arr[0] as { count?: number }
    return typeof first?.count === "number" ? first.count : 0
  }

  return (
    <>
      {!hideToolbar && (
        <div className="flex justify-end mb-4">
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
        <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(280px,1fr))]">
          {protocols.map((item) => (
            <Card key={item.id} className="hover:border-primary transition-colors flex flex-col min-w-0 overflow-hidden">
              <CardHeader className="pb-3 min-w-0">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1 overflow-hidden">
                    <CardTitle className="text-base text-foreground leading-tight truncate">
                      {item.name}
                    </CardTitle>
                    <CardDescription className="text-xs line-clamp-2">
                      {item.description || "No description"}
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2 gap-2 min-w-0 flex-wrap">
                  {item.category && (
                    <Badge variant="secondary" className="text-xs shrink-0">
                      {item.category}
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-xs shrink-0">
                    v{item.version}
                  </Badge>
                </div>
                {/* Project + Experiment context */}
                {(item.project || item.experiment) && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {item.project && (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted/60 rounded px-1.5 py-0.5 truncate max-w-[140px]">
                        <FolderOpen className="h-3 w-3 shrink-0" />
                        <span className="truncate">{item.project.name}</span>
                      </span>
                    )}
                    {item.experiment && (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted/60 rounded px-1.5 py-0.5 truncate max-w-[140px]">
                        <FlaskConical className="h-3 w-3 shrink-0" />
                        <span className="truncate">{item.experiment.name}</span>
                      </span>
                    )}
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-3 flex-1 flex flex-col pt-0 min-w-0">
                <div className="space-y-2 flex-1 min-w-0">
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <span>Used in</span>
                    <Badge variant="outline" className="text-xs">
                      {getUsageCount(item)} experiments
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Calendar className="h-3 w-3 shrink-0" />
                    <span className="truncate">Updated {new Date(item.updated_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="flex gap-2 mt-auto shrink-0">
                  <Button variant="outline" size="sm" className="flex-1" asChild>
                    <Link href={protocolDetailHref(item.id, linkProjectId)}>
                      <ArrowUpRight className="h-4 w-4 mr-2" />
                      <span className="truncate">View</span>
                    </Link>
                  </Button>
                  <Button variant="default" size="sm" className="flex-1 gap-1.5" asChild>
                    <Link href={protocolDesignHref(item.id, linkProjectId)}>
                      <Pencil className="h-3.5 w-3.5" />
                      Design
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Table View */}
      {effectiveViewMode === "table" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-foreground">All Protocols</CardTitle>
            <CardDescription>Complete list of Standard Operating Procedures</CardDescription>
          </CardHeader>
          <CardContent>
            <ProtocolTableView protocols={protocols} linkProjectId={linkProjectId} />
          </CardContent>
        </Card>
      )}
    </>
  )
}

const formatDate = (dateStr: string): string => {
  return new Date(dateStr).toISOString().split('T')[0]
}

function ProtocolTableView({ protocols, linkProjectId }: { protocols: Protocol[]; linkProjectId?: string | null }) {
  const router = useRouter()
  return (
    <div className="relative w-full overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[300px]">Protocol</TableHead>
            <TableHead className="min-w-[120px]">Created</TableHead>
            <TableHead className="text-right min-w-[100px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {protocols.map((item) => (
            <TableRow
              key={item.id}
              className="cursor-pointer"
              onClick={() => router.push(protocolDetailHref(item.id, linkProjectId))}
            >
              <TableCell className="font-medium text-foreground">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary shrink-0" />
                  <span className="truncate">{item.name}</span>
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatDate(item.created_at)}
              </TableCell>
              <TableCell className="text-right">
                <Button variant="ghost" size="sm" asChild onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                  <Link href={protocolDetailHref(item.id, linkProjectId)}>
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
