'use client';

import { cn } from '@/lib/utils';
import type { ThinkingStage } from '@/hooks/use-agent-stream';

const STAGE_LABEL: Record<ThinkingStage, string> = {
  understanding: 'Reading your message',
  searching:     'Searching your notes',
  analyzing:     'Reviewing what I found',
  synthesizing:  'Connecting the dots',
  composing:     'Writing the answer',
  validating:    'Double-checking',
  done:          'Done',
};

interface AgentThinkingBarProps {
  stage: ThinkingStage | null;
  message: string | null;
  detail?: string | null;
  isStreaming?: boolean;
  className?: string;
}

export function AgentThinkingBar({
  stage,
  message,
  detail,
  isStreaming = true,
  className,
}: AgentThinkingBarProps) {
  const stageLabel = stage ? STAGE_LABEL[stage] : null;
  const displayMessage = message ?? stageLabel ?? 'Thinking…';

  return (
    <div className={cn('flex items-start gap-2 px-1 py-1', className)}>
      {/* Pulsing dot */}
      <span
        className={cn(
          'mt-[3px] shrink-0 size-2.5 rounded-full bg-muted-foreground/40',
          isStreaming && 'animate-pulse'
        )}
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-muted-foreground leading-snug truncate">
          {displayMessage}
        </p>
        {detail && (
          <p className="text-xs text-muted-foreground/60 mt-0.5 truncate">{detail}</p>
        )}
      </div>
    </div>
  );
}
