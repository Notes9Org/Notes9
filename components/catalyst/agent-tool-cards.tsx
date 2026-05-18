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

interface ToolCardItemProps {
  card: ToolCard;
}

function ToolCardItem({ card }: ToolCardItemProps) {
  const [expanded, setExpanded] = useState(false);
  const Icon: LucideIcon = TOOL_ICONS[card.id] ?? Wrench;
  const isRunning = card.status === 'running';
  const isError = card.status === 'error';
  const hasSourceNames = (card.source_names?.length ?? 0) > 0;
  const hasDetail = !isRunning && (card.summary || hasSourceNames);

  return (
    <div className="flex flex-col">
      <button
        type="button"
        className={cn(
          'flex items-start gap-2 px-1 py-1 text-left group rounded-md transition-colors',
          hasDetail && 'hover:bg-muted/30 cursor-pointer',
          isRunning && 'cursor-default'
        )}
        onClick={() => hasDetail && setExpanded((v) => !v)}
        disabled={isRunning || !hasDetail}
        aria-expanded={expanded}
      >
        {/* Status / icon */}
        <div className="mt-0.5 shrink-0">
          {isRunning ? (
            <Loader2 className="size-3.5 animate-spin text-muted-foreground/50" aria-hidden />
          ) : isError ? (
            <XCircle className="size-3.5 text-destructive/60" aria-hidden />
          ) : (
            <CheckCircle2 className="size-3.5 text-muted-foreground/40" aria-hidden />
          )}
        </div>

        {/* Tool icon */}
        <Icon className="mt-0.5 shrink-0 size-3 text-muted-foreground/40" aria-hidden />

        {/* Label + source names */}
        <div className="flex-1 min-w-0">
          <span
            className={cn(
              'text-sm',
              isRunning ? 'text-muted-foreground' : 'text-muted-foreground/70'
            )}
          >
            {card.label}
          </span>
          {/* Row count for SQL when there is no expandable source list */}
          {!isRunning && card.row_count != null && !hasSourceNames && (
            <p className="text-[11px] text-muted-foreground/50 mt-0.5 leading-tight">
              {card.row_count} record{card.row_count !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        {/* Meta: source count + latency.
            Prefer source_names.length so the header pill matches what the
            user can actually see in the expanded list. Falls back to
            citations_count only when source_names hasn't arrived yet. */}
        {!isRunning && (() => {
          const visibleCount =
            card.source_names && card.source_names.length > 0
              ? card.source_names.length
              : (card.citations_count ?? 0);
          return (
          <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
            {visibleCount > 0 && (
              <span className="text-[11px] text-muted-foreground/50">
                {visibleCount} {visibleCount === 1 ? 'source' : 'sources'}
              </span>
            )}
            {card.latency_ms != null && (
              <span className="text-[11px] text-muted-foreground/50">
                {(card.latency_ms / 1000).toFixed(1)}s
              </span>
            )}
            {hasDetail && (
              expanded
                ? <ChevronDown className="size-3 text-muted-foreground/40" aria-hidden />
                : <ChevronRight className="size-3 text-muted-foreground/40" aria-hidden />
            )}
          </div>
          );
        })()}
      </button>

      {/* Expandable: all source names */}
      {!isRunning && expanded && (
        <div className="ml-[1.625rem] pb-1 pr-1 space-y-0.5">
          {card.source_names && card.source_names.length > 0 && (
            <ul className="space-y-1">
              {card.source_names.map((entry, i) => {
                // Backend ships "Type: Name" (e.g., "Project: Vaccine_Production");
                // render Type as a small monochrome pill so a researcher can
                // tell projects from lab notes from papers at a glance.
                const colonIdx = entry.indexOf(': ');
                const hasType = colonIdx > 0 && colonIdx < 24;
                const type = hasType ? entry.slice(0, colonIdx) : '';
                const name = hasType ? entry.slice(colonIdx + 2) : entry;
                return (
                  <li
                    key={i}
                    className="text-xs text-muted-foreground/80 leading-relaxed flex items-start gap-2"
                  >
                    <span className="mt-1.5 shrink-0 size-1 rounded-full bg-muted-foreground/30" />
                    {hasType && (
                      <span className="shrink-0 mt-px rounded-sm border border-border bg-muted/40 px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
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
            <p className="text-xs text-muted-foreground/60 leading-relaxed">
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
      <div className={cn('flex flex-col gap-0.5', className)}>
        <button
          type="button"
          className="flex items-center gap-1.5 px-1 py-1 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll
            ? <ChevronDown className="size-3" aria-hidden />
            : <ChevronRight className="size-3" aria-hidden />}
          <span>
            {showAll ? 'Hide reasoning' : `Used ${cards.length} tool${cards.length > 1 ? 's' : ''}`}
          </span>
        </button>
        {showAll && (
          <div className="flex flex-col gap-0.5 ml-1">
            {cards.map((card, i) => (
              <ToolCardItem key={`${card.id}-${i}`} card={card} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      {cards.map((card, i) => (
        <ToolCardItem key={`${card.id}-${i}`} card={card} />
      ))}
    </div>
  );
}
