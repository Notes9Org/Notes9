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
import { TestTube, Package, Eye, Grid3x3, List } from "lucide-react"
import Link from "next/link"

interface Sample {
  id: string
  sample_code: string
  sample_type: string
  status: string
  quantity: number | null
  quantity_unit: string | null
  storage_location: string | null
  storage_condition: string | null
  experiment_id: string | null
  experiment?: { name: string; project?: { name: string } } | null
}

interface SampleListProps {
  samples: Sample[]
  viewMode?: "grid" | "table"
  setViewMode?: (mode: "grid" | "table") => void
  hideToolbar?: boolean
}

export function SampleList({ samples, viewMode: controlledView, setViewMode: setControlledView, hideToolbar }: SampleListProps) {
  const isMobile = useMediaQuery("(max-width: 768px)")
  const [internalView, setInternalView] = useState<"grid" | "table">("grid")
  const viewMode = controlledView ?? internalView
  const setViewMode = setControlledView ?? setInternalView
  const effectiveViewMode = isMobile ? "grid" : viewMode

  useEffect(() => {
    if (isMobile) setViewMode("grid")
  }, [isMobile, setViewMode])

  if (!samples || samples.length === 0) {
    return null
  }

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "available":
        return "default"
      case "in_use":
        return "secondary"
      case "depleted":
        return "outline"
      case "disposed":
        return "outline"
      default:
        return "outline"
    }
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
          {samples.map((item) => (
            <Card key={item.id} className="hover:border-primary transition-colors flex flex-col min-w-0 overflow-hidden">
              <CardHeader className="pb-3 min-w-0">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <TestTube className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1 overflow-hidden">
                    <CardTitle className="text-base text-foreground leading-tight truncate">
                      {item.sample_code}
                    </CardTitle>
                    <CardDescription className="text-xs truncate">{item.sample_type}</CardDescription>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2 gap-2 min-w-0">
                  <Badge variant={getStatusVariant(item.status)} className="text-xs font-medium whitespace-nowrap shrink-0">
                    {item.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 flex-1 flex flex-col pt-0 min-w-0">
                <div className="space-y-2 flex-1 min-w-0">
                  {item.experiment && (
                    <p className="text-sm text-muted-foreground truncate">{item.experiment.name}</p>
                  )}
                  {(item.quantity != null || item.storage_location) && (
                    <p className="text-sm text-muted-foreground truncate">
                      {item.quantity != null ? `${item.quantity} ${item.quantity_unit || ""}` : ""}
                      {item.quantity != null && item.storage_location ? " · " : ""}
                      {item.storage_location || ""}
                    </p>
                  )}
                  {item.storage_condition && (
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Package className="h-3 w-3 shrink-0" />
                      <span className="truncate">{item.storage_condition}</span>
                    </div>
                  )}
                </div>
                <Button variant="outline" size="sm" className="w-full mt-auto shrink-0" asChild>
                  <Link href={`/samples/${item.id}`}>
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
            <CardTitle className="text-foreground">All Samples</CardTitle>
            <CardDescription>Complete list of laboratory samples</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative w-full overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[140px]">Sample</TableHead>
                    <TableHead className="min-w-[100px]">Type</TableHead>
                    <TableHead className="min-w-[180px]">Experiment</TableHead>
                    <TableHead className="min-w-[100px]">Quantity</TableHead>
                    <TableHead className="min-w-[120px]">Location</TableHead>
                    <TableHead className="min-w-[100px]">Condition</TableHead>
                    <TableHead className="min-w-[100px]">Status</TableHead>
                    <TableHead className="text-right min-w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {samples.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium text-foreground">
                        <div className="flex items-center gap-2">
                          <TestTube className="h-4 w-4 text-primary shrink-0" />
                          <span className="truncate">{item.sample_code}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{item.sample_type}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {item.experiment ? (
                          <Link
                            href={`/experiments/${item.experiment_id!}`}
                            className="hover:text-primary hover:underline truncate block"
                          >
                            {item.experiment.name}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-foreground">
                        {item.quantity != null
                          ? `${item.quantity} ${item.quantity_unit || ""}`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {item.storage_location || "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {item.storage_condition || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusVariant(item.status)}>{item.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/samples/${item.id}`}>
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
