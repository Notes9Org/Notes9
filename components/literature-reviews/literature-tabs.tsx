"use client"

import { useEffect, useMemo, useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Search as SearchIcon, Database, Layers } from "lucide-react"
import { SearchTab } from "@/components/literature-reviews/search-tab"
import { StagingTab, type StagingLiteratureRow } from "@/components/literature-reviews/staging-tab"
import { RepoTab } from "@/components/literature-reviews/repo-tab"
import { PaperSearchSortMode, SearchPaper } from "@/types/paper-search"
import { normalizeDoi } from "@/lib/literature-pdf-storage"
import { savePaperToRepository, stagePaper } from "@/app/(app)/literature-reviews/actions"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useLiteratureMentionRegister } from "@/contexts/literature-mention-context"

interface LiteratureReview {
  id: string
  title: string
  authors: string | null
  journal: string | null
  publication_year: number | null
  doi: string | null
  status: string
  relevance_rating: number | null
  catalog_placement?: string | null
  project: { id: string; name: string } | null
  experiment: { id: string; name: string } | null
  created_by_profile: { first_name: string; last_name: string } | null
}

interface LiteratureTabsProps {
  literatureReviews: LiteratureReview[] | null
  stagedLiterature: StagingLiteratureRow[]
  projects: { id: string; name: string }[]
  experiments: { id: string; name: string; project_id: string }[]
  /** Deep link from `/literature-reviews?project=…` — opens My Repository filtered to this project. */
  initialProjectId?: string | null
}

