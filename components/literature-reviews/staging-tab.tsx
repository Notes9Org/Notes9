"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
import { LiteratureDetailModal } from "@/components/literature-reviews/literature-detail-modal"
import { removeStagingLiterature } from "@/app/(app)/literature-reviews/actions"
import { SearchPaper } from "@/types/paper-search"
import { BookOpen, Database, ExternalLink, FileText, Layers, Loader2, Star, Trash2 } from "lucide-react"
import { toast } from "sonner"

export type StagingLiteratureRow = Record<string, unknown>

interface StagingTabProps {
  stagedLiterature: StagingLiteratureRow[]
  onSavePaper: (paper: SearchPaper, literatureId: string) => void
}

function rowToSearchPaper(row: StagingLiteratureRow): SearchPaper {
  const authorsStr = (row.authors as string | null) ?? ""
  const authors = authorsStr
    ? authorsStr.split(",").map((a) => a.trim()).filter(Boolean)
    : ["Unknown Author"]

  const pmid = (row.pmid as string | null) ?? undefined
  const doi = (row.doi as string | null) ?? undefined
  const year =
    typeof row.publication_year === "number"
      ? row.publication_year
      : new Date().getFullYear()

  return {
    id: pmid ?? doi ?? String(row.id),
    title: String(row.title ?? ""),
    authors: authors.length ? authors : ["Unknown Author"],
    year,
    journal: String(row.journal ?? ""),
    abstract: String(row.abstract ?? ""),
    isOpenAccess: Boolean(row.pdf_file_url ?? row.pdf_storage_path),
    doi,
    pmid,
    pdfUrl: undefined,
    source: pmid ? "PubMed" : "Preprint",
  }
}

type StagingListItem = {
  id: string
  title: string
  authors: string | null
  journal: string | null
  publication_year: number | null
  doi: string | null
  status: string
  relevance_rating: number | null
  pdf_storage_path: string | null | undefined
  pdf_import_status: string | null | undefined
  project: { id: string; name: string } | null
  experiment: { id: string; name: string } | null
  created_by_profile: { first_name: string; last_name: string } | null
}

function mapRowToListItem(row: StagingLiteratureRow): StagingListItem {
  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    authors: (row.authors as string | null) ?? null,
    journal: (row.journal as string | null) ?? null,
    publication_year: (row.publication_year as number | null) ?? null,
    doi: (row.doi as string | null) ?? null,
    status: String(row.status ?? "saved"),
    relevance_rating: (row.relevance_rating as number | null) ?? null,
    pdf_storage_path: (row.pdf_storage_path as string | null) ?? null,
    pdf_import_status: (row.pdf_import_status as string | null) ?? null,
    project: (row.project as StagingListItem["project"]) ?? null,
    experiment: (row.experiment as StagingListItem["experiment"]) ?? null,
    created_by_profile: (row.created_by_profile as StagingListItem["created_by_profile"]) ?? null,
  }
}

