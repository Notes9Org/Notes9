'use client'

import { useEffect, useRef, useState } from 'react'
import { PaperSearchSortMode, SearchPaper } from '@/types/paper-search'
import { Input } from '@/components/ui/input'
import {
  X,
  Square,
  Sparkles,
  Database,
  Unlock,
  Mic,
  Telescope,
  ScrollText,
  MessageCircle,
  Highlighter,
  NotebookPen,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { AiSearchView } from './ai-search-view'
import { AiSearchFilters } from './ai-search-filters'
import { MotionList, MotionItem } from './motion'
import { DEFAULT_AI_FILTERS, type AiResultFilters } from '@/lib/ai-search-filters'
import { useAwsTranscribe } from '@/hooks/use-aws-transcribe'
import { VoiceWaveform } from '@/components/text-editor/voice-waveform'

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
    title: 'Save to your library',
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

/** Rotating example questions typed into the empty bar — signals that this is
 *  a natural-language AI search, not a keyword box. */
const AI_PROMPTS = [
  'Find ASO kidney and plasma PK data across species',
  'Summarize the evidence on GalNAc-siRNA liver delivery',
  'Compare knockdown efficiency of gapmer vs siRNA designs',
  'Papers measuring tissue half-life of 2′-MOE oligonucleotides',
]

/** Types the prompts in and out, one character at a time, and cycles them.
 *  Pauses while the field is focused or has a value; static under
 *  prefers-reduced-motion. Returns the placeholder string to show. */
function useTypewriterPlaceholder(active: boolean): string {
  const [text, setText] = useState(AI_PROMPTS[0])

  useEffect(() => {
    if (!active) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      setText(AI_PROMPTS[0])
      return
    }

    let prompt = 0
    let chars = 0
    let deleting = false
    let timer: ReturnType<typeof setTimeout>

    const tick = () => {
      const full = AI_PROMPTS[prompt]
      chars += deleting ? -1 : 1
      setText(full.slice(0, chars))

      if (!deleting && chars >= full.length) {
        deleting = true
        timer = setTimeout(tick, 2000) // hold the finished line
      } else if (deleting && chars <= 0) {
        deleting = false
        prompt = (prompt + 1) % AI_PROMPTS.length
        timer = setTimeout(tick, 320)
      } else {
        timer = setTimeout(tick, deleting ? 22 : 42)
      }
    }

    timer = setTimeout(tick, 900)
    return () => clearTimeout(timer)
  }, [active])

  return text
}

interface LiteratureSearchFormProps {
  query: string
  setQuery: (query: string) => void
  isSearching: boolean
  onSearch: () => void
  /** When set, the busy button becomes a Stop button that aborts the search. */
  onStop?: () => void
  /** When provided, a Filters control is shown inside the search bar. */
  filters?: AiResultFilters
  onFiltersChange?: (next: AiResultFilters) => void
}

