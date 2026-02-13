'use client'

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ExternalLink, Sparkles, Database, Plus, Check, X, Loader2 } from 'lucide-react';
import { useState } from 'react';

interface PerplexityPaper {
  rank: number;
  title: string;
  summary: string;
  source_url: string;
  publication_year: string | null;
}

interface PerplexitySearchCardProps {
  paper: PerplexityPaper;
  onStage?: (paper: PerplexityPaper) => void;
  onSave?: (paper: PerplexityPaper) => Promise<void>;
  onRemove?: (paperTitle: string) => void;
  isStaged?: boolean;
  isSaving?: boolean;
  hideActions?: boolean;
}

export function PerplexitySearchCard({ 
  paper, 
  onStage, 
  onSave, 
  onRemove, 
  isStaged = false, 
  isSaving = false,
  hideActions = false 
}: PerplexitySearchCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Extract domain for display
  const getDomain = (url: string) => {
    try {
      const domain = new URL(url).hostname.replace('www.', '');
      if (domain.includes('arxiv.org')) return 'arXiv';
      if (domain.includes('doi.org')) return 'DOI';
      if (domain.includes('pubmed')) return 'PubMed';
      if (domain.includes('biorxiv')) return 'bioRxiv';
      if (domain.includes('medrxiv')) return 'medRxiv';
      if (domain.includes('semanticscholar')) return 'Semantic Scholar';
      return domain;
    } catch {
      return 'Source';
    }
  };

  const domain = getDomain(paper.source_url);

  return (
    <Card className="hover:shadow-md transition-shadow border-l-4 border-l-primary">
      <CardContent className="p-5">
        {/* Header with rank and source */}
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 font-semibold">
              #{paper.rank}
            </Badge>
            <Badge variant="outline" className="bg-muted text-muted-foreground">
              <Sparkles className="h-3 w-3 mr-1" />
              AI
            </Badge>
            <Badge variant="outline" className="text-xs">
              {domain}
            </Badge>
            {paper.publication_year && (
              <span className="text-xs text-muted-foreground">
                {paper.publication_year}
              </span>
            )}
          </div>
        </div>

        {/* Title */}
        <h3 className="text-lg font-semibold text-foreground mb-3 leading-tight">
          {paper.title}
        </h3>

        {/* Summary */}
        <div className="bg-muted/50 rounded-md p-3 mb-4 border border-border">
          <p className={`text-sm text-foreground leading-relaxed ${!isExpanded && 'line-clamp-3'}`}>
            {paper.summary}
          </p>
          {paper.summary.length > 150 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="mt-2 h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
            >
              {isExpanded ? 'Show less' : 'Read more'}
            </Button>
          )}
        </div>

        {/* Actions */}
        {!hideActions && (
          <div className="flex items-center gap-3 pt-3 border-t">
            <Button variant="outline" size="sm" asChild>
              <a href={paper.source_url} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={14} className="mr-2" />
                View Source
              </a>
            </Button>
            
            <div className="flex-1"></div>
            
            {/* Staging mode actions */}
            {onSave && onRemove && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onRemove(paper.title)}
                  className="hover:bg-destructive hover:text-destructive-foreground"
                >
                  <X size={14} className="mr-2" />
                  Remove
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => onSave(paper)}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <>
                      <Loader2 size={14} className="mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Database size={14} className="mr-2" />
                      Save to Repository
                    </>
                  )}
                </Button>
              </>
            )}
            
            {/* Search mode actions */}
            {onStage && (
              <Button
                variant={isStaged ? "secondary" : "default"}
                size="sm"
                onClick={() => onStage(paper)}
                disabled={isStaged}
              >
                {isStaged ? (
                  <>
                    <Check size={14} className="mr-2" />
                    Staged
                  </>
                ) : (
                  <>
                    <Plus size={14} className="mr-2" />
                    Stage
                  </>
                )}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
