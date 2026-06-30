'use client';

import { Check, Loader2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MarkdownRenderer } from './markdown-renderer';
import {
  AgentCitationsPanel,
  mergeGroundingAndRagItems,
} from '@/components/catalyst/agent-citations-panel';
import { AgentToolCards } from '@/components/catalyst/agent-tool-cards';
import { AgentArtifactList } from '@/components/catalyst/agent-artifact-card';
import { AgentGraphList } from '@/components/catalyst/agent-graph-view';
import { AgentReasoningPanel } from '@/components/catalyst/agent-reasoning-panel';
import type { ThinkingPayload, RagChunksPayload, DonePayload } from '@/lib/agent-stream-types';
import type {
  CitationsManifest,
  ThinkingStage,
  ToolCard,
  SynthesisPlan,
  AgentArtifact,
  AgentGraph,
} from '@/hooks/use-agent-stream';

/** Escape a string for safe interpolation into a RegExp literal. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface ToolOutput {
  tool: string;
  success: boolean;
  details: Record<string, unknown>;
}

interface AgentStreamReplyProps {
  thinkingSteps: ThinkingPayload[];
  /** Current stage from latest thinking event — still used to gate the
   * legacy thinking-step fallback. The stage stepper UI has been removed. */
  currentStage?: ThinkingStage | null;
  currentThinkingMessage?: string | null;
  currentThinkingDetail?: string | null;
  /** Live tool cards from tool_start / tool_result / tool_call events */
  toolCards?: ToolCard[];
  /** Files the agent generated this turn (from `artifact` events). */
  artifacts?: AgentArtifact[];
  /** Relationship graphs from `graph` events — rendered as native dagre layouts. */
  graphs?: AgentGraph[];
  /** Accumulated reasoning from `thinking_token` events — shown in a collapsible
   * "Thinking" panel, kept out of the answer bubble. */
  reasoning?: string;
  /** Biomni-style synthesis checklist (synthesis_plan / synthesis_step) */
  synthesisPlan?: SynthesisPlan | null;
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
  /** Running count of resolved sources from `citations_update` — drives the
   * live "Gathering sources… N" ticker while the turn is in flight. */
  liveCitationCount?: number;
  /** Server-side cancel handle from `run_started` (HITL only). When present
   * alongside an active stream, a Stop button is shown. */
  runId?: string | null;
  /** Cancels the in-flight run + stream. Wired to the Stop button. */
  onStop?: () => void;
  /** Re-runs the last turn. When provided, an error turn offers "Try again"
   * so a failed run is recoverable in one click instead of a dead end. */
  onRetry?: () => void;
}

// Display labels only. Unknown keys fall through to the raw value via the
// `?? donePayload.tool_used` guard at the usage site — no schema lock-in.
const TOOL_LABELS: Record<string, string> = {
  sql: 'From your records',
  rag: 'From your documents',
  hybrid: 'Records + documents',
  biomni: 'From Cat-Bio synthesis',
  cat_bio: 'From Cat-Bio synthesis',
  web: 'From the web',
  clarification: 'Awaiting your reply',
  none: 'General',
};

