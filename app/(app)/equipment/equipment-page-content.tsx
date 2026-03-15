"use client"

import { useState, useEffect } from "react"
import { useMediaQuery } from "@/hooks/use-media-query"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus, Microscope, Grid3x3, List } from "lucide-react"
import Link from "next/link"
import { EquipmentList } from "./equipment-list"

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

interface EquipmentPageContentProps {
  equipment: Equipment[]
  statusCount: { available: number; in_use: number; maintenance: number; offline: number }
}

export function EquipmentPageContent({ equipment, statusCount }: EquipmentPageContentProps) {
  const isMobile = useMediaQuery("(max-width: 768px)")
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid")

  useEffect(() => {
    if (isMobile) setViewMode("grid")
  }, [isMobile])

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-muted-foreground">
          Manage and track laboratory instruments and equipment
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <div className="inline-flex gap-1 rounded-lg border p-1">
            <Button
              variant={viewMode === "grid" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("grid")}
              className="gap-2"
            >
              <Grid3x3 className="h-4 w-4" />
              Grid
            </Button>
            <Button
              variant={isMobile ? "ghost" : viewMode === "table" ? "default" : "ghost"}
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
          <Button
            asChild
            size="icon"
            variant="ghost"
            className="size-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="New equipment"
          >
            <Link href="/equipment/new">
              <Plus className="size-4" />
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Available</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-success">{statusCount.available}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">In Use</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{statusCount.in_use}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Maintenance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-warning">{statusCount.maintenance}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Offline</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{statusCount.offline}</div>
          </CardContent>
        </Card>
      </div>

      <EquipmentList equipment={equipment} viewMode={viewMode} setViewMode={setViewMode} hideToolbar />
    </div>
  )
}

export function EquipmentEmptyState() {
  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-muted-foreground">
          Manage and track laboratory instruments and equipment
        </p>
        <Button
          asChild
          size="icon"
          variant="ghost"
          className="shrink-0 size-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label="New equipment"
        >
          <Link href="/equipment/new">
            <Plus className="size-4" />
          </Link>
        </Button>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Microscope className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground mb-4">No equipment registered</p>
          <Button asChild>
            <Link href="/equipment/new">
              <Plus className="h-4 w-4 mr-2" />
              Create First Equipment
            </Link>
          </Button>
        </CardContent>
      </Card>
    </>
  )
}
