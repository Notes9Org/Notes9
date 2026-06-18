'use client';

import { Square } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AgentStopButtonProps {
  /** Invoked when the user clicks Stop — should cancel the run + stream. */
  onStop: () => void;
  className?: string;
}

/**
 * Subtle "Stop" control shown while a run is streaming AND a server-side
 * cancel handle (runId) is available. Clicking it asks the backend to cancel
 * the run and aborts the local stream. When no runId exists (HITL flag off),
 * the caller simply doesn't render this — there's no error path.
 */
export function AgentStopButton({ onStop, className }: AgentStopButtonProps) {
  return (
    <button
      type="button"
      onClick={onStop}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/40 px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground',
        className,
      )}
      aria-label="Stop generating"
    >
      <Square className="size-3 fill-current" aria-hidden />
      Stop
    </button>
  );
}
