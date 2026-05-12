'use client';

import { cn } from '@/lib/utils';
import { MarkdownRenderer } from './markdown-renderer';
import {
  AgentCitationsPanel,
  mergeGroundingAndRagItems,
} from '@/components/catalyst/agent-citations-panel';
import type { ThinkingPayload, RagChunksPayload, DonePayload } from '@/lib/agent-stream-types';

interface ToolOutput {
  tool: string;
  success: boolean;
  details: Record<string, unknown>;
}

interface AgentStreamReplyProps {
  thinkingSteps: ThinkingPayload[];
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

function formatToolOutput(output: ToolOutput): string {
  const { tool, details } = output;

  if (tool === 'sql') {
    const fileNames = details.file_names as string[] | undefined;
    const rowCount = details.row_count as number | undefined;
    if (fileNames && fileNames.length > 0) {
      const preview = fileNames.slice(0, 3).join(', ');
      const more = fileNames.length > 3 ? ` and ${fileNames.length - 3} more` : '';
      return `Found ${rowCount || fileNames.length} results: ${preview}${more}`;
    }
    return `Found ${rowCount || 0} results from database`;
  }

  if (tool === 'rag') {
    const docNames = details.document_names as string[] | undefined;
    const chunkCount = details.chunk_count as number | undefined;
    if (docNames && docNames.length > 0) {
      const preview = docNames.slice(0, 3).join(', ');
      const more = docNames.length > 3 ? ' and more' : '';
      return `Retrieved ${chunkCount || docNames.length} chunks from: ${preview}${more}`;
    }
    return `Retrieved ${chunkCount || 0} document chunks`;
  }

  return `${tool} completed`;
}

export function AgentStreamReply({
  thinkingSteps,
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
      {/* Tool outputs - show file names and summaries */}
      {toolOutputs.length > 0 && !compact && (
        <div className="rounded-lg border border-blue-200 bg-blue-50/50 px-3 py-2 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-100">
          {toolOutputs.map((output, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-blue-600 dark:text-blue-400">•</span>
              <span>{formatToolOutput(output)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Live: one line; after stream: full step list */}
      {stepsForList.length > 0 && (
        <div className="rounded-xl border border-border/60 bg-muted/20 overflow-hidden">
          <ul className="divide-y divide-border/40">
            {stepsForList.map((step, i) => {
              const cleanMessage = step.message
                ?.replace(/^step\s*[-–]\s*/i, '')
                .replace(/^thinking\s*[-–]\s*/i, '')
                .trim() || step.message;

              return (
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
                  <span
                    className={cn(
                      'shrink-0 mt-0.5 size-1.5 rounded-full bg-primary/60',
                      isThinkingStreaming && i === lastStepIndex && 'animate-pulse'
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <span>{cleanMessage}</span>
                  </div>
                </li>
              );
            })}
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
              <>
                <MarkdownRenderer
                  content={displayAnswer}
                  className="[&_pre]:max-w-full [&_pre]:max-h-[40vh] [&_pre]:overflow-auto [&_.notes9-md-table-scroll]:max-h-[40vh]"
                />
                {/* Blinking cursor while streaming */}
                {!donePayload && (
                  <span
                    className="inline-block w-[3px] h-[1em] bg-foreground/70 rounded-sm animate-cursor-blink ml-0.5 translate-y-[2px]"
                    aria-hidden
                  />
                )}
              </>
            ) : (
              <span
                className="inline-block w-[3px] h-[1em] bg-foreground/70 rounded-sm animate-cursor-blink translate-y-[2px]"
                aria-hidden
              />
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
