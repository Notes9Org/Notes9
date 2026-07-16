"use client"

import { useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { SearchPaper } from "@/types/paper-search"
import { BookOpen, Bookmark as BookmarkCheck, Bookmark as BookmarkPlus, ArrowSquareOut as ExternalLink, FileText, CircleNotch as Loader2, Trash as Trash2 } from "@phosphor-icons/react/ssr"
import { FlareIcon } from "@/components/ui/flare-icon"
import { LiteraturePdfPanel } from "./literature-pdf-panel"
import { UploadLiteraturePdfDialog } from "./upload-literature-pdf-dialog"
import { decodeHtmlEntities } from "@/lib/literature-abstract-display"
import { attachPaperToCatalyst } from "@/lib/catalyst-launch"
import { MotionReveal } from "@/components/literature-reviews/motion"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

export type StagingLiteratureRow = Record<string, unknown>

export type StagingListItem = {
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
  catalog_placement: string | null
  project: { id: string; name: string } | null
  experiment: { id: string; name: string } | null
  created_by_profile: { first_name: string; last_name: string } | null
}

export function mapRowToListItem(row: StagingLiteratureRow): StagingListItem {
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
    catalog_placement: (row.catalog_placement as string | null) ?? null,
    project: (row.project as StagingListItem["project"]) ?? null,
    experiment: (row.experiment as StagingListItem["experiment"]) ?? null,
    created_by_profile: (row.created_by_profile as StagingListItem["created_by_profile"]) ?? null,
  }
}

export function rowToSearchPaper(row: StagingListItem | StagingLiteratureRow): SearchPaper {
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
    isOpenAccess: Boolean((row as StagingListItem).pdf_file_url ?? row.pdf_storage_path),
    doi,
    pmid,
    pdfUrl: undefined,
    source: pmid ? "PubMed" : "Preprint",
  }
}

interface StagedPaperViewProps {
  lit: StagingListItem
  onSavePaper: (paper: SearchPaper, literatureId: string) => void | Promise<void>
  /** Discard this staged paper (opens the host's remove-confirm dialog). */
  onRemove?: () => void
  savingLiteratureId?: string | null
}

