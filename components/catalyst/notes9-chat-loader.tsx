import { cn } from '@/lib/utils';
import type { ToolCard } from '@/hooks/use-agent-stream';

/** Fraction of the agent's tools that have finished (done or errored) — a
 * concrete, honest "amount of work done" signal to drive the loader ring.
 * Returns undefined when there are no tools yet (→ indeterminate spinner). */
export function toolCardsProgress(cards?: ToolCard[] | null): number | undefined {
  if (!cards || cards.length === 0) return undefined;
  const settled = cards.filter((c) => c.status === 'done' || c.status === 'error').length;
  return settled / cards.length;
}

interface Notes9ChatLoaderProps {
  /** Pixel size of the square loader. */
  size?: number;
  className?: string;
  /** Accessible status label announced to screen readers. */
  label?: string;
  /** Optional 0–1 completion. When provided, a ring around the mark fills to
   * reflect how much of the work is done (e.g. tools completed). Omit for a
   * plain indeterminate spinner. */
  progress?: number;
  /** When true the loader STOPS spinning (settles to a dimmed static mark) —
   * used when the request errors so the chat doesn't appear to keep loading. */
  error?: boolean;
}

/**
 * Branded loading indicator: the Notes9 logo mark in continuous rotation while
 * the assistant works. When `progress` is supplied, a determinate ring around
 * the mark conveys how far along the answer is. Purely presentational.
 */
export function Notes9ChatLoader({
  size = 28,
  className,
  label = 'Notes9 is thinking',
  progress,
  error = false,
}: Notes9ChatLoaderProps) {
  // On error, stop the spin and drop the progress ring so it reads as halted.
  const hasProgress =
    !error && typeof progress === 'number' && progress >= 0 && progress <= 1;
  const R = 16;
  const C = 2 * Math.PI * R;

  return (
    <span
      role="status"
      aria-label={label}
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center',
        'notes9-loader-depth [perspective:240px] [transform-style:preserve-3d]',
        className,
      )}
      style={{ width: size, height: size }}
    >
      {hasProgress && (
        <svg
          className="absolute inset-0 -rotate-90"
          viewBox="0 0 36 36"
          aria-hidden
        >
          <circle
            cx="18"
            cy="18"
            r={R}
            className="fill-none stroke-muted-foreground/20"
            strokeWidth="2.5"
          />
          <circle
            cx="18"
            cy="18"
            r={R}
            className="fill-none stroke-primary transition-[stroke-dashoffset] duration-500 ease-out"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - (progress as number))}
          />
        </svg>
      )}
      <img
        src="/notes9-logo-mark-transparent.png"
        alt=""
        aria-hidden
        className={cn(
          // 3D anticlockwise spin on a tilted plane (perspective from wrapper).
          'object-contain dark:invert dark:brightness-125',
          error ? 'opacity-40' : 'notes9-loader-3d',
          hasProgress ? 'size-[64%]' : 'size-full',
        )}
      />
    </span>
  );
}
