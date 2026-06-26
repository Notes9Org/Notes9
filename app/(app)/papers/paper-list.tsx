"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMediaQuery } from "@/hooks/use-media-query"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Checkbox } from "@/components/ui/checkbox"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { ViewModeToggle } from "@/components/ui/view-mode-toggle"
import { FileText, Grid3x3, List, ArrowUpRight, Trash2 } from "lucide-react"

export interface PaperListItem {
  id: string
  title: string
  status: string
  updated_at: string
  created_at: string
  project?: { id: string; name: string } | null
  created_by_profile?: { first_name: string; last_name: string } | null
}

function statusColor(status: string) {
  switch (status) {
    case "draft":
      return "outline"
    case "in_review":
      return "default"
    case "published":
      return "success" as const
    default:
      return "outline"
  }
}

type PaperListProps = {
  papers: PaperListItem[]
  /** When set, opening a paper switches the parent tab instead of navigating. */
  onSelectPaper?: (paper: PaperListItem) => void
  viewMode?: "grid" | "table"
  setViewMode?: (mode: "grid" | "table") => void
  hideToolbar?: boolean
  isFiltered?: boolean
  onDeleted?: () => void
}

export function PaperList({
  papers,
  onSelectPaper,
  viewMode: controlledView,
  setViewMode: setControlledView,
  hideToolbar,
  isFiltered,
  onDeleted,
}: PaperListProps) {
  const isMobile = useMediaQuery("(max-width: 768px)")
  const [internalView, setInternalView] = useState<"grid" | "table">("table")
  const viewMode = controlledView ?? internalView
  const setViewMode = setControlledView ?? setInternalView
  const effectiveViewMode = isMobile ? "grid" : viewMode

  useEffect(() => {
    if (isMobile) setViewMode("grid")
  }, [isMobile, setViewMode])

  if (papers.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <FileText className="mb-4 h-12 w-12 text-muted-foreground/50" />
          <h3 className="mb-1 text-lg font-medium">
            {isFiltered ? "No papers match the selected filters" : "No papers yet"}
          </h3>
          <p className="text-sm text-muted-foreground">
            {isFiltered 
              ? "Try clearing your filters or select a different project."
              : "Create your first research paper to get started."}
          </p>
        </CardContent>
      </Card>
    )
  }

  const openPaper = (paper: PaperListItem) => {
    onSelectPaper?.(paper)
  }

  function PaperGridCard({ paper }: { paper: PaperListItem }) {
    const card = (
      <Card className="flex h-full min-w-0 flex-col overflow-hidden transition-all duration-200 hover:border-primary hover:shadow-md motion-safe:hover:-translate-y-0.5 animate-n9-turn-in">
        <CardHeader className="min-w-0 pb-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1 space-y-1 overflow-hidden">
              <CardTitle
                className="line-clamp-2 min-w-0 text-base leading-tight text-foreground"
                title={paper.title}
              >
                {paper.title}
              </CardTitle>
              {paper.project && (
                <CardDescription className="line-clamp-1 text-xs">{paper.project.name}</CardDescription>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 pt-2">
            <Badge variant={statusColor(paper.status)} className="shrink-0 text-xs">
              {paper.status?.replace("_", " ")}
            </Badge>
            <span className="truncate text-xs text-muted-foreground">
              {new Date(paper.updated_at).toISOString().slice(0, 10)}
            </span>
          </div>
        </CardHeader>
        <CardContent className="flex min-w-0 flex-1 flex-col gap-2 pt-0">
          {paper.created_by_profile && (
            <p className="text-xs text-muted-foreground">
              {paper.created_by_profile.first_name} {paper.created_by_profile.last_name}
            </p>
          )}
          {onSelectPaper ? (
            <div className="mt-auto flex w-full shrink-0 items-center justify-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-xs font-medium text-foreground">
              <ArrowUpRight className="h-3.5 w-3.5" />
              Open in editor
            </div>
          ) : (
            <div className="mt-auto flex items-center gap-1 text-xs text-muted-foreground">
              <ArrowUpRight className="h-3.5 w-3.5" />
              Open full page
            </div>
          )}
        </CardContent>
      </Card>
    )

    if (onSelectPaper) {
      return (
        <button type="button" className="block min-w-0 text-left" onClick={() => openPaper(paper)}>
          {card}
        </button>
      )
    }

    return (
      <Link href={`/papers/${paper.id}`} className="block min-w-0">
        {card}
      </Link>
    )
  }

  return (
    <>
      {!hideToolbar && (
        <div className="mb-4 flex justify-end">
          <ViewModeToggle value={viewMode} onChange={setViewMode} tableDisabled={isMobile} />
        </div>
      )}

      {effectiveViewMode === "grid" && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
          {papers.map((paper) => (
            <PaperGridCard key={paper.id} paper={paper} />
          ))}
        </div>
      )}

      {effectiveViewMode === "table" && (
        <Card>
          <CardContent className="pt-6">
            <PaperTableView papers={papers} onSelectPaper={onSelectPaper} onDeleted={onDeleted} />
          </CardContent>
        </Card>
      )}
    </>
  )
}

