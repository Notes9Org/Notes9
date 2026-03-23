'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
import { BookOpen, ExternalLink, FileText, Plus, Search, Star, Trash2 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { LiteratureDetailModal } from "./literature-detail-modal";

interface LiteratureReview {
  id: string;
  title: string;
  authors: string | null;
  journal: string | null;
  publication_year: number | null;
  doi: string | null;
  status: string;
  relevance_rating: number | null;
  pdf_storage_path?: string | null;
  pdf_file_name?: string | null;
  project: { id: string; name: string } | null;
  experiment: { id: string; name: string } | null;
  created_by_profile: { first_name: string; last_name: string } | null;
}

interface RepoTabProps {
  literatureReviews: LiteratureReview[] | null;
  projects: { id: string; name: string }[];
  experiments: { id: string; name: string; project_id: string }[];
}

export function RepoTab({
  literatureReviews,
  projects,
  experiments,
}: RepoTabProps) {
  const router = useRouter();
  const [selectedLiteratureId, setSelectedLiteratureId] = useState<
    string | null
  >(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<LiteratureReview | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("all");
  const [selectedExperimentId, setSelectedExperimentId] = useState<string>("all");

  const handleOpenModal = (id: string) => {
    setSelectedLiteratureId(id);
    setModalOpen(true);
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
      return <span className="text-xs text-muted-foreground">Not rated</span>;
    return (
      <div className="flex items-center gap-0.5">
        {[...Array(5)].map((_, i) => (
          <Star
            key={i}
            className={`h-3 w-3 ${
              i < rating
                ? "fill-yellow-400 text-yellow-400"
                : "text-muted-foreground"
            }`}
          />
        ))}
      </div>
    );
  };

  const filteredExperiments = useMemo(
    () =>
      selectedProjectId === "all"
        ? experiments
        : experiments.filter((experiment) => experiment.project_id === selectedProjectId),
    [experiments, selectedProjectId]
  );

  // Filter literature reviews based on search query
  const filteredLiteratureReviews = useMemo(
    () =>
      literatureReviews?.filter((lit) => {
        const matchesSearch = (() => {
          if (!searchQuery.trim()) return true;

          const query = searchQuery.toLowerCase();
          const title = lit.title?.toLowerCase() || "";
          const authors = lit.authors?.toLowerCase() || "";
          const journal = lit.journal?.toLowerCase() || "";
          const doi = lit.doi?.toLowerCase() || "";
          const status = lit.status?.toLowerCase() || "";
          const projectName = lit.project?.name?.toLowerCase() || "";
          const experimentName = lit.experiment?.name?.toLowerCase() || "";

          return (
            title.includes(query) ||
            authors.includes(query) ||
            journal.includes(query) ||
            doi.includes(query) ||
            status.includes(query) ||
            projectName.includes(query) ||
            experimentName.includes(query)
          );
        })();

        const matchesProject =
          selectedProjectId === "all" || lit.project?.id === selectedProjectId;
        const matchesExperiment =
          selectedExperimentId === "all" || lit.experiment?.id === selectedExperimentId;

        return (
          matchesSearch &&
          matchesProject &&
          matchesExperiment
        );
      }),
    [
      literatureReviews,
      searchQuery,
      selectedExperimentId,
      selectedProjectId,
    ]
  );

  const clearFilters = () => {
    setSelectedProjectId("all");
    setSelectedExperimentId("all");
  };

  const visibleIds = filteredLiteratureReviews?.map((lit) => lit.id) || [];
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
  const someVisibleSelected =
    visibleIds.some((id) => selectedIds.includes(id)) && !allVisibleSelected;

  const toggleSelected = (id: string, checked: boolean) => {
    setSelectedIds((current) =>
      checked ? [...current, id] : current.filter((selectedId) => selectedId !== id)
    );
  };

  const toggleSelectAllVisible = (checked: boolean) => {
    setSelectedIds((current) => {
      if (checked) {
        return Array.from(new Set([...current, ...visibleIds]));
      }

      return current.filter((id) => !visibleIds.includes(id));
    });
  };

  const deleteLiterature = async (ids: string[]) => {
    if (ids.length === 0) return;

    setIsDeleting(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.from("literature_reviews").delete().in("id", ids);

      if (error) throw error;

      setSelectedIds((current) => current.filter((id) => !ids.includes(id)));
      setDeleteTarget(null);
      setBulkDeleteOpen(false);

      toast.success(
        ids.length === 1
          ? "Literature reference deleted"
          : `${ids.length} literature references deleted`
      );

      router.refresh();
    } catch (error: any) {
      toast.error(error.message || "Failed to delete literature references");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="space-y-3">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search literature..."
            className="pl-9 text-foreground"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
          <Select
            value={selectedProjectId}
            onValueChange={(value) => {
              setSelectedProjectId(value);
              setSelectedExperimentId("all");
            }}
          >
            <SelectTrigger className="w-full lg:w-[180px]">
              <SelectValue placeholder="Project" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All projects</SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={selectedExperimentId}
            onValueChange={setSelectedExperimentId}
          >
            <SelectTrigger className="w-full lg:w-[180px]">
              <SelectValue placeholder="Experiment" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All experiments</SelectItem>
              {filteredExperiments.map((experiment) => (
                <SelectItem key={experiment.id} value={experiment.id}>
                  {experiment.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="ghost"
            size="sm"
            className="lg:ml-auto"
            onClick={clearFilters}
          >
            Clear filters
          </Button>
        </div>
      </div>

      {/* Literature Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-foreground">All References</CardTitle>
              <CardDescription>Saved research papers and citations</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {selectedIds.length > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setBulkDeleteOpen(true)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Selected ({selectedIds.length})
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredLiteratureReviews && filteredLiteratureReviews.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[48px]">
                    <Checkbox
                      checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
                      onCheckedChange={(checked) => toggleSelectAllVisible(checked === true)}
                      aria-label="Select all visible references"
                    />
                  </TableHead>
                  <TableHead className="w-[350px]">Title</TableHead>
                  <TableHead className="w-[200px]">Authors</TableHead>
                  <TableHead className="w-[150px]">Journal & Year</TableHead>
                  <TableHead className="w-[100px]">Status</TableHead>
                  <TableHead className="w-[100px]">Rating</TableHead>
                  <TableHead className="w-[150px]">Linked To</TableHead>
                  <TableHead className="w-[80px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLiteratureReviews.map((lit) => (
                  <TableRow key={lit.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.includes(lit.id)}
                        onCheckedChange={(checked) => toggleSelected(lit.id, checked === true)}
                        aria-label={`Select ${lit.title}`}
                      />
                    </TableCell>
                    <TableCell>
                      <button
                        onClick={() => handleOpenModal(lit.id)}
                        className="font-medium text-foreground hover:underline text-left truncate block max-w-[350px]"
                        title={lit.title}
                      >
                        {lit.title}
                      </button>
                      {lit.doi && (
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-xs text-muted-foreground">
                            DOI: {lit.doi}
                          </span>
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
                      {lit.pdf_storage_path && (
                        <div className="mt-1 flex items-center gap-1 text-xs text-[var(--n9-accent)]">
                          <FileText className="h-3 w-3" />
                          PDF attached
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-foreground">
                      {lit.authors ? (
                        lit.authors.split(",")[0] +
                        (lit.authors.split(",").length > 1 ? " et al." : "")
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-foreground">
                      {lit.journal && lit.publication_year ? (
                        <>
                          <div className="font-medium">{lit.journal}</div>
                          <div className="text-xs text-muted-foreground">
                            {lit.publication_year}
                          </div>
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
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenModal(lit.id)}
                        >
                          View
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:bg-rose-50 hover:text-rose-400 dark:hover:bg-rose-950/40 dark:hover:text-rose-300"
                          onClick={() => setDeleteTarget(lit)}
                          aria-label={`Delete ${lit.title}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : literatureReviews && literatureReviews.length > 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Search className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-2">No results found</p>
              <p className="text-sm text-muted-foreground">
                Try adjusting your search query
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">
                No literature references yet
              </p>
              <Button asChild>
                <Link href="/literature-reviews/new">
                  <Plus className="h-4 w-4 mr-2" />
                  Add First Reference
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Literature Detail Modal */}
      <LiteratureDetailModal
        literatureId={selectedLiteratureId}
        open={modalOpen}
        onOpenChange={setModalOpen}
      />

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete literature reference?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? (
                <>
                  This will permanently delete <strong>{deleteTarget.title}</strong>.
                  This action cannot be undone.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                if (deleteTarget) {
                  void deleteLiterature([deleteTarget.id]);
                }
              }}
              disabled={isDeleting}
              className="bg-rose-300 text-rose-950 hover:bg-rose-400 dark:bg-rose-300 dark:text-rose-950 dark:hover:bg-rose-200"
            >
              {isDeleting ? "Deleting..." : "Delete Reference"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete selected references?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {selectedIds.length} selected literature
              reference{selectedIds.length === 1 ? "" : "s"}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void deleteLiterature(selectedIds);
              }}
              disabled={isDeleting || selectedIds.length === 0}
              className="bg-rose-300 text-rose-950 hover:bg-rose-400 dark:bg-rose-300 dark:text-rose-950 dark:hover:bg-rose-200"
            >
              {isDeleting ? "Deleting..." : `Delete Selected (${selectedIds.length})`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
