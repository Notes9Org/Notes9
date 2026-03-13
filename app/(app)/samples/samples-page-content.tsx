"use client"

import { useState, useEffect } from "react"
import { useMediaQuery } from "@/hooks/use-media-query"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus, Package, Grid3x3, List } from "lucide-react"
import Link from "next/link"
import { SampleList } from "./sample-list"

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

interface SamplesPageContentProps {
  samples: Sample[]
  statusCount: { available: number; in_use: number; depleted: number; disposed: number }
}

export function SamplesPageContent({ samples, statusCount }: SamplesPageContentProps) {
  const isMobile = useMediaQuery("(max-width: 768px)")
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid")

  useEffect(() => {
    if (isMobile) setViewMode("grid")
  }, [isMobile])

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-muted-foreground">
          Track and manage laboratory samples
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
            aria-label="New sample"
          >
            <Link href="/samples/new">
              <Plus className="size-4" />
            </Link>
          </Button>
        </div>
      </div>

      {/* Status Overview - same as experiments-style spacing */}
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
            <CardTitle className="text-sm font-medium text-muted-foreground">Depleted</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-warning">{statusCount.depleted}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Disposed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-muted-foreground">{statusCount.disposed}</div>
          </CardContent>
        </Card>
      </div>

      <SampleList samples={samples} viewMode={viewMode} setViewMode={setViewMode} hideToolbar />
    </div>
  )
}

export function SamplesEmptyState() {
  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-muted-foreground">
          Track and manage laboratory samples
        </p>
        <Button
          asChild
          size="icon"
          variant="ghost"
          className="shrink-0 size-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label="New sample"
        >
          <Link href="/samples/new">
            <Plus className="size-4" />
          </Link>
        </Button>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Package className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground mb-4">No samples recorded</p>
          <Button asChild>
            <Link href="/samples/new">
              <Plus className="h-4 w-4 mr-2" />
              Create First Sample
            </Link>
          </Button>
        </CardContent>
      </Card>
    </>
  )
}
