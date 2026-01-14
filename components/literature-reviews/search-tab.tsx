'use client'

import { SearchPaper } from '@/types/paper-search';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Loader2, BookOpen } from 'lucide-react';
import { PaperSearchCard } from './paper-search-card';

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
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch();
    }
  };

  const exampleSearches = [
    'CRISPR gene editing in cancer therapy',
    'COVID-19 vaccine efficacy studies',
    'Machine learning in drug discovery',
    'Alzheimer\'s disease biomarkers',
  ];

  return (
    <div className="space-y-6">
      {/* Search Bar */}
      <form onSubmit={handleSearch} className="space-y-4">
        <div className="relative max-w-3xl">
          <Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
          <Input
            placeholder="Search for papers on..."
            className="pl-10 h-11 text-base"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={isSearching}
          />
        </div>
        <Button type="submit" disabled={isSearching || !query.trim()}>
          {isSearching ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Searching...
            </>
          ) : (
            <>
              <Search className="h-4 w-4 mr-2" />
              Search
            </>
          )}
        </Button>
      </form>

      {/* Empty State - Before Search */}
      {!hasSearched && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <BookOpen className="h-16 w-16 text-muted-foreground mb-4 opacity-50" />
          <h3 className="text-lg font-semibold text-foreground mb-2">
            Search Scientific Literature
          </h3>
          <p className="text-muted-foreground mb-6 max-w-md">
            Search across PubMed, BioRxiv, and MedRxiv databases using natural language queries
          </p>
          <div className="flex flex-col gap-2 items-start">
            <p className="text-sm font-medium text-muted-foreground mb-1">Try these examples:</p>
            {exampleSearches.map((example, index) => (
              <button
                key={index}
                onClick={() => setQuery(example)}
                className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
              >
                • {example}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Loading State */}
      {isSearching && (
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 className="h-8 w-8 text-primary animate-spin mb-4" />
          <p className="text-muted-foreground">Searching databases...</p>
        </div>
      )}

      {/* No Results */}
      {!isSearching && hasSearched && searchResults.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Search className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
          <p className="text-muted-foreground">
            No papers found. Try refining your search query.
          </p>
        </div>
      )}

      {/* Results */}
      {!isSearching && searchResults.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b pb-3">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Search Results
            </h3>
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
    </div>
  );
}
