import { cn } from '@/lib/utils';
import { Notes9ChatLoader } from './notes9-chat-loader';
import { getThinkingContext } from '@/lib/catalyst-thinking-context';

interface Notes9ThinkingIndicatorProps {
  /** The user's latest query — drives the contextual icon, title, and fact. */
  query?: string;
  /** Pixel size of the rotating logo loader. */
  size?: number;
  className?: string;
  /** 0–1 completion, shown as a ring around the loader (e.g. tools done). */
  progress?: number;
  /** Live "work done" caption (e.g. "Searched 4 sources · 2 tools"). When set,
   * it replaces the science fact so the user sees concrete progress instead. */
  detail?: string;
}

/**
 * Context-aware "thinking" state shown while the agent generates a reply:
 * the branded rotating-logo loader (with an optional progress ring), a
 * task-specific icon + shimmering title inferred from the query, and either a
 * live work caption or — occasionally — a little AI-in-biotech fact.
 * Purely presentational.
 */
export function Notes9ThinkingIndicator({
  query,
  size = 32,
  className,
  progress,
  detail,
}: Notes9ThinkingIndicatorProps) {
  const { title, Icon, fact } = getThinkingContext(query ?? '');
  const subline = detail || fact;
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <Notes9ChatLoader size={size} label={title} progress={progress} />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="flex items-center gap-1.5">
          <Icon className="size-3.5 shrink-0 text-primary/70" aria-hidden />
          <span className="text-sm font-medium n9-thinking-shimmer">{title}</span>
        </span>
        {subline && (
          <span className="text-xs leading-snug text-muted-foreground/60">
            {subline}
          </span>
        )}
      </div>
    </div>
  );
}
