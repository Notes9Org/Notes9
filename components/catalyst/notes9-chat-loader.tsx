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
  /** Optional 0–1 completion. When provided the ring becomes a determinate arc
   * that fills to reflect how much of the work is done (e.g. tools completed). */
  progress?: number;
  /** When true the loader stops (dimmed, static) — used on request error. */
  error?: boolean;
}

const R = 16;
const C = 2 * Math.PI * R;

/**
 * Professional chat loader: a thin, brand-colored ring spins around a static,
 * upright Notes9 logo. With `progress` the ring becomes a determinate arc; on
 * error it settles to a dimmed, static mark. Purely presentational.
 */
export function Notes9ChatLoader({
  size = 28,
  className,
  label = 'Notes9 is thinking',
  progress,
  error = false,
}: Notes9ChatLoaderProps) {
  const hasProgress =
    !error && typeof progress === 'number' && progress >= 0 && progress <= 1;

  return (
    <span
      role="status"
      aria-label={label}
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center',
        className,
      )}
      style={{ width: size, height: size }}
    >
      {/* Determinate progress ring */}
      {hasProgress && (
        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 36 36" aria-hidden>
          <circle cx="18" cy="18" r={R} className="fill-none stroke-primary/15" strokeWidth="2.5" />
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

      {/* Indeterminate spinner — a faint track with a bright arc that rotates */}
      {!hasProgress && !error && (
        <svg
          className="absolute inset-0 animate-spin [animation-duration:0.85s]"
          viewBox="0 0 36 36"
          aria-hidden
        >
          <circle cx="18" cy="18" r={R} className="fill-none stroke-primary/15" strokeWidth="2.5" />
          <circle
            cx="18"
            cy="18"
            r={R}
            className="fill-none stroke-primary"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * 0.72}
          />
        </svg>
      )}

      {/* Static, upright logo in the center — never spins (looks more polished) */}
      <img
        src="/notes9-logo-mark-transparent.png"
        alt=""
        aria-hidden
        className={cn(
          'relative object-contain dark:invert dark:brightness-125',
          error ? 'opacity-40' : 'opacity-90',
          'size-[52%]',
        )}
      />
    </span>
  );
}
