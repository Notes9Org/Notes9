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
import type { CitationsManifest, ThinkingStage, ToolCard } from '@/hooks/use-agent-stream';

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
  /** Per-run citation manifest keyed by display number (e.g. "1", "2").
   * Drives the inline `[N]` chip post-processor in MarkdownRenderer. */
  citationsManifest?: CitationsManifest | null;
  error: string | null;
  compact?: boolean;
  /**
   * When true, only the latest thinking line is shown (replaces previous as steps arrive).
   * When false, all collected steps are listed (after the stream finishes).
   */
  isThinkingStreaming?: boolean;
}

// Display labels only. Unknown keys fall through to the raw value via the
// `?? donePayload.tool_used` guard at the usage site — no schema lock-in.
const TOOL_LABELS: Record<string, string> = {
  sql: 'From your records',
  rag: 'From your documents',
  hybrid: 'Records + documents',
  biomni: 'From biomedical synthesis',
  web: 'From the web',
  clarification: 'Awaiting your reply',
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
  streamedAnswer,
  donePayload,
  citationsManifest = null,
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

      {/* ── Tool calls — single vertical stack. Every call rendered as a
            Cursor/Claude-style bordered block with status, args preview, and
            expandable result. Always-visible while streaming so the user can
            watch each tool run; collapses to "Used N tools" once settled to
            keep the bubble tight. The horizontal pipeline strip has been
            removed per user request. ── */}
      {hasToolCards && (
        <AgentToolCards
          cards={toolCards}
          collapsible={!isStreaming}
        />
      )}

      {/* ── One-line "what stage is the agent in" indicator — only shown
            before any tool has fired so the user knows the agent is alive. ── */}
      {isStreaming && currentThinkingMessage && !hasToolCards && (
        <AgentThinkingBar
          stage={currentStage ?? null}
          message={currentThinkingMessage ?? null}
          detail={currentThinkingDetail}
          isStreaming={isStreaming}
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

      {/* ── Answer bubble — no inner scroll. The message grows naturally and
            the parent scroll container handles overflow. The old `max-h-[60vh]
            overflow-auto` created a second scrollbar inside each reply, which
            fought the outer chat scroll and felt broken. Code blocks keep
            their horizontal scroll only (long lines still need it). ── */}
      {(displayAnswer || (!donePayload && streamedAnswer === '')) && (
        <div className="space-y-2">
          <div className="px-1 text-sm text-foreground min-w-0 max-w-full">
            {displayAnswer ? (
              <MarkdownRenderer
                content={displayAnswer}
                showCursor={!donePayload}
                className="[&_pre]:max-w-full [&_pre]:overflow-x-auto"
                citationsManifest={citationsManifest}
              />
            ) : (
              /* No content yet — standalone cursor */
              <span
                className="inline-block h-4 w-1 bg-foreground/70 rounded-sm animate-cursor-blink translate-y-[2px]"
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
