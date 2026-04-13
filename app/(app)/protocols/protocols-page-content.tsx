"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useMediaQuery } from "@/hooks/use-media-query"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus, FileText, Grid3x3, List, PenBox } from "lucide-react"
import Link from "next/link"
import { ProtocolList } from "./protocol-list"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ProtocolTemplatesPanel } from "@/components/protocols/protocol-templates-panel"
import {
  FILTER_ALL,
  ResourceFilterRow,
  ResourceListFilter,
} from "@/components/ui/resource-list-filters"

export type ProtocolsProjectContext = {
  id: string
  name: string
  protocolIds: string[]
}

export interface Protocol {
  id: string
  name: string
  description: string | null
  version: string
  category: string | null
  updated_at: string
  project_id: string | null
  experiment_id: string | null
  project?: { id: string; name: string } | null
  experiment?: { id: string; name: string } | null
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

export function ProtocolsPageContent({
  protocols,
  projectContext = null,
}: {
  protocols: Protocol[]
  projectContext?: ProtocolsProjectContext | null
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const mainTab = searchParams.get("tab") === "templates" ? "templates" : "library"
  const selectForDesign = searchParams.get("selectForDesign") === "1"

  const setMainTab = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value === "templates") {
        params.set("tab", "templates")
      } else {
        params.delete("tab")
      }
      const q = params.toString()
      router.push(q ? `${pathname}?${q}` : pathname)
    },
    [pathname, router, searchParams]
  )

  const isMobile = useMediaQuery("(max-width: 768px)")
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid")
  const [categoryFilter, setCategoryFilter] = useState(FILTER_ALL)
  const [versionFilter, setVersionFilter] = useState(FILTER_ALL)
  const [usageFilter, setUsageFilter] = useState(FILTER_ALL)
  const [projectFilter, setProjectFilter] = useState(FILTER_ALL)

  const scopedProtocols = useMemo(() => {
    if (!projectContext) return protocols
    if (projectContext.protocolIds.length === 0) return [] as Protocol[]
    const allow = new Set(projectContext.protocolIds)
    return protocols.filter((p) => allow.has(p.id))
  }, [protocols, projectContext])

  useEffect(() => {
    if (isMobile) setViewMode("grid")
  }, [isMobile])

  const categoryOptions = useMemo(() => {
    const s = new Set(
      scopedProtocols.map((p) => p.category).filter((c): c is string => Boolean(c && c.trim()))
    )
    return Array.from(s)
      .sort()
      .map((value) => ({ value, label: value }))
  }, [scopedProtocols])

  const versionOptions = useMemo(() => {
    const s = new Set(scopedProtocols.map((p) => p.version).filter(Boolean))
    return Array.from(s)
      .sort()
      .map((value) => ({ value, label: value }))
  }, [scopedProtocols])

  const projectOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const p of scopedProtocols) {
      if (p.project?.id && p.project.name) {
        seen.set(p.project.id, p.project.name)
      }
    }
    return Array.from(seen.entries())
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([value, label]) => ({ value, label }))
  }, [scopedProtocols])

  const usageOptions = useMemo(
    () => [
      { value: USAGE_LINKED, label: "Used in experiments" },
      { value: USAGE_UNLINKED, label: "Not linked" },
    ],
    []
  )

  const newProtocolHref = projectContext
    ? `/protocols/new?project=${projectContext.id}`
    : "/protocols/new"

  const filteredProtocols = useMemo(() => {
    return scopedProtocols.filter((p) => {
      if (categoryFilter !== FILTER_ALL && (p.category || "") !== categoryFilter) return false
      if (versionFilter !== FILTER_ALL && p.version !== versionFilter) return false
      if (usageFilter === USAGE_LINKED && protocolUsageCount(p) === 0) return false
      if (usageFilter === USAGE_UNLINKED && protocolUsageCount(p) > 0) return false
      if (projectFilter !== FILTER_ALL && p.project?.id !== projectFilter) return false
      return true
    })
  }, [scopedProtocols, categoryFilter, versionFilter, usageFilter, projectFilter])

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-muted-foreground">
          Standard Operating Procedures library
        </p>
        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
          {mainTab === "library" ? (
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
          ) : null}
          <Button
            asChild
            size="icon"
            variant="ghost"
            className="size-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="New protocol"
          >
            <Link href={newProtocolHref}>
              <Plus className="size-4" />
            </Link>
          </Button>
        </div>
      </div>

      {selectForDesign ? (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex flex-col gap-2 py-4 text-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-medium text-foreground">Protocol works in design mode only.</p>
              <p className="text-muted-foreground">
                Select the protocol you want to edit, then click <span className="font-medium text-foreground">Design</span> to open it with Protocol.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
              <PenBox className="h-4 w-4" />
              <span>Pick a protocol below</span>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Tabs value={mainTab} onValueChange={setMainTab} className="space-y-4">
        <TabsList className="h-9 w-fit">
          <TabsTrigger value="library" className="text-sm">
            Library
          </TabsTrigger>
          <TabsTrigger value="templates" className="text-sm">
            Templates
          </TabsTrigger>
        </TabsList>

        <TabsContent value="library" className="mt-0 space-y-6 focus-visible:outline-none">
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
            {projectOptions.length > 1 && (
              <ResourceListFilter
                label="Project"
                value={projectFilter}
                onValueChange={setProjectFilter}
                options={projectOptions}
                allLabel="All projects"
              />
            )}
          </ResourceFilterRow>

          {filteredProtocols.length > 0 ? (
            <ProtocolList
              protocols={filteredProtocols}
              viewMode={viewMode}
              setViewMode={setViewMode}
              hideToolbar
              linkProjectId={projectContext?.id ?? null}
            />
          ) : projectContext && scopedProtocols.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground space-y-3">
                <p>
                  No protocols are linked to experiments in{" "}
                  <span className="font-medium text-foreground">{projectContext.name}</span> yet.
                </p>
                <p>
                  <Link
                    href={`/projects/${projectContext.id}`}
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    Back to project
                  </Link>
                  {" · "}
                  <Link href="/protocols" className="underline-offset-4 hover:underline">
                    Browse full protocol library
                  </Link>
                </p>
              </CardContent>
            </Card>
          ) : scopedProtocols.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-4">No protocols in your library yet</p>
                <Button asChild>
                  <Link href={newProtocolHref}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create first protocol
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No protocols match the selected filters.
            </p>
          )}
        </TabsContent>

        <TabsContent value="templates" className="mt-0 focus-visible:outline-none">
          <ProtocolTemplatesPanel />
        </TabsContent>
      </Tabs>
    </div>
  )
}
