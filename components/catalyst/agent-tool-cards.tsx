'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Loader2,
  Database,
  FileText,
  Globe,
  ClipboardList,
  Microscope,
  FlaskConical,
  MessageSquare,
  BarChart2,
  BrainCircuit,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { ToolCard } from '@/hooks/use-agent-stream';

const TOOL_ICONS: Record<string, LucideIcon> = {
  nlp_to_sql_tool:        Database,
  rag_tool:               FileText,
  web_search_tool:        Globe,
  full_record_fetch_tool: ClipboardList,
  document_analysis_tool: Microscope,
  biomni_tool:            FlaskConical,
  biomni_full_tool:       FlaskConical,
  llm_chat_tool:          MessageSquare,
  extract_data_tool:      BarChart2,
  episodic_memory_tool:   BrainCircuit,
};

// Short mono-cased name shown only when the backend gave us a recognized
// tool id. Random handles like `t_61z6cd0e8` would otherwise leak into the
// UI and confuse the user — for unknown ids we skip the mono pill entirely
// and rely on the icon + the server-provided friendly label.
const TOOL_NAMES: Record<string, string> = {
  nlp_to_sql_tool:        'records',
  rag_tool:               'documents',
  web_search_tool:        'web_search',
  full_record_fetch_tool: 'open_record',
  document_analysis_tool: 'analyze_doc',
  biomni_tool:            'biomni',
  biomni_full_tool:       'biomni_full',
  llm_chat_tool:          'reason',
  extract_data_tool:      'extract',
  episodic_memory_tool:   'memory',
};

function toolDisplayName(id: string): string | null {
  return TOOL_NAMES[id] ?? null;
}

interface ToolCardItemProps {
  card: ToolCard;
}

/**
 * Cursor/Claude-style tool-call block.
 *
 * Header (always visible, single row):
 *   ●  ▣ records · Looking through your workspace      12 sources · 2.1s ▸
 *
 * Args (visible whenever an args_preview was supplied):
 *   args  SELECT * FROM projects WHERE …
 *
 * Body (collapsed by default after settle; click header to open):
 *   • Project: Vaccine Production
 *   • Project: Cell Line Development
 *   Summary: Found 12 matching records …
 */
