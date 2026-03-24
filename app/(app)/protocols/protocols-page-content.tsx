"use client"

import { useState, useEffect, useMemo } from "react"
import { useMediaQuery } from "@/hooks/use-media-query"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus, FileText, Grid3x3, List } from "lucide-react"
import Link from "next/link"
import { ProtocolList } from "./protocol-list"
import {
  FILTER_ALL,
  ResourceFilterRow,
  ResourceListFilter,
} from "@/components/ui/resource-list-filters"

interface Protocol {
  id: string
  name: string
  description: string | null
  version: string
  category: string | null
  updated_at: string
  experiment_protocols?: { count: number }[]
}

const USAGE_LINKED = "linked"
const USAGE_UNLINKED = "unlinked"

function protocolUsageCount(p: Protocol): number {
  const arr = p.experiment_protocols
  if (!arr?.length) return 0
  const first = arr[0] as { count?: number }
  return typeof first?.count === "number" ? first.count : 0
}

export function ProtocolsPageContent({ protocols }: { protocols: Protocol[] }) {
  const isMobile = useMediaQuery("(max-width: 768px)")
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid")
  const [categoryFilter, setCategoryFilter] = useState(FILTER_ALL)
  const [versionFilter, setVersionFilter] = useState(FILTER_ALL)
  const [usageFilter, setUsageFilter] = useState(FILTER_ALL)

  useEffect(() => {
    if (isMobile) setViewMode("grid")
  }, [isMobile])

  const categoryOptions = useMemo(() => {
    const s = new Set(
      protocols.map((p) => p.category).filter((c): c is string => Boolean(c && c.trim()))
    )
    return Array.from(s)
      .sort()
      .map((value) => ({ value, label: value }))
  }, [protocols])

  const versionOptions = useMemo(() => {
    const s = new Set(protocols.map((p) => p.version).filter(Boolean))
    return Array.from(s)
      .sort()
      .map((value) => ({ value, label: value }))
  }, [protocols])

  const usageOptions = useMemo(
    () => [
      { value: USAGE_LINKED, label: "Used in experiments" },
      { value: USAGE_UNLINKED, label: "Not linked" },
    ],
    []
  )

  const filteredProtocols = useMemo(() => {
    return protocols.filter((p) => {
      if (categoryFilter !== FILTER_ALL && (p.category || "") !== categoryFilter) return false
      if (versionFilter !== FILTER_ALL && p.version !== versionFilter) return false
      if (usageFilter === USAGE_LINKED && protocolUsageCount(p) === 0) return false
      if (usageFilter === USAGE_UNLINKED && protocolUsageCount(p) > 0) return false
      return true
    })
  }, [protocols, categoryFilter, versionFilter, usageFilter])

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

      <ResourceFilterRow>
        <ResourceListFilter
          label="Category"
          value={categoryFilter}
          onValueChange={setCategoryFilter}
          options={categoryOptions}
          allLabel="All categories"
        />
        {versionOptions.length > 0 && (
          <ResourceListFilter
            label="Version"
            value={versionFilter}
            onValueChange={setVersionFilter}
            options={versionOptions}
            allLabel="All versions"
          />
        )}
        <ResourceListFilter
          label="Usage"
          value={usageFilter}
          onValueChange={setUsageFilter}
          options={usageOptions}
          allLabel="Any usage"
        />
      </ResourceFilterRow>

      {filteredProtocols.length > 0 ? (
        <ProtocolList protocols={filteredProtocols} viewMode={viewMode} setViewMode={setViewMode} hideToolbar />
      ) : (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No protocols match the selected filters.
        </p>
      )}
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
