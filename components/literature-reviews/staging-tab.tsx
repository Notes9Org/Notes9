import { useMemo, useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
import { removeStagingLiterature } from "@/app/(app)/literature-reviews/actions"
import { LITERATURE_DRAG_MIME } from "@/lib/catalyst-agent-types"
import { CATALYST_MENTION_DRAG_MIME } from "@/lib/catalyst-mention-types"
import { SearchPaper } from "@/types/paper-search"
import { BookOpen, Database, ExternalLink, FileText, Layers, Loader2, Star, Trash2, X, ChevronLeft, ChevronRight } from "lucide-react"
import { toast } from "sonner"
import { LiteraturePdfPanel } from "./literature-pdf-panel"
import { UploadLiteraturePdfDialog } from "./upload-literature-pdf-dialog"

export type StagingLiteratureRow = Record<string, unknown>

interface StagingTabProps {
  stagedLiterature: StagingLiteratureRow[]
  onSavePaper: (paper: SearchPaper, literatureId: string) => void | Promise<void>
  /** When set, Save to repository is in progress for this staged row id. */
  savingLiteratureId?: string | null
}

function rowToSearchPaper(row: StagingListItem | StagingLiteratureRow): SearchPaper {
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
    isOpenAccess: Boolean((row as any).pdf_file_url ?? row.pdf_storage_path),
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
  pmid: string | null
  status: string
  relevance_rating: number | null
  abstract: string | null
  pdf_storage_path: string | null
  pdf_import_status: string | null
  pdf_file_name: string | null
  pdf_file_url: string | null
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
    pmid: (row.pmid as string | null) ?? null,
    status: String(row.status ?? "saved"),
    relevance_rating: (row.relevance_rating as number | null) ?? null,
    abstract: (row.abstract as string | null) ?? null,
    pdf_storage_path: (row.pdf_storage_path as string | null) ?? null,
    pdf_import_status: (row.pdf_import_status as string | null) ?? null,
    pdf_file_name: (row.pdf_file_name as string | null) ?? null,
    pdf_file_url: (row.pdf_file_url as string | null) ?? null,
    project: (row.project as StagingListItem["project"]) ?? null,
    experiment: (row.experiment as StagingListItem["experiment"]) ?? null,
    created_by_profile: (row.created_by_profile as StagingListItem["created_by_profile"]) ?? null,
  }
}