export function LiteratureTabs({
  literatureReviews,
  stagedLiterature,
  projects,
  experiments,
  initialProjectId = null,
}: LiteratureTabsProps) {
  const router = useRouter()

  const [query, setQuery] = useState("")
  const [searchSort, setSearchSort] = useState<PaperSearchSortMode>("relevance")
  /** Publication lookback for &quot;Newest only&quot; sort (matches server default). */
  const RECENT_SORT_YEARS = 5
  const [openAccessOnlySearch, setOpenAccessOnlySearch] = useState(false)
  const [searchResults, setSearchResults] = useState<SearchPaper[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [stagingPaperId, setStagingPaperId] = useState<string | null>(null)

  const [pendingSavePaper, setPendingSavePaper] = useState<SearchPaper | null>(null)
  const [pendingLiteratureId, setPendingLiteratureId] = useState<string | null>(null)
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState<string>("")
  const [selectedExperimentId, setSelectedExperimentId] = useState<string>("")
  const [isSavingPaper, setIsSavingPaper] = useState(false)
  const [savingStagingLiteratureId, setSavingStagingLiteratureId] = useState<string | null>(null)

  const repositoryReviews = useMemo(
    () =>
      (literatureReviews ?? []).filter(
        (r) => (r.catalog_placement ?? "repository") !== "staging"
      ),
    [literatureReviews]
  )

  const lockedProjectId =
    initialProjectId && projects.some((p) => p.id === initialProjectId) ? initialProjectId : null
  const lockedProjectName = lockedProjectId
    ? projects.find((p) => p.id === lockedProjectId)?.name ?? null
    : null

  const stagedLiteratureScoped = useMemo(() => {
    if (!lockedProjectId) return stagedLiterature
    return stagedLiterature.filter((row) => {
      const r = row as { project_id?: string | null; project?: { id?: string } | null }
      const pid = r.project_id ?? r.project?.id ?? null
      return pid === lockedProjectId
    })
  }, [stagedLiterature, lockedProjectId])

  const registerLiteratureMentions = useLiteratureMentionRegister()
  const literatureMentionCandidates = useMemo(() => {
    const rowProjectId = (row: StagingLiteratureRow) => {
      const r = row as { project_id?: string | null; project?: { id?: string } | null }
      return r.project_id ?? r.project?.id ?? null
    }
    const stagedSource = lockedProjectId
      ? stagedLiterature.filter((row) => rowProjectId(row) === lockedProjectId)
      : stagedLiterature
    const staged = stagedSource.map((row) => {
      const r = row as StagingLiteratureRow & {
        id?: string
        title?: string
        authors?: string | null
      }
      return {
        id: String(r.id ?? ""),
        title: String(r.title ?? ""),
        authors: r.authors ?? null,
        catalog_placement: "staging" as const,
      }
    })
    const repoSource = lockedProjectId
      ? repositoryReviews.filter((r) => r.project?.id === lockedProjectId)
      : repositoryReviews
    const repo = repoSource.map((r) => ({
      id: r.id,
      title: r.title,
      authors: r.authors,
      catalog_placement: r.catalog_placement ?? "repository",
    }))
    return [...staged, ...repo].filter((c) => c.id)
  }, [stagedLiterature, repositoryReviews, lockedProjectId])

  useEffect(() => {
    registerLiteratureMentions(literatureMentionCandidates)
    return () => registerLiteratureMentions([])
  }, [literatureMentionCandidates, registerLiteratureMentions])

  const projectIdForExperimentPicker = selectedProjectId || lockedProjectId || ""

  const filteredExperiments = useMemo(
    () =>
      projectIdForExperimentPicker
        ? experiments.filter((experiment) => experiment.project_id === projectIdForExperimentPicker)
        : [],
    [experiments, projectIdForExperimentPicker]
  )

  useEffect(() => {
    if (!projectIdForExperimentPicker) {
      setSelectedExperimentId("")
      return
    }

    if (!filteredExperiments.some((experiment) => experiment.id === selectedExperimentId)) {
      setSelectedExperimentId("")
    }
  }, [filteredExperiments, selectedExperimentId, projectIdForExperimentPicker])

  const executePaperSearch = async (
    q: string,
    sort: PaperSearchSortMode,
    openAccessOnly: boolean,
  ) => {
    setIsSearching(true)
    try {
      const params = new URLSearchParams()
      params.set("query", q)
      params.set("sort", sort)
      if (sort === "recent") {
        params.set("recentYears", String(RECENT_SORT_YEARS))
      }
      if (openAccessOnly) {
        params.set("openAccessOnly", "true")
      }
      const response = await fetch(`/api/search-papers?${params.toString()}`)
      const data = await response.json()

      if (response.ok) {
        setSearchResults(data.papers || [])
      } else {
        console.error("Search error:", data.error)
      }
    } catch (error) {
      console.error("Search failed:", error)
    } finally {
      setIsSearching(false)
    }
  }

  const handleSearch = async () => {
    const q = query.trim()
    if (!q) return
    setHasSearched(true)
    await executePaperSearch(q, searchSort, openAccessOnlySearch)
  }

  const handleSearchSortChange = (sort: PaperSearchSortMode) => {
    setSearchSort(sort)
    const q = query.trim()
    if (hasSearched && q) {
      void executePaperSearch(q, sort, openAccessOnlySearch)
    }
  }

  const handleOpenAccessSearchChange = (openAccess: boolean) => {
    setOpenAccessOnlySearch(openAccess)
    const q = query.trim()
    if (hasSearched && q) {
      void executePaperSearch(q, searchSort, openAccess)
    }
  }

  const isPaperStaged = (paperId: string) => {
    const paper = searchResults.find((p) => p.id === paperId)
    if (!paper) return false
    const nd = paper.doi ? normalizeDoi(paper.doi) : null
    const pool =
      lockedProjectId != null
        ? stagedLiterature.filter((row) => {
            const r = row as { project_id?: string | null; project?: { id?: string } | null }
            return (r.project_id ?? r.project?.id ?? null) === lockedProjectId
          })
        : stagedLiterature
    return pool.some((row) => {
      if (paper.pmid && row.pmid === paper.pmid) return true
      if (nd && row.doi === nd) return true
      if (!paper.pmid && !nd && row.title === paper.title && row.publication_year === paper.year)
        return true
      return false
    })
  }

  const handleStagePaper = async (paper: SearchPaper) => {
    setStagingPaperId(paper.id)
    try {
      const result = await stagePaper(paper, { projectId: lockedProjectId })
      if (result.success) {
        if (result.alreadyStaged) {
          toast.message("Already in staging")
        } else {
          toast.success("Paper staged — downloading PDF from the search link")
        }
        if ("warning" in result && result.warning) {
          toast.message(result.warning)
        }
        router.refresh()
      } else {
        toast.error("error" in result ? result.error : "Failed to stage")
      }
    } finally {
      setStagingPaperId(null)
    }
  }

  const openSaveDialog = (paper: SearchPaper, literatureId?: string) => {
    setPendingSavePaper(paper)
    setPendingLiteratureId(literatureId ?? null)
    setSelectedProjectId(lockedProjectId ?? "")
    setSelectedExperimentId("")
    setSaveDialogOpen(true)
  }

  /** From staging: when opened with `?project=`, save straight to repository under that project (no dialog). */
  const handleSaveFromStaging = async (paper: SearchPaper, literatureId: string) => {
    if (lockedProjectId) {
      setSavingStagingLiteratureId(literatureId)
      try {
        const result = await savePaperToRepository(paper, {
          projectId: lockedProjectId,
          experimentId: null,
          literatureId,
        })
        if (result.success) {
          const pdfAttached = Boolean(result.data?.pdf_storage_path) && !result.warning
          toast.success(
            pdfAttached ? "Paper and PDF saved to repository" : "Paper saved to repository"
          )
          if (result.warning) {
            toast.message(result.warning)
          }
          router.refresh()
        } else {
          toast.error("error" in result && typeof result.error === "string" ? result.error : "Failed to save paper")
        }
      } catch (error) {
        toast.error("Failed to save paper")
        console.error("Save error:", error)
      } finally {
        setSavingStagingLiteratureId(null)
      }
      return
    }
    openSaveDialog(paper, literatureId)
  }

  const handleSavePaper = async () => {
    if (!pendingSavePaper) return

    setIsSavingPaper(true)
    try {
      const result = await savePaperToRepository(pendingSavePaper, {
        projectId: (selectedProjectId || lockedProjectId) || null,
        experimentId: selectedExperimentId || null,
        literatureId: pendingLiteratureId || null,
      })

      if (result.success) {
        const pdfAttached = Boolean(result.data?.pdf_storage_path) && !result.warning
        toast.success(
          pdfAttached ? "Paper and PDF saved to repository" : "Paper saved to repository"
        )
        if (result.warning) {
          toast.message(result.warning)
        }
        setSaveDialogOpen(false)
        setPendingSavePaper(null)
        setPendingLiteratureId(null)
        router.refresh()
      } else {
        toast.error(result.error || "Failed to save paper")
      }
    } catch (error) {
      toast.error("Failed to save paper")
      console.error("Save error:", error)
    } finally {
      setIsSavingPaper(false)
    }
  }

  const literatureDefaultTab = "search"

  return (
    <Tabs defaultValue={literatureDefaultTab} className="w-full">
      <TabsList>
        <TabsTrigger value="search" className="flex items-center gap-2">
          <SearchIcon className="h-4 w-4" />
          Search
        </TabsTrigger>
        <TabsTrigger value="staging" className="flex items-center gap-2">
          <Layers className="h-4 w-4" />
          Staging
          {stagedLiteratureScoped.length > 0 && (
            <span className="ml-1 bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded-full">
              {stagedLiteratureScoped.length}
            </span>
          )}
        </TabsTrigger>
        <TabsTrigger value="repo" className="flex items-center gap-2">
          <Database className="h-4 w-4" />
          My Repository
        </TabsTrigger>
      </TabsList>

      <TabsContent value="search" className="mt-6">
        <SearchTab
          query={query}
          setQuery={setQuery}
          searchResults={searchResults}
          isSearching={isSearching}
          hasSearched={hasSearched}
          onSearch={handleSearch}
          onStagePaper={handleStagePaper}
          isPaperStaged={isPaperStaged}
          isPaperStaging={(paperId) => stagingPaperId === paperId}
          sortMode={searchSort}
          onSortModeChange={handleSearchSortChange}
          openAccessOnly={openAccessOnlySearch}
          onOpenAccessOnlyChange={handleOpenAccessSearchChange}
        />
      </TabsContent>

      <TabsContent value="staging" className="mt-6">
        <StagingTab
          stagedLiterature={stagedLiteratureScoped}
          onSavePaper={handleSaveFromStaging}
          savingLiteratureId={savingStagingLiteratureId}
        />
      </TabsContent>

      <TabsContent value="repo" className="mt-6">
        <RepoTab
          literatureReviews={repositoryReviews}
          projects={projects}
          experiments={experiments}
          initialProjectFilterId={initialProjectId ?? undefined}
          lockProjectFilter={Boolean(lockedProjectId)}
        />
      </TabsContent>

      <Dialog
        open={saveDialogOpen}
        onOpenChange={(open) => {
          setSaveDialogOpen(open)
          if (!open) {
            setPendingSavePaper(null)
            setPendingLiteratureId(null)
            setSelectedProjectId("")
            setSelectedExperimentId("")
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link paper to your research</DialogTitle>
            <DialogDescription>
              Connect this paper to a project, and optionally to one of that project&apos;s experiments,
              before saving it to your repository.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">{pendingSavePaper?.title}</p>
              <p className="text-xs text-muted-foreground">
                Choose a project to narrow the experiment options.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="link-project">Project</Label>
                {lockedProjectId && lockedProjectName ? (
                  <div
                    id="link-project"
                    className="flex h-10 items-center rounded-md border border-input bg-muted/40 px-3 text-sm"
                  >
                    <span className="font-medium text-foreground">{lockedProjectName}</span>
                  </div>
                ) : (
                  <Select
                    value={selectedProjectId || "none"}
                    onValueChange={(value) => setSelectedProjectId(value === "none" ? "" : value)}
                  >
                    <SelectTrigger id="link-project">
                      <SelectValue placeholder="Select project (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No project</SelectItem>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="link-experiment">Experiment</Label>
                <Select
                  value={selectedExperimentId || "none"}
                  onValueChange={(value) => setSelectedExperimentId(value === "none" ? "" : value)}
                  disabled={!(selectedProjectId || lockedProjectId)}
                >
                  <SelectTrigger id="link-experiment">
                    <SelectValue
                      placeholder={
                        selectedProjectId || lockedProjectId
                          ? "Select experiment (optional)"
                          : "Select project first"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No experiment</SelectItem>
                    {filteredExperiments.map((experiment) => (
                      <SelectItem key={experiment.id} value={experiment.id}>
                        {experiment.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSaveDialogOpen(false)
                setPendingSavePaper(null)
                setPendingLiteratureId(null)
              }}
              disabled={isSavingPaper}
            >
              Cancel
            </Button>
            <Button onClick={handleSavePaper} disabled={isSavingPaper}>
              {isSavingPaper ? "Saving..." : "Save to Repository"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Tabs>
  )
}
