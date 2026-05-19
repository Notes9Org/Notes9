"use client"

import { useState, useEffect, type KeyboardEvent, type MouseEvent } from "react"
import { useRouter } from "next/navigation"
import { useMediaQuery } from "@/hooks/use-media-query"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { TestTube, Package, ArrowUpRight, Grid3x3, List, Trash2 } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"

interface Sample {
  id: string
  sample_code: string
  sample_type: string
  status: string
  quantity: number | null
  quantity_unit: string | null
  concentration?: number | null
  concentration_unit?: string | null
  storage_location: string | null
  storage_condition: string | null
  created_at: string
  updated_at?: string | null
  experiment_id: string | null
  sample_files?: { id: string; file_kind: string }[]
  sample_projects?: { project: { id: string; name: string } | null }[]
  sample_experiments?: {
    experiment: {
      id: string
      name: string
      project_id: string
      project?: { id: string; name: string } | null
    } | null
  }[]
  experiment?: {
    id: string
    name: string
    project_id: string
    project?: { id: string; name: string } | null
  } | null
}

interface SampleListProps {
  samples: Sample[]
  viewMode?: "grid" | "table"
  setViewMode?: (mode: "grid" | "table") => void
  hideToolbar?: boolean
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

const checkboxClass =
  "data-[state=checked]:bg-rose-50 data-[state=checked]:text-rose-600 data-[state=checked]:border-rose-200 dark:data-[state=checked]:bg-rose-950/30 dark:data-[state=checked]:text-rose-400 dark:data-[state=checked]:border-rose-900/30"

export function SampleList({ samples, viewMode: controlledView, setViewMode: setControlledView, hideToolbar }: SampleListProps) {
  const router = useRouter()
  const isMobile = useMediaQuery("(max-width: 768px)")
  const [internalView, setInternalView] = useState<"grid" | "table">("table")
  const viewMode = controlledView ?? internalView
  const setViewMode = setControlledView ?? setInternalView
  const effectiveViewMode = isMobile ? "grid" : viewMode

  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [deleteTarget, setDeleteTarget] = useState<Sample | null>(null)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    if (isMobile) setViewMode("grid")
  }, [isMobile, setViewMode])

  useEffect(() => {
    const allowed = new Set(samples.map((s) => s.id))
    setSelectedIds((prev) => prev.filter((id) => allowed.has(id)))
  }, [samples])

  const visibleIds = samples.map((s) => s.id)
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id))
  const someVisibleSelected =
    visibleIds.some((id) => selectedIds.includes(id)) && !allVisibleSelected

  const toggleSelected = (id: string, checked: boolean) => {
    setSelectedIds((current) =>
      checked ? [...current, id] : current.filter((selectedId) => selectedId !== id)
    )
  }

  const toggleSelectAllVisible = (checked: boolean) => {
    setSelectedIds((current) => {
      if (checked) {
        return Array.from(new Set([...current, ...visibleIds]))
      }
      return current.filter((id) => !visibleIds.includes(id))
    })
  }

  const deleteSamples = async (ids: string[]) => {
    if (ids.length === 0) return

    setIsDeleting(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.from("samples").delete().in("id", ids)
      if (error) throw error

      setSelectedIds((current) => current.filter((id) => !ids.includes(id)))
      setDeleteTarget(null)
      setBulkDeleteOpen(false)

      toast.success(ids.length === 1 ? "Sample deleted" : `${ids.length} samples deleted`)
      router.refresh()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to delete samples"
      toast.error(message)
    } finally {
      setIsDeleting(false)
    }
  }

  if (!samples || samples.length === 0) {
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

      {effectiveViewMode === "grid" && selectedIds.length > 0 && (
        <div className="flex justify-end mb-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setBulkDeleteOpen(true)}
            className="bg-rose-50 text-rose-600 border border-rose-100 font-semibold hover:bg-rose-100 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-900/10 dark:hover:bg-rose-900/30"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete Selected ({selectedIds.length})
          </Button>
        </div>
      )}

      {effectiveViewMode === "grid" && (
        <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(280px,1fr))]">
          {samples.map((item) => {
            const ctx = contextSummary(item)
            const proj = projectSummary(item)
            return (
              <Card
                key={item.id}
                className="hover:border-primary transition-colors flex flex-col min-w-0 overflow-hidden"
              >
                <CardHeader className="pb-3 min-w-0">
                  <div className="flex items-start justify-between gap-2 min-w-0">
                    <div className="flex items-start gap-3 min-w-0 flex-1 overflow-hidden">
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
                    <div
                      className="flex items-center gap-0.5 shrink-0"
                      onClick={(e: MouseEvent) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <Checkbox
                        checked={selectedIds.includes(item.id)}
                        onCheckedChange={(checked) => toggleSelected(item.id, checked === true)}
                        aria-label={`Select sample ${item.sample_code}`}
                        className={checkboxClass}
                      />
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:bg-rose-50/50 hover:text-rose-500/80 dark:hover:bg-rose-950/20 dark:hover:text-rose-400/80"
                        onClick={() => setDeleteTarget(item)}
                        aria-label={`Delete ${item.sample_code}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2 gap-2 min-w-0">
                    <Badge
                      variant={getStatusVariant(item.status)}
                      className="text-xs font-medium whitespace-nowrap shrink-0"
                    >
                      {item.status.replace(/_/g, " ")}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 flex-1 flex flex-col pt-0 min-w-0">
                  <div className="space-y-2 flex-1 min-w-0">
                    <p className="text-sm text-muted-foreground truncate">{ctx}</p>
                    <p className="text-xs text-muted-foreground truncate">{proj}</p>
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
                    {item.sample_files && item.sample_files.length > 0 && (
                      <p className="text-xs text-muted-foreground truncate">
                        {item.sample_files.length} molecular file{item.sample_files.length === 1 ? "" : "s"}
                      </p>
                    )}
                  </div>
                  <Button variant="outline" size="sm" className="w-full mt-auto shrink-0" asChild>
                    <Link href={`/samples/${item.id}`}>
                      <ArrowUpRight className="h-4 w-4 mr-2" />
                      <span className="truncate">View Details</span>
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Table View */}
      {effectiveViewMode === "table" && (
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-foreground">All Samples</CardTitle>
                <CardDescription>Complete list of laboratory samples</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {selectedIds.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setBulkDeleteOpen(true)}
                    className="bg-rose-50 text-rose-600 border border-rose-100 font-semibold hover:bg-rose-100 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-900/10 dark:hover:bg-rose-900/30"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Selected ({selectedIds.length})
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <SampleTableView
              samples={samples}
              selectedIds={selectedIds}
              allVisibleSelected={allVisibleSelected}
              someVisibleSelected={someVisibleSelected}
              toggleSelected={toggleSelected}
              toggleSelectAllVisible={toggleSelectAllVisible}
              onDeleteClick={setDeleteTarget}
              checkboxClass={checkboxClass}
            />
          </CardContent>
        </Card>
      )}

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete sample?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? (
                <>
                  This will permanently delete sample <strong>{deleteTarget.sample_code}</strong>. This action cannot be
                  undone.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                if (deleteTarget) {
                  void deleteSamples([deleteTarget.id])
                }
              }}
              disabled={isDeleting}
              className="bg-rose-50 text-rose-600 border border-rose-100 hover:bg-rose-100 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-900/10 dark:hover:bg-rose-900/30 font-semibold"
            >
              {isDeleting ? "Deleting..." : "Delete Sample"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete selected samples?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {selectedIds.length} selected sample{selectedIds.length === 1 ? "" : "s"}. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                void deleteSamples(selectedIds)
              }}
              disabled={isDeleting || selectedIds.length === 0}
              className="bg-rose-50 text-rose-600 border border-rose-100 hover:bg-rose-100 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-900/10 dark:hover:bg-rose-900/30 font-semibold"
            >
              {isDeleting ? "Deleting..." : `Delete Selected (${selectedIds.length})`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

const formatDate = (dateStr: string): string => {
  return new Date(dateStr).toISOString().split('T')[0]
}

function contextSummary(item: Sample): string {
  const names = new Set<string>()
  for (const link of item.sample_experiments ?? []) {
    if (link.experiment?.name) names.add(link.experiment.name)
  }
  if (item.experiment?.name) names.add(item.experiment.name)
  return names.size > 0 ? Array.from(names).join(", ") : "No experiments"
}

function projectSummary(item: Sample): string {
  const names = new Set<string>()
  for (const link of item.sample_projects ?? []) {
    if (link.project?.name) names.add(link.project.name)
  }
  for (const link of item.sample_experiments ?? []) {
    if (link.experiment?.project?.name) names.add(link.experiment.project.name)
  }
  if (item.experiment?.project?.name) names.add(item.experiment.project.name)
  return names.size > 0 ? Array.from(names).join(", ") : "No projects"
}

function SampleTableView({
  samples,
  selectedIds,
  allVisibleSelected,
  someVisibleSelected,
  toggleSelected,
  toggleSelectAllVisible,
  onDeleteClick,
  checkboxClass: checkboxCn,
}: {
  samples: Sample[]
  selectedIds: string[]
  allVisibleSelected: boolean
  someVisibleSelected: boolean
  toggleSelected: (id: string, checked: boolean) => void
  toggleSelectAllVisible: (checked: boolean) => void
  onDeleteClick: (item: Sample) => void
  checkboxClass: string
}) {
  const router = useRouter()
  return (
    <div className="relative w-full overflow-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[48px]">
              <Checkbox
                checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
                onCheckedChange={(checked) => toggleSelectAllVisible(checked === true)}
                aria-label="Select all visible samples"
                className={checkboxCn}
              />
            </TableHead>
            <TableHead className="min-w-[300px]">Sample</TableHead>
            <TableHead className="min-w-[140px]">Type / Status</TableHead>
            <TableHead className="min-w-[180px]">Amount</TableHead>
            <TableHead className="min-w-[220px]">Context</TableHead>
            <TableHead className="min-w-[150px]">Storage</TableHead>
            <TableHead className="min-w-[120px]">Files</TableHead>
            <TableHead className="min-w-[120px]">Updated</TableHead>
            <TableHead className="text-right min-w-[100px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {samples.map((item) => (
            <TableRow
              key={item.id}
              role="link"
              tabIndex={0}
              aria-label={`Open sample ${item.sample_code}`}
              className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => router.push(`/samples/${item.id}`)}
              onKeyDown={(event: KeyboardEvent) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault()
                  router.push(`/samples/${item.id}`)
                }
              }}
            >
              <TableCell
                className="align-middle"
                onClick={(e: MouseEvent) => e.stopPropagation()}
                onKeyDown={(e: KeyboardEvent) => e.stopPropagation()}
              >
                <Checkbox
                  checked={selectedIds.includes(item.id)}
                  onCheckedChange={(checked) => toggleSelected(item.id, checked === true)}
                  aria-label={`Select ${item.sample_code}`}
                  className={checkboxCn}
                />
              </TableCell>
              <TableCell className="font-medium text-foreground">
                <div className="flex items-center gap-2 min-w-0">
                  <TestTube className="h-4 w-4 text-primary shrink-0" />
                  <span className="truncate font-mono text-sm">{item.sample_code}</span>
                </div>
              </TableCell>
              <TableCell>
                <div className="space-y-1">
                  <p className="truncate text-sm">{item.sample_type}</p>
                  <Badge variant={getStatusVariant(item.status)} className="w-fit text-xs">
                    {item.status.replace(/_/g, " ")}
                  </Badge>
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">
                <div className="space-y-1 text-sm">
                  <p className="truncate">
                    {item.quantity != null ? `${item.quantity} ${item.quantity_unit || ""}` : "No quantity"}
                  </p>
                  {item.concentration != null ? (
                    <p className="truncate text-xs">
                      {item.concentration} {item.concentration_unit || ""}
                    </p>
                  ) : null}
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">
                <div className="max-w-[240px] space-y-1 text-sm">
                  <p className="truncate">{contextSummary(item)}</p>
                  <p className="truncate text-xs">{projectSummary(item)}</p>
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">
                <div className="max-w-[180px] space-y-1 text-sm">
                  <p className="truncate">{item.storage_location || "Not specified"}</p>
                  {item.storage_condition ? <p className="truncate text-xs">{item.storage_condition}</p> : null}
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">
                <span className="text-sm tabular-nums">{item.sample_files?.length ?? 0}</span>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatDate(item.updated_at || item.created_at)}
              </TableCell>
              <TableCell className="text-right" onClick={(e: MouseEvent) => e.stopPropagation()}>
                <div className="flex items-center justify-end gap-0.5">
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/samples/${item.id}`}>
                      <ArrowUpRight className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground hover:bg-rose-50/50 hover:text-rose-500/80 dark:hover:bg-rose-950/20 dark:hover:text-rose-400/80"
                    onClick={() => onDeleteClick(item)}
                    aria-label={`Delete ${item.sample_code}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
