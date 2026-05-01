'use client'

import { useMemo, useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
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
import { BookOpen, ExternalLink, FileText, Plus, Search, Star, Trash2, X, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { LiteratureDetailView } from "./literature-detail-view";
import { createClient } from "@/lib/supabase/client";
import { LITERATURE_DRAG_MIME } from "@/lib/catalyst-agent-types";
import { CATALYST_MENTION_DRAG_MIME } from "@/lib/catalyst-mention-types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

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
  initialProjectFilterId?: string | null;
  /** When true (with initialProjectFilterId), project filter is fixed and cannot switch to &quot;all&quot;. */
  lockProjectFilter?: boolean;
}

function PaperTabContent({ id, onRefresh, initialTab }: { id: string; onRefresh: () => void; initialTab?: "overview" | "pdf" | "citation" | "linked" }) {
  const [literature, setLiterature] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLiterature = async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("literature_reviews")
        .select(`
          *,
          created_by_profile:profiles!literature_reviews_created_by_fkey(first_name, last_name, email),
          project:projects(id, name),
          experiment:experiments(id, name)
        `)
        .eq("id", id)
        .single();

      if (error) throw error;
      setLiterature(data);
    } catch (err) {
      setError("Failed to load details");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLiterature();
  }, [id]);

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="h-10 w-10 animate-spin text-muted-foreground opacity-40" />
    </div>
  );
  if (error) return (
    <div className="rounded-xl border border-dashed py-24 text-center">
      <p className="text-destructive font-medium">{error}</p>
      <Button variant="outline" size="sm" className="mt-4" onClick={fetchLiterature}>
        Try Again
      </Button>
    </div>
  );
  if (!literature) return null;

  return (
    <LiteratureDetailView
      literature={literature}
      showBreadcrumb={false}
      showActions={true}
      initialTab={initialTab}
      onRefresh={() => {
        fetchLiterature();
        onRefresh();
      }}
    />
  );
}

