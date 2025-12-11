'use client'

import { SearchPaper } from '@/types/paper-search';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ExternalLink, FileText, Lock, Unlock, ChevronDown, ChevronUp, Plus, Check } from 'lucide-react';
import { useState } from 'react';

interface PaperSearchCardProps {
  paper: SearchPaper;
  onStage?: (paper: SearchPaper) => void;
  isStaged?: boolean;
  hideActions?: boolean;
}

export function PaperSearchCard({ paper, onStage, isStaged = false, hideActions = false }: PaperSearchCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const getSourceColor = (source: string) => {
    switch (source) {
      case 'PubMed':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'BioRxiv':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'MedRxiv':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getExternalLink = () => {
    if (paper.doi) {
      return `https://doi.org/${paper.doi}`;
    } else if (paper.pmid) {
      return `https://pubmed.ncbi.nlm.nih.gov/${paper.pmid}/`;
    }
    return null;
  };

  const externalLink = getExternalLink();

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={`text-xs ${getSourceColor(paper.source)}`}>
              {paper.source}
            </Badge>
            <Badge
              variant="outline"
              className={`text-xs flex items-center gap-1 ${
                paper.isOpenAccess
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}
            >
              {paper.isOpenAccess ? (
                <>
                  <Unlock size={10} />
                  Open Access
                </>
              ) : (
                <>
                  <Lock size={10} />
                  Closed
                </>
              )}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {paper.journal} • {paper.year}
            </span>
          </div>
        </div>

        <h3 className="text-lg font-semibold text-foreground mb-2 leading-tight">
          {paper.title}
        </h3>

        <p className="text-sm text-muted-foreground mb-3">
          {paper.authors.join(', ')}
        </p>

        {paper.doi && (
          <p className="text-xs text-muted-foreground mb-3">
            DOI: {paper.doi}
          </p>
        )}

        {/* Abstract preview/full */}
        <div className="bg-muted/50 rounded-md p-3 mb-4">
          <p className={`text-sm text-foreground leading-relaxed ${!isExpanded && 'line-clamp-3'}`}>
            {paper.abstract}
          </p>
          {paper.abstract.length > 200 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="mt-2 h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
            >
              {isExpanded ? (
                <>
                  <ChevronUp size={14} className="mr-1" />
                  Show less
                </>
              ) : (
                <>
                  <ChevronDown size={14} className="mr-1" />
                  Read more
                </>
              )}
            </Button>
          )}
        </div>

        {/* Actions */}
        {!hideActions && (
          <div className="flex items-center gap-3 pt-3 border-t">
            {externalLink && (
              <Button variant="outline" size="sm" asChild>
                <a href={externalLink} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={14} className="mr-2" />
                  View Source
                </a>
              </Button>
            )}
            {paper.pdfUrl && (
              <Button variant="outline" size="sm" asChild>
                <a href={paper.pdfUrl} target="_blank" rel="noopener noreferrer">
                  <FileText size={14} className="mr-2" />
                  PDF
                </a>
              </Button>
            )}
            
            <div className="flex-1"></div>
            
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
