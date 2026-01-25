'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { BookOpen, ExternalLink, Plus, Search, Star } from "lucide-react";
import Link from "next/link";
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
  project: { id: string; name: string } | null;
  experiment: { id: string; name: string } | null;
  created_by_profile: { first_name: string; last_name: string } | null;
}

interface RepoTabProps {
  literatureReviews: LiteratureReview[] | null;
}

export function RepoTab({ literatureReviews }: RepoTabProps) {
  const [selectedLiteratureId, setSelectedLiteratureId] = useState<
    string | null
  >(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

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

  // Filter literature reviews based on search query
  const filteredLiteratureReviews = literatureReviews?.filter((lit) => {
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
  });

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search literature..."
          className="pl-9 text-foreground"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Literature Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-foreground">All References</CardTitle>
          <CardDescription>Saved research papers and citations</CardDescription>
        </CardHeader>
        <CardContent>
          {filteredLiteratureReviews && filteredLiteratureReviews.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
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
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenModal(lit.id)}
                      >
                        View
                      </Button>
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
    </div>
  );
}
