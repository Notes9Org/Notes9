'use client';

import { cn } from '@/lib/utils';

export function AssistantLoadingPlaceholder({
  variant,
  className,
}: {
  variant: 'general' | 'notes9';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-border/50 bg-muted/10 px-4 py-3.5 dark:bg-muted/5',
        className
      )}
    >
      <div className="space-y-2.5">
        <div className="flex gap-2">
          <div className="h-2.5 w-[28%] animate-pulse rounded-full bg-muted-foreground/15" />
          <div className="h-2.5 w-10 animate-pulse rounded-full bg-muted-foreground/15" />
        </div>
        <div className="space-y-2">
          <div className="h-2 w-full animate-pulse rounded-full bg-muted-foreground/12" />
          <div className="h-2 w-[94%] animate-pulse rounded-full bg-muted-foreground/12" />
          <div className="h-2 w-[81%] animate-pulse rounded-full bg-muted-foreground/12" />
        </div>
        {variant === 'notes9' && (
          <div className="flex gap-2 pt-1">
            <div className="h-12 flex-1 animate-pulse rounded-lg bg-muted-foreground/10" />
            <div className="h-12 flex-1 animate-pulse rounded-lg bg-muted-foreground/10" />
          </div>
        )}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {variant === 'notes9'
          ? 'Searching your workspace and drafting an answer…'
          : 'Generating a response…'}
      </p>
    </div>
  );
}
