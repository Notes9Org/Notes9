'use client';

import { cn } from '@/lib/utils';
import {
  Search,
  ScanLine,
  FlaskConical,
  CheckCheck,
  Brain,
  BrainCircuit,
  Database,
  FileText,
  Globe,
  ClipboardList,
  Microscope,
  MessageSquare,
  BarChart2,
  Workflow,
  CheckCircle2,
  Loader2,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import type { ToolCard, ThinkingStage } from '@/hooks/use-agent-stream';

// Each pipeline node represents a logical phase of the ReAct loop.
// The 7 streaming stages collapse to these 4 so the rail stays scannable.
type PipelineStageId = 'understand' | 'search' | 'analyze' | 'answer';

interface PipelineStage {
  id: PipelineStageId;
  label: string;
  Icon: LucideIcon;
  /** Stage values from the backend that map here. */
  matches: ThinkingStage[];
  /** Tool IDs that belong under this stage when they fire. */
  tools: string[];
}

const PIPELINE: PipelineStage[] = [
  {
    id: 'understand',
    label: 'Understand',
    Icon: Brain,
    matches: ['understanding'],
    tools: [],
  },
  {
    id: 'search',
    label: 'Search',
    Icon: Search,
    matches: ['searching'],
    tools: [
      'nlp_to_sql_tool',
      'rag_tool',
      'full_record_fetch_tool',
      'research_map_tool',
      'web_search_tool',
    ],
  },
  {
    id: 'analyze',
    label: 'Analyze',
    Icon: ScanLine,
    matches: ['analyzing', 'synthesizing'],
    tools: [
      'document_analysis_tool',
      'extract_data_tool',
      'biomni_tool',
      'biomni_full_tool',
      'llm_chat_tool',
      'episodic_memory_tool',
    ],
  },
  {
    id: 'answer',
    label: 'Answer',
    Icon: CheckCheck,
    matches: ['composing', 'validating', 'done'],
    tools: [],
  },
];

const PIPELINE_ORDER: PipelineStageId[] = PIPELINE.map((s) => s.id);

const TOOL_ICONS: Record<string, LucideIcon> = {
  nlp_to_sql_tool: Database,
  rag_tool: FileText,
  web_search_tool: Globe,
  full_record_fetch_tool: ClipboardList,
  document_analysis_tool: Microscope,
  research_map_tool: Workflow,
  biomni_tool: FlaskConical,
  biomni_full_tool: FlaskConical,
  llm_chat_tool: MessageSquare,
  extract_data_tool: BarChart2,
  episodic_memory_tool: BrainCircuit,
};

const TOOL_SHORT_LABELS: Record<string, string> = {
  nlp_to_sql_tool: 'Records',
  rag_tool: 'Documents',
  web_search_tool: 'Web',
  full_record_fetch_tool: 'Linked',
  document_analysis_tool: 'Read',
  research_map_tool: 'Map',
  biomni_tool: 'Biomni',
  biomni_full_tool: 'Biomni',
  llm_chat_tool: 'Chat',
  extract_data_tool: 'Extract',
  episodic_memory_tool: 'Memory',
};

function stageOf(toolId: string): PipelineStageId {
  for (const s of PIPELINE) {
    if (s.tools.includes(toolId)) return s.id;
  }
  return 'analyze';
}

function isAfter(a: PipelineStageId, b: PipelineStageId): boolean {
  return PIPELINE_ORDER.indexOf(a) > PIPELINE_ORDER.indexOf(b);
}

function currentStageId(stage: ThinkingStage | null): PipelineStageId | null {
  if (!stage) return null;
  for (const s of PIPELINE) {
    if (s.matches.includes(stage)) return s.id;
  }
  return null;
}

interface ToolChipProps {
  card: ToolCard;
}

function ToolChip({ card }: ToolChipProps) {
  const Icon = TOOL_ICONS[card.id] ?? Workflow;
  const label = TOOL_SHORT_LABELS[card.id] ?? card.label;
  const isRunning = card.status === 'running';
  const isError = card.status === 'error';
  const count =
    (card.source_names && card.source_names.length) ||
    card.citations_count ||
    card.row_count ||
    0;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-2xs font-medium leading-none transition-colors',
        isRunning && 'border-primary/40 bg-primary/5 text-foreground/90',
        isError && 'border-destructive/40 bg-destructive/5 text-destructive',
        !isRunning && !isError && 'border-border/60 bg-muted/30 text-muted-foreground',
      )}
      title={
        isError
          ? `${card.label} failed`
          : isRunning
            ? `${card.label} running…`
            : `${card.label}${count ? ` · ${count} source${count === 1 ? '' : 's'}` : ''}`
      }
    >
      {isRunning ? (
        <Loader2 className="size-2.5 animate-spin" aria-hidden />
      ) : isError ? (
        <XCircle className="size-2.5" aria-hidden />
      ) : (
        <Icon className="size-2.5" aria-hidden />
      )}
      <span>{label}</span>
      {!isRunning && count > 0 && (
        <span className="tabular-nums text-muted-foreground/70">{count}</span>
      )}
    </span>
  );
}

