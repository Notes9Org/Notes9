"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Star, ExternalLink } from "lucide-react";
import Link from "next/link";
import { LiteratureReviewActions } from "@/app/(app)/literature-reviews/[id]/literature-review-actions";
import { UploadLiteraturePdfDialog } from "@/components/literature-reviews/upload-literature-pdf-dialog";
import { LiteraturePdfPanel } from "@/components/literature-reviews/literature-pdf-panel";

const PUBLIC_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://notes9.com";
const NLM_PMC_OA_WEB_SERVICE = "https://pmc.ncbi.nlm.nih.gov/tools/oa-service/";
const NLM_EUTILS_OVERVIEW = "https://www.ncbi.nlm.nih.gov/books/NBK25501/";

interface LiteratureData {
  id: string;
  title: string;
  authors: string | null;
  journal: string | null;
  publication_year: number | null;
  doi: string | null;
  pmid: string | null;
  status: string;
  relevance_rating: number | null;
  abstract: string | null;
  keywords: string[] | null;
  personal_notes: string | null;
  url: string | null;
  volume: string | null;
  issue: string | null;
  pages: string | null;
  pdf_file_url: string | null;
  pdf_file_name: string | null;
  pdf_file_size: number | null;
  pdf_file_type: string | null;
  pdf_storage_path: string | null;
  pdf_uploaded_at: string | null;
  pdf_checksum: string | null;
  pdf_match_source: string | null;
  pdf_metadata: Record<string, unknown> | null;
  pdf_import_status?: string | null;
  created_at: string;
  project: { id: string; name: string } | null;
  experiment: { id: string; name: string } | null;
  created_by_profile: {
    first_name: string;
    last_name: string;
    email: string;
  } | null;
}

interface LiteratureDetailViewProps {
  literature: LiteratureData;
  showBreadcrumb?: boolean;
  showActions?: boolean;
  onRefresh?: () => void;
  initialTab?: "overview" | "pdf" | "citation" | "linked";
}