export function LiteratureSearchForm({
  query,
  setQuery,
  isSearching,
  onSearch,
  onStop,
  filters,
  onFiltersChange,
}: LiteratureSearchFormProps) {
  const showFilters = !!(filters && onFiltersChange)
  const [focused, setFocused] = useState(false)

  // `setQuery` is a parent-owned setter that only accepts a string (no functional
  // updater). Mirror the live query in a ref so the mic's onFinal callback — which
  // the transcribe hook captures once at start() — appends each finalized segment
  // to the current value instead of overwriting with a stale closure.
  const queryRef = useRef(query)
  useEffect(() => {
    queryRef.current = query
  }, [query])

  // Animate example prompts only when the bar is idle (empty + unfocused).
  const isEmptyIdle = !focused && !query && !isSearching
  const typedPlaceholder = useTypewriterPlaceholder(isEmptyIdle)
  const placeholder = isEmptyIdle
    ? typedPlaceholder
    : 'Ask a research question, or search papers…'

  const { start: startMic, stop: stopMic, isListening, getWaveformData } = useAwsTranscribe({
    onFinal: (text) => {
      // Append each finalized segment to the current query. Update the ref
      // inline too so back-to-back finals chain even before the parent re-renders.
      const base = queryRef.current
      const next = (base ? `${base} ${text}` : text).trimStart()
      queryRef.current = next
      setQuery(next)
    },
    onInterim: () => {},
    onError: (err) => toast.error(err),
  })

  const submit = () => {
    if (!query.trim()) return
    if (isSearching) onStop?.() // cancel the in-flight search before restarting
    onSearch()
  }
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    submit()
  }
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
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
        {/* Indeterminate progress: a segment that fills and sweeps left→right
            along the bottom of the field while an AI search is streaming. */}
        {isSearching && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-4 bottom-[3px] h-[2px] overflow-hidden rounded-full"
          >
            <span className="n9-search-progress block h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-primary to-transparent" />
          </span>
        )}
        {/* Voice-to-text mic (same AWS Transcribe dictation as Catalyst chat).
            The mic anchors the left of the bar and never shifts; the waveform
            renders inline right after it while listening, so the stream stays
            contained inside the bar (it does not float into the margin). */}
        <button
          type="button"
          onClick={() => (isListening ? stopMic() : startMic())}
          aria-label={isListening ? 'Stop dictation' : 'Dictate search query'}
          title={isListening ? 'Stop dictation' : 'Dictate search query'}
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors',
            'hover:text-foreground disabled:pointer-events-none disabled:opacity-50',
            isListening && 'text-red-500 hover:text-red-600',
          )}
        >
          <Mic className="size-4" />
        </button>
        {isListening && (
          <VoiceWaveform getWaveformData={getWaveformData} className="shrink-0" />
        )}
        <Input
          /* type="text" (not "search") so the browser's native clear "×" never
             appears — we render our own below. Placeholder cycles example
             research questions to signal natural-language AI search. */
          type="text"
          placeholder={placeholder}
          className="h-12 flex-1 border-0 bg-transparent px-0 text-base shadow-none placeholder:text-muted-foreground/70 focus-visible:ring-0 focus-visible:ring-offset-0"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
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
        {/* Right control. Searching → Stop. Has text → Clear (×). Empty → a
            faint AI sparkle mark, so the bar reads as AI search. Press Enter to
            search; there is no dedicated Search button. */}
        {isSearching && onStop ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop search"
            title="Stop search"
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-full',
              'bg-primary text-primary-foreground shadow-sm',
              'transition-colors duration-200 hover:bg-[var(--n9-accent-hover)]',
            )}
          >
            <Square className="size-3.5 fill-current" />
          </button>
        ) : query.trim() ? (
          <button
            type="button"
            // Keep focus in the input while clearing.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setQuery('')}
            aria-label="Clear search"
            title="Clear"
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground',
              'transition-colors duration-200 hover:bg-muted hover:text-foreground',
            )}
          >
            <X className="size-4" />
          </button>
        ) : (
          <div
            aria-hidden
            className="flex size-9 shrink-0 items-center justify-center text-primary/55"
          >
            <Sparkles className="n9-ai-twinkle size-[18px]" />
          </div>
        )}
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
  /** Lift the AI-search papers to the host (staging detection, count). */
  onResults?: (papers: SearchPaper[]) => void
  /** Report AI-search loading so the host's search-bar spinner stays in sync. */
  onLoadingChange?: (loading: boolean) => void
  /** Hand the host a `stop()` so the search bar can offer a Stop button. */
  registerStop?: (fn: () => void) => void
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
  onResults,
  onLoadingChange,
  registerStop,
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
          onResults={onResults}
          onLoadingChange={onLoadingChange}
          registerStop={registerStop}
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
          <MotionList className="mb-9 grid w-full grid-cols-1 gap-3 text-left sm:grid-cols-2">
            {SEARCH_FEATURES.map((f) => (
              <MotionItem key={f.title}>
                <div className="group flex h-full items-start gap-3 rounded-2xl border border-border/60 bg-card/50 p-3.5 shadow-sm backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-card hover:shadow-[0_10px_28px_-16px_var(--n9-accent-glow)]">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <f.Icon className="size-[18px]" aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{f.title}</p>
                    <p className="text-xs leading-snug text-muted-foreground">{f.desc}</p>
                  </div>
                </div>
              </MotionItem>
            ))}
          </MotionList>

          {/* Example queries */}
          <div className="w-full">
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Try an example
            </p>
            <MotionList className="flex flex-wrap justify-center gap-2">
              {exampleSearches.map((example) => (
                <MotionItem key={example}>
                  <button
                    type="button"
                    onClick={() => setQuery(example)}
                    className="group inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card/60 px-3.5 py-1.5 text-sm text-foreground/80 shadow-sm backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:text-primary hover:shadow-[0_6px_16px_-8px_var(--n9-accent-glow)]"
                  >
                    {example}
                    <ArrowRight className="size-3.5 -translate-x-1 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100" aria-hidden />
                  </button>
                </MotionItem>
              ))}
            </MotionList>
          </div>
        </div>
      )}

    </div>
  )
}