export function StagingTab({
  stagedLiterature,
  onSavePaper,
  savingLiteratureId = null,
}: StagingTabProps) {
  const router = useRouter()
  const items = useMemo(() => stagedLiterature.map(mapRowToListItem), [stagedLiterature])

  const [activeTab, setActiveTab] = useState<string>("list")
  const [openTabs, setOpenTabs] = useState<string[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [removeTarget, setRemoveTarget] = useState<StagingListItem | null>(null)
  const [bulkRemoveOpen, setBulkRemoveOpen] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)
  const [isInitialized, setIsInitialized] = useState(false)

  // Load from localStorage on mount
  useEffect(() => {
    const savedTabs = localStorage.getItem("n9-staging-open-tabs")
    const savedActive = localStorage.getItem("n9-staging-active-tab")
    if (savedTabs) {
      try {
        setOpenTabs(JSON.parse(savedTabs))
      } catch (e) {
        console.error("Failed to load staging tabs", e)
      }
    }
    if (savedActive) setActiveTab(savedActive)
    setIsInitialized(true)
  }, [])

  // Sync to localStorage
  useEffect(() => {
    if (!isInitialized) return
    localStorage.setItem("n9-staging-open-tabs", JSON.stringify(openTabs))
  }, [openTabs, isInitialized])

  useEffect(() => {
    if (!isInitialized) return
    localStorage.setItem("n9-staging-active-tab", activeTab)
  }, [activeTab, isInitialized])

  // Sync open tabs if papers are removed
  useEffect(() => {
    if (!isInitialized) return
    const validIds = items.map((i) => i.id)
    const filtered = openTabs.filter((id) => validIds.includes(id))
    
    if (filtered.length !== openTabs.length) {
      setOpenTabs(filtered)
    }

    if (activeTab !== "list" && !validIds.includes(activeTab)) {
      setActiveTab("list")
    }
  }, [items, isInitialized])

  const handleOpenPaper = (id: string) => {
    if (!openTabs.includes(id)) {
      setOpenTabs((prev) => [...prev, id])
    }
    setActiveTab(id)
  }

  const handleCloseTab = (id: string, e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation()
    const nextTabs = openTabs.filter((t) => t !== id)
    setOpenTabs(nextTabs)
    if (activeTab === id) {
      setActiveTab("list")
    }
  }

  const scrollTabsRef = useRef<HTMLDivElement>(null)
  const [showLeftArrow, setShowLeftArrow] = useState(false)
  const [showRightArrow, setShowRightArrow] = useState(false)

  const checkScroll = () => {
    if (scrollTabsRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollTabsRef.current
      setShowLeftArrow(scrollLeft > 0)
      setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 2)
    }
  }

  useEffect(() => {
    checkScroll()
    window.addEventListener('resize', checkScroll)
    return () => window.removeEventListener('resize', checkScroll)
  }, [openTabs])

  const scrollTabs = (direction: 'left' | 'right') => {
    if (scrollTabsRef.current) {
      const scrollAmount = 250
      scrollTabsRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      })
    }
  }

  // Scroll active tab into view
  useEffect(() => {
    if (activeTab !== 'list' && scrollTabsRef.current) {
      const container = scrollTabsRef.current
      const activeElement = container.querySelector(`[data-value="${activeTab}"]`) as HTMLElement
      if (activeElement) {
        const containerRect = container.getBoundingClientRect()
        const activeRect = activeElement.getBoundingClientRect()
        
        if (activeRect.left < containerRect.left || activeRect.right > containerRect.right) {
          activeElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
        }
      }
    }
    checkScroll()
  }, [activeTab])

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

  const renderPaperView = (lit: StagingListItem) => {
    const isClosedSource = !lit.pdf_storage_path && (lit.pdf_import_status === "none" || lit.pdf_import_status === "failed")

    return (
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h3 className="text-xl font-bold text-foreground">{lit.title}</h3>
            <p className="text-sm text-muted-foreground">
              {lit.authors || "Unknown Author"} • {lit.journal || "No journal"} ({lit.publication_year || "n.d."})
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void onSavePaper(rowToSearchPaper(lit), lit.id)}
              disabled={Boolean(savingLiteratureId)}
              className="gap-2"
            >
              {savingLiteratureId === lit.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Database className="h-4 w-4" />
              )}
              Save to Repository
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:bg-rose-50 hover:text-rose-400 dark:hover:bg-rose-950/40 dark:hover:text-rose-300"
              onClick={() => setRemoveTarget(lit)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Remove
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b pb-6">
            <div>
              <CardTitle className="text-lg">Paper Source & PDF</CardTitle>
              <CardDescription>
                {lit.pdf_storage_path 
                  ? "View and annotate the paper PDF inline." 
                  : "Automatic import skipped or failed for this reference."}
              </CardDescription>
            </div>
            <UploadLiteraturePdfDialog
              literatureReviews={[
                {
                  id: lit.id,
                  title: lit.title,
                  authors: lit.authors,
                  journal: lit.journal,
                  publication_year: lit.publication_year,
                  doi: lit.doi,
                  pmid: lit.pmid,
                  pdf_storage_path: lit.pdf_storage_path,
                  pdf_file_name: lit.pdf_file_name,
                },
              ]}
              currentLiterature={{
                id: lit.id,
                title: lit.title,
                authors: lit.authors,
                journal: lit.journal,
                publication_year: lit.publication_year,
                doi: lit.doi,
                pmid: lit.pmid,
                pdf_storage_path: lit.pdf_storage_path,
                pdf_file_name: lit.pdf_file_name,
              }}
              triggerLabel={lit.pdf_storage_path ? "Replace PDF" : "Upload PDF"}
            />
          </CardHeader>
          <CardContent className="pt-6">
            {lit.pdf_storage_path ? (
              <LiteraturePdfPanel
                literatureId={lit.id}
                pdfUrl={`/api/literature/${lit.id}/viewer-pdf`}
                pdfFileName={lit.pdf_file_name || "paper.pdf"}
                openInNewTabFallbackUrl={lit.pdf_file_url ?? undefined}
              />
            ) : isClosedSource ? (
              <div className="rounded-xl border border-dashed bg-muted/20 px-8 py-12 text-center">
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <FileText className="h-6 w-6 text-muted-foreground" />
                </div>
                <h4 className="text-lg font-semibold text-foreground">No PDF from search link</h4>
                <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
                  Staging only pulls the PDF URL from your search result. That link may be missing, blocked for
                  server download, or require a browser session. Download the PDF yourself if needed, then upload
                  it here to read and annotate.
                </p>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
                  {lit.doi && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={`https://doi.org/${lit.doi}`} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="mr-2 h-4 w-4" />
                        View via DOI
                      </a>
                    </Button>
                  )}
                  {lit.pmid && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={`https://pubmed.ncbi.nlm.nih.gov/${lit.pmid}/`} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="mr-2 h-4 w-4" />
                        View on PubMed
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            ) : lit.pdf_import_status === "pending" ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Loader2 className="h-10 w-10 animate-spin text-[var(--n9-accent)] mb-4" />
                <p className="text-muted-foreground">Importing Open Access PDF...</p>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed px-8 py-12 text-center text-muted-foreground">
                <BookOpen className="mx-auto h-12 w-12 opacity-20 mb-4" />
                <p>No PDF attached yet.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex items-center justify-between gap-4 border-b">
          <div className="relative group transition-all flex-1 overflow-hidden">
            {showLeftArrow && (
              <div className="absolute left-0 top-0 bottom-0 z-20 flex items-center bg-gradient-to-r from-background via-background/80 to-transparent pr-10 pointer-events-none">
                <Button
                  variant="ghost"
                  size="icon"
                className="h-8 w-8 rounded-full shadow-lg bg-background border pointer-events-auto hover:bg-muted ml-0.5 transform translate-y-[1.5px]"
                  onClick={() => scrollTabs('left')}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </div>
            )}

            <div
              ref={scrollTabsRef}
              className="overflow-x-auto no-scrollbar scroll-smooth"
              onScroll={checkScroll}
            >
              <TabsList className="bg-transparent h-auto p-0 flex items-center justify-start border-none flex-nowrap w-max min-w-full relative">
              <div className="w-2 flex-shrink-0" />
                <TabsTrigger
                  value="list"
                  data-value="list"
                  className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-[var(--n9-accent)] data-[state=active]:text-foreground rounded-none border-b-2 border-transparent px-4 py-2 bg-transparent text-muted-foreground transition-none shadow-none font-semibold"
                >
                  <Layers className="h-4 w-4 mr-2" />
                  All Staged
                  {items.length > 0 && (
                    <Badge variant="secondary" className="ml-2 px-1 py-0 min-w-[1.25rem] h-5 justify-center">
                      {items.length}
                    </Badge>
                  )}
                </TabsTrigger>
                {openTabs.map((id) => {
                  const lit = items.find((i) => i.id === id)
                  if (!lit) return null
                  return (
                    <TabsTrigger
                      key={id}
                      value={id}
                      data-value={id}
                      className="group relative data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-[var(--n9-accent)] data-[state=active]:text-foreground rounded-none border-b-2 border-transparent px-4 py-2 bg-transparent text-muted-foreground transition-none shadow-none max-w-[220px] flex items-center gap-1"
                    >
                      <span className="truncate text-sm font-semibold">{lit.title}</span>
                      <button
                        type="button"
                        onClick={(e) => handleCloseTab(id, e)}
                        className="flex-shrink-0 p-1 rounded-md hover:bg-muted text-muted-foreground/60 hover:text-rose-500 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </TabsTrigger>
                  )
                })}
                <div className="w-10 flex-shrink-0" />
              </TabsList>
            </div>

            {showRightArrow && (
              <div className="absolute right-0 top-0 bottom-0 z-20 flex items-center bg-gradient-to-l from-background via-background/80 to-transparent pl-10 pointer-events-none">
                <Button
                  variant="ghost"
                  size="icon"
                className="h-8 w-8 rounded-full shadow-lg bg-background border pointer-events-auto hover:bg-muted mr-0.5 transform translate-y-[1.5px]"
                  onClick={() => scrollTabs('right')}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          {activeTab === "list" && selectedIds.length > 0 && (
            <div className="flex items-center gap-2 mb-1 px-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setBulkRemoveOpen(true)}
                className="bg-rose-50 text-rose-600 border border-rose-100 font-semibold hover:bg-rose-100 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-900/10 dark:hover:bg-rose-900/30"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Remove ({selectedIds.length})
              </Button>
            </div>
          )}
        </div>

        <div className="mt-6">
          <TabsContent value="list" className="m-0 border-none p-0">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Staging Inventory</CardTitle>
                    <CardDescription>
                      Review gathered references before saving to your repository.
                    </CardDescription>
                  </div>
                  <Badge variant="secondary" className="font-normal">
                    {items.length} total
                  </Badge>
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
                            className="data-[state=checked]:bg-rose-50 data-[state=checked]:text-rose-600 data-[state=checked]:border-rose-200 dark:data-[state=checked]:bg-rose-950/30 dark:data-[state=checked]:text-rose-400 dark:data-[state=checked]:border-rose-900/30"
                          />
                        </TableHead>
                        <TableHead>Title</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-left">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((lit) => (
                        <TableRow
                          key={lit.id}
                          draggable
                          className="cursor-grab active:cursor-grabbing"
                          onDragStart={(e) => {
                            e.dataTransfer.setData(
                              LITERATURE_DRAG_MIME,
                              JSON.stringify({ id: lit.id, title: lit.title })
                            )
                            e.dataTransfer.setData(
                              CATALYST_MENTION_DRAG_MIME,
                              JSON.stringify({
                                kind: "literature_review",
                                id: lit.id,
                                title: lit.title,
                              })
                            )
                            e.dataTransfer.effectAllowed = "copy"
                          }}
                        >
                          <TableCell>
                            <Checkbox
                              checked={selectedIds.includes(lit.id)}
                              onCheckedChange={(c) => toggleSelected(lit.id, c === true)}
                              className="data-[state=checked]:bg-rose-50 data-[state=checked]:text-rose-600 data-[state=checked]:border-rose-200 dark:data-[state=checked]:bg-rose-950/30 dark:data-[state=checked]:text-rose-400 dark:data-[state=checked]:border-rose-900/30"
                            />
                          </TableCell>
                          <TableCell>
                            <button
                              onClick={() => handleOpenPaper(lit.id)}
                              className="font-medium text-foreground hover:underline text-left block max-w-md truncate"
                            >
                              {lit.title}
                            </button>
                            <p className="text-xs text-muted-foreground truncate max-w-md">
                              {lit.authors || "—"}
                            </p>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <span className="text-xs font-medium">{lit.journal || "—"}</span>
                              <span className="text-[10px] text-muted-foreground">{lit.publication_year || "—"}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={getStatusBadge(lit.status)} className="capitalize text-[10px]">
                              {lit.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-left">
                            <div className="flex justify-start gap-1">
                              <Button variant="ghost" size="sm" onClick={() => handleOpenPaper(lit.id)}>
                                Open
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={Boolean(savingLiteratureId)}
                                onClick={() => void onSavePaper(rowToSearchPaper(lit), lit.id)}
                              >
                                {savingLiteratureId === lit.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  "Save"
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-rose-400"
                                onClick={() => setRemoveTarget(lit)}
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
                    <p className="text-muted-foreground">Staging is empty</p>
                    <p className="text-sm text-muted-foreground font-sans">Use the Search tab to gather papers.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {openTabs.map((id) => {
            const lit = items.find((i) => i.id === id)
            if (!lit) return null
            return (
              <TabsContent key={id} value={id} className="m-0 border-none p-0">
                {renderPaperView(lit)}
              </TabsContent>
            )
          })}
        </div>
      </Tabs>

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
              className="bg-rose-50 text-rose-600 border border-rose-100 font-semibold hover:bg-rose-100 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-900/10 dark:hover:bg-rose-900/30"
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
              className="bg-rose-50 text-rose-600 border border-rose-100 font-semibold hover:bg-rose-100 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-900/10 dark:hover:bg-rose-900/30"
            >
              {isRemoving ? "Removing…" : `Remove (${selectedIds.length})`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
