'use client';

import { cn } from '@/lib/utils';
import { MarkdownRenderer } from './markdown-renderer';
import {
  AgentCitationsPanel,
  mergeGroundingAndRagItems,
} from '@/components/catalyst/agent-citations-panel';
import { AgentThinkingBar } from '@/components/catalyst/agent-thinking-bar';
import { AgentToolCards } from '@/components/catalyst/agent-tool-cards';
import type { ThinkingPayload, RagChunksPayload, DonePayload } from '@/lib/agent-stream-types';
import type { ThinkingStage, ToolCard } from '@/hooks/use-agent-stream';

interface ToolOutput {
  tool: string;
  success: boolean;
  details: Record<string, unknown>;
}

interface AgentStreamReplyProps {
  thinkingSteps: ThinkingPayload[];
  /** Current stage from latest thinking event — drives the ThinkingBar */
  currentStage?: ThinkingStage | null;
  currentThinkingMessage?: string | null;
  currentThinkingDetail?: string | null;
  /** Live tool cards from tool_start / tool_result / tool_call events */
  toolCards?: ToolCard[];
  sql: string | null;
  ragChunks: RagChunksPayload | null;
  toolOutputs?: ToolOutput[];
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
  currentStage,
  currentThinkingMessage,
  currentThinkingDetail,
  toolCards = [],
  sql,
  ragChunks,
  toolOutputs = [],
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

  const isStreaming = isThinkingStreaming;
  const hasToolCards = toolCards.length > 0;
  const hasThinkingBar =
    isStreaming &&
    (currentStage != null || currentThinkingMessage != null || thinkingSteps.length > 0);

  if (error) {
    return (
      <div className="rounded-2xl px-4 py-3 text-sm bg-destructive/10 text-destructive border border-destructive/20">
        <p className="font-medium">Error</p>
        <p className="mt-1">{error}</p>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-2.5', compact && 'gap-2')}>

      {/* ── Stage-aware thinking bar (live only) ── */}
      {hasThinkingBar && (
        <AgentThinkingBar
          stage={currentStage ?? null}
          message={currentThinkingMessage ?? null}
          detail={currentThinkingDetail}
          isStreaming={isStreaming}
        />
      )}

      {/* ── Tool cards — live while running, collapsible when done ── */}
      {hasToolCards && (
        <AgentToolCards
          cards={toolCards}
          collapsible={!isStreaming}
        />
      )}

      {/* ── Legacy thinking steps (fallback when no stage/toolCards) ── */}
      {!hasThinkingBar && !hasToolCards && thinkingSteps.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {(isThinkingStreaming
            ? [thinkingSteps[thinkingSteps.length - 1]!]
            : thinkingSteps
          ).map((step, i, arr) => {
            const cleanMessage = step.message
              ?.replace(/^step\s*[-–]\s*/i, '')
              .replace(/^thinking\s*[-–]\s*/i, '')
              .trim() || step.message;
            const isLast = i === arr.length - 1;
            return (
              <div
                key={isThinkingStreaming ? `${step.node}-${step.status}-${step.message}` : i}
                className="flex items-start gap-2 px-1 py-1"
              >
                <span
                  className={cn(
                    'shrink-0 mt-[5px] size-1.5 rounded-full bg-muted-foreground/40',
                    isLast && isThinkingStreaming && 'animate-pulse'
                  )}
                />
                <span className="text-sm text-muted-foreground leading-snug">{cleanMessage}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── SQL query block ── */}
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

      {/* ── Answer bubble ── */}
      {(displayAnswer || (!donePayload && streamedAnswer === '')) && (
        <div className="space-y-2">
          <div className="px-1 text-sm text-foreground min-w-0 max-w-full max-h-[60vh] overflow-auto">
            {donePayload ? (
              /* Stream finished — render full markdown */
              <MarkdownRenderer
                content={displayAnswer}
                className="[&_pre]:max-w-full [&_pre]:max-h-[40vh] [&_pre]:overflow-auto [&_.notes9-md-table-scroll]:max-h-[40vh]"
              />
            ) : displayAnswer ? (
              /* Streaming live — plain pre-wrap so cursor stays truly inline */
              <span className="whitespace-pre-wrap break-words leading-[1.55]">
                {displayAnswer}
                <span
                  className="inline-block w-[3px] h-[1em] bg-foreground/70 rounded-sm animate-cursor-blink ml-0.5 translate-y-[2px]"
                  aria-hidden
                />
              </span>
            ) : (
              /* No content yet — standalone cursor */
              <span
                className="inline-block w-[3px] h-[1em] bg-foreground/70 rounded-sm animate-cursor-blink translate-y-[2px]"
                aria-hidden
              />
            )}
          </div>

          {/* Confidence + tool badge */}
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

      {/* ── Citations panel ── */}
      {hasCitationPanel && (
        <AgentCitationsPanel items={mergedCitationItems} triggerLabel={citationTriggerLabel} />
      )}
    </div>
  );
}
