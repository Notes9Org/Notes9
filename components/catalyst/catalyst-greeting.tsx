'use client';

import { ClipboardList, FileText, FlaskConical, LineChart } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { IceMascot } from '@/components/ui/ice-mascot';

interface CatalystGreetingProps {
  userName: string;
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

const SUGGESTIONS: Array<{ icon: LucideIcon; label: string }> = [
  { icon: FlaskConical, label: 'Experiments' },
  { icon: ClipboardList, label: 'Protocols' },
  { icon: LineChart, label: 'Data Analysis' },
  { icon: FileText, label: 'Documentation' },
];

export function CatalystGreeting({ userName }: CatalystGreetingProps) {
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

        <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
          {greeting}, {userName || 'there'}
        </h1>

        <p className="mt-3 text-lg text-muted-foreground">
          How can I help you today?
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
          {SUGGESTIONS.map(({ icon: Icon, label }) => (
            <SuggestedAction key={label} icon={Icon} label={label} />
          ))}
        </div>
      </div>
    </div>
  );
}

function SuggestedAction({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
    >
      <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}
