'use client'

import { SearchPaper } from '@/types/paper-search';
import { Input } from '@/components/ui/input';
import { Search, Loader2, BookOpen, Sparkles, Database } from 'lucide-react';
import { PaperSearchCard } from './paper-search-card';
import { PerplexitySearchCard } from './perplexity-search-card';
import { useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface PerplexityPaper {
  rank: number;
  title: string;
  summary: string;
  source_url: string;
  publication_year: string | null;
}

interface SearchTabProps {
  query: string;
  setQuery: (query: string) => void;
  searchResults: SearchPaper[];
  isSearching: boolean;
  hasSearched: boolean;
  onSearch: () => void;
  onStagePaper: (paper: SearchPaper) => void;
  isPaperStaged: (paperId: string) => boolean;
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
}: SearchTabProps) {
  const [aiMode, setAiMode] = useState(false);
  const [aiResults, setAiResults] = useState<PerplexityPaper[]>([]);
  const [isAiSearching, setIsAiSearching] = useState(false);
  const [hasAiSearched, setHasAiSearched] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    if (aiMode) {
      // AI mode: Search only from AI
      await handleAiSearch();
    } else {
      // Normal mode: Search only from database
      onSearch();
    }
  };

  const handleAiSearch = async () => {
    if (!query.trim()) return;

    setIsAiSearching(true);
    setHasAiSearched(true);
    setAiResults([]);

    try {
      const response = await fetch('/api/perplexity-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'AI search failed');
      }

      setAiResults(data.results || []);
      
      if (data.results?.length > 0) {
        toast.success(`Found ${data.totalResults} papers`);
      } else {
        toast.info('No papers found for this query');
      }
    } catch (error: any) {
      console.error('AI Search failed:', error);
      toast.error(error.message || 'Failed to perform AI search');
    } finally {
      setIsAiSearching(false);
    }
  };

  // Convert Perplexity paper to SearchPaper format for staging
  const convertToSearchPaper = (paper: PerplexityPaper): SearchPaper => ({
    id: `perplexity-${paper.rank}`,
    title: paper.title,
    authors: [],
    year: paper.publication_year ? parseInt(paper.publication_year) : new Date().getFullYear(),
    journal: 'AI Search Result',
    abstract: paper.summary,
    isOpenAccess: true,
    doi: undefined,
    pdfUrl: paper.source_url,
    source: 'Preprint',
  });

  const handleStageAiPaper = (paper: PerplexityPaper) => {
    onStagePaper(convertToSearchPaper(paper));
  };

  const isAiPaperStaged = (paperTitle: string) => {
    return isPaperStaged(`perplexity-${aiResults.find(p => p.title === paperTitle)?.rank || 0}`);
  };

  const exampleSearches = [
    'CRISPR gene editing in cancer therapy',
    'COVID-19 vaccine efficacy studies',
    'Machine learning in drug discovery',
    'Alzheimer\'s disease biomarkers',
  ];

  const isLoading = aiMode ? isAiSearching : isSearching;
  const showResults = aiMode ? hasAiSearched : hasSearched;
  const currentResults = aiMode ? aiResults : searchResults;

  return (
    <div className="space-y-6">
      {/* Search Bar with Toggle */}
      <form onSubmit={handleSearch} className="space-y-4">
        <div className="relative max-w-3xl mx-auto">
          <Input
            placeholder={aiMode 
              ? "Ask a research question..." 
              : "Search database for papers..."
            }
            className="pl-3 pr-36 h-12 text-base"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={isLoading}
          />
          
          {/* AI Toggle Button - Rightmost part of search bar */}
          <button
            type="button"
            onClick={() => setAiMode(!aiMode)}
            className={cn(
              "absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all border",
              aiMode 
                ? "bg-primary text-primary-foreground border-primary hover:bg-primary/90" 
                : "bg-muted text-muted-foreground border-border hover:bg-muted/80"
            )}
          >
            <Sparkles className={cn("h-4 w-4", aiMode && "animate-pulse")} />
            <span className="hidden sm:inline">AI</span>
            <div className={cn(
              "w-8 h-4 rounded-full relative transition-colors",
              aiMode ? "bg-primary-foreground/30" : "bg-muted-foreground/30"
            )}>
              <div className={cn(
                "absolute top-0.5 w-3 h-3 rounded-full transition-all",
                aiMode ? "left-[18px] bg-primary-foreground" : "left-[2px] bg-background"
              )} />
            </div>
          </button>
        </div>

        {/* AI Mode Indicator */}
        {aiMode && (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            AI mode: Searching with Perplexity AI
          </p>
        )}
      </form>

      {/* Empty State - Before Search */}
      {!showResults && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <BookOpen className="h-16 w-16 text-muted-foreground mb-4 opacity-50" />
          <h3 className="text-lg font-semibold text-foreground mb-2">
            Search Scientific Literature
          </h3>
          <p className="text-muted-foreground mb-4 max-w-md">
            {aiMode 
              ? 'AI mode searches academic papers using Perplexity AI with natural language summaries.'
              : 'Search across PubMed, BioRxiv, and MedRxiv databases.'
            }
          </p>
          {!aiMode && (
            <p className="text-sm text-muted-foreground mb-4">
              💡 Tip: Enable AI mode (toggle in search bar) for AI-powered paper search
            </p>
          )}
          <div className="flex flex-col gap-2 items-start">
            <p className="text-sm font-medium text-muted-foreground mb-1">Try these examples:</p>
            {exampleSearches.map((example, index) => (
              <button
                key={index}
                onClick={() => setQuery(example)}
                className="text-sm text-primary hover:underline text-left"
              >
                • {example}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 className="h-8 w-8 text-primary animate-spin mb-4" />
          <p className="text-muted-foreground">
            {aiMode ? 'AI is searching papers...' : 'Searching databases...'}
          </p>
        </div>
      )}

      {/* No Results */}
      {!isLoading && showResults && currentResults.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Search className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
          <p className="text-muted-foreground">
            No papers found. Try refining your search query.
          </p>
        </div>
      )}

      {/* Database Results */}
      {!isSearching && !aiMode && hasSearched && searchResults.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b pb-3">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Database Results
              </h3>
            </div>
            <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded-full">
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
              />
            ))}
          </div>
        </div>
      )}

      {/* AI Results */}
      {!isAiSearching && aiMode && hasAiSearched && aiResults.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                AI Search Results
              </h3>
            </div>
            <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded-full">
              {aiResults.length} papers
            </span>
          </div>
          <div className="space-y-4">
            {aiResults.map((paper) => (
              <PerplexitySearchCard
                key={paper.rank}
                paper={paper}
                onStage={handleStageAiPaper}
                isStaged={isAiPaperStaged(paper.title)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
