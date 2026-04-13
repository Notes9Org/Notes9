"use client";

import { useState, useEffect, useRef, useMemo, Suspense } from "react";
import { useHighlightNavigation } from "@/hooks/use-highlight-navigation";
import {
  DOCUMENT_HIGHLIGHT_EVENT,
  normalizeAgentSourceType,
  type HighlightTarget,
} from "@/lib/document-highlight";
import { fuzzyFindExcerpt } from "@/lib/fuzzy-text-match";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileText, Star, ExternalLink, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { LiteratureReviewActions } from "@/app/(app)/literature-reviews/[id]/literature-review-actions";
import { UploadLiteraturePdfDialog } from "@/components/literature-reviews/upload-literature-pdf-dialog";
import { LiteraturePdfPanel } from "@/components/literature-reviews/literature-pdf-panel";
import { formatLiteratureAbstractPlain } from "@/lib/literature-abstract-display";

const NLM_PMC_OA_WEB_SERVICE = "https://pmc.ncbi.nlm.nih.gov/tools/oa-service/";
const NLM_EUTILS_OVERVIEW = "https://www.ncbi.nlm.nih.gov/books/NBK25501/";

function LiteratureAbstractHighlight({
  plainText,
  excerpt,
}: {
  plainText: string;
  excerpt: string | null;
}) {
  const markRef = useRef<HTMLElement | null>(null);
  const match = useMemo(() => {
    const q = excerpt?.trim();
    if (!q) return null;
    return fuzzyFindExcerpt(plainText, q);
  }, [plainText, excerpt]);

  useEffect(() => {
    if (!match || !markRef.current) return;
    markRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [match]);

  if (!match) {
    return (
      <p className="text-sm text-foreground whitespace-pre-wrap">{plainText}</p>
    );
  }
  const before = plainText.slice(0, match.start);
  const hl = plainText.slice(match.start, match.end);
  const after = plainText.slice(match.end);
  return (
    <p className="text-sm text-foreground whitespace-pre-wrap">
      {before}
      <mark ref={markRef} className="rag-chunk-highlight rounded px-0.5">
        {hl}
      </mark>
      {after}
    </p>
  );
}

function literatureHighlightForRow(
  literatureId: string,
  target: HighlightTarget | null,
): HighlightTarget | null {
  if (!target) return null;
  if (normalizeAgentSourceType(target.sourceType) !== "literature_review") {
    return null;
  }
  if (target.sourceId !== literatureId) return null;
  return target;
}

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

function LiteratureDetailViewInner({
  literature,
  showBreadcrumb = true,
  showActions = true,
  onRefresh,
  initialTab = "overview",
}: LiteratureDetailViewProps) {
  const { highlightTarget } = useHighlightNavigation();
  const [inlineHighlightTarget, setInlineHighlightTarget] =
    useState<HighlightTarget | null>(null);
  const litHighlight = literatureHighlightForRow(literature.id, highlightTarget);
  const inlineLitHighlight = literatureHighlightForRow(
    literature.id,
    inlineHighlightTarget,
  );
  const activeLitHighlight = inlineLitHighlight ?? litHighlight;
  const highlightSurface = activeLitHighlight
    ? activeLitHighlight.contentSurface ?? "pdf"
    : null;

  const [activeTab, setActiveTab] = useState<string>(initialTab);

  // Deep-link: switch tab for RAG highlight (abstract → Overview, body/PDF → PDF)
  useEffect(() => {
    if (!activeLitHighlight) {
      setActiveTab(initialTab);
      return;
    }
    setActiveTab(highlightSurface === "abstract" ? "overview" : "pdf");
  }, [initialTab, activeLitHighlight, highlightSurface]);

  useEffect(() => {
    const onHighlight = (event: Event) => {
      const target = literatureHighlightForRow(
        literature.id,
        (event as CustomEvent<HighlightTarget>).detail,
      );
      if (!target) return;
      event.preventDefault();
      setInlineHighlightTarget(target);
    };
    window.addEventListener(DOCUMENT_HIGHLIGHT_EVENT, onHighlight as EventListener);
    return () => {
      window.removeEventListener(
        DOCUMENT_HIGHLIGHT_EVENT,
        onHighlight as EventListener,
      );
    };
  }, [literature.id]);
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

  const [selectedCitationFormat, setSelectedCitationFormat] = useState("apa");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    toast.success("Citation copied to clipboard");
  };

  const formatCitation = (format: string) => {
    const authors = literature.authors || "Unknown Authors";
    const year = literature.publication_year || "n.d.";
    const title = literature.title;
    const journal = literature.journal || "";
    const volume = literature.volume || "";
    const issue = literature.issue || "";
    const pages = literature.pages || "";
    const doi = literature.doi || "";

    const cleanAuthors = authors.trim();
    const firstAuthor = cleanAuthors.split(',')[0].trim().split(' ').pop() || "author";

    switch (format) {
      case "apa":
        return `${cleanAuthors} (${year}). ${title}. ${journal}${volume ? `, ${volume}` : ""}${issue ? `(${issue})` : ""}${pages ? `, ${pages}` : ""}.${doi ? ` https://doi.org/${doi}` : ""}`;
      case "mla":
        return `${cleanAuthors}. "${title}." ${journal}${volume ? `, vol. ${volume}` : ""}${issue ? `, no. ${issue}` : ""}${year ? `, ${year}` : ""}${pages ? `, pp. ${pages}` : ""}.${doi ? ` doi:${doi}` : ""}`;
      case "chicago_ad":
        return `${cleanAuthors}. ${year}. "${title}." ${journal} ${volume}${issue ? ` (${issue})` : ""}: ${pages || ""}.${doi ? ` https://doi.org/${doi}` : ""}`;
      case "chicago_nb":
        return `${cleanAuthors}. "${title}." ${journal} ${volume}${issue ? `, no. ${issue}` : ""} (${year}): ${pages || ""}.${doi ? ` https://doi.org/${doi}` : ""}`;
      case "harvard":
        return `${cleanAuthors} (${year}) '${title}', ${journal}, ${volume}${issue ? `(${issue})` : ""}${pages ? `, pp. ${pages}` : ""}.`;
      case "vancouver":
        return `${cleanAuthors.replace(/,/g, '')}. ${title}. ${journal}. ${year};${volume}${issue ? `(${issue})` : ""}:${pages || ""}.`;
      case "ieee":
        return `[1] ${cleanAuthors}, "${title}," ${journal}, vol. ${volume}, no. ${issue}, pp. ${pages}, ${year}.`;
      case "ama":
        return `${cleanAuthors}. ${title}. ${journal}. ${year};${volume}${issue ? `(${issue})` : ""}:${pages || ""}.`;
      case "nature":
        return `${cleanAuthors}. ${title}. ${journal} ${volume}, ${pages} (${year}).`;
      case "science":
        return `${cleanAuthors}, ${title}. ${journal} ${volume}, ${pages} (${year}).`;
      case "bibtex":
        const bibKey = firstAuthor.toLowerCase() + year;
        return `@article{${bibKey},
  author = {${cleanAuthors}},
  title = {${title}},
  journal = {${journal}},
  year = {${year}},
  volume = {${volume}},
  number = {${issue}},
  pages = {${pages}},
  doi = {${doi}}
}`;
      case "ris":
        const startPage = pages.split("-")[0] || "";
        const endPage = pages.split("-")[1] || "";
        return `TY  - JOUR
AU  - ${cleanAuthors.replace(/,/g, "\nAU  - ")}
TI  - ${title}
JO  - ${journal}
PY  - ${year}
VL  - ${volume}
IS  - ${issue}
SP  - ${startPage}
EP  - ${endPage}
DO  - ${doi}
ER  - `;
      case "apa6":
        return `${cleanAuthors} (${year}). ${title}. ${journal}, ${volume}${issue ? `(${issue})` : ""}, ${pages}.${doi ? ` doi:${doi}` : ""}`;
      case "cse":
        return `${cleanAuthors}. ${title}. ${journal}. ${year};${volume}${issue ? `(${issue})` : ""}:${pages || ""}.`;
      case "asa":
        return `${cleanAuthors}. ${year}. "${title}." ${journal} ${volume}${issue ? `(${issue})` : ""}:${pages || ""}.`;
      case "aps":
        return `${cleanAuthors}, ${journal} ${volume}, ${pages} (${year}).`;
      case "aip":
        return `${cleanAuthors}, ${journal} ${volume}, ${pages} (${year}).`;
      default:
        return "";
    }
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
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
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
                {activeLitHighlight && highlightSurface === "abstract" ? (
                  <LiteratureAbstractHighlight
                    plainText={formatLiteratureAbstractPlain(
                      literature.abstract,
                    )}
                    excerpt={activeLitHighlight.excerpt}
                  />
                ) : (
                  <p className="text-sm text-foreground whitespace-pre-wrap">
                    {formatLiteratureAbstractPlain(literature.abstract)}
                  </p>
                )}
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
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-8 text-center text-sm space-y-4">
                  <p className="text-destructive font-medium">
                    Automatic ingestion could not locate an open-access version of this paper.
                  </p>
                  
                  {literature.doi ? (
                    <div className="flex flex-col items-center gap-4">
                      <p className="text-muted-foreground max-w-md mx-auto">
                        Please use the following steps to manually add the paper to your library:
                      </p>
                      
                      <div className="flex flex-col gap-3 items-center">
                        <div className="flex items-center gap-3">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-destructive/10 text-[10px] font-bold text-destructive border border-destructive/20">1</span>
                          <a
                            href={`https://doi.org/${literature.doi}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-primary hover:underline font-semibold text-base"
                          >
                            Access via DOI to download PDF
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </div>
                        
                        <div className="flex items-center gap-3">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-destructive/10 text-[10px] font-bold text-destructive border border-destructive/20">2</span>
                          <p className="text-muted-foreground font-medium">
                            Use the <span className="text-foreground">"Upload PDF"</span> button above to save the file.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">
                      No PDF is currently attached. You can upload a PDF below if you have the file.
                    </p>
                  )}
                </div>
              )}
              {literature.pdf_import_status === "none" && !literature.pdf_storage_path && (
                <div className="rounded-lg border bg-muted/20 px-4 py-8 text-center text-sm space-y-4">
                  {literature.doi ? (
                    <div className="flex flex-col items-center gap-4">
                      <p className="text-muted-foreground max-w-md mx-auto">
                        This paper is currently not available for direct download. Please use the following steps to add it to your library:
                      </p>
                      
                      <div className="flex flex-col gap-3 items-center">
                        <div className="flex items-center gap-3">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary border border-primary/20">1</span>
                          <a
                            href={`https://doi.org/${literature.doi}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-primary hover:underline font-semibold text-base"
                          >
                            Access via DOI to download PDF
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </div>
                        
                        <div className="flex items-center gap-3">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary border border-primary/20">2</span>
                          <p className="text-muted-foreground font-medium">
                            Use the <span className="text-foreground">"Upload PDF"</span> button above to save the file.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">
                      No PDF is currently attached. You can upload a PDF below if you have the file.
                    </p>
                  )}
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
                    highlightExcerpt={
                      activeLitHighlight && highlightSurface === "pdf"
                        ? activeLitHighlight.excerpt
                        : null
                    }
                    highlightPageNumber={
                      activeLitHighlight && highlightSurface === "pdf"
                        ? activeLitHighlight.pageNumber ?? null
                        : null
                    }
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
            <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b bg-muted/10">
              <div className="space-y-1">
                <CardTitle className="text-lg">Paper Citation</CardTitle>
                <CardDescription>Select a style and copy the formatted reference.</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Select value={selectedCitationFormat} onValueChange={setSelectedCitationFormat}>
                  <SelectTrigger className="w-[280px] bg-background">
                    <SelectValue placeholder="Citation Style" />
                  </SelectTrigger>
                  <SelectContent>
                    {[
                      { id: "apa", label: "APA (7th Ed.)" },
                      { id: "mla", label: "MLA (9th Ed.)" },
                      { id: "chicago_ad", label: "Chicago (Author-Date)" },
                      { id: "chicago_nb", label: "Chicago (Notes & Bib)" },
                      { id: "harvard", label: "Harvard" },
                      { id: "vancouver", label: "Vancouver" },
                      { id: "ieee", label: "IEEE" },
                      { id: "ama", label: "AMA" },
                      { id: "nature", label: "Nature" },
                      { id: "science", label: "Science" },
                      { id: "bibtex", label: "BibTeX" },
                      { id: "ris", label: "RIS (Reference Manager)" },
                      { id: "apa6", label: "APA (6th Ed.)" },
                      { id: "cse", label: "CSE (Scientific Style)" },
                      { id: "asa", label: "ASA (Sociological Assoc.)" },
                      { id: "aps", label: "APS (Physics)" },
                      { id: "aip", label: "AIP (Physics)" },
                    ].map((fmt) => (
                      <SelectItem key={fmt.id} value={fmt.id}>
                        {fmt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="default"
                  className="gap-2 shadow-sm"
                  onClick={() => copyToClipboard(formatCitation(selectedCitationFormat), selectedCitationFormat)}
                >
                  {copiedId === selectedCitationFormat ? (
                    <>
                      <Check className="h-4 w-4" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Copy Format
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-8">
              <div
                className={`p-8 bg-muted/30 rounded-xl border border-dashed border-muted-foreground/20 text-md leading-relaxed break-words min-h-[160px] flex items-center justify-center text-center
                  ${["bibtex", "ris"].includes(selectedCitationFormat) ? "font-mono whitespace-pre text-left justify-start overflow-x-auto text-sm" : ""}
                `}
              >
                <div className="max-w-2xl mx-auto">
                  {formatCitation(selectedCitationFormat)}
                </div>
              </div>
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

export function LiteratureDetailView(props: LiteratureDetailViewProps) {
  return (
    <Suspense>
      <LiteratureDetailViewInner {...props} />
    </Suspense>
  );
}
