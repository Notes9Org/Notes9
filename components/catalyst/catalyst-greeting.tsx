'use client';

import { ClipboardList, FileText, FlaskConical, LineChart } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { IceMascot } from '@/components/ui/ice-mascot';

interface CatalystGreetingProps {
  userName: string;
  /**
   * Prefill the chat input with the suggestion's starter prompt. When omitted
   * the suggestion chips render as decorative-only (preserves the legacy
   * appearance for callers that haven't migrated). Provide this from the
   * Catalyst page so first-time users have a working entry point.
   */
  onSuggest?: (prompt: string) => void;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  const day = new Date().toLocaleDateString('en-US', { weekday: 'long' });

  if (hour >= 5 && hour < 12) {
    return `Good morning`;
  }
  if (hour >= 12 && hour < 17) {
    return `Good afternoon`;
  }
  if (hour >= 17 && hour < 21) {
    return `Good evening`;
  }
  return `Happy ${day}`;
}

const SUGGESTIONS: Array<{ icon: LucideIcon; label: string; prompt: string }> = [
  {
    icon: FlaskConical,
    label: 'Experiments',
    prompt: 'Summarize my most recent experiments and their outcomes.',
  },
  {
    icon: ClipboardList,
    label: 'Protocols',
    prompt: 'Help me draft a new protocol — start by asking what I need it for.',
  },
  {
    icon: LineChart,
    label: 'Data Analysis',
    prompt: 'Walk me through analyzing the data from my most recent experiment.',
  },
  {
    icon: FileText,
    label: 'Documentation',
    prompt: 'Help me write a clean lab note for the experiment I just finished.',
  },
];

export function CatalystGreeting({ userName, onSuggest }: CatalystGreetingProps) {
  const greeting = getGreeting();

  return (
    <div className="flex h-full flex-col items-center justify-center px-4">
      <div className="mx-auto max-w-xl w-full text-center">
        {/* Logo mark */}
        <div className="mb-5 inline-flex items-center justify-center">
          <IceMascot
            className="w-16 shrink-0 rounded-full ring-2 ring-primary/10"
            options={{ src: '/notes9-mascot-ui.png' }}
            aria-label="Catalyst AI"
          />
        </div>

        {/* Greeting — IBM Plex Serif display face for warmth */}
        <h1 className="font-display text-[2rem] font-medium leading-tight tracking-tight text-foreground md:text-[2.5rem]">
          {greeting}, {userName || 'there'}
        </h1>

        {/* Sub-headline — tighter, lower contrast */}
        <p className="mt-2 text-base text-muted-foreground/80">
          What are you working on today?
        </p>

        {/* Suggestion chips — 2×2 grid on sm+, vertical stack on mobile */}
        <div className="mt-7 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {SUGGESTIONS.map(({ icon: Icon, label, prompt }) => (
            <SuggestedAction
              key={label}
              icon={Icon}
              label={label}
              prompt={prompt}
              onSuggest={onSuggest}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function SuggestedAction({
  icon: Icon,
  label,
  prompt,
  onSuggest,
}: {
  icon: LucideIcon;
  label: string;
  prompt: string;
  onSuggest?: (prompt: string) => void;
}) {
  const interactive = !!onSuggest;
  return (
    <button
      type="button"
      onClick={interactive ? () => onSuggest!(prompt) : undefined}
      disabled={!interactive}
      title={interactive ? prompt : undefined}
      aria-label={interactive ? `Use suggestion: ${prompt}` : label}
      className={[
        // Base layout
        'group relative flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left',
        // Colours — cream surface, sienna accent on hover
        'border-border/60 bg-background/60',
        // Interactive states
        interactive
          ? 'cursor-pointer transition-all duration-150 hover:border-primary/30 hover:bg-primary/[0.03] hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40'
          : 'cursor-default',
      ].join(' ')}
    >
      {/* Icon tile */}
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
        <Icon className="size-3.5" aria-hidden="true" />
      </span>

      {/* Text stack */}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">{label}</span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{prompt}</span>
      </span>
    </button>
  );
}
