'use client';

import { ShieldCheck, Database, FileText, FolderOpen, Brain, MagnifyingGlass as Search } from "@phosphor-icons/react/ssr";
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export type PermissionDecision = 'allow' | 'always' | 'deny';

export interface PermissionCardTool {
  name: string;
  label: string;
  summary: string;
}

export interface PermissionCardProps {
  tools: PermissionCardTool[];
  onDecision: (decision: PermissionDecision) => void;
  className?: string;
}

// Map a backend tool name to a small icon so the prompt reads as "what kind of
// private data" at a glance. Falls back to a generic search icon.
function iconFor(name: string) {
  switch (name) {
    case 'search_workspace':
    case 'map_relationships':
    case 'fetch_full_records':
      return Database;
    case 'find_passages':
      return FileText;
    case 'read_document':
      return FolderOpen;
    case 'recall_memory':
      return Brain;
    default:
      return Search;
  }
}

/**
 * Inline consent prompt shown when the agent is about to read the user's private
 * lab data (SQL / RAG / files / memory). The run is paused until the user picks
 * Allow (this session), Always allow (persisted), or Deny. Modeled on ClarifyCard.
 */
export function PermissionCard({ tools, onDecision, className }: PermissionCardProps) {
  return (
    <Card className={cn('max-w-lg border-primary/40 bg-primary/5', className)}>
      <CardContent className="space-y-3 pt-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <p className="text-sm font-semibold text-foreground">
            Catalyst wants to read your private data
          </p>
        </div>

        <p className="text-xs text-muted-foreground">
          To answer this, Catalyst needs to look into your own lab data. It will only do so
          with your permission.
        </p>

        {tools.length > 0 && (
          <ul className="space-y-1.5">
            {tools.map((t) => {
              const Icon = iconFor(t.name);
              return (
                <li key={t.name} className="flex items-start gap-2 text-sm text-foreground">
                  <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <span>{t.summary || t.label || t.name}</span>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onDecision('deny')}
          >
            Deny
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onDecision('always')}
          >
            Always allow
          </Button>
          <Button type="button" size="sm" onClick={() => onDecision('allow')}>
            Allow
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
