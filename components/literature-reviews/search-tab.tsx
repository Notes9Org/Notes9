'use client'

import { PaperSearchSortMode, SearchPaper } from '@/types/paper-search'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Search, Loader2, BookOpen, Database, Unlock } from 'lucide-react'
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
  sortMode: PaperSearchSortMode
  onSortModeChange: (sort: PaperSearchSortMode) => void
  openAccessOnly: boolean
  onOpenAccessOnlyChange: (value: boolean) => void
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
  sortMode,
  onSortModeChange,
  openAccessOnly,
  onOpenAccessOnlyChange,
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
      <form onSubmit={handleSearch} className="mx-auto max-w-3xl">
        <div className="relative">
          <span
            className="pointer-events-none absolute left-3 top-1/2 flex -translate-y-1/2 text-muted-foreground"
            aria-hidden
          >
            {isSearching ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            ) : (
              <Search className="h-4 w-4" />
            )}
          </span>
          <Input
            type="search"
            placeholder="Search PubMed, Europe PMC, OpenAlex…"
            className="h-11 w-full pl-10 text-base"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={isSearching}
            enterKeyHint="search"
            aria-label="Literature search query"
          />
        </div>
      </form>

      {!hasSearched && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <BookOpen className="mb-4 h-16 w-16 text-muted-foreground opacity-50" />
          <h3 className="mb-2 text-lg font-semibold text-foreground">Search Scientific Literature</h3>
          <p className="mb-4 max-w-md text-muted-foreground">
            Search merges PubMed, Europe PMC (journals and preprints), and OpenAlex for broader, free coverage.
          </p>
          <div className="flex flex-col items-start gap-2">
            <p className="mb-1 text-sm font-medium text-muted-foreground">Try these examples:</p>
            {exampleSearches.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setQuery(example)}
                className="text-left text-sm text-primary hover:underline"
              >
                • {example}
              </button>
            ))}
          </div>
        </div>
      )}

      {hasSearched && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 border-b border-border pb-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground">
                  Database results
                </h3>
              </div>
              <span className="text-xs text-muted-foreground sm:ml-1">
                {isSearching ? (
                  <span className="inline-flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                    Updating…
                  </span>
                ) : (
                  <>
                    <span className="tabular-nums font-medium text-foreground">{searchResults.length}</span>
                    {searchResults.length === 1 ? ' paper' : ' papers'}
                  </>
                )}
              </span>
            </div>

            <div
              className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-x-2 sm:gap-y-2"
              role="group"
              aria-label="Sort and filter results"
            >
              <div className="flex items-center gap-2">
                <Label htmlFor="search-sort" className="sr-only">
                  Sort results
                </Label>
                <span className="hidden text-xs text-muted-foreground sm:inline">Sort by</span>
                <Select
                  value={sortMode}
                  onValueChange={(v) => onSortModeChange(v as PaperSearchSortMode)}
                  disabled={isSearching}
                >
                  <SelectTrigger id="search-sort" className="h-8 w-full sm:w-[10.5rem]" size="sm">
                    <SelectValue placeholder="Sort" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="relevance">Best match</SelectItem>
                    <SelectItem value="recent">Newest first</SelectItem>
                    <SelectItem value="cited">Most cited</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2 sm:border-l sm:border-border sm:pl-2">
                <Label
                  htmlFor="oa-only-search"
                  className="flex cursor-pointer items-center gap-1.5 text-xs font-normal leading-none"
                >
                  Open
                  <Unlock className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                </Label>
                <Checkbox
                  id="oa-only-search"
                  checked={openAccessOnly}
                  onCheckedChange={(c) => onOpenAccessOnlyChange(c === true)}
                  disabled={isSearching}
                />
              </div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            {sortMode === 'recent' ? (
              <>
                <strong className="font-medium text-foreground">Newest first</strong> lists all matches ordered
                by publication year (newest at the top). Change sort or filters to refresh.
              </>
            ) : (
              <>
                After you search, use <strong className="font-medium text-foreground">Sort by</strong> and
                filters here to reorder the same query — results refresh automatically.
              </>
            )}
          </p>
        </div>
      )}

      {hasSearched && isSearching && searchResults.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 className="mb-4 h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Searching databases…</p>
        </div>
      )}

      {hasSearched && !isSearching && searchResults.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Search className="mb-4 h-12 w-12 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground">No papers found. Try different keywords or uncheck Open.</p>
        </div>
      )}

      {hasSearched && searchResults.length > 0 && (
        <ul className="list-none space-y-4 p-0">
          {searchResults.map((paper, index) => (
            <li
              key={`${[paper.pmid, paper.doi, paper.id, paper.source].filter(Boolean).join('|')}|y:${paper.year}|i:${index}`}
            >
              <PaperSearchCard
                paper={paper}
                onStage={onStagePaper}
                isStaged={isPaperStaged(paper.id)}
                isStaging={isPaperStaging?.(paper.id) ?? false}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