export function AgentStreamReply({
  thinkingSteps,
  currentStage,
  currentThinkingMessage,
  toolCards = [],
  artifacts = [],
  graphs = [],
  reasoning = '',
  synthesisPlan = null,
  sql,
  ragChunks,
  streamedAnswer,
  donePayload,
  citationsManifest = null,
  error,
  compact = false,
  isThinkingStreaming = false,
  liveCitationCount = 0,
  onRetry,
}: AgentStreamReplyProps) {
  const displayAnswer =
    donePayload?.content ?? donePayload?.answer ?? streamedAnswer;
  const rawGrounding =
    donePayload?.resources?.length
      ? donePayload.resources
      : donePayload?.citations ?? [];

  // Only surface resources whose marker is actually present in the answer
  // text. Key the presence check on each resource's cite_label (now reliably
  // on the wire) and fall back to the array position for legacy payloads. The
  // previous position-based negation heuristic was removed — it could drop
  // valid citations whenever the agent mentioned a source near a negating
  // phrase, and the manifest is now authoritative for what's cited.
  const body = displayAnswer ?? '';
  const grounding = rawGrounding.filter((r, i) => {
    const label =
      typeof r.cite_label === 'string' && r.cite_label.trim()
        ? r.cite_label.trim()
        : String(i + 1);
    // Match the base document marker too ("3.2" → still cited if "[3.2]" or any
    // "[3.x]" appears). Use anchored brackets, NOT substring includes — a plain
    // `.includes("[1]")` falsely matches "[10]"/"[11]". The base regex covers
    // "[3]" and any "[3.<n>]"; the exact `[label]` check covers odd labels.
    const base = label.split('.')[0];
    return (
      new RegExp(`\\[${escapeRegExp(base)}(?:\\.\\d+)?\\]`).test(body) ||
      body.includes(`[${label}]`)
    );
  });

  const mergedCitationItems = mergeGroundingAndRagItems(grounding, ragChunks?.chunks);
  const hasCitationPanel = mergedCitationItems.length > 0;
  const citationTriggerLabel =
    donePayload?.resources?.length || donePayload?.citations?.length
      ? 'All citations'
      : ragChunks?.message?.trim() || 'Retrieved chunks';

  const isStreaming = isThinkingStreaming;
  const hasToolCards = toolCards.length > 0;
  const hasThinkingBar =
    isStreaming && (currentStage != null || currentThinkingMessage != null);

  if (error) {
    return (
      <div className="rounded-2xl px-4 py-3 text-sm bg-destructive/10 text-destructive border border-destructive/20">
        <p className="font-medium">Error</p>
        <p className="mt-1">{error}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-2.5 inline-flex items-center gap-1.5 rounded-md border border-destructive/30 bg-background/60 px-2.5 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
          >
            <RefreshCw className="size-3" aria-hidden />
            Try again
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-2.5', compact && 'gap-2')}>

      {/* ── Thinking panel — the agent's live reasoning (thinking_token stream),
            kept OUT of the answer bubble. Collapses once the turn settles. ── */}
      <AgentReasoningPanel reasoning={reasoning} streaming={isStreaming} />

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

      {/* ── Live source ticker. Shown only while streaming and before the final
            `done` lands; the citation panel below supersedes it once the answer
            settles. Cancellation lives on the composer Stop button (a single
            Stop control), so no Stop button is rendered here. ── */}
      {isStreaming && !donePayload && liveCitationCount > 0 && (
        <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-primary animate-pulse" aria-hidden />
            Gathering sources… {liveCitationCount}
          </span>
        </div>
      )}

      {/* ── Synthesis checklist — Biomni-style "here's my plan, ticking it off"
            view. Each step shows a spinner while active and a check when done,
            so a long protocol design reads as visible progress. ── */}
      {synthesisPlan && synthesisPlan.steps.length > 0 && (
        <div className="surface-recessed px-3 py-2 text-sm">
          <div className="mb-1.5 font-medium text-foreground/80">
            {synthesisPlan.title}
          </div>
          <ul className="flex flex-col gap-1">
            {synthesisPlan.steps.map((step) => (
              <li key={step.id} className="flex items-center gap-2">
                <span
                  className={cn(
                    'flex size-4 shrink-0 items-center justify-center rounded-full border text-[10px]',
                    step.status === 'done'
                      ? 'border-primary bg-primary text-primary-foreground'
                      : step.status === 'active'
                        ? 'border-primary text-primary'
                        : 'border-border/60 text-muted-foreground'
                  )}
                  aria-hidden
                >
                  {step.status === 'done' ? (
                    <Check className="size-3" />
                  ) : step.status === 'active' ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : null}
                </span>
                <span
                  className={cn(
                    'truncate',
                    step.status === 'done'
                      ? 'text-muted-foreground'
                      : step.status === 'active'
                        ? 'text-foreground'
                        : 'text-muted-foreground'
                  )}
                >
                  {step.label}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* The stage stepper (Understanding · Searching · Reading · Designing ·
            Drafting · Done) was removed per user request. Tool cards above and
            the legacy thinking steps below cover live progress. */}

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
        <div className="surface-recessed overflow-hidden">
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
            {(() => {
              let effectiveManifest = citationsManifest;
              if (!effectiveManifest && rawGrounding.length > 0) {
                effectiveManifest = {
                  manifest: rawGrounding.reduce((acc, r, i) => {
                    const label = typeof r.cite_label === 'string' && r.cite_label.trim() ? r.cite_label.trim() : String(i + 1);
                    acc[label] = {
                      source_id: r.source_id,
                      source_name: r.source_name || r.display_label || 'Source ' + label,
                      source_url: r.source_url,
                      excerpt: r.excerpt,
                      match_kind: r.match_kind,
                      support_status: r.support_status,
                      grounding: r.grounding,
                    };
                    return acc;
                  }, {} as Record<string, any>)
                };
              }
              return displayAnswer ? (
                <MarkdownRenderer
                  content={displayAnswer}
                  showCursor={!donePayload}
                  className="[&_pre]:max-w-full [&_pre]:overflow-x-auto"
                  citationsManifest={effectiveManifest}
                />
              ) : (
                /* No content yet — standalone cursor */
                <span
                  className="inline-block h-4 w-1 bg-foreground/70 rounded-sm animate-cursor-blink translate-y-[2px]"
                  aria-hidden
                />
              );
            })()}
          </div>

          {/* Confidence + tool badge */}
          {donePayload &&
            (donePayload.confidence != null ||
              donePayload.tool_used ||
              donePayload.citations_health === 'degraded' ||
              donePayload.citations_health === 'failed') && (
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
              {/* Fail-open observability: surface degraded/failed attribution so an
                  uncited answer is never silently presented as fully grounded. */}
              {(donePayload.citations_health === 'degraded' ||
                donePayload.citations_health === 'failed') && (
                <span className="rounded-md bg-amber-500/15 px-2 py-0.5 font-medium text-amber-700 dark:text-amber-400/90">
                  {donePayload.citations_health === 'failed'
                    ? 'Citations unavailable'
                    : `Partial citations${
                        donePayload.tokens_unresolved
                          ? ` (${donePayload.tokens_unresolved} unresolved)`
                          : ''
                      }`}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Generated files (PDF/DOCX/XLSX/figures). Drafts show a
            "Save to Data files" action; appear live as the agent emits them. ── */}
      {graphs.length > 0 && <AgentGraphList graphs={graphs} />}
      {artifacts.length > 0 && <AgentArtifactList artifacts={artifacts} />}

      {/* ── Citations panel ── */}
      {hasCitationPanel ? (
        <AgentCitationsPanel items={mergedCitationItems} triggerLabel={citationTriggerLabel} />
      ) : (
        // Once the answer is complete with no cited sources, say so honestly
        // rather than leaving a silent gap.
        donePayload != null &&
        displayAnswer != null &&
        displayAnswer.trim().length > 0 && (
          <AgentCitationsPanel items={[]} triggerLabel={citationTriggerLabel} showEmptyState />
        )
      )}
    </div>
  );
}
