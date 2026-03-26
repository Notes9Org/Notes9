"use client"

import { useEffect, useMemo, useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Search as SearchIcon, Database, Layers } from "lucide-react"
import { SearchTab } from "@/components/literature-reviews/search-tab"
import { StagingTab, type StagingLiteratureRow } from "@/components/literature-reviews/staging-tab"
import { RepoTab } from "@/components/literature-reviews/repo-tab"
import { SearchPaper } from "@/types/paper-search"
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
}

export function LiteratureTabs({
  literatureReviews,
  stagedLiterature,
  projects,
  experiments,
}: LiteratureTabsProps) {
  const router = useRouter()

  const [query, setQuery] = useState("")
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

  const repositoryReviews = useMemo(
    () =>
      (literatureReviews ?? []).filter(
        (r) => (r.catalog_placement ?? "repository") !== "staging"
      ),
    [literatureReviews]
  )

  const filteredExperiments = useMemo(
    () =>
      selectedProjectId
        ? experiments.filter((experiment) => experiment.project_id === selectedProjectId)
        : [],
    [experiments, selectedProjectId]
  )

  useEffect(() => {
    if (!selectedProjectId) {
      setSelectedExperimentId("")
      return
    }

    if (!filteredExperiments.some((experiment) => experiment.id === selectedExperimentId)) {
      setSelectedExperimentId("")
    }
  }, [filteredExperiments, selectedExperimentId, selectedProjectId])

  const handleSearch = async () => {
    if (!query.trim()) return

    setIsSearching(true)
    setHasSearched(true)
    setSearchResults([])

    try {
      const response = await fetch(`/api/search-papers?query=${encodeURIComponent(query)}`)
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

  const isPaperStaged = (paperId: string) => {
    const paper = searchResults.find((p) => p.id === paperId)
    if (!paper) return false
    const nd = paper.doi ? normalizeDoi(paper.doi) : null
    return stagedLiterature.some((row) => {
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
      const result = await stagePaper(paper)
      if (result.success) {
        if (result.alreadyStaged) {
          toast.message("Already in staging")
        } else {
          toast.success("Paper staged — importing PDF when available")
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
    setSelectedProjectId("")
    setSelectedExperimentId("")
    setSaveDialogOpen(true)
  }

  const handleSavePaper = async () => {
    if (!pendingSavePaper) return

    setIsSavingPaper(true)
    try {
      const result = await savePaperToRepository(pendingSavePaper, {
        projectId: selectedProjectId || null,
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

  return (
    <Tabs defaultValue="search" className="w-full">
      <TabsList>
        <TabsTrigger value="search" className="flex items-center gap-2">
          <SearchIcon className="h-4 w-4" />
          Search
        </TabsTrigger>
        <TabsTrigger value="staging" className="flex items-center gap-2">
          <Layers className="h-4 w-4" />
          Staging
          {stagedLiterature.length > 0 && (
            <span className="ml-1 bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded-full">
              {stagedLiterature.length}
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
        />
      </TabsContent>

      <TabsContent value="staging" className="mt-6">
        <StagingTab
          stagedLiterature={stagedLiterature}
          onSavePaper={(paper, literatureId) => openSaveDialog(paper, literatureId)}
        />
      </TabsContent>

      <TabsContent value="repo" className="mt-6">
        <RepoTab
          literatureReviews={repositoryReviews}
          projects={projects}
          experiments={experiments}
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
              </div>
              <div className="space-y-2">
                <Label htmlFor="link-experiment">Experiment</Label>
                <Select
                  value={selectedExperimentId || "none"}
                  onValueChange={(value) => setSelectedExperimentId(value === "none" ? "" : value)}
                  disabled={!selectedProjectId}
                >
                  <SelectTrigger id="link-experiment">
                    <SelectValue
                      placeholder={
                        selectedProjectId ? "Select experiment (optional)" : "Select project first"
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
