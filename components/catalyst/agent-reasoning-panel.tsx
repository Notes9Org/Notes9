'use client';

import { useEffect, useRef, useState } from 'react';
import { Brain, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AgentReasoningPanelProps {
  /** Accumulated reasoning text from `thinking_token` events. */
  reasoning: string;
  /** True while the agent is still streaming (keeps the panel open + live). */
  streaming: boolean;
}

/**
 * Claude-Code-style "Thinking" disclosure. While the agent streams it shows the
 * live reasoning (auto-scrolled, expanded); once the turn settles it collapses
 * to a quiet toggle so the answer stays the focus. Renders nothing when there's
 * no reasoning. The reasoning is the model's pre-tool narration — kept OUT of
 * the answer bubble on purpose.
 */
export function AgentReasoningPanel({ reasoning, streaming }: AgentReasoningPanelProps) {
  const trimmed = reasoning.trim();
  // Open while streaming; auto-collapse once the stream finishes. User can still
  // toggle manually after.
  const [open, setOpen] = useState(true);
  const [userToggled, setUserToggled] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!userToggled) setOpen(streaming);
  }, [streaming, userToggled]);

  // Keep the latest reasoning in view while it streams.
  useEffect(() => {
    if (open && streaming && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [reasoning, open, streaming]);

  if (!trimmed) return null;

  return (
    <div className="surface-recessed">
      <button
        type="button"
        onClick={() => {
          setUserToggled(true);
          setOpen((o) => !o);
        }}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <Brain className={cn('size-3.5 shrink-0', streaming && 'animate-pulse text-primary')} />
        <span>{streaming ? 'Thinking…' : 'Thinking'}</span>
        <ChevronRight
          className={cn('ml-auto size-3.5 shrink-0 transition-transform', open && 'rotate-90')}
        />
      </button>
      {open && (
        <div
          ref={scrollRef}
          className="max-h-48 overflow-y-auto border-t border-border/50 px-3 py-2"
        >
          <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground/90">
            {trimmed}
            {streaming && (
              <span
                className="ml-0.5 inline-block h-3 w-1 translate-y-[1px] animate-cursor-blink rounded-sm bg-muted-foreground/60"
                aria-hidden
              />
            )}
          </p>
        </div>
      )}
    </div>
  );
}
