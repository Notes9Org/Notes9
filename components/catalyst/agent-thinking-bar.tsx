'use client';

import {
  Brain,
  Search,
  BookOpen,
  FlaskConical,
  PenLine,
  CheckCircle2,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ThinkingStage } from '@/hooks/use-agent-stream';

/** Canonical staged flow shown as a stepper. Older stage names map onto the
 * nearest canonical step so mid-migration messages still light up the strip. */
const STAGE_ORDER: ThinkingStage[] = [
  'understanding',
  'searching',
  'reading',
  'designing',
  'drafting',
  'done',
];

/** Human label + icon for every stage the backend can emit. */
const STAGE_META: Record<ThinkingStage, { label: string; Icon: LucideIcon }> = {
  understanding: { label: 'Understanding', Icon: Brain },
  searching:     { label: 'Searching', Icon: Search },
  reading:       { label: 'Reading', Icon: BookOpen },
  designing:     { label: 'Designing', Icon: FlaskConical },
  drafting:      { label: 'Drafting', Icon: PenLine },
  done:          { label: 'Done', Icon: CheckCircle2 },
  // Legacy aliases collapse onto a canonical step.
  analyzing:     { label: 'Reading', Icon: BookOpen },
  synthesizing:  { label: 'Designing', Icon: FlaskConical },
  composing:     { label: 'Drafting', Icon: PenLine },
  validating:    { label: 'Drafting', Icon: PenLine },
};

/** Map any emitted stage onto its canonical position in STAGE_ORDER. */
const STAGE_TO_CANONICAL: Record<ThinkingStage, ThinkingStage> = {
  understanding: 'understanding',
  searching:     'searching',
  reading:       'reading',
  designing:     'designing',
  drafting:      'drafting',
  done:          'done',
  analyzing:     'reading',
  synthesizing:  'designing',
  composing:     'drafting',
  validating:    'drafting',
};

interface AgentThinkingBarProps {
  stage: ThinkingStage | null;
  message: string | null;
  detail?: string | null;
  isStreaming?: boolean;
  /** Fractional progress 0–1 for the active long-running stage (Cat-Bio). */
  progress?: number | null;
  /** Elapsed seconds for the active stage — shown so long runs feel alive. */
  elapsedS?: number | null;
  className?: string;
}

export function AgentThinkingBar({
  stage,
  message,
  detail,
  isStreaming = true,
  progress = null,
  elapsedS = null,
  className,
}: AgentThinkingBarProps) {
  const canonical = stage ? STAGE_TO_CANONICAL[stage] : null;
  const activeIdx = canonical ? STAGE_ORDER.indexOf(canonical) : -1;
  const activeMeta = stage ? STAGE_META[stage] : null;
  const displayMessage = message ?? activeMeta?.label ?? 'Thinking…';

  const showProgressBar =
    isStreaming && typeof progress === 'number' && progress >= 0 && progress < 1;

  return (
    <div className={cn('flex flex-col gap-1.5 px-1 py-1', className)}>
      {/* ── Stepper strip: one chip per canonical stage. Completed = check,
            current = highlighted + (pulsing or progress), upcoming = muted. ── */}
      <ol className="flex flex-wrap items-center gap-1" aria-label="Agent progress">
        {STAGE_ORDER.map((s, i) => {
          const meta = STAGE_META[s];
          const Icon = meta.Icon;
          const isDone = activeIdx >= 0 && i < activeIdx;
          const isCurrent = activeIdx >= 0 && i === activeIdx;
          const isFinalDone = s === 'done' && activeIdx >= 0 && activeIdx === STAGE_ORDER.length - 1;
          return (
            <li
              key={s}
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-medium transition-colors',
                isCurrent && 'bg-primary/10 text-primary',
                isDone && 'text-muted-foreground/70',
                !isCurrent && !isDone && 'text-muted-foreground/40',
              )}
              aria-current={isCurrent ? 'step' : undefined}
            >
              {isDone || isFinalDone ? (
                <CheckCircle2 className="size-3 shrink-0 text-emerald-600 dark:text-emerald-500" aria-hidden />
              ) : (
                <Icon
                  className={cn(
                    'size-3 shrink-0',
                    isCurrent && isStreaming && 'animate-pulse',
                  )}
                  aria-hidden
                />
              )}
              <span>{meta.label}</span>
            </li>
          );
        })}
      </ol>

      {/* ── Active line: friendly message + optional elapsed clock ── */}
      <div className="flex items-start gap-2">
        <span
          className={cn(
            'mt-[3px] shrink-0 size-2 rounded-full bg-primary/60',
            isStreaming && 'animate-pulse',
          )}
          aria-hidden
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <p className="flex-1 min-w-0 truncate text-sm text-muted-foreground leading-snug">
              {displayMessage}
            </p>
            {isStreaming && typeof elapsedS === 'number' && elapsedS >= 1 && (
              <span className="shrink-0 text-2xs tabular-nums text-muted-foreground/60">
                {Math.round(elapsedS)}s
              </span>
            )}
          </div>
          {detail && (
            <p className="text-xs text-muted-foreground/60 mt-0.5 truncate">{detail}</p>
          )}
          {showProgressBar && (
            <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary/70 transition-[width] duration-500"
                style={{ width: `${Math.round((progress ?? 0) * 100)}%` }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
