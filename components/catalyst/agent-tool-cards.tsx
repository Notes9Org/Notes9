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

  return (
    <div className="flex flex-col">
      <button
        type="button"
        className={cn(
          'flex items-center gap-2 px-1 py-1 text-left group rounded-md transition-colors',
          !isRunning && card.summary && 'hover:bg-muted/30 cursor-pointer',
          isRunning && 'cursor-default'
        )}
        onClick={() => !isRunning && card.summary && setExpanded((v) => !v)}
        disabled={isRunning || !card.summary}
        aria-expanded={expanded}
      >
        {/* Status / icon */}
        {isRunning ? (
          <Loader2 className="shrink-0 size-3.5 animate-spin text-muted-foreground/50" aria-hidden />
        ) : isError ? (
          <XCircle className="shrink-0 size-3.5 text-destructive/60" aria-hidden />
        ) : (
          <CheckCircle2 className="shrink-0 size-3.5 text-muted-foreground/40" aria-hidden />
        )}

        {/* Tool icon */}
        <Icon className="shrink-0 size-3 text-muted-foreground/40" aria-hidden />

        {/* Label */}
        <span
          className={cn(
            'flex-1 min-w-0 text-sm truncate',
            isRunning ? 'text-muted-foreground' : 'text-muted-foreground/70'
          )}
        >
          {card.label}
        </span>

        {/* Meta: source count + latency */}
        {!isRunning && (
          <div className="flex items-center gap-1.5 shrink-0">
            {card.citations_count != null && (
              <span className="text-[11px] text-muted-foreground/50">
                {card.citations_count} {card.citations_count === 1 ? 'source' : 'sources'}
              </span>
            )}
            {card.latency_ms != null && (
              <span className="text-[11px] text-muted-foreground/50">
                {(card.latency_ms / 1000).toFixed(1)}s
              </span>
            )}
            {card.summary && (
              expanded
                ? <ChevronDown className="size-3 text-muted-foreground/40" aria-hidden />
                : <ChevronRight className="size-3 text-muted-foreground/40" aria-hidden />
            )}
          </div>
        )}
      </button>

      {/* Expandable summary */}
      {!isRunning && expanded && card.summary && (
        <p className="ml-[1.625rem] text-xs text-muted-foreground/60 leading-relaxed pb-1 pr-1">
          {card.summary}
        </p>
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
