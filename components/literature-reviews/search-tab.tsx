'use client'

import { SearchPaper } from '@/types/paper-search'
import { Input } from '@/components/ui/input'
import { Search, Loader2, BookOpen, Database } from 'lucide-react'
import { PaperSearchCard } from './paper-search-card'

interface SearchTabProps {
  query: string
  setQuery: (query: string) => void
  searchResults: SearchPaper[]
  isSearching: boolean
  hasSearched: boolean
  onSearch: () => void
  onStagePaper: (paper: SearchPaper) => void | Promise<void>
  isPaperStaged: (paperId: string) => boolean
  isPaperStaging?: (paperId: string) => boolean
}

export function SearchTab({
  query,
  setQuery,
  searchResults,
  isSearching,
  hasSearched,
  onSearch,
  onStagePaper,
  isPaperStaged,
  isPaperStaging,
}: SearchTabProps) {
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return
    onSearch()
  }

  const exampleSearches = [
    'CRISPR gene editing in cancer therapy',
    'COVID-19 vaccine efficacy studies',
    'Machine learning in drug discovery',
    "Alzheimer's disease biomarkers",
  ]

  return (
    <div className="space-y-6">
      <form onSubmit={handleSearch} className="space-y-4">
        <div className="relative mx-auto max-w-3xl">
          <Input
            placeholder="Search database for papers..."
            className="h-12 pl-3 text-base"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={isSearching}
          />
        </div>
      </form>

      {!hasSearched && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <BookOpen className="mb-4 h-16 w-16 text-muted-foreground opacity-50" />
          <h3 className="mb-2 text-lg font-semibold text-foreground">Search Scientific Literature</h3>
          <p className="mb-4 max-w-md text-muted-foreground">
            Search across PubMed, BioRxiv, and MedRxiv databases.
          </p>
          <div className="flex flex-col items-start gap-2">
            <p className="mb-1 text-sm font-medium text-muted-foreground">Try these examples:</p>
            {exampleSearches.map((example) => (
              <button
                key={example}
                onClick={() => setQuery(example)}
                className="text-left text-sm text-primary hover:underline"
              >
                • {example}
              </button>
            ))}
          </div>
        </div>
      )}

      {isSearching && (
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 className="mb-4 h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Searching databases...</p>
        </div>
      )}

      {!isSearching && hasSearched && searchResults.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Search className="mb-4 h-12 w-12 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground">No papers found. Try refining your search query.</p>
        </div>
      )}

      {!isSearching && hasSearched && searchResults.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b pb-3">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                Database Results
              </h3>
            </div>
            <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
              {searchResults.length} papers
            </span>
          </div>
          <div className="space-y-4">
            {searchResults.map((paper) => (
              <PaperSearchCard
                key={paper.id}
                paper={paper}
                onStage={onStagePaper}
                isStaged={isPaperStaged(paper.id)}
                isStaging={isPaperStaging?.(paper.id) ?? false}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
