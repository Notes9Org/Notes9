'use client'

import { useState } from 'react'
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
import {
  Search,
  Loader2,
  Database,
  Unlock,
  Wand2,
  MessageCircle,
  Highlighter,
  NotebookPen,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { PaperSearchCard } from './paper-search-card'
import { AiSearchView } from './ai-search-view'
import { AiSearchFilters } from './ai-search-filters'
import { DEFAULT_AI_FILTERS, type AiResultFilters } from '@/lib/ai-search-filters'

/** What the AI literature search offers — shown on the empty (pre-search) state. */
const SEARCH_FEATURES: { Icon: LucideIcon; title: string; desc: string }[] = [
  {
    Icon: Wand2,
    title: 'AI summary of the evidence',
    desc: 'Every search returns a cited AI overview that directly answers your question.',
  },
  {
    Icon: MessageCircle,
    title: 'Ask any paper in Catalyst',
    desc: 'Open a paper in the Catalyst AI chat to dig into its methods, results, and limitations.',
  },
  {
    Icon: Database,
    title: 'Save to your repository',
    desc: 'Add papers to your library, organized by project and experiment.',
  },
  {
    Icon: Unlock,
    title: 'Open-access PDFs inline',
    desc: 'Open-access papers load right inside Notes9 — no downloads or new tabs needed.',
  },
  {
    Icon: Highlighter,
    title: 'Annotate as you read',
    desc: 'Highlight passages in the PDF and revisit them anytime.',
  },
  {
    Icon: NotebookPen,
    title: 'Take notes per paper',
    desc: 'Keep your own notes on each paper alongside the source.',
  },
]

interface LiteratureSearchFormProps {
  query: string
  setQuery: (query: string) => void
  isSearching: boolean
  onSearch: () => void
  /** When provided, a Filters control is shown inside the search bar. */
  filters?: AiResultFilters
  onFiltersChange?: (next: AiResultFilters) => void
}

export function LiteratureSearchForm({
  query,
  setQuery,
  isSearching,
  onSearch,
  filters,
  onFiltersChange,
}: LiteratureSearchFormProps) {
  const showFilters = !!(filters && onFiltersChange)
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return
    onSearch()
  }

  return (
    <form onSubmit={handleSearch} className="mx-auto flex max-w-3xl items-center gap-2">
      <div className="relative flex-1">
        <button
          type="submit"
          disabled={isSearching || !query.trim()}
          aria-label="Search"
          title="Search"
          className="absolute left-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-primary disabled:pointer-events-none disabled:opacity-50"
        >
          {isSearching ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          ) : (
            <Search className="h-4 w-4" />
          )}
        </button>
        <Input
          type="search"
          placeholder="Search PubMed, Europe PMC, OpenAlex…"
          className="h-11 w-full pl-11 text-base"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={isSearching}
          enterKeyHint="search"
          aria-label="Literature search query"
        />
      </div>
      {showFilters && (
        <div className="shrink-0">
          <AiSearchFilters value={filters!} onChange={onFiltersChange!} />
        </div>
      )}
    </form>
  )
}

interface SearchTabProps {
  query: string
  setQuery: (query: string) => void
  searchResults: SearchPaper[]
  isSearching: boolean
  hasSearched: boolean
  onSearch: () => void
  /** When true, omits the search form (parent renders it above the tab strip). */
  resultsOnly?: boolean
  onStagePaper: (paper: SearchPaper) => void | Promise<void>
  onOpenStaged?: (paper: SearchPaper) => void
  isPaperStaged: (paperId: string) => boolean
  isPaperStaging?: (paperId: string) => boolean
  sortMode: PaperSearchSortMode
  onSortModeChange: (sort: PaperSearchSortMode) => void
  openAccessOnly: boolean
  onOpenAccessOnlyChange: (value: boolean) => void
  /** Optional project scope so AI-search "Save" lands in the right project. */
  projectId?: string | null
  /** AI result filters (controlled by the host so the main search bar owns them). */
  filters?: AiResultFilters
  onFiltersChange?: (next: AiResultFilters) => void
}

