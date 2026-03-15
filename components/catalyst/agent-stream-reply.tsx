'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { MarkdownRenderer } from './markdown-renderer';
import { formatCitationDisplay } from '@/lib/utils';
import type { ThinkingPayload, RagChunksPayload, DonePayload } from '@/lib/agent-stream-types';

interface AgentStreamReplyProps {
  thinkingSteps: ThinkingPayload[];
  sql: string | null;
  ragChunks: RagChunksPayload | null;
  streamedAnswer: string;
  donePayload: DonePayload | null;
  error: string | null;
  compact?: boolean;
}

function getCitationRoute(citation: { source_type: string; source_id?: string }): string {
  const id = citation.source_id;
  if (!id) return '';
  switch (citation.source_type) {
    case 'literature_review':
      return `/literature-reviews/${id}`;
    case 'protocol':
      return `/protocols/${id}`;
    case 'project':
      return `/projects/${id}`;
    case 'lab_note':
    case 'report':
    default:
      return '';
  }
}

const TOOL_LABELS: Record<string, string> = {
  sql: 'From database',
  rag: 'From documents',
  hybrid: 'Both',
  none: 'General',
};

export function AgentStreamReply({
  thinkingSteps,
  sql,
  ragChunks,
  streamedAnswer,
  donePayload,
  error,
  compact = false,
}: AgentStreamReplyProps) {
  const displayAnswer = donePayload?.answer ?? streamedAnswer;

  if (error) {
    return (
      <div className="rounded-2xl px-4 py-3 text-sm bg-destructive/10 text-destructive border border-destructive/20">
        <p className="font-medium">Error</p>
        <p className="mt-1">{error}</p>
      </div>
    );
  }

  const lastStepIndex = thinkingSteps.length - 1;

  return (
    <div className={cn('flex flex-col gap-3', compact && 'gap-2')}>
      {/* Thinking steps - ChatGPT/Cursor style */}
      {thinkingSteps.length > 0 && (
        <div className="rounded-xl border border-border/60 bg-muted/20 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50 bg-muted/30">
            <span className="inline-flex size-2 rounded-full bg-primary animate-pulse" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Thinking
            </span>
          </div>
          <ul className="divide-y divide-border/40">
            {thinkingSteps.map((step, i) => (
              <li
                key={i}
                className={cn(
                  'px-3 py-2.5 text-sm flex items-start gap-3 transition-colors',
                  i === lastStepIndex && !donePayload
                    ? 'bg-primary/5 text-foreground'
                    : 'text-muted-foreground'
                )}
              >
                <span className="shrink-0 mt-0.5 size-1.5 rounded-full bg-primary/60" />
                <div className="flex-1 min-w-0">
                  <span className="font-medium capitalize text-foreground/90">
                    {step.node.replace(/_/g, ' ')}
                  </span>
                  <span className="text-muted-foreground"> – </span>
                  <span>{step.message}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* SQL query */}
      {sql && (
        <div className="rounded-xl border border-border/60 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50 bg-muted/30">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              SQL Query
            </span>
          </div>
          <pre className="bg-muted/30 p-4 overflow-x-auto text-sm font-mono whitespace-pre-wrap text-foreground/90">
            <code>{sql}</code>
          </pre>
        </div>
      )}

      {/* RAG chunks */}
      {ragChunks && ragChunks.chunks.length > 0 && (
        <div className="rounded-xl border border-border/60 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50 bg-muted/30">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {ragChunks.message}
            </span>
          </div>
          <div className="divide-y divide-border/40 max-h-48 overflow-y-auto">
            {ragChunks.chunks.map((chunk, i) => (
              <div
                key={i}
                className="px-3 py-2.5 text-sm hover:bg-muted/20 transition-colors"
              >
                <p className="text-muted-foreground text-xs mb-1">
                  {chunk.source_name ?? chunk.source_type.replace(/_/g, ' ')} • {(chunk.relevance * 100).toFixed(0)}% relevant
                </p>
                <p className="text-foreground line-clamp-3">{chunk.excerpt}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Answer with optional confidence and tool_used (per Notes9 API) */}
      {(displayAnswer || (!donePayload && streamedAnswer === '')) && (
        <div className="space-y-2">
          <div className="rounded-2xl px-4 py-3 text-sm prose prose-sm dark:prose-invert max-w-none">
            {displayAnswer ? (
              <MarkdownRenderer content={displayAnswer} />
            ) : (
              <span className="text-muted-foreground italic">Generating answer...</span>
            )}
          </div>
          {donePayload && (donePayload.confidence != null || donePayload.tool_used) && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {donePayload.confidence != null && (
                <span
                  className={cn(
                    'rounded-md px-2 py-0.5 font-medium',
                    donePayload.confidence < 0.5
                      ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400/90'
                      : 'bg-muted/50'
                  )}
                >
                  Confidence: {(donePayload.confidence * 100).toFixed(0)}%
                </span>
              )}
              {donePayload.tool_used && (
                <span className="rounded-md bg-muted/50 px-2 py-0.5 font-medium">
                  {TOOL_LABELS[donePayload.tool_used] ?? donePayload.tool_used}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Citations (from done payload); use display_label or source_name as title */}
      {donePayload?.citations && donePayload.citations.length > 0 && (
        <div className="rounded-lg border border-border/50 px-3 py-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            References
          </p>
          <ul className="space-y-1.5 text-sm">
            {donePayload.citations.map((citation, index) => {
              const route = getCitationRoute(citation);
              const displayText = formatCitationDisplay({
                ...citation,
                excerpt: citation.excerpt ?? undefined,
              });
              const title = citation.display_label ?? citation.source_name ?? citation.source_type.replace(/_/g, ' ');
              return (
                <li key={index}>
                  {route ? (
                    <Link
                      href={route}
                      className="text-primary hover:underline"
                    >
                      [{index + 1}] View {title}: {displayText}
                    </Link>
                  ) : (
                    <span>
                      [{index + 1}] {title}: {displayText}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