export function StagedPaperView({
  lit,
  onSavePaper,
  savingLiteratureId = null,
  onRemove,
}: StagedPaperViewProps) {
  // Persisted save state lives in `catalog_placement` (not `status`) — "repository"
  // means it's in the library, "staging" means it's a transient staged read.
  const isSavedToLibrary = (lit.catalog_placement ?? "repository") === "repository"
  const stagedExpiresAt = (lit as { staged_expires_at?: string | null }).staged_expires_at ?? null
  const stagedDaysLeft =
    !isSavedToLibrary && stagedExpiresAt
      ? Math.max(0, Math.ceil((new Date(stagedExpiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
      : null
  const isSaving = savingLiteratureId === lit.id
  const isClosedSource =
    !lit.pdf_storage_path &&
    (lit.pdf_import_status === "none" || lit.pdf_import_status === "failed")

  // When a PDF is available, auto-scroll the reader into view + center it so the
  // user lands on the paper without scrolling (e.g. after clicking "Read").
  const pdfCardRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!lit.pdf_storage_path) return
    // Single, stable scroll: aligning the section's TOP to the top is unaffected
    // by the PDF growing below, so one pass lands right — no double-scroll jump.
    const t = setTimeout(
      () => pdfCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      350,
    )
    return () => clearTimeout(t)
  }, [lit.id, lit.pdf_storage_path])

  // Ask Catalyst — this paper lives in the library/staging, so it attaches as an
  // @-mention TAG (via reviewId), identical to dragging it in from the library.
  // The agent resolves the id to the row's metadata + imported full text.
  const askCatalyst = () => {
    const paper = rowToSearchPaper(lit)
    const decodedTitle = lit.title ? decodeHtmlEntities(lit.title) : paper.title
    void attachPaperToCatalyst(
      { ...paper, title: decodedTitle },
      { scope: "literature", reviewId: lit.id },
    )
  }

  return (
    <MotionReveal className="space-y-6">
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-bold text-foreground">{lit.title ? decodeHtmlEntities(lit.title) : lit.title}</h3>
              {/* Saved-to-library status sits right beside the title (compact icon). */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void onSavePaper(rowToSearchPaper(lit), lit.id)}
                disabled={isSaving || isSavedToLibrary}
                title={isSavedToLibrary ? "Saved to your library" : "Save this paper to your library"}
                aria-label={isSavedToLibrary ? "Saved to library" : "Save to library"}
                className={cn(
                  "size-8 shrink-0 text-muted-foreground hover:text-foreground",
                  isSavedToLibrary &&
                    "text-emerald-600 hover:text-emerald-600 dark:text-emerald-400 dark:hover:text-emerald-400",
                )}
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isSavedToLibrary ? (
                  <BookmarkCheck className="h-4 w-4" />
                ) : (
                  <BookmarkPlus className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              {lit.authors ? decodeHtmlEntities(lit.authors) : "Unknown Author"} •{" "}
              {lit.journal ? decodeHtmlEntities(lit.journal) : "No journal"} (
              {lit.publication_year || "n.d."})
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {/* Compact Ask Catalyst — small ghost button so it doesn't crowd the header. */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => askCatalyst()}
              title="Ask Catalyst AI about this paper"
              className="gap-1.5 rounded-lg text-muted-foreground hover:text-foreground"
            >
              <FlareIcon className="h-4 w-4" />
              Ask Catalyst
            </Button>
            {/* Discard a staged paper. Hidden once saved — the library copy is
                deleted from the Repository tab, not here. */}
            {onRemove && !isSavedToLibrary ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onRemove()}
                title="Remove this paper from staging"
                className="gap-1.5 rounded-lg text-muted-foreground hover:text-rose-500"
              >
                <Trash2 className="h-4 w-4" />
                Remove
              </Button>
            ) : null}
          </div>
        </div>
        {!isSavedToLibrary ? (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <BookmarkPlus className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              You&apos;re just reading this — it isn&apos;t in your library yet.{" "}
              <span className="font-medium text-foreground">Save to library</span> to keep it.
            </span>
          </div>
        ) : null}
      </div>

      <div ref={pdfCardRef} className="scroll-mt-4">
      {lit.pdf_storage_path ? (
        /* PDF attached: Replace lives in the reader's single header row, so the
           document starts right at the top. */
        <LiteraturePdfPanel
          literatureId={lit.id}
          pdfUrl={`/api/literature/${lit.id}/viewer-pdf`}
          pdfFileName={lit.pdf_file_name || "paper.pdf"}
          openInNewTabFallbackUrl={`/api/literature/${lit.id}/viewer-pdf`}
          headerActions={
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
              triggerLabel=""
              triggerTitle="Replace PDF"
              triggerSize="icon"
              triggerClassName="h-8 w-8 sm:h-9 sm:w-9"
            />
          }
        />
      ) : (
      <Card>
        <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b pb-6">
          <div>
            <CardTitle className="text-lg">Paper Source & PDF</CardTitle>
            <CardDescription>
              Couldn&apos;t fetch an open-access PDF. Open via the links below, or upload one.
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
            triggerLabel="Upload PDF"
          />
        </CardHeader>
        <CardContent className="pt-6">
          {isClosedSource ? (
            <div className="rounded-xl border border-dashed bg-muted/20 px-8 py-12 text-center">
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <FileText className="h-6 w-6 text-muted-foreground" />
              </div>
              <h4 className="text-lg font-semibold text-foreground">No open-access PDF found</h4>
              <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
                The PDF link from your search result may be missing, blocked for server download,
                or require a browser session. Open it via the links below, or download it yourself
                and upload it here to read and annotate.
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
                    <a
                      href={`https://pubmed.ncbi.nlm.nih.gov/${lit.pmid}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
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
      )}
      </div>
    </MotionReveal>
  )
}
