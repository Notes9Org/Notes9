'use client';

import { cn } from '@/lib/utils';
import { MarkdownRenderer } from './markdown-renderer';
import {
  AgentCitationsPanel,
  mergeGroundingAndRagItems,
} from '@/components/catalyst/agent-citations-panel';
import type { ThinkingPayload, RagChunksPayload, DonePayload } from '@/lib/agent-stream-types';

interface AgentStreamReplyProps {
  thinkingSteps: ThinkingPayload[];
  sql: string | null;
  ragChunks: RagChunksPayload | null;
  streamedAnswer: string;
  donePayload: DonePayload | null;
  error: string | null;
  compact?: boolean;
  /**
   * When true, only the latest thinking line is shown (replaces previous as steps arrive).
   * When false, all collected steps are listed (after the stream finishes).
   */
  isThinkingStreaming?: boolean;
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
  isThinkingStreaming = false,
}: AgentStreamReplyProps) {
  const displayAnswer =
    donePayload?.content ?? donePayload?.answer ?? streamedAnswer;
  const grounding =
    donePayload?.resources?.length
      ? donePayload.resources
      : donePayload?.citations ?? [];

  const mergedCitationItems = mergeGroundingAndRagItems(grounding, ragChunks?.chunks);
  const hasCitationPanel = mergedCitationItems.length > 0;
  const citationTriggerLabel =
    donePayload?.resources?.length || donePayload?.citations?.length
      ? 'All citations'
      : ragChunks?.message?.trim() || 'Retrieved chunks';

  if (error) {
    return (
      <div className="rounded-2xl px-4 py-3 text-sm bg-destructive/10 text-destructive border border-destructive/20">
        <p className="font-medium">Error</p>
        <p className="mt-1">{error}</p>
      </div>
    );
  }

  const liveSingleStep =
    isThinkingStreaming && thinkingSteps.length > 0
      ? thinkingSteps[thinkingSteps.length - 1]
      : null;
  const stepsForList =
    isThinkingStreaming && liveSingleStep ? [liveSingleStep] : thinkingSteps;
  const lastStepIndex = stepsForList.length - 1;

  return (
    <div className={cn('flex flex-col gap-3', compact && 'gap-2')}>
      {/* Live: one line; after stream: full step list */}
      {stepsForList.length > 0 && (
        <div className="rounded-xl border border-border/60 bg-muted/20 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50 bg-muted/30">
            <span
              className={cn(
                'inline-flex size-2 rounded-full bg-primary',
                isThinkingStreaming && 'animate-pulse'
              )}
            />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {isThinkingStreaming ? 'Thinking' : 'Steps'}
            </span>
          </div>
          <ul className="divide-y divide-border/40">
            {stepsForList.map((step, i) => (
              <li
                key={
                  isThinkingStreaming
                    ? `${step.node}-${step.status}-${step.message}`
                    : i
                }
                className={cn(
                  'px-3 py-2.5 text-sm flex items-start gap-3 transition-colors',
                  isThinkingStreaming || (i === lastStepIndex && !donePayload)
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

      {/* Answer with optional confidence and tool_used (per Notes9 API) */}
      {(displayAnswer || (!donePayload && streamedAnswer === '')) && (
        <div className="space-y-2">
          <div className="rounded-2xl px-4 py-3 text-sm text-foreground min-w-0 max-w-full max-h-[60vh] overflow-auto">
            {displayAnswer ? (
              <MarkdownRenderer
                content={displayAnswer}
                className="[&_pre]:max-w-full [&_pre]:max-h-[40vh] [&_pre]:overflow-auto [&_table]:max-h-[40vh] [&_table]:overflow-auto"
              />
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

      {/* RAG chunks + done `resources`, merged and deduped; each row links with ?highlight= (excerpt in payload). */}
      {hasCitationPanel && (
        <AgentCitationsPanel items={mergedCitationItems} triggerLabel={citationTriggerLabel} />
      )}
    </div>
  );
}
