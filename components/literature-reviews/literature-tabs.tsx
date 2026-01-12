'use client'

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Search as SearchIcon, Database, Layers } from 'lucide-react'
import { SearchTab } from '@/components/literature-reviews/search-tab'
import { StagingTab } from '@/components/literature-reviews/staging-tab'
import { RepoTab } from '@/components/literature-reviews/repo-tab'
import { SearchPaper } from '@/types/paper-search'
import { savePaperToRepository } from '@/app/(app)/literature-reviews/actions'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

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
}

export function LiteratureTabs({ literatureReviews }: LiteratureTabsProps) {
  const router = useRouter()
  
  // Lift search state to parent to persist across tab switches
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchPaper[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  
  // Staging state
  const [stagedPapers, setStagedPapers] = useState<SearchPaper[]>([])

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
    if (!stagedPapers.find(p => p.id === paper.id)) {
      setStagedPapers([...stagedPapers, paper])
    }
  }

  const handleRemoveFromStage = (paperId: string) => {
    setStagedPapers(stagedPapers.filter(p => p.id !== paperId))
  }

  const isPaperStaged = (paperId: string) => {
    return stagedPapers.some(p => p.id === paperId)
  }

  const handleSavePaper = async (paper: SearchPaper) => {
    try {
      const result = await savePaperToRepository(paper)
      
      if (result.success) {
        toast.success('Paper saved to repository')
        // Remove from staging after successful save
        setStagedPapers(stagedPapers.filter(p => p.id !== paper.id))
        // Refresh the page to update the repository tab
        router.refresh()
      } else {
        toast.error(result.error || 'Failed to save paper')
      }
    } catch (error) {
      toast.error('Failed to save paper')
      console.error('Save error:', error)
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
          onSavePaper={handleSavePaper}
        />
      </TabsContent>

      <TabsContent value="repo" className="mt-6">
        <RepoTab literatureReviews={literatureReviews} />
      </TabsContent>
    </Tabs>
  )
}
