'use client';

import { useEffect, useState } from 'react';
import { Activity, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

export interface ThinkingPanelProps {
  thinking: string | null;
  isVisible: boolean;
  className?: string;
}

export function ThinkingPanel({ thinking, isVisible, className }: ThinkingPanelProps) {
  const [open, setOpen] = useState(true);
  const [dots, setDots] = useState('');

  // Clean up thinking text (remove "step -" prefix if present)
  const cleanThinkingText = thinking
    ?.replace(/^step\s*[-–]\s*/i, '')
    .replace(/^thinking\s*[-–]\s*/i, '')
    .trim() || thinking;

  // Animated ellipsis for thinking state
  useEffect(() => {
    if (!isVisible || !thinking) return;

    let count = 0;
    const interval = setInterval(() => {
      count = (count + 1) % 4;
      setDots('.'.repeat(count));
    }, 400);

    return () => clearInterval(interval);
  }, [isVisible, thinking]);

  // Auto-collapse after 2 seconds if still visible
  useEffect(() => {
    if (!isVisible) {
      setOpen(false);
      return;
    }

    setOpen(true);
    const timer = setTimeout(() => {
      setOpen(false);
    }, 2000);

    return () => clearTimeout(timer);
  }, [isVisible, thinking]);

  if (!isVisible || !thinking) return null;

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={cn(
        'mb-2 rounded-lg border border-primary/20 bg-primary/5',
        'animate-in fade-in-0 slide-in-from-top-2 duration-300',
        className
      )}
    >
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-primary/10">
        <Activity className="size-4 shrink-0 animate-pulse text-primary" aria-hidden />
        <span className="flex-1 text-left font-medium text-primary">
          Thinking{dots}
        </span>
        <ChevronDown
          className={cn(
            'size-4 shrink-0 text-primary/70 transition-transform duration-200',
            open && 'rotate-180'
          )}
          aria-hidden
        />
      </CollapsibleTrigger>
      <CollapsibleContent
        className="overflow-hidden data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
      >
        <div
          className="border-t border-primary/10 px-3 py-2 text-xs leading-relaxed text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          {cleanThinkingText}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
