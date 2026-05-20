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
      <div className="mx-auto max-w-2xl w-full text-center">
        <div className="mb-6 inline-flex items-center justify-center">
          <IceMascot
            className="w-[72px] shrink-0 rounded-full"
            options={{ src: '/notes9-mascot-ui.png' }}
            aria-label="Catalyst AI"
          />
        </div>

        {/* Editorial display face — pairs the new IBM Plex Serif with the
            burnt-sienna palette so the greeting feels thoughtful, not system-y. */}
        <h1 className="font-display text-3xl font-medium tracking-tight text-foreground md:text-5xl">
          {greeting}, {userName || 'there'}
        </h1>

        <p className="mt-3 text-lg text-muted-foreground">
          How can I help you today?
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
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
      className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-default disabled:hover:bg-background disabled:hover:border-border"
    >
      <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}