export function StagingTab({ stagedLiterature, onSavePaper }: StagingTabProps) {
  const router = useRouter()
  const items = useMemo(() => stagedLiterature.map(mapRowToListItem), [stagedLiterature])

  const [selectedLiteratureId, setSelectedLiteratureId] = useState<string | null>(null)
  const [selectedTab, setSelectedTab] = useState<"overview" | "pdf" | "citation" | "linked">("overview")
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [removeTarget, setRemoveTarget] = useState<StagingListItem | null>(null)
  const [bulkRemoveOpen, setBulkRemoveOpen] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)

  const handleOpenModal = (id: string, tab: "overview" | "pdf" | "citation" | "linked" = "overview") => {
    setSelectedLiteratureId(id)
    setSelectedTab(tab)
    setModalOpen(true)
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "outline"> = {
      saved: "outline",
      reading: "secondary",
      completed: "default",
      archived: "outline",
    }
    return variants[status] || "outline"
  }

  const renderStars = (rating: number | null) => {
    if (!rating) return <span className="text-xs text-muted-foreground">Not rated</span>
    return (
      <div className="flex items-center gap-0.5">
        {[...Array(5)].map((_, i) => (
          <Star
            key={i}
            className={`h-3 w-3 ${
              i < rating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"
            }`}
          />
        ))}
      </div>
    )
  }

  const visibleIds = items.map((lit) => lit.id)
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id))
  const someVisibleSelected =
    visibleIds.some((id) => selectedIds.includes(id)) && !allVisibleSelected

  const toggleSelected = (id: string, checked: boolean) => {
    setSelectedIds((c) => (checked ? [...c, id] : c.filter((i) => i !== id)))
  }

  const toggleSelectAllVisible = (checked: boolean) => {
    setSelectedIds((current) => {
      if (checked) return Array.from(new Set([...current, ...visibleIds]))
      return current.filter((id) => !visibleIds.includes(id))
    })
  }

  const removeFromStaging = async (ids: string[]) => {
    if (ids.length === 0) return
    setIsRemoving(true)
    try {
      for (const id of ids) {
        const result = await removeStagingLiterature(id)
        if (!result.success) {
          throw new Error("error" in result ? result.error : "Remove failed")
        }
      }
      setSelectedIds((c) => c.filter((id) => !ids.includes(id)))
      setRemoveTarget(null)
      setBulkRemoveOpen(false)
      toast.success(
        ids.length === 1 ? "Removed from staging" : `${ids.length} items removed from staging`
      )
      router.refresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to remove from staging")
    } finally {
      setIsRemoving(false)
    }
  }

  const pdfSubRow = (lit: StagingListItem) => {
    if (lit.pdf_storage_path) {
      return (
        <button
          type="button"
          onClick={() => handleOpenModal(lit.id, "pdf")}
          className="mt-1 flex items-center gap-1 text-xs text-[var(--n9-accent)] hover:underline"
        >
          <FileText className="h-3 w-3" />
          PDF attached
        </button>
      )
    }
    if (lit.pdf_import_status === "pending") {
      return (
        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Importing PDF…
        </p>
      )
    }
    if (lit.pdf_import_status === "failed") {
      return <p className="mt-1 text-xs text-destructive">PDF import failed</p>
    }
    if (lit.pdf_import_status === "none") {
      return <p className="mt-1 text-xs text-muted-foreground">No open-access PDF</p>
    }
    return null
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-foreground flex items-center gap-2">
                <Layers className="h-5 w-5" />
                Staging
              </CardTitle>
              <CardDescription>
                Same layout as My repository. Promote to the repository when ready; remove to delete the
                draft and its PDF.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="font-normal">
                {items.length} pending
              </Badge>
              {selectedIds.length > 0 && (
                <Button variant="destructive" size="sm" onClick={() => setBulkRemoveOpen(true)}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Remove selected ({selectedIds.length})
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {items.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[48px]">
                    <Checkbox
                      checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
                      onCheckedChange={(c) => toggleSelectAllVisible(c === true)}
                      aria-label="Select all staged references"
                    />
                  </TableHead>
                  <TableHead className="w-[350px]">Title</TableHead>
                  <TableHead className="w-[200px]">Authors</TableHead>
                  <TableHead className="w-[150px]">Journal & Year</TableHead>
                  <TableHead className="w-[100px]">Status</TableHead>
                  <TableHead className="w-[100px]">Rating</TableHead>
                  <TableHead className="w-[150px]">Linked To</TableHead>
                  <TableHead className="w-[140px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((lit) => (
                  <TableRow key={lit.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.includes(lit.id)}
                        onCheckedChange={(c) => toggleSelected(lit.id, c === true)}
                        aria-label={`Select ${lit.title}`}
                      />
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => handleOpenModal(lit.id)}
                        className="font-medium text-foreground hover:underline text-left truncate block max-w-[350px]"
                        title={lit.title}
                      >
                        {lit.title}
                      </button>
                      {lit.doi && (
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-xs text-muted-foreground">DOI: {lit.doi}</span>
                          <a
                            href={`https://doi.org/${lit.doi}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-foreground transition-colors"
                            title="Open DOI in new tab"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      )}
                      {pdfSubRow(lit)}
                    </TableCell>
                    <TableCell className="text-sm text-foreground">
                      {lit.authors ? (
                        <>
                          {lit.authors.split(",")[0]}
                          {lit.authors.split(",").length > 1 ? " et al." : ""}
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-foreground">
                      {lit.journal && lit.publication_year ? (
                        <>
                          <div className="font-medium">{lit.journal}</div>
                          <div className="text-xs text-muted-foreground">{lit.publication_year}</div>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={getStatusBadge(lit.status)}
                        className="text-xs capitalize"
                      >
                        {lit.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{renderStars(lit.relevance_rating)}</TableCell>
                    <TableCell>
                      {lit.project ? (
                        <Link
                          href={`/projects/${lit.project.id}`}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          {lit.project.name}
                        </Link>
                      ) : lit.experiment ? (
                        <Link
                          href={`/experiments/${lit.experiment.id}`}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          {lit.experiment.name}
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => handleOpenModal(lit.id)}>
                          View
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const raw = stagedLiterature.find((r) => String(r.id) === lit.id)
                            if (raw) onSavePaper(rowToSearchPaper(raw), lit.id)
                          }}
                          className="gap-1"
                        >
                          <Database className="h-4 w-4" />
                          Save
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:bg-rose-50 hover:text-rose-400 dark:hover:bg-rose-950/40 dark:hover:text-rose-300"
                          onClick={() => setRemoveTarget(lit)}
                          aria-label={`Remove ${lit.title} from staging`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed rounded-lg">
              <BookOpen className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
              <p className="text-muted-foreground mb-4">Staging is empty</p>
              <p className="text-sm text-muted-foreground">Use the Search tab to stage papers</p>
            </div>
          )}
        </CardContent>
      </Card>

      <LiteratureDetailModal
        literatureId={selectedLiteratureId}
        open={modalOpen}
        onOpenChange={setModalOpen}
        initialTab={selectedTab}
      />

      <AlertDialog
        open={Boolean(removeTarget)}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from staging?</AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget ? (
                <>
                  This removes <strong>{removeTarget.title}</strong> from staging and deletes its stored PDF
                  if any. This cannot be undone.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRemoving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                if (removeTarget) void removeFromStaging([removeTarget.id])
              }}
              disabled={isRemoving}
              className="bg-rose-300 text-rose-950 hover:bg-rose-400 dark:bg-rose-300 dark:text-rose-950 dark:hover:bg-rose-200"
            >
              {isRemoving ? "Removing…" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkRemoveOpen} onOpenChange={setBulkRemoveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {selectedIds.length} from staging?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the selected items from staging and delete their PDFs. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRemoving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void removeFromStaging(selectedIds)
              }}
              disabled={isRemoving || selectedIds.length === 0}
              className="bg-rose-300 text-rose-950 hover:bg-rose-400 dark:bg-rose-300 dark:text-rose-950 dark:hover:bg-rose-200"
            >
              {isRemoving ? "Removing…" : `Remove (${selectedIds.length})`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
