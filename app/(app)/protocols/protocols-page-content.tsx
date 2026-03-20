"use client"

import { useState, useEffect } from "react"
import { useMediaQuery } from "@/hooks/use-media-query"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus, FileText, Grid3x3, List } from "lucide-react"
import Link from "next/link"
import { ProtocolList } from "./protocol-list"

interface Protocol {
  id: string
  name: string
  description: string | null
  version: string
  category: string | null
  updated_at: string
  experiment_protocols?: { count: number }[]
}

export function ProtocolsPageContent({ protocols }: { protocols: Protocol[] }) {
  const isMobile = useMediaQuery("(max-width: 768px)")
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid")

  useEffect(() => {
    if (isMobile) setViewMode("grid")
  }, [isMobile])

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-muted-foreground">
          Standard Operating Procedures library
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
            aria-label="New protocol"
          >
            <Link href="/protocols/new">
              <Plus className="size-4" />
            </Link>
          </Button>
        </div>
      </div>
      <ProtocolList protocols={protocols} viewMode={viewMode} setViewMode={setViewMode} hideToolbar />
    </div>
  )
}

export function ProtocolsEmptyState() {
  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-muted-foreground">
          Standard Operating Procedures library
        </p>
        <Button
          asChild
          size="icon"
          variant="ghost"
          className="shrink-0 size-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label="New protocol"
        >
          <Link href="/protocols/new">
            <Plus className="size-4" />
          </Link>
        </Button>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <FileText className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground mb-4">No protocols available</p>
          <Button asChild>
            <Link href="/protocols/new">
              <Plus className="h-4 w-4 mr-2" />
              Create First Protocol
            </Link>
          </Button>
        </CardContent>
      </Card>
    </>
  )
}
