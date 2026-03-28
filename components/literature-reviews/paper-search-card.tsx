'use client'

import { SearchPaper } from '@/types/paper-search';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Download, ExternalLink, FileText, Lock, Unlock, ChevronDown, ChevronUp, Plus, Check, Database, X, Loader2 } from 'lucide-react';
import { useState } from 'react';

function stripDoiToBare(doi: string): string {
  return doi
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .trim()
}

/** Resolver URL for the paper: publisher page, DOI, or PubMed. */
function resolvePaperExternalUrl(paper: SearchPaper): string | null {
  const article = paper.articlePageUrl?.trim()
  if (article && /^https?:\/\//i.test(article)) {
    return article
  }
  const rawDoi = paper.doi?.trim()
  if (rawDoi) {
    const bare = stripDoiToBare(rawDoi)
    if (bare.length > 0) {
      return `https://doi.org/${bare}`
    }
  }
  const pm = paper.pmid?.trim()
  if (pm) {
    return `https://pubmed.ncbi.nlm.nih.gov/${pm}/`
  }
  return null
}

interface PaperSearchCardProps {
  paper: SearchPaper;
  onStage?: (paper: SearchPaper) => void | Promise<void>;
  onSave?: (paper: SearchPaper) => Promise<void>;
  onSaveToRepository?: (paper: SearchPaper) => Promise<void>;
  onRemove?: (paperId: string) => void;
  isStaged?: boolean;
  isSaving?: boolean;
  isStaging?: boolean;
  hideActions?: boolean;
  compact?: boolean;
}

export function PaperSearchCard({ paper, onStage, onSave, onSaveToRepository, onRemove, isStaged = false, isSaving = false, isStaging = false, hideActions = false, compact = false }: PaperSearchCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const getSourceColor = (source: string) => {
    switch (source) {
      case "PubMed":
        return "bg-blue-100 text-blue-800 border-blue-200"
      case "Europe PMC":
        return "bg-cyan-100 text-cyan-900 border-cyan-200 dark:bg-cyan-950/50 dark:text-cyan-100 dark:border-cyan-800"
      case "OpenAlex":
        return "bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-950/50 dark:text-amber-100 dark:border-amber-800"
      case "BioRxiv":
        return "bg-green-100 text-green-800 border-green-200"
      case "MedRxiv":
        return "bg-purple-100 text-purple-800 border-purple-200"
      default:
        return "bg-gray-100 text-gray-800 border-gray-200"
    }
  }

  const externalLink = resolvePaperExternalUrl(paper)

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className={compact ? "p-4" : "p-5"}>
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

        <h3 className={`${compact ? 'text-base' : 'text-lg'} font-semibold text-foreground mb-2 leading-tight`}>
          {externalLink ? (
            <a
              href={externalLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground hover:underline underline-offset-2 decoration-foreground/50"
            >
              {paper.title}
            </a>
          ) : (
            paper.title
          )}
        </h3>

        <p className="text-sm text-muted-foreground mb-3">
          {paper.authors.join(', ')}
        </p>

        {paper.citedByCount != null && paper.citedByCount > 0 && (
          <p className="text-xs text-muted-foreground mb-2">
            Citations: {paper.citedByCount.toLocaleString()}
          </p>
        )}

        {paper.doi && (
          <p className="text-xs text-muted-foreground mb-3">
            DOI:{" "}
            {externalLink ? (
              <a
                href={externalLink}
                target="_blank"
                rel="noopener noreferrer"
                title={
                  paper.articlePageUrl
                    ? "Open publisher article page"
                    : "Resolve DOI (publisher site)"
                }
                className="font-medium text-primary underline-offset-2 underline hover:text-primary"
              >
                {stripDoiToBare(paper.doi) || paper.doi}
              </a>
            ) : (
              stripDoiToBare(paper.doi) || paper.doi
            )}
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
              <Button variant="outline" size="icon" asChild title="View source">
                <a href={externalLink} target="_blank" rel="noopener noreferrer" aria-label="View source">
                  <ExternalLink size={14} />
                </a>
              </Button>
            )}
            {paper.pdfUrl && (
              <Button variant="outline" size="icon" asChild title="Open PDF">
                <a href={paper.pdfUrl} target="_blank" rel="noopener noreferrer" aria-label="Open PDF">
                  <FileText size={14} />
                </a>
              </Button>
            )}
            <div className="flex-1"></div>
            
            {/* Staging mode actions */}
            {onSave && onRemove && (
              <>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => onRemove(paper.id)}
                  className="hover:bg-destructive hover:text-destructive-foreground"
                  title="Close staged paper"
                  aria-label="Close staged paper"
                >
                  <X size={14} />
                </Button>
                <Button
                  variant="default"
                  size="icon"
                  onClick={() => onSave(paper)}
                  disabled={isSaving}
                  title="Save to repository"
                  aria-label="Save to repository"
                >
                  {isSaving ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Database size={14} />
                  )}
                </Button>
              </>
            )}
            
            {/* Search mode actions */}
            {onStage && (
              <>
                <Button
                  variant={isStaged ? "secondary" : "default"}
                  size="icon"
                  onClick={() => void onStage(paper)}
                  disabled={isStaged || isStaging}
                  title={isStaged ? "Already staged" : isStaging ? "Staging…" : "Stage paper"}
                  aria-label={isStaged ? "Already staged" : isStaging ? "Staging" : "Stage paper"}
                >
                  {isStaging ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : isStaged ? (
                    <Check size={14} />
                  ) : (
                    <Plus size={14} />
                  )}
                </Button>
                {onSaveToRepository && (
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={() => onSaveToRepository(paper)}
                    disabled={isSaving}
                    title="Save to repository"
                    aria-label="Save to repository"
                  >
                    <Database size={14} />
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