const formatDate = (dateStr: string): string => {
  return new Date(dateStr).toISOString().split('T')[0]
}

function PaperTableView({ papers, onSelectPaper, onDeleted }: { papers: PaperListItem[]; onSelectPaper?: (paper: PaperListItem) => void, onDeleted?: () => void }) {
  const router = useRouter()
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [isDeleting, setIsDeleting] = useState(false)

  const visibleIds = papers.map((p) => p.id)
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id))
  const someVisibleSelected = visibleIds.some((id) => selectedIds.includes(id)) && !allVisibleSelected

  const toggleSelected = (id: string, checked: boolean) => {
    setSelectedIds((current) =>
      checked ? [...current, id] : current.filter((selectedId) => selectedId !== id)
    )
  }

  const toggleSelectAllVisible = (checked: boolean) => {
    setSelectedIds((current) => {
      if (checked) return Array.from(new Set([...current, ...visibleIds]))
      return current.filter((id) => !visibleIds.includes(id))
    })
  }

  const confirmBulkDelete = async () => {
    if (selectedIds.length === 0) return
    if (!confirm(`Are you sure you want to delete ${selectedIds.length} papers?`)) return
    setIsDeleting(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.from("papers").delete().in("id", selectedIds)
      if (error) {
        toast.error(`Failed to delete: ${error.message}`)
        return
      }
      toast.success(`${selectedIds.length} papers deleted`)
      setSelectedIds([])
      onDeleted?.()
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="space-y-4">
      {selectedIds.length > 0 && (
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={confirmBulkDelete}
            disabled={isDeleting}
            className="bg-rose-50 text-rose-600 border border-rose-100 font-semibold hover:bg-rose-100 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-900/10 dark:hover:bg-rose-900/30"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete Selected ({selectedIds.length})
          </Button>
        </div>
      )}
      <div className="relative w-full overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[48px]">
                <Checkbox
                  checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
                  onCheckedChange={(checked) => toggleSelectAllVisible(checked === true)}
                  aria-label="Select all papers"
                  className="data-[state=checked]:bg-rose-50 data-[state=checked]:text-rose-600 data-[state=checked]:border-rose-200 dark:data-[state=checked]:bg-rose-950/30 dark:data-[state=checked]:text-rose-400 dark:data-[state=checked]:border-rose-900/30"
                />
              </TableHead>
              <TableHead className="min-w-[300px]">Title</TableHead>
              <TableHead className="min-w-[120px]">Created</TableHead>
              <TableHead className="text-right min-w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {papers.map((paper) => (
              <TableRow
                key={paper.id}
                className="cursor-pointer"
                onClick={() => onSelectPaper ? onSelectPaper(paper) : router.push(`/papers/${paper.id}`)}
              >
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selectedIds.includes(paper.id)}
                    onCheckedChange={(checked) => toggleSelected(paper.id, checked === true)}
                    aria-label={`Select ${paper.title}`}
                    className="data-[state=checked]:bg-rose-50 data-[state=checked]:text-rose-600 data-[state=checked]:border-rose-200 dark:data-[state=checked]:bg-rose-950/30 dark:data-[state=checked]:text-rose-400 dark:data-[state=checked]:border-rose-900/30"
                  />
                </TableCell>
                <TableCell className="font-medium text-foreground">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 text-primary" />
                    <span className="truncate">{paper.title}</span>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(paper.created_at)}
                </TableCell>
                <TableCell className="text-right">
                  {onSelectPaper ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelectPaper(paper)
                      }}
                    >
                      <ArrowUpRight className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" asChild onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                      <Link href={`/papers/${paper.id}`}>
                        <ArrowUpRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
