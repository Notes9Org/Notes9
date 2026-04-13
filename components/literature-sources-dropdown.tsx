'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BookOpen, ChevronDown, ExternalLink, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { buildHighlightUrl } from '@/lib/document-highlight';
import type { PaperAnalyzerReference } from '@/lib/literature-agent-types';

const SENTENCE_PREVIEW = 320;

function literatureReviewPath(id: string): string {
  return `/literature-reviews/${encodeURIComponent(id)}`;
}

function doiHref(doi: string): string {
  const d = doi.trim().replace(/^https?:\/\/doi\.org\//i, '');
  return `https://doi.org/${encodeURIComponent(d)}`;
}

function ReferenceBlock({ item: r }: { item: PaperAnalyzerReference }) {
  const id = r.literature_review_id?.trim();
  const title = r.title?.trim() || 'Untitled reference';
  const sentences = r.supporting_sentences?.filter(Boolean) ?? [];

  // Build highlight link using the first supporting sentence
  const highlightHref = id && sentences.length > 0
    ? buildHighlightUrl({
        sourceType: 'literature_review',
        sourceId: id,
        excerpt: sentences[0],
      })
    : null;

  const titleHref = highlightHref || (id ? literatureReviewPath(id) : null);

  return (
    <li className="px-3 py-2.5 text-sm">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="font-mono text-xs text-muted-foreground tabular-nums">[{r.index}]</span>
        {titleHref ? (
          <Link
            href={titleHref}
            className="min-w-0 flex-1 font-medium text-primary hover:underline inline-flex items-baseline gap-1"
          >
            {highlightHref && <MapPin className="size-3 shrink-0 self-center text-primary/70" />}
            {title}
          </Link>
        ) : (
          <span className="min-w-0 flex-1 font-medium">{title}</span>
        )}
      </div>
      {(r.doi?.trim() || r.pmid?.trim()) && (
        <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          {r.doi?.trim() && (
            <a
              href={doiHref(r.doi)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 hover:text-foreground"
            >
              DOI
              <ExternalLink className="size-3" aria-hidden />
            </a>
          )}
          {r.pmid?.trim() && (
            <a
              href={`https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(r.pmid.trim())}/`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 hover:text-foreground"
            >
              PubMed
              <ExternalLink className="size-3" aria-hidden />
            </a>
          )}
        </div>
      )}
      {r.note?.trim() && (
        <p className="mt-1.5 text-xs italic text-muted-foreground">{r.note.trim()}</p>
      )}
      {sentences.length > 0 && (
        <div className="mt-2 space-y-1 border-l-2 border-muted pl-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Supporting text
          </p>
          {sentences.map((s, i) => {
            let t = s.trim();
            const fullText = t;
            if (t.length > SENTENCE_PREVIEW) t = `${t.slice(0, SENTENCE_PREVIEW - 1)}…`;
            const sentenceHighlightHref = id
              ? buildHighlightUrl({
                  sourceType: 'literature_review',
                  sourceId: id,
                  excerpt: fullText,
                })
              : null;
            return sentenceHighlightHref ? (
              <Link
                key={i}
                href={sentenceHighlightHref}
                className="flex items-start gap-1 text-xs leading-snug text-muted-foreground hover:text-foreground transition-colors"
              >
                <MapPin className="size-3 mt-0.5 shrink-0 text-primary/60" />
                <span>{t}</span>
              </Link>
            ) : (
              <p key={i} className="text-xs leading-snug text-muted-foreground">
                {t}
              </p>
            );
          })}
        </div>
      )}
    </li>
  );
}

export interface LiteratureSourcesDropdownProps {
  refs: PaperAnalyzerReference[];
  className?: string;
  defaultOpen?: boolean;
}

/**
 * One source: compact inline link. Multiple sources: collapsed-by-default panel listing all citations.
 */
export function LiteratureSourcesDropdown({
  refs,
  className,
  defaultOpen = false,
}: LiteratureSourcesDropdownProps) {
  const sorted = [...refs].sort((a, b) => a.index - b.index);
  if (sorted.length === 0) return null;

  if (sorted.length === 1) {
    const r = sorted[0];
    const id = r.literature_review_id?.trim();
    const title = r.title?.trim() || 'Untitled reference';
    const sentences = r.supporting_sentences?.filter(Boolean) ?? [];
    const singleHighlightHref = id && sentences.length > 0
      ? buildHighlightUrl({
          sourceType: 'literature_review',
          sourceId: id,
          excerpt: sentences[0],
        })
      : null;
    const singleHref = singleHighlightHref || (id ? literatureReviewPath(id) : null);
    return (
      <div
        className={cn(
          'flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground',
          className
        )}
      >
        <BookOpen className="size-3.5 shrink-0" aria-hidden />
        <span className="font-mono tabular-nums text-muted-foreground/80">[{r.index}]</span>
        {singleHref ? (
          <Link href={singleHref} className="font-medium text-primary hover:underline inline-flex items-center gap-1">
            {singleHighlightHref && <MapPin className="size-3 shrink-0 text-primary/70" />}
            {title}
          </Link>
        ) : (
          <span className="font-medium text-foreground">{title}</span>
        )}
      </div>
    );
  }

  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={cn('min-w-0 max-w-xl', className)}>
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-expanded={open}
          className="h-8 gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <BookOpen className="size-3.5 shrink-0" aria-hidden />
          All citations
          <span className="tabular-nums text-muted-foreground">({sorted.length})</span>
          <ChevronDown
            className={cn(
              'size-3.5 shrink-0 opacity-70 transition-transform duration-200',
              open && 'rotate-180'
            )}
            aria-hidden
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent
        className={cn(
          'mt-2 overflow-hidden rounded-lg border border-border/60 bg-muted/20',
          'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
          'data-[state=open]:animate-in data-[state=open]:fade-in-0'
        )}
      >
        <ul className="max-h-[min(22rem,55vh)] divide-y divide-border/60 overflow-y-auto">
          {sorted.map((r) => (
            <ReferenceBlock key={`${r.index}-${r.literature_review_id ?? r.title}`} item={r} />
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