export function LiteratureDetailView({
  literature,
  showBreadcrumb = true,
  showActions = true,
  onRefresh,
  initialTab = "overview",
}: LiteratureDetailViewProps) {
  const formatDate = (date: string | null) => {
    if (!date) return "—";
    return new Date(date).toLocaleDateString();
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "outline"> = {
      saved: "outline",
      reading: "secondary",
      completed: "default",
      archived: "outline",
    };
    return variants[status] || "outline";
  };

  const renderStars = (rating: number | null) => {
    if (!rating)
      return <span className="text-sm text-muted-foreground">Not rated</span>;
    return (
      <div className="flex items-center gap-0.5">
        {[...Array(5)].map((_, i) => (
          <Star
            key={i}
            className={`h-4 w-4 ${
              i < rating
                ? "fill-yellow-400 text-yellow-400"
                : "text-muted-foreground"
            }`}
          />
        ))}
      </div>
    );
  };

  const formatCitation = (format: "apa" | "mla" | "bibtex") => {
    const authors = literature.authors || "Unknown";
    const year = literature.publication_year || "n.d.";
    const title = literature.title;
    const journal = literature.journal || "";
    const volume = literature.volume || "";
    const issue = literature.issue || "";
    const pages = literature.pages || "";
    const doi = literature.doi || "";

    if (format === "apa") {
      let citation = `${authors} (${year}). ${title}.`;
      if (journal) citation += ` ${journal}`;
      if (volume) citation += `, ${volume}`;
      if (issue) citation += `(${issue})`;
      if (pages) citation += `, ${pages}`;
      if (doi) citation += `. https://doi.org/${doi}`;
      return citation;
    } else if (format === "mla") {
      let citation = `${authors}. "${title}."`;
      if (journal) citation += ` ${journal}`;
      if (volume) citation += `, vol. ${volume}`;
      if (issue) citation += `, no. ${issue}`;
      if (year) citation += `, ${year}`;
      if (pages) citation += `, pp. ${pages}`;
      return citation + ".";
    } else if (format === "bibtex") {
      const bibKey = authors.split(",")[0].toLowerCase() + year;
      return `@article{${bibKey},
  author = {${authors}},
  title = {${title}},
  journal = {${journal}},
  year = {${year}},
  volume = {${volume}},
  number = {${issue}},
  pages = {${pages}},
  doi = {${doi}}
}`;
    }
    return "";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4 flex-1">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-3xl font-bold tracking-tight text-foreground">
                {literature.title}
              </h1>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Badge
                variant={getStatusBadge(literature.status)}
                className="capitalize"
              >
                {literature.status}
              </Badge>
              {renderStars(literature.relevance_rating)}
            </div>
          </div>
        </div>
        {showActions && (
          <LiteratureReviewActions
            literature={literature}
            onRefresh={onRefresh}
          />
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue={initialTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="pdf">PDF</TabsTrigger>
          <TabsTrigger value="citation">Citation</TabsTrigger>
          <TabsTrigger value="linked">Linked Research</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Citation Details */}
          <Card>
            <CardHeader>
              <CardTitle>Citation Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Authors
                  </p>
                  <p className="text-sm text-foreground">
                    {literature.authors || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Journal
                  </p>
                  <p className="text-sm text-foreground">
                    {literature.journal || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Year
                  </p>
                  <p className="text-sm text-foreground">
                    {literature.publication_year || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Volume/Issue
                  </p>
                  <p className="text-sm text-foreground">
                    {literature.volume && literature.issue
                      ? `${literature.volume}(${literature.issue})`
                      : literature.volume || literature.issue || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Pages
                  </p>
                  <p className="text-sm text-foreground">
                    {literature.pages || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    DOI
                  </p>
                  {literature.doi ? (
                    <a
                      href={`https://doi.org/${literature.doi}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                    >
                      {literature.doi}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <p className="text-sm text-foreground">—</p>
                  )}
                </div>
              </div>
              {literature.url && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    URL
                  </p>
                  <a
                    href={literature.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                  >
                    {literature.url}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Abstract */}
          {literature.abstract && (
            <Card>
              <CardHeader>
                <CardTitle>Abstract</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-foreground whitespace-pre-wrap">
                  {literature.abstract}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Keywords */}
          {literature.keywords && literature.keywords.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Keywords</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {literature.keywords.map((keyword: string, index: number) => (
                    <Badge key={index} variant="secondary">
                      {keyword}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Personal Notes */}
          {literature.personal_notes && (
            <Card>
              <CardHeader>
                <CardTitle>Personal Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-foreground whitespace-pre-wrap">
                  {literature.personal_notes}
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="pdf" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>Paper PDF</CardTitle>
                <CardDescription>
                  Upload the paper PDF, view it inline, and keep highlights or notes attached to this reference.
                </CardDescription>
              </div>
              <UploadLiteraturePdfDialog
                literatureReviews={[
                  {
                    id: literature.id,
                    title: literature.title,
                    authors: literature.authors,
                    journal: literature.journal,
                    publication_year: literature.publication_year,
                    doi: literature.doi,
                    pmid: literature.pmid,
                    pdf_storage_path: literature.pdf_storage_path,
                    pdf_file_name: literature.pdf_file_name,
                  },
                ]}
                currentLiterature={{
                  id: literature.id,
                  title: literature.title,
                  authors: literature.authors,
                  journal: literature.journal,
                  publication_year: literature.publication_year,
                  doi: literature.doi,
                  pmid: literature.pmid,
                  pdf_storage_path: literature.pdf_storage_path,
                  pdf_file_name: literature.pdf_file_name,
                }}
                triggerLabel={literature.pdf_storage_path ? "Replace PDF" : "Upload PDF"}
              />
            </CardHeader>
            <CardContent className="space-y-4">
              {literature.pdf_import_status === "pending" && !literature.pdf_storage_path && (
                <div className="rounded-lg border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
                  Importing PDF…
                </div>
              )}
              {literature.pdf_import_status === "failed" && !literature.pdf_storage_path && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-6 text-center text-sm space-y-2">
                  <p className="text-destructive">
                    Automatic import could not download an open-access PDF from PubMed Central. NLM
                    may require a browser for some files, or the fetch mirrors returned no PDF bytes.
                  </p>
                  <p className="text-muted-foreground">
                    Notes9 only auto-imports articles in the{" "}
                    <a
                      href={NLM_PMC_OA_WEB_SERVICE}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline underline-offset-4"
                    >
                      PMC open-access subset
                    </a>
                    . Closed-access articles are yours to attach. Upload a PDF below if you have it.
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-muted-foreground pt-1">
                    {literature.pmid?.trim() ? (
                      <a
                        href={`https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(literature.pmid.trim())}/`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-primary underline underline-offset-4"
                      >
                        View on PubMed
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : null}
                    <a
                      href={NLM_EUTILS_OVERVIEW}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary underline underline-offset-4"
                    >
                      NLM E-utilities overview
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    <a
                      href={PUBLIC_SITE_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary underline underline-offset-4"
                    >
                      {PUBLIC_SITE_URL.replace(/^https?:\/\//, "")}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              )}
              {literature.pdf_import_status === "none" && !literature.pdf_storage_path && (
                <div className="rounded-lg border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground space-y-2">
                  {literature.pdf_metadata &&
                  typeof literature.pdf_metadata === "object" &&
                  "not_pmc_open_access_subset" in literature.pdf_metadata &&
                  literature.pdf_metadata.not_pmc_open_access_subset ? (
                    <p>
                      This PMID links to PubMed Central, but the article is{" "}
                      <strong className="text-foreground font-medium">not</strong> in the PMC
                      open-access subset. Automatic import is open-access only — upload the PDF if your
                      library or subscription provides it.
                    </p>
                  ) : literature.pdf_metadata &&
                    typeof literature.pdf_metadata === "object" &&
                    "pmc_oa_check_failed" in literature.pdf_metadata &&
                    literature.pdf_metadata.pmc_oa_check_failed ? (
                    <p>
                      Could not reach NLM to confirm open-access status. Try staging or saving again
                      later, or upload the PDF below.
                    </p>
                  ) : (
                    <p>
                      No PMC id was found for this PubMed record, so automatic import was skipped
                      (PMC open-access subset only). You can upload a PDF below.
                    </p>
                  )}
                  <p className="text-xs">
                    <a
                      href={PUBLIC_SITE_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary underline underline-offset-4"
                    >
                      {PUBLIC_SITE_URL.replace(/^https?:\/\//, "")}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </p>
                </div>
              )}
              {literature.pdf_storage_path ? (
                <>
                  <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2 text-foreground">
                      <FileText className="h-4 w-4" />
                      {literature.pdf_file_name || "Attached PDF"}
                    </div>
                    {literature.pdf_uploaded_at && (
                      <span>Uploaded {formatDate(literature.pdf_uploaded_at)}</span>
                    )}
                    {literature.pdf_match_source && (
                      <Badge variant="outline">{literature.pdf_match_source}</Badge>
                    )}
                  </div>
                  <LiteraturePdfPanel
                    literatureId={literature.id}
                    pdfUrl={`/api/literature/${literature.id}/viewer-pdf`}
                    pdfFileName={literature.pdf_file_name}
                    openInNewTabFallbackUrl={literature.pdf_file_url ?? undefined}
                  />
                </>
              ) : !["pending", "failed", "none"].includes(String(literature.pdf_import_status)) ? (
                <div className="rounded-lg border border-dashed px-6 py-10 text-center">
                  <FileText className="mx-auto h-10 w-10 text-muted-foreground" />
                  <p className="mt-4 text-sm text-muted-foreground">
                    No PDF is attached yet. Upload the paper PDF to read and annotate it inside Notes9.
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="citation" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>APA Format</CardTitle>
            </CardHeader>
            <CardContent>
              <code className="text-sm text-foreground block bg-muted p-4 rounded">
                {formatCitation("apa")}
              </code>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>MLA Format</CardTitle>
            </CardHeader>
            <CardContent>
              <code className="text-sm text-foreground block bg-muted p-4 rounded">
                {formatCitation("mla")}
              </code>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>BibTeX</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-sm text-foreground block bg-muted p-4 rounded overflow-x-auto">
                {formatCitation("bibtex")}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="linked" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Linked Research</CardTitle>
              <CardDescription>
                Projects and experiments using this reference
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {literature.project ? (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-2">
                    Project
                  </p>
                  <Link
                    href={`/projects/${literature.project.id}`}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    {literature.project.name}
                  </Link>
                </div>
              ) : null}

              {literature.experiment ? (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-2">
                    Experiment
                  </p>
                  <Link
                    href={`/experiments/${literature.experiment.id}`}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    {literature.experiment.name}
                  </Link>
                </div>
              ) : null}

              {!literature.project && !literature.experiment && (
                <p className="text-sm text-muted-foreground">
                  This reference is not linked to any projects or experiments
                  yet.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