interface AgentFlowPipelineProps {
  stage: ThinkingStage | null;
  toolCards: ToolCard[];
  /** True while the response is still streaming. Drives the flow animation. */
  isStreaming: boolean;
  className?: string;
}

/**
 * Compact horizontal ReAct pipeline that lives inside a chat bubble.
 *
 * Layout:
 *   ●─Understand──●─Search──●─Analyze──●─Answer
 *                  │          │
 *                  ▼          ▼
 *               [chips]    [chips]
 *
 * Stages light up in order; the connector between the previous and current
 * stage carries an animated dash. Tools that fired during a stage hang
 * underneath that stage as small chips so the user can see *why* each tool
 * was called.
 */
export function AgentFlowPipeline({
  stage,
  toolCards,
  isStreaming,
  className,
}: AgentFlowPipelineProps) {
  const activeId = currentStageId(stage);
  // If we've started streaming an answer, force the rail to at least reach Answer.
  const effectiveActiveId: PipelineStageId | null =
    stage === 'done' ? 'answer' : activeId;

  // Group settled/running tool cards by stage so each pillar has its chip stack.
  const cardsByStage: Record<PipelineStageId, ToolCard[]> = {
    understand: [],
    search: [],
    analyze: [],
    answer: [],
  };
  for (const card of toolCards) {
    cardsByStage[stageOf(card.id)].push(card);
  }

  return (
    <div
      className={cn(
        'rounded-xl border border-border/60 bg-muted/15 px-3 py-2.5',
        className,
      )}
      role="group"
      aria-label="Agent reasoning pipeline"
    >
      {/* Rail row — stage nodes + connectors */}
      <div className="flex items-center gap-0">
        {PIPELINE.map((s, i) => {
          const isActive = effectiveActiveId === s.id;
          const isPast =
            effectiveActiveId != null && isAfter(effectiveActiveId, s.id);
          // Answer stage gets its checkmark the moment stage === 'done'. Don't
          // gate on `!isStreaming`: the final-token stream can lag the stage flip.
          const isDone = isPast || (stage === 'done' && s.id === 'answer');
          const Icon = s.Icon;
          return (
            <div key={s.id} className="flex flex-1 items-center first:flex-none last:flex-none">
              {/* Connector before (skipped for first). When active+streaming, keep
                  the parent transparent so the animated gradient is visible — a
                  primary/60 base would otherwise paint over the shimmer. */}
              {i > 0 && (
                <div
                  className={cn(
                    'mx-1 h-px flex-1 transition-colors',
                    isPast && 'bg-primary/60',
                    isActive && !isStreaming && 'bg-primary/60',
                    isActive && isStreaming && 'bg-transparent',
                    !isPast && !isActive && 'bg-border/60',
                  )}
                  aria-hidden
                >
                  {isActive && isStreaming && (
                    <div
                      className="h-px w-full bg-[length:200%_100%] animate-flow-pipeline"
                      style={{
                        backgroundImage:
                          'linear-gradient(90deg, transparent 0%, hsl(var(--primary)) 50%, transparent 100%)',
                      }}
                    />
                  )}
                </div>
              )}
              {/* Stage node */}
              <div className="flex flex-col items-center gap-1 shrink-0 px-0.5">
                <div
                  className={cn(
                    'relative flex size-7 items-center justify-center rounded-full border transition-all',
                    isActive && 'border-primary bg-primary/10 text-foreground ring-4 ring-primary/15',
                    isDone && !isActive && 'border-primary/40 bg-primary/5 text-foreground/80',
                    !isActive && !isDone && 'border-border/60 bg-background text-muted-foreground/60',
                  )}
                >
                  {isDone && !isActive ? (
                    <CheckCircle2 className="size-3.5" aria-hidden />
                  ) : (
                    <Icon
                      className={cn(
                        'size-3.5',
                        isActive && isStreaming && 'animate-pulse',
                      )}
                      aria-hidden
                    />
                  )}
                </div>
                <span
                  className={cn(
                    'text-2xs font-medium leading-none tracking-tight transition-colors',
                    isActive && 'text-foreground',
                    isDone && !isActive && 'text-muted-foreground',
                    !isActive && !isDone && 'text-muted-foreground/50',
                  )}
                >
                  {s.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Tool chips row — laid out under their stage column */}
      {toolCards.length > 0 && (
        <div className="mt-2 grid grid-cols-4 gap-2 border-t border-border/40 pt-2">
          {PIPELINE.map((s) => {
            const cards = cardsByStage[s.id];
            return (
              <div
                key={s.id}
                className="flex flex-wrap items-start justify-center gap-1 min-h-[1.25rem]"
              >
                {cards.map((card) => {
                  // Stable key: position in the full toolCards array — same card
                  // instance keeps the same key across rerenders even if other
                  // cards reorder around it.
                  const globalIdx = toolCards.indexOf(card);
                  return <ToolChip key={`${card.id}-${globalIdx}`} card={card} />;
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
