"use client"

import { useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { SearchPaper } from "@/types/paper-search"
import { BookOpen, BookmarkCheck, BookmarkPlus, Bot, ExternalLink, FileText, Loader2 } from "lucide-react"
import { LiteraturePdfPanel } from "./literature-pdf-panel"
import { UploadLiteraturePdfDialog } from "./upload-literature-pdf-dialog"
import { decodeHtmlEntities } from "@/lib/literature-abstract-display"
import { openCatalystPanel } from "@/lib/catalyst-launch"
import { MotionReveal } from "@/components/literature-reviews/motion"

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
  savingLiteratureId?: string | null
}

export function StagedPaperView({
  lit,
  onSavePaper,
  savingLiteratureId = null,
}: StagedPaperViewProps) {
  const isSavedToLibrary = !["stage", "staged", "staging"].includes(String(lit.status ?? "").toLowerCase())
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

  const readWithCatalyst = () => {
    openCatalystPanel({
      scope: "literature",
      query: "Ask Catalyst about this paper.",
      attachments: lit.pdf_storage_path
        ? [{
            url: `/api/literature/${lit.id}/viewer-pdf`,
            name: lit.pdf_file_name || "paper.pdf",
            contentType: "application/pdf",
          }]
        : undefined,
      autoSend: false,
    })
  }

  return (
    <MotionReveal className="space-y-6">
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h3 className="text-xl font-bold text-foreground">{lit.title ? decodeHtmlEntities(lit.title) : lit.title}</h3>
            <p className="text-sm text-muted-foreground">
              {lit.authors ? decodeHtmlEntities(lit.authors) : "Unknown Author"} •{" "}
              {lit.journal ? decodeHtmlEntities(lit.journal) : "No journal"} (
              {lit.publication_year || "n.d."})
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={() => void onSavePaper(rowToSearchPaper(lit), lit.id)}
              disabled={Boolean(savingLiteratureId) || isSavedToLibrary}
              title="Keep this paper in your library"
              className="gap-2 bg-primary hover:bg-[var(--n9-accent-hover)]"
            >
              {savingLiteratureId === lit.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isSavedToLibrary ? (
                <BookmarkCheck className="h-4 w-4" />
              ) : (
                <BookmarkPlus className="h-4 w-4" />
              )}
              {isSavedToLibrary ? "Saved to library" : "Save to library"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 border-border/70 bg-background/80 text-foreground shadow-sm hover:bg-muted hover:text-foreground"
              onClick={readWithCatalyst}
              title="Read with Catalyst"
            >
              <Bot className="h-4 w-4" />
              Read with Catalyst
            </Button>
          </div>
        </div>
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
              triggerLabel="Replace"
              triggerSize="sm"
              triggerClassName="h-8 px-2.5 text-xs"
            />
          }
        />
      ) : (
      <Card>
        <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b pb-6">
          <div>
            <CardTitle className="text-lg">Paper Source & PDF</CardTitle>
            <CardDescription>
              Automatic import skipped or failed for this reference.
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
              <h4 className="text-lg font-semibold text-foreground">No PDF from search link</h4>
              <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
                Staging only pulls the PDF URL from your search result. That link may be missing,
                blocked for server download, or require a browser session. Download the PDF yourself
                if needed, then upload it here to read and annotate.
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