export function SearchTab({
  query,
  setQuery,
  searchResults,
  isSearching,
  hasSearched,
  onSearch,
  resultsOnly = false,
  onStagePaper,
  onOpenStaged,
  isPaperStaged,
  isPaperStaging,
  sortMode,
  onSortModeChange,
  openAccessOnly,
  onOpenAccessOnlyChange,
  projectId,
  filters: filtersProp,
  onFiltersChange,
}: SearchTabProps) {
  // AI search is the primary experience; the database list is a fallback.
  const [aiMode, setAiMode] = useState(true)
  // Filters are controlled by the host when provided (so the main search bar
  // owns them); otherwise managed locally.
  const [localFilters, setLocalFilters] = useState<AiResultFilters>(DEFAULT_AI_FILTERS)
  const aiFilters = filtersProp ?? localFilters
  const setAiFilters = onFiltersChange ?? setLocalFilters
  const exampleSearches = [
    'CRISPR gene editing in cancer therapy',
    'COVID-19 vaccine efficacy studies',
    'Machine learning in drug discovery',
    "Alzheimer's disease biomarkers",
  ]

  return (
    <div className="space-y-6">
      {!resultsOnly && (
        <LiteratureSearchForm
          query={query}
          setQuery={setQuery}
          isSearching={isSearching}
          onSearch={onSearch}
          filters={aiFilters}
          onFiltersChange={setAiFilters}
        />
      )}

      {/* Database fallback toggle (filters live in the main search bar). */}
      {hasSearched && (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground hover:text-foreground"
            onClick={() => setAiMode((v) => !v)}
          >
            {aiMode ? (
              <>
                <Database className="size-4" />
                {`Database results${searchResults.length ? ` (${searchResults.length})` : ''}`}
              </>
            ) : (
              <>
                <Wand2 className="size-4" />
                Back to search results
              </>
            )}
          </Button>
        </div>
      )}

      {/* Kept mounted so AI results persist across tab switches (no re-fetch). */}
      {hasSearched && (
        <div className={aiMode ? 'block' : 'hidden'}>
          <AiSearchView
            query={query}
            projectId={projectId}
            papers={searchResults}
            filters={aiFilters}
            onStagePaper={onStagePaper}
            onOpenStaged={onOpenStaged}
            isPaperStaged={isPaperStaged}
            isPaperStaging={isPaperStaging}
          />
        </div>
      )}

      {!hasSearched && (
        <div className="mx-auto flex max-w-3xl flex-col items-center py-10 text-center">
          <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10">
            <Wand2 className="size-7 text-primary" />
          </div>
          <h3 className="mb-2 text-xl font-semibold text-foreground">AI-powered literature search</h3>
          <p className="mb-7 max-w-xl text-muted-foreground">
            Ask a question and get a cited AI summary plus the most relevant papers — searched across
            PubMed, Europe PMC, and OpenAlex.
          </p>

          {/* Feature highlights */}
          <div className="mb-8 grid w-full grid-cols-1 gap-3 text-left sm:grid-cols-2">
            {SEARCH_FEATURES.map((f) => (
              <div
                key={f.title}
                className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/20 p-3"
              >
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <f.Icon className="size-4" aria-hidden />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{f.title}</p>
                  <p className="text-xs leading-snug text-muted-foreground">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Example queries */}
          <div className="w-full">
            <p className="mb-2 text-sm font-medium text-muted-foreground">Try an example</p>
            <div className="flex flex-wrap justify-center gap-2">
              {exampleSearches.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => setQuery(example)}
                  className="rounded-full border border-border bg-background px-3 py-1.5 text-sm text-foreground/80 transition-colors hover:border-primary/40 hover:text-primary"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {hasSearched && !aiMode && (
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
                <strong className="font-medium text-foreground">Newest first</strong> orders the matches you
                already found by publication year (newest at the top).
              </>
            ) : (
              <>
                Use <strong className="font-medium text-foreground">Sort by</strong> and the Open filter to
                reorder the papers you already found — instantly, without running a new search.
              </>
            )}
          </p>
        </div>
      )}

      {hasSearched && !aiMode && isSearching && searchResults.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 className="mb-4 h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Searching databases…</p>
        </div>
      )}

      {hasSearched && !aiMode && !isSearching && searchResults.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Search className="mb-4 h-12 w-12 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground">No papers found. Try different keywords or uncheck Open.</p>
        </div>
      )}

      {hasSearched && !aiMode && searchResults.length > 0 && (
        <ul className="list-none space-y-4 p-0">
          {searchResults.map((paper, index) => (
            <li
              key={`${[paper.pmid, paper.doi, paper.id, paper.source].filter(Boolean).join('|')}|y:${paper.year}|i:${index}`}
            >
              <PaperSearchCard
                paper={paper}
                onStage={onStagePaper}
                onOpenStaged={onOpenStaged}
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
