'use client'

import { useState } from 'react'
import { PaperSearchSortMode, SearchPaper } from '@/types/paper-search'
import { Input } from '@/components/ui/input'
import {
  Search,
  Loader2,
  Database,
  Unlock,
  Telescope,
  ScrollText,
  MessageCircle,
  Highlighter,
  NotebookPen,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { AiSearchView } from './ai-search-view'
import { AiSearchFilters } from './ai-search-filters'
import { DEFAULT_AI_FILTERS, type AiResultFilters } from '@/lib/ai-search-filters'

/** What the AI literature search offers — shown on the empty (pre-search) state. */
const SEARCH_FEATURES: { Icon: LucideIcon; title: string; desc: string }[] = [
  {
    Icon: ScrollText,
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
    <form onSubmit={handleSearch} className="mx-auto w-full max-w-3xl">
      <div
        className={cn(
          'group relative flex items-center gap-2 rounded-2xl border border-border/70 bg-card/70 p-1.5 pl-4 shadow-sm backdrop-blur-md',
          'transition-all duration-300',
          'focus-within:border-primary/45 focus-within:bg-card focus-within:shadow-[0_12px_40px_-16px_var(--n9-accent-glow)]',
        )}
      >
        <Telescope className="size-[18px] shrink-0 text-primary/70 transition-colors group-focus-within:text-primary" aria-hidden />
        <Input
          type="search"
          placeholder="Ask a research question, or search papers…"
          className="h-12 flex-1 border-0 bg-transparent px-0 text-base shadow-none placeholder:text-muted-foreground/70 focus-visible:ring-0 focus-visible:ring-offset-0"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={isSearching}
          enterKeyHint="search"
          aria-label="Literature search query"
        />
        {showFilters && (
          <div className="shrink-0">
            <AiSearchFilters
              value={filters!}
              onChange={onFiltersChange!}
              triggerClassName="h-10 rounded-xl"
            />
          </div>
        )}
        <button
          type="submit"
          disabled={isSearching || !query.trim()}
          aria-label="Search"
          title="Search"
          className={cn(
            'flex h-11 shrink-0 items-center gap-1.5 rounded-xl px-4 text-sm font-medium',
            'bg-primary text-primary-foreground shadow-sm',
            'transition-all duration-200 hover:bg-[var(--n9-accent-hover)] hover:shadow-[0_6px_18px_-8px_var(--n9-accent-glow)]',
            'disabled:pointer-events-none disabled:opacity-50',
          )}
        >
          {isSearching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          <span className="hidden sm:inline">Search</span>
        </button>
      </div>
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
  /**
   * The submitted query to drive the AI search with. Decoupled from the live
   * input `query` so typing a new search doesn't re-run / flash the AI; defaults
   * to `query` when not provided.
   */
  aiQuery?: string
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
  aiQuery,
}: SearchTabProps) {
  // The AI runs on the submitted query (falls back to the live query).
  const effectiveAiQuery = aiQuery ?? query
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

      {/* AI search is the only results experience. The database search still runs
          under the hood to match cited papers (passed as `papers`), but its raw
          list is no longer surfaced. */}
      {hasSearched && (
        <AiSearchView
          query={effectiveAiQuery}
          projectId={projectId}
          papers={searchResults}
          filters={aiFilters}
          onFiltersChange={setAiFilters}
          onStagePaper={onStagePaper}
          onOpenStaged={onOpenStaged}
          isPaperStaged={isPaperStaged}
          isPaperStaging={isPaperStaging}
        />
      )}

      {!hasSearched && (
        <div className="relative mx-auto flex max-w-3xl flex-col items-center py-10 text-center">
          <div className="mb-5 flex size-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[0_12px_30px_-12px_var(--n9-accent-glow)] duration-700 animate-in fade-in zoom-in-50">
            <Telescope className="size-8" />
          </div>
          <h3 className="mb-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            AI-powered literature search
          </h3>
          <p className="mb-8 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
            Ask a question and get a cited AI summary plus the most relevant papers — searched across
            PubMed, Europe PMC, and OpenAlex.
          </p>

          {/* Feature highlights */}
          <div className="mb-9 grid w-full grid-cols-1 gap-3 text-left sm:grid-cols-2">
            {SEARCH_FEATURES.map((f, i) => (
              <div
                key={f.title}
                style={{ animationDelay: `${i * 60}ms` }}
                className="group flex items-start gap-3 rounded-2xl border border-border/60 bg-card/50 p-3.5 shadow-sm backdrop-blur-sm transition-all duration-300 fill-mode-both hover:-translate-y-0.5 hover:border-primary/30 hover:bg-card hover:shadow-[0_10px_28px_-16px_var(--n9-accent-glow)] animate-in fade-in slide-in-from-bottom-2"
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <f.Icon className="size-[18px]" aria-hidden />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{f.title}</p>
                  <p className="text-xs leading-snug text-muted-foreground">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Example queries */}
          <div className="w-full">
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Try an example
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {exampleSearches.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => setQuery(example)}
                  className="group inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card/60 px-3.5 py-1.5 text-sm text-foreground/80 shadow-sm backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:text-primary hover:shadow-[0_6px_16px_-8px_var(--n9-accent-glow)]"
                >
                  {example}
                  <ArrowRight className="size-3.5 -translate-x-1 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100" aria-hidden />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