export function RepoTab({
  literatureReviews,
  projects,
  experiments,
  initialProjectFilterId = null,
  lockProjectFilter = false,
}: RepoTabProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<string>("list");
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<LiteratureReview | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("all");
  const [selectedExperimentId, setSelectedExperimentId] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [tabPreferences, setTabPreferences] = useState<Record<string, "overview" | "pdf" | "citation" | "linked">>({});
  const [columnWidths, setColumnWidths] = useState({
    details: 450,
    journal: 200,
  });

  const handleResize = (column: 'details' | 'journal', startX: number, startWidth: number) => {
    const onMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startX;
      setColumnWidths(prev => ({
        ...prev,
        [column]: Math.max(150, startWidth + delta)
      }));
    };
    
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = 'default';
    };
    
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'col-resize';
  };

  useEffect(() => {
    if (!initialProjectFilterId) {
      if (!lockProjectFilter) {
        setSelectedProjectId("all");
      }
      return;
    }
    if (projects.some((p) => p.id === initialProjectFilterId)) {
      setSelectedProjectId(initialProjectFilterId);
    }
  }, [initialProjectFilterId, lockProjectFilter, projects]);

  useEffect(() => {
    if (!lockProjectFilter || !initialProjectFilterId) return;
    setSelectedProjectId((current) =>
      current === initialProjectFilterId ? current : initialProjectFilterId
    );
  }, [lockProjectFilter, initialProjectFilterId]);

  const newManualReferenceHref =
    lockProjectFilter && initialProjectFilterId
      ? `/literature-reviews/new?project=${initialProjectFilterId}`
      : "/literature-reviews/new";

  // Load from localStorage
  useEffect(() => {
    const savedTabs = localStorage.getItem("n9-repo-open-tabs");
    const savedActive = localStorage.getItem("n9-repo-active-tab");
    if (savedTabs) {
      try {
        setOpenTabs(JSON.parse(savedTabs));
      } catch (e) {
        console.error("Failed to load repo tabs", e);
      }
    }
    if (savedActive) setActiveTab(savedActive);
    setIsInitialized(true);
  }, []);

  // Sync to localStorage
  useEffect(() => {
    if (!isInitialized) return;
    localStorage.setItem("n9-repo-open-tabs", JSON.stringify(openTabs));
  }, [openTabs, isInitialized]);

  useEffect(() => {
    if (!isInitialized) return;
    localStorage.setItem("n9-repo-active-tab", activeTab);
  }, [activeTab, isInitialized]);

  // Sync open tabs if papers are removed
  useEffect(() => {
    if (!isInitialized || !literatureReviews) return;
    const validIds = literatureReviews.map((i) => i.id);
    const filtered = openTabs.filter((id) => validIds.includes(id));
    
    if (filtered.length !== openTabs.length) {
      setOpenTabs(filtered);
    }

    if (activeTab !== "list" && !validIds.includes(activeTab)) {
      setActiveTab("list");
    }
  }, [literatureReviews, isInitialized]);

  const handleOpenPaper = (id: string, subTab?: "overview" | "pdf" | "citation" | "linked") => {
    if (!openTabs.includes(id)) {
      setOpenTabs((prev) => [...prev, id]);
    }
    if (subTab) {
      setTabPreferences(prev => ({ ...prev, [id]: subTab }));
    }
    setActiveTab(id);
  };

  const handleCloseTab = (id: string, e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    const nextTabs = openTabs.filter((t) => t !== id);
    setOpenTabs(nextTabs);
    if (activeTab === id) {
      setActiveTab("list");
    }
  };

  const scrollTabsRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);

  const checkScroll = () => {
    if (scrollTabsRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollTabsRef.current;
      setShowLeftArrow(scrollLeft > 0);
      setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 2);
    }
  };

  useEffect(() => {
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [openTabs]);

  const scrollTabs = (direction: 'left' | 'right') => {
    if (scrollTabsRef.current) {
      const scrollAmount = 250;
      scrollTabsRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  // Scroll active tab into view
  useEffect(() => {
    if (activeTab !== 'list' && scrollTabsRef.current) {
      const container = scrollTabsRef.current;
      const activeElement = container.querySelector(`[data-value="${activeTab}"]`) as HTMLElement;
      if (activeElement) {
        const containerRect = container.getBoundingClientRect();
        const activeRect = activeElement.getBoundingClientRect();
        
        if (activeRect.left < containerRect.left || activeRect.right > containerRect.right) {
          activeElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
      }
    }
    checkScroll();
  }, [activeTab]);

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
        const matchesStatus =
          selectedStatus === "all" || lit.status === selectedStatus;

        return (
          matchesSearch &&
          matchesProject &&
          matchesExperiment &&
          matchesStatus
        );
      }),
    [
      literatureReviews,
      searchQuery,
      selectedExperimentId,
      selectedProjectId,
      selectedStatus,
    ]
  );

  const statusOptions = useMemo(() => {
    const s = new Set<string>();
    for (const lit of literatureReviews || []) {
      if (lit.status) s.add(lit.status);
    }
    return Array.from(s).sort();
  }, [literatureReviews]);

  const clearFilters = () => {
    if (!lockProjectFilter) {
      setSelectedProjectId("all");
    }
    setSelectedExperimentId("all");
    setSelectedStatus("all");
    setSearchQuery("");
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
      for (const id of ids) {
        const response = await fetch(`/api/literature/${id}`, { method: "DELETE" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(typeof data.error === "string" ? data.error : "Delete failed");
        }
      }

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
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <div className="relative group transition-all">
          {showLeftArrow && (
            <div className="absolute left-0 top-0 bottom-0 z-20 flex items-center bg-gradient-to-r from-background via-background/80 to-transparent pr-10 pointer-events-none">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full shadow-lg bg-background border pointer-events-auto hover:bg-muted ml-0.5 transform translate-y-[3px]"
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
            <TabsList className="bg-transparent h-auto px-1 pt-0 pb-1.5 flex items-center justify-start gap-1.5 border-none bg-muted/15 rounded-lg w-max flex-nowrap min-w-full relative">
              <div className="w-2 flex-shrink-0" />
              <TabsTrigger 
                value="list" 
                data-value="list"
                className="px-4 py-2 rounded-md data-[state=active]:bg-background data-[state=active]:text-[var(--n9-accent)] data-[state=active]:shadow-sm transition-all border border-transparent data-[state=active]:border-border/50 font-semibold"
              >
                <BookOpen className="h-4 w-4 mr-2" />
                All References
              </TabsTrigger>
              {openTabs.map(id => {
                const lit = literatureReviews?.find(l => l.id === id)
                return (
                  <TabsTrigger 
                    key={id} 
                    value={id}
                    data-value={id}
                    className="group px-3 py-2 rounded-md data-[state=active]:bg-background data-[state=active]:text-[var(--n9-accent)] data-[state=active]:shadow-sm transition-all flex items-center gap-2 max-w-[240px] border border-transparent data-[state=active]:border-border/50"
                  >
                    <FileText className="h-4 w-4 opacity-50 flex-shrink-0" />
                    <span className="truncate text-xs font-semibold">{lit?.title || "Paper"}</span>
                    <button 
                      type="button"
                      className="flex-shrink-0 p-1 rounded-md hover:bg-muted text-muted-foreground/60 hover:text-rose-500 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100" 
                      onClick={(e) => handleCloseTab(id, e)}
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
                className="h-8 w-8 rounded-full shadow-lg bg-background border pointer-events-auto hover:bg-muted mr-0.5 transform translate-y-[3px]"
                onClick={() => scrollTabs('right')}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        <TabsContent value="list" className="space-y-6 m-0 border-none p-0 outline-none">
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

        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
          {lockProjectFilter && initialProjectFilterId ? (
            <div className="flex h-9 w-full min-w-0 items-center rounded-md border border-input bg-muted/40 px-3 text-sm text-foreground lg:w-[180px]">
              <span className="truncate">
                {projects.find((p) => p.id === initialProjectFilterId)?.name ?? "Project"}
              </span>
            </div>
          ) : (
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
          )}

          <Select
            value={selectedExperimentId}
            onValueChange={setSelectedExperimentId}
          >
            <SelectTrigger className="min-w-0 max-w-full w-full lg:w-[180px]">
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

          {statusOptions.length > 0 && (
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="min-w-0 max-w-full w-full lg:w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {statusOptions.map((st) => (
                  <SelectItem key={st} value={st}>
                    {st.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

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
          {filteredLiteratureReviews && filteredLiteratureReviews.length > 0 ? (
            <div className="rounded-md border overflow-x-auto">
              <Table className="relative min-w-full table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[48px]">
                    <Checkbox
                      checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
                      onCheckedChange={(checked) => toggleSelectAllVisible(checked === true)}
                      aria-label="Select all visible references"
                      className="data-[state=checked]:bg-rose-50 data-[state=checked]:text-rose-600 data-[state=checked]:border-rose-200 dark:data-[state=checked]:bg-rose-950/30 dark:data-[state=checked]:text-rose-400 dark:data-[state=checked]:border-rose-900/30"
                    />
                  </TableHead>
                  <TableHead 
                    className="font-semibold text-foreground/80 relative"
                    style={{ width: columnWidths.details }}
                  >
                    Reference Details
                    <div 
                      className="absolute right-0 top-0 h-full w-px bg-border/50 cursor-col-resize hover:bg-[var(--n9-accent)] transition-colors"
                      onMouseDown={(e) => handleResize('details', e.clientX, columnWidths.details)}
                    />
                  </TableHead>
                  <TableHead 
                    className="font-semibold text-foreground/80 relative"
                    style={{ width: columnWidths.journal }}
                  >
                    Journal & Year
                    <div 
                      className="absolute right-0 top-0 h-full w-px bg-border/50 cursor-col-resize hover:bg-[var(--n9-accent)] transition-colors"
                      onMouseDown={(e) => handleResize('journal', e.clientX, columnWidths.journal)}
                    />
                  </TableHead>
                  <TableHead className="w-[100px] font-semibold text-foreground/80">Status</TableHead>
                  <TableHead className="sticky right-0 z-20 w-[120px] font-semibold text-foreground/80 text-left bg-background border-l border-border/40">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLiteratureReviews.map((lit) => (
                  <TableRow
                    key={lit.id}
                    draggable
                    className="group cursor-grab transition-colors active:cursor-grabbing"
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
                        onCheckedChange={(checked) => toggleSelected(lit.id, checked === true)}
                        aria-label={`Select ${lit.title}`}
                        className="data-[state=checked]:bg-rose-50 data-[state=checked]:text-rose-600 data-[state=checked]:border-rose-200 dark:data-[state=checked]:bg-rose-950/30 dark:data-[state=checked]:text-rose-400 dark:data-[state=checked]:border-rose-900/30"
                      />
                    </TableCell>
                    <TableCell 
                      className="py-4"
                      style={{ width: columnWidths.details }}
                    >
                      <div className="flex flex-col gap-1 w-full overflow-hidden" style={{ maxWidth: columnWidths.details - 32 }}>
                        <button
                          onClick={() => handleOpenPaper(lit.id)}
                          className="font-semibold text-sm leading-snug text-foreground hover:text-[var(--n9-accent)] text-left transition-colors truncate block"
                          title={lit.title}
                        >
                          {lit.title}
                        </button>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-medium text-muted-foreground/80 truncate" style={{ maxWidth: columnWidths.details - 100 }}>
                            {lit.authors || "Unknown Authors"}
                          </span>
                          {lit.pdf_storage_path && (
                            <Badge 
                              variant="outline" 
                              className="h-4 px-1 text-[9px] font-bold border-[var(--n9-accent)]/30 text-[var(--n9-accent)] bg-[var(--n9-accent)]/5 flex-shrink-0 cursor-pointer hover:bg-[var(--n9-accent)]/10"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenPaper(lit.id, 'pdf');
                              }}
                            >
                              PDF
                            </Badge>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell style={{ width: columnWidths.journal }}>
                      <div className="flex flex-col gap-0.5 w-full overflow-hidden" style={{ maxWidth: columnWidths.journal - 32 }}>
                        <span className="text-[11px] font-bold text-foreground/70 truncate w-full" title={lit.journal || "Unknown Journal"}>
                          {lit.journal || "No journal info"}
                        </span>
                        <span className="text-[10px] tabular-nums font-medium text-muted-foreground">
                          {lit.publication_year || "n.d."}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={getStatusBadge(lit.status)}
                        className="text-[9px] font-bold uppercase tracking-tighter px-1.5 h-4.5 rounded-sm"
                      >
                        {lit.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="sticky right-0 z-10 text-left bg-background group-hover:bg-muted/50 transition-colors border-l border-border/40">
                      <div className="flex items-center justify-start gap-1.5 opacity-40 hover:opacity-100 transition-opacity">
                        <Button
                          variant="secondary"
                          size="sm"
                          className="h-7 px-2.5 text-[11px] font-bold uppercase tracking-wider shadow-sm"
                          onClick={() => handleOpenPaper(lit.id)}
                        >
                          Open
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:bg-rose-50/50 hover:text-rose-500/80 dark:hover:bg-rose-950/20 dark:hover:text-rose-400/80"
                          onClick={() => setDeleteTarget(lit)}
                          aria-label={`Delete ${lit.title}`}
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
                <Link href={newManualReferenceHref}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add First Reference
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

        </TabsContent>

        {openTabs.map(id => (
          <TabsContent key={id} value={id} className="m-0 border-none p-0 outline-none">
            <PaperTabContent 
              id={id} 
              onRefresh={() => router.refresh()} 
              initialTab={tabPreferences[id]}
            />
          </TabsContent>
        ))}
      </Tabs>

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
              className="bg-rose-50 text-rose-600 border border-rose-100 hover:bg-rose-100 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-900/10 dark:hover:bg-rose-900/30 font-semibold"
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
              className="bg-rose-50 text-rose-600 border border-rose-100 hover:bg-rose-100 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-900/10 dark:hover:bg-rose-900/30 font-semibold"
            >
              {isDeleting ? "Deleting..." : `Delete Selected (${selectedIds.length})`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
