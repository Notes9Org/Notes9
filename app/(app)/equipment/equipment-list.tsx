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
import { Microscope, MapPin, Eye, Grid3x3, List } from 'lucide-react'
import Link from 'next/link'

interface Equipment {
  id: string
  name: string
  equipment_code: string
  category: string | null
  model: string | null
  manufacturer: string | null
  location: string | null
  status: string
  next_maintenance_date: string | null
}

interface EquipmentListProps {
  equipment: Equipment[]
  viewMode?: "grid" | "table"
  setViewMode?: (mode: "grid" | "table") => void
  hideToolbar?: boolean
}

export function EquipmentList({ equipment, viewMode: controlledView, setViewMode: setControlledView, hideToolbar }: EquipmentListProps) {
  const isMobile = useMediaQuery("(max-width: 768px)")
  const [internalView, setInternalView] = useState<"grid" | "table">("grid")
  const viewMode = controlledView ?? internalView
  const setViewMode = setControlledView ?? setInternalView
  const effectiveViewMode = isMobile ? "grid" : viewMode

  useEffect(() => {
    if (isMobile) setViewMode("grid")
  }, [isMobile, setViewMode])

  if (!equipment || equipment.length === 0) {
    return null
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
          {equipment.map((item) => (
            <Card key={item.id} className="hover:border-primary transition-colors flex flex-col min-w-0 overflow-hidden">
              <CardHeader className="pb-3 min-w-0">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Microscope className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1 overflow-hidden">
                    <CardTitle className="text-base text-foreground leading-tight truncate">
                      {item.name}
                    </CardTitle>
                    <CardDescription className="text-xs truncate">{item.equipment_code}</CardDescription>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2 gap-2 min-w-0">
                  <Badge
                    variant={
                      item.status === "available"
                        ? "default"
                        : item.status === "in_use"
                        ? "secondary"
                        : item.status === "maintenance"
                        ? "outline"
                        : "destructive"
                    }
                    className="text-xs font-medium whitespace-nowrap shrink-0"
                  >
                    {item.status.replace("_", " ")}
                  </Badge>
                  {item.next_maintenance_date && (
                    <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0 truncate max-w-24">
                      {new Date(item.next_maintenance_date).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3 flex-1 flex flex-col pt-0 min-w-0">
                <div className="space-y-2 flex-1 min-w-0">
                  {item.category && (
                    <p className="text-sm text-muted-foreground truncate">{item.category}</p>
                  )}
                  {item.model && (
                    <p className="text-sm text-muted-foreground truncate">{item.model}</p>
                  )}
                  {item.location && (
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">{item.location}</span>
                    </div>
                  )}
                </div>
                <Button variant="outline" size="sm" className="w-full mt-auto shrink-0" asChild>
                  <Link href={`/equipment/${item.id}`}>
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
            <CardTitle className="text-foreground">All Equipment</CardTitle>
            <CardDescription>Complete list of laboratory equipment</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative w-full overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[200px]">Equipment</TableHead>
                    <TableHead className="min-w-[120px]">Code</TableHead>
                    <TableHead className="min-w-[120px]">Category</TableHead>
                    <TableHead className="min-w-[150px]">Model</TableHead>
                    <TableHead className="min-w-[120px]">Location</TableHead>
                    <TableHead className="min-w-[100px]">Status</TableHead>
                    <TableHead className="min-w-[140px]">Next Maintenance</TableHead>
                    <TableHead className="text-right min-w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {equipment.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium text-foreground">
                        <div className="flex items-center gap-2">
                          <Microscope className="h-4 w-4 text-primary shrink-0" />
                          <span className="truncate">{item.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{item.equipment_code}</TableCell>
                      <TableCell>{item.category || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {item.model || "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {item.location || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            item.status === "available"
                              ? "default"
                              : item.status === "in_use"
                              ? "secondary"
                              : item.status === "maintenance"
                              ? "outline"
                              : "destructive"
                          }
                        >
                          {item.status.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {item.next_maintenance_date
                          ? new Date(item.next_maintenance_date).toLocaleDateString()
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/equipment/${item.id}`}>
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