function ToolCardItem({ card }: ToolCardItemProps) {
  const [expanded, setExpanded] = useState(false);
  const Icon: LucideIcon = TOOL_ICONS[card.id] ?? Wrench;
  const isRunning = card.status === 'running';
  const isError = card.status === 'error';
  const hasSourceNames = (card.source_names?.length ?? 0) > 0;
  const hasArgsPreview = !!card.args_preview;
  const hasDetail = !isRunning && (card.summary || hasSourceNames);
  const displayName = toolDisplayName(card.id);
  const sourceCount =
    card.source_names && card.source_names.length > 0
      ? card.source_names.length
      : (card.citations_count ?? 0);

  return (
    <div
      className={cn(
        'rounded-md border bg-card/40 overflow-hidden transition-colors',
        isRunning && 'border-primary/40 bg-primary/[0.03]',
        isError && 'border-destructive/40 bg-destructive/[0.04]',
        !isRunning && !isError && 'border-border/60',
      )}
    >
      <button
        type="button"
        className={cn(
          'flex w-full items-center gap-2 px-2.5 py-1.5 text-left',
          hasDetail && 'cursor-pointer hover:bg-muted/40',
          (isRunning || !hasDetail) && 'cursor-default',
        )}
        onClick={() => hasDetail && setExpanded((v) => !v)}
        disabled={isRunning || !hasDetail}
        aria-expanded={hasDetail ? expanded : undefined}
        aria-label={
          isRunning
            ? `${card.label} (running)`
            : isError
              ? `${card.label} (failed)${hasDetail ? ' — click to expand' : ''}`
              : `${card.label}${hasDetail ? ' — click to expand' : ''}`
        }
      >
        <span className="shrink-0 inline-flex items-center justify-center size-3.5">
          {isRunning ? (
            <Loader2 className="size-3.5 animate-spin text-primary" aria-hidden />
          ) : isError ? (
            <XCircle className="size-3.5 text-destructive" aria-hidden />
          ) : (
            <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-500" aria-hidden />
          )}
        </span>

        <Icon
          className={cn(
            'shrink-0 size-3.5',
            isRunning ? 'text-primary' : isError ? 'text-destructive' : 'text-muted-foreground',
          )}
          aria-hidden
        />

        {/* Mono tool name pill — only when we have a friendly mapping.
            Random backend handles (e.g. `t_61z6cd0e8`) are hidden so the
            user never sees a meaningless token in the chat. */}
        {displayName && (
          <span
            className={cn(
              'shrink-0 font-mono text-xs font-semibold tracking-tight',
              isRunning ? 'text-foreground' : 'text-foreground/80',
            )}
          >
            {displayName}
            <span className="text-muted-foreground/60 ml-1.5">·</span>
          </span>
        )}

        <span
          className={cn(
            'flex-1 min-w-0 truncate text-sm',
            isRunning ? 'text-foreground/90' : 'text-foreground/70',
          )}
          title={card.label}
        >
          {card.label}
        </span>

        <div className="shrink-0 flex items-center gap-2">
          {!isRunning && sourceCount > 0 && (
            <span className="text-2xs tabular-nums text-muted-foreground/70">
              {sourceCount} {sourceCount === 1 ? 'source' : 'sources'}
            </span>
          )}
          {!isRunning && card.row_count != null && !hasSourceNames && (
            <span className="text-2xs tabular-nums text-muted-foreground/70">
              {card.row_count} {card.row_count === 1 ? 'record' : 'records'}
            </span>
          )}
          {card.latency_ms != null && (
            <span className="text-2xs tabular-nums text-muted-foreground/60">
              {(card.latency_ms / 1000).toFixed(1)}s
            </span>
          )}
          {hasDetail && (
            expanded
              ? <ChevronDown className="size-3.5 text-muted-foreground/50" aria-hidden />
              : <ChevronRight className="size-3.5 text-muted-foreground/50" aria-hidden />
          )}
        </div>
      </button>

      {hasArgsPreview && (
        <div className="px-2.5 pb-1.5 -mt-0.5">
          <code
            className="block rounded bg-muted/60 px-2 py-1 text-2xs font-mono text-muted-foreground/90 break-words leading-relaxed"
            title={card.args_preview}
          >
            <span className="text-muted-foreground/50 select-none mr-1.5">args</span>
            {card.args_preview!.length > 220
              ? `${card.args_preview!.slice(0, 220)}…`
              : card.args_preview}
          </code>
        </div>
      )}

      {!isRunning && expanded && hasDetail && (
        <div className="px-2.5 pb-2 pt-1 border-t border-border/40 bg-muted/20 space-y-1.5">
          {card.source_names && card.source_names.length > 0 && (
            <ul className="space-y-1">
              {card.source_names.map((entry, i) => {
                const colonIdx = entry.indexOf(': ');
                const hasType = colonIdx > 0 && colonIdx < 24;
                const type = hasType ? entry.slice(0, colonIdx) : '';
                const name = hasType ? entry.slice(colonIdx + 2) : entry;
                return (
                  <li
                    key={i}
                    className="text-xs text-muted-foreground/85 leading-relaxed flex items-start gap-2"
                  >
                    <span className="mt-1.5 shrink-0 size-1 rounded-full bg-muted-foreground/40" />
                    {hasType && (
                      <span className="shrink-0 mt-px rounded-sm border border-border/70 bg-background/80 px-1.5 py-px text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                        {type}
                      </span>
                    )}
                    <span className="break-words">{name}</span>
                  </li>
                );
              })}
            </ul>
          )}
          {card.summary && (
            <p className="text-xs text-muted-foreground/75 leading-relaxed whitespace-pre-wrap">
              {card.summary}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

interface AgentToolCardsProps {
  cards: ToolCard[];
  /** When true, settled cards are hidden behind a "show reasoning" toggle */
  collapsible?: boolean;
  className?: string;
}

export function AgentToolCards({ cards, collapsible = false, className }: AgentToolCardsProps) {
  const [showAll, setShowAll] = useState(false);

  if (cards.length === 0) return null;

  const hasRunning = cards.some((c) => c.status === 'running');

  if (collapsible && !hasRunning) {
    return (
      <div className={cn('flex flex-col gap-1', className)}>
        <button
          type="button"
          className="flex items-center gap-1.5 px-1 py-1 text-xs text-muted-foreground/70 hover:text-foreground transition-colors self-start"
          onClick={() => setShowAll((v) => !v)}
          aria-expanded={showAll}
          aria-label={showAll ? 'Hide tool calls' : `Show ${cards.length} tool call${cards.length > 1 ? 's' : ''}`}
        >
          {showAll
            ? <ChevronDown className="size-3" aria-hidden />
            : <ChevronRight className="size-3" aria-hidden />}
          <span>
            {showAll
              ? `Hide tool calls (${cards.length})`
              : `Used ${cards.length} tool${cards.length > 1 ? 's' : ''}`}
          </span>
        </button>
        {showAll && (
          <div className="flex flex-col gap-1.5">
            {cards.map((card, i) => (
              <ToolCardItem key={`${card.id}-${i}`} card={card} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {cards.map((card, i) => (
        <ToolCardItem key={`${card.id}-${i}`} card={card} />
      ))}
    </div>
  );
}
