'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Loader2, CheckCircle2, XCircle, Wrench, ChevronRight } from 'lucide-react';

interface ToolInvocationProps {
  toolName: string;
  state: 'input-streaming' | 'input-available' | 'output-available' | 'output-error';
  input?: Record<string, unknown>;
  output?: unknown;
  errorText?: string;
}

export function ToolInvocation({ toolName, state, input, output, errorText }: ToolInvocationProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Format tool name for display (e.g., "time_get_current_time" -> "Get Current Time")
  const displayName = toolName
    .replace(/^[a-z]+_/, '') // Remove prefix like "time_"
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  const isLoading = state === 'input-streaming' || state === 'input-available';
  const isComplete = state === 'output-available';
  const isError = state === 'output-error';

  const hasDetails = Boolean((input && Object.keys(input).length > 0) || (isComplete && output) || (isError && errorText));

  return (
    <div
      className={cn(
        'my-2 rounded-lg border text-sm',
        isLoading && 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30',
        isComplete && 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30',
        isError && 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30'
      )}
    >
      {/* Header - always visible */}
      <button
        onClick={() => hasDetails && setIsOpen(!isOpen)}
        disabled={!hasDetails}
        className={cn(
          'flex w-full items-center gap-2 p-3',
          hasDetails && 'cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors'
        )}
      >
        {/* Dropdown chevron - small icon */}
        {hasDetails && (
          <ChevronRight
            className={cn(
              'h-3 w-3 text-muted-foreground transition-transform duration-200',
              isOpen && 'rotate-90'
            )}
          />
        )}

        {/* Status icon */}
        {isLoading && (
          <Loader2 className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400" />
        )}
        {isComplete && (
          <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
        )}
        {isError && (
          <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
        )}

        <Wrench className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">
          {isLoading ? `Using ${displayName}...` : displayName}
        </span>
      </button>

      {/* Collapsible content */}
      {isOpen && hasDetails && (
        <div className="border-t border-inherit px-3 pb-3 pt-2 space-y-2">
          {/* Show input parameters when available */}
          {input && Object.keys(input).length > 0 && (
            <div className="text-xs text-muted-foreground">
              <span className="font-medium">Input: </span>
              {Object.entries(input).map(([key, value]) => (
                <span key={key} className="ml-1">
                  {key}: <code className="rounded bg-muted px-1">{String(value)}</code>
                </span>
              ))}
            </div>
          )}

          {/* Show output when available */}
          {isComplete && output != null && (
            <div className="text-xs">
              <span className="font-medium text-green-700 dark:text-green-300">Result: </span>
              <span className="text-foreground">
                {typeof output === 'string' ? output : JSON.stringify(output)}
              </span>
            </div>
          )}

          {/* Show error when available */}
          {isError && errorText && (
            <div className="text-xs text-red-600 dark:text-red-400">
              Error: {errorText}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
