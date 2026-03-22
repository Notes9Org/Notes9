'use client'

import { useEffect, useMemo, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Search as SearchIcon, Database, Layers } from 'lucide-react'
import { SearchTab } from '@/components/literature-reviews/search-tab'
import { StagingTab } from '@/components/literature-reviews/staging-tab'
import { RepoTab } from '@/components/literature-reviews/repo-tab'
import { SearchPaper } from '@/types/paper-search'
import { savePaperToRepository } from '@/app/(app)/literature-reviews/actions'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
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

const STAGED_PAPERS_STORAGE_KEY = "notes9_literature_staged_papers"

function readStagedPapers(): SearchPaper[] {
  if (typeof window === "undefined") return []

  try {
    const raw = window.localStorage.getItem(STAGED_PAPERS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as SearchPaper[]
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    console.error("Failed to restore staged papers", error)
    return []
  }
}

interface LiteratureReview {
  id: string
  title: string
  authors: string | null
  journal: string | null
  publication_year: number | null
  doi: string | null
  status: string
  relevance_rating: number | null
  project: { id: string; name: string } | null
  experiment: { id: string; name: string } | null
  created_by_profile: { first_name: string; last_name: string } | null
}

interface LiteratureTabsProps {
  literatureReviews: LiteratureReview[] | null
  projects: { id: string; name: string }[]
  experiments: { id: string; name: string; project_id: string }[]
}

export function LiteratureTabs({ literatureReviews, projects, experiments }: LiteratureTabsProps) {
  const router = useRouter()
  
  // Lift search state to parent to persist across tab switches
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchPaper[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  
  // Staging state
  const [stagedPapers, setStagedPapers] = useState<SearchPaper[]>(() => readStagedPapers())
  const [pendingSavePaper, setPendingSavePaper] = useState<SearchPaper | null>(null)
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState<string>("")
  const [selectedExperimentId, setSelectedExperimentId] = useState<string>("")
  const [isSavingPaper, setIsSavingPaper] = useState(false)

  const filteredExperiments = useMemo(
    () =>
      selectedProjectId
        ? experiments.filter((experiment) => experiment.project_id === selectedProjectId)
        : [],
    [experiments, selectedProjectId]
  )

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STAGED_PAPERS_STORAGE_KEY,
        JSON.stringify(stagedPapers)
      )
    } catch (error) {
      console.error("Failed to persist staged papers", error)
    }
  }, [stagedPapers])

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
        console.error('Search error:', data.error)
      }
    } catch (error) {
      console.error('Search failed:', error)
    } finally {
      setIsSearching(false)
    }
  }

  // Staging handlers
  const handleStagePaper = (paper: SearchPaper) => {
    setStagedPapers((current) =>
      current.find((p) => p.id === paper.id) ? current : [...current, paper]
    )
  }

  const handleRemoveFromStage = (paperId: string) => {
    setStagedPapers((current) => current.filter((p) => p.id !== paperId))
  }

  const isPaperStaged = (paperId: string) => {
    return stagedPapers.some(p => p.id === paperId)
  }

  const openSaveDialog = (paper: SearchPaper) => {
    setPendingSavePaper(paper)
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
      })
      
      if (result.success) {
        if (result.warning) {
          toast.success('Paper saved to repository')
          toast.warning(result.warning)
        } else {
          toast.success(
            pendingSavePaper.isOpenAccess && pendingSavePaper.pdfUrl
              ? 'Paper and PDF saved to repository'
              : 'Paper saved to repository'
          )
        }
        // Remove from staging after successful save
        setStagedPapers((current) => current.filter((p) => p.id !== pendingSavePaper.id))
        setSaveDialogOpen(false)
        setPendingSavePaper(null)
        // Refresh the page to update the repository tab
        router.refresh()
      } else {
        toast.error(result.error || 'Failed to save paper')
      }
    } catch (error) {
      toast.error('Failed to save paper')
      console.error('Save error:', error)
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
          {stagedPapers.length > 0 && (
            <span className="ml-1 bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded-full">
              {stagedPapers.length}
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
        />
      </TabsContent>

      <TabsContent value="staging" className="mt-6">
        <StagingTab
          stagedPapers={stagedPapers}
          onRemoveFromStage={handleRemoveFromStage}
          onSavePaper={async (paper) => openSaveDialog(paper)}
        />
      </TabsContent>

      <TabsContent value="repo" className="mt-6">
        <RepoTab literatureReviews={literatureReviews} />
      </TabsContent>

      <Dialog
        open={saveDialogOpen}
        onOpenChange={(open) => {
          setSaveDialogOpen(open)
          if (!open) {
            setPendingSavePaper(null)
            setSelectedProjectId("")
            setSelectedExperimentId("")
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link paper to your research</DialogTitle>
            <DialogDescription>
              Connect this paper to a project, and optionally to one of that project&apos;s experiments, before saving it to your repository.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                {pendingSavePaper?.title}
              </p>
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
