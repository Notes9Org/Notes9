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
import { Microscope, Calendar, MapPin, Eye, Grid3x3, List } from 'lucide-react'
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

export function EquipmentList({ equipment }: { equipment: Equipment[] }) {
  const isMobile = useMediaQuery("(max-width: 768px)")
  const [viewMode, setViewMode] = useState<"grid" | "table">("table")

  useEffect(() => {
    if (isMobile) setViewMode("grid")
  }, [isMobile])

  if (!equipment || equipment.length === 0) {
    return null
  }

  const effectiveViewMode = isMobile ? "grid" : viewMode

  return (
    <>
      {/* View Toggle */}
      <div className="flex justify-end">
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

      {/* Grid View */}
      {effectiveViewMode === "grid" && (
        <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {equipment.map((item) => (
            <Card key={item.id} className="hover:border-primary transition-colors flex flex-col">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <Microscope className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-base text-foreground truncate">
                        {item.name}
                      </CardTitle>
                      <CardDescription className="truncate">{item.equipment_code}</CardDescription>
                    </div>
                  </div>
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
                    className="shrink-0"
                  >
                    {item.status.replace("_", " ")}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 flex-1 flex flex-col">
                <div className="space-y-2 flex-1">
                  <div className="text-sm">
                    <p className="text-muted-foreground text-xs">Category</p>
                    <p className="font-medium text-foreground truncate">{item.category || "N/A"}</p>
                  </div>
                  {item.model && (
                    <div className="text-sm">
                      <p className="text-muted-foreground text-xs">Model</p>
                      <p className="font-medium text-foreground truncate">{item.model}</p>
                    </div>
                  )}
                  {item.location && (
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">{item.location}</span>
                    </div>
                  )}
                  {item.next_maintenance_date && (
                    <div className="flex items-start gap-1 text-sm text-muted-foreground">
                      <Calendar className="h-3 w-3 shrink-0 mt-0.5" />
                      <span className="break-words">
                        Next: {new Date(item.next_maintenance_date).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </div>
                <Button variant="outline" size="sm" className="w-full" asChild>
                  <Link href={`/equipment/${item.id}`}>
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
                          <Microscope className="h-4 w-4 text-muted-foreground shrink-0" />
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
