'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

const STEP_MAX_CHARS = 280;

function compactStep(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= STEP_MAX_CHARS) return t;
  return `${t.slice(0, STEP_MAX_CHARS - 1)}…`;
}

function formatElapsed(totalSec: number) {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Live clock and reassurance when the SSE connection is open but quiet (long model runs). */
export function LiteratureStreamProgressHint({
  isStreaming,
  upstreamActivityAt,
}: {
  isStreaming: boolean;
  upstreamActivityAt: number | null;
}) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    if (!isStreaming) {
      setStartedAt(null);
      return;
    }
    setStartedAt(Date.now());
    const id = window.setInterval(() => setPulse((p) => p + 1), 1000);
    return () => window.clearInterval(id);
  }, [isStreaming]);

  if (!isStreaming || startedAt === null) return null;

  const elapsedSec = Math.floor((Date.now() - startedAt) / 1000);
  const quietSec =
    upstreamActivityAt != null ? Math.floor((Date.now() - upstreamActivityAt) / 1000) : null;

  return (
    <div className="mt-1 space-y-1 text-[11px] leading-snug text-muted-foreground" data-pulse={pulse}>
      <p className="flex flex-wrap items-center gap-x-1 tabular-nums">
        <span>Running</span>
        <span className="font-medium text-foreground/85">{formatElapsed(elapsedSec)}</span>
        <span className="opacity-75">· stream open</span>
      </p>
      {upstreamActivityAt == null && elapsedSec >= 6 && (
        <p>Waiting for the first chunk from the server…</p>
      )}
      {quietSec != null && quietSec >= 20 && (
        <p>
          No new data for {quietSec}s; the job may still be running in the background. If the reply
          never arrives, check hosting timeouts (this route allows up to 5 minutes).
        </p>
      )}
    </div>
  );
}

/** Collapsed-by-default trace from the literature stream; hidden after the reply finishes. */
export function LiteratureAgentThinkingPanel({ steps }: { steps: string[] }) {
  const [open, setOpen] = useState(false);
  if (steps.length === 0) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="min-w-0 w-full max-w-lg">
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={open}
          className="h-7 w-fit gap-1.5 rounded-md px-2 text-xs font-normal text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        >
          <Sparkles className="size-3 shrink-0 opacity-60" aria-hidden />
          <span>Thinking</span>
          <span className="tabular-nums opacity-70">({steps.length})</span>
          <ChevronDown
            className={cn(
              'size-3.5 shrink-0 opacity-50 transition-transform duration-200',
              open && 'rotate-180'
            )}
            aria-hidden
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0">
        <ul className="mt-1.5 max-h-36 list-disc space-y-2 overflow-y-auto rounded-md border border-border/40 bg-muted/25 py-2 pl-8 pr-2.5 text-left shadow-sm marker:text-[10px] marker:text-muted-foreground/35 dark:bg-muted/15">
          {steps.map((raw, i) => (
            <li key={`${i}-${raw.slice(0, 20)}`} className="text-[11px] leading-relaxed text-muted-foreground">
              {compactStep(raw)}
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
