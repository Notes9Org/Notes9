"use client"

import { useState, useEffect } from "react"
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
import { FileText, Calendar, Eye, Grid3x3, List } from "lucide-react"
import Link from "next/link"

interface Protocol {
  id: string
  name: string
  description: string | null
  version: string
  category: string | null
  updated_at: string
  experiment_protocols?: { count: number }[]
}

interface ProtocolListProps {
  protocols: Protocol[]
  viewMode?: "grid" | "table"
  setViewMode?: (mode: "grid" | "table") => void
  hideToolbar?: boolean
}

export function ProtocolList({ protocols, viewMode: controlledView, setViewMode: setControlledView, hideToolbar }: ProtocolListProps) {
  const isMobile = useMediaQuery("(max-width: 768px)")
  const [internalView, setInternalView] = useState<"grid" | "table">("grid")
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
                <Button variant="outline" size="sm" className="w-full mt-auto shrink-0" asChild>
                  <Link href={`/protocols/${item.id}`}>
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
      {effectiveViewMode === "table" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-foreground">All Protocols</CardTitle>
            <CardDescription>Complete list of Standard Operating Procedures</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative w-full overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[200px]">Protocol</TableHead>
                    <TableHead className="min-w-[120px]">Category</TableHead>
                    <TableHead className="min-w-[80px]">Version</TableHead>
                    <TableHead className="min-w-[100px]">Used In</TableHead>
                    <TableHead className="min-w-[120px]">Last Updated</TableHead>
                    <TableHead className="text-right min-w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {protocols.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium text-foreground">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-primary shrink-0" />
                          <div className="min-w-0">
                            <p className="truncate">{item.name}</p>
                            {item.description && (
                              <p className="text-xs text-muted-foreground line-clamp-1">
                                {item.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {item.category ? (
                          <Badge variant="secondary" className="text-xs">
                            {item.category}
                          </Badge>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-sm">{item.version}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {getUsageCount(item)} experiments
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(item.updated_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/protocols/${item.id}`}>
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
