'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface ClarifyCardProps {
  question: string;
  options: string[];
  onAnswer: (answer: string) => void;
  onSkip: () => void;
  className?: string;
}

export function ClarifyCard({ question, options, onAnswer, onSkip, className }: ClarifyCardProps) {
  const [custom, setCustom] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  function handleOptionClick(opt: string) {
    setSelected(opt);
    setCustom('');
  }

  function handleSubmit() {
    const answer = custom.trim() || selected;
    if (answer) onAnswer(answer);
  }

  const canSubmit = Boolean(custom.trim() || selected);

  return (
    <Card className={cn('max-w-lg border-border/80 bg-muted/30', className)}>
      <CardContent className="space-y-3 pt-4">
        <p className="text-sm font-semibold text-foreground">{question}</p>

        {options.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {options.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => handleOptionClick(opt)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-sm transition-colors',
                  selected === opt
                    ? 'border-primary bg-primary/10 font-semibold text-primary'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted/50'
                )}
              >
                {opt}
              </button>
            ))}
          </div>
        )}

        <Input
          type="text"
          placeholder={options.length > 0 ? 'Or type your own answer…' : 'Type your answer…'}
          value={custom}
          onChange={(e) => {
            setCustom(e.target.value);
            setSelected(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canSubmit) handleSubmit();
          }}
        />

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onSkip}>
            Skip
          </Button>
          <Button type="button" size="sm" onClick={handleSubmit} disabled={!canSubmit}>
            Submit
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
