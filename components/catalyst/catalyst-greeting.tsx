'use client';

import { Sparkles } from 'lucide-react';

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

export function CatalystGreeting({ userName }: CatalystGreetingProps) {
  const greeting = getGreeting();

  return (
    <div className="flex h-full flex-col items-center justify-center px-4">
      <div className="mx-auto max-w-2xl w-full text-center">
        {/* Animated Icon */}
        <div className="mb-6 inline-flex items-center justify-center">
          <div className="relative">
            <div className="absolute inset-0 animate-pulse rounded-full bg-gradient-to-r from-orange-400 to-pink-500 opacity-20 blur-xl" />
            <Sparkles className="relative size-10 text-orange-500" />
          </div>
        </div>

        {/* Greeting */}
        <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
          {greeting}, {userName || 'there'}
        </h1>

        {/* Subtitle */}
        <p className="mt-3 text-lg text-muted-foreground">
          How can I help you today?
        </p>

        {/* Suggested Actions */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
          <SuggestedAction icon="🧪" label="Experiments" />
          <SuggestedAction icon="📋" label="Protocols" />
          <SuggestedAction icon="📊" label="Data Analysis" />
          <SuggestedAction icon="📝" label="Documentation" />
        </div>
      </div>
    </div>
  );
}

function SuggestedAction({ icon, label }: { icon: string; label: string }) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

