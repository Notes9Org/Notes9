'use client';

import { Database, Search, Globe, FileText, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ToolType = 'sql' | 'rag' | 'web_search' | 'full_record' | 'clarify' | null;

export interface ToolStatusBarProps {
  currentTool: ToolType;
  toolMessage?: string;
  className?: string;
}

// Tool states share one in-palette accent (burnt-sienna `--primary`) so the AI
// reads as a single designed surface rather than a rainbow of generic per-tool
// hues. The icon already differentiates the tools; color carries brand, not
// taxonomy.
const TOOL_CONFIG: Record<Exclude<ToolType, null>, { icon: typeof Database; label: string; color: string }> = {
  sql: {
    icon: Database,
    label: 'Querying database',
    color: 'text-primary',
  },
  rag: {
    icon: Search,
    label: 'Searching documents',
    color: 'text-primary',
  },
  web_search: {
    icon: Globe,
    label: 'Searching web',
    color: 'text-primary',
  },
  full_record: {
    icon: FileText,
    label: 'Fetching records',
    color: 'text-primary',
  },
  clarify: {
    icon: FileText,
    label: 'Analyzing query',
    color: 'text-primary',
  },
};

export function ToolStatusBar({ currentTool, toolMessage, className }: ToolStatusBarProps) {
  if (!currentTool) return null;

  const config = TOOL_CONFIG[currentTool];
  const Icon = config.icon;
  const displayMessage = toolMessage || config.label;

  return (
    <div
      className={cn(
        'mb-2 flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2',
        'animate-in fade-in-0 slide-in-from-left-2 duration-300',
        className
      )}
      role="status"
      aria-live="polite"
    >
      <Loader2 className={cn('size-4 shrink-0 animate-spin', config.color)} aria-hidden />
      <Icon className={cn('size-4 shrink-0', config.color)} aria-hidden />
      <span className="text-sm font-medium text-foreground">
        {displayMessage}
      </span>
    </div>
  );
}
